import unittest
import re
from pathlib import Path

PDF_PIPELINE_SOURCE = Path(__file__).resolve().parents[1] / "app" / "pdf_pipeline.py"


class PdfPipelineAsyncTests(unittest.TestCase):
    def test_pdf_ingest_offloads_blocking_steps(self):
        source = PDF_PIPELINE_SOURCE.read_text(encoding="utf-8")

        self.assertIn("import asyncio", source)
        self.assertRegex(source, r"await\s+asyncio\.to_thread\(\s*run_paddleocr")
        self.assertGreaterEqual(source.count("await asyncio.to_thread(encode_texts"), 2)
        self.assertRegex(source, r"await\s+asyncio\.to_thread\(\s*build_document_profile")
        self.assertRegex(source, r"await\s+asyncio\.to_thread\(\s*build_chapter_summary")
        self.assertIn("PADDLEOCR_CHUNK_PAGE_THRESHOLD", source)
        self.assertIn("total_pages=page_count", source)
        self.assertIn("_write_ocr_markdown_artifact", source)


if __name__ == "__main__":
    unittest.main()
