"""爬虫服务器 Skill 库同步服务。

本模块只负责把可信爬虫服务器返回的 Skill 增量数据规范化后写入本地
marketplace Skill 表。原始响应先保存为 JSON 快照，方便排查同步问题；
查询展示仍以数据库为准。
"""

from __future__ import annotations

import json
import logging
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
from libs.datetime_utils import naive_utc_now
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
DEFAULT_PAGE_LIMIT = 100
MAX_SYNC_PAGES = 1000
_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "document": ("pdf", "document", "markdown", "readme", "docx", "excel", "spreadsheet", "csv", "table"),
    "media": ("audio", "video", "image", "speech", "transcribe", "ocr", "subtitle"),
    "data": ("database", "sql", "sqlite", "postgres", "mysql", "api", "json", "csv", "dataset"),
    "productivity": ("calendar", "email", "meeting", "task", "workflow", "automation", "todo"),
    "development": ("code", "git", "github", "repository", "test", "debug", "python", "typescript", "javascript"),
}
_TAG_KEYWORDS: dict[str, tuple[str, ...]] = {
    "api": ("api", "http", "endpoint", "request", "response"),
    "automation": ("automation", "workflow", "schedule", "cron"),
    "csv": ("csv", "spreadsheet"),
    "database": ("database", "sql", "sqlite", "postgres", "mysql"),
    "extract": ("extract", "parse", "scrape", "crawl"),
    "github": ("github", "git", "repository"),
    "image": ("image", "ocr", "vision"),
    "markdown": ("markdown", "readme", "skill.md"),
    "pdf": ("pdf",),
    "python": ("python",),
    "typescript": ("typescript", "javascript", "node"),
}


class SkillCrawlerSyncError(RuntimeError):
    """爬虫同步失败的受控异常。"""


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
    skill_markdown: str | None = None
    status: SyncStatus
    updated_at: datetime

    model_config = ConfigDict(extra="forbid")

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

    @model_validator(mode="after")
    def _validate_markdown_for_visible_items(self) -> SkillCrawlerSyncItem:
        if self.status in {"published", "unlisted"} and not (self.skill_markdown and self.skill_markdown.strip()):
            raise ValueError("visible skill must include skill_markdown")
        return self


class SkillCrawlerSyncPage(BaseModel):
    data: list[dict[str, Any]]
    page: int = Field(ge=1)
    limit: int = Field(ge=1, le=500)
    has_more: bool = False
    next_page: int | None = Field(default=None, ge=1)
    sync_window: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


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


class _InferredTaxonomy(TypedDict):
    categories: list[str]
    tags: list[str]


def _match_taxonomy_slugs(text: str, keyword_map: Mapping[str, tuple[str, ...]], *, max_items: int) -> list[str]:
    scores: list[tuple[int, str]] = []
    for slug, keywords in keyword_map.items():
        score = sum(text.count(keyword) for keyword in keywords)
        if score > 0:
            scores.append((score, slug))
    return [slug for _score, slug in sorted(scores, key=lambda item: (-item[0], item[1]))[:max_items]]


