from __future__ import annotations

from copy import deepcopy
from typing import Any, Callable


TABLE_SUMMARY_PROMPT = """你是一个表格理解助手。请根据给定表格内容，输出一句简洁的中文语义摘要。

要求：
1. 不要重复表题原文。
2. 要说明这张表主要列出了什么，以及用户能从中得到什么信息。
3. 控制在 40-80 字。
4. 只输出摘要正文，不要加“摘要：”或项目符号。

表题：{caption}
页码：{page_label}
表头：{headers}
线性化表格内容：
{normalized_table_text}
"""

MAX_TABLE_SUMMARY_SOURCE_CHARS = 2400


def _fallback_summary(table_block: dict[str, Any]) -> str:
    caption = str(table_block.get("caption", "")).strip()
    if caption:
        return caption

    normalized_table_text = str(table_block.get("normalized_table_text", "")).strip()
    if normalized_table_text:
        return normalized_table_text[:120]

    page_label = str(table_block.get("page_label", "")).strip()
    return f"第 {page_label or '-'} 页表格"


def build_table_summary_prompt(table_block: dict[str, Any]) -> str:
    headers = table_block.get("headers", [])
    if isinstance(headers, list):
        headers_text = " | ".join(str(header).strip() for header in headers if str(header).strip())
    else:
        headers_text = str(headers)

    return TABLE_SUMMARY_PROMPT.format(
        caption=str(table_block.get("caption", "")).strip() or "无",
        page_label=str(table_block.get("page_label", "")).strip() or "-",
        headers=headers_text or "无",
        normalized_table_text=(
            str(table_block.get("normalized_table_text", "")).strip()[:MAX_TABLE_SUMMARY_SOURCE_CHARS] or "无"
        ),
    )


def create_table_summary_builder(llm: Any) -> Callable[[dict[str, Any]], str]:
    def summarize(table_block: dict[str, Any]) -> str:
        prompt = build_table_summary_prompt(table_block)
        response = llm.complete(prompt)
        return str(getattr(response, "text", "") or "").strip()

    return summarize


def summarize_table_blocks(
    table_blocks: list[dict[str, Any]],
    summary_builder: Callable[[dict[str, Any]], str] | None = None,
) -> list[dict[str, Any]]:
    summarized_blocks: list[dict[str, Any]] = []

    for table_block in table_blocks:
        enriched = deepcopy(table_block)
        semantic_summary = str(enriched.get("semantic_summary", "") or "").strip()

        if not semantic_summary and summary_builder is not None:
            try:
                semantic_summary = str(summary_builder(enriched) or "").strip()
            except Exception:
                semantic_summary = ""

        if not semantic_summary:
            semantic_summary = _fallback_summary(enriched)

        enriched["semantic_summary"] = semantic_summary
        enriched["summary"] = semantic_summary
        summarized_blocks.append(enriched)

    return summarized_blocks
