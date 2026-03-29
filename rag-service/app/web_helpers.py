from __future__ import annotations

import os
import re
from html import escape
from typing import Any
from urllib.parse import quote

from app.document_ingestion import materialize_missing_pdf_region_images
from app.pipeline_utils import project_root_from_file


PROJECT_ROOT = project_root_from_file(__file__)
ARTIFACTS_ROOT = os.path.join(PROJECT_ROOT, "complex_document_rag", "ingestion_output")


def build_artifact_url(path: str, artifacts_root: str = ARTIFACTS_ROOT) -> str:
    """将 ingestion_output 下的绝对路径转换成可供前端访问的静态 URL。"""
    if not path:
        return ""

    abs_path = os.path.abspath(path)
    abs_root = os.path.abspath(artifacts_root)

    try:
        rel_path = os.path.relpath(abs_path, abs_root)
    except ValueError:
        return ""

    if rel_path.startswith(".."):
        return ""

    return f"/artifacts/{quote(rel_path.replace(os.sep, '/'))}"


def _node_kind(metadata: dict[str, Any]) -> str:
    node_type = metadata.get("type", "")
    block_type = metadata.get("block_type", "")

    if node_type == "image_description" or block_type == "image":
        return "image"
    if node_type == "table_block" or block_type == "table":
        return "table"
    return "text"


BBOX_SRC_RE = re.compile(r"^bbox://", re.IGNORECASE)
HTML_IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
MARKDOWN_TABLE_ALIGN_RE = re.compile(r"^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$")


def _find_ocr_doc_dir(doc_root: str) -> str:
    raw_ocr_root = os.path.join(doc_root, "raw_pdf_ocr")
    if not os.path.isdir(raw_ocr_root):
        return ""

    for name in sorted(os.listdir(raw_ocr_root)):
        candidate = os.path.join(raw_ocr_root, name)
        if os.path.isdir(candidate):
            return candidate
    return ""


def _resolve_table_image_url(
    src: str,
    alt: str,
    doc_id: str,
    page_no: int | None,
    artifacts_root: str,
) -> str:
    normalized_src = src.strip()
    if not normalized_src or not doc_id:
        return ""

    if normalized_src.startswith("images/"):
        return f"/artifacts/{quote(doc_id)}/{normalized_src}"

    if not BBOX_SRC_RE.match(normalized_src) or not alt:
        return normalized_src

    doc_root = os.path.join(artifacts_root, doc_id)
    target_image_path = os.path.join(doc_root, "images", f"{alt}.png")
    if not os.path.exists(target_image_path):
        ocr_doc_dir = _find_ocr_doc_dir(doc_root)
        if ocr_doc_dir:
            page_numbers = {int(page_no)} if page_no is not None else None
            materialize_missing_pdf_region_images(
                ocr_doc_dir=ocr_doc_dir,
                target_images_dir=os.path.join(doc_root, "images"),
                page_numbers=page_numbers,
            )

    if os.path.exists(target_image_path):
        return build_artifact_url(target_image_path, artifacts_root=artifacts_root)
    return ""


def normalize_table_asset_paths(
    raw_table: str,
    raw_format: str,
    doc_id: str,
    page_no: int | None = None,
    artifacts_root: str = ARTIFACTS_ROOT,
) -> str:
    """将表格中的相对图片路径重写为可访问的 artifacts URL。"""
    if not raw_table or not doc_id:
        return raw_table

    def replace_markdown(match: re.Match[str]) -> str:
        alt = match.group(1)
        src = match.group(2)
        normalized_src = _resolve_table_image_url(
            src=src,
            alt=alt,
            doc_id=doc_id,
            page_no=page_no,
            artifacts_root=artifacts_root,
        )
        if not normalized_src:
            return alt or ""
        return f"![{alt}]({normalized_src})"

    def replace_html(match: re.Match[str]) -> str:
        tag = match.group(0)
        src_match = re.search(r'''src=(["'])([^"']+)\1''', tag, flags=re.IGNORECASE)
        alt_match = re.search(r'''alt=(["'])([^"']*)\1''', tag, flags=re.IGNORECASE)
        if not src_match:
            return tag

        alt = alt_match.group(2) if alt_match else ""
        normalized_src = _resolve_table_image_url(
            src=src_match.group(2),
            alt=alt,
            doc_id=doc_id,
            page_no=page_no,
            artifacts_root=artifacts_root,
        )
        if not normalized_src:
            return alt or ""
        return re.sub(
            r'''src=(["'])([^"']+)\1''',
            f'src="{normalized_src}"',
            tag,
            count=1,
            flags=re.IGNORECASE,
        )

    normalized = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", replace_markdown, raw_table)
    if (raw_format or "").lower() == "html":
        normalized = HTML_IMG_TAG_RE.sub(replace_html, normalized)
    return normalized


def _render_inline_markdown(text: str) -> str:
    escaped = escape(text or "")
    escaped = escaped.replace("&lt;br&gt;", "<br>").replace("&lt;br/&gt;", "<br>").replace("&lt;br /&gt;", "<br>")
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    return escaped


def _is_markdown_table_start(lines: list[str], index: int) -> bool:
    if index + 1 >= len(lines):
        return False
    return "|" in lines[index] and bool(MARKDOWN_TABLE_ALIGN_RE.match(lines[index + 1].strip()))


def _split_markdown_row(line: str) -> list[str]:
    stripped = line.strip().strip("|")
    return [cell.strip() for cell in stripped.split("|")]


