"""
PDF ingestion pipeline (PaddleOCR + per-page hybrid index).

Replaces the LlamaIndex-based ingestion in app/ingest.py. The OCR call
itself is kept (PaddleOCR cloud API), but the result is now parsed
page-by-page so each page becomes a first-class indexable unit with its
own FTS tokens + dense vector. A short LLM-generated summary + keyword
list is written to rag.doc_profile to power multi-doc routing.

Progress callback is supplied by the caller (ingest job tracker).
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import math
import shutil
import tempfile
import time
from pathlib import Path
from typing import Callable

import fitz  # PyMuPDF
import requests
from PIL import Image

from app.config import (
    DOCUMENT_CHAPTER_SUMMARY_CHUNK_SIZE,
    DOCUMENT_CHAPTER_SUMMARY_MAX_TOKENS,
    DOCUMENT_PROFILE_MAX_TOKENS,
    INGESTION_OUTPUT_ROOT,
    LLM_RENDER_JPEG_QUALITY,
    LLM_RENDER_MAX_PIXELS,
    PADDLEOCR_CHUNK_PAGE_THRESHOLD,
    PADDLEOCR_CHUNK_SIZE,
    PADDLEOCR_JOB_TIMEOUT,
    PADDLEOCR_JOB_URL,
    PADDLEOCR_POLL_INTERVAL,
    PADDLEOCR_RETRY_ATTEMPTS,
    PADDLEOCR_RETRY_BACKOFF,
    PADDLEOCR_STALL_TIMEOUT,
    UPLOAD_RENDER_DPI,
    UPLOAD_RENDER_JPEG_QUALITY,
    UPLOAD_RENDER_MAX_PIXELS,
    RequestCredentials,
)
from app.embedding import build_llm_client, encode_texts
from app.fts import tokenize_for_index
from app.storage import upsert_doc_profile, upsert_page_ocr

logger = logging.getLogger(__name__)

ProgressCb = Callable[[float, str], None]


def get_pdf_page_count(file_path: str) -> int:
    doc = fitz.open(file_path)
    try:
        return len(doc)
    finally:
        doc.close()


# ── PDF page rendering (vision-LLM payload) ──────────────────────────
#
# Ports llm-rag/pdf_qa.py page-render helpers. Pages are rendered as
# JPEGs to {artifact_dir}/pages/page-NNNN.jpg at ingest time. The chat
# pipeline loads only the pages that survived retrieval and re-encodes
# them at LLM_RENDER_* settings (smaller payload than the on-disk copy).

def _resize_image_if_needed(img: Image.Image, max_pixels: int | None) -> Image.Image:
    if not max_pixels:
        return img
    w, h = img.size
    if w * h <= max_pixels:
        return img
    scale = math.sqrt(max_pixels / (w * h))
    return img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)


def _pil_to_jpeg_bytes(img: Image.Image, jpeg_quality: int) -> bytes:
    if img.mode != "RGB":
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
    return buf.getvalue()


def render_pdf_to_jpegs(
    pdf_path: str | Path,
    output_dir: str | Path,
    *,
    dpi: int = UPLOAD_RENDER_DPI,
    max_pixels: int | None = UPLOAD_RENDER_MAX_PIXELS,
    jpeg_quality: int = UPLOAD_RENDER_JPEG_QUALITY,
) -> list[Path]:
    """Render every PDF page as page-NNNN.jpg under output_dir. Synchronous."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    try:
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        result: list[Path] = []
        for page_index in range(len(doc)):
            page = doc.load_page(page_index)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img = _resize_image_if_needed(img, max_pixels)
            target = out / f"page-{page_index + 1:04d}.jpg"
            target.write_bytes(_pil_to_jpeg_bytes(img, jpeg_quality))
            result.append(target)
        return result
    finally:
        doc.close()


