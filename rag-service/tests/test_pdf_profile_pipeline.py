import unittest
from pathlib import Path


PDF_PIPELINE_SOURCE = Path(__file__).resolve().parents[1] / "app" / "pdf_pipeline.py"


class PdfProfilePipelineTests(unittest.TestCase):
    def test_pdf_pipeline_has_reference_style_profile_steps(self):
        source = PDF_PIPELINE_SOURCE.read_text(encoding="utf-8")

        for name in (
            "parse_profile_payload",
            "build_profile_route_text",
            "build_document_profile",
            "build_chapter_summary",
            "iter_chapter_summary_ranges",
            "validate_ocr_page_count",
        ):
            self.assertIn(f"def {name}", source)

        for field in ("summary_text", "doc_type", "keywords", "title_aliases", "chapter_summary"):
            self.assertIn(field, source)

        self.assertIn("You are a document profiler for multilingual PDF routing.", source)
        self.assertIn("你是一个文档内容分布分析助手", source)
        self.assertIn("File name:", source)
        self.assertIn("Display name:", source)
        self.assertIn("Sampled OCR text:", source)
        self.assertIn("内容分布生成被截断", source)
        self.assertIn("文档画像生成失败：模型未返回有效 JSON。", source)
        self.assertIn("display_name=display_name", source)
        self.assertNotIn("def split_page", source)
        self.assertNotIn("PAGE_CHUNK_CHAR_LIMIT", source)

    def test_pdf_pipeline_validates_ocr_page_count_before_indexing(self):
        source = PDF_PIPELINE_SOURCE.read_text(encoding="utf-8")

        self.assertIn("validate_ocr_page_count(pages, page_count)", source)
        self.assertIn("OCR page count mismatch", source)


if __name__ == "__main__":
    unittest.main()
