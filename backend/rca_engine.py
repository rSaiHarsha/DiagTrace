# import json
# from typing import Dict, Any, List
# import pandas as pd
# from backend.database import load_from_db
# from backend.nvidia_client import query_nvidia_llm, get_nvidia_embedding
# from backend.qdrant_service import query_rag_context
# def run_ai_rca_analysis() -> Dict[str, Any]:
#     """Runs AI Root Cause Analysis over all diagnostic entries in SQLite database."""
#     df = load_from_db()
    
#     if df is None or df.empty:
#         return {
#             "status": "error",
#             "message": "No diagnostic records available to perform Root Cause Analysis."
#         }
        
#     total_records = len(df)
    
#     # Extract frequency metrics
#     modules_count = df["Module"].value_counts().to_dict() if "Module" in df.columns else {}
#     codes_count = df["Code"].value_counts().to_dict() if "Code" in df.columns else {}
#     status_count = df["Issue Status"].value_counts().to_dict() if "Issue Status" in df.columns else {}
    
#     top_modules = list(modules_count.keys())[:5]
#     top_codes = list(codes_count.keys())[:5]
    
#     # Query RAG Knowledge Context for top DTCs and Modules
#     rag_query = f"Diagnostic issues with modules {top_modules} and DTC codes {top_codes}"
#     query_vec = get_nvidia_embedding(rag_query)
#     rag_docs = query_rag_context(rag_query, query_vec, top_k=4)
    
#     rag_context_text = "\n".join([f"- [{doc['category']}] {doc['title']}: {doc['content']}" for doc in rag_docs])
    
#     prompt = f"""
# Perform a comprehensive AI Root Cause Analysis (RCA) and Weekly Diagnostic Report based on the following diagnostic dataset and ECU RAG Knowledge Base.

# ### Diagnostic Dataset Summary:
# - Total Logged DTC Records: {total_records}
# - Top Affected Modules: {json.dumps(modules_count)}
# - Top Diagnostic Trouble Codes (DTCs): {json.dumps(codes_count)}
# - Issue Status Breakdown: {json.dumps(status_count)}

# ### ECU Requirements & RAG Knowledge Base Context:
# {rag_context_text}

# ### Instructions:
# Format your response in GitHub-flavored Markdown containing:
# 1. **Executive Summary & Diagnostics Overview**
# 2. **Root Cause Analysis (RCA) Hypotheses** (grouped by ECU module/DTC)
# 3. **Weekly Failure Trends & Pattern Analysis**
# 4. **Recommended Engineering Action Plan** (pin checks, firmware updates, Jira references)
# """
    
#     try:
#         llm_report = query_nvidia_llm(prompt, temperature=0.2, max_tokens=1800)
#     except Exception as e:
#         return {
#             "status": "error",
#             "message": f"LLM Access Error: {str(e)}"
#         }
    
#     return {
#         "status": "success",
#         "total_records": total_records,
#         "top_modules": top_modules,
#         "top_codes": top_codes,
#         "rag_sources": [doc["title"] for doc in rag_docs],
#         "report_markdown": llm_report
#     }

# def get_weekly_ai_summary() -> Dict[str, Any]:
#     """Generates weekly executive dashboard and trends summary."""
#     return run_ai_rca_analysis()

"""
backend/rca_engine.py

Agentic AI Root Cause Analysis (RCA) engine.

CHANGES IN THIS VERSION (insights + charts):
  1. Feature extraction now also mines columns that exist in the diagnostics
     table but weren't previously used for anything beyond raw display:
     VIN Number, Program name, Odometer_km, Battery_Voltage_V. These power
     four new deterministic insights:
       - repeat_offender_vins:  VINs with 2+ distinct fault records --
         chronic-vehicle candidates, not independent one-off faults.
       - odometer_buckets:      fault counts bucketed by mileage band, so
         wear-out patterns (e.g. catalyst aging) are visible vs. early-life
         defects (e.g. supplier lot issues).
       - voltage_correlation:   average system voltage on records tagged
         with a voltage-sensitive code (P0562, C1201, U0100, U0121) vs.
         the fleet-wide average -- a quick tell for whether a "hardware"
         fault is actually a charging/voltage problem in disguise.
       - program_distribution:  fault density per vehicle program, so a
         program-specific defect doesn't get diluted into a fleet-wide
         percentage.
     Each degrades gracefully (returns None/empty) if its source column
     isn't present, same pattern as the existing severity/timestamp logic.

  2. `_build_chart_data()` turns the above + the existing features into a
     dict of ready-to-render Chart.js configs (type/labels/datasets), keyed
     by chart id. This is returned alongside `report_markdown` instead of
     being embedded in it -- the LLM is bad at ASCII charts and worse at
     accurate axis values, so numbers are rendered by Chart.js from the
     *same* deterministic dict the LLM is told about, not from anything
     the model generates itself.

  3. The agent's system prompt gains an "Insights & Notable Metrics"
     report section and is explicitly told the chart data is rendered
     separately, so it narrates the provided numbers instead of trying to
     describe or invent a chart in markdown.

Everything from the previous version (co-occurrence clustering, weekly
trend, targeted multi-query RAG, the ReAct search loop) is unchanged.

Assumptions to verify against your actual schema:
  - `load_from_db()` returns a DataFrame with columns: Module, Code,
    Issue Status, and ideally Severity and Timestamp. Severity/Timestamp
    are used opportunistically (co-occurrence + trend); code degrades
    gracefully if they're absent, but you'll get a materially better
    report if Timestamp is present and parquet-parseable.
  - VIN/Program/Odometer/Voltage columns are similarly optional -- the new
    insights and their corresponding charts simply don't appear if the
    column isn't present in your `load_from_db()` output.
  - `query_nvidia_llm(prompt, system_prompt=None, temperature=..., max_tokens=...)`
    is used here with the agent protocol passed as `system_prompt` and the
    dataset/context as `prompt`, matching backend/nvidia_client.py's actual
    signature.
  - Column names are resolved dynamically (see `_COLUMN_CANDIDATES`)
    against whatever your `load_from_db()` dataframe actually uses --
    Title Case ("Module") or snake_case ("module").
"""