def _llm_image_cache_dir(render_dir: Path, max_pixels: int | None, jpeg_quality: int) -> Path:
    label = str(max_pixels) if max_pixels else "orig"
    return render_dir / f"_llm_{label}_{jpeg_quality}"


def _ensure_llm_optimized_jpeg(
    source_path: Path,
    cache_dir: Path,
    max_pixels: int | None,
    jpeg_quality: int,
) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / source_path.name
    if target.exists() and target.stat().st_mtime >= source_path.stat().st_mtime:
        return target
    with Image.open(source_path) as img:
        img.load()
        optimized = _resize_image_if_needed(img, max_pixels)
        target.write_bytes(_pil_to_jpeg_bytes(optimized, jpeg_quality))
    return target


def load_selected_page_data_urls(
    render_dir: str | Path,
    page_numbers: list[int],
    *,
    max_pixels: int | None = LLM_RENDER_MAX_PIXELS,
    jpeg_quality: int = LLM_RENDER_JPEG_QUALITY,
) -> list[tuple[int, str]]:
    """Load the given pages as base64 data URLs.

    Self-healing: if the render directory is empty but the parent has
    source.pdf (i.e. the doc was indexed before the render step existed),
    render every page once and cache it. Subsequent calls use the cache.
    """
    render_path = Path(render_dir)
    if not render_path.exists() or not any(render_path.glob("page-*.jpg")):
        source_pdf = render_path.parent / "source.pdf"
        if source_pdf.exists():
            try:
                render_pdf_to_jpegs(source_pdf, render_path)
                logger.info("backfilled page renders for %s", source_pdf)
            except Exception as exc:
                logger.warning("failed to backfill renders for %s: %s", source_pdf, exc)
                return []
        else:
            return []

    cache_dir = _llm_image_cache_dir(render_path, max_pixels, jpeg_quality)
    result: list[tuple[int, str]] = []
    for page_num in page_numbers:
        image_path = render_path / f"page-{page_num:04d}.jpg"
        if not image_path.exists():
            continue
        optimized = _ensure_llm_optimized_jpeg(image_path, cache_dir, max_pixels, jpeg_quality)
        b64 = base64.b64encode(optimized.read_bytes()).decode("utf-8")
        result.append((page_num, f"data:image/jpeg;base64,{b64}"))
    return result


def render_dir_for(kb_id: str, doc_id: str) -> Path:
    return Path(INGESTION_OUTPUT_ROOT) / kb_id / doc_id / "pages"


def run_paddleocr(
    file_path: str,
    *,
    token: str,
    model: str,
    progress: ProgressCb,
    total_pages: int | None = None,
) -> list[str]:
    if total_pages and total_pages > PADDLEOCR_CHUNK_PAGE_THRESHOLD:
        return _run_paddleocr_chunks(
            file_path,
            token=token,
            model=model,
            total_pages=total_pages,
            progress=progress,
        )
    return _run_paddleocr_job_with_retries(
        file_path,
        token=token,
        model=model,
        progress=progress,
        label="whole document OCR",
    )


