from __future__ import annotations

import html
import logging
import re
from collections.abc import Callable

import httpx

from configs import dify_config
from core.helper import ssrf_proxy
from services.translation_settings_service import TranslationSettingsService

logger = logging.getLogger(__name__)

RequestGet = Callable[..., httpx.Response]
RequestPost = Callable[..., httpx.Response]

GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2"
APPS_SCRIPT_SECRET_ASSIGNMENT_PATTERN = re.compile(
    r"(?:const|let|var)?\s*SECRET\s*=\s*['\"]([^'\"]+)['\"]\s*;?",
    re.IGNORECASE,
)
PROTECTED_TAGS = {
    "ai",
    "api",
    "chatgpt",
    "claude",
    "codex",
    "dify",
    "figma",
    "github",
    "google",
    "gpt",
    "javascript",
    "json",
    "llm",
    "logo",
    "mcp",
    "next.js",
    "openai",
    "pdf",
    "python",
    "react",
    "skill",
    "sql",
    "svg",
    "typescript",
    "ui",
    "ux",
    "vue",
    "yaml",
}


def _normalize_tag(value: str) -> str:
    return value.strip().lower()


def should_translate_tag(tag_slug: str) -> bool:
    normalized = _normalize_tag(tag_slug)
    if not normalized:
        return False
    if normalized in PROTECTED_TAGS:
        return False
    parts = [part for part in re.split(r"[-_:\s/]+", normalized) if part]
    return not parts or not all(part in PROTECTED_TAGS for part in parts)


