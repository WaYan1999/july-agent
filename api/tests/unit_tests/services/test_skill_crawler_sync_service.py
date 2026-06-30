from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from models import SkillContentType, SkillPublicationStatus
from services import skill_crawler_sync_service as sync_module
from services.skill_crawler_sync_service import SkillCrawlerClient, SkillCrawlerSyncItem, SkillCrawlerSyncService


class _FakeTranslator:
    def __init__(self) -> None:
        self.resolved_tags: list[str] = []
        self.sessions: list[object | None] = []

    def resolve_cn_name(self, tag_slug: str, *, session: object | None = None) -> str | None:
        self.resolved_tags.append(tag_slug)
        self.sessions.append(session)
        return {
            "automation": "自动化",
            "github": "github",
        }.get(tag_slug)


def _category(slug: str, name: str) -> SimpleNamespace:
    return SimpleNamespace(slug=slug, name=name)


def _session_with_categories(categories: list[SimpleNamespace]) -> MagicMock:
    scalar_result = SimpleNamespace(all=MagicMock(return_value=categories))
    session = MagicMock()
    session.scalars.return_value = scalar_result
    return session


def _make_item(**overrides: object) -> SkillCrawlerSyncItem:
    values: dict[str, object] = {
        "slug": "pdf-toolkit",
        "name": "PDF Toolkit",
        "description": "Extract PDF and Markdown documents.",
        "author_name": "July",
        "source_type": "github",
        "source_url": "https://github.com/example/pdf-toolkit",
        "install_command": "codex skills install pdf-toolkit",
        "install_count": 128,
        "content_type": "markdown_file",
        "github_stars": 42,
        "categories": ["document", "pdf"],
        "tags": ["pdf", "automation"],
        "skill_markdown": "# PDF Toolkit\nParse PDF tables and markdown files.",
        "status": "published",
        "updated_at": "2026-06-25T10:00:00Z",
    }
    values.update(overrides)
    return SkillCrawlerSyncItem.model_validate(values)


def test_category_words_match_single_existing_category() -> None:
    session = _session_with_categories(
        [
            _category("document-processing", "文档处理"),
            _category("frontend-design", "前端设计"),
            _category("other", "其他"),
        ]
    )
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)

    values = service._to_skill_values(session, _make_item(categories=["文档", "pdf"]))

    assert values["tags"] == ["pdf", "automation"]
    assert values["categories"] == ["document-processing"]


def test_category_words_match_frontend_design_by_synonyms() -> None:
    session = _session_with_categories(
        [
            _category("document-processing", "文档处理"),
            _category("frontend-design", "前端设计"),
            _category("testing-debugging", "测试调试"),
            _category("other", "其他"),
        ]
    )
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)

    values = service._to_skill_values(
        session,
        _make_item(
            slug="react-playwright",
            name="React Playwright Testing",
            description="Build frontend React flows and Playwright tests.",
            categories=["frontend", "react", "ui"],
            skill_markdown="# React tests\nUse TypeScript, Playwright and UI checks.",
        ),
    )

    assert values["categories"] == ["frontend-design"]


def test_category_words_match_tools_by_synonyms() -> None:
    session = _session_with_categories(
        [
            _category("tools", "工具"),
            _category("document-processing", "文档处理"),
            _category("other", "其他"),
        ]
    )
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)

    values = service._to_skill_values(
        session,
        _make_item(
            slug="mcp-toolkit",
            name="MCP Toolkit",
            description="Manage external tools and OpenAPI integrations.",
            categories=["tool", "mcp", "api"],
            skill_markdown="# MCP Toolkit\nUse MCP tools and OpenAPI integrations.",
        ),
    )

    assert values["categories"] == ["tools"]


def test_category_words_fall_back_to_other_without_creating_new_category() -> None:
    session = _session_with_categories(
        [
            _category("document-processing", "文档处理"),
            _category("other", "其他"),
        ]
    )
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)

    values = service._to_skill_values(
        session,
        _make_item(
            name="Tiny Helper",
            description="",
            categories=["unknown-word"],
            skill_markdown="# Tiny Helper",
        ),
    )

    assert values["categories"] == ["other"]
    session.add.assert_not_called()


