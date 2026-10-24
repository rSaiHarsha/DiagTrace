"""
backend/knowledge_graph_engine.py

Aggregates data from the diagnostics SQLite table and RAG knowledge base
to build a structured knowledge graph payload for a single DTC code.
"""

import re
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from backend.database import load_from_db, get_connection, db_lock
from backend.qdrant_service import get_all_knowledge_items_full


def get_dtc_list() -> List[Dict[str, Any]]:
    """Returns all unique DTC codes from the diagnostics table with metadata."""
    try:
        df = load_from_db()
        if df is None or df.empty or "Code" not in df.columns:
            return []

        result = []
        grouped = df.groupby("Code")
        for code, group in grouped:
            if not code or str(code).strip() == "":
                continue
            module = group["Module"].mode().iloc[0] if "Module" in group.columns and not group["Module"].mode().empty else "Unknown"
            desc = group["Description"].mode().iloc[0] if "Description" in group.columns and not group["Description"].mode().empty else ""
            count = len(group)
            result.append({
                "code": str(code).strip(),
                "module": str(module).strip(),
                "description": str(desc).strip(),
                "occurrences": count
            })

        result.sort(key=lambda x: x["occurrences"], reverse=True)
        return result
    except Exception as e:
        print(f"Error in get_dtc_list: {e}")
        return []


def _extract_rag_data_for_dtc(dtc_code: str) -> Dict[str, Any]:
    """Searches the RAG knowledge base for documents related to a DTC code."""
    rag_data = {
        "root_causes": [],
        "system_reaction": "",
        "components": [],
        "severity": "",
        "programs_affected": [],
        "requirements": [],
        "jira_tickets": []
    }

    try:
        all_docs = get_all_knowledge_items_full()
    except Exception:
        return rag_data

    code_clean = dtc_code.strip().upper()

    for doc in all_docs:
        title = (doc.get("title") or "").strip()
        category = (doc.get("category") or "").strip().lower()
        content = (doc.get("content") or "").strip()

        # Check if this document is relevant to the DTC code
        is_relevant = (
            code_clean in title.upper() or
            code_clean in content.upper() or
            code_clean.replace("P", "ECM_P").upper() in content.upper() or
            code_clean.replace("U", "ECM_U").upper() in content.upper() or
            code_clean.replace("C", "ABS_C").upper() in content.upper() or
            code_clean.replace("B", "BCM_B").upper() in content.upper() or
            code_clean.replace("P", "TCM_P").upper() in content.upper()
        )

        if not is_relevant:
            continue

        if "jira" in category or "ticket" in category or "sims" in category:
            ticket = _parse_jira_ticket(title, content)
            if ticket:
                rag_data["jira_tickets"].append(ticket)

        elif "requirement" in category or "system req" in category:
            req = _parse_requirement(title, content)
            if req:
                rag_data["requirements"].append(req)

        else:
            _extract_issue_details(content, rag_data)

    rag_data["root_causes"] = _deduplicate_list(rag_data["root_causes"])
    rag_data["components"] = _deduplicate_list(rag_data["components"])
    rag_data["programs_affected"] = _deduplicate_list(rag_data["programs_affected"])

    return rag_data


def _parse_jira_ticket(title: str, content: str) -> Optional[Dict[str, str]]:
    """Tries to parse a Jira/SIMS ticket from RAG document content."""
    ticket_id = ""
    id_match = re.search(r'(SIMS-\d+|JIRA-\d+|[A-Z]+-\d{4,})', title, re.IGNORECASE)
    if id_match:
        ticket_id = id_match.group(1)
    else:
        id_match = re.search(r'(SIMS-\d+|JIRA-\d+|[A-Z]+-\d{4,})', content, re.IGNORECASE)
        if id_match:
            ticket_id = id_match.group(1)

    if not ticket_id:
        ticket_id = title[:30] if title else "Unknown"

    status = "Open"
    status_match = re.search(r'Status[:\s]*(Open|Closed|In Progress|Resolved|Pending)', content, re.IGNORECASE)
    if status_match:
        status = status_match.group(1).title()

    priority = "Medium"
    priority_match = re.search(r'Priority[:\s]*(High|Medium|Low|Critical)', content, re.IGNORECASE)
    if priority_match:
        priority = priority_match.group(1).title()

    assignee = ""
    assignee_match = re.search(r'Assignee[:\s]*([A-Za-z\.\s]+?)(?:\n|,|;|$)', content)
    if assignee_match:
        assignee = assignee_match.group(1).strip()

    return {
        "ticket_id": ticket_id,
        "title": title,
        "status": status,
        "priority": priority,
        "assignee": assignee
    }


