---
name: "内容创作工具包 (Content Skills)"
emoji: "📌"
description: "A collection of content creation and publishing skills. Routes to specialized sub-skills for image generation, infographics, slides, comics, WeChat publishing, and more. Use when user asks to create visual content, social media posts, presentations, or publish to platforms."
---

# 内容创作工具包 (Content Skills)

This is a **skill collection** containing 9 specialized sub-skills for content creation and publishing. When the user requests any of the following tasks, load and use the corresponding sub-skill's `SKILL.md` from its subdirectory.

## Sub-Skills Directory

| Sub-Skill | Directory | Trigger Keywords | Description |
|---|---|---|---|
| **小红书图片** | `baoyu-xhs-images/` | 小红书图片, XHS images, RedNote, 小红书种草 | Generates Xiaohongshu infographic series (10 styles, 8 layouts, 1-10 images) |
| **信息图** | `baoyu-infographic/` | infographic, 信息图, 可视化, 高密度信息大图 | Professional infographics (21 layouts × 20 styles) |
| **封面图** | `baoyu-cover-image/` | cover image, 封面图, article cover | Article cover images (9 palettes × 6 rendering styles, 3 aspect ratios) |
| **幻灯片** | `baoyu-slide-deck/` | slides, PPT, presentation, deck | Professional slide deck images from content |
| **知识漫画** | `baoyu-comic/` | 知识漫画, 教育漫画, comic, Logicomix | Educational comics with multiple art styles and panel layouts |
| **文章配图** | `baoyu-article-illustrator/` | illustrate article, 为文章配图, add images | Analyzes articles and generates contextual illustrations |
| **AI 图片生成** | `baoyu-image-gen/` | generate image, create image, draw, 画图 | Text-to-image via OpenAI/Google/DashScope/Replicate APIs |
| **Markdown 转 HTML** | `baoyu-markdown-to-html/` | markdown to html, md转html, styled HTML | Converts Markdown to themed HTML (WeChat-compatible) |
| **发布微信公众号** | `baoyu-post-to-wechat/` | 发布公众号, post to wechat, 微信公众号, 贴图 | Posts articles or image-text content to WeChat Official Account |

## Routing Rules

1. **Match user intent** against the trigger keywords above
2. **Load the sub-skill**: Read the full `SKILL.md` from the matching subdirectory (e.g., `baoyu-xhs-images/SKILL.md`)
3. **Follow the sub-skill's instructions** for the complete workflow, including any `references/` files it specifies
4. If the user's request is ambiguous, list the available sub-skills and ask which one to use
5. Multiple sub-skills can be chained (e.g., write article → generate cover → publish to WeChat)