import json
import re
from datetime import timedelta
from typing import Any, Dict, List, Optional

import pandas as pd

from backend.database import load_from_db
from backend.nvidia_client import get_nvidia_embedding, query_nvidia_llm
from backend.qdrant_service import query_rag_context

MAX_AGENT_ITERATIONS = 4
RAG_TOP_K_PER_QUERY = 3
RAG_MAX_TOTAL_DOCS = 10
COOCCURRENCE_WINDOW_SECONDS = 5

# Voltage-sensitive codes worth cross-checking against Battery_Voltage_V --
# extend this list as new voltage-linked DTCs are added to the KB.
_VOLTAGE_SENSITIVE_CODES = {"P0562", "C1201", "U0100", "U0121"}

# Mileage bands for the odometer-bucket insight. Tuned around the wear-out
# patterns already documented in the DTC root-cause reference (catalyst
# aging ~120k km, etc.) -- adjust if your fleet's duty cycle differs.
_ODOMETER_BUCKETS_KM = [
    (0, 20_000, "0-20k km (early life)"),
    (20_000, 60_000, "20-60k km"),
    (60_000, 100_000, "60-100k km"),
    (100_000, float("inf"), "100k+ km (high mileage)"),
]

# Logical field -> acceptable column name variants actually seen across this
# codebase (parser.py/database.py use lowercase snake_case for storage;
# chatbot_engine.py/rca_engine.py references so far assume Title Case). We
# resolve against whichever is actually present instead of hardcoding one,
# so a naming mismatch degrades gracefully instead of throwing a KeyError.
_COLUMN_CANDIDATES = {
    "module": ["Module", "module"],
    "code": ["Code", "code"],
    "issue_status": ["Issue Status", "issue_status", "Issue_Status", "status"],
    "severity": ["Severity", "severity"],
    "timestamp": ["Timestamp", "Timestamp_UTC", "timestamp", "Last Updated"],
    "vin": ["VIN Number", "VIN", "vin", "VIN_Number"],
    "program": ["Program name", "Program", "program", "Program_Name"],
    "odometer": ["Odometer_km", "odometer_km", "Odometer"],
    "voltage": ["Battery_Voltage_V", "battery_voltage_v", "Voltage"],
    "file": ["File", "file", "Source_File", "filename", "Filename"],
}


def _resolve_column(df: pd.DataFrame, logical_name: str) -> Optional[str]:
    for candidate in _COLUMN_CANDIDATES.get(logical_name, []):
        if candidate in df.columns:
            return candidate
    return None


def _json_safe_value_counts(df: pd.DataFrame, column: Optional[str]) -> Dict[str, int]:
    """
    value_counts().to_dict() returns numpy.int64 values, which json.dumps()
    cannot serialize (TypeError: Object of type int64 is not JSON
    serializable). Cast everything to native str/int so this can safely be
    passed through json.dumps() when building prompts, and through
    FastAPI's response serialization if ever returned directly.
    """
    if column is None or column not in df.columns:
        return {}
    counts = df[column].value_counts()
    return {str(k): int(v) for k, v in counts.items()}


# ---------------------------------------------------------------------------
# 1. Deterministic feature extraction from the diagnostic dataset
# ---------------------------------------------------------------------------

def _build_diagnostic_features(df: pd.DataFrame) -> Dict[str, Any]:
    """Cheap, reliable structure extraction that also shapes what we search for."""
    features: Dict[str, Any] = {"total_records": int(len(df))}

    module_col = _resolve_column(df, "module")
    code_col = _resolve_column(df, "code")
    status_col = _resolve_column(df, "issue_status")
    severity_col = _resolve_column(df, "severity")
    timestamp_col = _resolve_column(df, "timestamp")
    vin_col = _resolve_column(df, "vin")
    program_col = _resolve_column(df, "program")
    odometer_col = _resolve_column(df, "odometer")
    voltage_col = _resolve_column(df, "voltage")

    features["modules_count"] = _json_safe_value_counts(df, module_col)
    features["codes_count"] = _json_safe_value_counts(df, code_col)
    features["status_count"] = _json_safe_value_counts(df, status_col)
    features["severity_count"] = _json_safe_value_counts(df, severity_col)
    features["program_distribution"] = _json_safe_value_counts(df, program_col)

    features["top_modules"] = list(features["modules_count"].keys())[:5]
    features["top_codes"] = list(features["codes_count"].keys())[:5]

    features["cooccurring_events"] = _detect_cooccurring_events(df, module_col, code_col, timestamp_col)
    features["weekly_trend"] = _build_weekly_trend(df, timestamp_col)

    features["repeat_offender_vins"] = _detect_repeat_vins(df, vin_col, code_col)
    features["odometer_buckets"] = _build_odometer_buckets(df, odometer_col, code_col)
    features["voltage_correlation"] = _build_voltage_correlation(df, voltage_col, code_col)

    return features


