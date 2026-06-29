from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from services.skill_category_classifier import infer_skill_category_from_library


def _category(slug: str, name: str) -> SimpleNamespace:
    return SimpleNamespace(slug=slug, name=name)


def _session_with_categories(categories: list[SimpleNamespace]) -> MagicMock:
    scalar_result = SimpleNamespace(all=MagicMock(return_value=categories))
    session = MagicMock()
    session.scalars.return_value = scalar_result
    return session


def _item(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "slug": "skill",
        "name": "Generic Helper",
        "description": "",
        "categories": [],
        "skill_markdown": "# Generic Helper",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_infer_category_uses_skill_markdown_frontmatter() -> None:
    session = _session_with_categories(
        [
            _category("frontend-design", "前端设计"),
            _category("document-processing", "文档处理"),
            _category("other", "其他"),
        ]
    )
    item = _item(
        skill_markdown="""---
name: React UI Builder
description: Build frontend React and Tailwind interfaces.
tags:
  - react
  - ui
---
# React UI Builder
""",
    )

    categories = infer_skill_category_from_library(session, item)

    assert categories == [{"slug": "frontend-design", "name": "前端设计"}]


def test_infer_category_uses_markdown_body_tokens_with_low_weight() -> None:
    session = _session_with_categories(
        [
            _category("browser-automation", "浏览器自动化"),
            _category("document-processing", "文档处理"),
            _category("other", "其他"),
        ]
    )
    item = _item(
        name="Research Helper",
        description="",
        skill_markdown="# Research Helper\nUse Playwright and Chrome to automate browser workflows.",
    )

    categories = infer_skill_category_from_library(session, item)

    assert categories == [{"slug": "browser-automation", "name": "浏览器自动化"}]


def test_infer_category_prefers_crawler_categories_over_markdown_body() -> None:
    session = _session_with_categories(
        [
            _category("frontend-design", "前端设计"),
            _category("document-processing", "文档处理"),
            _category("other", "其他"),
        ]
    )
    item = _item(
        categories=["document", "pdf"],
        skill_markdown="# React UI Builder\nBuild frontend React and Tailwind interfaces.",
    )

    categories = infer_skill_category_from_library(session, item)

    assert categories == [{"slug": "document-processing", "name": "文档处理"}]

