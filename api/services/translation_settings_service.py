from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import NotRequired, TypedDict

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, scoped_session
from werkzeug.exceptions import BadRequest

from configs import dify_config
from core.helper.encrypter import obfuscated_token
from core.tools.utils.system_encryption import EncryptionError, decrypt_system_params, encrypt_system_params
from models.translation import TranslationProviderConfig, TranslationUsage

logger = logging.getLogger(__name__)

SessionLike = Session | scoped_session
GOOGLE_TRANSLATE_PROVIDER = "google"
DEFAULT_MONTHLY_FREE_QUOTA_CHARS = 500_000
API_KEY_PARAM_NAME = "api_key"
APPS_SCRIPT_URL_PARAM_NAME = "apps_script_url"
APPS_SCRIPT_SECRET_PARAM_NAME = "apps_script_secret"
TRANSLATION_TABLE_NAMES = ("translation_provider_configs", "translation_usages")
MISSING_TABLE_ERROR_MARKERS = (
    "does not exist",
    "doesn't exist",
    "no such table",
    "undefinedtable",
    "unknown table",
)


class TranslationConfigValues(TypedDict, total=False):
    enabled: bool
    google_translate_api_key: str | None
    apps_script_url: str | None
    apps_script_secret: str | None
    monthly_free_quota_chars: int


class TranslationUsageSummary(TypedDict):
    provider: str
    enabled: bool
    api_key_configured: bool
    api_key_preview: str | None
    apps_script_configured: bool
    apps_script_url_preview: str | None
    apps_script_secret_configured: bool
    monthly_free_quota_chars: int
    current_month: str
    used_chars: int
    remaining_chars: int
    usage_ratio: float
    quota_exceeded: bool


class TranslationRuntimeConfig(TypedDict):
    api_key: str | None
    apps_script_url: str | None
    apps_script_secret: str | None
    enabled: bool
    monthly_free_quota_chars: int
    used_chars: int
    current_month: str
    quota_tracking_available: NotRequired[bool]


class TranslationQuotaCheck(TypedDict):
    allowed: bool
    used_chars: int
    monthly_free_quota_chars: int
    remaining_chars: int
    current_month: str


class TranslationUsageIncrement(TypedDict, total=False):
    provider: str
    month: str
    used_chars: int
    added_chars: NotRequired[int]


class GoogleTranslationCredentials(TypedDict, total=False):
    api_key: str | None
    apps_script_url: str | None
    apps_script_secret: str | None


def month_key(now: datetime | None = None) -> str:
    normalized = now or datetime.now(UTC)
    if normalized.tzinfo is None:
        return normalized.strftime("%Y-%m")
    return normalized.astimezone(UTC).strftime("%Y-%m")


def mask_api_key(api_key: str | None) -> str | None:
    if not api_key:
        return None
    return obfuscated_token(api_key)


def _env_google_runtime_config(
    now: datetime | None = None,
    *,
    quota_tracking_available: bool = False,
) -> TranslationRuntimeConfig:
    api_key = str(dify_config.GOOGLE_TRANSLATE_API_KEY or "").strip() or None
    return {
        "api_key": api_key,
        "apps_script_url": None,
        "apps_script_secret": None,
        "enabled": bool(api_key),
        "monthly_free_quota_chars": DEFAULT_MONTHLY_FREE_QUOTA_CHARS,
        "used_chars": 0,
        "current_month": month_key(now),
        "quota_tracking_available": quota_tracking_available,
    }


def _summary_from_runtime_config(runtime_config: TranslationRuntimeConfig) -> TranslationUsageSummary:
    quota_chars = int(runtime_config["monthly_free_quota_chars"])
    used_chars = int(runtime_config["used_chars"])
    remaining_chars = max(0, quota_chars - used_chars)
    usage_ratio = 0 if quota_chars <= 0 else min(1, used_chars / quota_chars)
    return {
        "provider": GOOGLE_TRANSLATE_PROVIDER,
        "enabled": bool(runtime_config["enabled"]),
        "api_key_configured": bool(runtime_config["api_key"]),
        "api_key_preview": mask_api_key(runtime_config["api_key"]),
        "apps_script_configured": bool(runtime_config["apps_script_url"]),
        "apps_script_url_preview": runtime_config["apps_script_url"],
        "apps_script_secret_configured": bool(runtime_config["apps_script_secret"]),
        "monthly_free_quota_chars": quota_chars,
        "current_month": runtime_config["current_month"],
        "used_chars": used_chars,
        "remaining_chars": remaining_chars,
        "usage_ratio": usage_ratio,
        "quota_exceeded": used_chars >= quota_chars if quota_chars >= 0 else False,
    }


