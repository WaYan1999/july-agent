from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from controllers.admin.skills import (
    SkillResponse,
    SkillTagCreatePayload,
    SkillTagResponse,
    SkillTagUpdatePayload,
    SkillUpdatePayload,
    _serialize_skill,
    _serialize_tag,
)
from libs.helper import dump_response
from models import SkillPublicationStatus
from services.admin_skill_service import AdminSkillService


def test_update_payload_accepts_featured_flag_false() -> None:
    payload = SkillUpdatePayload.model_validate({"is_featured": False})

    assert payload.model_dump(exclude_unset=True) == {"is_featured": False}


def test_create_skill_persists_featured_flag() -> None:
    session = MagicMock()

    skill = AdminSkillService.create_skill(
        session,
        {
            "slug": "featured-skill",
            "name": "Featured Skill",
            "description": "Featured recommendation.",
            "is_featured": True,
        },
    )

    assert skill.is_featured is True
    session.commit.assert_called_once()


def test_update_skill_persists_featured_flag_false() -> None:
    skill = SimpleNamespace(id="skill-id", is_featured=True)
    session = MagicMock()
    session.get.return_value = skill

    updated_skill = AdminSkillService.update_skill(session, "skill-id", {"is_featured": False})

    assert updated_skill.is_featured is False
    session.commit.assert_called_once()


def test_create_tag_payload_accepts_chinese_name() -> None:
    payload = SkillTagCreatePayload.model_validate({"slug": "automation", "name": "automation", "cn_name": "自动化"})

    assert payload.model_dump() == {"slug": "automation", "name": "automation", "cn_name": "自动化"}


def test_create_tag_persists_chinese_name() -> None:
    session = MagicMock()

    tag = AdminSkillService.create_tag(session, {"slug": "automation", "name": "automation", "cn_name": "自动化"})

    assert tag.cn_name == "自动化"
    session.commit.assert_called_once()


def test_update_tag_can_clear_chinese_name() -> None:
    tag = SimpleNamespace(id="tag-id", slug="automation", name="automation", cn_name="自动化")
    session = MagicMock()
    session.get.return_value = tag

    payload = SkillTagUpdatePayload.model_validate({"cn_name": None})
    updated_tag = AdminSkillService.update_tag(session, "tag-id", payload.model_dump(exclude_unset=True))

    assert updated_tag.cn_name is None
    session.commit.assert_called_once()


def test_list_tags_filters_by_chinese_name(monkeypatch: pytest.MonkeyPatch) -> None:
    session = MagicMock()
    paginate = MagicMock()
    monkeypatch.setattr(AdminSkillService, "_paginate_tags", paginate)

    AdminSkillService.list_tags(session, page=1, limit=20, keyword="自动")

    statement = str(paginate.call_args.args[1]).lower()
    assert "skill_tags.name" in statement
    assert "skill_tags.slug" in statement
    assert "skill_tags.cn_name" in statement


def test_batch_publish_skills_publishes_ids_and_preserves_existing_publish_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    published_at = datetime(2026, 6, 28, 8, 0, 0)
    next_publish_at = datetime(2026, 6, 29, 9, 0, 0)
    draft_skill = SimpleNamespace(
        id="draft-skill",
        publication_status=SkillPublicationStatus.DRAFT,
        published_at=None,
    )
    published_skill = SimpleNamespace(
        id="published-skill",
        publication_status=SkillPublicationStatus.PUBLISHED,
        published_at=published_at,
    )
    session = MagicMock()
    session.scalars.return_value.all.return_value = [draft_skill, published_skill]
    monkeypatch.setattr("services.admin_skill_service.naive_utc_now", lambda: next_publish_at)

    updated_count = AdminSkillService.batch_publish_skills(session, skill_ids=["draft-skill", "published-skill"])

    assert updated_count == 2
    assert draft_skill.publication_status == SkillPublicationStatus.PUBLISHED
    assert draft_skill.published_at == next_publish_at
    assert published_skill.publication_status == SkillPublicationStatus.PUBLISHED
    assert published_skill.published_at == published_at
    session.commit.assert_called_once()


def test_batch_publish_skills_uses_filters_when_ids_are_empty() -> None:
    session = MagicMock()
    session.scalars.return_value.all.return_value = [
        SimpleNamespace(
            id="skill-1",
            publication_status=SkillPublicationStatus.DRAFT,
            published_at=None,
        )
    ]

    updated_count = AdminSkillService.batch_publish_skills(
        session,
        skill_ids=[],
        keyword="agent",
        category="tools",
        publication_status="draft",
        source_type="github",
    )

    assert updated_count == 1
    statement = str(session.scalars.call_args.args[0]).lower()
    assert "skills.name" in statement
    assert "skill_categories.slug" in statement
    assert "skills.publication_status" in statement
    assert "skills.source_type" in statement
    session.commit.assert_called_once()


def test_list_skills_filters_category_by_slug_or_name_and_min_github_stars(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = MagicMock()
    paginate = MagicMock()
    monkeypatch.setattr(AdminSkillService, "_paginate", paginate)

    AdminSkillService.list_skills(
        session,
        page=1,
        limit=20,
        category="编程",
        min_github_stars=100,
    )

    statement = str(paginate.call_args.args[1]).lower()
    assert "skill_categories.slug" in statement
    assert "skill_categories.name" in statement
    assert "skills.github_stars >= " in statement


def test_list_skills_sorts_by_github_stars(monkeypatch: pytest.MonkeyPatch) -> None:
    session = MagicMock()
    paginate = MagicMock()
    monkeypatch.setattr(AdminSkillService, "_paginate", paginate)

    AdminSkillService.list_skills(session, page=1, limit=20, sort="github_stars_desc")

    statement = str(paginate.call_args.args[1]).lower()
    assert "skills.github_stars desc" in statement


def test_admin_skill_response_serializes_featured_flag() -> None:
    skill = SimpleNamespace(
        id="skill-id",
        slug="featured-skill",
        name="Featured Skill",
        description="Featured recommendation.",
        author_name=None,
        source_type="github",
        source_url=None,
        install_command=None,
        icon=None,
        icon_background=None,
        icon_url=None,
        publication_status="published",
        audit_status="manual",
        audit_notes=None,
        categories=[],
        tags=[],
        install_count=10,
        github_stars=5,
        position=0,
        is_featured=True,
        published_at=None,
        created_at=None,
        updated_at=None,
    )

    payload = dump_response(SkillResponse, _serialize_skill(skill, version=None))

    assert payload["is_featured"] is True


def test_admin_tag_response_serializes_chinese_name() -> None:
    tag = SimpleNamespace(
        id="tag-id",
        slug="automation",
        name="automation",
        cn_name="自动化",
        created_at=None,
        updated_at=None,
    )

    payload = dump_response(SkillTagResponse, _serialize_tag(tag))

    assert payload["cn_name"] == "自动化"