def _parse_requirement(title: str, content: str) -> Optional[Dict[str, str]]:
    """Tries to parse a requirement document."""
    req_id = ""
    id_match = re.search(r'(REQ-\d+|SRS-\d+|[A-Z]{2,4}-\d+)', title, re.IGNORECASE)
    if id_match:
        req_id = id_match.group(1)
    else:
        id_match = re.search(r'(REQ-\d+|SRS-\d+)', content, re.IGNORECASE)
        if id_match:
            req_id = id_match.group(1)

    if not req_id:
        req_id = title[:20] if title else "REQ"

    summary = content[:200].replace("\n", " ").strip()
    if len(content) > 200:
        summary += "..."

    return {
        "req_id": req_id,
        "title": title,
        "summary": summary
    }


def _extract_issue_details(content: str, rag_data: Dict):
    """Extracts root causes, system reaction, components, severity, programs from issue content."""
    lines = content.split("\n")

    for line in lines:
        line_clean = line.strip()

        if "root cause" in line_clean.lower() or "root_cause" in line_clean.lower():
            cause_match = re.search(r'Root.?Cause[:\s]*(.+)', line_clean, re.IGNORECASE)
            if cause_match:
                cause = cause_match.group(1).strip().strip('"').strip("'")
                if cause and len(cause) > 5:
                    rag_data["root_causes"].append(cause)

        if "system reaction" in line_clean.lower() or "system_reaction" in line_clean.lower() or "degradation" in line_clean.lower():
            reaction_match = re.search(r'(?:System.?Reaction|Degradation)[:\s]*(.+)', line_clean, re.IGNORECASE)
            if reaction_match:
                reaction = reaction_match.group(1).strip().strip('"').strip("'")
                if reaction and len(reaction) > 5 and not rag_data["system_reaction"]:
                    rag_data["system_reaction"] = reaction

        if "severity" in line_clean.lower():
            sev_match = re.search(r'Severity[:\s]*(Critical|High|Medium|Low)', line_clean, re.IGNORECASE)
            if sev_match:
                rag_data["severity"] = sev_match.group(1).title()

        if "program" in line_clean.lower() and "affect" in line_clean.lower():
            prog_match = re.search(r'Programs?.?Affected[:\s]*(.+)', line_clean, re.IGNORECASE)
            if prog_match:
                progs = prog_match.group(1).strip().strip('"').strip("'")
                for p in re.split(r'[;,]', progs):
                    p_clean = p.strip()
                    if p_clean and len(p_clean) > 2:
                        rag_data["programs_affected"].append(p_clean)

    # CSV-style content parsing (only if it's a single line to avoid breaking natural language paragraphs)
    if len(lines) <= 2 and "," in content:
        import csv
        import io
        try:
            reader = csv.reader(io.StringIO(content.strip()))
            csv_parts = next(reader)
            if len(csv_parts) >= 5:
                potential_cause = csv_parts[3].strip() if len(csv_parts) > 3 else ""
                potential_reaction = csv_parts[4].strip() if len(csv_parts) > 4 else ""
                potential_severity = csv_parts[5].strip() if len(csv_parts) > 5 else ""
                potential_programs = csv_parts[6].strip() if len(csv_parts) > 6 else ""

                if potential_cause and len(potential_cause) > 5 and "root_cause" not in potential_cause.lower():
                    rag_data["root_causes"].append(potential_cause)
                if potential_reaction and len(potential_reaction) > 5 and not rag_data["system_reaction"]:
                    rag_data["system_reaction"] = potential_reaction
                if potential_severity and potential_severity.title() in ["Critical", "High", "Medium", "Low"]:
                    if not rag_data["severity"]:
                        rag_data["severity"] = potential_severity.title()
                if potential_programs:
                    for p in re.split(r'[;,]', potential_programs):
                        p_clean = p.strip()
                        if p_clean and len(p_clean) > 2:
                            rag_data["programs_affected"].append(p_clean)
        except Exception:
            pass


