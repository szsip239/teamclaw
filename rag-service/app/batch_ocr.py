"""
batch_ocr.py - 批量文档 OCR 处理（通义千问版）

特性：
  - 支持 PDF / 图片文件夹
  - 并发处理（默认 10 线程）
  - 精确计费（区分缓存命中/未命中）
  - 跨页表格/段落自动合并
  - 处理日志输出到文件
  - 兼容模型各种输出格式

依赖：pip install openai Pillow pymupdf

用法:
  export DASHSCOPE_API_KEY=sk-xxxxx

  python batch_ocr.py --input scan.pdf
  python batch_ocr.py --input ./文档图片/
  python batch_ocr.py --input scan.pdf --workers 10
  python batch_ocr.py --input scan.pdf --model my-model --price-in 0.8 --price-out 4.8
"""

import os
import re
import sys
import json
import time
import base64
import logging
import argparse
import mimetypes
from pathlib import Path
from datetime import datetime
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from table_normalizer import normalize_table_blocks

try:
    from openai import OpenAI
except ImportError:
    print("❌ 请先安装 openai: pip install openai")
    sys.exit(1)


# ==================== 日志 ====================

def setup_logging(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(output_dir, f"ocr_log_{ts}.txt")

    logger = logging.getLogger("batch_ocr")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"))

    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(message)s"))

    logger.addHandler(fh)
    logger.addHandler(ch)
    logger.info(f"📋 日志: {log_path}")
    return logger


# ==================== 内置提示词 ====================

DEFAULT_PROMPT = """你是一个专业的文档 OCR 识别与结构化助手。请对用户提供的文档图片执行以下任务：

## 任务

1. **全文 OCR 识别**：将图片中所有文字精确识别，转换为格式规范的 Markdown。
2. **图片区域检测**：找出文档中所有非文字的图片区域（照片、图表、插图、Logo、印章、警示标志等），给出每个区域的 bounding box 归一化坐标。
3. **占位符插入**：在 Markdown 对应位置插入占位符，方便后期脚本自动裁剪替换。

## 坐标系说明

**使用归一化坐标，取值范围 0.00 ~ 1.00：**
- (0.00, 0.00) = 图片左上角
- (1.00, 1.00) = 图片右下角

**定位方法：**
- 观察图片区域的左边缘在整张图宽度的大约百分之几处 → nx1
- 观察图片区域的上边缘在整张图高度的大约百分之几处 → ny1
- 同理得到右边缘 nx2 和下边缘 ny2
- 坐标保留两位小数
- **宁可框大一点，也不要框小裁漏内容**

## 输出规则

### 文字部分
- 使用**纯 Markdown 语法**还原标题层级、段落、加粗、斜体、列表等格式
- **简单表格用 Markdown 表格语法（| 分隔符）**
- **涉及合并单元格的复杂表格（如告知卡、表单），允许使用 HTML <table> 标签**
- **每张表格前必须插入注释标记：<!-- table: table_001 -->，编号从 001 递增**
- 公式用 LaTeX（$...$）
- 保持原文内容，不翻译、不总结、不省略
- **忽略图片上的水印、印章、背景文字**，不要识别它们
- **不要用 ```markdown ``` 代码块包裹输出**，直接输出 Markdown 内容

### 图片区域部分

**图片编号必须使用 img_001、img_002、img_003 格式，从 001 递增。**

在普通 Markdown 中：

![img_001](bbox://nx1,ny1,nx2,ny2)

在 HTML 表格内：

<img src="bbox://nx1,ny1,nx2,ny2" alt="img_001" />

**注意：alt 属性必须是 img_001 这种编号格式，不要用中文描述。**
**不要在 HTML <table> 里面混用 Markdown 图片语法 `![...]()`。**

如果图片有图注/标题，在占位符下方用斜体写出。
如果多个小图标在同一行，每个单独编号。
**水印、印章不算图片区域，不要为它们生成占位符。**

### 跨页标记

- 如果本页开头的表格明显是上一页的续表，请在该表格前加：<!-- TABLE_CONTINUE -->
- 如果本页末尾的表格明显没有结束，请在该表格后加：<!-- TABLE_UNFINISHED -->
- 如果本页开头的段落是上一页未完成段落的续写，请加：<!-- PARAGRAPH_CONTINUE -->

### 末尾 JSON 汇总

在 Markdown 最末尾，追加一个 JSON 代码块：

```json
{
  "tables": [
    {
      "id": "table_001",
      "bbox_normalized": [nx1, ny1, nx2, ny2],
      "caption": "表格标题（没有则为空字符串）",
      "semantic_summary": "用一句中文概括这张表列出了什么、用户能从中获得什么信息；不要重复表题原文（没有则为空字符串）",
      "type": "simple | complex",
      "headers": ["列1", "列2"],
      "continued_from_prev": false,
      "continues_to_next": false
    }
  ],
  "regions": [
    {
      "id": "img_001",
      "bbox_normalized": [nx1, ny1, nx2, ny2],
      "caption": "描述（没有则为空字符串）",
      "type": "photo | chart | diagram | logo | icon | other"
    }
  ]
}
```

## 注意事项
- 没有表格时 tables 为 []
- 没有图片区域时 regions 为 []
- 如果识别出表格，tables 中每张表都必须补充 semantic_summary
- semantic_summary 必须是语义概括，不要简单重复 caption
- 页码数字单独放在最后一行即可
- 忽略所有水印内容
- 不要用 ```markdown 代码块包裹整个输出"""

# 用户消息（简短固定）
USER_TEXT = "请处理这张文档图片。"


# ==================== 费用统计（精确到缓存） ====================

class CostTracker:
    """精确费用统计，区分缓存命中/未命中"""

    KNOWN_PRICING = {
        "qwen3.5-plus":       {"input": 0.8,  "output": 4.8},
        "qwen-vl-max":        {"input": 0.8,  "output": 4.8},
        "qwen-vl-max-latest": {"input": 0.8,  "output": 4.8},
        "qwen-vl-plus":       {"input": 0.8,  "output": 4.8},
        "qwen-vl-plus-latest":{"input": 0.8,  "output": 4.8},
        "qwen3-vl-plus":      {"input": 1.0,  "output": 5.0},
        "qwen3-vl-flash":     {"input": 0.2,  "output": 0.6},
        "qwen3.5-flash":      {"input": 0.2,  "output": 0.6},
    }
    CACHE_DISCOUNT = 0.2  # 缓存命中按原价 20% 计费

    def __init__(self, model, price_in=None, price_out=None):
        self.model = model
        self.pricing = self._resolve(model, price_in, price_out)
        self.total_input = 0
        self.total_input_cached = 0
        self.total_output = 0
        self.pages = []
        self._lock = Lock()
        self.run_started_at = None
        self.run_finished_at = None
        self._run_started_perf = None
        self._run_finished_perf = None

    def _resolve(self, model, price_in, price_out):
        if price_in is not None and price_out is not None:
            return {"input": price_in, "output": price_out}
        if model in self.KNOWN_PRICING:
            p = self.KNOWN_PRICING[model]
            print(f"💲 内置价格: 输入 {p['input']} / 输出 {p['output']} 元/百万tokens")
            return p
        print(f"\n⚠️  模型 [{model}] 不在内置价格表中")
        print(f"   内置: {', '.join(sorted(self.KNOWN_PRICING.keys()))}")
        print(f"   请输入价格（元/百万tokens），回车跳过\n")
        try:
            inp = input("   输入价格: ").strip()
            if not inp: return {"input": 0, "output": 0}
            pi = float(inp)
            inp = input("   输出价格: ").strip()
            if not inp: return {"input": 0, "output": 0}
            po = float(inp)
            print(f"   ✅ 输入 {pi} / 输出 {po} 元/百万tokens")
            return {"input": pi, "output": po}
        except (ValueError, EOFError, KeyboardInterrupt):
            return {"input": 0, "output": 0}

    def add(self, name, input_tokens, output_tokens, cached_tokens, elapsed):
        """
        input_tokens:  总输入 tokens（含缓存部分）
        cached_tokens: 其中命中缓存的 tokens
        output_tokens: 输出 tokens
        """
        uncached_input = input_tokens - cached_tokens
        cost = self._cost(uncached_input, cached_tokens, output_tokens)

        with self._lock:
            self.total_input += input_tokens
            self.total_input_cached += cached_tokens
            self.total_output += output_tokens
            self.pages.append({
                "page": name,
                "input_tokens": input_tokens,
                "cached_tokens": cached_tokens,
                "uncached_input_tokens": uncached_input,
                "output_tokens": output_tokens,
                "cost_yuan": cost,
                "elapsed_s": round(elapsed, 1),
            })

    def _cost(self, uncached_input, cached_input, output):
        """精确费用 = 未缓存输入×原价 + 缓存输入×原价×20% + 输出×输出价"""
        price_in = self.pricing["input"]
        price_out = self.pricing["output"]
        c_uncached = uncached_input / 1e6 * price_in
        c_cached = cached_input / 1e6 * price_in * self.CACHE_DISCOUNT
        c_output = output / 1e6 * price_out
        return round(c_uncached + c_cached + c_output, 6)

    @property
    def total_uncached_input(self):
        return self.total_input - self.total_input_cached

    @property
    def total_cost(self):
        return self._cost(self.total_uncached_input, self.total_input_cached, self.total_output)

    @property
    def total_cost_without_cache(self):
        """如果没有缓存，费用是多少（用于对比节省了多少）"""
        return round(self.total_input / 1e6 * self.pricing["input"] +
                     self.total_output / 1e6 * self.pricing["output"], 6)

    @property
    def has_pricing(self):
        return self.pricing["input"] > 0 or self.pricing["output"] > 0

    @property
    def cumulative_task_elapsed_s(self):
        return round(sum(p["elapsed_s"] for p in self.pages), 1)

    @property
    def wall_clock_elapsed_s(self):
        if self._run_started_perf is None:
            return None
        end = self._run_finished_perf if self._run_finished_perf is not None else time.perf_counter()
        return round(end - self._run_started_perf, 1)

    def mark_run_started(self):
        if self._run_started_perf is None:
            self._run_started_perf = time.perf_counter()
            self.run_started_at = datetime.now().isoformat(timespec="seconds")

    def mark_run_finished(self):
        if self._run_started_perf is None:
            return
        self._run_finished_perf = time.perf_counter()
        self.run_finished_at = datetime.now().isoformat(timespec="seconds")

    def print_summary(self, logger):
        n = len(self.pages)
        if n == 0: return
        tt = self.total_input + self.total_output

        logger.info(f"\n{'=' * 60}")
        logger.info(f"💰 用量与费用统计（模型: {self.model}）")
        logger.info(f"{'=' * 60}")
        logger.info(f"   📄 页数:            {n}")
        logger.info(f"   📥 输入 tokens:     {self.total_input:,}")
        if self.total_input_cached > 0:
            pct = self.total_input_cached / self.total_input * 100
            logger.info(f"      ├─ 缓存命中:    {self.total_input_cached:,} ({pct:.1f}%)")
            logger.info(f"      └─ 未命中:      {self.total_uncached_input:,}")
        logger.info(f"   📤 输出 tokens:     {self.total_output:,}")
        logger.info(f"   🔢 总 tokens:       {tt:,}")
        logger.info(f"   📊 平均/页:         输入 {self.total_input//n:,} + 输出 {self.total_output//n:,}")

        if self.has_pricing:
            logger.info(f"\n   💲 单价:            输入 {self.pricing['input']} / 输出 {self.pricing['output']} 元/百万tokens")
            logger.info(f"   💲 缓存折扣:        命中部分按 {self.CACHE_DISCOUNT:.0%} 计费")
            logger.info(f"   💲 实际总费用:      ¥{self.total_cost:.4f}")
            logger.info(f"   💲 平均/页:         ¥{self.total_cost / n:.4f}")

            if self.total_input_cached > 0:
                saved = self.total_cost_without_cache - self.total_cost
                logger.info(f"   💲 无缓存费用:      ¥{self.total_cost_without_cache:.4f}")
                logger.info(f"   💲 缓存节省:        ¥{saved:.4f}")

        # 逐页明细
        if n <= 50:
            header = f"\n   {'页面':<25s} {'输入':>7s} {'缓存':>7s} {'输出':>7s}"
            if self.has_pricing:
                header += f" {'费用':>10s}"
            header += f" {'耗时':>6s}"
            logger.info(header)
            logger.info(f"   {'-' * 68}")

            for p in self.pages:
                line = (f"   {p['page']:<25s} {p['input_tokens']:>7,} "
                        f"{p['cached_tokens']:>7,} {p['output_tokens']:>7,}")
                if self.has_pricing:
                    line += f" ¥{p['cost_yuan']:>8.4f}"
                line += f" {p['elapsed_s']:>5.1f}s"
                logger.info(line)

        wall_clock = self.wall_clock_elapsed_s
        cumulative = self.cumulative_task_elapsed_s
        if wall_clock is not None:
            logger.info(f"\n   ⏱️  总耗时(墙钟):    {wall_clock:.1f}s（平均 {wall_clock/n:.1f}s/页）")
            logger.info(f"   ⏱️  累计任务耗时:   {cumulative:.1f}s")
        else:
            logger.info(f"\n   ⏱️  累计任务耗时:   {cumulative:.1f}s（平均 {cumulative/n:.1f}s/页）")

    def save_report(self, filepath):
        n = max(len(self.pages), 1)
        report = {
            "model": self.model,
            "pricing_yuan_per_million": self.pricing,
            "cache_discount": self.CACHE_DISCOUNT,
            "summary": {
                "pages": len(self.pages),
                "input_tokens": self.total_input,
                "input_cached_tokens": self.total_input_cached,
                "input_uncached_tokens": self.total_uncached_input,
                "output_tokens": self.total_output,
                "total_tokens": self.total_input + self.total_output,
                "run_started_at": self.run_started_at,
                "run_finished_at": self.run_finished_at,
                "wall_clock_elapsed_s": self.wall_clock_elapsed_s,
                "cumulative_task_elapsed_s": self.cumulative_task_elapsed_s,
            },
            "details": self.pages,
        }
        if self.has_pricing:
            report["summary"]["total_cost_yuan"] = self.total_cost
            report["summary"]["avg_cost_per_page_yuan"] = round(self.total_cost / n, 6)
            if self.total_input_cached > 0:
                report["summary"]["cost_without_cache_yuan"] = self.total_cost_without_cache
                report["summary"]["cache_saved_yuan"] = round(self.total_cost_without_cache - self.total_cost, 6)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)


