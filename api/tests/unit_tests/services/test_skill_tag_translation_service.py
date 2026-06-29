from __future__ import annotations

from unittest.mock import MagicMock

from services.skill_tag_translation_service import SkillTagTranslationService, should_translate_tag


def test_protected_tag_should_not_be_translated() -> None:
    assert should_translate_tag("github") is False
    assert should_translate_tag("openai") is False
    assert should_translate_tag("logo") is False


def test_resolve_cn_name_keeps_protected_tag_as_original() -> None:
    request_get = MagicMock()

    cn_name = SkillTagTranslationService(api_key="token", request_get=request_get).resolve_cn_name("github")

    assert cn_name == "github"
    request_get.assert_not_called()


def test_resolve_cn_name_translates_with_google_response() -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"data": {"translations": [{"translatedText": "自动化"}]}}
    request_get = MagicMock(return_value=response)

    cn_name = SkillTagTranslationService(api_key="token", request_get=request_get).resolve_cn_name("automation")

    assert cn_name == "自动化"
    assert request_get.call_args.kwargs["params"]["q"] == "automation"
    assert request_get.call_args.kwargs["params"]["target"] == "zh-CN"


def test_resolve_cn_name_without_api_key_returns_none_for_translatable_tag() -> None:
    request_get = MagicMock()

    cn_name = SkillTagTranslationService(api_key="", request_get=request_get).resolve_cn_name("automation")

    assert cn_name is None
    request_get.assert_not_called()


def test_resolve_cn_name_falls_back_to_none_when_google_fails() -> None:
    response = MagicMock()
    response.status_code = 500
    response.text = "server error"
    request_get = MagicMock(return_value=response)

    translated = SkillTagTranslationService(api_key="token", request_get=request_get).resolve_cn_name("automation")

    assert translated is None
