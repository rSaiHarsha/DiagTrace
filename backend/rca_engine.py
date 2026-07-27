import json
from typing import Dict, Any, List
import pandas as pd
from backend.database import load_from_db
from backend.nvidia_client import query_nvidia_llm, get_nvidia_embedding
from backend.qdrant_service import query_rag_context
def run_ai_rca_analysis() -> Dict[str, Any]:
    """Runs AI Root Cause Analysis over all diagnostic entries in SQLite database."""
    df = load_from_db()
    
    if df is None or df.empty:
        return {
            "status": "error",
            "message": "No diagnostic records available to perform Root Cause Analysis."
        }
        
    total_records = len(df)
    
    # Extract frequency metrics
    modules_count = df["Module"].value_counts().to_dict() if "Module" in df.columns else {}
    codes_count = df["Code"].value_counts().to_dict() if "Code" in df.columns else {}
    status_count = df["Issue Status"].value_counts().to_dict() if "Issue Status" in df.columns else {}
    
    top_modules = list(modules_count.keys())[:5]
    top_codes = list(codes_count.keys())[:5]
    
    # Query RAG Knowledge Context for top DTCs and Modules
    rag_query = f"Diagnostic issues with modules {top_modules} and DTC codes {top_codes}"
    query_vec = get_nvidia_embedding(rag_query)
    rag_docs = query_rag_context(rag_query, query_vec, top_k=4)
    
    rag_context_text = "\n".join([f"- [{doc['category']}] {doc['title']}: {doc['content']}" for doc in rag_docs])
    
    prompt = f"""
Perform a comprehensive AI Root Cause Analysis (RCA) and Weekly Diagnostic Report based on the following diagnostic dataset and ECU RAG Knowledge Base.

### Diagnostic Dataset Summary:
- Total Logged DTC Records: {total_records}
- Top Affected Modules: {json.dumps(modules_count)}
- Top Diagnostic Trouble Codes (DTCs): {json.dumps(codes_count)}
- Issue Status Breakdown: {json.dumps(status_count)}

### ECU Requirements & RAG Knowledge Base Context:
{rag_context_text}

### Instructions:
Format your response in GitHub-flavored Markdown containing:
1. **Executive Summary & Diagnostics Overview**
2. **Root Cause Analysis (RCA) Hypotheses** (grouped by ECU module/DTC)
3. **Weekly Failure Trends & Pattern Analysis**
4. **Recommended Engineering Action Plan** (pin checks, firmware updates, Jira references)
"""
    
    try:
        llm_report = query_nvidia_llm(prompt, temperature=0.2, max_tokens=1800)
    except Exception as e:
        return {
            "status": "error",
            "message": f"LLM Access Error: {str(e)}"
        }
    
    return {
        "status": "success",
        "total_records": total_records,
        "top_modules": top_modules,
        "top_codes": top_codes,
        "rag_sources": [doc["title"] for doc in rag_docs],
        "report_markdown": llm_report
    }

def get_weekly_ai_summary() -> Dict[str, Any]:
    """Generates weekly executive dashboard and trends summary."""
    return run_ai_rca_analysis()
