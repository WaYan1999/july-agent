from flask import request
from flask_restx import Resource
from pydantic import BaseModel, ConfigDict, Field, field_validator

from controllers.admin import admin_ns
from controllers.admin.common import TimestampedResponse, normalize_enum_value
from controllers.admin.wraps import admin_required
from controllers.common.schema import query_params_from_model, register_response_schema_models, register_schema_models
from extensions.ext_database import db
from fields.base import ResponseModel
from libs.helper import dump_response
from models.model import IconType
from services.admin_service import AdminService


class AppListQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=99999)
    limit: int = Field(default=20, ge=1, le=100)
    keyword: str | None = Field(default=None, max_length=50)
    tenant_id: str | None = None
    mode: str | None = None
    status: str | None = None
    is_public: bool | None = None
    enable_site: bool | None = None
    enable_api: bool | None = None


class AppUpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=400)
    icon_type: IconType | None = None
    icon: str | None = None
    icon_background: str | None = Field(default=None, max_length=255)
    enable_site: bool | None = None
    enable_api: bool | None = None
    is_public: bool | None = None
    maintainer: str | None = None
    max_active_requests: int | None = Field(default=None, ge=0)
    api_rpm: int | None = Field(default=None, ge=0)
    api_rph: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(extra="forbid")


class AppSiteResponse(ResponseModel):
    id: str | None = None
    title: str | None = None
    description: str | None = None
    status: str | None = None
    code: str | None = None

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, value: object) -> str | None:
        return normalize_enum_value(value)


class AppResponse(TimestampedResponse):
    id: str
    tenant_id: str
    name: str | None = None
    description: str | None = None
    mode: str | None = None
    icon: str | None = None
    icon_type: str | None = None
    icon_background: str | None = None
    status: str | None = None
    enable_site: bool
    enable_api: bool
    is_demo: bool
    is_public: bool
    is_universal: bool
    api_rpm: int | None = None
    api_rph: int | None = None
    max_active_requests: int | None = None
    created_by: str | None = None
    updated_by: str | None = None
    maintainer: str | None = None
    site: AppSiteResponse | None = None

    @field_validator("mode", "icon_type", "status", mode="before")
    @classmethod
    def _normalize_enum_like(cls, value: object) -> str | None:
        return normalize_enum_value(value)


class AppPaginationResponse(ResponseModel):
    data: list[AppResponse]
    has_more: bool
    limit: int
    page: int
    total: int


register_schema_models(admin_ns, AppListQuery, AppUpdatePayload)
register_response_schema_models(admin_ns, AppResponse, AppPaginationResponse, AppSiteResponse)


def _serialize_app(app) -> dict[str, object]:
    site = app.site
    return {
        "id": app.id,
        "tenant_id": app.tenant_id,
        "name": app.name,
        "description": app.description,
        "mode": app.mode,
        "icon": app.icon,
        "icon_type": app.icon_type,
        "icon_background": app.icon_background,
        "status": app.status,
        "enable_site": app.enable_site,
        "enable_api": app.enable_api,
        "is_demo": app.is_demo,
        "is_public": app.is_public,
        "is_universal": app.is_universal,
        "api_rpm": app.api_rpm,
        "api_rph": app.api_rph,
        "max_active_requests": app.max_active_requests,
        "created_by": app.created_by,
        "updated_by": app.updated_by,
        "maintainer": app.maintainer,
        "created_at": app.created_at,
        "updated_at": app.updated_at,
        "site": None
        if site is None
        else {
            "id": site.id,
            "title": site.title,
            "description": site.description,
            "status": site.status,
            "code": site.code,
        },
    }


@admin_ns.route("/apps")
class AdminAppListApi(Resource):
    @admin_ns.doc(params=query_params_from_model(AppListQuery))
    @admin_ns.response(200, "Success", admin_ns.models[AppPaginationResponse.__name__])
    @admin_required
    def get(self):
        query = AppListQuery.model_validate(request.args.to_dict(flat=True))
        pagination = AdminService.list_apps(
            db.session,
            page=query.page,
            limit=query.limit,
            keyword=query.keyword,
            tenant_id=query.tenant_id,
            mode=query.mode,
            status=query.status,
            is_public=query.is_public,
            enable_site=query.enable_site,
            enable_api=query.enable_api,
        )
        return dump_response(
            AppPaginationResponse,
            {
                "data": [_serialize_app(app) for app in pagination.items],
                "has_more": pagination.has_next,
                "limit": query.limit,
                "page": query.page,
                "total": pagination.total,
            },
        )


@admin_ns.route("/apps/<app_id>")
class AdminAppApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[AppResponse.__name__])
    @admin_required
    def get(self, app_id: str):
        app = AdminService.get_app(db.session, app_id)
        return dump_response(AppResponse, _serialize_app(app))

    @admin_ns.expect(admin_ns.models[AppUpdatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[AppResponse.__name__])
    @admin_required
    def patch(self, app_id: str):
        payload = AppUpdatePayload.model_validate(admin_ns.payload or {})
        values = payload.model_dump(exclude_unset=True)
        app = AdminService.update_app(db.session, app_id, values)
        return dump_response(AppResponse, _serialize_app(app))

    @admin_ns.response(204, "App deleted")
    @admin_required
    def delete(self, app_id: str):
        AdminService.delete_app(db.session, app_id)
        return "", 204
