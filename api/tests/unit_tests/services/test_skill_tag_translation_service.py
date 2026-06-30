from __future__ import annotations

from unittest.mock import ANY, MagicMock

from services import skill_tag_translation_service as translation_module
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


def test_translate_text_exposes_apps_script_error_message(monkeypatch) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"error": "unauthorized"}
    request_post = MagicMock(return_value=response)
    session = object()
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "get_google_runtime_config",
        MagicMock(
            return_value={
                "api_key": None,
                "apps_script_url": "https://script.google.com/macros/s/example/exec",
                "apps_script_secret": "script-secret",
                "enabled": True,
                "monthly_free_quota_chars": 500_000,
                "used_chars": 0,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "can_consume_google_chars",
        MagicMock(
            return_value={
                "allowed": True,
                "used_chars": 0,
                "monthly_free_quota_chars": 500_000,
                "remaining_chars": 500_000,
                "current_month": "2026-06",
            },
        ),
    )

    service = SkillTagTranslationService(request_post=request_post)
    translated = service.translate_text("Hello world", session=session)

    assert translated is None
    assert service.last_error == "Apps Script 返回错误：unauthorized"


def test_translate_text_accepts_apps_script_snake_case_response(monkeypatch) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"translated_text": "你好世界"}
    request_post = MagicMock(return_value=response)
    session = object()
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "get_google_runtime_config",
        MagicMock(
            return_value={
                "api_key": None,
                "apps_script_url": "https://script.google.com/macros/s/example/exec",
                "apps_script_secret": "script-secret",
                "enabled": True,
                "monthly_free_quota_chars": 500_000,
                "used_chars": 0,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "can_consume_google_chars",
        MagicMock(
            return_value={
                "allowed": True,
                "used_chars": 0,
                "monthly_free_quota_chars": 500_000,
                "remaining_chars": 500_000,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(translation_module.TranslationSettingsService, "record_google_usage", MagicMock())

    translated = SkillTagTranslationService(request_post=request_post).translate_text("Hello world", session=session)

    assert translated == "你好世界"


def test_translate_text_reports_apps_script_unexpected_payload_keys(monkeypatch) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"ok": True}
    request_post = MagicMock(return_value=response)
    session = object()
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "get_google_runtime_config",
        MagicMock(
            return_value={
                "api_key": None,
                "apps_script_url": "https://script.google.com/macros/s/example/exec",
                "apps_script_secret": "script-secret",
                "enabled": True,
                "monthly_free_quota_chars": 500_000,
                "used_chars": 0,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "can_consume_google_chars",
        MagicMock(
            return_value={
                "allowed": True,
                "used_chars": 0,
                "monthly_free_quota_chars": 500_000,
                "remaining_chars": 500_000,
                "current_month": "2026-06",
            },
        ),
    )

    service = SkillTagTranslationService(request_post=request_post)
    translated = service.translate_text("Hello world", session=session)

    assert translated is None
    assert service.last_error == "Apps Script 响应缺少 translatedText 字段（返回字段：ok）"


def test_translate_text_uses_original_text_with_google_response() -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"data": {"translations": [{"translatedText": "你好世界"}]}}
    request_get = MagicMock(return_value=response)

    translated = SkillTagTranslationService(api_key="token", request_get=request_get).translate_text("Hello World")

    assert translated == "你好世界"
    assert request_get.call_args.kwargs["params"]["q"] == "Hello World"
    assert request_get.call_args.kwargs["params"]["target"] == "zh-CN"


def test_resolve_cn_name_uses_database_config_and_records_google_request_usage(monkeypatch) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"data": {"translations": [{"translatedText": "自动化"}]}}
    request_get = MagicMock(return_value=response)
    record_usage = MagicMock()
    session = object()
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "get_google_runtime_config",
        MagicMock(
            return_value={
                "api_key": "db-token",
                "apps_script_url": None,
                "apps_script_secret": None,
                "enabled": True,
                "monthly_free_quota_chars": 500_000,
                "used_chars": 0,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "can_consume_google_chars",
        MagicMock(
            return_value={
                "allowed": True,
                "used_chars": 0,
                "monthly_free_quota_chars": 500_000,
                "remaining_chars": 500_000,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(translation_module.TranslationSettingsService, "record_google_usage", record_usage)

    cn_name = SkillTagTranslationService(request_get=request_get).resolve_cn_name("automation", session=session)

    assert cn_name == "自动化"
    assert request_get.call_args.kwargs["params"]["key"] == "db-token"
    record_usage.assert_called_once_with(session, len("automation"))


def test_resolve_cn_name_prefers_apps_script_proxy_and_records_usage(monkeypatch) -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"translatedText": "自动化"}
    request_get = MagicMock()
    request_post = MagicMock(return_value=response)
    record_usage = MagicMock()
    session = object()
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "get_google_runtime_config",
        MagicMock(
            return_value={
                "api_key": "db-token",
                "apps_script_url": "https://script.google.com/macros/s/example/exec",
                "apps_script_secret": "script-secret",
                "enabled": True,
                "monthly_free_quota_chars": 500_000,
                "used_chars": 0,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "can_consume_google_chars",
        MagicMock(
            return_value={
                "allowed": True,
                "used_chars": 0,
                "monthly_free_quota_chars": 500_000,
                "remaining_chars": 500_000,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(translation_module.TranslationSettingsService, "record_google_usage", record_usage)

    cn_name = SkillTagTranslationService(
        request_get=request_get,
        request_post=request_post,
    ).resolve_cn_name("automation", session=session)

    assert cn_name == "自动化"
    request_get.assert_not_called()
    request_post.assert_called_once_with(
        "https://script.google.com/macros/s/example/exec",
        json={
            "text": "automation",
            "source": "en",
            "target": "zh-CN",
            "secret": "script-secret",
        },
        follow_redirects=False,
        timeout=ANY,
    )
    record_usage.assert_called_once_with(session, len("automation"))


def test_resolve_cn_name_follows_apps_script_redirect_result(monkeypatch) -> None:
    redirect_response = MagicMock()
    redirect_response.status_code = 302
    redirect_response.headers = {"location": "https://script.googleusercontent.com/macros/echo?token=result"}
    result_response = MagicMock()
    result_response.status_code = 200
    result_response.json.return_value = {"translatedText": "自动化"}
    request_get = MagicMock(return_value=result_response)
    request_post = MagicMock(return_value=redirect_response)
    record_usage = MagicMock()
    session = object()
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "get_google_runtime_config",
        MagicMock(
            return_value={
                "api_key": None,
                "apps_script_url": "https://script.google.com/macros/s/example/exec",
                "apps_script_secret": "const SECRET = 'script-secret';",
                "enabled": True,
                "monthly_free_quota_chars": 500_000,
                "used_chars": 0,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "can_consume_google_chars",
        MagicMock(
            return_value={
                "allowed": True,
                "used_chars": 0,
                "monthly_free_quota_chars": 500_000,
                "remaining_chars": 500_000,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(translation_module.TranslationSettingsService, "record_google_usage", record_usage)

    cn_name = SkillTagTranslationService(
        request_get=request_get,
        request_post=request_post,
    ).resolve_cn_name("automation", session=session)

    assert cn_name == "自动化"
    request_post.assert_called_once()
    assert request_post.call_args.kwargs["json"]["secret"] == "script-secret"
    request_get.assert_called_once_with(
        "https://script.googleusercontent.com/macros/echo?token=result",
        follow_redirects=True,
        timeout=ANY,
    )
    record_usage.assert_called_once_with(session, len("automation"))


def test_resolve_cn_name_falls_back_to_google_api_when_apps_script_proxy_fails(monkeypatch) -> None:
    apps_script_response = MagicMock()
    apps_script_response.status_code = 500
    google_response = MagicMock()
    google_response.status_code = 200
    google_response.json.return_value = {"data": {"translations": [{"translatedText": "自动化"}]}}
    request_get = MagicMock(return_value=google_response)
    request_post = MagicMock(return_value=apps_script_response)
    session = object()
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "get_google_runtime_config",
        MagicMock(
            return_value={
                "api_key": "db-token",
                "apps_script_url": "https://script.google.com/macros/s/example/exec",
                "apps_script_secret": None,
                "enabled": True,
                "monthly_free_quota_chars": 500_000,
                "used_chars": 0,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "can_consume_google_chars",
        MagicMock(
            return_value={
                "allowed": True,
                "used_chars": 0,
                "monthly_free_quota_chars": 500_000,
                "remaining_chars": 500_000,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(translation_module.TranslationSettingsService, "record_google_usage", MagicMock())

    cn_name = SkillTagTranslationService(
        request_get=request_get,
        request_post=request_post,
    ).resolve_cn_name("automation", session=session)

    assert cn_name == "自动化"
    request_post.assert_called_once()
    assert request_get.call_args.kwargs["params"]["key"] == "db-token"


def test_resolve_cn_name_skips_google_when_quota_exceeded(monkeypatch) -> None:
    request_get = MagicMock()
    session = object()
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "get_google_runtime_config",
        MagicMock(
            return_value={
                "api_key": "db-token",
                "apps_script_url": "https://script.google.com/macros/s/example/exec",
                "apps_script_secret": "script-secret",
                "enabled": True,
                "monthly_free_quota_chars": 8,
                "used_chars": 8,
                "current_month": "2026-06",
            },
        ),
    )
    monkeypatch.setattr(
        translation_module.TranslationSettingsService,
        "can_consume_google_chars",
        MagicMock(
            return_value={
                "allowed": False,
                "used_chars": 8,
                "monthly_free_quota_chars": 8,
                "remaining_chars": 0,
                "current_month": "2026-06",
            },
        ),
    )

    cn_name = SkillTagTranslationService(request_get=request_get).resolve_cn_name("automation", session=session)

    assert cn_name is None
    request_get.assert_not_called()
