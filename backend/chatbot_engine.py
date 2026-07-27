import json
import re
from typing import Dict, Any, Optional, List
from backend.database import load_from_db
from backend.nvidia_client import query_nvidia_llm, get_nvidia_embedding
from backend.qdrant_service import query_rag_context
def process_chatbot_query(user_message: str) -> Dict[str, Any]:
    """Processes user chat queries, incorporates RAG context, and handles dynamic chart generation."""
    msg_lower = user_message.lower()
    
    # Check table data for real metrics
    df = load_from_db()
    data_summary = ""
    chart_spec = None
    
    if df is not None and not df.empty:
        modules_count = df["Module"].value_counts().to_dict() if "Module" in df.columns else {}
        codes_count = df["Code"].value_counts().to_dict() if "Code" in df.columns else {}
        status_count = df["Issue Status"].value_counts().to_dict() if "Issue Status" in df.columns else {}
        data_summary = (
            f"Active Diagnostics Table State: Total Rows={len(df)}, "
            f"Modules={json.dumps(modules_count)}, DTC Codes={json.dumps(codes_count)}, "
            f"Issue Statuses={json.dumps(status_count)}"
        )
        
        # Detect chart request intent
        if any(kw in msg_lower for kw in ["chart", "plot", "graph", "visualize", "bar", "pie", "doughnut"]):
            if "module" in msg_lower:
                top_mods = dict(list(modules_count.items())[:8])
                chart_spec = {
                    "type": "bar",
                    "title": "Top Modules by Diagnostic Trouble Code Count",
                    "labels": list(top_mods.keys()),
                    "datasets": [{
                        "label": "DTC Count",
                        "data": list(top_mods.values()),
                        "backgroundColor": "rgba(59, 130, 246, 0.75)"
                    }]
                }
            elif "status" in msg_lower or "issue" in msg_lower:
                chart_spec = {
                    "type": "doughnut",
                    "title": "Diagnostic Issue Status Distribution",
                    "labels": list(status_count.keys()),
                    "datasets": [{
                        "label": "Issues",
                        "data": list(status_count.values()),
                        "backgroundColor": [
                            "rgba(59, 130, 246, 0.8)",
                            "rgba(16, 185, 129, 0.8)",
                            "rgba(245, 158, 11, 0.8)",
                            "rgba(244, 63, 94, 0.8)",
                            "rgba(139, 92, 246, 0.8)"
                        ]
                    }]
                }
            else:
                top_codes = dict(list(codes_count.items())[:8])
                chart_spec = {
                    "type": "bar",
                    "title": "Top Diagnostic Trouble Codes Frequency",
                    "labels": list(top_codes.keys()),
                    "datasets": [{
                        "label": "Occurrences",
                        "data": list(top_codes.values()),
                        "backgroundColor": "rgba(16, 185, 129, 0.75)"
                    }]
                }
                
    # Search RAG Knowledge Base
    query_vec = get_nvidia_embedding(user_message)
    rag_hits = query_rag_context(user_message, query_vec, top_k=3)
    rag_context = "\n".join([f"- [{h['category']}] {h['title']}: {h['content']}" for h in rag_hits])
    
    prompt = f"""
User Query: "{user_message}"

{data_summary}

Relevant RAG Knowledge Base Context:
{rag_context}

Provide a helpful, precise diagnostic engineering response. If the user asked for a report or chart, summarize the key findings concisely.
"""

    try:
        reply_markdown = query_nvidia_llm(prompt, temperature=0.3, max_tokens=1000)
    except Exception as e:
        reply_markdown = f"❌ **LLM Access Error**: {str(e)}"
    
    return {
        "reply_markdown": reply_markdown,
        "chart_spec": chart_spec,
        "sources": [h["title"] for h in rag_hits]
    }