def test_category_words_keep_only_highest_scored_category() -> None:
    session = _session_with_categories(
        [
            _category("document-processing", "文档处理"),
            _category("frontend-design", "前端设计"),
            _category("other", "其他"),
        ]
    )
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)

    values = service._to_skill_values(
        session,
        _make_item(categories=["文档", "pdf", "frontend", "react"]),
    )

    assert values["categories"] == ["document-processing"]


def test_response_github_stars_field_maps_to_local_github_stars() -> None:
    session = _session_with_categories([_category("other", "其他")])
    values = _make_item().model_dump(mode="json")
    values["github_stars"] = 66
    item = SkillCrawlerSyncItem.model_validate(values)

    skill_values = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)._to_skill_values(session, item)

    assert item.github_stars == 66
    assert skill_values["github_stars"] == 66


def test_missing_content_type_defaults_to_remote_reference_even_with_markdown() -> None:
    values = _make_item().model_dump(mode="json")
    values.pop("content_type")

    item = SkillCrawlerSyncItem.model_validate(values)

    assert item.content_type == SkillContentType.REMOTE_REFERENCE


def test_content_type_from_crawler_response_maps_to_skill_version_values() -> None:
    session = _session_with_categories([_category("other", "其他")])

    values = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)._to_skill_values(
        session,
        _make_item(content_type="zip_package", skill_markdown=None),
    )

    assert values["content_type"] == SkillContentType.ZIP_PACKAGE
    assert values["skill_markdown"] is None


def test_content_type_accepts_chinese_labels() -> None:
    session = _session_with_categories([_category("other", "其他")])

    values = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)._to_skill_values(
        session,
        _make_item(content_type="远程拉取", skill_markdown=None),
    )

    assert values["content_type"] == SkillContentType.REMOTE_REFERENCE


def test_markdown_content_type_requires_skill_markdown() -> None:
    values = _make_item().model_dump(mode="json")
    values["content_type"] = "markdown_file"
    values["skill_markdown"] = None

    with pytest.raises(ValueError, match="markdown skill must include skill_markdown"):
        SkillCrawlerSyncItem.model_validate(values)


def test_client_request_passes_configured_star_query_parameter() -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "data": [],
        "page": 1,
        "limit": 50,
        "has_more": False,
        "next_page": None,
        "sync_window": {},
    }
    request_get = MagicMock(return_value=response)

    SkillCrawlerClient(base_url="https://crawler.example.com", token="token", request_get=request_get)._fetch_page(
        from_date=date(2026, 6, 24),
        to_date=date(2026, 6, 25),
        page=1,
        limit=50,
        star=100,
    )

    assert request_get.call_args.kwargs["params"]["star"] == 100


def test_client_request_omits_star_query_parameter_when_not_configured() -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "data": [],
        "page": 1,
        "limit": 50,
        "has_more": False,
        "next_page": None,
        "sync_window": {},
    }
    request_get = MagicMock(return_value=response)

    SkillCrawlerClient(base_url="https://crawler.example.com", token="token", request_get=request_get)._fetch_page(
        from_date=date(2026, 6, 24),
        to_date=date(2026, 6, 25),
        page=1,
        limit=50,
    )

    assert "star" not in request_get.call_args.kwargs["params"]


def test_new_pulled_skill_defaults_to_draft() -> None:
    session = _session_with_categories([_category("other", "其他")])

    values = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)._to_skill_values(
        session,
        _make_item(status="published"),
    )

    assert values["publication_status"] == SkillPublicationStatus.DRAFT
    assert values["published_at"] is None


def test_new_pulled_skill_preserves_original_description() -> None:
    session = _session_with_categories([_category("other", "其他")])

    values = SkillCrawlerSyncService(
        client=MagicMock(),
        snapshot_dir=None,
        translator=_FakeTranslator(),
    )._to_skill_values(session, _make_item(description="Build workflow automations."))

    assert values["description"] == "Build workflow automations."


def test_validate_keeps_latest_duplicate_slug_by_updated_at() -> None:
    raw_pages = [
        {
            "data": [
                _make_item(slug="dup-skill", updated_at="2026-06-25T10:00:00Z").model_dump(mode="json"),
                _make_item(slug="dup-skill", updated_at="2026-06-25T09:00:00Z").model_dump(mode="json"),
            ],
            "page": 1,
            "limit": 100,
            "has_more": False,
            "next_page": None,
            "sync_window": {},
        }
    ]
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)

    items, skipped_count = service._validate_and_deduplicate(raw_pages)

    assert skipped_count == 0
    assert len(items) == 1
    assert items[0].updated_at == datetime(2026, 6, 25, 10, 0, tzinfo=UTC)


