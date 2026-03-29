"""
复杂文档 RAG 的共享辅助函数。

这些函数只依赖标准库和项目数据模型，便于单元测试和复用。
"""

import os
from typing import Any

from app.data_models import ImageDescription
from app.config import INGESTION_OUTPUT_ROOT


IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg")


def project_root_from_file(filepath: str) -> str:
    """Return the project root directory (parent of the ``app/`` package)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(filepath)))


def get_artifacts_root() -> str:
    """Return the ingestion output root directory."""
    return INGESTION_OUTPUT_ROOT


def list_image_filenames(image_dir: str) -> list[str]:
    """列出目录中的真实图片文件，忽略隐藏文件和非图片文件。"""
    return sorted(
        filename
        for filename in os.listdir(image_dir)
        if filename.lower().endswith(IMAGE_EXTENSIONS)
        and os.path.isfile(os.path.join(image_dir, filename))
    )


def list_document_files(docs_dir: str) -> list[str]:
    """列出目录中的真实文档文件，忽略 .gitkeep 等占位文件。"""
    return sorted(
        filename
        for filename in os.listdir(docs_dir)
        if not filename.startswith(".")
        and os.path.isfile(os.path.join(docs_dir, filename))
    )


def make_image_id(index: int) -> str:
    """生成稳定的图片 ID。"""
    return f"img_{index:05d}"


def build_description_payload(
    desc: ImageDescription, image_path: str, project_root: str
) -> dict[str, Any]:
    """将图片描述和源文件信息一起序列化为 JSON 记录。"""
    abs_image_path = os.path.abspath(image_path)
    rel_image_path = os.path.relpath(abs_image_path, project_root)

    return {
        "summary": desc.summary,
        "detailed_description": desc.detailed_description,
        "nodes": desc.nodes,
        "external_references": [
            {"target": ref.target, "context": ref.context}
            for ref in desc.external_references
        ],
        "tags": desc.tags,
        "source_image_path": rel_image_path,
        "source_image_filename": os.path.basename(abs_image_path),
    }


def resolve_source_image_path(
    img_id: str, desc_data: dict[str, Any], project_root: str
) -> str:
    """
    解析图片原文件路径。

    新数据优先使用 step1 保存的真实路径；旧数据再退回到历史命名约定。
    """
    candidate_paths: list[str] = []

    stored_path = desc_data.get("source_image_path") or desc_data.get("image_path")
    if stored_path:
        if os.path.isabs(stored_path):
            candidate_paths.append(stored_path)
        else:
            candidate_paths.append(os.path.join(project_root, stored_path))

    stored_filename = desc_data.get("source_image_filename")
    if stored_filename:
        candidate_paths.append(os.path.join(project_root, "images", stored_filename))

    for extension in IMAGE_EXTENSIONS:
        candidate_paths.append(os.path.join(project_root, "images", f"{img_id}{extension}"))

    for candidate_path in candidate_paths:
        if candidate_path and os.path.exists(candidate_path):
            return os.path.abspath(candidate_path)

    raise FileNotFoundError(
        f"找不到图片原文件: {img_id}，已尝试 {candidate_paths}"
    )
