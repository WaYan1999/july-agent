from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from models import Skill, SkillTag
from services.skill_service import SkillService


def _scalar_result(items: list[SimpleNamespace]) -> SimpleNamespace:
    return SimpleNamespace(all=MagicMock(return_value=items))


def test_skill_model_has_featured_flag_default_false() -> None:
    assert "is_featured" in Skill.__table__.columns
    assert Skill.__table__.columns["is_featured"].default.arg is False


def test_skill_tag_model_has_chinese_name_column() -> None:
    assert "cn_name" in SkillTag.__table__.columns
    assert SkillTag.__table__.columns["cn_name"].nullable is True


def test_list_recommended_skill_groups_queries_published_groups(monkeypatch: pytest.MonkeyPatch) -> None:
    featured = [SimpleNamespace(id="featured")]
    top20 = [SimpleNamespace(id="top20")]
    latest = [SimpleNamespace(id="latest")]
    hottest = [SimpleNamespace(id="hottest")]
    session = MagicMock()
    session.scalars.side_effect = [
        _scalar_result(featured),
        _scalar_result(top20),
        _scalar_result(latest),
        _scalar_result(hottest),
    ]
    hydrate_taxonomy_items = MagicMock()
    monkeypatch.setattr(SkillService, "hydrate_taxonomy_items", hydrate_taxonomy_items)

    result = SkillService.list_recommended_skill_groups(session)

    assert result == {
        "featured": featured,
        "top20": top20,
        "latest": latest,
        "hottest": hottest,
    }
    assert session.scalars.call_count == 4
    statements = [str(call.args[0]).lower() for call in session.scalars.call_args_list]
    assert all("skills.publication_status" in statement for statement in statements)
    assert "skills.is_featured = true" in statements[0]
    assert "skills.position asc" in statements[0]
    assert "skills.install_count desc" in statements[1]
    assert "skills.github_stars desc" in statements[1]
    assert "skills.published_at desc" in statements[2]
    assert "skills.install_count desc" in statements[3]
    hydrate_taxonomy_items.assert_called_once_with(session, featured + top20 + latest + hottest)


def test_list_published_skills_sorts_by_github_stars(monkeypatch: pytest.MonkeyPatch) -> None:
    session = MagicMock()
    paginate = MagicMock()
    monkeypatch.setattr(SkillService, "_paginate", paginate)

    SkillService.list_published_skills(session, page=1, limit=20, sort="github_stars_desc")

    statement = str(paginate.call_args.args[1]).lower()
    assert "skills.github_stars desc" in statement