# ==================== PDF 拆图 ====================

def pdf_to_images(pdf_path, output_dir, dpi, logger):
    try:
        import fitz
    except ImportError:
        logger.error("❌ pip install pymupdf"); sys.exit(1)
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    paths = []
    total = len(doc)
    logger.info(f"📄 PDF {total} 页，转图 (DPI={dpi})...")
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72))
        fp = os.path.join(output_dir, f"page_{i+1:04d}.png")
        pix.save(fp); paths.append(fp)
        logger.debug(f"  📃 {i+1}/{total} → {fp} ({pix.width}×{pix.height})")
    doc.close()
    logger.info(f"  ✅ 拆图完成")
    return paths


# ==================== 图片工具 ====================

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"}

def scan_images(d):
    return sorted([os.path.join(d, f) for f in os.listdir(d)
                   if os.path.splitext(f)[1].lower() in IMAGE_EXTENSIONS])

def image_to_base64_url(p):
    mime, _ = mimetypes.guess_type(p)
    if not mime: mime = "image/png"
    if mime in ("image/tiff", "image/bmp"):
        from io import BytesIO
        buf = BytesIO(); Image.open(p).save(buf, format="PNG")
        b64 = base64.standard_b64encode(buf.getvalue()).decode(); mime = "image/png"
    else:
        with open(p, "rb") as f: b64 = base64.standard_b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"


