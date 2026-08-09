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
    return os.getenv("NVIDIA_MODEL_NAME", "openai/gpt-oss-20b").strip()

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

import time

def query_nvidia_llm(prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.2, max_tokens: int = 2500, timeout: int = 600, abort_event: Optional[Any] = None) -> str:
    """Queries NVIDIA NIM API for LLM completion with automatic 503 retries and fallback model support."""
    api_key = get_nvidia_api_key()
    primary_model = get_nvidia_model()
    
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

    # Use strictly the configured primary model (no hardcoded fallbacks)
    candidate_models = [primary_model]

    last_error_msg = ""
    
    for current_model in candidate_models:
        payload = {
            "model": current_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True  # Stream to allow abort polling
        }

        # Attempt up to 3 retries per model for transient 503 / 429 / connection issues
        for attempt in range(1, 4):
            try:
                if abort_event and abort_event.is_set():
                    raise InterruptedError("LLM Generation cancelled by user.")
                
                with requests.post(f"{NVIDIA_BASE_URL}/chat/completions", headers=headers, json=payload, timeout=timeout, stream=True) as res:
                    if res.status_code == 200:
                        content_parts = []
                        for line in res.iter_lines():
                            if abort_event and abort_event.is_set():
                                raise InterruptedError("LLM Generation cancelled by user.")
                            if line:
                                line_str = line.decode('utf-8')
                                if line_str.startswith("data: "):
                                    data_str = line_str[6:].strip()
                                    if data_str == "[DONE]":
                                        break
                                    try:
                                        data_obj = json.loads(data_str)
                                        if "choices" in data_obj and len(data_obj["choices"]) > 0:
                                            delta = data_obj["choices"][0].get("delta", {})
                                            if "content" in delta:
                                                content_parts.append(delta["content"])
                                    except Exception:
                                        pass
                        return "".join(content_parts).strip()
                    else:
                        err_text = res.text
                        try:
                            err_data = json.loads(err_text)
                            err_msg = err_data.get("detail") or err_data.get("message") or err_text
                            if isinstance(err_data.get("error"), dict) and "message" in err_data["error"]:
                                err_msg = err_data["error"]["message"]
                        except Exception:
                            err_msg = err_text

                last_error_msg = f"HTTP {res.status_code}: {err_msg}"

                if res.status_code in (401, 403):
                    raise RuntimeError(f"NVIDIA API Authorization Failed (HTTP {res.status_code}): Invalid or unauthenticated API key. Please open '⚙️ Settings' -> '🤖 AI Models & Keys' to enter your valid key starting with 'nvapi-'.")
                
                # Transient rate limit or worker queue exhaustion (503 / 429 / 504) -> retry with backoff
                if res.status_code in (503, 429, 504, 502):
                    wait_time = attempt * 2  # 2s, 4s, 6s
                    print(f"⚠️ [NVIDIA API {res.status_code}] Model '{current_model}' busy ({err_msg}). Retrying in {wait_time}s (Attempt {attempt}/3)...")
                    
                    # Sleep interruptably
                    for _ in range(wait_time * 10):
                        if abort_event and abort_event.is_set():
                            raise InterruptedError("LLM Generation cancelled by user.")
                        time.sleep(0.1)
                    continue
                else:
                    # Non-retryable HTTP error for this model, try next model candidate
                    break

            except requests.exceptions.RequestException as e:
                last_error_msg = f"Connection Error: {str(e)}"
                wait_time = attempt * 2
                for _ in range(wait_time * 10):
                    if abort_event and abort_event.is_set():
                        raise InterruptedError("LLM Generation cancelled by user.")
                    time.sleep(0.1)

    raise RuntimeError(f"NVIDIA API Call Failed after retries: {last_error_msg}")

def get_nvidia_vision_model() -> str:
    return os.getenv("NVIDIA_VISION_MODEL", "meta/llama-3.2-11b-vision-instruct").strip()

def query_nvidia_vision_ocr(image_base64: str, prompt: Optional[str] = None, timeout: int = 90) -> str:
    """Uses NVIDIA Build Vision / OCR Model (meta/llama-3.2-11b-vision-instruct) to extract high-fidelity text, layout structure, tables, and handwritten/scanned content from document page images."""
    api_key = get_nvidia_api_key()
    if not api_key or api_key.startswith("nvapi-your-key"):
        raise RuntimeError("NVIDIA_API_KEY is missing or invalid.")
        
    vision_model = get_nvidia_vision_model()
    
    if not prompt:
        prompt = (
            "You are an expert Document Layout & OCR Extraction AI. "
            "Analyze this page image carefully and extract all text content, section headings, bullet points, structured data tables, and technical annotations. "
            "Format the extracted content as clean, well-structured Markdown. Output ONLY the extracted document text and Markdown tables."
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    if not image_base64.startswith("data:image/"):
        image_url_val = f"data:image/png;base64,{image_base64}"
    else:
        image_url_val = image_base64

    payload = {
        "model": vision_model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url_val}
                    }
                ]
            }
        ],
        "temperature": 0.1,
        "max_tokens": 2048
    }

    try:
        res = requests.post(f"{NVIDIA_BASE_URL}/chat/completions", headers=headers, json=payload, timeout=timeout)
        if res.status_code == 200:
            data = res.json()
            if "choices" in data and len(data["choices"]) > 0:
                content = data["choices"][0]["message"]["content"]
                return content.strip()
            raise RuntimeError("NVIDIA Vision API returned invalid response payload.")
        else:
            raise RuntimeError(f"NVIDIA Vision OCR API error ({res.status_code}): {res.text}")
    except Exception as e:
        print(f"NVIDIA Vision OCR Exception: {e}")
        raise

def query_nvidia_vision_sysml(image_base64: str, timeout: int = 120) -> str:
    """Uses NVIDIA Llama 3.2 Vision Model to analyze diagram images. Converts ECU Architecture/UML/Network diagrams into formal SysML (v2/PlantUML) code and detailed component/interface context."""
    system_prompt = (
        "You are an expert Automotive Systems Architect & SysML/UML Specialist.\n"
        "Analyze the provided document or diagram image carefully.\n\n"
        "1. DIAGRAM DEPICTION & SYSML CODE CONVERSION:\n"
        "   - Accurately depict and model the diagram by generating formal, valid SysML v2 code (`package ... { part def ... }`) AND PlantUML code (`@startuml ... @enduml`) representing all components (ECUs, Domain Controllers, Sensors, Actuators), ports, buses (CAN-FD, LIN, Ethernet), signals, and sequence flows.\n"
        "2. COMPONENT & INTERFACE BREAKDOWN:\n"
        "   - Provide a structured Markdown component analysis detailing each ECU/module, its ports, bus speed/protocol, and signal relationships.\n"
        "3. IF NOT A DIAGRAM:\n"
        "   - Extract a detailed technical summary of all visible content, data tables, and specifications.\n\n"
        "Format the output starting directly with the [SYSML_SPEC] code depiction block followed by [COMPONENT_ANALYSIS]."
    )
    return query_nvidia_vision_ocr(image_base64, prompt=system_prompt, timeout=timeout)

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