def test_validate_ignores_extra_crawler_response_fields() -> None:
    raw_item = _make_item().model_dump(mode="json")
    raw_item.update(
        {
            "repo": "example/pdf-toolkit",
            "repo_url": "https://github.com/example/pdf-toolkit",
            "description_source": "readme",
            "description_readme_url": "https://github.com/example/pdf-toolkit#readme",
            "description_ai_translated": False,
            "skill_markdown_length": 128,
            "skill_markdown_truncated": False,
            "markdown_verified": True,
            "verification_status": "verified",
            "collected_at": "2026-06-25T11:00:00Z",
        }
    )
    raw_pages = [
        {
            "data": [raw_item],
            "page": 1,
            "limit": 100,
            "has_more": False,
            "next_page": None,
            "sync_window": {},
            "dedupe_mode": "github_skill",
            "markdown_mode": "all_candidates",
            "verified_only": False,
            "total_raw": 1,
            "total_verified": 1,
            "star_filter": {"field": "github_stars", "value": 1000},
            "date_filter_enabled": True,
            "date_field": "updated_at",
        }
    ]
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)

    items, skipped_count = service._validate_and_deduplicate(raw_pages)

    assert skipped_count == 0
    assert len(items) == 1
    assert items[0].slug == "pdf-toolkit"


def test_validate_source_only_item_without_markdown_as_remote_reference() -> None:
    raw_item = _make_item().model_dump(mode="json")
    raw_item.pop("content_type")
    raw_item["skill_markdown"] = None
    raw_item["skill_markdown_length"] = 0
    raw_item["markdown_verified"] = False
    raw_item["verification_status"] = "source_only"
    raw_pages = [
        {
            "data": [raw_item],
            "page": 1,
            "limit": 100,
            "has_more": False,
            "next_page": None,
            "sync_window": {},
        }
    ]
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)

    items, skipped_count = service._validate_and_deduplicate(raw_pages)

    assert skipped_count == 0
    assert len(items) == 1
    assert items[0].content_type == SkillContentType.REMOTE_REFERENCE
    assert items[0].skill_markdown is None


def test_non_deleted_skill_requires_skill_markdown() -> None:
    values = _make_item().model_dump(mode="json")
    values["status"] = "archived"
    values["content_type"] = "markdown_file"
    values["skill_markdown"] = None

    with pytest.raises(ValueError, match="skill must include skill_markdown"):
        SkillCrawlerSyncItem.model_validate(values)


def test_existing_skill_stats_update_preserves_publication_status(monkeypatch: pytest.MonkeyPatch) -> None:
    existing = SimpleNamespace(
        id="skill-1",
        name="PDF Toolkit",
        description="Extract PDF and Markdown documents.",
        author_name="July",
        source_type="github",
        source_url="https://github.com/example/pdf-toolkit",
        install_command="codex skills install pdf-toolkit",
        install_count=1,
        github_stars=2,
        audit_status=sync_module.SkillAuditStatus.PASSED,
        publication_status=SkillPublicationStatus.PUBLISHED,
    )
    session = _session_with_categories([_category("other", "其他")])
    session.scalar.return_value = existing
    update_skill = MagicMock(return_value=existing)
    monkeypatch.setattr(sync_module.AdminSkillService, "update_skill", update_skill)

    SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)._upsert_item(
        session,
        item=_make_item(status="published"),
        result=sync_module.SkillCrawlerSyncResult(),
    )

    update_values = update_skill.call_args.args[2]
    assert "publication_status" not in update_values
    assert "published_at" not in update_values


def test_new_skill_passes_resolved_tag_cn_names_to_admin_service(monkeypatch: pytest.MonkeyPatch) -> None:
    session = _session_with_categories([_category("other", "其他")])
    session.scalar.return_value = None
    create_skill = MagicMock()
    monkeypatch.setattr(sync_module.AdminSkillService, "create_skill", create_skill)

    SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)._upsert_item(
        session,
        item=_make_item(tags=["automation", "github"]),
        result=sync_module.SkillCrawlerSyncResult(),
        tag_cn_names={"automation": "自动化", "github": "github"},
    )

    values = create_skill.call_args.args[1]
    assert values["tag_cn_names"] == {"automation": "自动化", "github": "github"}