def _deduplicate_list(items: list) -> list:
    """Deduplicates a list while preserving order."""
    seen = set()
    result = []
    for item in items:
        item_lower = item.lower().strip() if isinstance(item, str) else str(item)
        if item_lower not in seen:
            seen.add(item_lower)
            result.append(item)
    return result


def _get_related_dtcs(dtc_code: str, module: str, df) -> List[Dict[str, Any]]:
    """Finds DTCs related by same module or co-occurring on same VIN."""
    related = []
    seen_codes = {dtc_code.strip().upper()}

    if df is None or df.empty:
        return related

    if "Module" in df.columns and "Code" in df.columns:
        same_module = df[df["Module"].str.strip().str.upper() == module.strip().upper()]
        for code in same_module["Code"].unique():
            code_str = str(code).strip().upper()
            if code_str and code_str not in seen_codes:
                seen_codes.add(code_str)
                desc_rows = same_module[same_module["Code"].str.strip().str.upper() == code_str]
                desc = ""
                if "Description" in desc_rows.columns and not desc_rows.empty:
                    desc = str(desc_rows["Description"].iloc[0]).strip()
                related.append({
                    "code": code_str,
                    "description": desc,
                    "relation": "Same Module"
                })

    if "VIN Number" in df.columns and "Code" in df.columns:
        target_vins = df[df["Code"].str.strip().str.upper() == dtc_code.strip().upper()]["VIN Number"].unique()
        for vin in target_vins:
            vin_str = str(vin).strip()
            if not vin_str:
                continue
            co_dtcs = df[df["VIN Number"].str.strip() == vin_str]
            for code in co_dtcs["Code"].unique():
                code_str = str(code).strip().upper()
                if code_str and code_str not in seen_codes:
                    seen_codes.add(code_str)
                    desc_rows = co_dtcs[co_dtcs["Code"].str.strip().str.upper() == code_str]
                    desc = ""
                    if "Description" in desc_rows.columns and not desc_rows.empty:
                        desc = str(desc_rows["Description"].iloc[0]).strip()
                    related.append({
                        "code": code_str,
                        "description": desc,
                        "relation": f"Co-occurring (VIN: {vin_str[:8]}...)"
                    })

    return related[:10]


def _build_activity_timeline(dtc_code: str, df) -> List[Dict[str, str]]:
    """Builds an activity timeline from diagnostics records."""
    timeline = []
    if df is None or df.empty:
        return timeline

    dtc_rows = df[df["Code"].str.strip().str.upper() == dtc_code.strip().upper()]

    for _, row in dtc_rows.iterrows():
        timestamp = ""
        if "Last Updated" in row and str(row["Last Updated"]).strip():
            timestamp = str(row["Last Updated"]).strip()

        vin = str(row.get("VIN Number", "")).strip()
        program = str(row.get("Program name", "")).strip()
        event_desc = f"DTC {dtc_code} detected"
        if vin:
            event_desc += f" | VIN: {vin}"
        if program:
            event_desc += f" | {program}"

        timeline.append({
            "timestamp": timestamp,
            "event": event_desc,
            "type": "detection"
        })

        ai_analysis = str(row.get("AI Analysis", "")).strip()
        if ai_analysis and len(ai_analysis) > 10:
            timeline.append({
                "timestamp": timestamp,
                "event": "AI RCA generated",
                "type": "analysis"
            })

    timeline.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return timeline[:15]


