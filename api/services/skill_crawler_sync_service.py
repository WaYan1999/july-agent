"""爬虫服务器 Skill 库同步服务。

本模块只负责把可信爬虫服务器返回的 Skill 增量数据规范化后写入本地
marketplace Skill 表。原始响应先保存为 JSON 快照，完整处理成功后删除；
失败时保留快照方便排查，同步查询展示仍以数据库为准。
"""

from __future__ import annotations

import json
import logging
import tempfile
from collections import Counter
from collections.abc import Callable, Mapping
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Literal, NotRequired, TypedDict
from urllib.parse import urljoin

import httpx
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, scoped_session

from configs import dify_config
from core.helper import ssrf_proxy
from models import (
    Skill,
    SkillAuditStatus,
    SkillCategory,
    SkillCategoryBinding,
    SkillContentType,
    SkillPublicationStatus,
    SkillSourceType,
    SkillTag,
    SkillTagBinding,
    SkillVersion,
)
from services.admin_skill_service import SLUG_PATTERN, AdminSkillService

logger = logging.getLogger(__name__)

SessionLike = Session | scoped_session
RequestGet = Callable[..., httpx.Response]
SyncStatus = Literal["published", "unlisted", "archived", "deleted"]
DEFAULT_PAGE_LIMIT = 50
MAX_SYNC_PAGES = 1000
DEFAULT_SNAPSHOT_DIR_NAME = "dify-skill-crawler-sync"
DEFAULT_CATEGORY_SLUG = "other"
DEFAULT_CRAWLER_CONTENT_TYPE = SkillContentType.MARKDOWN_FILE

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


class SkillCrawlerSyncError(RuntimeError):
    """爬虫同步失败的受控异常。"""

    snapshot_path: str | None

    def __init__(self, message: str, *, snapshot_path: str | None = None) -> None:
        super().__init__(message)
        self.snapshot_path = snapshot_path


