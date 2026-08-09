import os
import unittest
from backend.nvidia_client import query_nvidia_llm, get_nvidia_embedding
from backend.qdrant_service import store_knowledge_item, query_rag_context, get_all_knowledge_documents
from backend.rag_engine import ingest_knowledge_document
from backend.rca_engine import run_ai_rca_analysis
from backend.chatbot_engine import process_chatbot_query

class TestAIRAGSystem(unittest.TestCase):

    def test_01_nvidia_client_error_handling(self):
        # Save current env key
        old_key = os.environ.get("NVIDIA_API_KEY", "")
        os.environ["NVIDIA_API_KEY"] = ""
        
        with self.assertRaises(RuntimeError) as ctx:
            query_nvidia_llm("Test query")
        self.assertIn("NVIDIA_API_KEY is missing", str(ctx.exception))
        
        # Restore key
        os.environ["NVIDIA_API_KEY"] = old_key
        print("[OK] NVIDIA Client explicit error handling test passed.")

    def test_02_rag_ingest_and_query(self):
        
        # Ingest custom document
        res = ingest_knowledge_document(
            title="UnitTest ECU Signal Spec",
            category="Signal Information",
            content="CAN-FD signal speed is 500kbps on ECM pin 12 with 120 ohm termination."
        )
        self.assertIn("id", res)
        
        docs = get_all_knowledge_documents()
        self.assertTrue(len(docs) > 0)
        
        query_vec = get_nvidia_embedding("CAN-FD signal speed ECM")
        hits = query_rag_context("CAN-FD signal speed ECM", query_vec, top_k=2)
        self.assertTrue(len(hits) > 0)
        print(f"[OK] RAG Ingest and Vector Query passed. Found {len(hits)} hits.")

    def test_03_ai_rca_engine(self):
        analysis = run_ai_rca_analysis()
        self.assertIn("status", analysis)
        print(f"[OK] AI RCA Analysis engine test passed (Status: {analysis['status']}).")

    def test_04_chatbot_engine(self):
        res = process_chatbot_query("Draw a chart showing Top Modules DTC breakdown")
        self.assertIn("reply_markdown", res)
        self.assertIsNotNone(res.get("chart_spec"))
        self.assertEqual(res["chart_spec"]["type"], "bar")
        print("[OK] Chatbot engine with dynamic Chart.js spec test passed.")

    def test_05_chunk_deletion(self):
        from backend.qdrant_service import delete_knowledge_chunk, get_knowledge_chunks
        # Ingest a temporary test chunk
        res = ingest_knowledge_document(
            title="Delete Test Chunk",
            category="Test Repository",
            content="This chunk will be deleted by unit test."
        )
        chunk_id = res.get("id")
        self.assertIsNotNone(chunk_id)
        
        # Verify chunk exists
        chunks_before = get_knowledge_chunks(search="Delete Test Chunk")
        self.assertTrue(any(c["id"] == chunk_id for c in chunks_before.get("chunks", [])))
        
        # Delete chunk
        del_success = delete_knowledge_chunk(chunk_id)
        self.assertTrue(del_success)
        
        # Verify chunk is gone
        chunks_after = get_knowledge_chunks(search="Delete Test Chunk")
        self.assertFalse(any(c["id"] == chunk_id for c in chunks_after.get("chunks", [])))
        print(f"[OK] Chunk deletion test passed for chunk ID: {chunk_id}")

if __name__ == "__main__":
    unittest.main()
