import unittest
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
RETRIEVAL_SOURCE = APP_ROOT / "retrieval.py"
STORAGE_SOURCE = APP_ROOT / "storage.py"


class RetrievalPipelineContractTests(unittest.TestCase):
    def test_retrieval_uses_llm_rag_query_planning_contract(self):
        source = RETRIEVAL_SOURCE.read_text(encoding="utf-8")

        self.assertIn("You are a retrieval query planner for multilingual PDF search.", source)
        self.assertIn("Rewrite the following user question into a retrieval JSON plan.", source)
        self.assertIn("build_query_variants", source)
        self.assertIn("build_keyword_match_terms", source)
        self.assertIn("phrase_search_pages", source)
        self.assertIn("_search_pages_vector_variants", source)
        self.assertIn("extra_body={\"enable_thinking\": False}", source)

    def test_storage_routes_by_explicit_filename_or_alias_before_ranking(self):
        source = STORAGE_SOURCE.read_text(encoding="utf-8")

        self.assertIn("_find_explicit_document_matches", source)
        self.assertIn("_normalize_route_token", source)
        self.assertIn("title_aliases", source)
        self.assertIn("profile_status = 'done'", source)
        self.assertIn("phrase_search_pages", source)
        self.assertIn("get_page_ocr_text_map", source)


if __name__ == "__main__":
    unittest.main()
