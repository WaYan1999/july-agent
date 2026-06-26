from flask import request
from flask_restx import Resource
from pydantic import BaseModel, ConfigDict, Field

from controllers.admin import admin_ns
from controllers.admin.common import TimestampedResponse
from controllers.admin.wraps import admin_required
from controllers.common.schema import query_params_from_model, register_response_schema_models, register_schema_models
from extensions.ext_database import db
from fields.base import ResponseModel
from libs.helper import dump_response
from services.admin_service import AdminService


class RecommendedAppListQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=99999)
    limit: int = Field(default=20, ge=1, le=100)
    keyword: str | None = Field(default=None, max_length=50)
    language: str | None = Field(default=None, max_length=255)
    is_listed: bool | None = None
    is_learn_dify: bool | None = None


class RecommendedAppSitePayload(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    copyright: str | None = Field(default=None, max_length=255)
    privacy_policy: str | None = Field(default=None, max_length=255)
    custom_disclaimer: str | None = Field(default=None, max_length=512)

    model_config = ConfigDict(extra="forbid")


class RecommendedAppUpdatePayload(BaseModel):
    categories: list[str] | None = None
    position: int | None = Field(default=None, ge=0)
    is_listed: bool | None = None
    is_learn_dify: bool | None = None
    custom_disclaimer: str | None = Field(default=None, max_length=512)
    site: RecommendedAppSitePayload | None = None

    model_config = ConfigDict(extra="forbid")


class RecommendedAppSiteResponse(ResponseModel):
    id: str | None = None
    title: str | None = None
    description: str | None = None
    copyright: str | None = None
    privacy_policy: str | None = None
    custom_disclaimer: str | None = None


class RecommendedAppRelatedAppResponse(ResponseModel):
    id: str
    name: str | None = None
    mode: str | None = None
    icon: str | None = None
    icon_type: str | None = None
    icon_background: str | None = None


class RecommendedAppResponse(TimestampedResponse):
    id: str
    app_id: str
    categories: list[str] = Field(default_factory=list)
    category: str | None = None
    position: int
    is_listed: bool
    is_learn_dify: bool
    install_count: int
    language: str
    custom_disclaimer: str | None = None
    app: RecommendedAppRelatedAppResponse | None = None
    site: RecommendedAppSiteResponse | None = None


class RecommendedAppPaginationResponse(ResponseModel):
    data: list[RecommendedAppResponse]
    has_more: bool
    limit: int
    page: int
    total: int


register_schema_models(admin_ns, RecommendedAppListQuery, RecommendedAppUpdatePayload, RecommendedAppSitePayload)
register_response_schema_models(
    admin_ns,
    RecommendedAppResponse,
    RecommendedAppPaginationResponse,
    RecommendedAppRelatedAppResponse,
    RecommendedAppSiteResponse,
)


def _serialize_recommended_app(recommended_app) -> dict[str, object]:
    app = recommended_app.app
    site = app.site if app is not None else None
    return {
        "id": recommended_app.id,
        "app_id": recommended_app.app_id,
        "categories": recommended_app.categories or [],
        "category": recommended_app.category,
        "position": recommended_app.position,
        "is_listed": recommended_app.is_listed,
        "is_learn_dify": recommended_app.is_learn_dify,
        "install_count": recommended_app.install_count,
        "language": recommended_app.language,
        "custom_disclaimer": recommended_app.custom_disclaimer,
        "created_at": recommended_app.created_at,
        "updated_at": recommended_app.updated_at,
        "app": None
        if app is None
        else {
            "id": app.id,
            "name": app.name,
            "mode": app.mode,
            "icon": app.icon,
            "icon_type": app.icon_type,
            "icon_background": app.icon_background,
        },
        "site": None
        if site is None
        else {
            "id": site.id,
            "title": site.title,
            "description": site.description,
            "copyright": site.copyright,
            "privacy_policy": site.privacy_policy,
            "custom_disclaimer": site.custom_disclaimer,
        },
    }


@admin_ns.route("/recommended-apps")
class AdminRecommendedAppListApi(Resource):
    @admin_ns.doc(params=query_params_from_model(RecommendedAppListQuery))
    @admin_ns.response(200, "Success", admin_ns.models[RecommendedAppPaginationResponse.__name__])
    @admin_required
    def get(self):
        query = RecommendedAppListQuery.model_validate(request.args.to_dict(flat=True))
        pagination = AdminService.list_recommended_apps(
            db.session,
            page=query.page,
            limit=query.limit,
            keyword=query.keyword,
            language=query.language,
            is_listed=query.is_listed,
            is_learn_dify=query.is_learn_dify,
        )
        return dump_response(
            RecommendedAppPaginationResponse,
            {
                "data": [_serialize_recommended_app(recommended_app) for recommended_app in pagination.items],
                "has_more": pagination.has_next,
                "limit": query.limit,
                "page": query.page,
                "total": pagination.total,
            },
        )


@admin_ns.route("/recommended-apps/<recommended_app_id>")
class AdminRecommendedAppApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[RecommendedAppResponse.__name__])
    @admin_required
    def get(self, recommended_app_id: str):
        recommended_app = AdminService.get_recommended_app(db.session, recommended_app_id)
        return dump_response(RecommendedAppResponse, _serialize_recommended_app(recommended_app))

    @admin_ns.expect(admin_ns.models[RecommendedAppUpdatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[RecommendedAppResponse.__name__])
    @admin_required
    def patch(self, recommended_app_id: str):
        payload = RecommendedAppUpdatePayload.model_validate(admin_ns.payload or {})
        values = payload.model_dump(exclude_unset=True)
        recommended_app = AdminService.update_recommended_app(db.session, recommended_app_id, values)
        return dump_response(RecommendedAppResponse, _serialize_recommended_app(recommended_app))

    @admin_ns.response(204, "Recommended app unlisted")
    @admin_required
    def delete(self, recommended_app_id: str):
        AdminService.unlist_recommended_app(db.session, recommended_app_id)
        return "", 204
