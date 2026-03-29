"""
postprocess.py - 单文件后处理脚本
解析 Markdown 中的 bbox 占位符 → 裁剪图片 → 替换为本地路径

不调用任何 API，纯本地处理。
同时兼容归一化坐标和像素坐标两种格式。

依赖：pip install Pillow

用法:
    python postprocess.py --image 原图.png --markdown output.md
    python postprocess.py --image 原图.png --markdown output.md --output-dir ./imgs --output-md final.md
    python postprocess.py --image 原图.png --markdown output.md --padding 0.02
"""

import re
import os
import json
import argparse
from PIL import Image


def parse_normalized_bbox(md_text: str) -> list[dict]:
    """解析归一化坐标占位符 ![img_xxx](bbox://0.12,0.18,0.58,0.45)"""
    pattern = r'!\[(img_\d+)\]\(bbox://([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)'
    results = []
    for m in re.finditer(pattern, md_text):
        coords = [float(m.group(2)), float(m.group(3)),
                  float(m.group(4)), float(m.group(5))]
        # 归一化坐标：所有值都 <= 1.0
        if all(c <= 1.0 for c in coords):
            results.append({"id": m.group(1), "bbox_norm": coords})
    return results


def parse_pixel_bbox(md_text: str) -> list[dict]:
    """解析像素坐标占位符 ![img_xxx](bbox://120,340,580,720)"""
    pattern = r'!\[(img_\d+)\]\(bbox://(\d+),(\d+),(\d+),(\d+)\)'
    results = []
    for m in re.finditer(pattern, md_text):
        coords = [int(m.group(2)), int(m.group(3)),
                  int(m.group(4)), int(m.group(5))]
        # 像素坐标：至少有一个值 > 1
        if any(c > 1 for c in coords):
            results.append({"id": m.group(1), "bbox_pixel": coords})
    return results


def crop_images(image_path: str, bboxes: list[dict], output_dir: str,
                padding: float = 0.01, is_pixel: bool = False) -> dict:
    """裁剪图片，返回 id → 路径 映射"""
    os.makedirs(output_dir, exist_ok=True)
    img = Image.open(image_path)
    w, h = img.size
    print(f"📐 原始图片尺寸: {w} × {h}")
    path_map = {}

    for item in bboxes:
        img_id = item["id"]

        if is_pixel:
            x1, y1, x2, y2 = item["bbox_pixel"]
            pad_px = int(padding * max(w, h))
            x1 = max(0, x1 - pad_px)
            y1 = max(0, y1 - pad_px)
            x2 = min(w, x2 + pad_px)
            y2 = min(h, y2 + pad_px)
        else:
            nx1, ny1, nx2, ny2 = item["bbox_norm"]
            nx1 = max(0.0, nx1 - padding)
            ny1 = max(0.0, ny1 - padding)
            nx2 = min(1.0, nx2 + padding)
            ny2 = min(1.0, ny2 + padding)
            x1, y1 = int(nx1 * w), int(ny1 * h)
            x2, y2 = int(nx2 * w), int(ny2 * h)

        cropped = img.crop((x1, y1, x2, y2))
        filepath = os.path.join(output_dir, f"{img_id}.png")
        cropped.save(filepath)
        path_map[img_id] = filepath
        print(f"  ✅ {img_id}: ({x1},{y1},{x2},{y2}) → {filepath}")

    return path_map


def replace_placeholders(md_text: str, path_map: dict) -> str:
    """将 bbox 占位符替换为本地图片路径"""
    def replacer(m):
        img_id = m.group(1)
        return f"![{img_id}]({path_map[img_id]})" if img_id in path_map else m.group(0)

    pattern = r'!\[(img_\d+)\]\(bbox://[\d.,]+\)'
    return re.sub(pattern, replacer, md_text)


def main():
    parser = argparse.ArgumentParser(
        description="OCR Markdown 后处理：裁剪图片并替换占位符（兼容归一化/像素坐标）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python postprocess.py --image 原图.png --markdown ocr_output.md
  python postprocess.py --image 原图.png --markdown ocr_output.md --output-dir ./imgs --output-md final.md
  python postprocess.py --image 原图.png --markdown ocr_output.md --padding 0.02
        """,
    )
    parser.add_argument("--image", required=True, help="原始文档图片路径")
    parser.add_argument("--markdown", required=True, help="OCR 输出的 Markdown 文件路径")
    parser.add_argument("--output-dir", default="./cropped_images", help="裁剪图片保存目录")
    parser.add_argument("--output-md", default=None, help="最终 Markdown 输出路径（默认覆盖原文件）")
    parser.add_argument("--padding", type=float, default=0.01,
                        help="裁剪扩展比例（默认 0.01 即 1%%）")
    args = parser.parse_args()

    for f in [args.image, args.markdown]:
        if not os.path.exists(f):
            print(f"❌ 找不到文件: {f}")
            return

    with open(args.markdown, "r", encoding="utf-8") as f:
        md_text = f.read()

    # 自动判断坐标类型
    bboxes = parse_normalized_bbox(md_text)
    is_pixel = False

    if not bboxes:
        bboxes = parse_pixel_bbox(md_text)
        if bboxes:
            is_pixel = True
            print("📌 检测到像素坐标格式")
        else:
            print("📭 未检测到 bbox 占位符，无需处理。")
            return
    else:
        print("📌 检测到归一化坐标格式")

    print(f"🔍 检测到 {len(bboxes)} 个图片区域\n")
    path_map = crop_images(args.image, bboxes, args.output_dir,
                           padding=args.padding, is_pixel=is_pixel)
    final_md = replace_placeholders(md_text, path_map)

    output_path = args.output_md or args.markdown
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(final_md)

    print(f"\n🎉 完成！文档: {output_path} | 图片: {args.output_dir}/")


if __name__ == "__main__":
    main()