def test_sync_resolves_current_and_existing_empty_tag_cn_names(tmp_path) -> None:
    existing_tag = SimpleNamespace(slug="automation", cn_name=None)
    session = MagicMock()
    session.scalars.return_value.all.return_value = [existing_tag]
    translator = _FakeTranslator()
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=tmp_path, translator=translator)

    resolved = service._resolve_tag_cn_names(session, [_make_item(tags=["automation", "github"])])

    assert resolved == {"automation": "自动化", "github": "github"}
    assert existing_tag.cn_name == "自动化"
    assert translator.resolved_tags == ["automation", "github"]
    assert translator.sessions == [session, session]
    session.commit.assert_called_once()


def test_sync_reuses_existing_tag_cn_name_without_translation(tmp_path) -> None:
    existing_tag = SimpleNamespace(slug="automation", cn_name="自动化")
    session = MagicMock()
    session.scalars.return_value.all.return_value = [existing_tag]
    translator = _FakeTranslator()
    service = SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=tmp_path, translator=translator)

    resolved = service._resolve_tag_cn_names(session, [_make_item(tags=["automation"])])

    assert resolved == {"automation": "自动化"}
    assert translator.resolved_tags == []
    session.commit.assert_not_called()


def test_existing_skill_updates_only_install_count_and_github_stars(monkeypatch: pytest.MonkeyPatch) -> None:
    existing = SimpleNamespace(
        id="skill-1",
        name="Local Name",
        description="local description",
        author_name="Local Author",
        source_type="github",
        source_url="https://github.com/example/local",
        install_command="codex skills install local",
        install_count=1,
        github_stars=2,
        audit_status=sync_module.SkillAuditStatus.PASSED,
        publication_status=SkillPublicationStatus.PUBLISHED,
    )
    session = _session_with_categories([_category("other", "鍏朵粬")])
    session.scalar.return_value = existing
    update_skill = MagicMock(return_value=existing)
    create_version = MagicMock()
    monkeypatch.setattr(sync_module.AdminSkillService, "update_skill", update_skill)
    monkeypatch.setattr(
        sync_module.AdminSkillService,
        "get_latest_version",
        MagicMock(
            return_value=SimpleNamespace(
                skill_markdown="# Local markdown",
                content_type=SkillContentType.MARKDOWN_FILE,
            )
        ),
    )
    monkeypatch.setattr(sync_module.AdminSkillService, "create_version", create_version)
    result = sync_module.SkillCrawlerSyncResult()

    SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)._upsert_item(
        session,
        item=_make_item(
            name="Crawler Name",
            description="crawler description",
            author_name="Crawler Author",
            source_url="https://github.com/example/crawler",
            install_command="codex skills install crawler",
            install_count=128,
            github_stars=42,
            categories=["frontend"],
            tags=["crawler"],
            skill_markdown="# Crawler markdown",
        ),
        result=result,
    )

    update_skill.assert_called_once_with(
        session,
        "skill-1",
        {
            "install_count": 128,
            "github_stars": 42,
        },
    )
    create_version.assert_not_called()
    assert result.updated_count == 1
    assert result.version_created_count == 0


def test_existing_skill_ignores_metadata_taxonomy_and_content_changes_when_stats_same(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = SimpleNamespace(
        id="skill-1",
        name="Local Name",
        description="local description",
        author_name="Local Author",
        source_type="github",
        source_url="https://github.com/example/local",
        install_command="codex skills install local",
        install_count=128,
        github_stars=42,
        audit_status=sync_module.SkillAuditStatus.PASSED,
        publication_status=SkillPublicationStatus.PUBLISHED,
    )
    session = _session_with_categories([_category("other", "鍏朵粬")])
    session.scalar.return_value = existing
    update_skill = MagicMock(return_value=existing)
    taxonomy_needs_update = MagicMock(return_value=True)
    get_latest_version = MagicMock(
        return_value=SimpleNamespace(
            skill_markdown="# Local markdown",
            content_type=SkillContentType.MARKDOWN_FILE,
        )
    )
    create_version = MagicMock()
    monkeypatch.setattr(sync_module.SkillCrawlerSyncService, "_taxonomy_needs_update", taxonomy_needs_update)
    monkeypatch.setattr(sync_module.AdminSkillService, "update_skill", update_skill)
    monkeypatch.setattr(sync_module.AdminSkillService, "get_latest_version", get_latest_version)
    monkeypatch.setattr(sync_module.AdminSkillService, "create_version", create_version)
    result = sync_module.SkillCrawlerSyncResult()

    SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)._upsert_item(
        session,
        item=_make_item(
            name="Crawler Name",
            description="crawler description",
            author_name="Crawler Author",
            source_url="https://github.com/example/crawler",
            install_command="codex skills install crawler",
            categories=["frontend"],
            tags=["crawler"],
            skill_markdown="# Crawler markdown",
        ),
        result=result,
    )

    update_skill.assert_not_called()
    taxonomy_needs_update.assert_not_called()
    get_latest_version.assert_not_called()
    create_version.assert_not_called()
    assert result.updated_count == 0
    assert result.version_created_count == 0


