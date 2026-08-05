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

Design changes vs. the single-shot version:
  1. Deterministic feature extraction now includes co-occurrence clustering
     (same-time-window, different-module faults) and a weekly trend bucket,
     not just frequency counts.
  2. RAG retrieval is targeted and multi-query (one focused query per top
     code / module / cluster, deduped by title) instead of one blended
     query across everything -- a single embedding for "P0300, P0420,
     P0171, ECM, TCM, ABS" pulls back generically-relevant chunks instead
     of the specific ones for each code.
  3. The LLM runs in a ReAct-style loop: it can request an additional
     targeted search if the retrieved context doesn't explain a pattern,
     up to MAX_AGENT_ITERATIONS turns, before it commits to a final report.
     This makes retrieval demand-driven -- a well-documented failure mode
     gets a short investigation, a novel/ambiguous one gets more searches.

Assumptions to verify against your actual schema:
  - `load_from_db()` returns a DataFrame with columns: Module, Code,
    Issue Status, and ideally Severity and Timestamp. Severity/Timestamp
    are used opportunistically (co-occurrence + trend); code degrades
    gracefully if they're absent, but you'll get a materially better
    report if Timestamp is present and parquet-parseable.
  - `query_nvidia_llm(prompt, temperature=..., max_tokens=...)` takes a
    single prompt string and returns text. If your nvidia_client actually
    supports OpenAI-style structured tool calling via NIM, that's a
    cleaner way to implement the loop below than the JSON-in-text
    protocol used here -- worth checking, since it removes the need for
    `_parse_agent_json`'s regex extraction entirely.
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


# ---------------------------------------------------------------------------
# 1. Deterministic feature extraction from the diagnostic dataset
# ---------------------------------------------------------------------------

def _build_diagnostic_features(df: pd.DataFrame) -> Dict[str, Any]:
    """Cheap, reliable structure extraction that also shapes what we search for."""
    features: Dict[str, Any] = {"total_records": len(df)}

    features["modules_count"] = (
        df["Module"].value_counts().to_dict() if "Module" in df.columns else {}
    )
    features["codes_count"] = (
        df["Code"].value_counts().to_dict() if "Code" in df.columns else {}
    )
    features["status_count"] = (
        df["Issue Status"].value_counts().to_dict()
        if "Issue Status" in df.columns
        else {}
    )
    features["severity_count"] = (
        df["Severity"].value_counts().to_dict() if "Severity" in df.columns else {}
    )

    features["top_modules"] = list(features["modules_count"].keys())[:5]
    features["top_codes"] = list(features["codes_count"].keys())[:5]

    features["cooccurring_events"] = _detect_cooccurring_events(df)
    features["weekly_trend"] = _build_weekly_trend(df)

    return features


def _detect_cooccurring_events(
    df: pd.DataFrame, window_seconds: int = COOCCURRENCE_WINDOW_SECONDS
) -> List[Dict[str, Any]]:
    """
    Clusters records whose timestamps fall within `window_seconds` of each
    other but come from *different* modules. Clusters of size >= 2 are
    candidates for a shared root cause (bus/gateway fault, harness,
    shared power) rather than independent failures -- e.g. simultaneous
    U0100/U0121 across ECM/TCM/ABS pointing at one BCM gateway event.
    """
    if "Timestamp" not in df.columns or "Module" not in df.columns:
        return []

    working = df.copy()
    working["Timestamp"] = pd.to_datetime(working["Timestamp"], errors="coerce")
    working = working.dropna(subset=["Timestamp"]).sort_values("Timestamp")

    clusters: List[Dict[str, Any]] = []
    current: List[pd.Series] = []

    def flush(bucket: List[pd.Series]):
        if len(bucket) >= 2 and len({r["Module"] for r in bucket}) >= 2:
            clusters.append(_summarize_cluster(bucket))

    for _, row in working.iterrows():
        if not current:
            current = [row]
            continue
        if (row["Timestamp"] - current[-1]["Timestamp"]) <= timedelta(seconds=window_seconds):
            current.append(row)
        else:
            flush(current)
            current = [row]
    flush(current)

    return clusters[:5]  # cap so a noisy dataset doesn't dominate the prompt


def _summarize_cluster(rows: List[pd.Series]) -> Dict[str, Any]:
    return {
        "start_time": str(rows[0]["Timestamp"]),
        "end_time": str(rows[-1]["Timestamp"]),
        "modules": sorted({r["Module"] for r in rows}),
        "codes": sorted({r.get("Code", "?") for r in rows}),
        "count": len(rows),
    }


def _build_weekly_trend(df: pd.DataFrame) -> Dict[str, int]:
    if "Timestamp" not in df.columns:
        return {}
    working = df.copy()
    working["Timestamp"] = pd.to_datetime(working["Timestamp"], errors="coerce")
    working = working.dropna(subset=["Timestamp"])
    if working.empty:
        return {}
    weekly = working.set_index("Timestamp").resample("W").size()
    return {str(k.date()): int(v) for k, v in weekly.items()}


# ---------------------------------------------------------------------------
# 2. Targeted (multi-query) RAG retrieval
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
# 3. Agentic loop -- model can request additional targeted searches before
#    committing to a final report. Mode changes the report shape between
#    per-DTC RCA and trend-focused weekly summary.
# ---------------------------------------------------------------------------

