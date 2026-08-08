import os
import time
import re
import csv
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any

DTC_DESCRIPTIONS = {
    'P0101': 'Mass Air Flow Sensor Circuit Range/Performance',
    'P0300': 'Random/Multiple Cylinder Misfire Detected',
    'P0420': 'Catalyst System Efficiency Below Threshold',
    'P0171': 'System Too Lean (Bank 1)',
    'P0562': 'System Voltage Low',
    'P0700': 'Transmission Control System Malfunction',
    'U0100': 'Lost Communication With ECM/PCM',
    'U0121': 'Lost Communication With Anti-Lock Brake System (ABS) Control Module',
    'B0010': 'Driver Frontal Airbag Deployment Control',
    'B0028': 'Right Side Airbag Deployment Control',
    'B0100': 'Electronic Front Impact Sensor',
    'C0045': "Brake Pressure Sensor 'B' Malfunction",
    'C1201': 'ABS Control Module Engine Control System Malfunction'
}

class DiagnosticParser:
    def __init__(self, folder_path: str):
        self.folder_path = folder_path
        
    def parse_files(self, log_callback) -> pd.DataFrame:
        log_callback({
            "message": f"Checking directory: '{self.folder_path}'...",
            "level": "info",
            "time": datetime.now().strftime("%H:%M:%S")
        })
        time.sleep(0.1)
        
        if not os.path.exists(self.folder_path):
            log_callback({
                "message": f"Error: The directory path '{self.folder_path}' was not found.",
                "level": "error",
                "time": datetime.now().strftime("%H:%M:%S")
            })
            raise FileNotFoundError(f"Path {self.folder_path} does not exist.")
            
        all_files = []
        if os.path.isfile(self.folder_path):
            all_files = [self.folder_path]
        else:
            for root, _, files in os.walk(self.folder_path):
                for f in sorted(files):
                    if f.lower().endswith(('.txt', '.csv', '.log', '.dat')):
                        all_files.append(os.path.join(root, f))
                        
        if not all_files:
            log_callback({
                "message": f"No log files (.txt, .csv, .log) found in directory '{self.folder_path}'.",
                "level": "warning",
                "time": datetime.now().strftime("%H:%M:%S")
            })
            return pd.DataFrame(columns=[
                "File", "Module", "Code", "Description", "Issue Status",
                "Comments", "Author", "Program name", "VIN Number", "Last Updated"
            ])

        log_callback({
            "message": f"Found {len(all_files)} log file(s) for ingestion.",
            "level": "info",
            "time": datetime.now().strftime("%H:%M:%S")
        })
        
        rows = []
        for file_path in all_files:
            file_name = os.path.basename(file_path)
            log_callback({
                "message": f"Processing file -> {file_name}...",
                "level": "info",
                "time": datetime.now().strftime("%H:%M:%S")
            })
            
            file_rows = self._parse_single_file(file_path, file_name)
            rows.extend(file_rows)
            
        log_callback({
            "message": f"Data Parsing Complete! Extracted {len(rows)} record(s) across {len(all_files)} file(s).",
            "level": "success",
            "time": datetime.now().strftime("%H:%M:%S")
        })
        
        cols = [
            "File", "Module", "Code", "Description", "Issue Status",
            "Comments", "Author", "Program name", "VIN Number", "Last Updated",
            "Raw", "Hex"
        ]
        
        if rows:
            return pd.DataFrame(rows, columns=cols)
        else:
            return pd.DataFrame(columns=cols)

    def _parse_single_file(self, file_path: str, file_name: str) -> List[Dict[str, str]]:
        rows = []
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except Exception as e:
            print(f"Failed to read file {file_path}: {e}")
            return rows

        if not content.strip():
            return rows

        lines = [line.strip() for line in content.splitlines() if line.strip()]
        if lines and ("," in lines[0] or "\t" in lines[0]):
            csv_rows = self._parse_csv_content(content, file_name)
            if csv_rows:
                return csv_rows

        # Fallback to text key-value block parsing
        kv_rows = self._parse_kv_text_content(content, file_name)
        return kv_rows

    def _parse_csv_content(self, content: str, file_name: str) -> List[Dict[str, str]]:
        rows = []
        try:
            delimiter = "\t" if "\t" in content.splitlines()[0] else ","
            reader = csv.DictReader(content.splitlines(), delimiter=delimiter)
            for r in reader:
                # --- DTC Code (supports both new "Code" and legacy "Decoded_DTC_Code") ---
                code = (r.get("Code") or r.get("Decoded_DTC_Code") or r.get("DTC Code") or r.get("DTC_Code") or "").strip()
                if not code and not any(r.values()):
                    continue
                
                module = (r.get("Module") or r.get("module") or "ECM").strip()
                program = (r.get("Program") or r.get("Program name") or r.get("Program_Name") or "").strip()
                vin = (r.get("VIN") or r.get("VIN_Suffix") or r.get("VIN Number") or "").strip()
                timestamp = (r.get("Timestamp_UTC") or r.get("Last Updated") or r.get("Timestamp") or "").strip()
                if timestamp:
                    timestamp = timestamp.replace("T", " ").replace("Z", "")
                else:
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                # --- Status: all newly ingested logs default to "New" ---
                # Status is managed via the frontend, not part of raw log data
                status = "New"

                notes = (r.get("Notes") or r.get("Comments") or "").strip()
                desc = (r.get("Description") or DTC_DESCRIPTIONS.get(code) or notes or f"{code} Fault Code").strip()
                author = (r.get("Author") or "System Logger").strip()

                # --- New columns: Raw CAN bytes and Hex DTC ---
                # --- New columns: Raw CAN bytes and Hex DTC as separate fields ---
                raw_can = (r.get("Raw") or "").strip()
                hex_dtc = (r.get("Hex") or "").strip()

                rows.append({
                    "File": file_name,
                    "Module": module,
                    "Code": code,
                    "Description": desc,
                    "Issue Status": status,
                    "Comments": notes if notes else "Ingested from CSV log.",
                    "Author": author,
                    "Program name": program,
                    "VIN Number": vin,
                    "Last Updated": timestamp,
                    "Raw": raw_can,
                    "Hex": hex_dtc
                })
        except Exception as e:
            print(f"CSV parse error for {file_name}: {e}")
        return rows


    def _parse_kv_text_content(self, content: str, file_name: str) -> List[Dict[str, str]]:
        rows = []
        blocks = re.split(r'-{10,}', content)
        for block in blocks:
            block = block.strip()
            if not block or "DIAGNOSTIC LOG FILE:" in block:
                continue
                
            entry = {}
            timestamp_match = re.search(r'\[(.*?)\]', block)
            vin_match = re.search(r'VIN:\s*([A-Za-z0-9-]+)', block, re.IGNORECASE)
            
            entry["Last Updated"] = timestamp_match.group(1).strip() if timestamp_match else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            entry["VIN Number"] = vin_match.group(1).strip() if vin_match else ""
            
            for line in block.splitlines():
                if ":" in line and not line.strip().startswith("["):
                    parts = line.split(":", 1)
                    key = parts[0].strip().lower()
                    val = parts[1].strip()
                    if "program" in key:
                        entry["Program name"] = val
                    elif "module" in key:
                        entry["Module"] = val
                    elif "dtc" in key or "code" in key:
                        entry["Code"] = val
                    elif "description" in key:
                        entry["Description"] = val
                    elif "status" in key:
                        entry["Issue Status"] = val
                    elif "author" in key:
                        entry["Author"] = val
                    elif "comment" in key:
                        entry["Comments"] = val
            
            if entry.get("Code") or entry.get("VIN Number") or entry.get("Module"):
                code = entry.get("Code", "")
                rows.append({
                    "File": file_name,
                    "Module": entry.get("Module", "ECM"),
                    "Code": code,
                    "Description": entry.get("Description") or DTC_DESCRIPTIONS.get(code, f"{code} Diagnostic Code"),
                    "Issue Status": entry.get("Issue Status", "New"),
                    "Comments": entry.get("Comments", "Auto-parsed log entry."),
                    "Author": entry.get("Author", "System Logger"),
                    "Program name": entry.get("Program name", "Default Program"),
                    "VIN Number": entry.get("VIN Number", ""),
                    "Last Updated": entry.get("Last Updated", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                    "Raw": "",
                    "Hex": ""
                })
        return rows