def _detect_cooccurring_events(
    df: pd.DataFrame,
    module_col: Optional[str],
    code_col: Optional[str],
    timestamp_col: Optional[str],
    window_seconds: int = COOCCURRENCE_WINDOW_SECONDS,
) -> List[Dict[str, Any]]:
    """
    Clusters records whose timestamps fall within `window_seconds` of each
    other but come from *different* modules. Clusters of size >= 2 are
    candidates for a shared root cause (bus/gateway fault, harness,
    shared power) rather than independent failures -- e.g. simultaneous
    U0100/U0121 across ECM/TCM/ABS pointing at one BCM gateway event.
    """
    if timestamp_col is None or module_col is None:
        return []

    working = df.copy()
    working["_ts"] = pd.to_datetime(working[timestamp_col], errors="coerce")
    working = working.dropna(subset=["_ts"]).sort_values("_ts")
    if working.empty:
        return []

    clusters: List[Dict[str, Any]] = []
    current: List[pd.Series] = []

    def flush(bucket: List[pd.Series]):
        if len(bucket) >= 2 and len({r[module_col] for r in bucket}) >= 2:
            clusters.append(_summarize_cluster(bucket, module_col, code_col))

    for _, row in working.iterrows():
        if not current:
            current = [row]
            continue
        if (row["_ts"] - current[-1]["_ts"]) <= timedelta(seconds=window_seconds):
            current.append(row)
        else:
            flush(current)
            current = [row]
    flush(current)

    return clusters[:5]  # cap so a noisy dataset doesn't dominate the prompt


def _summarize_cluster(
    rows: List[pd.Series], module_col: str, code_col: Optional[str]
) -> Dict[str, Any]:
    return {
        "start_time": str(rows[0]["_ts"]),
        "end_time": str(rows[-1]["_ts"]),
        "modules": sorted({str(r[module_col]) for r in rows}),
        "codes": sorted({str(r[code_col]) for r in rows}) if code_col else [],
        "count": int(len(rows)),
    }


def _build_weekly_trend(df: pd.DataFrame, timestamp_col: Optional[str]) -> Dict[str, int]:
    if timestamp_col is None:
        return {}
    working = df.copy()
    working["_ts"] = pd.to_datetime(working[timestamp_col], errors="coerce")
    working = working.dropna(subset=["_ts"])
    if working.empty:
        return {}
    weekly = working.set_index("_ts").resample("W").size()
    return {str(k.date()): int(v) for k, v in weekly.items()}


def _detect_repeat_vins(
    df: pd.DataFrame, vin_col: Optional[str], code_col: Optional[str], min_records: int = 2
) -> List[Dict[str, Any]]:
    """
    VINs with 2+ fault records in the dataset -- these are chronic-vehicle
    candidates (recurring root cause, unresolved repair, or a genuinely
    unlucky build) rather than independent single-fault vehicles, and are
    worth calling out separately from raw code/module frequency.
    """
    if vin_col is None:
        return []

    grouped = df.groupby(vin_col)
    results: List[Dict[str, Any]] = []
    for vin, group in grouped:
        if len(group) < min_records:
            continue
        codes = sorted(group[code_col].astype(str).unique().tolist()) if code_col else []
        results.append(
            {
                "vin": str(vin),
                "fault_count": int(len(group)),
                "distinct_codes": codes,
            }
        )

    results.sort(key=lambda r: r["fault_count"], reverse=True)
    return results[:10]


def _build_odometer_buckets(
    df: pd.DataFrame, odometer_col: Optional[str], code_col: Optional[str]
) -> Dict[str, Any]:
    """
    Buckets fault records by mileage band. Distinguishes early-life defects
    (supplier/manufacturing issues, clustering near 0-20k km) from wear-out
    failures (clustering at 100k+ km) -- the same raw code count can't tell
    these apart, but the mileage distribution can.
    """
    if odometer_col is None:
        return {}

    working = df.copy()
    working["_odo"] = pd.to_numeric(working[odometer_col], errors="coerce")
    working = working.dropna(subset=["_odo"])
    if working.empty:
        return {}

    bucket_counts: Dict[str, int] = {}
    bucket_top_codes: Dict[str, Dict[str, int]] = {}

    for lo, hi, label in _ODOMETER_BUCKETS_KM:
        mask = (working["_odo"] >= lo) & (working["_odo"] < hi)
        subset = working[mask]
        bucket_counts[label] = int(len(subset))
        if code_col and not subset.empty:
            bucket_top_codes[label] = _json_safe_value_counts(subset, code_col)

    return {"counts": bucket_counts, "top_codes_by_bucket": bucket_top_codes}