_REPORT_SHAPES = {
    "rca": (
        "Executive Summary & Diagnostics Overview; "
        "Root Cause Analysis Hypotheses (grouped by module/DTC, one hypothesis "
        "per top code with supporting evidence from the knowledge base); "
        "Weekly Failure Trends & Pattern Analysis; "
        "Recommended Engineering Action Plan (citing specific Jira tickets / "
        "test procedures from the knowledge base where available)."
    ),
    "weekly_summary": (
        "Executive Summary (2-3 sentences, written for a program manager, not an engineer); "
        "Trend Analysis (week-over-week volume change, which modules/codes are rising vs. "
        "resolved, referencing the weekly trend data explicitly); "
        "Notable New or Recurring Patterns (only patterns not already fully explained by a "
        "closed knowledge base issue); "
        "Watch List for Next Week (open items needing engineering attention)."
    ),
}

_AGENT_SYSTEM_PROMPT = """You are an automotive diagnostic RCA agent with access to a \
knowledge base search tool. You will be given a diagnostic dataset summary and an \
initial set of retrieved knowledge base excerpts.

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


def _parse_agent_json(raw_response: str) -> Optional[Dict[str, Any]]:
    """LLMs love wrapping JSON in prose/code fences. Extract the first {...} block."""
    cleaned = raw_response.strip()
    cleaned = re.sub(r"^```(json)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _run_agentic_analysis(
    features: Dict[str, Any], initial_docs: List[Dict[str, Any]], mode: str
) -> Dict[str, Any]:
    docs = list(initial_docs)
    seen_titles = {doc["title"] for doc in docs}
    search_log: List[str] = [f"initial targeted retrieval ({len(docs)} docs)"]

    system_prompt = _AGENT_SYSTEM_PROMPT.format(
        max_iters=MAX_AGENT_ITERATIONS, report_shape=_REPORT_SHAPES[mode]
    )

    def build_turn_prompt(turn: int) -> str:
        return f"""{system_prompt}

### Diagnostic Dataset Summary
- Total Records: {features['total_records']}
- Top Modules: {json.dumps(features['modules_count'])}
- Top DTC Codes: {json.dumps(features['codes_count'])}
- Issue Status Breakdown: {json.dumps(features['status_count'])}
- Severity Breakdown: {json.dumps(features['severity_count'])}
- Co-occurring Fault Clusters: {json.dumps(features['cooccurring_events'])}
- Weekly Trend: {json.dumps(features['weekly_trend'])}

### Knowledge Base Context Retrieved So Far
{_format_rag_context(docs)}

### Turn {turn + 1} of {MAX_AGENT_ITERATIONS}
Respond with your next action as specified in the system instructions.
"""

    for turn in range(MAX_AGENT_ITERATIONS):
        try:
            raw_response = query_nvidia_llm(
                build_turn_prompt(turn), temperature=0.1, max_tokens=1800
            )
        except Exception as e:
            return {
                "report_markdown": f"LLM access error during agentic analysis: {e}",
                "rag_sources": [d["title"] for d in docs],
                "search_log": search_log,
            }

        parsed = _parse_agent_json(raw_response)

        if not parsed or "action" not in parsed:
            # Model didn't follow the protocol -- treat raw text as final rather
            # than failing the whole request.
            return {
                "report_markdown": raw_response,
                "rag_sources": [d["title"] for d in docs],
                "search_log": search_log,
            }

        if parsed["action"] == "final":
            return {
                "report_markdown": parsed.get("report_markdown", raw_response),
                "rag_sources": [d["title"] for d in docs],
                "search_log": search_log,
            }

        if parsed["action"] == "search":
            query = parsed.get("query", "").strip()
            if not query:
                continue
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

    # Exhausted iterations without a "final" -- force one last synthesis call.
    final_prompt = f"""{system_prompt}

You are out of search turns. Using everything retrieved so far, respond with ONLY \
the {{"action": "final", "report_markdown": "..."}} JSON object.

### Knowledge Base Context
{_format_rag_context(docs)}

### Diagnostic Dataset Summary
- Total Records: {features['total_records']}
- Top Modules: {json.dumps(features['modules_count'])}
- Top DTC Codes: {json.dumps(features['codes_count'])}
- Co-occurring Fault Clusters: {json.dumps(features['cooccurring_events'])}
- Weekly Trend: {json.dumps(features['weekly_trend'])}
"""
    try:
        raw_response = query_nvidia_llm(final_prompt, temperature=0.1, max_tokens=1800)
        parsed = _parse_agent_json(raw_response)
        report = parsed.get("report_markdown", raw_response) if parsed else raw_response
    except Exception as e:
        report = f"LLM access error finalizing analysis: {e}"

    return {
        "report_markdown": report,
        "rag_sources": [d["title"] for d in docs],
        "search_log": search_log,
    }


# ---------------------------------------------------------------------------
# 4. Public entry points
# ---------------------------------------------------------------------------

def _run(mode: str) -> Dict[str, Any]:
    df = load_from_db()
    if df is None or df.empty:
        return {
            "status": "error",
            "message": "No diagnostic records available to perform analysis.",
        }

    features = _build_diagnostic_features(df)
    initial_docs = _targeted_rag_retrieval(features)
    result = _run_agentic_analysis(features, initial_docs, mode=mode)

    return {
        "status": "success",
        "total_records": features["total_records"],
        "top_modules": features["top_modules"],
        "top_codes": features["top_codes"],
        "cooccurring_events": features["cooccurring_events"],
        "weekly_trend": features["weekly_trend"],
        "rag_sources": result["rag_sources"],
        "agent_search_log": result["search_log"],
        "report_markdown": result["report_markdown"],
    }


def run_ai_rca_analysis() -> Dict[str, Any]:
    """Runs agentic AI Root Cause Analysis over all diagnostic entries."""
    return _run(mode="rca")


def get_weekly_ai_summary() -> Dict[str, Any]:
    """Generates a trend-focused executive weekly summary (distinct report shape from RCA)."""
    return _run(mode="weekly_summary")