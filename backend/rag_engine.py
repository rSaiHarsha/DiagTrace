import os
import uuid
import json
import re
from typing import List, Dict, Any, Optional
from backend.nvidia_client import get_nvidia_embedding, query_nvidia_llm
from backend.qdrant_service import store_knowledge_item, get_all_knowledge_documents
from backend.document_parser import parse_document_file

RAG_JOBS: Dict[str, Dict[str, Any]] = {}

def get_rag_job_status(job_id: str) -> Dict[str, Any]:
    """Returns the live progress status and logs of a background RAG chunking job."""
    return RAG_JOBS.get(job_id, {"status": "not_found", "progress_percent": 0.0, "logs": []})

def ingest_knowledge_document(title: str, category: str, content: str) -> Dict[str, Any]:
    """Ingests a text document into the RAG Knowledge Base."""
    doc_id = f"doc_{uuid.uuid4().hex[:10]}"
    vector = get_nvidia_embedding(content)
    result = store_knowledge_item(
        doc_id=doc_id,
        title=title,
        category=category,
        content=content,
        vector=vector
    )
    return result

def llm_semantic_chunking(document_text: str, file_name: str, job_id: Optional[str] = None) -> List[Dict[str, str]]:
    """Uses LLM to perform semantic boundary chunking on document text with live progress updates."""
    if not document_text or not document_text.strip():
        return []

    max_chunk_text_length = 3500
    if len(document_text) <= max_chunk_text_length:
        text_slices = [document_text]
    else:
        paragraphs = document_text.split("\n\n")
        text_slices = []
        current_slice = []
        current_len = 0
        for p in paragraphs:
            if current_len + len(p) > max_chunk_text_length and current_slice:
                text_slices.append("\n\n".join(current_slice))
                current_slice = [p]
                current_len = len(p)
            else:
                current_slice.append(p)
                current_len += len(p)
        if current_slice:
            text_slices.append("\n\n".join(current_slice))

    all_chunks = []

    for idx, slice_text in enumerate(text_slices):
        if job_id and job_id in RAG_JOBS:
            RAG_JOBS[job_id]["current_page"] = idx + 1
            RAG_JOBS[job_id]["logs"].append(f"🤖 LLM Chunking section/page {idx+1}/{len(text_slices)}...")
            
        system_prompt = (
            "You are an expert Document Parsing & RAG Chunking System. "
            "Your task is to analyze the input technical document text and partition it into logical, self-contained, semantically meaningful chunks. "
            "For each chunk, extract a concise title and the full chunk text content. "
            "Return valid JSON array of objects with keys: 'title' (string) and 'content' (string). Output JSON only."
        )
        prompt = (
            f"File Name: {file_name} (Part {idx+1}/{len(text_slices)})\n"
            f"Document Text:\n\"\"\"\n{slice_text}\n\"\"\"\n\n"
            "Partition this text into semantically cohesive RAG knowledge chunks. Output JSON array format:\n"
            "[{\"title\": \"Section Heading\", \"content\": \"Cohesive chunk content...\"}]"
        )
        
        try:
            llm_res = query_nvidia_llm(prompt, system_prompt=system_prompt, temperature=0.1, max_tokens=1500)
            json_match = re.search(r'\[.*\]', llm_res, re.DOTALL)
            if json_match:
                chunks_data = json.loads(json_match.group(0))
                for item in chunks_data:
                    if isinstance(item, dict) and item.get("content"):
                        all_chunks.append({
                            "title": item.get("title") or f"{file_name} - Chunk {len(all_chunks)+1}",
                            "content": item.get("content")
                        })
                        if job_id and job_id in RAG_JOBS:
                            RAG_JOBS[job_id]["logs"].append(f"  ✓ Created chunk: '{item.get('title', 'Section')[:40]}'")
        except Exception as e:
            print(f"LLM Chunking notice for slice {idx+1}: {e}")

    if not all_chunks:
        all_chunks = fallback_semantic_chunking(document_text, file_name)

    return all_chunks

def fallback_semantic_chunking(document_text: str, file_name: str) -> List[Dict[str, str]]:
    """Heuristic fallback chunking by section headings and paragraphs."""
    sections = re.split(r'\n(?=[#=A-Z0-9\-\.\s]{3,40}\n)', document_text)
    chunks = []
    chunk_index = 1
    
    for sec in sections:
        sec_text = sec.strip()
        if not sec_text:
            continue
        lines = sec_text.splitlines()
        first_line = lines[0].strip() if lines else f"Chunk {chunk_index}"
        title = first_line[:60] if len(first_line) > 5 else f"{file_name} - Part {chunk_index}"
        chunks.append({
            "title": f"{file_name}: {title}",
            "content": sec_text
        })
        chunk_index += 1
        
    return chunks