def _build_voltage_correlation(
    df: pd.DataFrame, voltage_col: Optional[str], code_col: Optional[str]
) -> Dict[str, Any]:
    """
    Compares average system voltage on voltage-sensitive-code records
    against the fleet-wide average. A meaningfully lower average on those
    records is a quick, deterministic signal that a "hardware" fault
    (e.g. C1201) may actually be a charging/voltage problem -- useful to
    hand the LLM directly rather than making it infer this from raw rows.
    """
    if voltage_col is None or code_col is None:
        return {}

    working = df.copy()
    working["_v"] = pd.to_numeric(working[voltage_col], errors="coerce")
    working = working.dropna(subset=["_v"])
    if working.empty:
        return {}

    fleet_avg = round(float(working["_v"].mean()), 2)
    sensitive_mask = working[code_col].astype(str).isin(_VOLTAGE_SENSITIVE_CODES)
    sensitive = working[sensitive_mask]

    result: Dict[str, Any] = {
        "fleet_avg_voltage": fleet_avg,
        "voltage_sensitive_codes_checked": sorted(_VOLTAGE_SENSITIVE_CODES),
        "voltage_sensitive_record_count": int(len(sensitive)),
    }
    if not sensitive.empty:
        result["voltage_sensitive_avg_voltage"] = round(float(sensitive["_v"].mean()), 2)
        result["delta_vs_fleet_avg"] = round(
            result["voltage_sensitive_avg_voltage"] - fleet_avg, 2
        )
    return result


def _split_by_file(df: pd.DataFrame) -> Optional[Dict[str, pd.DataFrame]]:
    """
    Splits the full diagnostics dataframe into one sub-dataframe per source
    log file (the `File` column populated at ingestion time). Returns None
    if no file column is present, so callers can fail informatively instead
    of silently treating the whole fleet as "one file".
    """
    file_col = _resolve_column(df, "file")
    if file_col is None:
        return None
    return {str(name): group for name, group in df.groupby(file_col)}


def list_available_log_files() -> List[str]:
    """
    Public helper for the frontend: returns the distinct source log
    filenames currently in the diagnostics table, for a file-picker /
    dropdown UI. Empty list if no File column is present or DB is empty.
    """
    df = load_from_db()
    if df is None or df.empty:
        return []
    per_file = _split_by_file(df)
    if per_file is None:
        return []
    return sorted(per_file.keys())


# ---------------------------------------------------------------------------
# 2. Chart data -- deterministic, Chart.js-ready. Rendered by the frontend,
#    not by the LLM, so numbers can never drift from the underlying data.
# ---------------------------------------------------------------------------

def _build_chart_data(features: Dict[str, Any]) -> Dict[str, Any]:
    charts: Dict[str, Any] = {}

    def make_chart(chart_type: str, title: str, labels: list, dataset_label: str, data: list, colors: list = None) -> dict:
        ds = {"label": dataset_label, "data": data}
        if colors:
            ds["backgroundColor"] = colors
        return {
            "type": chart_type,
            "data": {
                "labels": labels,
                "datasets": [ds]
            },
            "options": {
                "responsive": True,
                "maintainAspectRatio": False,
                "plugins": {
                    "title": {
                        "display": True,
                        "text": title
                    }
                }
            }
        }

    if features.get("codes_count"):
        top_items = list(features["codes_count"].items())[:10]
        charts["top_codes_bar"] = make_chart(
            "bar",
            "Top DTC Codes by Frequency",
            [k for k, _ in top_items],
            "Records",
            [v for _, v in top_items]
        )

    if features.get("modules_count"):
        charts["module_distribution_pie"] = make_chart(
            "pie",
            "Fault Distribution by Module",
            list(features["modules_count"].keys()),
            "Records",
            list(features["modules_count"].values())
        )

    if features.get("status_count"):
        charts["status_breakdown_doughnut"] = make_chart(
            "doughnut",
            "Issue Status Breakdown",
            list(features["status_count"].keys()),
            "Records",
            list(features["status_count"].values())
        )

    if features.get("weekly_trend"):
        weeks = sorted(features["weekly_trend"].keys())
        charts["weekly_trend_line"] = make_chart(
            "line",
            "Weekly Fault Volume Trend",
            weeks,
            "Records",
            [features["weekly_trend"][w] for w in weeks]
        )

    if features.get("program_distribution"):
        charts["program_distribution_pie"] = make_chart(
            "pie",
            "Fault Distribution by Program",
            list(features["program_distribution"].keys()),
            "Records",
            list(features["program_distribution"].values())
        )

    odo = features.get("odometer_buckets") or {}
    if odo.get("counts"):
        charts["odometer_bucket_bar"] = make_chart(
            "bar",
            "Faults by Mileage Band",
            list(odo["counts"].keys()),
            "Records",
            list(odo["counts"].values())
        )

    repeat_vins = features.get("repeat_offender_vins") or []
    if repeat_vins:
        charts["repeat_vin_bar"] = make_chart(
            "bar",
            "Top Repeat-Offender VINs",
            [r["vin"] for r in repeat_vins],
            "Fault Records",
            [r["fault_count"] for r in repeat_vins]
        )

    volt = features.get("voltage_correlation") or {}
    if volt.get("voltage_sensitive_record_count"):
        charts["voltage_comparison_bar"] = make_chart(
            "bar",
            "Avg. System Voltage: Fleet vs. Voltage-Sensitive Faults",
            ["Fleet Average", "Voltage-Sensitive Faults"],
            "Volts",
            [
                volt["fleet_avg_voltage"],
                volt.get("voltage_sensitive_avg_voltage", volt["fleet_avg_voltage"]),
            ]
        )

    return charts


