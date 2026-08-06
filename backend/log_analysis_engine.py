import json
from typing import Dict, Any, List

from backend.nvidia_client import get_nvidia_embedding, query_nvidia_llm
from backend.qdrant_service import query_rag_context, get_all_knowledge_items_full

def run_log_analysis(row_data: dict, abort_event=None) -> Dict[str, Any]:
    """
    Performs AI analysis for a specific diagnostic log entry using Vector DB context.
    """
    # Robust resolution for key variants (TitleCase vs lowercase snake_case)
    module = row_data.get("Module") or row_data.get("module") or ""
    code = row_data.get("Code") or row_data.get("code") or ""
    description = row_data.get("Description") or row_data.get("description") or ""
    
    merged_docs = []
    seen_ids = set()

    # Formulate multi-targeted retrieval queries
    queries = []
    if code:
        queries.append(f"Root cause requirements and system behavior for DTC {code}")
    if module and code:
        queries.append(f"{module} {code}")
    if description:
        queries.append(f"Diagnostic requirement or root cause for {description}")
    if not queries:
        queries.append(f"Diagnostic issue with log {json.dumps(row_data)}")

    # 1. Primary Vector Search with 60% confidence threshold
    for q in queries:
        if abort_event and abort_event.is_set():
            raise InterruptedError("Cancelled by user")
        try:
            vec = get_nvidia_embedding(q)
            docs = query_rag_context(q, vec, top_k=3, min_score=0.60)
            for d in docs:
                doc_key = d.get("id") or d.get("title")
                if doc_key not in seen_ids:
                    seen_ids.add(doc_key)
                    merged_docs.append(d)
        except Exception as e:
            print(f"RAG primary query error for '{q}': {e}")

    # 2. Fallback: If 60% threshold produced 0 docs, retry vector search with lower threshold
    if not merged_docs:
        print("⚠️ 60% threshold returned 0 RAG docs. Executing fallback RAG search...")
        for q in queries:
            if abort_event and abort_event.is_set():
                raise InterruptedError("Cancelled by user")
            try:
                vec = get_nvidia_embedding(q)
                docs = query_rag_context(q, vec, top_k=5, min_score=0.0)
                for d in docs:
                    doc_key = d.get("id") or d.get("title")
                    if doc_key not in seen_ids:
                        seen_ids.add(doc_key)
                        merged_docs.append(d)
            except Exception as e:
                print(f"RAG fallback query error for '{q}': {e}")

    # 3. Direct Keyword Search Fallback if vector search returned nothing
    if not merged_docs:
        print("⚠️ Vector search returned 0 docs. Searching Knowledge Base via keyword matching...")
        all_docs = get_all_knowledge_items_full()
        search_terms = [t for t in [code, module, description] if t and len(t) > 2]
        for term in search_terms:
            if abort_event and abort_event.is_set():
                raise InterruptedError("Cancelled by user")
            term_lower = term.lower()
            for doc in all_docs:
                title_content = f"{doc.get('title', '')} {doc.get('content', '')}".lower()
                if term_lower in title_content:
                    doc_key = doc.get("id") or doc.get("title")
                    if doc_key not in seen_ids:
                        seen_ids.add(doc_key)
                        merged_docs.append(doc)

    rag_context_text = "\n".join([f"- [{doc.get('category', 'Knowledge')}] {doc.get('title', '')}: {doc.get('content', '')}" for doc in merged_docs[:6]])
    rag_sources = [doc.get("title", "Unknown Source") for doc in merged_docs[:6]]
    
    system_prompt = (
        "You are DiagTrace AI, an expert Automotive Diagnostics Systems Architect and Root Cause Analysis (RCA) Engineer. "
        "Provide precise, highly technical, professional insights for vehicle diagnostic codes based on the provided context."
    )
    
    prompt = f"""
Perform a comprehensive Log Analysis for the following individual diagnostic log entry. 
Use the provided RAG Knowledge Base context to identify potential root causes, fix instructions, and reference the specific requirements.

### Log Entry Data:
{json.dumps(row_data, indent=2)}

### Knowledge Base Context (Existing Issues & Requirements):
{rag_context_text if rag_context_text.strip() else "No related documents found in Knowledge Base."}

### Instructions:
Format your response in GitHub-flavored Markdown containing the following sections:
1. **Diagnostic Overview**: Brief summary of the log entry.
2. **Root Cause**: Identify the probable root cause(s) based strictly on the log data and the Knowledge Base Context.
3. **How to Fix**: Detailed instructions on how to resolve the issue based on the context.
4. **Related Context & Sources**: Explicitly list the related documents, requirements, or existing issues fetched from the context that were used to generate this report.

Output only the Markdown report. Do not include JSON formatting or other extra text.
"""
    try:
        report_markdown = query_nvidia_llm(
            prompt, 
            system_prompt=system_prompt, 
            abort_event=abort_event,
            temperature=0.1, 
            max_tokens=3000,
            timeout=600
        )
    except Exception as e:
        report_markdown = f"**Error generating log analysis report:**\n\n{str(e)}"
        
    return {
        "status": "success",
        "report_markdown": report_markdown,
        "rag_sources": rag_sources
    }