# ==================== Qwen API ====================

def create_client():
    key = os.environ.get("DASHSCOPE_API_KEY")
    if not key: print("❌ 设置 DASHSCOPE_API_KEY"); sys.exit(1)
    return OpenAI(api_key=key, base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")


def call_qwen_ocr(client, image_path, system_prompt, model):
    """
    system message 放提示词（可命中缓存），user message 放图片+短指令
    返回 {text, input_tokens, output_tokens, cached_tokens}
    """
    url = image_to_base64_url(image_path)

    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": url}},
                {"type": "text", "text": USER_TEXT},
            ]},
        ],
    )

    usage = completion.usage
    input_tokens = getattr(usage, "prompt_tokens", 0) or 0
    output_tokens = getattr(usage, "completion_tokens", 0) or 0

    # 尝试读取缓存 tokens
    # DashScope 可能通过 prompt_tokens_details.cached_tokens 返回
    cached_tokens = 0
    details = getattr(usage, "prompt_tokens_details", None)
    if details:
        cached_tokens = getattr(details, "cached_tokens", 0) or 0
    # 也可能在 completion.usage 其他字段
    if cached_tokens == 0:
        cached_tokens = getattr(usage, "cached_tokens", 0) or 0

    return {
        "text": completion.choices[0].message.content,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cached_tokens": cached_tokens,
    }