def build_knowledge_graph(dtc_code: str) -> Dict[str, Any]:
    """
    Main entry point: builds the full knowledge graph payload for a DTC code.
    """
    try:
        df = load_from_db()
    except Exception:
        df = None

    code_clean = dtc_code.strip().upper()

    # 1. Get diagnostics data
    dtc_overview = {
        "code": code_clean,
        "module": "Unknown",
        "description": "",
        "severity": "",
        "status": "",
        "first_seen": "",
        "last_seen": "",
        "occurrences": 0,
        "frequency": "Unknown"
    }

    programs_from_db = []

    if df is not None and not df.empty and "Code" in df.columns:
        dtc_rows = df[df["Code"].str.strip().str.upper() == code_clean]
        if not dtc_rows.empty:
            dtc_overview["occurrences"] = len(dtc_rows)

            if "Module" in dtc_rows.columns:
                mode_val = dtc_rows["Module"].mode()
                dtc_overview["module"] = str(mode_val.iloc[0]).strip() if not mode_val.empty else "Unknown"

            if "Description" in dtc_rows.columns:
                mode_val = dtc_rows["Description"].mode()
                dtc_overview["description"] = str(mode_val.iloc[0]).strip() if not mode_val.empty else ""

            if "Issue Status" in dtc_rows.columns:
                mode_val = dtc_rows["Issue Status"].mode()
                dtc_overview["status"] = str(mode_val.iloc[0]).strip() if not mode_val.empty else "Active"

            if "Last Updated" in dtc_rows.columns:
                timestamps = dtc_rows["Last Updated"].dropna().astype(str)
                timestamps = timestamps[timestamps.str.strip() != ""]
                if not timestamps.empty:
                    sorted_ts = sorted(timestamps.tolist())
                    dtc_overview["first_seen"] = sorted_ts[0]
                    dtc_overview["last_seen"] = sorted_ts[-1]

            occ = dtc_overview["occurrences"]
            if occ >= 10:
                dtc_overview["frequency"] = "Very High"
            elif occ >= 5:
                dtc_overview["frequency"] = "High"
            elif occ >= 3:
                dtc_overview["frequency"] = "Medium"
            else:
                dtc_overview["frequency"] = "Low"

            if "Program name" in dtc_rows.columns:
                programs_from_db = [str(p).strip() for p in dtc_rows["Program name"].unique() if str(p).strip()]

    # 2. Get RAG data
    rag_data = _extract_rag_data_for_dtc(code_clean)

    if rag_data["severity"] and not dtc_overview["severity"]:
        dtc_overview["severity"] = rag_data["severity"]
    if not dtc_overview["severity"]:
        dtc_overview["severity"] = "Medium"

    all_programs = _deduplicate_list(programs_from_db + rag_data["programs_affected"])

    # 3. Related DTCs
    related_dtcs = _get_related_dtcs(code_clean, dtc_overview["module"], df)

    # 4. Activity Timeline
    timeline = _build_activity_timeline(code_clean, df)

    # 5. Build graph nodes and edges
    nodes = []
    edges = []

    # Central DTC node
    nodes.append({
        "id": f"dtc-{code_clean}",
        "label": code_clean,
        "sublabel": dtc_overview["description"],
        "type": "dtc",
        "severity": dtc_overview["severity"],
        "fx": 0, "fy": 0
    })

    # Module node
    module_id = f"module-{dtc_overview['module']}"
    nodes.append({
        "id": module_id,
        "label": dtc_overview["module"],
        "sublabel": _get_module_full_name(dtc_overview["module"]),
        "type": "module"
    })
    edges.append({"source": f"dtc-{code_clean}", "target": module_id, "label": "owned by"})

    # Description node
    if dtc_overview["description"]:
        desc_id = "description-0"
        nodes.append({
            "id": desc_id,
            "label": "Description",
            "sublabel": dtc_overview["description"],
            "type": "description"
        })
        edges.append({"source": f"dtc-{code_clean}", "target": desc_id, "label": "describes"})

    # RAG data nodes (Root Causes, System Reaction, Components, Jira) are excluded 
    # from the visual graph to reduce clutter, but are still returned in the JSON payload
    # so the bottom panels can display them.


    # Programs node
    if all_programs:
        prog_id = "programs-0"
        program_items = []
        for p in all_programs:
            program_items.append({
                "id": f"program-{p}",
                "label": str(p),
                "sublabel": "Program",
                "type": "program"
            })
            
        nodes.append({
            "id": prog_id,
            "label": "Affected Programs",
            "sublabel": f"{len(all_programs)} Programs",
            "type": "group_node",
            "items": program_items
        })
        edges.append({"source": f"dtc-{code_clean}", "target": prog_id, "label": "affects"})

    # Jira/SIMS node excluded from visual graph to reduce clutter

    # Requirements node
    if rag_data["requirements"]:
        req_id = "requirements-0"
        req_labels = [r["req_id"] for r in rag_data["requirements"][:5]]
        nodes.append({
            "id": req_id,
            "label": "Requirements",
            "sublabel": ", ".join(req_labels),
            "type": "requirements",
            "items": rag_data["requirements"]
        })
        edges.append({"source": f"dtc-{code_clean}", "target": req_id, "label": "specified by"})

    # Related DTC nodes
    for i, rel in enumerate(related_dtcs[:5]):
        rel_id = f"related-{rel['code']}"
        nodes.append({
            "id": rel_id,
            "label": rel["code"],
            "sublabel": rel["description"],
            "type": "related_dtc",
            "relation": rel["relation"]
        })
        edges.append({"source": f"dtc-{code_clean}", "target": rel_id, "label": rel["relation"]})

    return {
        "status": "success",
        "dtc_overview": dtc_overview,
        "graph": {
            "nodes": nodes,
            "edges": edges
        },
        "root_causes": rag_data["root_causes"],
        "system_reaction": rag_data["system_reaction"],
        "components": rag_data["components"],
        "programs_affected": all_programs,
        "requirements": rag_data["requirements"],
        "jira_tickets": rag_data["jira_tickets"],
        "related_dtcs": related_dtcs,
        "activity_timeline": timeline
    }


