import unittest
from pathlib import Path

EMBEDDING_SOURCE = Path(__file__).resolve().parents[1] / "app" / "embedding.py"


class EmbeddingBatchTests(unittest.TestCase):
    def test_embedding_batch_size_respects_dashscope_limit(self):
        source = EMBEDDING_SOURCE.read_text(encoding="utf-8")
        self.assertIn("EMBED_BATCH_SIZE", source)
        self.assertIn("SILICONFLOW_EMBEDDING_BATCH_SIZE", source)
        self.assertIn(",\n    10,\n)", source)


if __name__ == "__main__":
    unittest.main()