# ==================== 输出清洗 ====================

def clean_raw_output(text):
    stripped = text.strip()
    match = re.match(r'^```(?:markdown)?\s*\n([\s\S]*?)\n```\s*$', stripped)
    if match:
        return match.group(1)
    return text


def strip_region_json_block(text):
    patterns = (
        r'\n*```json\s*\{[\s\S]*?(?:"regions"|"tables")[\s\S]*?\}\s*```\s*$',
        r'\n*```json\s*\{[\s\S]*?(?:"regions"|"tables")[\s\S]*?\}\s*$',
    )
    stripped = text
    for pattern in patterns:
        stripped = re.sub(pattern, '', stripped, count=1)
        if stripped != text:
            return stripped.strip()
    return text.strip()


# ==================== 后处理 ====================

def parse_all_bboxes(md, logger):
    results = []
    counter = [0]
    valid_img_id_pattern = re.compile(r'^img(?:_p\d{2,4})?_\d+$')

    def next_id():
        counter[0] += 1
        return f"img_{counter[0]:03d}"

    for m in re.finditer(r'!\[([^\]]*)\]\(bbox://([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)', md):
        alt = m.group(1)
        bbox = [float(m.group(i)) for i in range(2, 6)]
        img_id = alt if valid_img_id_pattern.match(alt) else next_id()
        results.append({"id": img_id, "bbox_norm": bbox, "original_alt": alt,
                        "match": m.group(0), "format": "md"})
        logger.debug(f"    MD bbox: {img_id} alt='{alt}' bbox={bbox}")

    for m in re.finditer(r'<img\s+src="bbox://([\d.]+),([\d.]+),([\d.]+),([\d.]+)"\s+alt="([^"]*)"\s*/?>', md):
        bbox = [float(m.group(i)) for i in range(1, 5)]
        alt = m.group(5)
        img_id = alt if valid_img_id_pattern.match(alt) else next_id()
        results.append({"id": img_id, "bbox_norm": bbox, "original_alt": alt,
                        "match": m.group(0), "format": "html"})
        logger.debug(f"    HTML bbox: {img_id} alt='{alt}' bbox={bbox}")

    seen = set()
    return [r for r in results if r["match"] not in seen and not seen.add(r["match"])]