def _format_insights_for_prompt(features: Dict[str, Any]) -> str:
    """
    Condensed, numeric summary of the new insights, for the LLM prompt.
    Kept separate from the raw features block so the agent can cite these
    numbers directly in the "Insights & Notable Metrics" report section
    without having to parse the full feature dict itself.
    """
    lines: List[str] = []

    repeat_vins = features.get("repeat_offender_vins") or []
    if repeat_vins:
        top = repeat_vins[0]
        lines.append(
            f"- {len(repeat_vins)} VIN(s) have 2+ distinct fault records; "
            f"the highest is {top['vin']} with {top['fault_count']} records "
            f"({', '.join(top['distinct_codes'])})."
        )

    odo = features.get("odometer_buckets") or {}
    if odo.get("counts"):
        busiest = max(odo["counts"].items(), key=lambda kv: kv[1])
        lines.append(f"- Mileage band with the most faults: {busiest[0]} ({busiest[1]} records).")

    volt = features.get("voltage_correlation") or {}
    if volt.get("voltage_sensitive_record_count"):
        lines.append(
            f"- Voltage-sensitive codes ({', '.join(volt['voltage_sensitive_codes_checked'])}) "
            f"average {volt.get('voltage_sensitive_avg_voltage')}V vs. fleet average "
            f"{volt['fleet_avg_voltage']}V (delta: {volt.get('delta_vs_fleet_avg')}V)."
        )

    if features.get("program_distribution"):
        top_program = list(features["program_distribution"].items())[0]
        lines.append(f"- Program with the highest fault count: {top_program[0]} ({top_program[1]} records).")

    return "\n".join(lines) if lines else "(no additional insight metrics available for this dataset)"


# ---------------------------------------------------------------------------
# 3. Targeted (multi-query) RAG retrieval
# ---------------------------------------------------------------------------

def _targeted_rag_retrieval(features: Dict[str, Any]) -> List[Dict[str, Any]]:
    """One focused RAG query per top code/module/cluster, deduped by title."""
    seen_titles: set = set()
    merged_docs: List[Dict[str, Any]] = []

    queries: List[str] = []
    for code in features["top_codes"]:
        queries.append(f"Root cause, known issues, and test procedure for DTC {code}")
    for module in features["top_modules"]:
        queries.append(f"ECU architecture and common fault domains for {module} module")
    for cluster in features["cooccurring_events"]:
        queries.append(
            f"Simultaneous fault codes across modules {cluster['modules']} "
            f"within a short time window -- shared root cause"
        )
    for vin_entry in (features.get("repeat_offender_vins") or [])[:2]:
        if vin_entry["distinct_codes"]:
            queries.append(
                f"Recurring/chronic fault pattern for codes {vin_entry['distinct_codes']} on the same vehicle"
            )

    for query in queries:
        if len(merged_docs) >= RAG_MAX_TOTAL_DOCS:
            break
        try:
            vec = get_nvidia_embedding(query)
            docs = query_rag_context(query, vec, top_k=RAG_TOP_K_PER_QUERY)
        except Exception:
            continue
        for doc in docs:
            if doc["title"] not in seen_titles:
                seen_titles.add(doc["title"])
                merged_docs.append(doc)

    return merged_docs[:RAG_MAX_TOTAL_DOCS]


def _format_rag_context(docs: List[Dict[str, Any]]) -> str:
    if not docs:
        return "(no matching knowledge base entries found)"
    return "\n".join(
        f"- [{doc.get('category', 'Uncategorized')}] {doc['title']}: {doc['content']}"
        for doc in docs
    )


# ---------------------------------------------------------------------------
# 4. Agentic loop -- model can request additional targeted searches before
#    committing to a final report. Mode changes the report shape between
#    per-DTC RCA and trend-focused weekly summary.
# ---------------------------------------------------------------------------

_REPORT_SHAPES = {
    "rca": (
        "Executive Summary & Diagnostics Overview; "
        "Root Cause Analysis Hypotheses (grouped by module/DTC, one hypothesis "
        "per top code with supporting evidence from the knowledge base); "
        "Insights & Notable Metrics (repeat-offender vehicles, mileage-based "
        "failure patterns, voltage correlation, program-level distribution -- "
        "cite the numbers given to you verbatim, do not estimate or invent any); "
        "Weekly Failure Trends & Pattern Analysis; "
        "Recommended Engineering Action Plan (citing specific Jira tickets / "
        "test procedures from the knowledge base where available)."
    ),
    "weekly_summary": (
        "Executive Summary (2-3 sentences, written for a program manager, not an engineer); "
        "Trend Analysis (week-over-week volume change, which modules/codes are rising vs. "
        "resolved, referencing the weekly trend data explicitly); "
        "Notable New or Recurring Patterns (only patterns not already fully explained by a "
        "closed knowledge base issue; include repeat-offender VINs or voltage correlation "
        "findings if provided); "
        "Watch List for Next Week (open items needing engineering attention)."
    ),
}

_AGENT_SYSTEM_PROMPT = """You are an automotive diagnostic RCA agent with access to a \
knowledge base search tool. You will be given a diagnostic dataset summary, a set of \
precomputed insight metrics, and an initial set of retrieved knowledge base excerpts.

Charts for the numeric data are rendered separately by the frontend directly from the \
dataset summary -- do not attempt to draw, describe, or reproduce a chart in the report. \
When you reference a number from the "Insight Metrics" section, use it exactly as given; \
never estimate, round differently, or invent a number that wasn't provided to you.

If the retrieved context is insufficient to explain a top DTC, module, or \
co-occurring event cluster, respond with ONLY this JSON object and nothing else:
{{"action": "search", "query": "<focused search query>"}}

Once you have enough context to write a confident, well-supported report, \
respond with ONLY this JSON object and nothing else:
{{"action": "final", "report_markdown": "<full markdown report>"}}

Rules:
- Issue at most one search per turn.
- Do not repeat a query you've already made.
- You have a maximum of {max_iters} turns total, after which you must return "final" \
even if context is incomplete -- note any remaining gaps explicitly in the report.
- The final report_markdown must contain these sections, in this order: {report_shape}
"""