class SkillCrawlerSyncItem(BaseModel):
    slug: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=20000)
    author_name: str | None = Field(default=None, max_length=255)
    source_type: SkillSourceType
    source_url: str | None = Field(default=None, max_length=1024)
    install_command: str | None = None
    install_count: int = Field(default=0, ge=0)
    github_stars: int = Field(default=0, ge=0)
    content_type: SkillContentType = DEFAULT_CRAWLER_CONTENT_TYPE
    categories: list[str] = Field(default_factory=list, max_length=20)
    tags: list[str] = Field(default_factory=list, max_length=20)
    skill_markdown: str | None = None
    status: SyncStatus
    updated_at: datetime

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _infer_content_type_from_payload(cls, value: object) -> object:
        if not isinstance(value, Mapping):
            return value
        normalized = dict(value)
        if str(normalized.get("content_type") or "").strip():
            return normalized
        skill_markdown = normalized.get("skill_markdown")
        normalized["content_type"] = (
            SkillContentType.MARKDOWN_FILE.value
            if isinstance(skill_markdown, str) and skill_markdown.strip()
            else SkillContentType.REMOTE_REFERENCE.value
        )
        return normalized

    @field_validator("slug")
    @classmethod
    def _validate_slug(cls, value: str) -> str:
        normalized = value.strip()
        if not SLUG_PATTERN.match(normalized):
            raise ValueError("slug is invalid")
        return normalized

    @field_validator("source_type", mode="before")
    @classmethod
    def _normalize_source_type(cls, value: object) -> str:
        normalized = str(value).strip().lower()
        if normalized == "官网":
            return SkillSourceType.OFFICIAL.value
        if normalized == "本站":
            return SkillSourceType.SITE.value
        if normalized == "其他来源":
            return SkillSourceType.OTHER.value
        return normalized

    @field_validator("content_type", mode="before")
    @classmethod
    def _normalize_content_type(cls, value: object) -> str:
        normalized = str(value or "").strip().lower()
        if not normalized:
            return DEFAULT_CRAWLER_CONTENT_TYPE.value
        aliases = {
            "远程拉取": SkillContentType.REMOTE_REFERENCE.value,
            "遠端拉取": SkillContentType.REMOTE_REFERENCE.value,
            "远程引用": SkillContentType.REMOTE_REFERENCE.value,
            "遠端引用": SkillContentType.REMOTE_REFERENCE.value,
            "remote": SkillContentType.REMOTE_REFERENCE.value,
            "remote_reference": SkillContentType.REMOTE_REFERENCE.value,
            "zip": SkillContentType.ZIP_PACKAGE.value,
            "zip包": SkillContentType.ZIP_PACKAGE.value,
            "zip 包": SkillContentType.ZIP_PACKAGE.value,
            "zip套件": SkillContentType.ZIP_PACKAGE.value,
            "zip 套件": SkillContentType.ZIP_PACKAGE.value,
            "zip_package": SkillContentType.ZIP_PACKAGE.value,
            "markdown": SkillContentType.MARKDOWN_FILE.value,
            "markdown文档": SkillContentType.MARKDOWN_FILE.value,
            "markdown 文档": SkillContentType.MARKDOWN_FILE.value,
            "markdown檔案": SkillContentType.MARKDOWN_FILE.value,
            "markdown 檔案": SkillContentType.MARKDOWN_FILE.value,
            "markdown_file": SkillContentType.MARKDOWN_FILE.value,
        }
        return aliases.get(normalized, normalized)

    @field_validator("categories", mode="before")
    @classmethod
    def _normalize_category_words(cls, value: object) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("categories must be a list")
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            word = str(item).strip().lower()
            if not word or word in seen:
                continue
            seen.add(word)
            normalized.append(word)
        return normalized

    @field_validator("tags", mode="before")
    @classmethod
    def _normalize_taxonomy_list(cls, value: object) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("taxonomy must be a list")
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            slug = str(item).strip().lower()
            if not slug:
                continue
            if not SLUG_PATTERN.match(slug):
                raise ValueError("taxonomy slug is invalid")
            if slug not in seen:
                seen.add(slug)
                normalized.append(slug)
        return normalized

    @model_validator(mode="after")
    def _validate_markdown_for_importable_items(self) -> SkillCrawlerSyncItem:
        if (
            self.status != "deleted"
            and self.content_type == SkillContentType.MARKDOWN_FILE
            and not (self.skill_markdown and self.skill_markdown.strip())
        ):
            raise ValueError("markdown skill must include skill_markdown")
        return self


class SkillCrawlerSyncPage(BaseModel):
    data: list[dict[str, Any]]
    page: int = Field(ge=1)
    limit: int = Field(ge=1, le=500)
    has_more: bool = False
    next_page: int | None = Field(default=None, ge=1)
    sync_window: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")


class SkillCrawlerSyncResult(BaseModel):
    fetched_count: int = 0
    imported_count: int = 0
    updated_count: int = 0
    version_created_count: int = 0
    archived_count: int = 0
    skipped_count: int = 0
    groups_by_category: dict[str, int] = Field(default_factory=dict)
    groups_by_tag: dict[str, int] = Field(default_factory=dict)
    snapshot_path: str | None = None


class _SkillSnapshot(TypedDict):
    generated_at: str
    from_date: str
    to_date: str
    pages: list[Mapping[str, Any]]


class _SkillValues(TypedDict):
    slug: str
    name: str
    description: str
    author_name: str | None
    source_type: SkillSourceType
    source_url: str | None
    install_command: str | None
    install_count: int
    github_stars: int
    publication_status: SkillPublicationStatus
    audit_status: SkillAuditStatus
    categories: list[str]
    tags: list[str]
    content_type: SkillContentType
    skill_markdown: str | None
    published_at: NotRequired[datetime | None]


def _json_default(value: object) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def default_skill_crawler_snapshot_dir() -> Path:
    return Path(tempfile.gettempdir()) / DEFAULT_SNAPSHOT_DIR_NAME


class _InferredCategory(TypedDict):
    slug: str
    name: str


def _normalize_match_text(value: object) -> str:
    return str(value or "").strip().lower()


def _split_category_slug(slug: str) -> list[str]:
    return [part for part in slug.replace("_", "-").replace(":", "-").split("-") if part]


