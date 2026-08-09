import os
import unittest
from backend.document_parser import parse_document_file
from backend.rag_engine import fallback_semantic_chunking, ingest_file_document

class TestRAGFileUpload(unittest.TestCase):

    def test_01_text_document_parsing(self):
        sample_txt = (
            "ECM Control Unit Specification v4.0\n\n"
            "Section 1: Architecture\n"
            "The ECM communicates with SRS and BCM over CAN-FD bus at 500kbps speed.\n\n"
            "Section 2: Known Failures\n"
            "DTC P0300 misfire codes occur under cold weather startup conditions."
        ).encode('utf-8')
        
        parsed_text = parse_document_file("sample_ecm_spec.txt", sample_txt)
        self.assertIn("ECM Control Unit Specification", parsed_text)
        self.assertIn("Section 2: Known Failures", parsed_text)
        print("[OK] Text document parsing test passed.")

    def test_02_semantic_chunking_fallback(self):
        sample_txt = (
            "Header Title\n"
            "Section A: CAN Matrix Specs\n"
            "CAN signal ID 0x120 transmits ECM speed at 10ms intervals.\n\n"
            "Section B: Signal Diagnostics\n"
            "Termination resistor rating is 120 ohms across CAN_H and CAN_L."
        )
        chunks = fallback_semantic_chunking(sample_txt, "can_matrix.txt")
        self.assertTrue(len(chunks) > 0)
        self.assertIn("title", chunks[0])
        self.assertIn("content", chunks[0])
        print(f"[OK] Semantic chunking test passed with {len(chunks)} chunks.")

    def test_03_file_ingestion(self):
        sample_txt = (
            "BCM Body Control Module Manual\n\n"
            "Overview: Handles door locks and brake telemetry.\n"
            "Diagnostic Code C0045 indicates brake pressure sensor malfunction."
        ).encode('utf-8')
        
        res = ingest_file_document("bcm_manual.txt", sample_txt, category="System Requirements")
        self.assertEqual(res.get("status"), "success")
        self.assertTrue(res.get("total_chunks") > 0)
        print(f"[OK] File document ingestion test passed ({res['total_chunks']} chunks created).")

if __name__ == "__main__":
    unittest.main()
