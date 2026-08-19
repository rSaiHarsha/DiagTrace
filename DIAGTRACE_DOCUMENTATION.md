# ⚡ DiagTrace — Enterprise Vehicle Diagnostics Portal
### Comprehensive Project Documentation  
**Version:** 2.1.0 | **API Version:** 2.0.0

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack & Dependencies](#3-technology-stack--dependencies)
4. [Project Structure](#4-project-structure)
5. [Core Features & Functionality](#5-core-features--functionality)
6. [AI Features & Capabilities](#6-ai-features--capabilities)
7. [User Workflows](#7-user-workflows)
8. [Data Model & Schema](#8-data-model--schema)
9. [Backend API Reference](#9-backend-api-reference)
10. [Frontend Interface Guide](#10-frontend-interface-guide)
11. [Configuration & Environment Setup](#11-configuration--environment-setup)
12. [RAG Knowledge Base System](#12-rag-knowledge-base-system)
13. [Deployment & Running](#13-deployment--running)
14. [File Format Support](#14-file-format-support)
15. [Security & Authentication](#15-security--authentication)
16. [Glossary](#16-glossary)

---

## 1. Project Overview

**DiagTrace** is an enterprise-grade, AI-powered **Vehicle Diagnostic Trouble Code (DTC) management and root cause analysis platform**. It is designed for automotive engineering teams to ingest, parse, analyze, manage, and derive insights from raw vehicle diagnostic log files.

### What Problem Does DiagTrace Solve?

In automotive engineering, vehicles generate hundreds of **Diagnostic Trouble Codes (DTCs)** — error codes from ECU (Electronic Control Unit) modules such as ECM (Engine Control Module), TCM (Transmission Control Module), ABS, BCM (Body Control Module), and others. Managing these logs manually is:

- Time-consuming and error-prone
- Hard to trace patterns across multiple vehicles and programs
- Difficult to connect to root causes without engineering knowledge
- Impossible to scale across large fleets or test programs

**DiagTrace** automates this entire process using:
- Intelligent log parsing (CSV, TXT, LOG formats)
- A persistent SQLite database with deduplication
- An AI Root Cause Analysis (RCA) engine powered by NVIDIA NIM LLMs
- A Retrieval-Augmented Generation (RAG) knowledge base using Qdrant vector DB
- An interactive dashboard with charts and KPI metrics
- An AI chatbot assistant for real-time diagnostic queries

### Primary Users

| User Role | What They Do in DiagTrace |
|-----------|--------------------------|
| **Diagnostic Engineers** | Upload log files, review DTC records, run per-entry AI analysis |
| **System Architects** | Manage the RAG knowledge base, run full RCA across the fleet |
| **Program Managers** | View executive KPI dashboards, weekly AI summaries |
| **QA/Validation Teams** | Track issue statuses, update comments, export reports |

---

## 2. System Architecture

```
+------------------------------------------------------------------------+
|                        DiagTrace System                                |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  |                  FRONTEND (Browser — Multi-Page SPA)             |  |
|  |                                                                  |  |
|  |  index.html + app.js + style.css + chart.js (bundled, offline)  |  |
|  |  ┌─────────────────────────────────────────────────────────┐    |  |
|  |  │ Diagnostic Registry Table  │  Dashboard Charts (KPIs)   │    |  |
|  |  │ Folder Explorer (Svr/Local)│  AI Chat Panel (+ Memory)  │    |  |
|  |  │ Per-File RCA selector      │  User Auth (Sign-In/Up)    │    |  |
|  |  └─────────────────────────────────────────────────────────┘    |  |
|  |                                                                  |  |
|  |  knowledge_base.html + knowledge_base.js                        |  |
|  |  ┌──────────────────────────────────────────────────────────┐   |  |
|  |  │ Upload Docs (PDF/DOCX/IMG/TXT/JSON) │ Chunk Viewer       │   |  |
|  |  │ Live Ingestion Progress Log          │ Delete Chunks      │   |  |
|  |  └──────────────────────────────────────────────────────────┘   |  |
|  |                                                                  |  |
|  |  knowledge_graph.html + knowledge_graph.js + knowledge_graph.css|  |
|  |  ┌──────────────────────────────────────────────────────────┐   |  |
|  |  │ D3.js Force-Directed Graph │ DTC/Module/VIN Explorer     │   |  |
|  |  │ Root Causes Panel          │ Jira/SIMS Tickets Panel     │   |  |
|  |  │ Requirements Panel         │ Activity Timeline           │   |  |
|  |  │ Expand Graph (Fullscreen)  │ On-Demand AI Analysis       │   |  |
|  |  └──────────────────────────────────────────────────────────┘   |  |
|  |                                                                  |  |
|  |  reports.html + reports.js                                      |  |
|  |  ┌──────────────────────────────────────────────────────────┐   |  |
|  |  │ Saved RCA + LOG Report Cards │ Markdown + Chart Viewer   │   |  |
|  |  │ Search / Filter              │ PDF Download (html2pdf.js) │   |  |
|  |  └──────────────────────────────────────────────────────────┘   |  |
|  +------------------------------------------------------------------+  |
|                              │ HTTP REST API                           |
|  +---------------------------▼----------------------------------------+  |
|  |                 BACKEND (FastAPI / Python)                        |  |
|  |                                                                  |  |
|  |  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐    |  |
|  |  │  parser.py  │  │ database.py │  │    rag_engine.py      │    |  |
|  |  │ (CSV + KV)  │  │  (SQLite)   │  │ (chunk + embed)       │    |  |
|  |  └─────────────┘  └──────┬──────┘  └──────────┬───────────┘    |  |
|  |                           │                    │                 |  |
|  |  ┌─────────────┐  ┌──────▼──────┐  ┌──────────▼───────────┐    |  |
|  |  │ rca_engine  │  │  SQLite DB  │  │   qdrant_service.py   │    |  |
|  |  │(fleet+file) │  │  (WAL mode) │  │  (Cloud / SQLite FB)  │    |  |
|  |  │ per-file    │  │  6 tables   │  └──────────┬───────────┘    |  |
|  |  │ quick-stats │  └─────────────┘             │                 |  |
|  |  └─────────────┘                       ┌──────▼──────┐         |  |
|  |                                         │ Qdrant Cloud│         |  |
|  |  ┌──────────────────┐  ┌─────────────┐ │ Vector DB   │         |  |
|  |  │log_analysis_     │  │chatbot_     │ └─────────────┘         |  |
|  |  │engine.py         │  │engine.py    │                          |  |
|  |  │(3-tier RAG)      │  │(session mem)│                          |  |
|  |  └──────────────────┘  └─────────────┘                         |  |
|  |                                                                  |  |
|  |  ┌──────────────────────┐  ┌──────────────────────────────────┐ |  |
|  |  │knowledge_graph_      │  │        NVIDIA NIM AI APIs         │ |  |
|  |  │engine.py             │  │  LLM    : openai/gpt-oss-20b      │ |  |
|  |  │(graph data builder)  │  │  Embed  : nv-embedqa-e5-v5 (128d) │ |  |
|  |  └──────────────────────┘  │  Vision : llama-3.2-vision        │ |  |
|  |                             │           (OCR + SysML convert)   │ |  |
|  |  ┌──────────────────────┐  └──────────────────────────────────┘ |  |
|  |  │document_parser.py    │                                        |  |
|  |  │(PDF/DOCX/IMG/JSON)   │  ┌──────────────────────────────────┐ |  |
|  |  │ PyMuPDF + Vision OCR │  │      nvidia_client.py            │ |  |
|  |  │ SysML converter      │  │  LLM / Embed / Vision API client │ |  |
|  |  └──────────────────────┘  │  503 retry + abort_event support │ |  |
|  |                             └──────────────────────────────────┘ |  |
|  +------------------------------------------------------------------+  |
+------------------------------------------------------------------------+
```

### Architecture Highlights

- **Multi-page frontend** — `index.html` (Diagnostic Registry + Dashboard), `knowledge_base.html` (RAG manager), `knowledge_graph.html` (D3.js DTC Relationship Explorer), `reports.html` (Saved Reports repository) — all sharing one design system via `style.css`
- **Offline-compatible** frontend with locally bundled Chart.js; D3.js, Marked.js, and html2pdf.js loaded via CDN (Knowledge Graph and Reports pages)
- **Dual vector storage** — Qdrant Cloud (preferred) with automatic SQLite `rag_knowledge_base` fallback including numpy cosine similarity
- **Agentic RCA** — fleet-wide and per-file; uses a ReAct-style loop (up to 4 search iterations) then generates each report section via individual LLM calls to avoid token limits
- **Conversation memory** — chatbot sessions persisted to `chat_sessions` SQLite table; sliding window of 20 messages (10 turns)
- **Vision AI** — NVIDIA Llama 3.2 Vision for scanned PDF OCR and ECU Architecture diagram → SysML v2 conversion
- **Abort support** — all long-running AI endpoints (`/api/ai/rca`, `/api/ai/rca/file/{name}`, `/api/analyze-log`) detect client disconnection via `asyncio` + `threading.Event` and cancel cleanly
- **Auto-save** — every RCA and per-row log analysis result is automatically saved to `saved_reports` and surfaces on the Reports page

---

## 3. Technology Stack & Dependencies

### Backend

| Component | Technology | Version/Notes |
|-----------|-----------|---------------|
| Web Framework | **FastAPI** | High-performance async REST API |
| ASGI Server | **Uvicorn** | Standard with WebSocket support |
| Database | **SQLite** | Local, file-based, WAL mode enabled |
| ORM/Data | **Pandas** | DataFrame-based data manipulation |
| AI LLM | **NVIDIA NIM** (`openai/gpt-oss-20b`) | Via NVIDIA API key |
| AI Embeddings | **NVIDIA NIM** (`nvidia/nv-embedqa-e5-v5`) | 128-dim vectors for RAG |
| Vector DB | **Qdrant** | Cloud or local; SQLite fallback |
| PDF Parsing | **pypdf** | Multi-page PDF text extraction |
| DOCX Parsing | **python-docx** | Word document paragraph/table extraction |
| Environment | **python-dotenv** | `.env` file management |
| HTTP Client | **requests** / **httpx** | NVIDIA API calls |
| Excel Export | **xlsxwriter** | `.xlsx` report generation |
| Security | **hashlib/PBKDF2** + **secrets** | Password hashing, session tokens |

### Frontend

| Component | Technology | Notes |
|-----------|-----------|-------|
| Structure | **HTML5** | Semantic, SPA design |
| Styling | **Vanilla CSS** | Dark-mode, glassmorphism, custom design system |
| Charting | **Chart.js** (bundled) | 100% offline-compatible, no CDN |
| Logic | **Vanilla JavaScript** | No framework dependency |

### Python Package Dependencies (requirements.txt)

```
fastapi
uvicorn[standard]
pandas
numpy
xlsxwriter
python-dotenv
requests
httpx
openai
qdrant-client
pypdf
python-docx
python-multipart
```

---

## 4. Project Structure

```
DiagTrace/
├── .env                           # API keys & configuration (NEVER commit)
├── .env.example                   # Template for .env setup
├── .gitignore / .dockerignore     # Git + Docker ignore rules
├── Dockerfile                     # Docker container definition
├── requirements.txt               # Python dependencies
├── run.py                         # Entry point — launches uvicorn
├── test_ai_rag.py                 # Test: AI + RAG integration
├── test_rag_file_upload.py        # Test: file upload to RAG pipeline
│
├── backend/                       # Python FastAPI backend
│   ├── __init__.py
│   ├── main.py                    # FastAPI app + ALL 50+ REST endpoints (838 lines)
│   ├── parser.py                  # Diagnostic log parser (CSV + KV-text auto-detect)
│   ├── database.py                # SQLite: 6-table schema, CRUD, auth, sessions,
│   │                              #   saved_reports, chat_sessions (475 lines)
│   ├── rca_engine.py              # Agentic RCA: fleet-wide + per-file,
│   │                              #   feature extraction, chart data, section-by-section
│   │                              #   LLM report generation, co-occurrence, odometer,
│   │                              #   voltage correlation, repeat-offender VINs (1106 lines)
│   ├── log_analysis_engine.py     # Per-row AI analysis: 3-tier RAG fallback
│   ├── chatbot_engine.py          # Chatbot: conversation memory, RAG, chart specs
│   ├── rag_engine.py              # RAG ingestion: LLM semantic chunking, requirements
│   │                              #   logical chunking, architecture unified chunk
│   ├── qdrant_service.py          # Vector DB: Qdrant Cloud + SQLite fallback, CRUD
│   ├── nvidia_client.py           # NVIDIA NIM: LLM + Embed + Vision API client,
│   │                              #   503 retry, abort_event, .env persistence
│   ├── document_parser.py         # Document parser: PDF (PyMuPDF + table extraction
│   │                              #   + Vision OCR), DOCX, TXT, JSON, IMG → SysML
│   ├── knowledge_graph_engine.py  # Knowledge graph data builder: DTC overview,
│   │                              #   RAG data extraction, related DTCs, activity
│   │                              #   timeline, dynamic entity-type graphs
│   └── diagnostics.db             # SQLite database (auto-created on first run)
│
├── frontend/                      # Static web frontend (served by FastAPI)
│   ├── index.html                 # Main page — Diagnostic Registry + Dashboard + RCA
│   ├── app.js                     # Main frontend logic + shared utilities (~126 KB)
│   ├── style.css                  # Shared design system: dark mode, glassmorphism (~65 KB)
│   ├── chart.js                   # Bundled Chart.js (100% offline — no CDN)
│   ├── knowledge_base.html        # Knowledge Base management page
│   ├── knowledge_base.js          # KB page: upload, chunk viewer, delete, progress
│   ├── knowledge_graph.html       # DTC Knowledge Graph Explorer (D3.js, Marked.js)
│   ├── knowledge_graph.js         # Graph page: D3 force layout, panels, fullscreen
│   ├── knowledge_graph.css        # Graph-specific styles (node colors, panels)
│   ├── reports.html               # Saved AI Reports page (html2pdf.js)
│   └── reports.js                 # Reports page: list, view, search, delete, PDF
│
└── ingest_test/                   # Sample test data for development
    ├── LIST.txt
    ├── log_file_1.txt … log_file_10.txt  # Sample TXT diagnostic logs
    ├── DTC_RAW_LOGS/
    │   └── dtc_raw_logs_sample.csv       # Sample CSV DTC data
    └── context_Files/                    # Sample knowledge base documents
```

---

## 5. Core Features & Functionality

### 5.1 Diagnostic Log Ingestion

DiagTrace can ingest diagnostic log files from two sources:

**A. Server Filesystem Browser**
- Browse the server's filesystem using a built-in folder explorer
- Navigate directories, use quick-access shortcuts (Project, System Drive, User Dir)
- Select a folder containing log files and click "Confirm & Analyze"

**B. Local Client Machine Upload**
- Drag-and-drop a folder from the user's local machine
- Or use the "Choose Local Folder" button (supports `webkitdirectory` multi-file selection)
- Files are uploaded via HTTP multipart to the backend for processing

**Supported Log File Formats:**

| Format | Extension | Parser Method |
|--------|-----------|--------------|
| CSV (comma or tab delimited) | `.csv`, `.txt` | `_parse_csv_content()` |
| Key-Value Text Blocks | `.txt`, `.log` | `_parse_kv_text_content()` |
| General Log Files | `.log`, `.dat` | Auto-detected |

**Parser auto-detection logic:**
1. Checks first line for CSV delimiters (`,` or `\t`)
2. Falls back to key-value block parsing (entries separated by `----------`)
3. Handles both Title Case (`Module`, `Code`) and snake_case field names

### 5.2 Diagnostic Registry Table

The main data view is a rich, paginated table showing all parsed DTC records with:

| Column | Description |
|--------|-------------|
| **File** | Source log filename |
| **Module** | ECU module (ECM, TCM, ABS, BCM, etc.) |
| **Code** | DTC code (e.g., P0300, U0100) |
| **Description** | Human-readable fault description |
| **Issue Status** | Workflow status (New / In Progress / Resolved / Closed) |
| **Comments** | Engineer notes (editable) |
| **Author** | Who last updated the record |
| **Program name** | Vehicle program / build identifier |
| **VIN Number** | Vehicle Identification Number |
| **Last Updated** | Timestamp of last modification |
| **Raw** | Raw CAN bus bytes (if available) |
| **Hex** | Hex-encoded DTC value |
| **AI Analysis** | Stored AI-generated analysis report |

**Table Features:**
- **Column header filters** — per-column search/filter dropdowns
- **Per-row editing** — click any row to open an edit modal (update Status and Comments)
- **AI Analysis per row** — click "Analyze" on any record to run AI log analysis
- **Pagination** — 20 / 50 / 100 / 250 / All rows per page
- **Global search** — search across all columns simultaneously

### 5.3 Dashboard & KPI Cards

Five executive KPI cards are shown below the main table:

| KPI | Description |
|-----|-------------|
| **Total DTC Records** | Total number of diagnostic entries in DB |
| **Unique DTCs** | Number of distinct DTC codes |
| **Active Program Modules** | Distinct ECU module types seen |
| **Open Issue Statuses** | Count of non-closed/non-resolved entries |
| **Active Modules** | Count of distinct ECU module names |

### 5.4 Summary Dashboard Charts

Four interactive charts visualize the dataset:

| Chart | Type | Description |
|-------|------|-------------|
| **Top 20 DTCs by Count** | Horizontal Bar | Most frequently occurring DTC codes |
| **Top Modules by DTC Count** | Bar Chart | Which ECU modules have the most errors |
| **Module DTC Counts by Issue Status** | Stacked Bar | Status breakdown per module |
| **DTC Distribution by Program Name** | Pie/Doughnut | Which vehicle programs are most affected |

> **Tip:** Click any chart card to expand it into a full-screen dialog for better visibility.

### 5.5 Data Export

- **Export to Excel** button generates a timestamped `.xlsx` file
- File is named: `Diagnostic_Report_YYYYMMDD_HHMMSS.xlsx`
- Exported via HTTP streaming (no temporary files stored on server)
- Contains all columns from the diagnostics table in a "Diagnostic Report" sheet

### 5.6 Deduplication & Merging

When ingesting new log files, DiagTrace automatically:
1. Loads existing records from SQLite
2. Generates a composite key: `File|Module|Code|Description|Program name|VIN Number`
3. Only inserts truly new records (no duplicates within a session or across sessions)
4. Merges the deduped set back to SQLite

### 5.7 User Authentication & Session Management

DiagTrace includes a built-in user authentication system:

- **Sign Up**: Register with Name, Username, Email, and Password
- **Sign In**: Authenticate with username or email + password
- **Sessions**: Token-based (64-char hex), stored in SQLite `sessions` table
- **Authorization**: Editing records (comments, status) requires an authenticated session
- **Password Security**: PBKDF2-HMAC-SHA256 with a random 16-byte salt, 100,000 iterations

> **Note:** Unauthenticated users can view all data and run AI analysis. Only editing requires login.

---

## 6. AI Features & Capabilities

DiagTrace has **three distinct AI-powered features**, all powered by the NVIDIA NIM API.

### 6.1 AI Root Cause Analysis (RCA) — Agentic Multi-Step Engine

**What it does:** Performs a full fleet-wide Root Cause Analysis across ALL diagnostic records in the database.

**How it works (ReAct Agentic Loop):**

```
Step 1: Load all diagnostic data from SQLite
        |
        v
Step 2: Extract features:
        - Module frequency counts
        - DTC code frequency counts
        - Issue status breakdown
        - Severity breakdown
        - Co-occurring fault clusters (events within 5-second windows)
        - Weekly trend buckets
        |
        v
Step 3: Targeted RAG retrieval (multi-query):
        - Per top DTC code: "Root cause, known issues for DTC {code}"
        - Per top module: "ECU architecture for {module} module"
        - Per co-occurring cluster: "Simultaneous faults across {modules}"
        |
        v
Step 4: Agentic LLM loop (max 4 iterations):
        - LLM receives dataset + retrieved context
        - If context is insufficient: LLM returns {"action": "search", "query": "..."}
          -> DiagTrace performs additional targeted RAG retrieval
        - When ready: LLM returns {"action": "final", "report_markdown": "..."}
        |
        v
Step 5: Return structured report with:
        - Executive Summary
        - Root Cause Hypotheses (per module/DTC)
        - Weekly Trend Analysis
        - Engineering Action Plan
```

**Co-occurrence Detection:**
- Groups records within a 5-second timestamp window
- Identifies clusters where 2+ different modules faulted simultaneously
- Flags these as candidates for shared root causes (bus/harness/gateway faults)

**Key Parameters:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| `MAX_AGENT_ITERATIONS` | 4 | Max LLM search turns before forcing final report |
| `RAG_TOP_K_PER_QUERY` | 3 | Documents retrieved per RAG query |
| `RAG_MAX_TOTAL_DOCS` | 10 | Maximum total RAG docs in context |
| `COOCCURRENCE_WINDOW_SECONDS` | 5 | Time window for fault co-occurrence |
| `temperature` | 0.1 | Near-deterministic output for consistent reports |
| `max_tokens` | 1800 | Maximum LLM output length |

---

### 6.2 Per-Entry AI Log Analysis

**What it does:** Generates a detailed diagnostic report for a **single** DTC record.

**Trigger:** Click "Analyze" on any row in the Diagnostic Registry Table.

**Process:**
1. Formulates 2-3 targeted RAG queries using the row's Code, Module, and Description
2. Runs primary vector search (60% similarity threshold)
3. If no results: fallback to lower-threshold vector search
4. If still no results: keyword-based search across the full knowledge base
5. Sends all retrieved context + the log entry to the NVIDIA LLM
6. Returns a structured 4-section markdown report:

**Report Structure:**
```markdown
### Diagnostic Overview
[2-4 sentence summary of the DTC and its significance]

### Root Cause
[Bullet-pointed root causes based on knowledge base + automotive expertise]

### How to Fix
1. **Step Title**: Detailed repair/diagnostic step
2. **Step Title**: ...
3. **Step Title**: ...

### Related Context & Sources
- **Source Name**: How this document relates to the diagnosis
```

**Storage:** The generated report is automatically saved to the `AI Analysis` column in SQLite for that record.

---

### 6.3 AI Chatbot Assistant

**What it does:** An interactive chat panel where engineers can ask free-form questions about the diagnostic data and knowledge base.

**Capabilities:**
- **Data queries**: "How many open issues are there?", "Which module has the most DTCs?"
- **Knowledge base queries**: "What is P0300?", "Explain the ABS control system"
- **Chart generation**: "Show me a bar chart of modules", "Plot the issue status distribution"
- **Analysis requests**: "What are the top failing codes?", "Summarize the current diagnostic state"

**How chart generation works:**
The chatbot detects chart-related keywords (`chart`, `plot`, `graph`, `visualize`, `bar`, `pie`, `doughnut`):
- `+ "module"` — Bar chart of top 8 modules by DTC count
- `+ "status"` or `"issue"` — Doughnut chart of issue status distribution
- Default — Bar chart of top 8 DTC codes by frequency

**RAG Integration:** Every chat query also retrieves the top 3 matching knowledge base documents and includes them in the LLM context.

---

### 6.4 Weekly AI Executive Summary

**What it does:** Generates a trend-focused executive summary for program managers (not engineers).

**Report Structure** (distinct from RCA):
- Executive Summary (2-3 sentences for a non-technical audience)
- Trend Analysis (week-over-week volume changes, rising/resolved codes)
- Notable New or Recurring Patterns
- Watch List for Next Week

**Access:** Via the "AI Summary" feature in the UI or `/api/ai/weekly-summary` endpoint.

---

### 6.5 AI-Powered RAG Document Chunking

When uploading documents to the Knowledge Base, DiagTrace uses the LLM itself for **semantic chunking**:

1. Document text is split into 3,500-character slices
2. Each slice is sent to the LLM with a chunking system prompt
3. LLM returns a JSON array of `{title, content}` objects — semantically meaningful chunks
4. If LLM chunking fails: fallback to heuristic section-heading-based chunking
5. Each chunk gets a vector embedding via NVIDIA embedding API
6. Chunks are stored in Qdrant Cloud or SQLite fallback

---

## 7. User Workflows

### Workflow 1: First-Time Setup

```
1. Clone repository
2. Copy .env.example -> .env
3. Add NVIDIA API key (get from https://build.nvidia.com)
4. Add Qdrant Cloud URL + API key (get from https://cloud.qdrant.io)
5. pip install -r requirements.txt
6. python run.py
7. Open browser at http://localhost:8000
```

### Workflow 2: Ingesting Diagnostic Logs

```
1. Click "Upload Logs" button
2. Choose source:
   A. "Server Filesystem" tab -> Browse to log folder -> "Confirm & Analyze"
   B. "Local Client Machine" tab -> Drag-drop folder or "Choose Local Folder"
3. Watch the Live Engine Output console for parsing progress
4. Table and charts automatically refresh when complete
```

### Workflow 3: Reviewing & Triaging DTCs

```
1. Use column header filters to narrow down by Module, Code, or Status
2. Click any row to open the detail panel
3. Review the DTC description and existing comments
4. (If logged in) Update Issue Status: New -> In Progress -> Resolved -> Closed
5. Add engineering comments, then click "Save Changes"
```

### Workflow 4: Running AI Root Cause Analysis

```
1. Ensure diagnostic data is loaded and knowledge base is populated
2. Click "AI Root Cause Analysis" button in the toolbar
3. Wait for the agentic engine to complete (may take 30-120 seconds)
4. View the full RCA report:
   - Executive summary
   - Per-module/DTC hypotheses  
   - Co-occurring fault analysis
   - Weekly trend data
   - Engineering action plan
5. The "Agent Search Log" shows what additional RAG queries the AI performed
```

### Workflow 5: Per-Record AI Analysis

```
1. Find the specific DTC record in the table
2. Click "Analyze" (AI Analysis button) in the row
3. Wait for the analysis (15-60 seconds)
4. View the structured 4-section report
5. Report is saved to the record in the database for future reference
```

### Workflow 6: Building the Knowledge Base

```
1. Click "Knowledge Base" button
2. To add a text document manually:
   - Enter Title, Category, and Content
   - Click "Ingest Document"
3. To upload a file (PDF, DOCX, TXT, CSV, JSON):
   - Select file and category
   - Click "Upload & Process"
   - Monitor the live ingestion progress log:
     Text extracted
     LLM Semantic Chunking...
     Embedding chunk 1/N...
     Ingestion Complete!
4. View all stored knowledge documents in the document list
```

### Workflow 7: Using the AI Chatbot

```
1. Open the chat panel
2. Type a question, e.g.:
   - "What are the top 5 DTC codes this week?"
   - "Explain U0100 and what causes it"
   - "Show me a bar chart of the modules"
   - "Are there any patterns in the ABS failures?"
3. The AI responds with:
   - Text analysis (markdown formatted)
   - Optionally: an interactive Chart.js chart
   - Source references from the knowledge base
```

### Workflow 8: Exporting Reports

```
1. Apply any filters you want in the table (optional)
2. Click "Export to Excel" button
3. File downloads as: Diagnostic_Report_YYYYMMDD_HHMMSS.xlsx
4. Open in Excel - all columns included in "Diagnostic Report" sheet
```

### Workflow 9: Configuring AI Settings

```
1. Click "Settings" in the header
2. Navigate to "AI Models & Keys"
3. Enter/update:
   - NVIDIA API Key (starts with "nvapi-")
   - NVIDIA LLM Model (default: openai/gpt-oss-20b)
   - NVIDIA Embedding Model (default: nvidia/nv-embedqa-e5-v5)
   - Qdrant URL
   - Qdrant API Key
4. Click "Test Connection" to validate all three services
5. Click "Save Settings" - settings persist to .env file
```

---

## 8. Data Model & Schema

### SQLite Database: `backend/diagnostics.db`

#### Table: `diagnostics`

| Column | Type | Description |
|--------|------|-------------|
| `index` | INTEGER PK AUTOINCREMENT | Unique row ID |
| `File` | TEXT | Source filename |
| `Module` | TEXT | ECU module name |
| `Code` | TEXT | DTC code (e.g., P0300) |
| `Description` | TEXT | Human-readable fault description |
| `Issue Status` | TEXT | Workflow state (New/In Progress/Resolved/Closed) |
| `Comments` | TEXT | Engineer notes |
| `Author` | TEXT | Last editor username |
| `Program name` | TEXT | Vehicle program/build |
| `VIN Number` | TEXT | Vehicle Identification Number |
| `Last Updated` | TEXT | ISO datetime of last modification |
| `Raw` | TEXT | Raw CAN bus bytes |
| `Hex` | TEXT | Hex DTC value |
| `AI Analysis` | TEXT | Stored AI-generated analysis report (Markdown) |

**Deduplication Key:** `File` + `Module` + `Code` + `Description` + `Program name` + `VIN Number`

#### Table: `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | User ID |
| `name` | TEXT | Display name |
| `username` | TEXT UNIQUE | Login identifier |
| `email` | TEXT UNIQUE | Email address |
| `password_hash` | TEXT | PBKDF2-SHA256 hash (hex) |
| `salt` | TEXT | Random 16-byte hex salt |
| `created_at` | TEXT | Account creation timestamp |

#### Table: `sessions`

| Column | Type | Description |
|--------|------|-------------|
| `token` | TEXT PK | 64-char random hex session token |
| `user_id` | INTEGER FK | References `users.id` |
| `created_at` | TEXT | Session creation timestamp |

#### Table: `rag_knowledge_base` (SQLite fallback for Qdrant)

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Document UUID |
| `title` | TEXT | Chunk title |
| `category` | TEXT | Knowledge category |
| `content` | TEXT | Full chunk text |
| `vector_json` | TEXT | JSON-serialized embedding vector |
| `created_at` | TEXT | Ingestion timestamp |

---

## 9. Backend API Reference

**Base URL:** `http://localhost:8000`

### Authentication Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/signup` | Register new user |
| `POST` | `/api/signin` | Authenticate and get session token |
| `POST` | `/api/signout` | Invalidate session token |
| `GET` | `/api/me` | Get current user info (requires Bearer token) |

**Authentication Header:** `Authorization: Bearer <token>` or `X-Auth-Token: <token>`

---

### Diagnostic Data Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/start-parse` | Start background log file parsing |
| `GET` | `/api/status` | Get parsing progress + logs |
| `GET` | `/api/data` | Fetch all diagnostic records from DB |
| `POST` | `/api/update-row` | Update a record's Status and Comments (auth required) |
| `GET` | `/api/export` | Download all data as Excel (.xlsx) |
| `POST` | `/api/reset` | Reset parser state |
| `GET` | `/api/browse` | Browse server filesystem directories |
| `GET` | `/api/version` | Get API version |

**POST `/api/start-parse` body:**
```json
{ "folder_path": "/path/to/logs" }
```

**POST `/api/update-row` body:**
```json
{
  "index": 42,
  "Comments": "Checked wiring harness, replacing connector",
  "Issue_Status": "In Progress"
}
```

---

### AI Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ai/rca` | Run full agentic RCA across all records |
| `POST` | `/api/analyze-log` | Run per-row AI analysis (pass row data as body) |
| `GET` | `/api/ai/weekly-summary` | Generate executive weekly trend summary |
| `POST` | `/api/ai/chat` | Send a message to the AI chatbot |

**POST `/api/ai/chat` body:**
```json
{ "message": "What are the most common DTCs this week?" }
```

---

### RAG Knowledge Base Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/rag/ingest` | Ingest a text document |
| `POST` | `/api/rag/upload-file` | Upload a file (PDF/DOCX/TXT/CSV/JSON) for background processing |
| `GET` | `/api/rag/jobs/{job_id}` | Poll background ingestion job status |
| `GET` | `/api/rag/documents` | List all stored knowledge documents |

**POST `/api/rag/ingest` body:**
```json
{
  "title": "P0300 Misfire Root Cause Guide",
  "category": "DTC Reference",
  "content": "P0300 indicates random/multiple cylinder misfire..."
}
```

---

### Settings Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings/ai` | Get current AI configuration |
| `POST` | `/api/settings/ai` | Update NVIDIA + Qdrant configuration |
| `POST` | `/api/settings/ai/test` | Test connectivity to all AI services |

---

## 10. Frontend Interface Guide

### Header Bar
- **DiagTrace logo** with version badge (v2.1.0)
- **Database status indicator** (shows if SQLite connection is active)
- **Profile button** — opens Sign In / Sign Up / Profile modal
- **Settings button** — opens AI configuration panel

### Main Toolbar (above table)
- **Upload Logs** — opens folder selection modal
- **Status toggle** — toggles the live parser output console
- **AI Root Cause Analysis** — triggers full RCA (button becomes "Stop" while running)
- **Knowledge Base** — opens RAG management panel
- **Clear Filters** — clears all column filters
- **Export to Excel** — downloads Excel report

### Live Parser Console
- Shows real-time log entries from the backend parsing engine
- Color-coded by level: `info` (blue), `success` (green), `warning` (yellow), `error` (red)
- Collapsible/expandable via the toggle button

### Diagnostic Registry Table
- Click column headers to sort
- Use the dropdown filters in each column header to filter by value
- Click a row to open the row detail/edit panel
- Paginate using Previous/Next buttons or change page size (20/50/100/250/All)

### Charts Section
- Auto-rendered when data is loaded
- Click any chart card to expand to full-screen dialog
- Charts update automatically when data changes

### Folder Explorer Modal

Two tabs:
1. **Server Filesystem** — Browse server directories; Quick Access shortcuts (Project/System/User)
2. **Local Client Machine** — Drag-and-drop or file picker for local folders

---

## 11. Configuration & Environment Setup

### `.env` File (Required)

Create a `.env` file in the project root with:

```env
# NVIDIA NIM API (Required for all AI features)
NVIDIA_API_KEY=nvapi-your-api-key-here
NVIDIA_MODEL_NAME=openai/gpt-oss-20b
NVIDIA_EMBED_MODEL=nvidia/nv-embedqa-e5-v5

# Qdrant Vector Database (Optional - SQLite fallback used if not configured)
QDRANT_URL=https://your-cluster.cloud.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
```

### Where to Get API Keys

| Service | URL | Notes |
|---------|-----|-------|
| **NVIDIA NIM** | https://build.nvidia.com | Free tier available; key starts with `nvapi-` |
| **Qdrant Cloud** | https://cloud.qdrant.io | Free 1GB cluster available |

### Runtime Settings Override

AI settings can also be changed at runtime via the Settings panel in the UI — changes are persisted back to the `.env` file automatically.

### Fallback Behavior

| Service | Unavailable? | Fallback |
|---------|-------------|---------|
| Qdrant Cloud | Not configured or unreachable | SQLite `rag_knowledge_base` table with hash-based vectors |
| NVIDIA Embedding API | Key missing/invalid | 128-dimension pseudo-embedding via SHA-256 hash |
| NVIDIA LLM API | Key missing/invalid | Error returned to frontend with helpful setup message |

---

## 12. RAG Knowledge Base System

The Knowledge Base is the "brain" that gives DiagTrace domain-specific automotive context for AI analysis, chatbot answers, and RCA hypotheses.

### What to Store

| Category | Example Content |
|----------|----------------|
| **ECU Architecture** | Module descriptions, CAN bus topology, ECM/TCM/ABS spec sheets, architecture diagrams |
| **DTC Reference** | Root cause guides, repair steps for specific DTC codes |
| **Requirements** | SRS/SDS documents with `REQ-XXX` IDs — each requirement becomes its own retrievable chunk |
| **Jira / SIMS Issues** | Known bugs, open tickets (`SIMS-XXXX`), engineering action items |
| **Test Procedures** | Step-by-step diagnostic and repair procedures |
| **Signal Matrix** | CAN signal definitions, message IDs, arbitration rules |

### Supported Upload Formats

| Format | Parsing Method | Notes |
|--------|---------------|-------|
| `.pdf` | **PyMuPDF** — structural text blocks + table extraction (Markdown) | Falls back to `pypdf` if PyMuPDF unavailable |
| `.pdf` (scanned) | **NVIDIA Llama 3.2 Vision OCR** — triggered when < 40 chars extracted per page | Auto-detected per page |
| `.pdf` (architecture category) | **NVIDIA Vision SysML Converter** — every page rendered as pixmap → SysML v2/PlantUML code | Triggered by category name |
| `.docx` | **python-docx** — paragraphs + table rows | Falls back to plain text decode |
| `.txt`, `.log`, `.md`, `.csv` | UTF-8 / UTF-8-SIG / Latin-1 / CP1252 decode (waterfall) | Encoding auto-detected |
| `.json` | `json.loads()` → `json.dumps(indent=2)` pretty-print | Structured text for RAG |
| `.png`, `.jpg`, `.jpeg`, `.webp` | **NVIDIA Llama 3.2 Vision** — OCR (general) or SysML converter (architecture category) | Base64-encoded image sent to API |

### Chunking Strategy Selection

After text extraction, `rag_engine.py` picks the chunking strategy based on file type and category:

| Condition | Strategy | Why |
|-----------|----------|-----|
| Image file **or** category contains `"architecture"` | **Single Unified Chunk** | Preserves complete SysML diagram/architectural context — splitting would lose structural relationships |
| Category contains `"requirements"` | **Logical Requirements Chunking** | Each `REQ-XXX` line → its own chunk; DTC references extracted for precise per-requirement retrieval |
| All other documents | **LLM Semantic Boundary Chunking** | Best semantic coherence; falls back to heuristic heading-based chunking if LLM call fails |

### Ingestion Pipeline

```
Upload File (bytes)  →  POST /api/rag/upload-file
      │
      ▼
Background Job assigned (job_id = "job_a3b2c1d4")
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 1 — Document Parser  (document_parser.py)                  │
│  • PDF  : PyMuPDF blocks + table Markdown  → Vision OCR/SysML   │
│  • DOCX : python-docx paragraphs + tables                       │
│  • IMG  : Base64 → NVIDIA Vision (OCR or SysML)                 │
│  • TXT/JSON : encoding-waterfall decode                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │ raw_text (str)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2 — Chunking Strategy  (rag_engine.py)                     │
│                                                                 │
│  Architecture/Image  ──►  Single unified chunk                  │
│  Requirements        ──►  One chunk per REQ-XXX line            │
│  Everything else     ──►  LLM Semantic Chunking                 │
│    • Split text into 3,500-char slices (by paragraph)           │
│    • LLM returns [{"title": ..., "content": ...}, ...]          │
│    • Fallback: heuristic section-heading split                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ chunks[]
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3 — NVIDIA Embedding API  (nvidia_client.py)               │
│  • Each chunk content  →  128-dimensional float vector          │
│  • Fallback: SHA-256 hash → pseudo-vector (SQLite fallback only)│
└───────────────────────────┬─────────────────────────────────────┘
                            │ (chunk, vector) pairs
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4 — Vector Storage  (qdrant_service.py)                    │
│                                                                 │
│  Qdrant Cloud (preferred)          SQLite fallback              │
│  Collection: diagtrace_knowledge_base  Table: rag_knowledge_base│
│  Distance: Cosine, 128-dim         vector_json: JSON array      │
└─────────────────────────────────────────────────────────────────┘

Progress tracked live in RAG_JOBS[job_id] → poll GET /api/rag/jobs/{job_id}
```

### Retrieval Strategy (used by all AI features)

The `log_analysis_engine.py` uses a **3-tier retrieval fallback** to ensure the AI always has relevant context:

| Tier | Method | Threshold | top_k |
|------|--------|-----------|-------|
| **Primary** | NVIDIA embedding → Qdrant/SQLite cosine vector search | ≥ 60% similarity | 3 |
| **Fallback 1** | Same vector search, no similarity floor | 0% (best available) | 5 |
| **Fallback 2** | Keyword substring match across all stored document content | N/A | All matching |

### Knowledge Base Management API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rag/ingest` | Ingest plain text document directly |
| `POST` | `/api/rag/upload-file` | Upload binary file (multipart); returns `job_id` |
| `GET` | `/api/rag/jobs/{job_id}` | Poll ingestion progress (`status`, `progress_percent`, `logs[]`) |
| `GET` | `/api/rag/documents` | List all stored document titles and categories |
| `GET` | `/api/rag/chunks` | Paginated chunk browser with `category` + `search` filters |
| `DELETE` | `/api/rag/chunks/{chunk_id}` | Delete a single chunk by ID |

---

## 12a. Knowledge Graph Explorer

The Knowledge Graph (`knowledge_graph.html` + `knowledge_graph.js`) is a separate interactive page that visualises DTC relationships by combining the diagnostics SQLite database with the RAG knowledge base.

### How It Works

1. **DTC Dropdown** — populated from `GET /api/knowledge-graph/dtc-list` (all unique DTC codes sorted by occurrence count)
2. **Entity Explorer** — alternative search by entity type (`module`, `vin`, `program`) via `GET /api/knowledge-graph/explore?entity_type=&entity_id=`
3. **Graph Rendering** — D3.js v7 force-directed simulation renders nodes and edges returned by the backend
4. **Info Panels** — sidebar and bottom panels show structured details from both data sources

### Backend Data Builder (`knowledge_graph_engine.py`)

For each DTC code the engine merges **two data sources**:

| Source | Fields Used |
|--------|------------|
| SQLite `diagnostics` table | Module, description, issue status, timestamps, related DTCs (same module + co-occurring on same VIN), programs, AI Analysis |
| RAG knowledge base | Root causes, system reaction, severity, components, programs affected, Jira/SIMS tickets (parsed with regex), Requirements (REQ-XXX) |

**RAG relevance matching** — a document is considered relevant to a DTC if the code appears in the document title or content, including module-prefixed variants (`ECM_P0300`, `ABS_C0045`, etc.).

### Graph Node Types

| Node `type` | Visual Style | Represents |
|-------------|-------------|------------|
| `dtc` | Severity-colored, pinned at centre (`fx=0, fy=0`) | The selected DTC code |
| `module` | Module accent colour | Owning ECU module (full name from lookup table) |
| `description` | Description accent | DTC fault description text |
| `group_node` | Group accent, shows item count | Collapsed set of programs, DTCs, modules, or VINs |
| `requirements` | Requirements accent | SRS/SDS requirements referencing this DTC |
| `related_dtc` | Muted DTC accent | Co-occurring or same-module DTCs (max 5 shown) |
| `vin` | VIN accent | Vehicle IDs (Entity Explorer mode only) |

### Graph Edge Labels (Relationships)

| Label | Meaning |
|-------|---------|
| `owned by` | DTC → Module |
| `describes` | DTC → Description node |
| `affects` | DTC → Affected Programs group |
| `specified by` | DTC → Requirements node |
| `Same Module` | DTC → Related DTC on the same ECU |
| `Co-occurring (VIN: …)` | DTC → Related DTC seen on the same vehicle |
| `has dtc` | Entity (module/VIN/program) → DTC group |
| `involves` | Entity → Module group |
| `found in` | Entity → VIN group |

### Side / Bottom Panels

| Panel | Content |
|-------|---------|
| **DTC Overview** | Code, module (full name), description, severity, status, frequency label, first seen, last seen, occurrence count |
| **Root Causes** | Bullet list extracted from RAG documents matching this DTC |
| **System Reaction** | Degradation or system response text from RAG |
| **Jira / SIMS Tickets** | Parsed ticket ID, title, status, priority, assignee |
| **Requirements** | REQ-XXX ID, title, 200-char summary |
| **Activity Timeline** | Detection events + AI analysis events sorted newest-first (max 15) |

### Expand Graph (Fullscreen Mode)

Toggle **"Expand Graph"** to switch layout:
- Graph canvas takes full available width/height
- Bottom panels (root causes, Jira, requirements) relocate into the right sidebar
- The original bottom-panel row is hidden via CSS class `kg-fullscreen-graph`
- A second `.kg-expanded-panels` div inside the sidebar becomes visible

### On-Demand AI Analysis

From the graph page the user can:
- **View existing reports** for a DTC: `GET /api/knowledge-graph/analysis/{dtc_code}` — returns AI Analysis column values from the DB plus any `saved_reports` rows whose title contains the DTC code
- **Run a new analysis**: `POST /api/knowledge-graph/analyze/{dtc_code}` — picks the first matching DB row, runs `run_log_analysis()`, saves result to the `AI Analysis` column, returns the Markdown report

---

## 13. Deployment & Running

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run the server
python run.py
# OR directly:
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Open browser
# http://localhost:8000
```

### Docker Deployment

```bash
# Build image
docker build -t diagtrace .

# Run container
docker run -p 8000:8000 --env-file .env diagtrace

# Access: http://localhost:8000
```

### Production Considerations

- Set `CORS` origins to specific domains (currently `allow_origins=["*"]`)
- Use a reverse proxy (Nginx) in front of Uvicorn for production
- Store the SQLite `diagnostics.db` on a persistent volume (if using Docker)
- Use Qdrant Cloud (not SQLite fallback) for production vector search quality
- Enable HTTPS (TLS) via reverse proxy
- Set strong session token expiration policies

---

## 14. File Format Support

### Diagnostic Log File Formats (Input)

#### CSV Format (Recommended)

Supports flexible column naming. Recognized column aliases:

| Logical Field | Accepted Column Names |
|---------------|----------------------|
| DTC Code | `Code`, `Decoded_DTC_Code`, `DTC Code`, `DTC_Code` |
| Module | `Module`, `module` |
| Program | `Program`, `Program name`, `Program_Name` |
| VIN | `VIN`, `VIN_Suffix`, `VIN Number` |
| Timestamp | `Timestamp_UTC`, `Last Updated`, `Timestamp` |
| Notes/Comments | `Notes`, `Comments` |
| Raw CAN | `Raw` |
| Hex DTC | `Hex` |

**Example CSV:**
```csv
Module,Code,Description,Program,VIN,Timestamp_UTC,Notes
ECM,P0300,Random Misfire,ProgramA,1HGCM82633A123456,2026-01-15T10:30:00Z,Misfire under load
ABS,C0045,Brake Pressure Sensor,ProgramA,1HGCM82633A123456,2026-01-15T10:30:02Z,Intermittent
```

#### Text Key-Value Format

Entries are separated by lines of `----------` (10+ dashes):

```
----------
Program: Alpha Build 1.0
VIN: 1HGCM82633A123456
Module: ECM
DTC Code: P0300
Description: Random/Multiple Cylinder Misfire Detected
Status: New
Author: John Engineer
Comments: Noticed during highway driving
[2026-01-15 10:30:00]
----------
```

### Knowledge Base Document Formats (Upload)

| Format | Parsing Method |
|--------|---------------|
| PDF | pypdf page-by-page extraction |
| DOCX | python-docx paragraphs + tables |
| TXT/MD/LOG/CSV | Plain text with encoding fallbacks |
| JSON | Pretty-printed JSON string |

---

## 15. Security & Authentication

### Password Hashing

```
PBKDF2-HMAC-SHA256
  Iterations: 100,000
  Salt: secrets.token_hex(16) - random 32-char hex per user
  Output: 64-char hex digest
```

### Session Tokens

- Generated with `secrets.token_hex(32)` — cryptographically random 64-char hex
- Stored in SQLite `sessions` table
- Transmitted as `Authorization: Bearer <token>` header
- No expiration currently implemented (manual signout required)

### API Security

- CORS is currently set to `allow_origins=["*"]` (development mode)
- Only editing endpoints (`/api/update-row`) require authentication
- All AI endpoints are publicly accessible (no auth check)
- Settings endpoints (write AI keys) are not authenticated

### Data Privacy

- Passwords are never stored in plaintext
- Session tokens are invalidated on explicit signout
- No data is sent to external services except:
  - NVIDIA NIM API (LLM prompts + embedding text)
  - Qdrant Cloud (document vectors + metadata)

---

## 16. Glossary

| Term | Definition |
|------|-----------|
| **DTC** | Diagnostic Trouble Code — standardized codes generated by vehicle ECUs to signal faults |
| **ECU** | Electronic Control Unit — a computer embedded in a vehicle system (ECM, TCM, ABS, BCM, etc.) |
| **ECM** | Engine Control Module — manages engine operations (fuel injection, ignition, emissions) |
| **TCM** | Transmission Control Module — manages gear shifting and transmission operations |
| **ABS** | Anti-lock Braking System module — manages braking safety |
| **BCM** | Body Control Module — manages lighting, windows, locks, climate |
| **CAN** | Controller Area Network — the communication bus used between ECUs |
| **VIN** | Vehicle Identification Number — unique 17-character vehicle identifier |
| **RCA** | Root Cause Analysis — systematic process to identify the underlying cause of a fault |
| **RAG** | Retrieval-Augmented Generation — AI technique that retrieves relevant documents before generating a response |
| **NIM** | NVIDIA Inference Microservices — NVIDIA's cloud API for LLM inference |
| **Qdrant** | Open-source vector database used to store and search embedding vectors |
| **Vector Embedding** | A numerical representation of text that captures semantic meaning |
| **Cosine Similarity** | A metric (0.0 to 1.0) measuring how similar two embedding vectors are |
| **Semantic Chunking** | AI-driven splitting of documents into meaningful, self-contained knowledge units |
| **ReAct** | Reasoning + Acting — an agent pattern where the LLM alternates between thinking and tool use |
| **Co-occurrence Cluster** | A group of DTCs from different modules that occurred within a short time window |
| **KPI** | Key Performance Indicator — a metric used to evaluate system health/performance |
| **WAL Mode** | Write-Ahead Logging — SQLite mode for better concurrent read/write performance |
| **PBKDF2** | Password-Based Key Derivation Function 2 — cryptographic function for password hashing |

---

## Quick Reference Card

### Essential API Endpoints

```
GET  /api/data                 -> Load all diagnostic records
POST /api/start-parse          -> Ingest log files
GET  /api/status               -> Check parsing progress
POST /api/update-row           -> Edit a record (auth required)
GET  /api/export               -> Download Excel report
POST /api/ai/rca               -> Run AI Root Cause Analysis
POST /api/analyze-log          -> Analyze a single row
POST /api/ai/chat              -> Chat with DiagTrace AI
GET  /api/ai/weekly-summary    -> Weekly executive summary
POST /api/rag/upload-file      -> Upload knowledge document
GET  /api/rag/documents        -> List knowledge base
POST /api/signup               -> Create account
POST /api/signin               -> Login
```

### Supported DTC Code Prefixes

| Prefix | System |
|--------|--------|
| **P** | Powertrain (Engine, Transmission) |
| **B** | Body (Airbags, Climate) |
| **C** | Chassis (ABS, Suspension, Steering) |
| **U** | Network Communication (CAN bus, ECU-to-ECU) |

### Built-in DTC Descriptions

DiagTrace includes descriptions for common DTCs out of the box:

| Code | Description |
|------|-------------|
| P0101 | Mass Air Flow Sensor Circuit Range/Performance |
| P0300 | Random/Multiple Cylinder Misfire Detected |
| P0420 | Catalyst System Efficiency Below Threshold |
| P0171 | System Too Lean (Bank 1) |
| P0562 | System Voltage Low |
| P0700 | Transmission Control System Malfunction |
| U0100 | Lost Communication With ECM/PCM |
| U0121 | Lost Communication With ABS Control Module |
| B0010 | Driver Frontal Airbag Deployment Control |
| B0028 | Right Side Airbag Deployment Control |
| B0100 | Electronic Front Impact Sensor |
| C0045 | Brake Pressure Sensor 'B' Malfunction |
| C1201 | ABS Control Module Engine Control System Malfunction |

---

*© 2026 DiagTrace Inc. Enterprise Vehicle Diagnostics Portal — Documentation v2.1.0*