def test_deleted_status_archives_existing_skill(monkeypatch: pytest.MonkeyPatch) -> None:
    existing = SimpleNamespace(id="skill-1", publication_status=SkillPublicationStatus.PUBLISHED)
    session = MagicMock()
    session.scalar.return_value = existing
    archive_skill = MagicMock()
    monkeypatch.setattr(sync_module.AdminSkillService, "archive_skill", archive_skill)
    result = sync_module.SkillCrawlerSyncResult()

    SkillCrawlerSyncService(client=MagicMock(), snapshot_dir=None)._upsert_item(
        session,
        item=_make_item(status="deleted", skill_markdown=None),
        result=result,
    )

    archive_skill.assert_called_once_with(session, "skill-1")
    assert result.archived_count == 1


def test_successful_sync_deletes_snapshot(tmp_path) -> None:
    raw_pages = [
        {
            "data": [_make_item().model_dump(mode="json")],
            "page": 1,
            "limit": 100,
            "has_more": False,
            "next_page": None,
            "sync_window": {},
        }
    ]
    client = MagicMock()
    client.fetch_pages.return_value = raw_pages
    service = SkillCrawlerSyncService(client=client, snapshot_dir=tmp_path)
    service._upsert_item = MagicMock()  # type: ignore[method-assign]

    result = service.sync(session=MagicMock(), from_date=date(2026, 6, 24), to_date=date(2026, 6, 25))

    assert result.snapshot_path is None
    assert list(tmp_path.glob("*.json")) == []


def test_sync_passes_configured_limit_to_client(tmp_path) -> None:
    raw_pages = [
        {
            "data": [],
            "page": 1,
            "limit": 50,
            "has_more": False,
            "next_page": None,
            "sync_window": {},
        }
    ]
    client = MagicMock()
    client.fetch_pages.return_value = raw_pages
    service = SkillCrawlerSyncService(client=client, snapshot_dir=tmp_path)

    service.sync(session=MagicMock(), from_date=date(2026, 6, 24), to_date=date(2026, 6, 25), limit=50)

    client.fetch_pages.assert_called_once_with(
        from_date=date(2026, 6, 24),
        to_date=date(2026, 6, 25),
        limit=50,
        star=None,
    )


def test_failed_sync_keeps_snapshot(tmp_path) -> None:
    raw_pages = [
        {
            "data": [_make_item().model_dump(mode="json")],
            "page": 1,
            "limit": 100,
            "has_more": False,
            "next_page": None,
            "sync_window": {},
        }
    ]
    client = MagicMock()
    client.fetch_pages.return_value = raw_pages
    service = SkillCrawlerSyncService(client=client, snapshot_dir=tmp_path)
    service._upsert_item = MagicMock(side_effect=RuntimeError("boom"))  # type: ignore[method-assign]

    with pytest.raises(sync_module.SkillCrawlerSyncError, match="boom") as exc_info:
        service.sync(session=MagicMock(), from_date=date(2026, 6, 24), to_date=date(2026, 6, 25))

    snapshots = list(tmp_path.glob("*.json"))
    assert len(snapshots) == 1
    assert snapshots[0].name.startswith("skill-crawler-sync-")
    assert exc_info.value.snapshot_path == snapshots[0].as_posix()


def test_needs_new_version_compares_markdown_and_content_type() -> None:
    item = _make_item(skill_markdown="# old", content_type="zip_package")
    version = SimpleNamespace(skill_markdown="# old", content_type=SkillContentType.MARKDOWN_FILE)

    assert SkillCrawlerSyncService._needs_new_version(version, item) is True