def process_file_ingestion_background(job_id: str, file_name: str, file_bytes: bytes, category: str):
    """Processes document parsing, LLM semantic chunking, and embedding in the background while reporting live progress."""
    RAG_JOBS[job_id] = {
        "status": "processing",
        "file_name": file_name,
        "progress_percent": 10.0,
        "current_page": 0,
        "total_pages": 1,
        "logs": [f"[INFO] Received document '{file_name}' ({len(file_bytes)} bytes)"],
        "total_chunks": 0,
        "error": None
    }
    
    try:
        # Step 1: Document Text Parsing
        RAG_JOBS[job_id]["logs"].append(f"[PARSER] Extracting text content from {file_name}...")
        raw_text = parse_document_file(file_name, file_bytes, category=category)
        
        if not raw_text or not raw_text.strip():
            raise ValueError(f"Unable to extract text from file '{file_name}'.")

        pages = raw_text.split("--- Page ")
        total_pages = max(1, len(pages) - 1) if len(pages) > 1 else max(1, len(raw_text) // 2500)
            
        RAG_JOBS[job_id]["total_pages"] = total_pages
        RAG_JOBS[job_id]["progress_percent"] = 25.0
        RAG_JOBS[job_id]["logs"].append(f"[PARSER] Text extracted successfully: {len(raw_text)} characters (~{total_pages} pages/sections)")

        # Step 2: Chunking Strategy
        ext = os.path.splitext(file_name)[1].lower()
        is_image = ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff']
        is_architecture = bool(category and "architecture" in category.lower())

        if is_image or is_architecture:
            RAG_JOBS[job_id]["logs"].append("[CHUNK] Creating single unified chunk for ECU Architecture diagram...")
            chunks = [{
                "title": "SysML Architecture Spec & Diagram Model",
                "content": raw_text
            }]
            RAG_JOBS[job_id]["logs"].append("[CHUNK] Preserved single unified SysML chunk for complete diagram context")
        else:
            RAG_JOBS[job_id]["logs"].append("[LLM_CHUNK] Performing LLM Semantic Boundary Chunking...")
            chunks = llm_semantic_chunking(raw_text, file_name, job_id=job_id)
            RAG_JOBS[job_id]["logs"].append(f"[LLM_CHUNK] Semantic Chunking complete: Generated {len(chunks)} cohesive chunks")
            
        RAG_JOBS[job_id]["progress_percent"] = 65.0

        # Step 3: Vector Embeddings & Storage
        stored_items = []
        for idx, chunk in enumerate(chunks):
            pct = 65.0 + ((idx + 1) / max(1, len(chunks))) * 30.0
            RAG_JOBS[job_id]["progress_percent"] = min(95.0, round(pct, 1))
            RAG_JOBS[job_id]["logs"].append(f"[VECTOR] Generating vector embedding for chunk {idx+1}/{len(chunks)}: '{chunk['title'][:45]}...'")
            
            doc_id = f"doc_{uuid.uuid4().hex[:10]}"
            chunk_title = f"[{file_name}] {chunk['title']}"
            vector = get_nvidia_embedding(chunk['content'])
            
            result = store_knowledge_item(
                doc_id=doc_id,
                title=chunk_title,
                category=category,
                content=chunk['content'],
                vector=vector
            )
            stored_items.append(result)

        RAG_JOBS[job_id]["status"] = "completed"
        RAG_JOBS[job_id]["progress_percent"] = 100.0
        RAG_JOBS[job_id]["total_chunks"] = len(stored_items)
        RAG_JOBS[job_id]["logs"].append(f"[SUCCESS] RAG Ingestion Complete! Stored {len(stored_items)} chunks into Qdrant & Vector DB.")

    except Exception as e:
        RAG_JOBS[job_id]["status"] = "error"
        RAG_JOBS[job_id]["error"] = str(e)
        RAG_JOBS[job_id]["logs"].append(f"[ERROR] Ingestion Failed: {str(e)}")

def ingest_file_document(file_name: str, file_bytes: bytes, category: str) -> Dict[str, Any]:
    """Synchronous file ingestion wrapper."""
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    process_file_ingestion_background(job_id, file_name, file_bytes, category)
    job_info = get_rag_job_status(job_id)
    if job_info.get("status") == "error":
        raise ValueError(job_info.get("error", "File processing failed"))
    return {
        "status": "success",
        "file_name": file_name,
        "total_chunks": job_info.get("total_chunks", 0)
    }
