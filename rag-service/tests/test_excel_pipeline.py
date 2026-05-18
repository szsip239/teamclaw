"""Unit tests for Excel parsing + chunking helpers. No DB."""

import sys
import tempfile
from pathlib import Path

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.excel_pipeline import (  # noqa: E402
    DEFAULT_EXCEL_CHUNK_OVERLAP,
    DEFAULT_EXCEL_CHUNK_SIZE,
    _detect_header_row_index,
    fixed_overlap_chunks,
    guess_excel_config,
    normalize_excel_config,
    parse_excel_preview,
)


def _write_xlsx(rows: list[list[str]]) -> str:
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    wb.save(tmp.name)
    tmp.close()
    return tmp.name


def test_detect_header_row_index_simple():
    rows = [
        ["序号", "标题", "级别", "正文"],
        ["1", "政策A", "省级", "正文A"],
        ["2", "政策B", "市级", "正文B"],
    ]
    assert _detect_header_row_index(rows) == 0


def test_detect_header_row_index_skips_title_row():
    rows = [
        ["2024 年度政策汇总"],
        ["序号", "标题", "级别", "正文"],
        ["1", "政策A", "省级", "正文A"],
    ]
    assert _detect_header_row_index(rows) == 1


def test_parse_excel_preview_basic():
    path = _write_xlsx([
        ["序号", "标题", "级别", "正文"],
        ["1", "新能源补贴", "省级", "对新能源车给予补贴"],
        ["2", "人才引进", "市级", "本科以上学历可申请"],
    ])
    preview = parse_excel_preview(path)
    assert preview["columns"] == ["序号", "标题", "级别", "正文"]
    assert preview["row_count"] == 2
    assert len(preview["sample_rows"]) == 2
    Path(path).unlink()


def test_guess_excel_config_picks_obvious_fields():
    cfg = guess_excel_config(["序号", "标题", "级别", "政策发文字号", "正文"])
    assert cfg["title_field"] == "标题"
    assert "正文" in cfg["content_fields"]
    assert "级别" in cfg["filter_fields"]
    assert "政策发文字号" in cfg["source_fields"]
    assert "序号" in cfg["ignore_fields"]


def test_normalize_rejects_unknown_field():
    columns = ["A", "B", "C"]
    try:
        normalize_excel_config(
            {"title_field": "D", "content_fields": ["C"]}, columns
        )
    except ValueError as exc:
        assert "title_field" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_normalize_requires_content_fields():
    columns = ["A", "B"]
    try:
        normalize_excel_config({"title_field": "A", "content_fields": []}, columns)
    except ValueError as exc:
        assert "content" in str(exc).lower()
    else:
        raise AssertionError("expected ValueError")


def test_fixed_overlap_chunks_short_text():
    text = "短文本，不切分"
    assert fixed_overlap_chunks(text, chunk_size=1000, overlap=100) == [text]


def test_fixed_overlap_chunks_splits_long_text():
    text = "abc" * 1000  # 3000 chars
    chunks = fixed_overlap_chunks(text, chunk_size=500, overlap=100)
    assert len(chunks) > 1
    # Overlap should be reflected
    assert all(len(c) <= 500 for c in chunks)


def test_fixed_overlap_chunks_defaults_used():
    # Sanity check defaults are sane
    assert DEFAULT_EXCEL_CHUNK_SIZE > DEFAULT_EXCEL_CHUNK_OVERLAP