def _load_skill_categories(session: SessionLike) -> list[SkillCategory]:
    stmt = select(SkillCategory).order_by(SkillCategory.position.asc(), SkillCategory.name.asc())
    return list(session.scalars(stmt).all())


def _score_local_category(category: SkillCategory, category_words: list[str]) -> int:
    score = 0
    slug = _normalize_match_text(category.slug)
    name = _normalize_match_text(category.name)
    slug_parts = _split_category_slug(slug)
    match_words = [word for word in (_normalize_match_text(word) for word in category_words) if word]
    synonyms = LOCAL_CATEGORY_MATCH_WORDS_BY_SLUG.get(slug, ())

    for index, word in enumerate(match_words):
        weight = max(1, len(match_words) - index)
        if word == slug:
            score += 120 * weight
        if word == name:
            score += 100 * weight
        if word in slug_parts:
            score += 80 * weight
        if word and (word in name or word in slug):
            score += 30 * weight
        if word in synonyms:
            score += 60 * weight
        for synonym in synonyms:
            normalized_synonym = _normalize_match_text(synonym)
            if word and normalized_synonym and (word in normalized_synonym or normalized_synonym in word):
                score += 15 * weight
    return score


def infer_skill_category_from_library(session: SessionLike, item: SkillCrawlerSyncItem) -> list[_InferredCategory]:
    categories = _load_skill_categories(session)
    if not categories:
        logger.warning("skip skill category binding because local skill category library is empty")
        return []

    scored: list[tuple[int, int, SkillCategory]] = []
    for index, category in enumerate(categories):
        score = _score_local_category(category, item.categories)
        if score > 0:
            scored.append((score, index, category))

    if scored:
        _, _, category = min(scored, key=lambda value: (-value[0], value[1], value[2].slug))
        return [{"slug": category.slug, "name": category.name}]

    fallback = next((category for category in categories if category.slug == DEFAULT_CATEGORY_SLUG), None)
    if fallback is None:
        logger.warning(
            "skip skill category binding because no category words matched and fallback category is missing",
            extra={"skill_slug": item.slug, "fallback_category": DEFAULT_CATEGORY_SLUG},
        )
        return []
    return [{"slug": fallback.slug, "name": fallback.name}]


