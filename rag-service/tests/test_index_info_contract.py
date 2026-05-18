import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class IndexInfoContractTests(unittest.TestCase):
    def test_schema_persists_reference_style_profile_fields(self):
        schema = (ROOT / "migrations" / "001_rag_schema.sql").read_text(encoding="utf-8")
        migration = (ROOT / "migrations" / "002_doc_profile_details.sql")
        extra = migration.read_text(encoding="utf-8") if migration.exists() else ""
        combined = schema + "\n" + extra

        for field in (
            "profile_status",
            "profile_detail",
            "doc_type",
            "title_aliases",
            "route_text",
            "chapter_summary",
        ):
            self.assertIn(field, combined)

    def test_rag_service_exposes_document_index_info_endpoint(self):
        routes = (ROOT / "app" / "routes.py").read_text(encoding="utf-8")
        models = (ROOT / "app" / "models.py").read_text(encoding="utf-8")
        storage = (ROOT / "app" / "storage.py").read_text(encoding="utf-8")

        self.assertIn("/knowledge-bases/{kb_id}/documents/{doc_id}/index-info", routes)
        self.assertIn("DocumentIndexInfo", models)
        self.assertIn("get_document_index_info", storage)


if __name__ == "__main__":
    unittest.main()