def crop_images(image_path, bboxes, output_dir, padding, logger):
    os.makedirs(output_dir, exist_ok=True)
    img = Image.open(image_path)
    w, h = img.size
    path_map, id_map = {}, {}

    for item in bboxes:
        img_id = item["id"]
        nx1, ny1, nx2, ny2 = item["bbox_norm"]
        nx1, ny1 = max(0.0, nx1-padding), max(0.0, ny1-padding)
        nx2, ny2 = min(1.0, nx2+padding), min(1.0, ny2+padding)
        x1, y1, x2, y2 = int(nx1*w), int(ny1*h), int(nx2*w), int(ny2*h)
        cropped = img.crop((x1, y1, x2, y2))
        fp = os.path.join(output_dir, f"{img_id}.png")
        cropped.save(fp)
        rel = f"images/{img_id}.png"
        path_map[item["match"]] = rel
        id_map[item["match"]] = img_id
        logger.debug(f"    裁剪 {img_id}: ({x1},{y1},{x2},{y2})")

    return path_map, id_map


def replace_all_placeholders(md, path_map, id_map, logger):
    replaced = 0
    for match_str, rel_path in path_map.items():
        img_id = id_map.get(match_str, "img")
        if match_str.startswith("<img"):
            replacement = f'<img src="{rel_path}" alt="{img_id}" />'
        else:
            replacement = f"![{img_id}]({rel_path})"
        if match_str in md:
            md = md.replace(match_str, replacement); replaced += 1
        else:
            logger.warning(f"    ⚠️ 未找到: {match_str[:80]}...")
    logger.info(f"  🔄 替换 {replaced}/{len(path_map)} 个图片")
    if replaced < len(path_map):
        logger.warning(f"  ⚠️ {len(path_map)-replaced} 个未替换！")
    return md


