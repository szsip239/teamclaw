"""
单文档摄入所需的核心辅助函数。

Phase 1 目标：
- PDF 复用现有 OCR 输出
- DOCX 同时支持原生文本/表格提取与选页视觉补充
- 将中间产物标准化为 markdown、images 和 manifest
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import hashlib
from pathlib import Path
from typing import Iterator

from PIL import Image
import fitz

from app.pipeline_utils import list_image_filenames

try:
    from docx import Document as DocxDocumentFactory
    from docx.document import Document as DocxDocument
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P
    from docx.table import Table
    from docx.text.paragraph import Paragraph
except ImportError:  # pragma: no cover - 运行时显式报错即可
    DocxDocumentFactory = None
    DocxDocument = object
    CT_Tbl = object
    CT_P = object
    Table = object
    Paragraph = object


PAGE_MD_PATTERN = re.compile(r"page_(\d{4})(?:_raw)?\.md$")
PAGE_IMAGE_DIR_PATTERN = re.compile(r"page_(\d{4})$")
IMAGE_PAGE_PATTERN = re.compile(r"_p(\d{2,4})_")
TABLE_MARKER_RE = re.compile(r"<!--\s*table:\s*([A-Za-z0-9_]+)\s*-->")
MARKDOWN_TABLE_ALIGN_RE = re.compile(r"^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$")
HTML_TABLE_OPEN_RE = re.compile(r"<table\b[^>]*>", re.IGNORECASE)
HTML_TABLE_CLOSE_RE = re.compile(r"</table>", re.IGNORECASE)
HTML_ROW_RE = re.compile(r"<tr\b[^>]*>([\s\S]*?)</tr>", re.IGNORECASE)
HTML_CELL_RE = re.compile(r"<(th|td)\b[^>]*>([\s\S]*?)</\1>", re.IGNORECASE)


def sanitize_doc_id(source_path: str) -> str:
    stem = Path(source_path).stem.lower()
    normalized = re.sub(r"[^\w]+", "_", stem, flags=re.UNICODE).strip("_")
    if not normalized:
        digest = hashlib.sha1(stem.encode("utf-8")).hexdigest()[:8]
        normalized = f"input_{digest}"
    return f"doc_{normalized}"


def escape_markdown_cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", "<br>").strip()


def markdown_table_from_rows(rows: list[list[str]]) -> str:
    if not rows:
        return ""

    width = max(len(row) for row in rows)
    normalized_rows = [row + [""] * (width - len(row)) for row in rows]
    header = [escape_markdown_cell(cell) for cell in normalized_rows[0]]
    body = [
        [escape_markdown_cell(cell) for cell in row]
        for row in normalized_rows[1:]
    ]

    lines = [
        f"| {' | '.join(header)} |",
        f"| {' | '.join(['---'] * width)} |",
    ]
    for row in body:
        lines.append(f"| {' | '.join(row)} |")
    return "\n".join(lines)


def iter_block_items(document: DocxDocument) -> Iterator[Paragraph | Table]:
    body = document.element.body
    for child in body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def _flush_text_buffer(
    text_buffer: list[str],
    blocks: list[dict[str, object]],
    index: int,
) -> int:
    content = "\n\n".join(part for part in text_buffer if part.strip()).strip()
    if content:
        blocks.append(
            {
                "block_id": f"text_{index:04d}",
                "block_type": "text",
                "content": content,
                "origin": "native_docx",
                "page_no": None,
            }
        )
        index += 1
    text_buffer.clear()
    return index


def extract_docx_native_blocks(docx_path: str) -> list[dict[str, object]]:
    if DocxDocumentFactory is None:
        raise ImportError("请先安装 python-docx")

    document = DocxDocumentFactory(docx_path)
    blocks: list[dict[str, object]] = []
    text_buffer: list[str] = []
    block_index = 1

    for item in iter_block_items(document):
        if isinstance(item, Paragraph):
            text = item.text.strip()
            if text:
                text_buffer.append(text)
            continue

        if isinstance(item, Table):
            block_index = _flush_text_buffer(text_buffer, blocks, block_index)
            rows = [
                [cell.text.strip() for cell in row.cells]
                for row in item.rows
            ]
            table_markdown = markdown_table_from_rows(rows)
            if table_markdown:
                blocks.append(
                    {
                        "block_id": f"table_{block_index:04d}",
                        "block_type": "table",
                        "content": table_markdown,
                        "origin": "native_docx",
                        "page_no": None,
                    }
                )
                block_index += 1

    _flush_text_buffer(text_buffer, blocks, block_index)
    return blocks


def get_docx_inline_shape_count(docx_path: str) -> int:
    if DocxDocumentFactory is None:
        raise ImportError("请先安装 python-docx")
    document = DocxDocumentFactory(docx_path)
    return len(document.inline_shapes)


def build_document_markdown(text_blocks: list[dict[str, object]]) -> str:
    return "\n\n".join(
        str(block["content"]).strip()
        for block in text_blocks
        if str(block.get("content", "")).strip()
    ).strip()


def parse_page_number(name: str) -> int | None:
    page_match = PAGE_MD_PATTERN.search(name)
    if page_match:
        return int(page_match.group(1))

    dir_match = PAGE_IMAGE_DIR_PATTERN.search(name)
    if dir_match:
        return int(dir_match.group(1))

    image_match = IMAGE_PAGE_PATTERN.search(name)
    if image_match:
        return int(image_match.group(1))

    return None


def extract_pdf_page_labels(pdf_path: str) -> dict[int, str]:
    document = fitz.open(pdf_path)
    labels: dict[int, str] = {}
    try:
        for index, page in enumerate(document, start=1):
            label = ""
            if hasattr(page, "get_label"):
                label = page.get_label() or ""
            labels[index] = label or str(index)
    finally:
        document.close()
    return labels


def build_page_aware_markdown(page_blocks: list[dict[str, object]]) -> str:
    sections: list[str] = []
    for block in sorted(page_blocks, key=lambda item: item.get("page_no") or 0):
        content = str(block.get("content", "")).strip()
        if not content:
            continue
        page_no = block.get("page_no")
        page_label = str(block.get("page_label") or page_no or "")
        sections.append(
            "\n\n".join(
                [
                    f"<!-- page: {page_no} label: {page_label} -->",
                    f"## 第 {page_label} 页",
                    content,
                ]
            ).strip()
        )
    return "\n\n---\n\n".join(sections).strip()


def strip_trailing_region_metadata(markdown: str) -> str:
    patterns = (
        r"\n*```json\s*\{[\s\S]*?(?:\"regions\"|\"tables\")[\s\S]*?\}\s*```\s*$",
        r"\n*```json\s*\{[\s\S]*?(?:\"regions\"|\"tables\")[\s\S]*?\}\s*$",
    )
    stripped = markdown
    for pattern in patterns:
        candidate = re.sub(pattern, "", stripped, count=1)
        if candidate != stripped:
            return candidate.strip()
    return markdown.strip()


def strip_table_markers(markdown: str) -> str:
    return TABLE_MARKER_RE.sub("", markdown).strip()


def extract_ocr_metadata_payload(raw_markdown: str) -> dict[str, object]:
    matches = re.findall(r"```json\s*(\{[\s\S]*?\})\s*(?:```|$)", raw_markdown)
    if not matches:
        return {}

    for candidate in reversed(matches):
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and (
            "regions" in payload or "tables" in payload
        ):
            return payload
    return {}


def _normalize_page_scoped_id(raw_id: str, page_no: int, prefix: str) -> str:
    normalized = raw_id.strip()
    if not normalized:
        return normalized
    if re.match(rf"^{prefix}_p\d+_", normalized):
        return normalized
    if normalized.startswith(f"{prefix}_"):
        suffix = normalized[len(prefix) + 1 :]
        return f"{prefix}_p{page_no:02d}_{suffix}"
    return normalized


def extract_regions_from_raw_markdown(raw_markdown: str, page_no: int) -> list[dict[str, object]]:
    payload = extract_ocr_metadata_payload(raw_markdown)
    if not payload:
        return []

    regions = []
    for region in payload.get("regions", []):
        raw_region_id = str(region.get("id", "")).strip()
        if not raw_region_id:
            continue
        normalized_id = _normalize_page_scoped_id(raw_region_id, page_no, "img")
        regions.append(
            {
                "id": normalized_id,
                "caption": str(region.get("caption", "")).strip(),
                "type": str(region.get("type", "other")).strip() or "other",
                "bbox_normalized": region.get("bbox_normalized", []),
            }
        )
    return regions


def _crop_bbox_image(
    page_image_path: Path,
    output_path: Path,
    bbox_normalized: list[float],
    padding: float = 0.01,
) -> bool:
    if len(bbox_normalized) != 4:
        return False

    nx1, ny1, nx2, ny2 = [float(value) for value in bbox_normalized]
    nx1, ny1 = max(0.0, nx1 - padding), max(0.0, ny1 - padding)
    nx2, ny2 = min(1.0, nx2 + padding), min(1.0, ny2 + padding)

    with Image.open(page_image_path) as image:
        width, height = image.size
        x1, y1 = int(nx1 * width), int(ny1 * height)
        x2, y2 = int(nx2 * width), int(ny2 * height)
        if x2 <= x1 or y2 <= y1:
            return False

        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.crop((x1, y1, x2, y2)).save(output_path)
    return True


def materialize_missing_pdf_region_images(
    ocr_doc_dir: str,
    target_images_dir: str | None = None,
    padding: float = 0.01,
    page_numbers: set[int] | None = None,
) -> list[str]:
    ocr_dir = Path(ocr_doc_dir)
    page_images_dir = ocr_dir / "page_images"
    if not ocr_dir.exists() or not page_images_dir.exists():
        return []

    target_dir = Path(target_images_dir) if target_images_dir else (ocr_dir / "images")
    target_dir.mkdir(parents=True, exist_ok=True)

    created: list[str] = []
    for raw_page_path in sorted(ocr_dir.glob("page_*_raw.md")):
        page_no = parse_page_number(raw_page_path.name)
        if page_no is None:
            continue
        if page_numbers and page_no not in page_numbers:
            continue

        page_image_path = page_images_dir / f"page_{page_no:04d}.png"
        if not page_image_path.exists():
            continue

        raw_markdown = raw_page_path.read_text(encoding="utf-8")
        for region in extract_regions_from_raw_markdown(raw_markdown, page_no):
            image_id = str(region.get("id", "")).strip()
            bbox_normalized = region.get("bbox_normalized", [])
            if not image_id or not isinstance(bbox_normalized, list):
                continue

            output_path = target_dir / f"{image_id}.png"
            if output_path.exists():
                continue

            if _crop_bbox_image(
                page_image_path=page_image_path,
                output_path=output_path,
                bbox_normalized=bbox_normalized,
                padding=padding,
            ):
                created.append(str(output_path))

    return created


def extract_tables_from_raw_markdown(raw_markdown: str, page_no: int) -> list[dict[str, object]]:
    payload = extract_ocr_metadata_payload(raw_markdown)
    if not payload:
        return []

    tables = []
    for index, table in enumerate(payload.get("tables", []), start=1):
        raw_table_id = str(table.get("id", "")).strip() or f"table_{index:03d}"
        normalized_id = _normalize_page_scoped_id(raw_table_id, page_no, "table")
        raw_headers = table.get("headers", [])
        headers = [str(header).strip() for header in raw_headers if str(header).strip()]
        tables.append(
            {
                "id": normalized_id,
                "caption": str(table.get("caption", "")).strip(),
                "semantic_summary": str(table.get("semantic_summary", "")).strip(),
                "type": str(table.get("type", "simple")).strip() or "simple",
                "headers": headers,
                "continued_from_prev": bool(table.get("continued_from_prev", False)),
                "continues_to_next": bool(table.get("continues_to_next", False)),
                "bbox_normalized": table.get("bbox_normalized", []),
            }
        )
    return tables


def _is_markdown_table_start(lines: list[str], index: int) -> bool:
    if index + 1 >= len(lines):
        return False
    header = lines[index].strip()
    align = lines[index + 1].strip()
    return "|" in header and bool(MARKDOWN_TABLE_ALIGN_RE.match(align))


def _capture_html_table(lines: list[str], start: int) -> tuple[str, int]:
    depth = 0
    collected: list[str] = []
    index = start
    while index < len(lines):
        line = lines[index]
        collected.append(line)
        depth += len(HTML_TABLE_OPEN_RE.findall(line))
        depth -= len(HTML_TABLE_CLOSE_RE.findall(line))
        index += 1
        if depth <= 0 and HTML_TABLE_CLOSE_RE.search(line):
            break
    return "\n".join(collected).strip(), index


def _capture_markdown_table(lines: list[str], start: int) -> tuple[str, int]:
    collected = [lines[start], lines[start + 1]]
    index = start + 2
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped or "|" not in stripped:
            break
        collected.append(line)
        index += 1
    return "\n".join(collected).strip(), index


def extract_table_blocks_from_markdown(page_markdown: str) -> list[dict[str, str]]:
    lines = page_markdown.splitlines()
    blocks: list[dict[str, str]] = []
    pending_table_id: str | None = None
    index = 0

    while index < len(lines):
        stripped = lines[index].strip()
        marker_match = TABLE_MARKER_RE.fullmatch(stripped)
        if marker_match:
            pending_table_id = marker_match.group(1).strip()
            index += 1
            continue

        if not stripped:
            index += 1
            continue

        if stripped.lower().startswith("<table"):
            raw_table, next_index = _capture_html_table(lines, index)
            blocks.append(
                {
                    "table_id": pending_table_id or "",
                    "raw_table": raw_table,
                    "raw_format": "html",
                }
            )
            pending_table_id = None
            index = next_index
            continue

        if _is_markdown_table_start(lines, index):
            raw_table, next_index = _capture_markdown_table(lines, index)
            blocks.append(
                {
                    "table_id": pending_table_id or "",
                    "raw_table": raw_table,
                    "raw_format": "markdown",
                }
            )
            pending_table_id = None
            index = next_index
            continue

        pending_table_id = None
        index += 1

    return blocks


def _clean_table_cell_text(text: str) -> str:
    normalized = re.sub(r'<img\b[^>]*alt="([^"]*)"[^>]*>', r"[image:\1]", text, flags=re.IGNORECASE)
    normalized = re.sub(r"<br\s*/?>", " ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"</?(thead|tbody|p|span|div)\b[^>]*>", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<[^>]+>", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.replace("\\|", "|").strip()


def _parse_markdown_table_rows(raw_table: str) -> list[list[str]]:
    lines = [line.strip() for line in raw_table.splitlines() if line.strip()]
    if len(lines) < 2:
        return []

    rows: list[list[str]] = []
    for line in lines:
        if MARKDOWN_TABLE_ALIGN_RE.match(line):
            continue
        normalized = line
        if normalized.startswith("|"):
            normalized = normalized[1:]
        if normalized.endswith("|"):
            normalized = normalized[:-1]
        cells = [
            _clean_table_cell_text(cell)
            for cell in re.split(r"(?<!\\)\|", normalized)
        ]
        rows.append(cells)
    return rows


def _parse_html_table_rows(raw_table: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for row_html in HTML_ROW_RE.findall(raw_table):
        cells = [
            _clean_table_cell_text(content)
            for _, content in HTML_CELL_RE.findall(row_html)
        ]
        if cells:
            rows.append(cells)
    return rows


def _rows_from_table(raw_table: str, raw_format: str) -> list[list[str]]:
    if raw_format == "html":
        return _parse_html_table_rows(raw_table)
    return _parse_markdown_table_rows(raw_table)


def build_normalized_table_text(
    raw_table: str,
    raw_format: str,
    caption: str,
    headers: list[str],
    page_label: str,
) -> str:
    rows = _rows_from_table(raw_table, raw_format)
    normalized_headers = headers or (rows[0] if rows else [])
    data_rows = rows[1:] if len(rows) > 1 else []
    parts: list[str] = []

    if caption:
        parts.append(caption)
    parts.append(f"页码：{page_label}")
    if normalized_headers:
        parts.append(f"列={'|'.join(normalized_headers)}")
    for index, row in enumerate(data_rows[:50], start=1):
        parts.append(f"行{index}={'|'.join(row)}")

    return "；".join(part for part in parts if part)


def clean_page_text_for_context(page_markdown: str) -> str:
    text = strip_trailing_region_metadata(page_markdown)
    text = strip_table_markers(text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r'<img\s+[^>]*src="[^"]+"[^>]*>', "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def build_pdf_ocr_image_descriptions(
    ocr_doc_dir: str,
    project_root: str,
    doc_id: str,
    source_path: str,
    page_labels: dict[int, str] | None = None,
    images_dir: str | None = None,
) -> dict[str, dict[str, object]]:
    ocr_dir = Path(ocr_doc_dir)
    project_root = os.path.realpath(project_root)
    page_labels = page_labels or {}
    images_root = Path(images_dir) if images_dir else (ocr_dir / "images")
    descriptions: dict[str, dict[str, object]] = {}

    for raw_page_path in sorted(ocr_dir.glob("page_*_raw.md")):
        page_no = parse_page_number(raw_page_path.name)
        if page_no is None:
            continue

        page_md_path = ocr_dir / f"page_{page_no:04d}.md"
        page_markdown = (
            strip_trailing_region_metadata(page_md_path.read_text(encoding="utf-8"))
            if page_md_path.exists()
            else ""
        )
        page_context = clean_page_text_for_context(page_markdown)
        page_label = page_labels.get(page_no, str(page_no))
        raw_markdown = raw_page_path.read_text(encoding="utf-8")

        for region in extract_regions_from_raw_markdown(raw_markdown, page_no):
            image_filename = f"{region['id']}.png"
            image_path = images_root / image_filename
            if not image_path.exists():
                continue

            caption = str(region.get("caption", "")).strip()
            region_type = str(region.get("type", "other")).strip() or "other"
            summary = caption or f"第 {page_label} 页{region_type}"
            detail_parts = [summary]
            if region_type != "other":
                detail_parts.append(f"类型：{region_type}")
            detail_parts.append(f"页码：{page_label}")
            if page_context:
                detail_parts.append(f"所在页内容：{page_context[:160]}")

            abs_image_path = Path(os.path.realpath(image_path))
            descriptions[f"{doc_id}_{region['id']}"] = {
                "summary": summary,
                "detailed_description": "；".join(part for part in detail_parts if part),
                "nodes": [],
                "external_references": [],
                "tags": [tag for tag in [region_type, f"page_{page_label}"] if tag],
                "source_image_path": os.path.relpath(str(abs_image_path), project_root),
                "source_image_filename": image_filename,
                "doc_id": doc_id,
                "source_document_path": source_path,
                "page_no": page_no,
                "page_label": page_label,
                "origin": "pdf_ocr",
                "block_type": "image",
            }

    return descriptions


def build_pdf_ocr_table_blocks(
    ocr_doc_dir: str,
    doc_id: str,
    source_path: str,
    page_labels: dict[int, str] | None = None,
) -> list[dict[str, object]]:
    ocr_dir = Path(ocr_doc_dir)
    page_labels = page_labels or {}
    table_blocks: list[dict[str, object]] = []

    for raw_page_path in sorted(ocr_dir.glob("page_*_raw.md")):
        page_no = parse_page_number(raw_page_path.name)
        if page_no is None:
            continue

        page_md_path = ocr_dir / f"page_{page_no:04d}.md"
        if not page_md_path.exists():
            continue

        page_markdown = strip_trailing_region_metadata(
            page_md_path.read_text(encoding="utf-8")
        )
        raw_markdown = raw_page_path.read_text(encoding="utf-8")
        page_label = page_labels.get(page_no, str(page_no))

        table_defs = extract_tables_from_raw_markdown(raw_markdown, page_no)
        remaining_defs = list(table_defs)
        parsed_tables = extract_table_blocks_from_markdown(page_markdown)

        for index, parsed in enumerate(parsed_tables, start=1):
            parsed_table_id = _normalize_page_scoped_id(
                parsed.get("table_id", ""),
                page_no,
                "table",
            )
            matched_def = None
            if parsed_table_id:
                for def_index, table_def in enumerate(remaining_defs):
                    if table_def["id"] == parsed_table_id:
                        matched_def = remaining_defs.pop(def_index)
                        break
            if matched_def is None and remaining_defs:
                matched_def = remaining_defs.pop(0)

            final_table_id = (
                parsed_table_id
                or (matched_def["id"] if matched_def else f"table_p{page_no:02d}_{index:03d}")
            )
            caption = matched_def["caption"] if matched_def else ""
            semantic_summary = matched_def["semantic_summary"] if matched_def else ""
            headers = matched_def["headers"] if matched_def else []
            table_type = matched_def["type"] if matched_def else "simple"
            raw_table = parsed["raw_table"]
            raw_format = parsed["raw_format"]
            normalized_table_text = build_normalized_table_text(
                raw_table=raw_table,
                raw_format=raw_format,
                caption=caption,
                headers=headers,
                page_label=page_label,
            )
            summary = semantic_summary or caption or f"第 {page_label} 页表格"

            table_blocks.append(
                {
                    "block_id": f"{doc_id}_{final_table_id}",
                    "table_id": final_table_id,
                    "block_type": "table",
                    "summary": summary,
                    "caption": caption,
                    "semantic_summary": semantic_summary,
                    "raw_table": raw_table,
                    "raw_format": raw_format,
                    "normalized_table_text": normalized_table_text,
                    "headers": headers,
                    "table_type": table_type,
                    "continued_from_prev": matched_def["continued_from_prev"] if matched_def else False,
                    "continues_to_next": matched_def["continues_to_next"] if matched_def else False,
                    "bbox_normalized": matched_def["bbox_normalized"] if matched_def else [],
                    "origin": "pdf_ocr",
                    "doc_id": doc_id,
                    "page_no": page_no,
                    "page_label": page_label,
                    "source_path": source_path,
                }
            )

    return table_blocks


def collect_pdf_ocr_output(
    ocr_doc_dir: str,
    doc_id: str,
    source_path: str,
    page_labels: dict[int, str] | None = None,
) -> tuple[str, list[dict[str, object]], list[dict[str, object]], list[dict[str, object]]]:
    ocr_dir = Path(ocr_doc_dir)
    page_labels = page_labels or {}

    text_blocks: list[dict[str, object]] = []
    page_files = sorted(ocr_dir.glob("page_[0-9][0-9][0-9][0-9].md"))
    if not page_files:
        raise FileNotFoundError(f"未找到 OCR 生成的逐页 Markdown 文件: {ocr_doc_dir}")

    for page_file in page_files:
        page_no = parse_page_number(page_file.name)
        page_label = page_labels.get(page_no or 0, str(page_no or ""))
        page_content = strip_table_markers(
            strip_trailing_region_metadata(
                page_file.read_text(encoding="utf-8")
            )
        )
        text_blocks.append(
            {
                "block_id": f"{doc_id}_text_p{page_no:04d}" if page_no is not None else f"{doc_id}_text",
                "block_type": "text",
                "content": page_content,
                "origin": "pdf_ocr",
                "page_no": page_no,
                "page_label": page_label,
                "source_path": source_path,
            }
        )

    image_blocks: list[dict[str, object]] = []
    images_dir = ocr_dir / "images"
    if images_dir.exists():
        for image_path in sorted(images_dir.glob("*")):
            if not image_path.is_file():
                continue
            page_no = parse_page_number(image_path.name)
            image_blocks.append(
                {
                    "block_id": f"{doc_id}_{image_path.stem}",
                    "block_type": "image",
                    "image_path": str(image_path.resolve()),
                    "origin": "pdf_ocr",
                    "page_no": page_no,
                    "page_label": page_labels.get(page_no or 0, str(page_no or "")),
                    "source_path": source_path,
                }
            )

    table_blocks = build_pdf_ocr_table_blocks(
        ocr_doc_dir=ocr_doc_dir,
        doc_id=doc_id,
        source_path=source_path,
        page_labels=page_labels,
    )

    return build_page_aware_markdown(text_blocks), text_blocks, image_blocks, table_blocks


def collect_folder_ocr_output(
    ocr_output_dir: str,
    doc_id: str,
    source_path: str,
) -> tuple[str, list[dict[str, object]], list[dict[str, object]]]:
    root = Path(ocr_output_dir)
    text_blocks: list[dict[str, object]] = []
    image_blocks: list[dict[str, object]] = []
    merged_parts: list[str] = []

    page_dirs = sorted(
        (
            path for path in root.iterdir()
            if path.is_dir() and parse_page_number(path.name) is not None
        ),
        key=lambda path: parse_page_number(path.name) or 0,
    )

    for page_dir in page_dirs:
        page_no = parse_page_number(page_dir.name)
        md_path = page_dir / f"{page_dir.name}.md"
        if md_path.exists():
            content = md_path.read_text(encoding="utf-8").strip()
            if content:
                merged_parts.append(content)
                text_blocks.append(
                    {
                        "block_id": f"{doc_id}_visual_p{page_no:04d}",
                        "block_type": "text",
                        "content": content,
                        "origin": "visual_page",
                        "page_no": page_no,
                        "source_path": source_path,
                    }
                )

        images_dir = page_dir / "images"
        if images_dir.exists():
            for image_name in list_image_filenames(str(images_dir)):
                image_blocks.append(
                    {
                        "block_id": f"{doc_id}_{page_dir.name}_{Path(image_name).stem}",
                        "block_type": "image",
                        "image_path": str((images_dir / image_name).resolve()),
                        "origin": "visual_page",
                        "page_no": page_no,
                        "source_path": source_path,
                    }
                )

    return "\n\n---\n\n".join(merged_parts), text_blocks, image_blocks


def should_run_visual_parse(
    inline_image_count: int,
    visual_component_count: int,
    diagram_score: float,
    image_threshold: int = 5,
    component_threshold: int = 12,
    diagram_threshold: float = 0.18,
) -> bool:
    return (
        inline_image_count > image_threshold
        or visual_component_count >= component_threshold
        or diagram_score >= diagram_threshold
    )


def estimate_page_visual_metrics(image_path: str) -> dict[str, float]:
    with Image.open(image_path) as image:
        grayscale = image.convert("L")
        grayscale.thumbnail((240, 240))
        width, height = grayscale.size
        pixels = list(grayscale.getdata())

    binary = [1 if value < 220 else 0 for value in pixels]
    component_count = 0
    visited = set()
    active_pixels = sum(binary)

    for index, value in enumerate(binary):
        if value == 0 or index in visited:
            continue

        stack = [index]
        visited.add(index)
        size = 0

        while stack:
            current = stack.pop()
            size += 1
            x = current % width
            y = current // width
            neighbors = []
            if x > 0:
                neighbors.append(current - 1)
            if x + 1 < width:
                neighbors.append(current + 1)
            if y > 0:
                neighbors.append(current - width)
            if y + 1 < height:
                neighbors.append(current + width)

            for neighbor in neighbors:
                if binary[neighbor] == 1 and neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)

        if size >= 6:
            component_count += 1

    dark_ratio = active_pixels / max(len(binary), 1)
    diagram_score = min(1.0, component_count / 40.0 + dark_ratio)
    return {
        "component_count": float(component_count),
        "diagram_score": float(diagram_score),
        "dark_ratio": float(dark_ratio),
    }


def render_docx_to_pdf(docx_path: str, output_dir: str) -> str:
    os.makedirs(output_dir, exist_ok=True)
    command = [
        "soffice",
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        output_dir,
        docx_path,
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise RuntimeError("未找到 soffice，请先安装 LibreOffice。") from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or exc.stdout or "").strip()
        raise RuntimeError(f"DOCX 转 PDF 失败: {stderr}") from exc

    pdf_path = os.path.join(output_dir, f"{Path(docx_path).stem}.pdf")
    if not os.path.exists(pdf_path):
        raise RuntimeError(f"DOCX 转 PDF 失败，未生成文件: {pdf_path}")
    return pdf_path


def render_pdf_to_images(pdf_path: str, output_dir: str, dpi: int = 200) -> list[str]:
    os.makedirs(output_dir, exist_ok=True)
    document = fitz.open(pdf_path)
    image_paths: list[str] = []
    matrix = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    try:
        for index, page in enumerate(document, start=1):
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            image_path = os.path.join(output_dir, f"page_{index:04d}.png")
            pixmap.save(image_path)
            image_paths.append(image_path)
    finally:
        document.close()

    return image_paths


def copy_images_to_standard_dir(image_blocks: list[dict[str, object]], target_dir: str) -> list[dict[str, object]]:
    os.makedirs(target_dir, exist_ok=True)
    normalized_blocks: list[dict[str, object]] = []
    seen_names: dict[str, int] = {}

    for block in image_blocks:
        source_image_path = str(block["image_path"])
        filename = os.path.basename(source_image_path)
        count = seen_names.get(filename, 0)
        seen_names[filename] = count + 1
        if count:
            stem = Path(filename).stem
            suffix = Path(filename).suffix
            filename = f"{stem}_{count}{suffix}"
        destination = os.path.join(target_dir, filename)
        shutil.copy2(source_image_path, destination)

        normalized = dict(block)
        normalized["image_path"] = os.path.abspath(destination)
        normalized_blocks.append(normalized)

    return normalized_blocks


def write_manifest(
    manifest_path: str,
    doc_id: str,
    source_path: str,
    document_markdown_path: str,
    text_blocks: list[dict[str, object]],
    image_blocks: list[dict[str, object]],
    table_blocks: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    manifest = {
        "doc_id": doc_id,
        "source_path": os.path.abspath(source_path),
        "document_markdown_path": os.path.abspath(document_markdown_path),
        "text_blocks": text_blocks,
        "image_blocks": image_blocks,
        "table_blocks": table_blocks or [],
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return manifest
