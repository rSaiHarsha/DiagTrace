import os
import sys
import time
import subprocess
import threading
import urllib.request
import webbrowser

def open_browser(url: str):
    """
    Waits for the FastAPI backend to start responding and opens the application in the default web browser.
    """
    time.sleep(1.0)
    for _ in range(20):
        try:
            with urllib.request.urlopen(f"{url}/api/version", timeout=1) as resp:
                if resp.status == 200:
                    webbrowser.open(url)
                    return
        except Exception:
            time.sleep(0.5)
    # Fallback open if health check didn't respond in time
    try:
        webbrowser.open(url)
    except Exception:
        pass

def run():
    workspace_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Detect Python interpreter (prefer project venv if present)
    if os.name == 'nt':
        venv_python = os.path.join(workspace_dir, "venv", "Scripts", "python.exe")
    else:
        venv_python = os.path.join(workspace_dir, "venv", "bin", "python")
        
    if os.path.exists(venv_python):
        python_exe = venv_python
    else:
        python_exe = sys.executable

    host = os.getenv("HOST", "127.0.0.1")
    port = os.getenv("PORT", "8000")
    url = f"http://{host}:{port}"

    print("=" * 65)
    print(" ⚡ DiagTrace - Enterprise Vehicle Diagnostics Portal")
    print("=" * 65)
    print(f" ► Python Interpreter : {python_exe}")
    print(f" ► Host & Port        : {host}:{port}")
    print(f" ► Application URL    : {url}")
    print(f" ► Served Architecture: FastAPI Backend (API) + Static Frontend (UI)")
    print("-" * 65)
    print(" Starting server... Press Ctrl+C to exit.")
    print("=" * 65)

    # Launch browser in a background thread
    browser_thread = threading.Thread(target=open_browser, args=(url,), daemon=True)
    browser_thread.start()

    # Start FastAPI / Uvicorn server
    cmd = [
        python_exe, "-m", "uvicorn", "backend.main:app",
        "--host", host,
        "--port", str(port),
        "--reload"
    ]

    try:
        proc = subprocess.Popen(cmd, cwd=workspace_dir)
        proc.wait()
    except KeyboardInterrupt:
        print("\n[INFO] Graceful shutdown requested. Stopping server...")
    finally:
        try:
            if 'proc' in locals() and proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=3)
        except Exception:
            pass
        print("[INFO] DiagTrace server stopped.")

if __name__ == "__main__":
    run()