class SkillTagTranslationService:
    def __init__(
        self,
        api_key: str | None = None,
        request_get: RequestGet | None = None,
        request_post: RequestPost | None = None,
    ) -> None:
        self.api_key = api_key
        self.request_get = request_get or ssrf_proxy.get
        self.request_post = request_post or ssrf_proxy.post
        self.last_error: str | None = None

    def resolve_cn_name(self, tag_slug: str, *, session: object | None = None) -> str | None:
        normalized = _normalize_tag(tag_slug)
        if not normalized:
            return None
        if not should_translate_tag(normalized):
            return normalized
        return self._translate_text(normalized, purpose="skill tag", session=session)

    def translate_text(
        self,
        text: str,
        *,
        session: object | None = None,
        purpose: str = "translation test",
    ) -> str | None:
        normalized = text.strip()
        if not normalized:
            return None
        return self._translate_text(normalized, purpose=purpose, session=session)

    def _translate_text(self, text: str, *, purpose: str, session: object | None = None) -> str | None:
        api_key = self.api_key
        apps_script_url: str | None = None
        apps_script_secret: str | None = None
        should_record_usage = False
        if session is not None and self.api_key is None:
            runtime_config = TranslationSettingsService.get_google_runtime_config(session)
            api_key = runtime_config["api_key"]
            apps_script_url = runtime_config["apps_script_url"]
            apps_script_secret = runtime_config["apps_script_secret"]
            if not runtime_config["enabled"]:
                return None
            quota_check = TranslationSettingsService.can_consume_google_chars(session, len(text))
            if not quota_check["allowed"]:
                logger.warning(
                    "google translate quota exceeded, skip translation",
                    extra={
                        "purpose": purpose,
                        "chars": len(text),
                        "used_chars": quota_check["used_chars"],
                        "quota_chars": quota_check["monthly_free_quota_chars"],
                    },
                )
                return None
            should_record_usage = True
        elif api_key is None:
            api_key = dify_config.GOOGLE_TRANSLATE_API_KEY

        translated = None
        if apps_script_url:
            translated = self._translate_with_apps_script(
                apps_script_url,
                text,
                purpose=purpose,
                secret=apps_script_secret,
            )
        if translated is None and api_key:
            translated = self._translate_with_google_api(api_key, text, purpose=purpose)

        if translated is None:
            return None

        if should_record_usage:
            TranslationSettingsService.record_google_usage(session, len(text))
        return translated

    def _translate_with_apps_script(
        self,
        apps_script_url: str,
        text: str,
        *,
        purpose: str,
        secret: str | None = None,
    ) -> str | None:
        request_payload = {
            "text": text,
            "source": "en",
            "target": "zh-CN",
            "secret": self._normalize_apps_script_secret(secret),
        }
        try:
            response = self.request_post(
                apps_script_url,
                json=request_payload,
                follow_redirects=False,
                timeout=httpx.Timeout(10.0, connect=3.0),
            )
        except Exception:
            logger.warning("google apps script translate request failed", exc_info=True, extra={"purpose": purpose})
            return None

        if response.status_code in {301, 302, 303, 307, 308}:
            response = self._fetch_apps_script_redirect_response(response, purpose=purpose)
            if response is None:
                return None

        if response.status_code < 200 or response.status_code >= 300:
            self.last_error = f"Apps Script 返回 HTTP {response.status_code}"
            logger.warning(
                "google apps script translate returned non-success response",
                extra={"purpose": purpose, "status_code": response.status_code},
            )
            return None

        try:
            payload = response.json()
        except ValueError:
            logger.warning(
                "google apps script translate returned invalid JSON",
                exc_info=True,
                extra={"purpose": purpose},
            )
            self.last_error = "Apps Script 返回内容不是 JSON"
            return None

        translated = self._extract_apps_script_translation(payload)
        if translated is None:
            script_error = self._extract_apps_script_error(payload)
            field_names = self._describe_payload_fields(payload)
            self.last_error = (
                f"Apps Script 返回错误：{script_error}"
                if script_error
                else f"Apps Script 响应缺少 translatedText 字段（返回字段：{field_names}）"
            )
            logger.warning(
                "google apps script translate response missing text",
                extra={"purpose": purpose, "response_fields": field_names},
            )
            return None
        return self._normalize_translated_text(translated)

    def _fetch_apps_script_redirect_response(self, response: httpx.Response, *, purpose: str) -> httpx.Response | None:
        redirect_url = response.headers.get("location")
        if not redirect_url:
            self.last_error = "Apps Script 重定向响应缺少 Location"
            logger.warning("google apps script redirect missing location", extra={"purpose": purpose})
            return None
        try:
            return self.request_get(
                redirect_url,
                follow_redirects=True,
                timeout=httpx.Timeout(10.0, connect=3.0),
            )
        except Exception:
            self.last_error = "Apps Script 重定向结果请求失败"
            logger.warning("google apps script redirect request failed", exc_info=True, extra={"purpose": purpose})
            return None

    def _translate_with_google_api(self, api_key: str, text: str, *, purpose: str) -> str | None:
        try:
            response = self.request_get(
                GOOGLE_TRANSLATE_URL,
                params={
                    "key": api_key,
                    "q": text,
                    "target": "zh-CN",
                    "format": "text",
                },
                timeout=httpx.Timeout(10.0, connect=3.0),
            )
        except Exception:
            logger.warning("google translate request failed", exc_info=True, extra={"purpose": purpose})
            return None

        if response.status_code < 200 or response.status_code >= 300:
            logger.warning(
                "google translate returned non-success response",
                extra={"purpose": purpose, "status_code": response.status_code},
            )
            return None

        try:
            payload = response.json()
            translated = payload["data"]["translations"][0]["translatedText"]
        except (KeyError, IndexError, TypeError, ValueError):
            logger.warning("google translate returned invalid JSON", exc_info=True, extra={"purpose": purpose})
            return None
        return self._normalize_translated_text(translated)

    @staticmethod
    def _extract_apps_script_translation(payload: object) -> str | None:
        if not isinstance(payload, dict):
            return None
        direct_value = payload.get("translatedText") or payload.get("translated_text") or payload.get("text")
        if isinstance(direct_value, str):
            return direct_value
        data = payload.get("data")
        if isinstance(data, dict):
            nested_value = data.get("translatedText") or data.get("translated_text") or data.get("text")
            if isinstance(nested_value, str):
                return nested_value
        return None

    @staticmethod
    def _extract_apps_script_error(payload: object) -> str | None:
        if not isinstance(payload, dict):
            return None
        error_value = payload.get("error") or payload.get("message")
        if isinstance(error_value, str):
            return error_value.strip() or None
        data = payload.get("data")
        if isinstance(data, dict):
            nested_error = data.get("error") or data.get("message")
            if isinstance(nested_error, str):
                return nested_error.strip() or None
        return None

    @staticmethod
    def _describe_payload_fields(payload: object) -> str:
        if not isinstance(payload, dict):
            return type(payload).__name__
        field_names = sorted(str(key) for key in payload)
        return ", ".join(field_names) if field_names else "空对象"

    @staticmethod
    def _normalize_apps_script_secret(secret: str | None) -> str | None:
        if not secret:
            return None
        normalized = secret.strip()
        match = APPS_SCRIPT_SECRET_ASSIGNMENT_PATTERN.fullmatch(normalized)
        if match:
            return match.group(1).strip() or None
        return normalized or None

    @staticmethod
    def _normalize_translated_text(translated: object) -> str | None:
        if not isinstance(translated, str):
            return None
        translated_text = html.unescape(translated).strip()
        return translated_text or None
