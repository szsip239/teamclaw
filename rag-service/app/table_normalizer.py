import re
from html import unescape


OPEN_TABLE_RE = re.compile(r"<table\b[^>]*>", re.IGNORECASE)
CLOSE_TABLE_RE = re.compile(r"</table>", re.IGNORECASE)
ROW_RE = re.compile(r"<tr\b[^>]*>([\s\S]*?)</tr>", re.IGNORECASE)
CELL_RE = re.compile(r"<(th|td)\b[^>]*>([\s\S]*?)</\1>", re.IGNORECASE)
MD_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
HTML_IMAGE_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
OPEN_THEAD_RE = re.compile(r"<thead\b[^>]*>", re.IGNORECASE)
CLOSE_THEAD_RE = re.compile(r"</thead>", re.IGNORECASE)
OPEN_TBODY_RE = re.compile(r"<tbody\b[^>]*>", re.IGNORECASE)
CLOSE_TBODY_RE = re.compile(r"</tbody>", re.IGNORECASE)
UNFINISHED_TABLE_MARKER = "<!-- TABLE_UNFINISHED -->"


def normalize_table_blocks(md_text: str, logger=None) -> str:
    md_text = _repair_unclosed_table_blocks(md_text, logger)
    simple_count = 0
    complex_count = 0
    cursor = 0
    parts = []

    for start, end in _find_table_blocks(md_text):
        parts.append(md_text[cursor:start])
        table_html = md_text[start:end]

        if _is_simple_table(table_html):
            parts.append(_simple_table_to_markdown(table_html))
            simple_count += 1
        else:
            parts.append(_htmlize_markdown_images(table_html))
            complex_count += 1

        cursor = end

    parts.append(md_text[cursor:])
    result = "".join(parts)

    if logger and (simple_count or complex_count):
        logger.info(f"  🧩 表格归一化: 简单表格 {simple_count} 个转 Markdown，复杂表格 {complex_count} 个保留 HTML")

    return result


def _repair_unclosed_table_blocks(md_text: str, logger=None) -> str:
    repaired = md_text
    was_repaired = False

    while True:
        unmatched_start = _find_last_unmatched_table_start(repaired)
        if unmatched_start is None:
            break

        repaired = repaired[:unmatched_start] + _repair_truncated_table_fragment(
            repaired[unmatched_start:]
        )
        was_repaired = True

    if was_repaired and logger:
        logger.warning("  ⚠️ 检测到未闭合表格，已自动截断到最后完整行并闭合表格")

    return repaired


def _find_last_unmatched_table_start(text: str) -> int | None:
    events = []
    for match in OPEN_TABLE_RE.finditer(text):
        events.append((match.start(), "open"))
    for match in CLOSE_TABLE_RE.finditer(text):
        events.append((match.start(), "close"))
    events.sort(key=lambda item: item[0])

    stack: list[int] = []
    for position, kind in events:
        if kind == "open":
            stack.append(position)
        elif stack:
            stack.pop()

    return stack[-1] if stack else None


def _repair_truncated_table_fragment(fragment: str) -> str:
    last_gt = fragment.rfind(">")
    last_lt = fragment.rfind("<")
    if last_lt > last_gt:
        fragment = fragment[:last_lt]

    candidates = ("</tr>", "</thead>", "</tbody>", "</table>")
    lower_fragment = fragment.lower()
    best_end = -1
    for token in candidates:
        pos = lower_fragment.rfind(token)
        if pos != -1:
            best_end = max(best_end, pos + len(token))

    if best_end != -1:
        fragment = fragment[:best_end]

    closers: list[str] = []
    if len(OPEN_THEAD_RE.findall(fragment)) > len(CLOSE_THEAD_RE.findall(fragment)):
        closers.append("</thead>")
    if len(OPEN_TBODY_RE.findall(fragment)) > len(CLOSE_TBODY_RE.findall(fragment)):
        closers.append("</tbody>")
    if len(OPEN_TABLE_RE.findall(fragment)) > len(CLOSE_TABLE_RE.findall(fragment)):
        if closers and not fragment.endswith("\n"):
            fragment += "\n"
        closers.append("</table>")

    repaired = fragment.rstrip()
    if closers:
        repaired += "\n" + "\n".join(closers)
    if UNFINISHED_TABLE_MARKER not in repaired:
        repaired += "\n" + UNFINISHED_TABLE_MARKER
    return repaired


def _find_table_blocks(text: str):
    pos = 0
    while True:
        start_match = OPEN_TABLE_RE.search(text, pos)
        if not start_match:
            return

        start = start_match.start()
        cursor = start_match.end()
        depth = 1

        while depth > 0:
            next_open = OPEN_TABLE_RE.search(text, cursor)
            next_close = CLOSE_TABLE_RE.search(text, cursor)

            if not next_close:
                raise ValueError("Unclosed <table> block detected")

            if next_open and next_open.start() < next_close.start():
                depth += 1
                cursor = next_open.end()
            else:
                depth -= 1
                cursor = next_close.end()

        yield start, cursor
        pos = cursor


def _is_simple_table(table_html: str) -> bool:
    inner = re.sub(r"^<table\b[^>]*>", "", table_html, count=1, flags=re.IGNORECASE).strip()
    inner = re.sub(r"</table>\s*$", "", inner, count=1, flags=re.IGNORECASE).strip()

    if re.search(r"\b(rowspan|colspan)\s*=", table_html, re.IGNORECASE):
        return False
    if OPEN_TABLE_RE.search(inner):
        return False

    rows = _parse_rows(table_html)
    if not rows:
        return False

    widths = {len(row) for row in rows}
    return len(widths) == 1 and 0 not in widths


def _parse_rows(table_html: str):
    rows = []
    for row_html in ROW_RE.findall(table_html):
        cells = CELL_RE.findall(row_html)
        if cells:
            rows.append([(tag.lower(), content) for tag, content in cells])
    return rows


def _simple_table_to_markdown(table_html: str) -> str:
    rows = _parse_rows(table_html)
    if not rows:
        return table_html

    header = [_cell_to_markdown(content) for _, content in rows[0]]
    body = [[_cell_to_markdown(content) for _, content in row] for row in rows[1:]]

    lines = [
        _markdown_row(header),
        _markdown_row(["---"] * len(header)),
    ]
    for row in body:
        lines.append(_markdown_row(row))
    return "\n".join(lines)


def _markdown_row(cells):
    return "| " + " | ".join(cells) + " |"


def _cell_to_markdown(cell_html: str) -> str:
    text = cell_html.strip()
    text = _html_images_to_markdown(text)
    text = re.sub(r"<br\s*/?>", "<br>", text, flags=re.IGNORECASE)
    text = re.sub(r"</?(thead|tbody|p|span|div)\b[^>]*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*<br>\s*", "<br>", text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*", " ", text).strip()
    text = unescape(text)
    return text.replace("|", r"\|")


def _html_images_to_markdown(text: str) -> str:
    def repl(match):
        tag = match.group(0)
        src = re.search(r'src="([^"]+)"', tag, flags=re.IGNORECASE)
        alt = re.search(r'alt="([^"]*)"', tag, flags=re.IGNORECASE)
        if not src:
            return tag
        img_src = src.group(1)
        img_alt = alt.group(1) if alt else "img"
        return f"![{img_alt}]({img_src})"

    return HTML_IMAGE_RE.sub(repl, text)


def _htmlize_markdown_images(table_html: str) -> str:
    def repl(match):
        alt = match.group(1) or "img"
        src = match.group(2)
        return f'<img src="{src}" alt="{alt}" />'

    return MD_IMAGE_RE.sub(repl, table_html)
