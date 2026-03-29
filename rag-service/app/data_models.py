"""
============================================================
统一数据模型定义
============================================================
本文件定义系统中所有核心数据结构。
所有阶段的代码都使用这些统一的数据模型，确保数据格式一致。

数据模型概览：
    - Resource:          统一资源结构（图片或文档）
    - ImageDescription:  LLM 生成的图片描述（结构化输出）
    - ExternalReference: 引用关系（图片→文档 或 文档→图片）
    - DocReference:      从文档中提取的引用信息
============================================================
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ExternalReference:
    """
    外部引用关系
    --------------------------------------------------------
    描述一个资源对另一个资源的引用。
    例如：某张流程图中的节点B引用了"接口文档v2"

    属性:
        target:  引用目标的名称或ID（如 "接口文档v2"、"doc_003"）
        context: 引用发生的上下文（如 "节点B引用了接口文档v2"）
    """
    target: str
    context: str


@dataclass
class ImageDescription:
    """
    LLM 生成的图片结构化描述
    --------------------------------------------------------
    这是整个系统的基础数据结构。多模态 LLM（如 GPT-4o）分析一张流程图后，
    会返回以下结构化信息。Prompt 设计见 step1_image_description.py

    属性:
        summary:              一段话概括这张流程图的作用
        detailed_description: 详细描述流程的每个步骤（用于生成 embedding）
        nodes:                流程图中的节点名称列表
        external_references:  图片中引用的外部资源列表
        tags:                 相关标签（用于元数据过滤）
    """
    summary: str
    detailed_description: str
    nodes: list[str] = field(default_factory=list)
    external_references: list[ExternalReference] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "ImageDescription":
        """从 LLM 返回的 JSON dict 构造 ImageDescription 对象"""
        refs = [
            ExternalReference(target=r["target"], context=r["context"])
            for r in data.get("external_references", [])
        ]
        return cls(
            summary=data.get("summary", ""),
            detailed_description=data.get("detailed_description", ""),
            nodes=data.get("nodes", []),
            external_references=refs,
            tags=data.get("tags", []),
        )


@dataclass
class Resource:
    """
    统一资源结构
    --------------------------------------------------------
    每个资源（图片或文档）在系统中对应一个统一的数据结构。

    属性:
        id:              唯一标识（如 "img_001"、"doc_003"）
        type:            资源类型（如 "mermaid_flowchart"、"api_doc"、"design_doc"）
        storage_path:    存储路径
        description:     LLM 生成的描述文本
        embedding:       描述文本的向量表示（由 embedding 模型生成）
        references_to:   本资源引用的其他资源列表
        referenced_by:   引用本资源的其他资源列表
        tags:            相关标签
        nodes_in_chart:  流程图中的节点名称（仅图片类型有值）
    """
    id: str
    type: str
    storage_path: str = ""
    description: str = ""
    embedding: list[float] = field(default_factory=list)
    references_to: list[dict] = field(default_factory=list)
    referenced_by: list[dict] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    nodes_in_chart: list[str] = field(default_factory=list)


@dataclass
class DocReference:
    """
    从文档中提取的引用信息
    --------------------------------------------------------
    处理文档时，通过正则 + LLM 扫描文档内容，提取其中对图片的引用。

    属性:
        source_id:   引用来源的文档ID
        target_hint: 引用目标的线索（如 "3.2"、"流程图A"）
        context:     引用的原始文本上下文（如 "如图 3.2 所示"）
        matched_id:  匹配到的实际资源ID（匹配后填入，初始为空）
    """
    source_id: str
    target_hint: str
    context: str
    matched_id: Optional[str] = None