def _run_paddleocr_job(
    file_path: str,
    *,
    token: str,
    model: str,
    progress: ProgressCb,
) -> list[str]:
    """Submit PDF to PaddleOCR cloud API and return a list of per-page markdown.

    Polls until the job is done or fails. Progress reported in [10, 60].
    """
    if not token:
        raise RuntimeError("PaddleOCR token not configured")

    headers = {"Authorization": f"bearer {token}"}
    data = {
        "model": model,
        "optionalPayload": json.dumps({
            "markdownIgnoreLabels": [],
            "useDocOrientationClassify": False,
            "useDocUnwarping": False,
            "useTextlineOrientation": False,
            "textDetLimitType": "min",
            "textDetLimitSideLen": 64,
            "textDetThresh": 0.3,
            "textDetBoxThresh": 0.6,
            "textDetUnclipRatio": 1.5,
            "textRecScoreThresh": 0,
            "parseLanguage": "default",
        }),
    }

    progress(10.0, f"submitting to PaddleOCR (model={model})")
    with open(file_path, "rb") as f:
        files = {"file": f}
        resp = requests.post(PADDLEOCR_JOB_URL, headers=headers, data=data, files=files)
    if resp.status_code != 200:
        raise RuntimeError(f"PaddleOCR submit failed: {resp.status_code} {resp.text[:300]}")
    ocr_job_id = resp.json()["data"]["jobId"]
    progress(15.0, f"PaddleOCR job {ocr_job_id}")

    jsonl_url = ""
    started_at = time.monotonic()
    last_progress_at = started_at
    last_extracted_pages = -1
    while True:
        if time.monotonic() - started_at > PADDLEOCR_JOB_TIMEOUT:
            raise RuntimeError(f"PaddleOCR timed out after {PADDLEOCR_JOB_TIMEOUT}s")

        time.sleep(PADDLEOCR_POLL_INTERVAL)
        jr = requests.get(f"{PADDLEOCR_JOB_URL}/{ocr_job_id}", headers=headers)
        if jr.status_code != 200:
            continue
        body = jr.json()["data"]
        state = body["state"]
        if state == "running":
            try:
                p = body["extractProgress"]
                extracted_pages = int(p["extractedPages"])
                total = int(p["totalPages"])
                if extracted_pages > last_extracted_pages:
                    last_extracted_pages = extracted_pages
                    last_progress_at = time.monotonic()
                if time.monotonic() - last_progress_at > PADDLEOCR_STALL_TIMEOUT:
                    raise RuntimeError(
                        "PaddleOCR stalled: "
                        f"{extracted_pages}/{total or '?'} pages for {PADDLEOCR_STALL_TIMEOUT}s"
                    )
                pct = 15 + int(40 * extracted_pages / max(total, 1))
                progress(min(pct, 55), f"OCR: {extracted_pages}/{total} pages")
            except KeyError:
                pass
        elif state == "done":
            jsonl_url = body["resultUrl"]["jsonUrl"]
            break
        elif state == "failed":
            err = body.get("errorMsg", "Unknown")
            raise RuntimeError(f"PaddleOCR failed: {err}")
    if not jsonl_url:
        raise RuntimeError("PaddleOCR timed out")

    progress(60.0, "fetching OCR JSONL")
    jr = requests.get(jsonl_url)
    jr.raise_for_status()
    return _parse_jsonl_pages(jr.text)


def _run_paddleocr_job_with_retries(
    file_path: str,
    *,
    token: str,
    model: str,
    progress: ProgressCb,
    label: str,
) -> list[str]:
    last_error: Exception | None = None
    for attempt in range(1, PADDLEOCR_RETRY_ATTEMPTS + 1):
        try:
            return _run_paddleocr_job(file_path, token=token, model=model, progress=progress)
        except Exception as exc:
            last_error = exc
            if attempt >= PADDLEOCR_RETRY_ATTEMPTS:
                raise
            delay = PADDLEOCR_RETRY_BACKOFF * attempt
            progress(15.0, f"{label} failed, retry {attempt}/{PADDLEOCR_RETRY_ATTEMPTS} in {delay}s: {exc}")
            time.sleep(delay)
    if last_error:
        raise last_error
    raise RuntimeError("PaddleOCR retry did not return a result")