class SkillCrawlerClient:
    """按日期窗口从爬虫服务器分页拉取 Skill 增量数据。"""

    base_url: str
    token: str
    request_get: RequestGet

    def __init__(self, base_url: str, token: str, request_get: RequestGet | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.request_get = request_get or ssrf_proxy.get

    def fetch_pages(
        self,
        *,
        from_date: date,
        to_date: date,
        limit: int = DEFAULT_PAGE_LIMIT,
        star: int | None = None,
    ) -> list[dict[str, Any]]:
        pages: list[dict[str, Any]] = []
        page = 1
        for _ in range(MAX_SYNC_PAGES):
            payload = self._fetch_page(from_date=from_date, to_date=to_date, page=page, limit=limit, star=star)
            pages.append(payload)
            if not bool(payload.get("has_more")):
                return pages
            next_page = payload.get("next_page")
            page = int(next_page) if next_page else page + 1
        raise SkillCrawlerSyncError(f"crawler pagination exceeded {MAX_SYNC_PAGES} pages")

    def _fetch_page(
        self,
        *,
        from_date: date,
        to_date: date,
        page: int,
        limit: int,
        star: int | None = None,
    ) -> dict[str, Any]:
        url = urljoin(f"{self.base_url}/", "api/v1/skills/getlist")
        params: dict[str, str | int] = {
            "from_date": from_date.isoformat(),
            "to_date": to_date.isoformat(),
            "page": page,
            "limit": limit,
        }
        if star is not None:
            params["star"] = star
        try:
            response = self.request_get(
                url,
                headers={"Accept": "application/json", "Authorization": f"Bearer {self.token}"},
                params=params,
                timeout=httpx.Timeout(30.0, connect=5.0),
            )
        except httpx.RequestError as exc:
            raise SkillCrawlerSyncError(f"crawler request failed: {exc}") from exc

        if response.status_code < 200 or response.status_code >= 300:
            body_preview = getattr(response, "text", "")[:500]
            raise SkillCrawlerSyncError(f"crawler returned HTTP {response.status_code}: {body_preview}")

        try:
            data = response.json()
        except ValueError as exc:
            raise SkillCrawlerSyncError("crawler returned invalid JSON") from exc
        if not isinstance(data, dict):
            raise SkillCrawlerSyncError("crawler JSON root must be an object")
        return data

    @classmethod
    def from_config(cls, *, base_url: str | None = None, token: str | None = None) -> SkillCrawlerClient:
        return cls(
            base_url=str(base_url if base_url is not None else dify_config.SKILL_CRAWLER_API_URL),
            token=str(token if token is not None else dify_config.SKILL_CRAWLER_API_TOKEN),
        )


class SkillCrawlerSyncService:
    """协调快照、过滤、分组和 Skill 入库。"""

    client: SkillCrawlerClient
    snapshot_dir: Path

    def __init__(self, client: SkillCrawlerClient, snapshot_dir: str | Path | None) -> None:
        self.client = client
        self.snapshot_dir = (
            default_skill_crawler_snapshot_dir()
            if snapshot_dir is None or str(snapshot_dir).strip() == ""
            else Path(snapshot_dir)
        )

    @classmethod
    def from_config(cls, *, base_url: str | None = None, token: str | None = None) -> SkillCrawlerSyncService:
        return cls(
            client=SkillCrawlerClient.from_config(base_url=base_url, token=token),
            snapshot_dir=dify_config.SKILL_CRAWLER_SYNC_SNAPSHOT_DIR,
        )

    def sync(
        self,
        *,
        session: SessionLike,
        from_date: date,
        to_date: date,
        limit: int = DEFAULT_PAGE_LIMIT,
        star: int | None = None,
        now: datetime | None = None,
    ) -> SkillCrawlerSyncResult:
        generated_at = now or datetime.now(UTC)
        raw_pages = self.client.fetch_pages(from_date=from_date, to_date=to_date, limit=limit, star=star)
        snapshot_path = self._save_snapshot(
            {
                "generated_at": generated_at.isoformat(),
                "from_date": from_date.isoformat(),
                "to_date": to_date.isoformat(),
                "pages": raw_pages,
            }
        )

        try:
            fetched_count = sum(len(page.get("data", [])) for page in raw_pages if isinstance(page.get("data"), list))
            valid_items, skipped_count = self._validate_and_deduplicate(raw_pages)
            category_counter = Counter[str]()
            tag_counter = Counter[str]()
            for item in valid_items:
                category_counter.update(
                    category["slug"] for category in infer_skill_category_from_library(session, item)
                )
                tag_counter.update(item.tags)

            result = SkillCrawlerSyncResult(
                fetched_count=fetched_count,
                skipped_count=skipped_count,
                groups_by_category=dict(sorted(category_counter.items())),
                groups_by_tag=dict(sorted(tag_counter.items())),
                snapshot_path=snapshot_path,
            )
            for item in valid_items:
                self._upsert_item(session, item=item, result=result)
        except SkillCrawlerSyncError as exc:
            exc.snapshot_path = exc.snapshot_path or snapshot_path
            raise
        except Exception as exc:
            raise SkillCrawlerSyncError(str(exc), snapshot_path=snapshot_path) from exc
        result.snapshot_path = self._delete_snapshot(snapshot_path)
        return result

    def _save_snapshot(self, snapshot: _SkillSnapshot) -> str:
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        filename = f"skill-crawler-sync-{snapshot['from_date']}-{snapshot['to_date']}-{timestamp}.json"
        path = self.snapshot_dir / filename
        path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")
        return path.as_posix()

    @staticmethod
    def _delete_snapshot(snapshot_path: str | None) -> str | None:
        if snapshot_path is None:
            return None
        try:
            Path(snapshot_path).unlink(missing_ok=True)
        except OSError:
            logger.warning("failed to delete skill crawler sync snapshot", extra={"snapshot_path": snapshot_path})
            return snapshot_path
        return None

    def _validate_and_deduplicate(self, raw_pages: list[Mapping[str, Any]]) -> tuple[list[SkillCrawlerSyncItem], int]:
        latest_by_slug: dict[str, SkillCrawlerSyncItem] = {}
        skipped_count = 0
        for raw_page in raw_pages:
            try:
                page = SkillCrawlerSyncPage.model_validate(raw_page)
            except ValueError:
                logger.warning("skip invalid crawler page", exc_info=True)
                skipped_count += len(raw_page.get("data", [])) if isinstance(raw_page.get("data"), list) else 1
                continue
            for raw_item in page.data:
                try:
                    item = SkillCrawlerSyncItem.model_validate(raw_item)
                except ValueError:
                    logger.warning("skip invalid crawler skill item", exc_info=True)
                    skipped_count += 1
                    continue
                current = latest_by_slug.get(item.slug)
                if current is None or item.updated_at >= current.updated_at:
                    latest_by_slug[item.slug] = item
        return sorted(latest_by_slug.values(), key=lambda item: item.slug), skipped_count

    def _upsert_item(
        self,
        session: SessionLike,
        *,
        item: SkillCrawlerSyncItem,
        result: SkillCrawlerSyncResult,
    ) -> None:
        existing = session.scalar(select(Skill).where(Skill.slug == item.slug))
        if item.status == "deleted":
            if existing is not None and existing.publication_status != SkillPublicationStatus.ARCHIVED:
                AdminSkillService.archive_skill(session, existing.id)
                result.archived_count += 1
            return

        if existing is None:
            values = self._to_skill_values(session, item)
            AdminSkillService.create_skill(session, values)
            result.imported_count += 1
            return

        update_values = self._existing_skill_stats_update_values(existing, item)
        if update_values:
            AdminSkillService.update_skill(session, existing.id, update_values)
            result.updated_count += 1

    def _to_skill_values(self, session: SessionLike, item: SkillCrawlerSyncItem) -> _SkillValues:
        categories = infer_skill_category_from_library(session, item)
        return {
            "slug": item.slug,
            "name": item.name,
            "description": item.description,
            "author_name": item.author_name,
            "source_type": item.source_type,
            "source_url": item.source_url,
            "install_command": item.install_command,
            "install_count": item.install_count,
            "github_stars": item.github_stars,
            "publication_status": SkillPublicationStatus.DRAFT,
            "audit_status": SkillAuditStatus.PASSED,
            "categories": [category["slug"] for category in categories],
            "tags": item.tags,
            "content_type": item.content_type,
            "skill_markdown": item.skill_markdown,
            "published_at": None,
        }

    @staticmethod
    def _existing_skill_stats_update_values(skill: Skill, item: SkillCrawlerSyncItem) -> dict[str, int]:
        update_values: dict[str, int] = {}
        if skill.install_count != item.install_count:
            update_values["install_count"] = item.install_count
        if skill.github_stars != item.github_stars:
            update_values["github_stars"] = item.github_stars
        return update_values

    @staticmethod
    def _skill_needs_update(skill: Skill, values: Mapping[str, Any]) -> bool:
        for field_name in (
            "name",
            "description",
            "author_name",
            "source_type",
            "source_url",
            "install_command",
            "install_count",
            "github_stars",
            "audit_status",
        ):
            if getattr(skill, field_name) != values[field_name]:
                return True
        return False

    @staticmethod
    def _taxonomy_needs_update(session: SessionLike, skill_id: str, values: Mapping[str, Any]) -> bool:
        category_slugs = set(
            session.scalars(
                select(SkillCategory.slug)
                .join(SkillCategoryBinding, SkillCategoryBinding.category_id == SkillCategory.id)
                .where(SkillCategoryBinding.skill_id == skill_id)
            )
        )
        tag_slugs = set(
            session.scalars(
                select(SkillTag.slug)
                .join(SkillTagBinding, SkillTagBinding.tag_id == SkillTag.id)
                .where(SkillTagBinding.skill_id == skill_id)
            )
        )
        return category_slugs != set(values["categories"]) or tag_slugs != set(values["tags"])

    @staticmethod
    def _needs_new_version(version: SkillVersion | None, item: SkillCrawlerSyncItem) -> bool:
        if version is None:
            return True
        return (
            version.skill_markdown != item.skill_markdown
            or version.content_type != item.content_type
        )
