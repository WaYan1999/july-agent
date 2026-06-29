from __future__ import annotations

import logging
import re
from collections import Counter
from collections.abc import Iterable
from typing import Any, Protocol, TypedDict

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session, scoped_session

from models import SkillCategory

logger = logging.getLogger(__name__)

SessionLike = Session | scoped_session
DEFAULT_CATEGORY_SLUG = "other"
BODY_TOKEN_FREQUENCY_LIMIT = 3

LOCAL_CATEGORY_MATCH_WORDS_BY_SLUG: dict[str, tuple[str, ...]] = {
    "programming-development": (
        "编程",
        "开发",
        "代码",
        "programming",
        "development",
        "code",
        "coding",
        "git",
        "github",
        "python",
        "typescript",
        "javascript",
    ),
    "development": (
        "编程",
        "开发",
        "代码",
        "programming",
        "development",
        "code",
        "coding",
        "git",
        "github",
        "python",
        "typescript",
        "javascript",
    ),
    "testing-debugging": (
        "测试",
        "调试",
        "质量",
        "test",
        "testing",
        "debug",
        "debugging",
        "pytest",
        "playwright",
        "vitest",
        "coverage",
    ),
    "testing": (
        "测试",
        "调试",
        "质量",
        "test",
        "testing",
        "debug",
        "debugging",
        "pytest",
        "playwright",
        "vitest",
        "coverage",
    ),
    "code-review": (
        "代码审查",
        "代码评审",
        "审查",
        "评审",
        "code review",
        "review",
        "lint",
        "static analysis",
    ),
    "frontend-design": (
        "前端",
        "设计",
        "页面",
        "frontend",
        "front-end",
        "react",
        "vue",
        "next.js",
        "ui",
        "ux",
        "css",
        "tailwind",
        "figma",
        "prototype",
    ),
    "frontend": (
        "前端",
        "页面",
        "frontend",
        "front-end",
        "react",
        "vue",
        "next.js",
        "ui",
        "ux",
        "css",
        "tailwind",
    ),
    "design": ("设计", "ui", "ux", "figma", "prototype"),
    "document-processing": (
        "文档",
        "表格",
        "pdf",
        "document",
        "markdown",
        "readme",
        "docx",
        "excel",
        "spreadsheet",
        "csv",
        "table",
    ),
    "document": (
        "文档",
        "表格",
        "pdf",
        "document",
        "markdown",
        "readme",
        "docx",
        "excel",
        "spreadsheet",
        "csv",
        "table",
    ),
    "image-generation": (
        "图像",
        "图片",
        "生成",
        "多媒体",
        "image",
        "images",
        "generation",
        "generate",
        "media",
        "vision",
        "ocr",
        "audio",
        "video",
    ),
    "media": ("图像", "图片", "多媒体", "image", "media", "vision", "ocr", "audio", "video"),
    "data-analysis": (
        "数据",
        "分析",
        "数据库",
        "data",
        "analysis",
        "analytics",
        "database",
        "sql",
        "sqlite",
        "postgres",
        "mysql",
        "json",
        "dataset",
    ),
    "data": (
        "数据",
        "分析",
        "数据库",
        "data",
        "analysis",
        "analytics",
        "database",
        "sql",
        "sqlite",
        "postgres",
        "mysql",
        "json",
        "dataset",
    ),
    "browser-automation": (
        "浏览器",
        "自动化",
        "browser",
        "automation",
        "web automation",
        "selenium",
        "playwright",
        "chrome",
        "scraping",
    ),
    "automation": ("自动化", "automation", "workflow", "schedule", "cron", "agent"),
    "tools": (
        "工具",
        "工具箱",
        "工具调用",
        "tool",
        "tools",
        "toolbox",
        "tool calling",
        "function calling",
        "mcp",
        "api",
        "openapi",
        "swagger",
        "plugin",
        "external tool",
    ),
    "content-creation": (
        "内容",
        "写作",
        "创作",
        "文案",
        "content",
        "creation",
        "writing",
        "copywriting",
        "article",
        "blog",
    ),
    "project-management": (
        "项目",
        "管理",
        "任务",
        "project",
        "management",
        "task",
        "todo",
        "calendar",
        "meeting",
        "email",
    ),
    "productivity": ("效率", "任务", "项目", "productivity", "task", "todo", "calendar", "meeting", "email"),
    "enterprise-systems": (
        "企业",
        "系统",
        "oa",
        "erp",
        "crm",
        "enterprise",
        "system",
        "business",
        "workflow",
        "approval",
    ),
    "official": ("官方", "official", "dify", "openai"),
    "other": ("其他", "other", "misc", "miscellaneous"),
}


class SkillCategorySourceItem(Protocol):
    slug: str
    name: str
    description: str
    categories: list[str]
    skill_markdown: str | None


class InferredCategory(TypedDict):
    slug: str
    name: str


class CategoryEvidence(TypedDict):
    words: list[str]
    weight: int


def _normalize_match_text(value: object) -> str:
    return str(value or "").strip().lower()


def _split_category_slug(slug: str) -> list[str]:
    return [part for part in slug.replace("_", "-").replace(":", "-").split("-") if part]


def _load_skill_categories(session: SessionLike) -> list[SkillCategory]:
    stmt = select(SkillCategory).order_by(SkillCategory.position.asc(), SkillCategory.name.asc())
    return list(session.scalars(stmt).all())