def _get_module_full_name(module_code: str) -> str:
    """Returns the full name for common ECU module abbreviations."""
    module_map = {
        "ECM": "Engine Control Module",
        "TCM": "Transmission Control Module",
        "ABS": "Anti-Lock Brake System",
        "BCM": "Body Control Module",
        "SRS": "Supplemental Restraint System",
        "HVAC": "Climate Control Module",
        "IPC": "Instrument Panel Cluster",
        "PCM": "Powertrain Control Module",
        "TPMS": "Tire Pressure Monitoring System",
    }
    return module_map.get(module_code.strip().upper(), f"{module_code} Module")


def build_dynamic_graph(entity_type: str, entity_id: str) -> Dict[str, Any]:
    """
    Builds a dynamic knowledge graph centered on an entity (module, vin, program, dtc).
    Groups related entities to prevent graph clutter.
    """
    try:
        df = load_from_db()
    except Exception:
        df = None

    if df is None or df.empty:
        return {"status": "error", "message": "No data available"}

    entity_id_clean = entity_id.strip()
    
    if entity_type == "module":
        mask = df["Module"].str.strip().str.upper() == entity_id_clean.upper()
    elif entity_type == "vin":
        if "VIN Number" not in df.columns:
            return {"status": "error", "message": "No VIN data"}
        mask = df["VIN Number"].str.strip().str.upper() == entity_id_clean.upper()
    elif entity_type == "program":
        if "Program name" not in df.columns:
            return {"status": "error", "message": "No Program data"}
        mask = df["Program name"].str.strip().str.upper() == entity_id_clean.upper()
    elif entity_type == "dtc":
        return build_knowledge_graph(entity_id)
    else:
        return {"status": "error", "message": "Invalid entity type"}

    filtered_df = df[mask]
    if filtered_df.empty:
        return {"status": "error", "message": f"No data found for {entity_type} {entity_id}"}

    nodes = []
    edges = []
    
    central_id = f"{entity_type}-{entity_id_clean}"
    nodes.append({
        "id": central_id,
        "label": entity_id_clean,
        "sublabel": _get_module_full_name(entity_id_clean) if entity_type == "module" else entity_type.title(),
        "type": entity_type,
        "fx": 0, "fy": 0
    })

    if entity_type != "dtc" and "Code" in filtered_df.columns:
        dtcs = []
        for code, group in filtered_df.groupby("Code"):
            if str(code).strip():
                desc = group["Description"].mode().iloc[0] if "Description" in group.columns and not group["Description"].mode().empty else ""
                dtcs.append({
                    "id": f"dtc-{code}",
                    "label": str(code),
                    "sublabel": str(desc),
                    "type": "dtc",
                    "severity": "Medium"
                })
        if dtcs:
            group_id = "group-dtcs"
            nodes.append({
                "id": group_id,
                "label": "DTCs",
                "sublabel": f"{len(dtcs)} Codes",
                "type": "group_node",
                "items": dtcs
            })
            edges.append({"source": central_id, "target": group_id, "label": "has dtc"})

    if entity_type != "module" and "Module" in filtered_df.columns:
        modules = []
        for mod in filtered_df["Module"].dropna().unique():
            if str(mod).strip():
                modules.append({
                    "id": f"module-{mod}",
                    "label": str(mod),
                    "sublabel": _get_module_full_name(str(mod)),
                    "type": "module"
                })
        if modules:
            group_id = "group-modules"
            nodes.append({
                "id": group_id,
                "label": "Modules",
                "sublabel": f"{len(modules)} Modules",
                "type": "group_node",
                "items": modules
            })
            edges.append({"source": central_id, "target": group_id, "label": "involves"})

    if entity_type != "vin" and "VIN Number" in filtered_df.columns:
        vins = []
        for vin in filtered_df["VIN Number"].dropna().unique():
            if str(vin).strip():
                vins.append({
                    "id": f"vin-{vin}",
                    "label": str(vin),
                    "sublabel": "Vehicle",
                    "type": "vin"
                })
        if vins:
            group_id = "group-vins"
            nodes.append({
                "id": group_id,
                "label": "VINs",
                "sublabel": f"{len(vins)} Vehicles",
                "type": "group_node",
                "items": vins
            })
            edges.append({"source": central_id, "target": group_id, "label": "found in"})
            
    if entity_type != "program" and "Program name" in filtered_df.columns:
        progs = []
        for prog in filtered_df["Program name"].dropna().unique():
            if str(prog).strip():
                progs.append({
                    "id": f"program-{prog}",
                    "label": str(prog),
                    "sublabel": "Program",
                    "type": "programs"
                })
        if progs:
            group_id = "group-programs"
            nodes.append({
                "id": group_id,
                "label": "Programs",
                "sublabel": f"{len(progs)} Programs",
                "type": "group_node",
                "items": progs
            })
            edges.append({"source": central_id, "target": group_id, "label": "affects"})

    overview = {
        "code": entity_id_clean,
        "module": entity_id_clean if entity_type == "module" else "Multiple",
        "description": f"{entity_type.title()} summary",
        "severity": "N/A",
        "status": "Active",
        "first_seen": "",
        "last_seen": "",
        "occurrences": len(filtered_df),
        "frequency": "High" if len(filtered_df) > 10 else "Low"
    }

    return {
        "status": "success",
        "dtc_overview": overview,
        "graph": {
            "nodes": nodes,
            "edges": edges
        },
        "root_causes": [],
        "system_reaction": "",
        "components": [],
        "programs_affected": [],
        "requirements": [],
        "jira_tickets": [],
        "related_dtcs": [],
        "activity_timeline": []
    }

