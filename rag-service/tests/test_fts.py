"""Unit tests for jieba tokenization + tsquery construction. No DB."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.fts import (  # noqa: E402
    build_tsquery,
    tokenize_for_index,
    tokenize_for_query,
)


def test_tokenize_for_index_chinese():
    text = "苏州市新能源汽车补贴政策"
    result = tokenize_for_index(text)
    assert result, "should produce non-empty token string"
    tokens = result.split()
    assert any("苏州" in t or "苏州市" in t for t in tokens)


def test_tokenize_for_index_empty():
    assert tokenize_for_index("") == ""
    assert tokenize_for_index(None) == ""


def test_tokenize_for_query_strips_stopwords():
    tokens = tokenize_for_query("我想知道苏州市的政策")
    # "我" / "想" / "的" should not appear
    assert "我" not in tokens
    assert "的" not in tokens
    assert any("苏州" in t for t in tokens)


def test_tokenize_for_query_ascii_fallback():
    tokens = tokenize_for_query("ChatGPT API key rotation")
    assert "chatgpt" in tokens or "api" in tokens


def test_build_tsquery_or():
    q = build_tsquery(["苏州", "政策"], operator="|")
    assert "|" in q
    assert "'苏州'" in q
    assert "'政策'" in q


def test_build_tsquery_empty():
    assert build_tsquery([]) == ""


def test_build_tsquery_escapes_quotes():
    q = build_tsquery(["it's"], operator="|")
    assert "''" in q  # escaped single quote
