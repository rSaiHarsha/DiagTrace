import os
import json
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
import requests

# Load environment variables from .env
load_dotenv()

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

def get_nvidia_api_key() -> str:
    return os.getenv("NVIDIA_API_KEY", "").strip()

def get_nvidia_model() -> str:
    return os.getenv("NVIDIA_MODEL_NAME", "meta/llama-3.3-70b-instruct").strip()

def get_nvidia_embed_model() -> str:
    return os.getenv("NVIDIA_EMBED_MODEL", "nvidia/nv-embedqa-e5-v5").strip()

def set_nvidia_ai_config(api_key: Optional[str] = None, model_name: Optional[str] = None, embed_model: Optional[str] = None):
    """Updates runtime NVIDIA AI settings and persists to .env file."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    env_lines = {}
    
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_lines[k.strip()] = v.strip()

    if api_key is not None and api_key.strip():
        os.environ["NVIDIA_API_KEY"] = api_key.strip()
        env_lines["NVIDIA_API_KEY"] = api_key.strip()
    if model_name is not None and model_name.strip():
        os.environ["NVIDIA_MODEL_NAME"] = model_name.strip()
        env_lines["NVIDIA_MODEL_NAME"] = model_name.strip()
    if embed_model is not None and embed_model.strip():
        os.environ["NVIDIA_EMBED_MODEL"] = embed_model.strip()
        env_lines["NVIDIA_EMBED_MODEL"] = embed_model.strip()

    # Rewrite .env
    try:
        with open(env_path, "w", encoding="utf-8") as f:
            for k, v in env_lines.items():
                f.write(f"{k}={v}\n")
    except Exception as e:
        print(f"Failed to update .env: {e}")

def query_nvidia_llm(prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.2, max_tokens: int = 1500) -> str:
    """Queries NVIDIA NIM API for LLM completion. Raises explicit error on failure."""
    api_key = get_nvidia_api_key()
    model = get_nvidia_model()
    
    if not api_key or api_key.startswith("nvapi-your-key"):
        raise RuntimeError("NVIDIA_API_KEY is missing or invalid. Please enter your valid NVIDIA API Key in Settings (⚙️ Settings -> 🤖 AI Models & Keys).")
        
    if not system_prompt:
        system_prompt = (
            "You are DiagTrace AI, an expert Automotive Diagnostics Systems Architect and Root Cause Analysis (RCA) Engineer. "
            "Provide precise, highly technical, professional insights for vehicle diagnostic codes, ECU specs, signal matrices, and Jira issue tracking."
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False
    }
    
    try:
        res = requests.post(f"{NVIDIA_BASE_URL}/chat/completions", headers=headers, json=payload, timeout=550)
        if res.status_code == 200:
            data = res.json()
            if "choices" in data and len(data["choices"]) > 0:
                return data["choices"][0]["message"]["content"].strip()
            raise RuntimeError(f"NVIDIA API returned empty choices payload: {res.text}")
        else:
            try:
                err_data = res.json()
                err_msg = err_data.get("detail") or err_data.get("message") or res.text
            except Exception:
                err_msg = res.text
            if res.status_code in (401, 403):
                raise RuntimeError(f"NVIDIA API Authorization Failed (HTTP {res.status_code}): Invalid or unauthenticated API key. Please open '⚙️ Settings' -> '🤖 AI Models & Keys' to enter your valid key starting with 'nvapi-' (obtainable for free at build.nvidia.com).")
            raise RuntimeError(f"NVIDIA API Call Failed ({res.status_code}): {err_msg}")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"NVIDIA API Connection Error: {str(e)}")

def get_nvidia_embedding(text: str) -> List[float]:
    """Generates embedding vector via NVIDIA Embedding NIM or fallback hash vector if key is not configured."""
    api_key = get_nvidia_api_key()
    model = get_nvidia_embed_model()
    
    if api_key and not api_key.startswith("nvapi-your-key"):
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "input": [text[:2000]],
            "model": model,
            "input_type": "query"
        }
        try:
            res = requests.post(f"{NVIDIA_BASE_URL}/embeddings", headers=headers, json=payload, timeout=15)
            if res.status_code == 200:
                data = res.json()
                if "data" in data and len(data["data"]) > 0:
                    return data["data"][0]["embedding"]
        except Exception as e:
            print(f"Error fetching NVIDIA embedding: {e}")

    # Fallback pseudo-embedding vector (dimension 128) based on string hashing for local RAG indexing
    import hashlib
    vec = []
    text_bytes = text.encode('utf-8')
    for i in range(128):
        h = hashlib.sha256(text_bytes + str(i).encode()).digest()
        val = (int.from_bytes(h[:4], byteorder='big') / 0xFFFFFFFF) * 2 - 1
        vec.append(val)
    return vec