def infer_skill_taxonomy(item: SkillCrawlerSyncItem) -> _InferredTaxonomy:
    search_text = "\n".join((item.name, item.description, item.skill_markdown or "")).lower()
    categories = _match_taxonomy_slugs(search_text, _CATEGORY_KEYWORDS, max_items=2)
    tags = _match_taxonomy_slugs(search_text, _TAG_KEYWORDS, max_items=5)
    return {
        "categories": categories or ["productivity"],
        "tags": tags or ["automation"],
    }


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
    ) -> list[dict[str, Any]]:
        pages: list[dict[str, Any]] = []
        page = 1
        for _ in range(MAX_SYNC_PAGES):
            payload = self._fetch_page(from_date=from_date, to_date=to_date, page=page, limit=limit)
            pages.append(payload)
            if not bool(payload.get("has_more")):
                return pages
            next_page = payload.get("next_page")
            page = int(next_page) if next_page else page + 1
        raise SkillCrawlerSyncError(f"crawler pagination exceeded {MAX_SYNC_PAGES} pages")

    def _fetch_page(self, *, from_date: date, to_date: date, page: int, limit: int) -> dict[str, Any]:
        url = urljoin(f"{self.base_url}/", "api/v1/skills/changes")
        try:
            response = self.request_get(
                url,
                headers={"Accept": "application/json", "Authorization": f"Bearer {self.token}"},
                params={
                    "from_date": from_date.isoformat(),
                    "to_date": to_date.isoformat(),
                    "page": page,
                    "limit": limit,
                },
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
    def from_config(cls) -> SkillCrawlerClient:
        return cls(base_url=str(dify_config.SKILL_CRAWLER_API_URL), token=dify_config.SKILL_CRAWLER_API_TOKEN)


class SkillCrawlerSyncService:
    """协调快照、过滤、分组和 Skill 入库。"""

    client: SkillCrawlerClient
    snapshot_dir: Path

    def __init__(self, client: SkillCrawlerClient, snapshot_dir: str | Path) -> None:
        self.client = client
        self.snapshot_dir = Path(snapshot_dir)

    @classmethod
    def from_config(cls) -> SkillCrawlerSyncService:
        return cls(
            client=SkillCrawlerClient.from_config(),
            snapshot_dir=dify_config.SKILL_CRAWLER_SYNC_SNAPSHOT_DIR,
        )

    def sync(
        self,
        *,
        session: SessionLike,
        from_date: date,
        to_date: date,
        now: datetime | None = None,
    ) -> SkillCrawlerSyncResult:
        generated_at = now or datetime.now(UTC)
        raw_pages = self.client.fetch_pages(from_date=from_date, to_date=to_date, limit=DEFAULT_PAGE_LIMIT)
        snapshot_path = self._save_snapshot(
            {
                "generated_at": generated_at.isoformat(),
                "from_date": from_date.isoformat(),
                "to_date": to_date.isoformat(),
                "pages": raw_pages,
            }
        )

        fetched_count = sum(len(page.get("data", [])) for page in raw_pages if isinstance(page.get("data"), list))
        valid_items, skipped_count = self._validate_and_deduplicate(raw_pages)
        category_counter = Counter[str]()
        tag_counter = Counter[str]()
        for item in valid_items:
            taxonomy = infer_skill_taxonomy(item)
            category_counter.update(taxonomy["categories"])
            tag_counter.update(taxonomy["tags"])

        result = SkillCrawlerSyncResult(
            fetched_count=fetched_count,
            skipped_count=skipped_count,
            groups_by_category=dict(sorted(category_counter.items())),
            groups_by_tag=dict(sorted(tag_counter.items())),
            snapshot_path=snapshot_path,
        )
        for item in valid_items:
            self._upsert_item(session, item=item, result=result)
        return result

    def _save_snapshot(self, snapshot: _SkillSnapshot) -> str:
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        filename = f"skill-crawler-sync-{snapshot['from_date']}-{snapshot['to_date']}-{timestamp}.json"
        path = self.snapshot_dir / filename
        path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")
        return path.as_posix()

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
                else:
                    continue
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

        values = self._to_skill_values(item)
        if existing is None:
            AdminSkillService.create_skill(session, values)
            result.imported_count += 1
            return

        if self._skill_needs_update(existing, values) or self._taxonomy_needs_update(session, existing.id, values):
            AdminSkillService.update_skill(session, existing.id, values)
            result.updated_count += 1

        latest_version = AdminSkillService.get_latest_version(session, existing.id)
        if self._needs_new_version(latest_version, item):
            AdminSkillService.create_version(
                session,
                existing.id,
                {
                    "content_type": SkillContentType.MARKDOWN_FILE,
                    "skill_markdown": item.skill_markdown,
                    "is_latest": True,
                    "published_at": (
                        naive_utc_now() if values["publication_status"] == SkillPublicationStatus.PUBLISHED else None
                    ),
                },
            )
            result.version_created_count += 1

    def _to_skill_values(self, item: SkillCrawlerSyncItem) -> _SkillValues:
        publication_status = (
            SkillPublicationStatus.ARCHIVED if item.status == "deleted" else SkillPublicationStatus(item.status)
        )
        taxonomy = infer_skill_taxonomy(item)
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
            "publication_status": publication_status,
            "audit_status": SkillAuditStatus.PASSED,
            "categories": taxonomy["categories"],
            "tags": taxonomy["tags"],
            "content_type": SkillContentType.MARKDOWN_FILE,
            "skill_markdown": item.skill_markdown,
            "published_at": naive_utc_now() if publication_status == SkillPublicationStatus.PUBLISHED else None,
        }

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
            "publication_status",
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
            or version.content_type != SkillContentType.MARKDOWN_FILE
        )
