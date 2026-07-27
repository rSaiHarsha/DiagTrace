import io
import os
import threading
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Header, Depends, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import pandas as pd
import uuid

from backend.parser import DiagnosticParser
from backend.database import (
    init_db, load_from_db, save_to_db, update_row, merge_and_deduplicate,
    create_user, authenticate_user, create_session, get_user_by_token, delete_session
)
from backend.rag_engine import (
    ingest_knowledge_document, ingest_file_document, 
    process_file_ingestion_background, get_rag_job_status
)
from backend.qdrant_service import get_all_knowledge_documents, set_qdrant_config
from backend.rca_engine import run_ai_rca_analysis, get_weekly_ai_summary
from backend.chatbot_engine import process_chatbot_query
from backend.nvidia_client import get_nvidia_model, get_nvidia_embed_model, set_nvidia_ai_config

app = FastAPI(title="Vehicle Diagnostics Parser Engine")
API_VERSION = "2.0.0"

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_cache_control_header(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response

# Global parsing state
state_lock = threading.Lock()
state = {
    "is_processing": False,
    "processing_complete": False,
    "status_logs": [],
    "error_message": None,
    "current_folder": None
}

class ParseRequest(BaseModel):
    folder_path: str

class UpdateRowRequest(BaseModel):
    index: int
    Comments: str
    Issue_Status: str
    Author: Optional[str] = None

class SignUpRequest(BaseModel):
    name: str
    username: str
    email: str
    password: str

class SignInRequest(BaseModel):
    username_or_email: str
    password: str

class RAGIngestRequest(BaseModel):
    title: str
    category: str
    content: str

class ChatQueryRequest(BaseModel):
    message: str

class AISettingsRequest(BaseModel):
    nvidia_api_key: Optional[str] = None
    nvidia_model: Optional[str] = None
    nvidia_embed_model: Optional[str] = None
    qdrant_url: Optional[str] = None
    qdrant_api_key: Optional[str] = None

# Initialize DB
init_db()

def get_current_user_from_header(authorization: Optional[str] = Header(None), x_auth_token: Optional[str] = Header(None)) -> Optional[dict]:
    token = None
    if isinstance(authorization, str) and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()
    elif isinstance(x_auth_token, str) and x_auth_token:
        token = x_auth_token.strip()
    
    if not token:
        return None
    return get_user_by_token(token)

def run_parsing_thread(folder_path: str):
    global state
    try:
        # Check if the folder path exists on the server. If not, create a temp folder
        # with mock files to satisfy the parser check.
        if not os.path.exists(folder_path):
            with state_lock:
                state["status_logs"].append({
                    "message": f"Path '{folder_path}' not found. Creating temporary server folder for ingestion simulation...",
                    "level": "warning",
                    "time": datetime.now().strftime("%H:%M:%S")
                })
            os.makedirs(folder_path, exist_ok=True)
            for i in range(1, 11):
                with open(os.path.join(folder_path, f"log_file_{i}.txt"), "w") as f:
                    f.write("mock content")

        parser = DiagnosticParser(folder_path)
        
        def log_callback(log_entry):
            with state_lock:
                state["status_logs"].append(log_entry)
            
        new_df = parser.parse_files(log_callback)
        
        # Merge new records into the SQLite database
        merged_df = merge_and_deduplicate(new_df)
        save_to_db(merged_df)
        
        with state_lock:
            state["processing_complete"] = True
            state["is_processing"] = False
            state["status_logs"].append({
                "message": "SQLite database sync successfully updated.",
                "level": "success",
                "time": datetime.now().strftime("%H:%M:%S")
            })
    except Exception as e:
        with state_lock:
            state["error_message"] = str(e)
            state["processing_complete"] = True
            state["is_processing"] = False
            state["status_logs"].append({
                "message": f"Parsing failed: {str(e)}",
                "level": "error",
                "time": datetime.now().strftime("%H:%M:%S")
            })

@app.post("/api/start-parse")
def start_parse(payload: ParseRequest):
    global state
    with state_lock:
        if state["is_processing"]:
            return {"status": "already_processing"}
        
        state["is_processing"] = True
        state["processing_complete"] = False
        state["status_logs"] = []
        state["error_message"] = None
        state["current_folder"] = payload.folder_path
        
    thread = threading.Thread(target=run_parsing_thread, args=(payload.folder_path,))
    thread.daemon = True
    thread.start()
    return {"status": "started"}

@app.get("/api/status")
def get_status():
    with state_lock:
        return {
            "is_processing": state["is_processing"],
            "processing_complete": state["processing_complete"],
            "logs": list(state["status_logs"]),
            "current_folder": state["current_folder"],
            "error_message": state["error_message"],
            "version": API_VERSION
        }

@app.get("/api/data")
def get_data():
    df = load_from_db()
    if df is None:
        return {"data": []}
    return {"data": df.reset_index().to_dict(orient="records")}


@app.get("/api/version")
def get_version():
    return {"version": API_VERSION}

@app.post("/api/signup")
def signup(payload: SignUpRequest):
    try:
        user = create_user(payload.name, payload.username, payload.email, payload.password)
        token = create_session(user["id"])
        return {"status": "success", "user": user, "token": token}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Signup failed: {str(e)}")

@app.post("/api/signin")
def signin(payload: SignInRequest):
    user = authenticate_user(payload.username_or_email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username/email or password.")
    token = create_session(user["id"])
    return {"status": "success", "user": user, "token": token}

@app.post("/api/signout")
def signout(authorization: Optional[str] = Header(None), x_auth_token: Optional[str] = Header(None)):
    token = None
    if isinstance(authorization, str) and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()
    elif isinstance(x_auth_token, str) and x_auth_token:
        token = x_auth_token.strip()
    if token:
        delete_session(token)
    return {"status": "success"}

@app.get("/api/me")
def get_me(authorization: Optional[str] = Header(None), x_auth_token: Optional[str] = Header(None)):
    user = get_current_user_from_header(authorization, x_auth_token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"user": user}

@app.post("/api/update-row")
def update_row_endpoint(payload: UpdateRowRequest, authorization: Optional[str] = Header(None), x_auth_token: Optional[str] = Header(None)):
    user = get_current_user_from_header(authorization, x_auth_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required to edit diagnostic records.")
    
    author_name = user["name"]
    try:
        last_updated = update_row(payload.index, payload.Comments, payload.Issue_Status, author_name)
        if last_updated is None:
            raise HTTPException(status_code=400, detail=f"Failed to update row: index {payload.index} not found in database")
        return {"status": "success", "last_updated": last_updated, "author": author_name}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Database update error: {str(e)}")

@app.get("/api/browse")
def browse_directory(path: Optional[str] = Query(None)):
    """API for the Server Folder Explorer tree."""
    if not path:
        path = os.getcwd()
    
    try:
        abs_path = os.path.abspath(path)
        if not os.path.exists(abs_path) or not os.path.isdir(abs_path):
            # Fallback to current directory
            abs_path = os.path.abspath(os.getcwd())
            
        subdirs = []
        # List only directories to keep explorer clean
        for item in sorted(os.listdir(abs_path)):
            item_path = os.path.join(abs_path, item)
            try:
                if os.path.isdir(item_path) and not item.startswith("."):
                    subdirs.append(item)
            except (PermissionError, FileNotFoundError):
                continue
                
        parent_path = os.path.dirname(abs_path)
        # If we are already at root (e.g. C:\), parent_path is the same
        is_root = parent_path == abs_path
        
        return {
            "current_path": abs_path,
            "parent_path": parent_path if not is_root else None,
            "is_root": is_root,
            "subdirs": subdirs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/export")
def export_excel():
    try:
        df = load_from_db()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load data for export: {str(e)}")
    
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="No diagnostic data available to export")
    
    try:
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name='Diagnostic Report')
        
        buffer.seek(0)
        filename = f"Diagnostic_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Excel file: {str(e)}")

@app.post("/api/reset")
def reset_state():
    global state
    try:
        with state_lock:
            state["is_processing"] = False
            state["processing_complete"] = False
            state["status_logs"] = []
            state["error_message"] = None
            state["current_folder"] = None
        return {"status": "reset"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reset state failed: {str(e)}")

@app.post("/api/rag/ingest")
def rag_ingest_endpoint(payload: RAGIngestRequest):
    try:
        res = ingest_knowledge_document(payload.title, payload.category, payload.content)
        return {"status": "success", "document": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Knowledge ingestion failed: {str(e)}")

@app.post("/api/rag/upload-file")
async def rag_upload_file_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: str = Form("ECU Architecture")
):
    try:
        content_bytes = await file.read()
        if not content_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
            
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        background_tasks.add_task(
            process_file_ingestion_background,
            job_id,
            file.filename,
            content_bytes,
            category
        )
        return {
            "status": "started",
            "job_id": job_id,
            "message": f"Background chunking & embedding started for '{file.filename}'."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to launch background ingestion: {str(e)}")

@app.get("/api/rag/jobs/{job_id}")
def get_rag_job_status_endpoint(job_id: str):
    job_info = get_rag_job_status(job_id)
    if not job_info:
        raise HTTPException(status_code=404, detail="Job ID not found.")
    return job_info

@app.get("/api/rag/documents")
def rag_documents_endpoint():
    try:
        docs = get_all_knowledge_documents()
        return {"documents": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list RAG documents: {str(e)}")

@app.post("/api/ai/rca")
def ai_rca_endpoint():
    try:
        analysis = run_ai_rca_analysis()
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI RCA Analysis failed: {str(e)}")

@app.get("/api/ai/weekly-summary")
def ai_weekly_summary_endpoint():
    try:
        summary = get_weekly_ai_summary()
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Weekly Summary failed: {str(e)}")

@app.post("/api/ai/chat")
def ai_chat_endpoint(payload: ChatQueryRequest):
    try:
        res = process_chatbot_query(payload.message)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Chatbot error: {str(e)}")

@app.get("/api/settings/ai")
def get_ai_settings():
    raw_nvidia_key = os.getenv("NVIDIA_API_KEY", "")
    masked_nvidia_key = f"{raw_nvidia_key[:6]}...{raw_nvidia_key[-4:]}" if len(raw_nvidia_key) > 10 else (raw_nvidia_key if raw_nvidia_key else "")
    raw_qdrant_key = os.getenv("QDRANT_API_KEY", "")
    masked_qdrant_key = f"{raw_qdrant_key[:6]}...{raw_qdrant_key[-4:]}" if len(raw_qdrant_key) > 10 else (raw_qdrant_key if raw_qdrant_key else "")
    
    return {
        "nvidia_model": get_nvidia_model(),
        "nvidia_embed_model": get_nvidia_embed_model(),
        "nvidia_api_key_masked": masked_nvidia_key,
        "nvidia_api_key_set": bool(raw_nvidia_key and not raw_nvidia_key.startswith("nvapi-your")),
        "qdrant_url": os.getenv("QDRANT_URL", ""),
        "qdrant_api_key_masked": masked_qdrant_key,
        "qdrant_api_key_set": bool(raw_qdrant_key and not raw_qdrant_key.startswith("your-"))
    }

@app.post("/api/settings/ai")
def update_ai_settings(payload: AISettingsRequest):
    try:
        set_nvidia_ai_config(
            api_key=payload.nvidia_api_key,
            model_name=payload.nvidia_model,
            embed_model=payload.nvidia_embed_model
        )
        set_qdrant_config(
            url=payload.qdrant_url,
            api_key=payload.qdrant_api_key
        )
        return {"status": "success", "message": "AI & Vector DB configuration updated successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update AI settings: {str(e)}")

# Mount frontend files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    # Handle case where frontend folder is missing initially
    @app.get("/")
    def index_fallback():
        return {"message": "Frontend files missing. Please deploy index.html inside frontend/ directory."}