def _render_markdown_table_block(lines: list[str]) -> str:
    rows = [_split_markdown_row(line) for line in lines if line.strip()]
    if len(rows) < 2:
        return f"<p>{_render_inline_markdown(' '.join(lines))}</p>"

    header = rows[0]
    body = rows[2:]
    head_html = "".join(f"<th>{_render_inline_markdown(cell)}</th>" for cell in header)
    body_html = "".join(
        "<tr>" + "".join(f"<td>{_render_inline_markdown(cell)}</td>" for cell in row) + "</tr>"
        for row in body
    )
    return f"<table><thead><tr>{head_html}</tr></thead><tbody>{body_html}</tbody></table>"


def render_answer_markdown_html(markdown: str) -> str:
    text = (markdown or "").strip()
    if not text:
        return "<p>本次未生成回答，请展开下方证据面板查看召回结果。</p>"

    lines = text.splitlines()
    parts: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index].rstrip()
        stripped = line.strip()
        if not stripped:
            index += 1
            continue

        if _is_markdown_table_start(lines, index):
            table_lines = [lines[index], lines[index + 1]]
            index += 2
            while index < len(lines) and "|" in lines[index]:
                table_lines.append(lines[index])
                index += 1
            parts.append(_render_markdown_table_block(table_lines))
            continue

        if re.match(r"^#{1,3}\s+", stripped):
            heading = re.sub(r"^#{1,3}\s+", "", stripped)
            parts.append(f"<h3>{_render_inline_markdown(heading)}</h3>")
            index += 1
            continue

        if re.match(r"^[-*]\s+", stripped):
            items = []
            while index < len(lines) and re.match(r"^[-*]\s+", lines[index].strip()):
                items.append(re.sub(r"^[-*]\s+", "", lines[index].strip()))
                index += 1
            parts.append("<ul>" + "".join(f"<li>{_render_inline_markdown(item)}</li>" for item in items) + "</ul>")
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while index < len(lines) and re.match(r"^\d+\.\s+", lines[index].strip()):
                items.append(re.sub(r"^\d+\.\s+", "", lines[index].strip()))
                index += 1
            parts.append("<ol>" + "".join(f"<li>{_render_inline_markdown(item)}</li>" for item in items) + "</ol>")
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate:
                index += 1
                break
            if _is_markdown_table_start(lines, index):
                break
            if re.match(r"^(#{1,3}\s+|[-*]\s+|\d+\.\s+)", candidate):
                break
            paragraph_lines.append(candidate)
            index += 1
        parts.append(f"<p>{_render_inline_markdown(' '.join(paragraph_lines))}</p>")

    return "".join(parts)


def serialize_scored_node(node: Any, artifacts_root: str = ARTIFACTS_ROOT) -> dict[str, Any]:
    metadata = getattr(node, "metadata", {}) or {}
    text = getattr(node, "text", "") or ""
    score = getattr(node, "score", 0.0) or 0.0
    kind = _node_kind(metadata)

    base_payload = {
        "kind": kind,
        "score": round(float(score), 4),
        "doc_id": metadata.get("doc_id", ""),
        "page_no": metadata.get("page_no"),
        "page_label": metadata.get("page_label", ""),
        "source_path": metadata.get("source_path", ""),
        "summary": metadata.get("summary", ""),
    }

    if kind == "image":
        image_path = metadata.get("image_path", "") or metadata.get("source_image_path", "")
        return {
            **base_payload,
            "image_id": metadata.get("image_id", ""),
            "image_path": image_path,
            "image_url": build_artifact_url(image_path, artifacts_root=artifacts_root),
            "summary": metadata.get("summary", "") or text[:140],
        }

    if kind == "table":
        raw_format = metadata.get("raw_format", "markdown")
        raw_table = normalize_table_asset_paths(
            metadata.get("raw_table", ""),
            raw_format,
            metadata.get("doc_id", ""),
            page_no=metadata.get("page_no"),
            artifacts_root=artifacts_root,
        )
        return {
            **base_payload,
            "table_id": metadata.get("table_id", ""),
            "caption": metadata.get("caption", ""),
            "semantic_summary": metadata.get("semantic_summary", "") or metadata.get("summary", ""),
            "headers": metadata.get("headers", []),
            "raw_table": raw_table,
            "raw_format": raw_format,
            "normalized_table_text": metadata.get("normalized_table_text", ""),
            "summary": metadata.get("semantic_summary", "") or metadata.get("summary", "") or metadata.get("caption", ""),
        }

    return {
        **base_payload,
        "text": text,
        "snippet": text[:240].replace("\n", " "),
        "block_id": metadata.get("block_id", ""),
    }


def serialize_retrieval_bundle(retrieval: dict[str, list[Any]], artifacts_root: str = ARTIFACTS_ROOT) -> dict[str, list[dict[str, Any]]]:
    return {
        "text_results": [
            serialize_scored_node(node, artifacts_root=artifacts_root)
            for node in retrieval.get("text_results", [])
        ],
        "image_results": [
            serialize_scored_node(node, artifacts_root=artifacts_root)
            for node in retrieval.get("image_results", [])
        ],
        "table_results": [
            serialize_scored_node(node, artifacts_root=artifacts_root)
            for node in retrieval.get("table_results", [])
        ],
    }


def serialize_answer_sources(source_nodes: list[Any], artifacts_root: str = ARTIFACTS_ROOT) -> list[dict[str, Any]]:
    return [
        serialize_scored_node(node, artifacts_root=artifacts_root)
        for node in source_nodes
    ]