def _is_missing_translation_table_error(exc: DBAPIError) -> bool:
    text = " ".join(
        value.lower()
        for value in (
            str(exc.orig),
            str(exc.statement),
            exc.__class__.__name__,
            exc.orig.__class__.__name__ if exc.orig else "",
        )
        if value
    )
    return any(table_name in text for table_name in TRANSLATION_TABLE_NAMES) and any(
        marker in text for marker in MISSING_TABLE_ERROR_MARKERS
    )


def _rollback_session(session: SessionLike) -> None:
    try:
        session.rollback()
    except Exception:
        logger.warning("failed to rollback translation settings session", exc_info=True)


class TranslationSettingsService:
    """管理系统翻译配置与本系统发起的字符用量。"""

    @staticmethod
    def get_google_config(session: SessionLike) -> TranslationProviderConfig:
        config = session.scalar(
            select(TranslationProviderConfig).where(
                TranslationProviderConfig.provider == GOOGLE_TRANSLATE_PROVIDER,
            )
        )
        if config is not None:
            return config

        config = TranslationProviderConfig(
            provider=GOOGLE_TRANSLATE_PROVIDER,
            enabled=bool(str(dify_config.GOOGLE_TRANSLATE_API_KEY or "").strip()),
            monthly_free_quota_chars=DEFAULT_MONTHLY_FREE_QUOTA_CHARS,
        )
        session.add(config)
        session.flush()
        return config

    @classmethod
    def update_google_config(
        cls,
        session: SessionLike,
        values: TranslationConfigValues | Mapping[str, object],
    ) -> TranslationProviderConfig:
        try:
            config = cls.get_google_config(session)
        except DBAPIError as exc:
            if _is_missing_translation_table_error(exc):
                _rollback_session(session)
                raise BadRequest(description="翻译设置数据表不存在，请先执行数据库迁移后再保存配置。") from exc
            raise
        if "enabled" in values:
            config.enabled = bool(values["enabled"])
        if "monthly_free_quota_chars" in values:
            quota_chars = int(values["monthly_free_quota_chars"] or 0)
            if quota_chars < 0:
                raise BadRequest(description="monthly_free_quota_chars must be greater than or equal to 0.")
            config.monthly_free_quota_chars = quota_chars
        if (
            "google_translate_api_key" in values
            or "apps_script_url" in values
            or "apps_script_secret" in values
        ):
            credentials = cls.decrypt_google_credentials(config.encrypted_api_key)
            if "google_translate_api_key" in values:
                credentials["api_key"] = cls._normalize_optional_secret(values["google_translate_api_key"])
            if "apps_script_url" in values:
                credentials["apps_script_url"] = cls._normalize_optional_secret(values["apps_script_url"])
            if "apps_script_secret" in values:
                credentials["apps_script_secret"] = cls._normalize_optional_secret(values["apps_script_secret"])
            config.encrypted_api_key = cls.encrypt_google_credentials(credentials)
        session.commit()
        return config

    @classmethod
    def get_google_runtime_config(
        cls,
        session: SessionLike | None = None,
        *,
        now: datetime | None = None,
    ) -> TranslationRuntimeConfig:
        if session is None:
            return _env_google_runtime_config(now)

        current_month = month_key(now)
        try:
            config = cls.get_google_config(session)
            credentials = cls.decrypt_google_credentials(config.encrypted_api_key)
            api_key = credentials.get("api_key")
            if not api_key:
                api_key = str(dify_config.GOOGLE_TRANSLATE_API_KEY or "").strip() or None
            usage = cls.get_usage(session, provider=GOOGLE_TRANSLATE_PROVIDER, month=current_month)
            return {
                "api_key": api_key,
                "apps_script_url": credentials.get("apps_script_url"),
                "apps_script_secret": credentials.get("apps_script_secret"),
                "enabled": bool(config.enabled),
                "monthly_free_quota_chars": int(config.monthly_free_quota_chars),
                "used_chars": int(usage.used_chars if usage else 0),
                "current_month": current_month,
                "quota_tracking_available": True,
            }
        except DBAPIError as exc:
            if not _is_missing_translation_table_error(exc):
                raise
            _rollback_session(session)
            logger.warning("translation settings tables are missing; using environment fallback", exc_info=True)
            return _env_google_runtime_config(now, quota_tracking_available=False)

    @classmethod
    def get_google_usage_summary(
        cls,
        session: SessionLike,
        *,
        now: datetime | None = None,
    ) -> TranslationUsageSummary:
        return _summary_from_runtime_config(cls.get_google_runtime_config(session, now=now))

    @classmethod
    def can_consume_google_chars(
        cls,
        session: SessionLike,
        chars: int,
        *,
        now: datetime | None = None,
    ) -> TranslationQuotaCheck:
        if chars < 0:
            raise ValueError("chars must be greater than or equal to 0")
        runtime_config = cls.get_google_runtime_config(session, now=now)
        quota_chars = runtime_config["monthly_free_quota_chars"]
        used_chars = runtime_config["used_chars"]
        remaining_chars = max(0, quota_chars - used_chars)
        if runtime_config.get("quota_tracking_available") is False:
            return {
                "allowed": False,
                "used_chars": used_chars,
                "monthly_free_quota_chars": quota_chars,
                "remaining_chars": remaining_chars,
                "current_month": runtime_config["current_month"],
            }
        return {
            "allowed": used_chars + chars <= quota_chars,
            "used_chars": used_chars,
            "monthly_free_quota_chars": quota_chars,
            "remaining_chars": remaining_chars,
            "current_month": runtime_config["current_month"],
        }

    @classmethod
    def record_google_usage(
        cls,
        session: SessionLike,
        chars: int,
        *,
        now: datetime | None = None,
    ) -> TranslationUsageIncrement:
        if chars <= 0:
            usage = cls.get_or_create_usage(session, provider=GOOGLE_TRANSLATE_PROVIDER, month=month_key(now))
            return {
                "provider": GOOGLE_TRANSLATE_PROVIDER,
                "month": usage.month,
                "used_chars": int(usage.used_chars),
                "added_chars": 0,
            }
        usage = cls.get_or_create_usage(session, provider=GOOGLE_TRANSLATE_PROVIDER, month=month_key(now))
        usage.used_chars = int(usage.used_chars) + chars
        session.commit()
        return {
            "provider": GOOGLE_TRANSLATE_PROVIDER,
            "month": usage.month,
            "used_chars": int(usage.used_chars),
            "added_chars": chars,
        }

    @staticmethod
    def get_usage(session: SessionLike, *, provider: str, month: str) -> TranslationUsage | None:
        return session.scalar(
            select(TranslationUsage).where(
                TranslationUsage.provider == provider,
                TranslationUsage.month == month,
            )
        )

    @staticmethod
    def get_or_create_usage(session: SessionLike, *, provider: str, month: str) -> TranslationUsage:
        usage = session.scalar(
            select(TranslationUsage)
            .where(
                TranslationUsage.provider == provider,
                TranslationUsage.month == month,
            )
            .with_for_update()
        )
        if usage is not None:
            return usage
        usage = TranslationUsage(provider=provider, month=month, used_chars=0)
        session.add(usage)
        session.flush()
        return usage

    @staticmethod
    def encrypt_api_key(api_key: str) -> str:
        return encrypt_system_params({API_KEY_PARAM_NAME: api_key})

    @staticmethod
    def decrypt_api_key(encrypted_api_key: str | None) -> str | None:
        credentials = TranslationSettingsService.decrypt_google_credentials(encrypted_api_key)
        return credentials.get("api_key")

    @staticmethod
    def _normalize_optional_secret(value: object) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @classmethod
    def encrypt_google_credentials(cls, credentials: GoogleTranslationCredentials) -> str | None:
        params = {
            param_name: value
            for param_name, value in {
                API_KEY_PARAM_NAME: cls._normalize_optional_secret(credentials.get("api_key")),
                APPS_SCRIPT_URL_PARAM_NAME: cls._normalize_optional_secret(credentials.get("apps_script_url")),
                APPS_SCRIPT_SECRET_PARAM_NAME: cls._normalize_optional_secret(credentials.get("apps_script_secret")),
            }.items()
            if value
        }
        if not params:
            return None
        return encrypt_system_params(params)

    @staticmethod
    def decrypt_google_credentials(encrypted_api_key: str | None) -> GoogleTranslationCredentials:
        if not encrypted_api_key:
            return {}
        try:
            params = decrypt_system_params(encrypted_api_key)
        except (EncryptionError, ValueError):
            logger.warning("failed to decrypt google translate credentials", exc_info=True)
            return {}

        credentials: GoogleTranslationCredentials = {}
        for param_name in (API_KEY_PARAM_NAME, APPS_SCRIPT_URL_PARAM_NAME, APPS_SCRIPT_SECRET_PARAM_NAME):
            value = params.get(param_name)
            if isinstance(value, str) and value.strip():
                credentials[param_name] = value.strip()
        return credentials