def _run_paddleocr_chunks(
    file_path: str,
    *,
    token: str,
    model: str,
    total_pages: int,
    progress: ProgressCb,
) -> list[str]:
    ranges = _pdf_chunk_ranges(total_pages, PADDLEOCR_CHUNK_SIZE)
    progress(10.0, f"split PDF into {len(ranges)} OCR chunk(s)")
    pages: list[str] = []

    with tempfile.TemporaryDirectory(prefix="teamclaw-ocr-chunks-") as tmp:
        tmp_dir = Path(tmp)
        for chunk_index, (start_page, end_page) in enumerate(ranges, start=1):
            chunk_path = tmp_dir / f"chunk-{chunk_index:03d}-{start_page}-{end_page}.pdf"
            _write_pdf_chunk(file_path, chunk_path, start_page, end_page)

            def chunk_progress(pct: float, msg: str) -> None:
                local = max(0.0, min(1.0, (float(pct) - 10.0) / 50.0))
                overall = 10.0 + (((chunk_index - 1) + local) / max(len(ranges), 1)) * 50.0
                progress(overall, f"OCR chunk {chunk_index}/{len(ranges)} ({start_page}-{end_page}): {msg}")

            chunk_pages = _run_paddleocr_job_with_retries(
                str(chunk_path),
                token=token,
                model=model,
                progress=chunk_progress,
                label=f"OCR chunk {chunk_index}/{len(ranges)}",
            )
            pages.extend(chunk_pages)

    if len(pages) != total_pages:
        raise RuntimeError(f"PaddleOCR page count mismatch: got {len(pages)}, expected {total_pages}")
    return pages


def _pdf_chunk_ranges(total_pages: int, chunk_size: int) -> list[tuple[int, int]]:
    return [
        (start_page, min(total_pages, start_page + chunk_size - 1))
        for start_page in range(1, total_pages + 1, chunk_size)
    ]


def _write_pdf_chunk(source_path: str, output_path: Path, start_page: int, end_page: int) -> None:
    source = fitz.open(source_path)
    target = fitz.open()
    try:
        target.insert_pdf(source, from_page=start_page - 1, to_page=end_page - 1)
        target.save(output_path)
    finally:
        target.close()
        source.close()


def _parse_jsonl_pages(text: str) -> list[str]:
    """Each JSONL line corresponds to one input page; each contains a list of
    layoutParsingResults whose markdown.text fields concatenate to that
    page's content."""
    pages: list[str] = []
    for line in text.strip().split("\n"):
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        result = obj.get("result", {})
        ocr_results = result.get("ocrResults", [])
        if isinstance(ocr_results, list) and ocr_results:
            for ocr_result in ocr_results:
                page_parts: list[str] = []
                pruned = ocr_result.get("prunedResult") or {}
                rec_texts = pruned.get("rec_texts")
                if isinstance(rec_texts, list):
                    page_parts.extend(str(item).strip() for item in rec_texts if str(item or "").strip())
                for block in ocr_result.get("textBlocks", []):
                    text = str(block.get("text") or "").strip()
                    if text:
                        page_parts.append(text)
                pages.append("\n".join(page_parts).strip())
            continue

        page_parts = []
        for res in result.get("layoutParsingResults", []):
            md = (res.get("markdown") or {}).get("text", "")
            if md:
                page_parts.append(md)
        pages.append("\n\n".join(page_parts).strip())
    return pages


# ── Document profile + content distribution ─────────────────────────

DOCUMENT_PROFILE_SYSTEM_PROMPT = """You are a document profiler for multilingual PDF routing.
Return a single JSON object only.

Rules:
1. Do not answer user questions.
2. Summarize what the document is about in one concise sentence.
3. Infer the document type.
4. Extract up to 12 routing keywords.
5. Extract up to 8 title aliases, abbreviations, or alternate names that could appear in user questions.

JSON schema:
{
  "summary_text": string,
  "doc_type": string,
  "keywords": [string],
  "title_aliases": [string]
}
"""

