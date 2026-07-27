import io
import os
import json
from typing import Dict, Any

def parse_document_file(file_name: str, file_bytes: bytes) -> str:
    """Extracts raw text content from uploaded document files (.txt, .pdf, .docx, .csv, .json, .log, .md)."""
    ext = os.path.splitext(file_name)[1].lower()
    
    if ext in ['.pdf']:
        return extract_pdf_text(file_bytes)
    elif ext in ['.docx']:
        return extract_docx_text(file_bytes)
    elif ext in ['.json']:
        return extract_json_text(file_bytes)
    else:
        # Default text-based formats (.txt, .md, .log, .csv)
        return extract_plain_text(file_bytes)

def extract_plain_text(file_bytes: bytes) -> str:
    """Decodes plain text files with encoding fallbacks."""
    for encoding in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']:
        try:
            text = file_bytes.decode(encoding)
            return text.strip()
        except UnicodeDecodeError:
            continue
    return file_bytes.decode('utf-8', errors='ignore').strip()

def extract_pdf_text(file_bytes: bytes) -> str:
    """Extracts text page by page from PDF files using pypdf with fallback."""
    try:
        from pypdf import PdfReader
        pdf_file = io.BytesIO(file_bytes)
        reader = PdfReader(pdf_file)
        pages_text = []
        for i, page in enumerate(reader.pages):
            txt = page.extract_text()
            if txt and txt.strip():
                pages_text.append(f"--- Page {i+1} ---\n{txt.strip()}")
        if pages_text:
            return "\n\n".join(pages_text)
    except Exception as e:
        print(f"Error parsing PDF with pypdf: {e}")
        
    # Fallback to plain text decode if pypdf encounters an issue
    return extract_plain_text(file_bytes)

def extract_docx_text(file_bytes: bytes) -> str:
    """Extracts paragraphs and tables from Word (.docx) files using python-docx."""
    try:
        import docx
        docx_file = io.BytesIO(file_bytes)
        doc = docx.Document(docx_file)
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
        
        # Extract tables if present
        for table in doc.tables:
            for row in table.rows:
                row_txt = " | ".join([cell.text.strip() for cell in row.cells if cell.text.strip()])
                if row_txt:
                    paragraphs.append(row_txt)
                    
        if paragraphs:
            return "\n\n".join(paragraphs)
    except Exception as e:
        print(f"Error parsing DOCX with python-docx: {e}")
        
    return extract_plain_text(file_bytes)

def extract_json_text(file_bytes: bytes) -> str:
    """Formats JSON files into clean readable markdown/text representation."""
    try:
        text = extract_plain_text(file_bytes)
        data = json.loads(text)
        return json.dumps(data, indent=2)
    except Exception:
        return extract_plain_text(file_bytes)
