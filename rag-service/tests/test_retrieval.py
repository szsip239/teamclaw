"""Unit tests for retrieval-layer helpers. No DB."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.retrieval import (  # noqa: E402
    _build_excel_text_block,
    _deprioritize_toc_pages,
    _rrf_merge,
    _select_pages_for_answer,
    _sse,
    _to_sources,
    extract_cross_reference_queries,
    is_reference_target_page,
    is_toc_like_page,
)


def test_rrf_merge_combines_sources():
    fts = [{"id": 1, "text": "A"}, {"id": 2, "text": "B"}]
    vec = [{"id": 2, "text": "B"}, {"id": 3, "text": "C"}]
    merged = _rrf_merge([("fts", fts), ("vector", vec)], id_key="id")
    # id=2 is in both → should rank first
    assert merged[0]["id"] == 2
    assert "fts" in merged[0]["retrieval_sources"]
    assert "vector" in merged[0]["retrieval_sources"]
    # All 3 unique ids present
    assert {r["id"] for r in merged} == {1, 2, 3}


def test_rrf_merge_empty():
    assert _rrf_merge([], id_key="id") == []
    assert _rrf_merge([("fts", []), ("vector", [])], id_key="id") == []


def test_to_sources_page_hit_uses_display_page():
    page_hits = [{
        "id": 1, "doc_id": "d1", "page_index": 5,
        "text": "hello", "score": 0.9,
        "metadata": {"display_page": 6, "chunk_in_page": 0},
        "retrieval_sources": ["fts"],
    }]
    out = _to_sources(page_hits, [])
    assert len(out) == 1
    assert out[0]["source_type"] == "text"
    assert out[0]["metadata"]["page_index"] == 6
    assert out[0]["metadata"]["retrieval_sources"] == ["fts"]


def test_to_sources_excel_hit_carries_title_and_row():
    excel_hits = [{
        "chunk_id": 10, "policy_id": 1, "doc_id": "d2",
        "chunk_index": 1, "chunk_text": "x" * 100,
        "title": "政策A", "source_row": 5,
        "metadata": {"级别": "省级"},
        "retrieval_sources": ["vector"],
    }]
    out = _to_sources([], excel_hits)
    assert len(out) == 1
    assert out[0]["source_type"] == "table"
    assert out[0]["metadata"]["title"] == "政策A"
    assert out[0]["metadata"]["source_row"] == 5
    assert out[0]["metadata"]["policy_metadata"]["级别"] == "省级"


def test_excel_text_block_formats_metadata():
    excel_hits = [{
        "title": "政策X", "source_row": 7,
        "chunk_text": "申报条件如下…",
        "metadata": {"级别": "省级", "类型": "补贴"},
    }]
    block = _build_excel_text_block(excel_hits)
    assert "政策X" in block
    assert "来源行 7" in block
    assert "级别: 省级" in block
    assert "申报条件如下" in block


def test_select_pages_caps_per_doc_in_multi_doc_mode():
    hits = []
    # Doc A: 10 hits → should be capped by MULTI_DOC_PER_DOC_PAGE_LIMIT (6)
    for page in range(1, 11):
        hits.append({"doc_id": "A", "page_index": page})
    # Doc B: 3 hits → all kept
    for page in range(1, 4):
        hits.append({"doc_id": "B", "page_index": page})
    selected = _select_pages_for_answer(hits)
    by_doc: dict[str, int] = {}
    for doc_id, _ in selected:
        by_doc[doc_id] = by_doc.get(doc_id, 0) + 1
    assert by_doc["A"] <= 6
    assert by_doc["B"] == 3


def test_select_pages_single_doc_uses_higher_cap():
    hits = [{"doc_id": "A", "page_index": p} for p in range(1, 25)]
    selected = _select_pages_for_answer(hits)
    # MULTI_DOC_SINGLE_DOC_PAGE_LIMIT defaults to 30, MULTI_DOC_TOTAL_PAGE_BUDGET to 15.
    # Selection is bounded by max(budget, per_doc_limit) = 30.
    assert 15 <= len(selected) <= 30
    assert all(doc_id == "A" for doc_id, _ in selected)


def test_extract_cross_reference_queries_picks_up_attachments():
    text = "Refer to Attachment 1A and the NCR Report (Appendix 4) for details."
    queries = extract_cross_reference_queries(text)
    upper = [q.upper() for q in queries]
    assert any("ATTACHMENT 1A" in q for q in upper)
    assert any("APPENDIX 4" in q for q in upper)


def test_toc_and_reference_target_detection():
    toc_text = "Table of Contents .... Appendix 1 ... Appendix 2 ... Appendix 3 ..."
    body_text = "ATTACHMENT 1A — Inspection Procedure. This document describes…"
    assert is_toc_like_page(toc_text) is True
    assert is_reference_target_page(body_text) is True
    assert is_reference_target_page(toc_text) is False


def test_deprioritize_pushes_toc_to_back():
    hits = [
        {"id": 1, "text": "Table of Contents .... Appendix 1 ... Appendix 2 ... Appendix 3 ..."},
        {"id": 2, "text": "Real body text about the topic"},
    ]
    out = _deprioritize_toc_pages(hits)
    assert out[0]["id"] == 2
    assert out[-1]["id"] == 1


def test_sse_format():
    bytes_ = _sse("done", {"finished": True})
    text = bytes_.decode("utf-8")
    assert text.startswith("event: done\n")
    assert "data: " in text
    assert text.endswith("\n\n")
