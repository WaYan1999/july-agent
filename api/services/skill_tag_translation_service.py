from __future__ import annotations

import html
import logging
import re
from collections.abc import Callable

import httpx

from configs import dify_config
from core.helper import ssrf_proxy

logger = logging.getLogger(__name__)

RequestGet = Callable[..., httpx.Response]

GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2"
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
    def __init__(self, api_key: str | None = None, request_get: RequestGet | None = None) -> None:
        self.api_key = api_key if api_key is not None else dify_config.GOOGLE_TRANSLATE_API_KEY
        self.request_get = request_get or ssrf_proxy.get

    def resolve_cn_name(self, tag_slug: str) -> str | None:
        normalized = _normalize_tag(tag_slug)
        if not normalized:
            return None
        if not should_translate_tag(normalized):
            return normalized
        return self._translate_text(normalized, purpose="skill tag")

    def _translate_text(self, text: str, *, purpose: str) -> str | None:
        if not self.api_key:
            return None
        try:
            response = self.request_get(
                GOOGLE_TRANSLATE_URL,
                params={
                    "key": self.api_key,
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

        if not isinstance(translated, str):
            return None
        translated_text = html.unescape(translated).strip()
        return translated_text or None
