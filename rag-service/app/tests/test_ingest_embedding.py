import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.ingest import build_openai_embedding_kwargs, persist_ocr_document


class EmbeddingConfigTests(unittest.TestCase):
    def test_dashscope_compatible_embeddings_use_small_batches(self):
        kwargs = build_openai_embedding_kwargs(
            model="text-embedding-v4",
            api_key="test-key",
            api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )

        self.assertEqual(kwargs["embed_batch_size"], 10)
        self.assertEqual(kwargs["model"], "text-embedding-v4")
        self.assertEqual(kwargs["api_key"], "test-key")
        self.assertEqual(kwargs["api_base"], "https://dashscope.aliyuncs.com/compatible-mode/v1")


class OcrArtifactTests(unittest.TestCase):
    def test_persists_ocr_markdown_and_manifest(self):
        with TemporaryDirectory() as tmp:
            with patch("app.ingest.INGESTION_OUTPUT_ROOT", tmp):
                paths = persist_ocr_document(
                    kb_id="kb-1",
                    doc_id="doc-1",
                    file_name="standard.pdf",
                    markdown="# OCR text",
                    page_count=3,
                )

            with open(paths["document_path"], encoding="utf-8") as f:
                self.assertEqual(f.read(), "# OCR text")

            with open(paths["manifest_path"], encoding="utf-8") as f:
                manifest = f.read()
                self.assertIn('"kb_id": "kb-1"', manifest)
                self.assertIn('"doc_id": "doc-1"', manifest)
                self.assertIn('"file_name": "standard.pdf"', manifest)
                self.assertIn('"page_count": 3', manifest)


if __name__ == "__main__":
    unittest.main()
