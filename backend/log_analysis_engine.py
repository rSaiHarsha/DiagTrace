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
        "You produce precise, highly technical, professional diagnostic reports for vehicle diagnostic trouble codes. "
        "You ALWAYS follow the EXACT output format given to you. You never deviate from the required section structure."
    )

    # Build a clean, readable log entry summary for the prompt
    log_entry_summary_parts = []
    for key in ["Module", "Code", "Description", "File", "Raw", "Hex", "Issue Status", "Comments", "Author", "Program name", "VIN Number"]:
        val = row_data.get(key) or row_data.get(key.lower())
        if val:
            log_entry_summary_parts.append(f"- **{key}**: {val}")
    log_entry_summary = "\n".join(log_entry_summary_parts) if log_entry_summary_parts else json.dumps(row_data, indent=2)

    prompt = f"""You are given a single diagnostic log entry and relevant Knowledge Base context. Produce a professional diagnostic analysis report.

**CRITICAL FORMATTING RULES — YOU MUST FOLLOW THESE EXACTLY:**
- Use EXACTLY the four section headings shown below, each as `### Heading`.
- Write in clear, professional prose paragraphs — NOT bullet-only responses.
- Under "### How to Fix", use a **numbered list** with bold step titles.
- Under "### Related Context & Sources", use a **bulleted list** with bold source names.
- Do NOT add any extra sections, preambles, disclaimers, or JSON.
- Do NOT wrap the output in a code block.
- Output ONLY the Markdown report starting with `### Diagnostic Overview`.

---

**Log Entry:**
{log_entry_summary}

**Knowledge Base Context (Retrieved Documents & Requirements):**
{rag_context_text if rag_context_text.strip() else "No related documents found in Knowledge Base."}

---

**REQUIRED OUTPUT FORMAT (follow this structure exactly):**

### Diagnostic Overview
Write a concise 2-4 sentence summary of what this diagnostic log entry indicates. State the diagnostic code, the module/ECU involved, the issue status, and any relevant comments from the log. Explain what this code means in automotive diagnostic terms.

### Root Cause
Based on the Knowledge Base Context provided above, identify the most probable root cause(s) for this diagnostic code. List each potential root cause as a bullet point with technical detail. If the comments mention recurring behavior or specific conditions, factor those into your analysis. If no Knowledge Base context is available, provide root causes based on standard automotive diagnostic knowledge for this code.

### How to Fix
Provide a clear, numbered, step-by-step procedure to resolve this issue:
1. **Step Title**: Detailed instruction for this step.
2. **Step Title**: Detailed instruction for this step.
3. **Step Title**: Detailed instruction for this step.
(Continue as needed. Each step must have a bold title followed by a colon and the instruction.)

### Related Context & Sources
List the specific documents, requirements, existing issues, or knowledge base entries that were referenced in generating this report:
- **Source Name**: Brief description of what this source covers and how it relates to the diagnosis.
- **Source Name**: Brief description.
(If no Knowledge Base context was available, state that the analysis was based on standard automotive diagnostic knowledge.)"""

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