def renumber_images(md, page_num):
    prefix = f"p{page_num:02d}"
    def r(m):
        old = m.group(1)
        return m.group(0).replace(old, old.replace("img_", f"img_{prefix}_"))
    md = re.sub(r'!\[(img_\d+)\]\(bbox://[\d.,]+\)', r, md)
    md = re.sub(r'alt="(img_\d+)"', r, md)
    md = re.sub(r'!\[(img_\d+)\]\(images/', r, md)
    return md


# ==================== 跨页合并 ====================

def merge_cross_page(pages, logger):
    if len(pages) <= 1: return pages
    merged = list(pages)

    for i in range(len(merged) - 1):
        cur, nxt = merged[i], merged[i+1]

        if "<!-- TABLE_UNFINISHED -->" in cur and "<!-- TABLE_CONTINUE -->" in nxt:
            cur = cur.replace("<!-- TABLE_UNFINISHED -->", "").rstrip()
            nxt = nxt.replace("<!-- TABLE_CONTINUE -->", "").lstrip()
            lines = nxt.split("\n")
            table_rows, rest = [], []
            in_t, hdr_done = True, False
            for line in lines:
                s = line.strip()
                if in_t and s.startswith("|"):
                    if not hdr_done:
                        if re.match(r'^\|[\s\-:|]+\|$', s): hdr_done = True; continue
                        continue
                    else: table_rows.append(line)
                elif in_t and s == "" and table_rows: in_t = False; rest.append(line)
                else:
                    if not s.startswith("|"): in_t = False
                    rest.append(line)
            if table_rows:
                merged[i] = cur + "\n" + "\n".join(table_rows)
                merged[i+1] = "\n".join(rest).strip()
                logger.info(f"  🔗 表格 {i+1}→{i+2}（{len(table_rows)} 行）")

        if "<!-- PARAGRAPH_CONTINUE -->" in merged[i+1]:
            nxt = merged[i+1].replace("<!-- PARAGRAPH_CONTINUE -->", "").lstrip()
            lines = nxt.split("\n")
            for j, line in enumerate(lines):
                if line.strip():
                    merged[i] = merged[i].rstrip() + " " + line.strip()
                    merged[i+1] = "\n".join(lines[j+1:]).strip()
                    logger.info(f"  🔗 段落 {i+1}→{i+2}")
                    break

    return merged


# ==================== 单页处理 ====================