DOCUMENT_CHAPTER_SUMMARY_PROMPT = """你是一个文档内容分布分析助手。请根据以下 PDF 文档的完整 OCR 文本，输出“哪页到哪页主要讲什么”的内容分布摘要。

要求：
1. 识别主要内容块，可以是正式章节、节（Section）、附录（Appendix/Attachment）、表格/表单，也可以是自然主题段落。
2. 每个内容块单独一行，格式严格为：内容标题（第X-Y页）：一句话说明主要内容。
3. 按页码从小到大顺序输出。
4. 如果文档没有明显章节，不要硬编“第1章/第2章”，请按页面内容给出简短主题标题。
5. 如果文档只有一页或是表单/清单，也可以输出“整体内容（第1页）：...”或“表单主体（第1-2页）：...”。
6. 只输出内容分布列表，不要有任何其他说明或前缀。

示例输出：
引言与适用范围（第1-4页）：介绍项目背景、适用范围和主要术语定义。
质量要求与处理流程（第5-22页）：规定材料规格、工艺参数、检验标准及不合格品处理流程。
文件与记录要求（第23-28页）：说明文件控制要求、记录保存期限和变更管理程序。
检查记录表（第29-32页）：提供质量检查的标准记录表格和填写说明。
缩略词表（第33-34页）：列出文档中所用缩略词及其含义。"""


def _extract_json_object(text: str) -> dict:
    cleaned = str(text or "").strip()
    if not cleaned:
        return {}
    try:
        payload = json.loads(cleaned)
        return payload if isinstance(payload, dict) else {}
    except Exception:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            payload = json.loads(cleaned[start : end + 1])
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}
    return {}


def _coerce_string_list(value: object, *, limit: int) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = " ".join(str(item or "").split()).strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
        if len(result) >= limit:
            break
    return result


def _preview_text(text: str, *, limit: int) -> str:
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def parse_profile_payload(raw_text: str, *, fallback_summary: str) -> dict:
    payload = _extract_json_object(raw_text)
    if not payload:
        raise RuntimeError("文档画像生成失败：模型未返回有效 JSON。")
    summary_text = " ".join(str(payload.get("summary_text") or "").split()).strip()
    if not summary_text:
        summary_text = fallback_summary
    return {
        "summary_text": summary_text,
        "doc_type": " ".join(str(payload.get("doc_type") or "").split()).strip(),
        "keywords": _coerce_string_list(payload.get("keywords"), limit=12),
        "title_aliases": _coerce_string_list(payload.get("title_aliases"), limit=8),
    }


def collect_document_profile_material(
    *, file_name: str, display_name: str, page_count: int, pages: list[str], max_pages: int = 8
) -> str:
    sampled_pages: list[int] = []
    if page_count > 0:
        sampled_pages.extend(range(1, min(page_count, 3) + 1))
        step = max(1, page_count // 4)
        sampled_pages.extend(range(1, page_count + 1, step))

    ordered_pages: list[int] = []
    seen: set[int] = set()
    for page_number in sampled_pages:
        if page_number in seen or page_number > len(pages):
            continue
        seen.add(page_number)
        ordered_pages.append(page_number)

    sampled_text_blocks: list[str] = []
    for page_number in ordered_pages[:max_pages]:
        text = _preview_text(pages[page_number - 1], limit=600)
        if not text:
            continue
        sampled_text_blocks.append(f"[Page {page_number}] {text}")

    combined_text = "\n".join(sampled_text_blocks)
    return (
        f"File name: {file_name}\n"
        f"Display name: {display_name}\n"
        f"Page count: {page_count}\n"
        f"Sampled OCR text:\n{combined_text}"
    ).strip()


def build_profile_route_text(
    *,
    file_name: str,
    display_name: str,
    summary_text: str,
    doc_type: str,
    keywords: list[str],
    title_aliases: list[str],
) -> str:
    return "\n".join(
        part.strip()
        for part in (
            file_name,
            display_name,
            summary_text,
            doc_type,
            " ".join(keywords),
            " ".join(title_aliases),
        )
        if part and part.strip()
    )


def build_document_profile(
    creds: RequestCredentials, *, file_name: str, display_name: str, page_count: int, pages: list[str]
) -> dict:
    material = collect_document_profile_material(
        file_name=file_name, display_name=display_name, page_count=page_count, pages=pages,
    )
    if not material.strip():
        raise RuntimeError("OCR 文本为空，无法生成文档画像。")
    client = build_llm_client(creds)
    model = creds.llm_model or "qwen-plus"
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": DOCUMENT_PROFILE_SYSTEM_PROMPT},
            {"role": "user", "content": material},
        ],
        max_tokens=DOCUMENT_PROFILE_MAX_TOKENS,
        temperature=0,
        response_format={"type": "json_object"},
        extra_body={"enable_thinking": False},
    )
    profile = parse_profile_payload(
        resp.choices[0].message.content or "",
        fallback_summary=_preview_text(material, limit=240),
    )
    profile["route_text"] = build_profile_route_text(
        file_name=file_name,
        display_name=display_name,
        summary_text=profile["summary_text"],
        doc_type=profile["doc_type"],
        keywords=profile["keywords"],
        title_aliases=profile["title_aliases"],
    )
    profile["profile_status"] = "done"
    profile["profile_detail"] = "文档画像已生成，可参与多文档路由。"
    return profile


