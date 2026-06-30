from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy.exc import OperationalError

from models.translation import TranslationProviderConfig, TranslationUsage
from services.translation_settings_service import (
    DEFAULT_MONTHLY_FREE_QUOTA_CHARS,
    GOOGLE_TRANSLATE_PROVIDER,
    TranslationSettingsService,
    month_key,
)


class _ScalarResult:
    def __init__(self, value: object | None) -> None:
        self.value = value

    def all(self) -> list[object]:
        return [] if self.value is None else [self.value]


class _FakeSession:
    def __init__(self) -> None:
        self.config: TranslationProviderConfig | None = None
        self.usages: dict[tuple[str, str], TranslationUsage] = {}
        self.commit_count = 0

    def scalar(self, stmt: object) -> object | None:
        statement = str(stmt)
        if "translation_provider_configs" in statement:
            return self.config
        if "translation_usages" in statement:
            for (provider, month), usage in self.usages.items():
                if provider in statement and month in statement:
                    return usage
            return next(iter(self.usages.values()), None)
        return None

    def scalars(self, stmt: object) -> _ScalarResult:
        return _ScalarResult(self.scalar(stmt))

    def add(self, value: Any) -> None:
        if isinstance(value, TranslationProviderConfig):
            self.config = value
        if isinstance(value, TranslationUsage):
            self.usages[(value.provider, value.month)] = value

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        self.commit_count += 1


class _MissingTranslationTablesSession:
    def __init__(self) -> None:
        self.rollback_count = 0

    def scalar(self, stmt: object) -> object | None:
        raise OperationalError(
            "select * from translation_provider_configs",
            {},
            Exception("no such table: translation_provider_configs"),
        )

    def rollback(self) -> None:
        self.rollback_count += 1


@pytest.fixture
def fake_session() -> _FakeSession:
    return _FakeSession()


def test_month_key_uses_utc_month() -> None:
    assert month_key(datetime(2026, 6, 29, 12, 0, tzinfo=UTC)) == "2026-06"


def test_google_usage_summary_returns_default_quota_for_new_config(fake_session) -> None:
    summary = TranslationSettingsService.get_google_usage_summary(
        fake_session,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )

    assert summary["provider"] == GOOGLE_TRANSLATE_PROVIDER
    assert summary["monthly_free_quota_chars"] == DEFAULT_MONTHLY_FREE_QUOTA_CHARS
    assert summary["used_chars"] == 0
    assert summary["remaining_chars"] == DEFAULT_MONTHLY_FREE_QUOTA_CHARS


def test_google_usage_summary_falls_back_when_translation_tables_are_missing(monkeypatch) -> None:
    monkeypatch.setattr(
        "services.translation_settings_service.dify_config.GOOGLE_TRANSLATE_API_KEY",
        "env-google-key",
    )
    session = _MissingTranslationTablesSession()

    summary = TranslationSettingsService.get_google_usage_summary(
        session,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )

    assert summary["provider"] == GOOGLE_TRANSLATE_PROVIDER
    assert summary["enabled"] is True
    assert summary["api_key_configured"] is True
    assert summary["api_key_preview"] != "env-google-key"
    assert summary["monthly_free_quota_chars"] == DEFAULT_MONTHLY_FREE_QUOTA_CHARS
    assert summary["used_chars"] == 0
    assert summary["remaining_chars"] == DEFAULT_MONTHLY_FREE_QUOTA_CHARS
    assert summary["quota_exceeded"] is False
    assert session.rollback_count == 1


def test_can_consume_google_chars_blocks_when_translation_tables_are_missing(monkeypatch) -> None:
    monkeypatch.setattr(
        "services.translation_settings_service.dify_config.GOOGLE_TRANSLATE_API_KEY",
        "env-google-key",
    )
    session = _MissingTranslationTablesSession()

    quota_check = TranslationSettingsService.can_consume_google_chars(
        session,
        10,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )

    assert quota_check["allowed"] is False
    assert quota_check["monthly_free_quota_chars"] == DEFAULT_MONTHLY_FREE_QUOTA_CHARS
    assert quota_check["used_chars"] == 0
    assert session.rollback_count == 1


def test_update_google_config_encrypts_key_and_returns_masked_preview(fake_session) -> None:
    TranslationSettingsService.update_google_config(
        fake_session,
        {
            "enabled": True,
            "google_translate_api_key": "google-key",
            "monthly_free_quota_chars": 100,
        },
    )

    summary = TranslationSettingsService.get_google_usage_summary(
        fake_session,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )

    assert summary["enabled"] is True
    assert summary["api_key_configured"] is True
    assert summary["api_key_preview"] != "google-key"
    assert summary["monthly_free_quota_chars"] == 100


def test_update_google_config_stores_apps_script_credentials_with_api_key(fake_session) -> None:
    TranslationSettingsService.update_google_config(
        fake_session,
        {
            "enabled": True,
            "google_translate_api_key": "google-key",
            "apps_script_url": "https://script.google.com/macros/s/example/exec",
            "apps_script_secret": "script-secret",
        },
    )

    runtime_config = TranslationSettingsService.get_google_runtime_config(
        fake_session,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )
    summary = TranslationSettingsService.get_google_usage_summary(
        fake_session,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )

    assert runtime_config["api_key"] == "google-key"
    assert runtime_config["apps_script_url"] == "https://script.google.com/macros/s/example/exec"
    assert runtime_config["apps_script_secret"] == "script-secret"
    assert summary["apps_script_configured"] is True
    assert summary["apps_script_url_preview"] == "https://script.google.com/macros/s/example/exec"
    assert summary["apps_script_secret_configured"] is True


def test_update_google_config_preserves_existing_credentials_when_fields_are_omitted(fake_session) -> None:
    TranslationSettingsService.update_google_config(
        fake_session,
        {
            "google_translate_api_key": "google-key",
            "apps_script_url": "https://script.google.com/macros/s/example/exec",
            "apps_script_secret": "script-secret",
        },
    )
    TranslationSettingsService.update_google_config(
        fake_session,
        {
            "enabled": False,
            "monthly_free_quota_chars": 200,
        },
    )

    runtime_config = TranslationSettingsService.get_google_runtime_config(
        fake_session,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )

    assert runtime_config["api_key"] == "google-key"
    assert runtime_config["apps_script_url"] == "https://script.google.com/macros/s/example/exec"
    assert runtime_config["apps_script_secret"] == "script-secret"
    assert runtime_config["enabled"] is False
    assert runtime_config["monthly_free_quota_chars"] == 200


def test_can_consume_google_chars_blocks_over_monthly_quota(fake_session) -> None:
    TranslationSettingsService.update_google_config(
        fake_session,
        {
            "enabled": True,
            "monthly_free_quota_chars": 10,
        },
    )
    TranslationSettingsService.record_google_usage(
        fake_session,
        8,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )

    quota_check = TranslationSettingsService.can_consume_google_chars(
        fake_session,
        3,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )

    assert quota_check["allowed"] is False
    assert quota_check["used_chars"] == 8
    assert quota_check["remaining_chars"] == 2


def test_record_google_usage_accumulates_by_month(fake_session) -> None:
    TranslationSettingsService.record_google_usage(
        fake_session,
        4,
        now=datetime(2026, 6, 29, tzinfo=UTC),
    )
    increment = TranslationSettingsService.record_google_usage(
        fake_session,
        5,
        now=datetime(2026, 6, 30, tzinfo=UTC),
    )

    assert increment["month"] == "2026-06"
    assert increment["used_chars"] == 9
    assert fake_session.commit_count == 2