def process_page(client, image_path, output_dir, prompt, model, padding,
                 tracker, logger, page_num=0):
    filename = Path(image_path).stem
    page_name = filename if page_num == 0 else f"page_{page_num:04d}"
    file_dir = os.path.join(output_dir, filename) if page_num == 0 else output_dir
    images_dir = os.path.join(file_dir, "images")
    os.makedirs(file_dir, exist_ok=True)

    # 1. API
    logger.info(f"  🔍 调用 API...")
    t0 = time.time()
    result = call_qwen_ocr(client, image_path, prompt, model)
    elapsed = time.time() - t0
    raw_md = result["text"]

    cached = result["cached_tokens"]
    tracker.add(page_name, result["input_tokens"], result["output_tokens"], cached, elapsed)

    cache_info = f", 缓存:{cached}" if cached > 0 else ""
    logger.info(f"  🔍 完成 ({elapsed:.1f}s, in:{result['input_tokens']}{cache_info}, out:{result['output_tokens']})")

    # 2. 保存原始
    raw_path = os.path.join(file_dir, f"{page_name}_raw.md")
    with open(raw_path, "w", encoding="utf-8") as f: f.write(raw_md)
    logger.debug(f"  💾 原始: {raw_path}")

    # 3. 清洗
    cleaned = clean_raw_output(raw_md)
    if cleaned != raw_md: logger.info(f"  🧹 清理代码围栏")

    # 4. 重编号
    if page_num > 0: cleaned = renumber_images(cleaned, page_num)

    # 5. 裁剪
    bboxes = parse_all_bboxes(cleaned, logger)
    if bboxes:
        logger.info(f"  🖼️  {len(bboxes)} 个图片区域")
        path_map, id_map = crop_images(image_path, bboxes, images_dir, padding, logger)
        final = replace_all_placeholders(cleaned, path_map, id_map, logger)
    else:
        logger.info(f"  📭 无图片区域")
        final = cleaned

    # 6. 保存
    final = normalize_table_blocks(final, logger)
    final = strip_region_json_block(final)

    fp = os.path.join(file_dir, f"{page_name}.md")
    with open(fp, "w", encoding="utf-8") as f:
        f.write(final)
    logger.info(f"  ✅ {fp}")

    return final, True


# ==================== PDF 处理 ====================

def process_pdf(client, pdf_path, output_dir, prompt, model, padding, dpi, workers, tracker, logger):
    pdf_name = Path(pdf_path).stem
    pdf_dir = os.path.join(output_dir, pdf_name)
    tracker.mark_run_started()
    image_paths = pdf_to_images(pdf_path, os.path.join(pdf_dir, "page_images"), dpi, logger)
    total = len(image_paths)

    logger.info(f"\n🔍 开始 OCR（{workers} 并发）...\n")
    results = {}
    failed = []

    def _task(pn, img):
        logger.info(f"[第 {pn}/{total} 页] {Path(img).name}")
        return pn, process_page(client, img, pdf_dir, prompt, model, padding, tracker, logger, pn)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_task, i+1, img): i+1 for i, img in enumerate(image_paths)}
        for f in as_completed(futures):
            pn = futures[f]
            try:
                page_num, (md, _) = f.result()
                md_clean = strip_region_json_block(md)
                results[page_num] = md_clean
            except Exception as e:
                logger.error(f"  ❌ 第 {pn} 页: {e}")
                results[pn] = f"\n\n> ⚠️ 第 {pn} 页失败: {e}\n\n"
                failed.append(pn)

    tracker.mark_run_finished()

    sorted_pages = [results.get(i+1, "") for i in range(total)]
    logger.info(f"\n📎 跨页衔接...")
    merged = merge_cross_page(sorted_pages, logger)

    merged_md = "\n\n---\n\n".join(p for p in merged if p.strip())
    merged_path = os.path.join(pdf_dir, f"{pdf_name}.md")
    with open(merged_path, "w", encoding="utf-8") as f: f.write(merged_md)

    report_path = os.path.join(pdf_dir, "cost_report.json")
    tracker.save_report(report_path)

    logger.info(f"\n{'=' * 60}")
    logger.info(f"🎉 PDF 完成！ {total} 页 | 成功: {total-len(failed)} | 失败: {len(failed)}")
    if failed: logger.info(f"   ⚠️ 失败: {sorted(failed)}")
    logger.info(f"   📝 文档: {merged_path}")
    logger.info(f"   📊 报告: {report_path}")
    tracker.print_summary(logger)