def _clean_report_text(raw_response: str) -> str:
    if not isinstance(raw_response, str):
        return str(raw_response)
    cleaned = raw_response.strip()
    cleaned = re.sub(r"^```(json)?\s*", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    # 1. Standard strict=False JSON parse
    if cleaned.startswith("{") and "report_markdown" in cleaned:
        try:
            parsed = json.loads(cleaned, strict=False)
            if isinstance(parsed, dict) and "report_markdown" in parsed:
                return parsed["report_markdown"]
        except Exception:
            pass

    # 2. Robust prefix stripping for truncated or malformed JSON
    if "report_markdown" in cleaned:
        prefix_pattern = r'^.*?["\']report_markdown["\']\s*:\s*["\']'
        if re.search(prefix_pattern, cleaned, flags=re.DOTALL):
            cleaned = re.sub(prefix_pattern, '', cleaned, count=1, flags=re.DOTALL)
            cleaned = re.sub(r'["\']\s*\}?\s*$', '', cleaned)
            cleaned = cleaned.replace('\\n', '\n').replace('\\r', '\r').replace('\\t', '\t').replace('\\"', '"').replace('\\\\', '\\')
            return cleaned

    return cleaned


def _parse_agent_json(raw_response: str) -> Optional[Dict[str, Any]]:
    cleaned = raw_response.strip()
    cleaned = re.sub(r"^```(json)?\s*", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    start = cleaned.find("{")
    if start == -1:
        return None

    try:
        obj, _ = json.JSONDecoder(strict=False).raw_decode(cleaned[start:])
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    action_m = re.search(r'"action"\s*:\s*"([^"]+)"', cleaned)
    if action_m:
        act = action_m.group(1)
        if act == "search":
            q_m = re.search(r'"query"\s*:\s*"([^"]+)"', cleaned)
            return {"action": "search", "query": q_m.group(1) if q_m else ""}
        elif act == "final":
            report_text = _clean_report_text(cleaned)
            return {"action": "final", "report_markdown": report_text}

    return None


def _generate_section_by_section_report(
    features: Dict[str, Any],
    docs: List[Dict[str, Any]],
    mode: str = "rca",
    scope_label: str = "fleet-wide",
    abort_event=None
) -> str:
    """
    Generates the final report section-by-section via individual targeted LLM calls,
    preventing any single massive call from exceeding token limits or requiring JSON escape handling.
    """
    insights_summary = _format_insights_for_prompt(features)
    rag_context = _format_rag_context(docs)

    common_context = f"""### Analysis Scope
{scope_label}.

### Diagnostic Dataset Summary
- Total Records: {features['total_records']}
- Top Modules: {json.dumps(features['modules_count'])}
- Top DTC Codes: {json.dumps(features['codes_count'])}
- Issue Status Breakdown: {json.dumps(features['status_count'])}
- Severity Breakdown: {json.dumps(features['severity_count'])}
- Program Distribution: {json.dumps(features.get('program_distribution', {}))}
- Co-occurring Fault Clusters: {json.dumps(features['cooccurring_events'])}
- Weekly Trend: {json.dumps(features['weekly_trend'])}

### Insight Metrics (cite these exact values where applicable)
{insights_summary}

### Knowledge Base Context
{rag_context}
"""

    if mode == "rca":
        sections = [
            (
                "Executive Summary & Diagnostics Overview",
                "Write Section 1: '# Executive Summary & Diagnostics Overview' in Markdown. State total records, top affected modules, top DTC codes, program distribution, and co-occurring fault clusters. Provide a high-level executive overview."
            ),
            (
                "Root Cause Analysis Hypotheses",
                "Write Section 2: '# Root Cause Analysis Hypotheses' in Markdown. Group by ECU module and top DTC codes. For each code, provide a detailed root cause hypothesis and cite supporting evidence or procedures from the Knowledge Base context."
            ),
            (
                "Insights & Notable Metrics",
                "Write Section 3: '# Insights & Notable Metrics' in Markdown. Detail repeat-offender VINs, mileage-based failure bands, voltage correlations, and program distribution. Cite exact figures from the Insight Metrics."
            ),
            (
                "Weekly Failure Trends & Pattern Analysis",
                "Write Section 4: '# Weekly Failure Trends & Pattern Analysis' in Markdown. Include a Markdown table summarizing weekly failure counts. Describe spikes, drops, and week-over-week trends."
            ),
            (
                "Recommended Engineering Action Plan",
                "Write Section 5: '# Recommended Engineering Action Plan' in Markdown. Create a numbered list of engineering action items with test procedures, diagnostic pin checks, and specific Jira tickets referenced from the Knowledge Base."
            )
        ]
    else:
        sections = [
            (
                "Executive Summary",
                "Write Section 1: '# Executive Summary' in Markdown. 2-3 sentences written for a program manager summarizing overall health and trends."
            ),
            (
                "Trend Analysis",
                "Write Section 2: '# Trend Analysis' in Markdown. Analyze week-over-week DTC volume changes, rising vs resolved modules, and weekly trend metrics."
            ),
            (
                "Notable New or Recurring Patterns",
                "Write Section 3: '# Notable New or Recurring Patterns' in Markdown. Focus on unresolved repeat-offender VINs, voltage correlation issues, or new cluster patterns."
            ),
            (
                "Watch List for Next Week",
                "Write Section 4: '# Watch List for Next Week' in Markdown. Provide a bulleted watch list of items requiring immediate engineering attention."
            )
        ]

    report_parts = []

    for sec_title, sec_instruction in sections:
        if abort_event and abort_event.is_set():
            break

        sec_prompt = f"{common_context}\n\n### Task\n{sec_instruction}\n\nRespond ONLY with the Markdown content for this section. Do not wrap in JSON."

        try:
            sec_md = query_nvidia_llm(
                sec_prompt,
                system_prompt="You are an expert automotive diagnostic engineer producing structured technical Markdown reports.",
                temperature=0.2,
                max_tokens=1500,
                abort_event=abort_event
            )
            sec_md = _clean_report_text(sec_md)
            if sec_md:
                report_parts.append(sec_md.strip())
        except Exception as e:
            report_parts.append(f"# {sec_title}\n*(Section generation failed: {e})*")

    return "\n\n---\n\n".join(report_parts)


def _run_agentic_analysis(features: Dict[str, Any], initial_docs: List[Dict[str, Any]], mode: str = "rca", abort_event=None, scope_label: str = "fleet-wide") -> Dict[str, Any]:
    docs = list(initial_docs)
    seen_titles = {doc["title"] for doc in docs}
    search_log: List[str] = [f"initial targeted retrieval ({len(docs)} docs)"]

    system_prompt = _AGENT_SYSTEM_PROMPT.format(
        max_iters=MAX_AGENT_ITERATIONS, report_shape=_REPORT_SHAPES[mode]
    )
    insights_summary = _format_insights_for_prompt(features)

    def build_turn_prompt(turn: int) -> str:
        return f"""### Analysis Scope
{scope_label}. If this is a single file, state that explicitly in the Executive Summary and \
do not describe findings as fleet-wide.

### Diagnostic Dataset Summary
- Total Records: {features['total_records']}
- Top Modules: {json.dumps(features['modules_count'])}
- Top DTC Codes: {json.dumps(features['codes_count'])}
- Issue Status Breakdown: {json.dumps(features['status_count'])}
- Severity Breakdown: {json.dumps(features['severity_count'])}
- Program Distribution: {json.dumps(features.get('program_distribution', {}))}
- Co-occurring Fault Clusters: {json.dumps(features['cooccurring_events'])}
- Weekly Trend: {json.dumps(features['weekly_trend'])}

### Insight Metrics (cite these numbers verbatim -- do not recompute or invent)
{insights_summary}

### Knowledge Base Context Retrieved So Far
{_format_rag_context(docs)}

### Turn {turn + 1} of {MAX_AGENT_ITERATIONS}
Respond with your next action as specified in the system instructions.
"""

    for turn in range(MAX_AGENT_ITERATIONS):
        try:
            raw_response = query_nvidia_llm(
                build_turn_prompt(turn),
                system_prompt=system_prompt,
                temperature=0.1,
                max_tokens=500,
                abort_event=abort_event
            )
        except Exception as e:
            search_log.append(f"search turn {turn + 1} skipped due to error: {e}")
            break

        parsed = _parse_agent_json(raw_response)

        if parsed and parsed.get("action") == "search":
            query = parsed.get("query", "").strip()
            if query:
                search_log.append(f"agent search: {query}")
                try:
                    vec = get_nvidia_embedding(query)
                    new_docs = query_rag_context(query, vec, top_k=RAG_TOP_K_PER_QUERY)
                except Exception:
                    new_docs = []
                for doc in new_docs:
                    if doc["title"] not in seen_titles and len(docs) < RAG_MAX_TOTAL_DOCS:
                        seen_titles.add(doc["title"])
                        docs.append(doc)
                continue

        if parsed and parsed.get("action") == "final":
            break

    # Generate complete report section by section via sequential targeted calls
    report_markdown = _generate_section_by_section_report(
        features=features,
        docs=docs,
        mode=mode,
        scope_label=scope_label,
        abort_event=abort_event
    )

    return {
        "report_markdown": report_markdown,
        "rag_sources": [d["title"] for d in docs],
        "search_log": search_log,
    }

    return {
        "report_markdown": report,
        "rag_sources": [d["title"] for d in docs],
        "search_log": search_log,
    }


# ---------------------------------------------------------------------------
# 5. Public entry points
# ---------------------------------------------------------------------------

def _run(mode: str, abort_event=None, df: Optional[pd.DataFrame] = None, scope_label: str = "fleet-wide") -> Dict[str, Any]:
    """
    Core pipeline: features -> chart data -> targeted RAG -> agentic report.
    `df` defaults to the full diagnostics table (fleet-wide analysis, the
    original behavior). Callers analyzing a single log file pass in an
    already-filtered dataframe plus a human-readable `scope_label` so the
    response and the LLM prompt both make clear what's actually being
    analyzed -- this matters because a single file's top codes/modules can
    look very different from the fleet aggregate, and the report needs to
    say so rather than silently reading as fleet-wide.
    """
    if df is None:
        df = load_from_db()
    if df is None or df.empty:
        return {
            "status": "error",
            "message": f"No diagnostic records available to perform analysis ({scope_label}).",
        }

    features = _build_diagnostic_features(df)
    chart_data = _build_chart_data(features)
    initial_docs = _targeted_rag_retrieval(features)
    result = _run_agentic_analysis(features, initial_docs, mode=mode, abort_event=abort_event, scope_label=scope_label)

    return {
        "status": "success",
        "scope": scope_label,
        "total_records": features["total_records"],
        "top_modules": features["top_modules"],
        "top_codes": features["top_codes"],
        "cooccurring_events": features["cooccurring_events"],
        "weekly_trend": features["weekly_trend"],
        "program_distribution": features.get("program_distribution", {}),
        "repeat_offender_vins": features.get("repeat_offender_vins", []),
        "odometer_buckets": features.get("odometer_buckets", {}),
        "voltage_correlation": features.get("voltage_correlation", {}),
        "chart_data": chart_data,
        "rag_sources": result["rag_sources"],
        "agent_search_log": result["search_log"],
        "report_markdown": result["report_markdown"],
    }


def list_available_log_files() -> List[str]:
    """
    Public helper for the frontend: returns the distinct source log
    filenames currently in the diagnostics table, for a file-picker /
    dropdown UI. Empty list if no File column is present or DB is empty.
    """
    df = load_from_db()
    if df is None or df.empty:
        return []
    per_file = _split_by_file(df)
    if per_file is None:
        return []
    return sorted(per_file.keys())


def run_ai_rca_analysis(abort_event=None) -> Dict[str, Any]:
    """Runs agentic AI Root Cause Analysis over all diagnostic entries (fleet-wide, all files combined)."""
    return _run(mode="rca", abort_event=abort_event)


def get_weekly_ai_summary(abort_event=None) -> Dict[str, Any]:
    """Generates a trend-focused executive weekly summary (distinct report shape from RCA)."""
    return _run(mode="weekly_summary", abort_event=abort_event)


# ---------------------------------------------------------------------------
# 6. Per-file analysis
#
# Two tiers, deliberately kept separate so a large ingest doesn't silently
# trigger dozens of LLM calls:
#
#   - `run_per_file_quick_stats()` is deterministic only (pandas, no LLM/RAG
#     calls) and returns features + chart_data for every log file in one
#     cheap pass. Meant to power a file picker / overview grid where the
#     user sees every file's shape at a glance before deciding which one
#     is worth a full AI report.
#
#   - `run_ai_rca_analysis_for_file(file_name)` runs the *full* agentic
#     pipeline (targeted RAG + ReAct search loop) but scoped to just that
#     one file's records, so its top codes/modules/insights reflect only
#     that file instead of being averaged into the fleet. This is the
#     expensive path and is only ever run for one file at a time, on
#     request -- never automatically fanned out across all files.
# ---------------------------------------------------------------------------

def run_per_file_quick_stats() -> Dict[str, Any]:
    """
    Deterministic (no LLM) features + chart_data for every distinct log
    file currently in the diagnostics table. Fast enough to run on every
    page load; use this to populate a per-file overview before the user
    picks one file for a full AI report.
    """
    df = load_from_db()
    if df is None or df.empty:
        return {"status": "error", "message": "No diagnostic records available."}

    per_file = _split_by_file(df)
    if per_file is None:
        return {
            "status": "error",
            "message": "No 'File' column present in diagnostic data -- cannot break down per file.",
        }

    files_out: Dict[str, Any] = {}
    for file_name, sub_df in per_file.items():
        features = _build_diagnostic_features(sub_df)
        files_out[file_name] = {
            "total_records": features["total_records"],
            "top_modules": features["top_modules"],
            "top_codes": features["top_codes"],
            "modules_count": features["modules_count"],
            "codes_count": features["codes_count"],
            "status_count": features["status_count"],
            "cooccurring_events": features["cooccurring_events"],
            "repeat_offender_vins": features.get("repeat_offender_vins", []),
            "odometer_buckets": features.get("odometer_buckets", {}),
            "voltage_correlation": features.get("voltage_correlation", {}),
            "chart_data": _build_chart_data(features),
        }

    return {"status": "success", "file_count": len(files_out), "files": files_out}


def run_ai_rca_analysis_for_file(file_name: str, mode: str = "rca", abort_event=None) -> Dict[str, Any]:
    """
    Full agentic RCA (or weekly-summary shape), scoped to a single log
    file's records instead of the whole fleet. `file_name` must match a
    value in the resolved File column exactly -- use
    `list_available_log_files()` to populate a picker with valid values.
    """
    df = load_from_db()
    if df is None or df.empty:
        return {"status": "error", "message": "No diagnostic records available."}

    file_col = _resolve_column(df, "file")
    if file_col is None:
        return {
            "status": "error",
            "message": "No 'File' column present in diagnostic data -- cannot scope analysis to a single file.",
        }

    scoped_df = df[df[file_col].astype(str) == str(file_name)]
    if scoped_df.empty:
        return {
            "status": "error",
            "message": f"No records found for file '{file_name}'. "
            f"Available files: {sorted(df[file_col].astype(str).unique().tolist())}",
        }

    return _run(mode=mode, abort_event=abort_event, df=scoped_df, scope_label=f"file: {file_name}")