def build_doc_summary(creds: RequestCredentials, pages: list[str], max_pages: int = 4) -> dict:
    profile = build_document_profile(
        creds,
        file_name="document.pdf",
        display_name="document.pdf",
        page_count=len(pages),
        pages=pages[:max_pages],
    )
    return {"summary": profile["summary_text"], "keywords": profile["keywords"]}


def iter_chapter_summary_ranges(total_pages: int, chunk_size: int) -> list[tuple[int, int]]:
    return [
        (start, min(total_pages, start + chunk_size - 1))
        for start in range(1, total_pages + 1, max(1, chunk_size))
    ]


def build_chapter_summary_user_message(
    *,
    file_name: str,
    page_count: int,
    pages: list[str],
    start_page: int,
    end_page: int,
) -> str:
    page_blocks: list[str] = []
    for page_number in range(start_page, end_page + 1):
        text = str(pages[page_number - 1] if page_number <= len(pages) else "").strip()
        page_blocks.append(f"[第{page_number}页]\n{text}" if text else f"[第{page_number}页]\n（空页）")

    return (
        f"文档：{file_name}（共 {page_count} 页）\n"
        f"当前需要分析的页码范围：第 {start_page}-{end_page} 页。\n"
        "请只输出这个页码范围内的内容分布，不要概括范围外页面。\n\n"
        + "\n\n".join(page_blocks)
    )


def build_chapter_summary(
    creds: RequestCredentials, *, file_name: str, pages: list[str], chunk_size: int
) -> str:
    if not pages:
        raise RuntimeError("OCR 文本为空，无法生成章节摘要。")
    client = build_llm_client(creds)
    model = creds.llm_model or "qwen-plus"
    summaries: list[str] = []
    for start_page, end_page in iter_chapter_summary_ranges(len(pages), chunk_size):
        user_message = build_chapter_summary_user_message(
            file_name=file_name,
            page_count=len(pages),
            pages=pages,
            start_page=start_page,
            end_page=end_page,
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": DOCUMENT_CHAPTER_SUMMARY_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=DOCUMENT_CHAPTER_SUMMARY_MAX_TOKENS,
            temperature=0,
            extra_body={"enable_thinking": False},
        )
        text = (resp.choices[0].message.content or "").strip()
        if not text:
            raise RuntimeError("章节摘要生成失败：模型未返回内容。")
        finish_reason = str(getattr(resp.choices[0], "finish_reason", "") or "").lower()
        if finish_reason == "length":
            raise RuntimeError(f"内容分布生成被截断：第 {start_page}-{end_page} 页输出达到 max_tokens。")
        summaries.append(text)
    chapter_summary = "\n".join(summary.strip() for summary in summaries if summary.strip()).strip()
    if not chapter_summary:
        raise RuntimeError("章节摘要生成失败：模型未返回内容。")
    return chapter_summary