# ==================== 图片文件夹处理 ====================

def process_folder(client, input_dir, output_dir, prompt, model, padding, workers, tracker, logger, skip_existing, single):
    tracker.mark_run_started()
    images = scan_images(input_dir)
    if not images: logger.info("📭 无图片"); return
    if single:
        images = [i for i in images if Path(i).name == single]
        if not images: logger.info(f"❌ 未找到: {single}"); return

    total = len(images)
    logger.info(f"📄 待处理: {total} 张\n")
    success, fail = 0, 0
    _lock = Lock()

    def _task(idx, img):
        nonlocal success, fail
        fname = Path(img).stem
        logger.info(f"[{idx+1}/{total}] 📄 {Path(img).name}")
        if skip_existing and os.path.exists(os.path.join(output_dir, fname, f"{fname}.md")):
            logger.info(f"  ⏭️ 跳过")
            with _lock: success += 1
            return
        try:
            process_page(client, img, output_dir, prompt, model, padding, tracker, logger)
            with _lock: success += 1
        except Exception as e:
            logger.error(f"  ❌ {e}")
            with _lock: fail += 1

    if workers <= 1:
        for i, img in enumerate(images): _task(i, img)
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = [pool.submit(_task, i, img) for i, img in enumerate(images)]
            for f in as_completed(futs):
                try: f.result()
                except: pass

    tracker.mark_run_finished()

    report_path = os.path.join(output_dir, "cost_report.json")
    tracker.save_report(report_path)
    logger.info(f"\n{'=' * 60}")
    logger.info(f"🎉 完成！成功: {success}  失败: {fail}")
    logger.info(f"📁 结果: {output_dir}")
    logger.info(f"📊 报告: {report_path}")
    tracker.print_summary(logger)


# ==================== 主入口 ====================

def build_parser():
    parser = argparse.ArgumentParser(
        description="批量文档 OCR（通义千问版）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python batch_ocr.py --input scan.pdf
  python batch_ocr.py --input ./文档图片/
  python batch_ocr.py --input scan.pdf --workers 10
  python batch_ocr.py --input scan.pdf --model my-model --price-in 0.8 --price-out 4.8
        """,
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", default="./ocr_output")
    parser.add_argument("--model", default="qwen3.5-flash")
    parser.add_argument("--padding", type=float, default=0.01)
    parser.add_argument("--workers", type=int, default=10)
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--prompt", default=None)
    parser.add_argument("--single", default=None)
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--price-in", type=float, default=None)
    parser.add_argument("--price-out", type=float, default=None)
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"❌ 不存在: {args.input}"); return

    logger = setup_logging(args.output_dir)

    prompt = DEFAULT_PROMPT
    if args.prompt:
        with open(args.prompt, "r", encoding="utf-8") as f: prompt = f.read()
        logger.info(f"📝 自定义提示词: {args.prompt}")

    client = create_client()
    tracker = CostTracker(args.model, args.price_in, args.price_out)
    is_pdf = os.path.isfile(args.input) and args.input.lower().endswith(".pdf")

    logger.info(f"\n🤖 模型: {args.model}")
    logger.info(f"⚡ 并发: {args.workers}")
    logger.info(f"📁 输出: {args.output_dir}")
    logger.info(f"💡 提示词放在 system message 中以命中缓存")

    if is_pdf:
        logger.info(f"📄 PDF: {args.input} (DPI={args.dpi})")
        logger.info("=" * 60)
        process_pdf(client, args.input, args.output_dir,
                    prompt, args.model, args.padding, args.dpi, args.workers, tracker, logger)
    else:
        logger.info(f"📁 图片: {args.input}")
        logger.info("=" * 60)
        process_folder(client, args.input, args.output_dir,
                       prompt, args.model, args.padding, args.workers, tracker, logger,
                       args.skip_existing, args.single)


if __name__ == "__main__":
    main()
