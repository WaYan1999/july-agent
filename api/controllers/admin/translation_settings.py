from __future__ import annotations

from flask_restx import Resource
from pydantic import BaseModel, ConfigDict, Field
from werkzeug.exceptions import BadRequest

from controllers.admin import admin_ns
from controllers.admin.wraps import admin_required
from controllers.common.schema import register_response_schema_models, register_schema_models
from extensions.ext_database import db
from fields.base import ResponseModel
from libs.helper import dump_response
from services.skill_tag_translation_service import SkillTagTranslationService
from services.translation_settings_service import TranslationSettingsService


class GoogleTranslationSettingsPayload(BaseModel):
    enabled: bool | None = None
    google_translate_api_key: str | None = Field(default=None, max_length=4096)
    apps_script_url: str | None = Field(default=None, max_length=4096)
    apps_script_secret: str | None = Field(default=None, max_length=4096)
    monthly_free_quota_chars: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(extra="forbid")


class GoogleTranslationSettingsResponse(ResponseModel):
    provider: str
    enabled: bool
    api_key_configured: bool
    api_key_preview: str | None = None
    apps_script_configured: bool
    apps_script_url_preview: str | None = None
    apps_script_secret_configured: bool
    monthly_free_quota_chars: int
    current_month: str
    used_chars: int
    remaining_chars: int
    usage_ratio: float
    quota_exceeded: bool


class GoogleTranslationTestPayload(BaseModel):
    text: str = Field(min_length=1, max_length=1000)

    model_config = ConfigDict(extra="forbid")


class GoogleTranslationTestResponse(ResponseModel):
    text: str
    translated_text: str


register_schema_models(admin_ns, GoogleTranslationSettingsPayload)
register_schema_models(admin_ns, GoogleTranslationTestPayload)
register_response_schema_models(admin_ns, GoogleTranslationSettingsResponse, GoogleTranslationTestResponse)


@admin_ns.route("/translation-settings/google")
class AdminGoogleTranslationSettingsApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[GoogleTranslationSettingsResponse.__name__])
    @admin_required
    def get(self):
        summary = TranslationSettingsService.get_google_usage_summary(db.session)
        return dump_response(GoogleTranslationSettingsResponse, summary)

    @admin_ns.expect(admin_ns.models[GoogleTranslationSettingsPayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[GoogleTranslationSettingsResponse.__name__])
    @admin_required
    def patch(self):
        payload = GoogleTranslationSettingsPayload.model_validate(admin_ns.payload or {})
        TranslationSettingsService.update_google_config(db.session, payload.model_dump(exclude_unset=True))
        summary = TranslationSettingsService.get_google_usage_summary(db.session)
        return dump_response(GoogleTranslationSettingsResponse, summary)


@admin_ns.route("/translation-settings/google/test")
class AdminGoogleTranslationTestApi(Resource):
    @admin_ns.expect(admin_ns.models[GoogleTranslationTestPayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[GoogleTranslationTestResponse.__name__])
    @admin_required
    def post(self):
        payload = GoogleTranslationTestPayload.model_validate(admin_ns.payload or {})
        text = payload.text.strip()
        runtime_config = TranslationSettingsService.get_google_runtime_config(db.session)
        if not runtime_config["enabled"]:
            raise BadRequest(description="翻译未启用，请开启翻译并保存后再测试。")
        if not runtime_config["apps_script_url"] and not runtime_config["api_key"]:
            raise BadRequest(description="尚未配置 Apps Script 或 Google Translation API Key，请保存配置后再测试。")
        quota_check = TranslationSettingsService.can_consume_google_chars(db.session, len(text))
        if not quota_check["allowed"]:
            raise BadRequest(description="翻译额度已用完，请调高每月额度或等待下月。")
        translator = SkillTagTranslationService()
        translated_text = translator.translate_text(
            text,
            session=db.session,
            purpose="admin translation test",
        )
        if not translated_text:
            error_message = translator.last_error or "请检查 Apps Script 地址、Secret、API Key 或剩余额度。"
            raise BadRequest(description=f"翻译测试失败：{error_message}")
        return dump_response(
            GoogleTranslationTestResponse,
            {
                "text": text,
                "translated_text": translated_text,
            },
        )
