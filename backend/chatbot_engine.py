import json
import re
import threading
from typing import Dict, Any, Optional, List
from backend.database import load_from_db, get_chat_session_db, save_chat_session_db, delete_chat_session_db
from backend.nvidia_client import query_nvidia_llm_with_history, get_nvidia_embedding
from backend.qdrant_service import query_rag_context

# Max conversation turns to keep (1 turn = 1 user + 1 assistant message = 2 entries)
MAX_HISTORY_MESSAGES = 20  # 10 full turns

SYSTEM_PROMPT = (
    "You are DiagTrace AI, an expert Automotive Diagnostics Systems Architect and Root Cause Analysis (RCA) Engineer. "
    "Provide precise, highly technical, professional insights for vehicle diagnostic codes, ECU specs, signal matrices, and Jira issue tracking. "
    "You have access to the user's diagnostic data and a RAG knowledge base. "
    "When continuing a conversation, use prior context from the chat history to give coherent, relevant follow-up answers. "
    "If the user refers to something mentioned earlier, use the conversation history to resolve the reference."
)

def get_chat_session(session_id: str) -> List[Dict[str, str]]:
    """Returns the conversation history for a session from the DB."""
    session_row = get_chat_session_db(session_id)
    if session_row and session_row.get("history_json"):
        try:
            return json.loads(session_row["history_json"])
        except Exception:
            return []
    return []

def clear_chat_session(session_id: str) -> bool:
    """Clears conversation history for a session by deleting it from DB."""
    return delete_chat_session_db(session_id)

def _append_to_session(session_id: str, role: str, content: str, is_first_message: bool = False, first_user_message: str = "", chart_spec: Optional[Dict[str, Any]] = None):
    """Appends a message to a session and enforces the sliding window limit in DB."""
    history = get_chat_session(session_id)
    msg_entry = {"role": role, "content": content}
    if chart_spec:
        msg_entry["chart_spec"] = chart_spec
    history.append(msg_entry)
    
    # Enforce sliding window: keep only the last MAX_HISTORY_MESSAGES entries
    if len(history) > MAX_HISTORY_MESSAGES:
        history = history[-MAX_HISTORY_MESSAGES:]
        
    title = "New Chat"
    if is_first_message and first_user_message:
        title = first_user_message[:35] + ("..." if len(first_user_message) > 35 else "")
    else:
        # Fetch existing title if not first message
        session_row = get_chat_session_db(session_id)
        if session_row:
            title = session_row.get("title", "Chat Session")
            
    save_chat_session_db(session_id, title, json.dumps(history))


def process_chatbot_query(user_message: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """Processes user chat queries with conversation memory, RAG context, and dynamic chart generation.
    
    Args:
        user_message: The current user message.
        session_id: Optional session identifier for conversation continuity.
    
    Returns:
        Dict with reply_markdown, chart_spec, and sources.
    """
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
    
    # Build the contextual user message (enriched with data + RAG)
    context_parts = []
    if data_summary:
        context_parts.append(f"[Diagnostics Data]\n{data_summary}")
    if rag_context:
        context_parts.append(f"[RAG Knowledge Base]\n{rag_context}")
    
    enriched_user_content = user_message
    if context_parts:
        enriched_user_content = (
            f"{user_message}\n\n"
            f"--- Context (for your reference, do not repeat verbatim) ---\n"
            + "\n\n".join(context_parts)
        )
    
    # Build the messages[] array for the LLM
    messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    # Append conversation history if session is active
    if session_id:
        history = get_chat_session(session_id)
        messages.extend(history)
    
    # Append the current user message (with context)
    messages.append({"role": "user", "content": enriched_user_content})
    
    # Call the LLM with full conversation context
    try:
        reply_markdown = query_nvidia_llm_with_history(messages, temperature=0.3, max_tokens=1000)
    except Exception as e:
        reply_markdown = f"❌ **LLM Access Error**: {str(e)}"
    
    # Persist to session memory (store the clean user message, not the context-enriched one)
    if session_id:
        is_first = len(history) == 0 if 'history' in locals() else True
        _append_to_session(session_id, "user", user_message, is_first_message=is_first, first_user_message=user_message)
        _append_to_session(session_id, "assistant", reply_markdown, chart_spec=chart_spec)
        
    return {
        "reply_markdown": reply_markdown,
        "chart_spec": chart_spec,
        "sources": [h["title"] for h in rag_hits]
    }
