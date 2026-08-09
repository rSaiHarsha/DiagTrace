import os
import json
import sqlite3
import math
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from backend.database import get_connection, db_lock

load_dotenv()

# Global memory cache for vector documents
_vector_documents: List[Dict[str, Any]] = []

def init_qdrant_storage():
    """Initializes SQLite vector fallback table if Qdrant Cloud is not configured."""
    with db_lock:
        try:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rag_knowledge_base (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL,
                    content TEXT NOT NULL,
                    vector_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            cursor.execute("UPDATE rag_knowledge_base SET category = 'System Requirements' WHERE category = 'Jira & Requirements' OR category = 'Jira'")
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error initializing RAG storage: {e}")

def set_qdrant_config(url: Optional[str] = None, api_key: Optional[str] = None):
    """Updates runtime Qdrant settings and persists to .env file."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    env_lines = {}
    
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_lines[k.strip()] = v.strip()

    if url is not None and url.strip():
        os.environ["QDRANT_URL"] = url.strip()
        env_lines["QDRANT_URL"] = url.strip()
    if api_key is not None and api_key.strip():
        os.environ["QDRANT_API_KEY"] = api_key.strip()
        env_lines["QDRANT_API_KEY"] = api_key.strip()

    try:
        with open(env_path, "w", encoding="utf-8") as f:
            for k, v in env_lines.items():
                f.write(f"{k}={v}\n")
    except Exception as e:
        print(f"Failed to update .env for Qdrant: {e}")

def get_qdrant_client():
    """Attempts to connect to Qdrant Cloud / Server if valid credentials exist."""
    qdrant_url = os.getenv("QDRANT_URL", "").strip()
    qdrant_api_key = os.getenv("QDRANT_API_KEY", "").strip()
    
    if qdrant_url and qdrant_api_key and qdrant_url.startswith("http") and not qdrant_api_key.startswith("your-") and "test.qdrant" not in qdrant_url:
        try:
            from qdrant_client import QdrantClient
            client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=5.0)
            return client
        except Exception:
            pass
    return None

def store_knowledge_item(doc_id: str, title: str, category: str, content: str, vector: List[float]) -> Dict[str, Any]:
    """Stores a knowledge item (ECU specs, architecture, signal matrix, Jira) into Vector Storage."""
    init_qdrant_storage()
    from datetime import datetime
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    client = get_qdrant_client()
    if client:
        try:
            from qdrant_client.http import models
            collection_name = "diagtrace_knowledge"
            # Ensure collection exists
            try:
                client.get_collection(collection_name)
            except Exception:
                client.create_collection(
                    collection_name=collection_name,
                    vectors_config=models.VectorParams(size=len(vector), distance=models.Distance.COSINE)
                )
            
            client.upsert(
                collection_name=collection_name,
                points=[
                    models.PointStruct(
                        id=hash(doc_id) % (2**31),
                        vector=vector,
                        payload={
                            "doc_id": doc_id,
                            "title": title,
                            "category": category,
                            "content": content,
                            "created_at": created_at
                        }
                    )
                ]
            )
        except Exception as e:
            print(f"Qdrant Upsert Notice (using local SQLite storage): {e}")

    # Always persist in SQLite for reliable retrieval fallback
    with db_lock:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO rag_knowledge_base (id, title, category, content, vector_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (doc_id, title, category, content, json.dumps(vector), created_at))
        conn.commit()
        conn.close()

    return {"id": doc_id, "title": title, "category": category, "created_at": created_at}

def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)

def query_rag_context(query_text: str, query_vector: List[float], category: Optional[str] = None, top_k: int = 3, min_score: float = 0.60) -> List[Dict[str, Any]]:
    """Retrieves top matching knowledge base records for RAG context building with a confidence score threshold."""
    init_qdrant_storage()
    results = []
    
    # Try Qdrant Cloud Search first
    client = get_qdrant_client()
    if client:
        try:
            # Check if collection exists before searching
            collection_exists = False
            try:
                if hasattr(client, 'collection_exists'):
                    collection_exists = client.collection_exists("diagtrace_knowledge")
                else:
                    client.get_collection("diagtrace_knowledge")
                    collection_exists = True
            except Exception:
                collection_exists = False

            if collection_exists:
                from qdrant_client.http import models
                query_filter = None
                if category and category.strip():
                    query_filter = models.Filter(
                        must=[
                            models.FieldCondition(
                                key="category",
                                match=models.MatchValue(value=category.strip())
                            )
                        ]
                    )

                if hasattr(client, 'query_points'):
                    response = client.query_points(
                        collection_name="diagtrace_knowledge",
                        query=query_vector,
                        query_filter=query_filter,
                        score_threshold=min_score,
                        limit=top_k
                    )
                    hits = response.points
                elif hasattr(client, 'search'):
                    hits = client.search(
                        collection_name="diagtrace_knowledge",
                        query_vector=query_vector,
                        query_filter=query_filter,
                        score_threshold=min_score,
                        limit=top_k
                    )
                else:
                    hits = []
                    
                for hit in hits:
                    payload = getattr(hit, 'payload', {}) or {}
                    score = getattr(hit, 'score', 0)
                    if score >= min_score:
                        results.append({
                            "id": payload.get("doc_id"),
                            "title": payload.get("title"),
                            "category": payload.get("category"),
                            "content": payload.get("content"),
                            "score": score
                        })
                if results:
                    return results
        except Exception:
            pass

    # SQLite vector fallback search
    with db_lock:
        try:
            conn = get_connection()
            cursor = conn.cursor()
            query_sql = "SELECT id, title, category, content, vector_json FROM rag_knowledge_base"
            if category:
                query_sql += f" WHERE category = '{category}'"
            cursor.execute(query_sql)
            rows = cursor.fetchall()
            conn.close()
            
            scored_docs = []
            for row in rows:
                doc_id, title, cat, content, vec_json = row
                try:
                    vec = json.loads(vec_json)
                    score = cosine_similarity(query_vector, vec)
                except Exception:
                    score = 0.0
                if score >= min_score:
                    scored_docs.append({
                        "id": doc_id,
                        "title": title,
                        "category": cat,
                        "content": content,
                        "score": score
                    })
            
            scored_docs.sort(key=lambda x: x["score"], reverse=True)
            return scored_docs[:top_k]
        except Exception as e:
            print(f"Error querying SQLite RAG: {e}")
            return []

def get_all_knowledge_documents() -> List[Dict[str, Any]]:
    """Lists all ingested documents in the RAG knowledge base."""
    init_qdrant_storage()
    with db_lock:
        try:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id, title, category, created_at, LENGTH(content) FROM rag_knowledge_base ORDER BY created_at DESC")
            rows = cursor.fetchall()
            conn.close()
            return [{"id": r[0], "title": r[1], "category": r[2], "created_at": r[3], "length": r[4]} for r in rows]
        except Exception as e:
            print(f"Error listing RAG docs: {e}")
            return []

def get_all_knowledge_items_full() -> List[Dict[str, Any]]:
    """Lists all ingested documents with content for fallback keyword search."""
    init_qdrant_storage()
    with db_lock:
        try:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id, title, category, content FROM rag_knowledge_base")
            rows = cursor.fetchall()
            conn.close()
            return [{"id": r[0], "title": r[1], "category": r[2], "content": r[3]} for r in rows]
        except Exception as e:
            print(f"Error fetching full RAG items: {e}")
            return []

def get_knowledge_chunks(category: Optional[str] = None, search: Optional[str] = None, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    """Fetches paginated, filtered chunks from the knowledge base."""
    init_qdrant_storage()
    with db_lock:
        try:
            conn = get_connection()
            cursor = conn.cursor()
            
            query = "SELECT id, title, category, content, created_at FROM rag_knowledge_base"
            count_query = "SELECT COUNT(*) FROM rag_knowledge_base"
            
            conditions = []
            params = []
            
            if category and category.lower() != "all":
                cat_lower = category.strip().lower()
                if cat_lower in ["jira", "jira tickets"]:
                    conditions.append("(category = ? OR category = ? OR category LIKE ?)")
                    params.extend(["Jira", "Jira Tickets", "%Jira%"])
                elif cat_lower in ["system requirements", "requirements"]:
                    conditions.append("(category = ? OR category LIKE ?)")
                    params.extend(["System Requirements", "%Requirements%"])
                else:
                    conditions.append("category = ?")
                    params.append(category)
                
            if search and search.strip():
                conditions.append("(content LIKE ? OR title LIKE ?)")
                search_term = f"%{search.strip()}%"
                params.extend([search_term, search_term])
                
            if conditions:
                where_clause = " WHERE " + " AND ".join(conditions)
                query += where_clause
                count_query += where_clause
                
            cursor.execute(count_query, params)
            total_count = cursor.fetchone()[0]
            
            query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([page_size, (page - 1) * page_size])
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            conn.close()
            
            chunks = [{"id": r[0], "title": r[1], "category": r[2], "content": r[3], "created_at": r[4]} for r in rows]
            
            return {
                "chunks": chunks,
                "total": total_count,
                "page": page,
                "page_size": page_size
            }
        except Exception as e:
            print(f"Error fetching RAG chunks: {e}")
            return {"chunks": [], "total": 0, "page": page, "page_size": page_size}

def delete_knowledge_chunk(chunk_id: str) -> bool:
    """Deletes a single knowledge chunk by ID from both vector storage (Qdrant) and fallback storage (SQLite)."""
    init_qdrant_storage()
    
    # 1. Delete from Qdrant Cloud / Server vector storage if configured
    client = get_qdrant_client()
    if client:
        try:
            from qdrant_client.http import models
            collection_name = "diagtrace_knowledge"
            point_id = hash(chunk_id) % (2**31)
            
            # Delete by point ID
            if hasattr(client, 'delete_points'):
                client.delete_points(
                    collection_name=collection_name,
                    points=[point_id],
                    wait=True
                )
            elif hasattr(client, 'delete'):
                client.delete(
                    collection_name=collection_name,
                    points_selector=models.PointIdsList(points=[point_id]),
                    wait=True
                )
            
            # Also attempt payload filter deletion in case doc_id was set in payload
            try:
                if hasattr(client, 'delete_points'):
                    client.delete_points(
                        collection_name=collection_name,
                        points=models.Filter(
                            must=[
                                models.FieldCondition(
                                    key="doc_id",
                                    match=models.MatchValue(value=chunk_id)
                                )
                            ]
                        ),
                        wait=True
                    )
            except Exception:
                pass
        except Exception as e:
            print(f"Qdrant vector deletion notice for chunk '{chunk_id}': {e}")

    # 2. Delete from local SQLite table
    with db_lock:
        try:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM rag_knowledge_base WHERE id = ?", (chunk_id,))
            rows_affected = cursor.rowcount
            conn.commit()
            conn.close()
            return rows_affected > 0
        except Exception as e:
            print(f"Error deleting RAG chunk {chunk_id} from SQLite: {e}")
            return False