def validate_ocr_page_count(pages: list[str], expected_pages: int) -> None:
    if len(pages) != expected_pages:
        raise RuntimeError(
            f"OCR page count mismatch: got {len(pages)}, expected {expected_pages}"
        )


# ── Main pipeline ────────────────────────────────────────────────────

async def ingest_pdf(
    *,
    kb_id: str,
    doc_id: str,
    file_path: str,
    file_name: str | None = None,
    display_name: str | None = None,
    creds: RequestCredentials,
    progress: ProgressCb,
) -> dict:
    """Run the full PDF ingestion pipeline. Returns a summary dict.

    Pipeline:
      1) PaddleOCR per-page markdown extraction
      2) Upsert one full-text row per real PDF page
      3) Embed one vector row per non-empty PDF page
      4) Upsert into rag.page_ocr
      5) Generate document profile + content distribution → rag.doc_profile
    """
    if not Path(file_path).exists():
        raise FileNotFoundError(file_path)

    page_count = await asyncio.to_thread(get_pdf_page_count, file_path)
    progress(5.0, f"PDF has {page_count} page(s)")

    # Save the source PDF into artifacts so the chat UI can render a
    # right-side PDF preview by page (served via the artifacts mount).
    artifact_dir = Path(INGESTION_OUTPUT_ROOT) / kb_id / doc_id
    artifact_dir.mkdir(parents=True, exist_ok=True)
    source_pdf = artifact_dir / "source.pdf"
    try:
        await asyncio.to_thread(shutil.copyfile, file_path, source_pdf)
    except Exception as exc:
        logger.warning("failed to archive source PDF (%s): %s", source_pdf, exc)

    # Render every page to JPEG so the chat pipeline can feed images to a
    # vision LLM (mirrors llm-rag's render-once-at-upload model).
    pages_dir = artifact_dir / "pages"
    try:
        await asyncio.to_thread(render_pdf_to_jpegs, str(source_pdf), pages_dir)
        progress(8.0, f"已渲染 {page_count} 页 PDF 图像，可供视觉模型问答。")
    except Exception as exc:
        logger.warning("failed to render PDF pages (%s): %s", pages_dir, exc)

    # 1) OCR
    pages = await asyncio.to_thread(
        run_paddleocr,
        file_path,
        token=creds.paddleocr_token,
        model=creds.paddleocr_model or "PP-OCRv5",
        progress=progress,
        total_pages=page_count,
    )
    progress(65.0, f"OCR returned {len(pages)} page(s)")
    validate_ocr_page_count(pages, page_count)
    await asyncio.to_thread(_write_ocr_markdown_artifact, artifact_dir, pages)

    # 2) Keep llm-rag's page-level index semantics: one text/vector row per page.
    non_empty_pages: list[tuple[int, str]] = []
    progress(70.0, "writing page OCR index")
    for page_number, page_text in enumerate(pages, start=1):
        text = str(page_text or "")
        await upsert_page_ocr(
            kb_id=kb_id,
            doc_id=doc_id,
            page_index=page_number,
            text=text,
            text_tokens=tokenize_for_index(text),
            embedding=None,
            metadata={"display_page": page_number},
        )
        if text.strip():
            non_empty_pages.append((page_number, text))
        progress(70.0 + int((page_number / max(page_count, 1)) * 10), f"正在写入全文索引：{page_number}/{page_count} 页。")

    if not non_empty_pages:
        progress(100.0, "no text extracted")
        return {"page_count": page_count, "chunks": 0}

    # 3) Embed per page.
    progress(80.0, f"正在生成向量索引：0/{len(non_empty_pages)} 页。")
    embeddings: list[list[float]] = []
    if creds.embedding_api_key:
        embeddings = await asyncio.to_thread(encode_texts, creds, [c[1] for c in non_empty_pages])
    else:
        logger.warning("no embedding key — pages will have FTS but no vectors")
        embeddings = [[] for _ in non_empty_pages]

    for index, ((page_number, page_text), emb) in enumerate(zip(non_empty_pages, embeddings), start=1):
        await upsert_page_ocr(
            kb_id=kb_id,
            doc_id=doc_id,
            page_index=page_number,
            text=page_text,
            text_tokens=tokenize_for_index(page_text),
            embedding=emb or None,
            metadata={"display_page": page_number},
        )
        progress(80.0 + int((index / max(len(non_empty_pages), 1)) * 19), f"正在生成向量索引：{index}/{len(non_empty_pages)} 页。")

    # 4) Doc profile + content distribution, matching llm-rag failure semantics.
    progress(99.0, "页级索引已完成，正在生成文档画像。")
    stored_file_name = Path(file_path).name
    file_name = file_name or stored_file_name
    display_name = display_name or file_name
    profile_status = "done"
    profile_detail = "文档画像已生成，可参与多文档路由。"
    summary = ""
    keywords: list[str] = []
    doc_type = ""
    title_aliases: list[str] = []
    route_text = ""
    profile_embedding: list[float] | None = None
    chapter_summary = ""

    try:
        profile = await asyncio.to_thread(
            build_document_profile,
            creds,
            file_name=file_name,
            display_name=display_name,
            page_count=page_count,
            pages=pages,
        )
        summary = profile["summary_text"]
        keywords = profile["keywords"]
        doc_type = profile["doc_type"]
        title_aliases = profile["title_aliases"]
        route_text = profile["route_text"]
    except Exception as profile_exc:
        logger.warning("document profile unavailable: %s", profile_exc)
        profile_status = "failed"
        profile_detail = f"文档画像不可用：{profile_exc}"
        progress(100.0, f"页级索引已完成，文档画像不可用：{profile_exc}")
    if route_text and creds.embedding_api_key:
        try:
            profile_embedding = (await asyncio.to_thread(encode_texts, creds, [route_text]))[0]
        except Exception as exc:
            logger.warning("doc profile embedding failed: %s", exc)

    if profile_status == "done":
        try:
            progress(99.0, "文档画像已生成，正在生成内容分布。")
            chapter_summary = await asyncio.to_thread(
                build_chapter_summary,
                creds,
                file_name=file_name,
                pages=pages,
                chunk_size=DOCUMENT_CHAPTER_SUMMARY_CHUNK_SIZE,
            )
            profile_detail = "索引构建完成，可进行关键词、全文、向量检索和文档路由。"
        except Exception as summary_exc:
            logger.warning("chapter summary unavailable: %s", summary_exc)
            profile_detail = f"页级索引和文档画像已完成，内容分布生成失败：{summary_exc}"

    await upsert_doc_profile(
        kb_id=kb_id,
        doc_id=doc_id,
        file_name=file_name,
        file_type="pdf",
        page_count=page_count,
        profile_status=profile_status,
        profile_detail=profile_detail,
        summary=summary,
        doc_type=doc_type,
        summary_tokens=tokenize_for_index(route_text),
        keywords=keywords,
        title_aliases=title_aliases,
        route_text=route_text,
        chapter_summary=chapter_summary,
        embedding=profile_embedding,
    )

    progress(100.0, "索引构建完成，可进行关键词、全文、向量检索和文档路由。")
    return {
        "page_count": page_count,
        "chunks": len(non_empty_pages),
        "summary": summary,
        "keywords": keywords,
        "doc_type": doc_type,
        "title_aliases": title_aliases,
        "chapter_summary": chapter_summary,
    }


def _write_ocr_markdown_artifact(artifact_dir: Path, pages: list[str]) -> None:
    parts: list[str] = []
    for index, page in enumerate(pages, start=1):
        text = (page or "").strip()
        parts.append(f"## 第 {index} 页\n\n{text}" if text else f"## 第 {index} 页\n")
    (artifact_dir / "document.md").write_text("\n\n".join(parts), encoding="utf-8")