def _score_match_word(category: SkillCategory, word: str) -> int:
    score = 0
    normalized_word = _normalize_match_text(word)
    if not normalized_word:
        return score

    slug = _normalize_match_text(category.slug)
    name = _normalize_match_text(category.name)
    slug_parts = _split_category_slug(slug)
    synonyms = LOCAL_CATEGORY_MATCH_WORDS_BY_SLUG.get(slug, ())

    if normalized_word == slug:
        score += 120
    if normalized_word == name:
        score += 100
    if normalized_word in slug_parts:
        score += 80
    if normalized_word in name or normalized_word in slug:
        score += 30
    if normalized_word in synonyms:
        score += 60
    for synonym in synonyms:
        normalized_synonym = _normalize_match_text(synonym)
        if normalized_synonym and (normalized_word in normalized_synonym or normalized_synonym in normalized_word):
            score += 15
    return score


def _score_local_category(category: SkillCategory, evidence_groups: list[CategoryEvidence]) -> int:
    score = 0
    for evidence in evidence_groups:
        for word in evidence["words"]:
            score += _score_match_word(category, word) * evidence["weight"]
    return score


def _markdown_frontmatter(markdown: str) -> tuple[dict[str, Any], str]:
    match = re.match(r"\A---\s*\n(.*?)\n---\s*(?:\n|$)(.*)\Z", markdown, flags=re.DOTALL)
    if match is None:
        return {}, markdown
    try:
        parsed = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        logger.warning("failed to parse skill markdown frontmatter", exc_info=True)
        return {}, match.group(2)
    if not isinstance(parsed, dict):
        return {}, match.group(2)
    return parsed, match.group(2)


def _coerce_words(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in re.split(r"[,，\n]+", value) if item.strip()]
    if isinstance(value, Iterable):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()]


def _tokenize_text(text: str) -> list[str]:
    normalized_text = _normalize_match_text(text)
    if not normalized_text:
        return []

    words = [normalized_text]
    try:
        import jieba

        words.extend(str(token).strip().lower() for token in jieba.lcut(normalized_text) if str(token).strip())
    except ImportError:
        pass
    words.extend(
        match.group(0).lower()
        for match in re.finditer(r"[\u4e00-\u9fff]+|[a-z0-9][a-z0-9.+#-]*", normalized_text)
    )
    return [word for word in words if word]


def _limited_body_tokens(markdown_body: str) -> list[str]:
    counter = Counter(_tokenize_text(markdown_body))
    words: list[str] = []
    for word, count in counter.items():
        words.extend([word] * min(count, BODY_TOKEN_FREQUENCY_LIMIT))
    return words


def extract_skill_category_evidence(item: SkillCategorySourceItem) -> list[CategoryEvidence]:
    evidence_groups: list[CategoryEvidence] = []
    crawler_categories = [_normalize_match_text(word) for word in getattr(item, "categories", []) if word]
    if crawler_categories:
        evidence_groups.append({"words": crawler_categories, "weight": 30})

    markdown = getattr(item, "skill_markdown", None) or ""
    frontmatter, markdown_body = _markdown_frontmatter(markdown)
    frontmatter_words: list[str] = []
    for field_name in ("name", "description", "tags", "categories"):
        raw_value = frontmatter.get(field_name)
        for word in _coerce_words(raw_value):
            frontmatter_words.extend(_tokenize_text(word))
    if frontmatter_words:
        evidence_groups.append({"words": frontmatter_words, "weight": 12})

    headings = re.findall(r"^#\s+(.+)$", markdown_body, flags=re.MULTILINE)
    heading_words: list[str] = []
    for heading in headings[:3]:
        heading_words.extend(_tokenize_text(heading))
    if heading_words:
        evidence_groups.append({"words": heading_words, "weight": 10})

    summary_words = _tokenize_text(getattr(item, "name", "")) + _tokenize_text(getattr(item, "description", ""))
    if summary_words:
        evidence_groups.append({"words": summary_words, "weight": 6})

    body_words = _limited_body_tokens(markdown_body)
    if body_words:
        evidence_groups.append({"words": body_words, "weight": 1})

    return evidence_groups


def infer_skill_category_from_library(
    session: SessionLike,
    item: SkillCategorySourceItem,
) -> list[InferredCategory]:
    categories = _load_skill_categories(session)
    if not categories:
        logger.warning("skip skill category binding because local skill category library is empty")
        return []

    evidence_groups = extract_skill_category_evidence(item)
    scored: list[tuple[int, int, SkillCategory]] = []
    for index, category in enumerate(categories):
        score = _score_local_category(category, evidence_groups)
        if score > 0:
            scored.append((score, index, category))

    if scored:
        _, _, category = min(scored, key=lambda value: (-value[0], value[1], value[2].slug))
        return [{"slug": category.slug, "name": category.name}]

    fallback = next((category for category in categories if category.slug == DEFAULT_CATEGORY_SLUG), None)
    if fallback is None:
        logger.warning(
            "skip skill category binding because no category words matched and fallback category is missing",
            extra={"skill_slug": getattr(item, "slug", None), "fallback_category": DEFAULT_CATEGORY_SLUG},
        )
        return []
    return [{"slug": fallback.slug, "name": fallback.name}]
