"""
============================================================
Step 1: Image Description Generation
============================================================
Sends each image to a vision LLM to generate structured
natural-language descriptions.

Credentials (API key, base URL, model name) are passed as
function parameters — no module-level globals.
============================================================
"""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import TYPE_CHECKING

from openai import OpenAI as OpenAIClient

from app.config import RequestCredentials
from app.data_models import ImageDescription
from app.pipeline_utils import (
    build_description_payload,
    list_image_filenames,
    make_image_id,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ============================================================
# Prompt
# ============================================================

DESCRIBE_PROMPT = """
Please analyze this diagram/image and return JSON format.

Requirements:
- summary: one sentence, under 20 words
- detailed_description: concise summary under 100 words, covering only core flow and key steps
- nodes: list only key node names (verbatim)
- external_references: extract only explicitly mentioned external documents/systems/interfaces
- tags: 3-5 keywords

{
  "summary": "One sentence summarizing the diagram topic",
  "detailed_description": "Concise description of core flow (under 100 words)",
  "nodes": ["key node names"],
  "external_references": [
    {"target": "external resource name", "context": "where it appears"}
  ],
  "tags": ["keywords"]
}
Return JSON only, nothing else.
"""


def describe_image(
    image_path: str,
    creds: RequestCredentials,
) -> ImageDescription:
    """
    Generate a structured description for a single image.

    Uses the LLM API key and model from ``creds``.
    """
    client = OpenAIClient(
        api_key=creds.llm_api_key,
        base_url=creds.llm_base_url or None,
    )

    with open(image_path, "rb") as f:
        base64_image = base64.b64encode(f.read()).decode("utf-8")

    ext = os.path.splitext(image_path)[1].lower()
    mime_type = "image/png" if ext == ".png" else "image/jpeg"

    response = client.chat.completions.create(
        model=creds.llm_model,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": DESCRIBE_PROMPT},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{base64_image}"
                    },
                },
            ],
        }],
        max_tokens=2000,
    )

    result_text = response.choices[0].message.content.strip()

    # Strip markdown code fences if present
    if result_text.startswith("```json"):
        result_text = result_text[7:]
    elif result_text.startswith("```"):
        result_text = result_text[3:]
    if result_text.endswith("```"):
        result_text = result_text[:-3]
    result_text = result_text.strip()

    raw_data = json.loads(result_text)
    return ImageDescription.from_dict(raw_data)


def batch_describe_images(
    image_dir: str,
    creds: RequestCredentials,
    project_root: str | None = None,
) -> dict[str, dict]:
    """
    Batch-generate descriptions for all images in a directory.

    Returns dict mapping image_id to description payload.
    """
    results = {}
    filenames = list_image_filenames(image_dir)

    for idx, filename in enumerate(filenames):
        img_path = os.path.join(image_dir, filename)
        img_id = make_image_id(idx)

        logger.info("[%d] Processing: %s -> %s", idx + 1, filename, img_id)

        try:
            desc = describe_image(img_path, creds)
            results[img_id] = build_description_payload(
                desc, img_path, project_root or os.path.dirname(image_dir)
            )
            logger.info("    + summary: %s...", desc.summary[:50])
        except json.JSONDecodeError as e:
            logger.warning("    ! JSON parse failed: %s", e)
        except Exception as e:
            logger.warning("    ! Processing failed: %s", e)

    logger.info("Done! Processed %d/%d images", len(results), len(filenames))
    return results


def save_descriptions(
    results: dict[str, dict],
    output_path: str = "image_descriptions.json",
) -> None:
    """Save description results to a JSON file."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    logger.info("Descriptions saved to: %s", output_path)
