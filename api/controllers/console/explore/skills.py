from datetime import datetime
from typing import Any
from urllib.parse import quote

from flask import Response, request
from flask_restx import Resource
from pydantic import BaseModel, Field, field_validator

from controllers.common.schema import query_params_from_model, register_response_schema_models, register_schema_models
from controllers.console import console_ns
from extensions.ext_database import db
from fields.base import ResponseModel
from libs.helper import dump_response
from services.skill_service import SkillService


def _normalize_enum_value(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(getattr(value, "value", value))


class SkillListQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=99999)
    limit: int = Field(default=20, ge=1, le=100)
    keyword: str | None = Field(default=None, max_length=80)
    category: str | None = Field(default=None, max_length=255)
    tag: str | None = Field(default=None, max_length=255)
    source_type: str | None = Field(default=None, max_length=32)
    content_type: str | None = Field(default=None, max_length=32)
    audit_status: str | None = Field(default=None, max_length=32)
    sort: str | None = Field(default=None, max_length=32)


class SkillVersionResponse(ResponseModel):
    id: str | None = None
    content_type: str | None = None
    skill_markdown: str | None = None
    package_filename: str | None = None
    package_size: int | None = None
    checksum_sha256: str | None = None
    is_latest: bool | None = None
    published_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @field_validator("content_type", mode="before")
    @classmethod
    def _normalize_content_type(cls, value: object) -> str | None:
        return _normalize_enum_value(value)


class SkillTaxonomyResponse(ResponseModel):
    id: str | None = None
    slug: str
    name: str


class SkillResponse(ResponseModel):
    id: str
    slug: str
    name: str
    description: str
    author_name: str | None = None
    source_type: str | None = None
    source_url: str | None = None
    install_command: str | None = None
    icon: str | None = None
    icon_background: str | None = None
    icon_url: str | None = None
    publication_status: str | None = None
    audit_status: str | None = None
    audit_notes: str | None = None
    categories: list[SkillTaxonomyResponse] = Field(default_factory=list)
    tags: list[SkillTaxonomyResponse] = Field(default_factory=list)
    install_count: int
    github_stars: int
    is_featured: bool
    position: int
    published_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    latest_version: SkillVersionResponse | None = None

    @field_validator("source_type", "publication_status", "audit_status", mode="before")
    @classmethod
    def _normalize_enum_like(cls, value: object) -> str | None:
        return _normalize_enum_value(value)


class SkillPaginationResponse(ResponseModel):
    data: list[SkillResponse]
    filters: dict[str, list[SkillTaxonomyResponse]] = Field(default_factory=dict)
    has_more: bool
    limit: int
    page: int
    total: int


class SkillCopyEventResponse(ResponseModel):
    result: str
    install_count: int


class SkillDownloadResponse(ResponseModel):
    id: str
    filename: str
    mime_type: str
    size: int
    sha256: str


class SkillRecommendationGroupsResponse(ResponseModel):
    featured: list[SkillResponse]
    top20: list[SkillResponse]
    latest: list[SkillResponse]
    hottest: list[SkillResponse]


register_schema_models(console_ns, SkillListQuery)
register_response_schema_models(
    console_ns,
    SkillVersionResponse,
    SkillTaxonomyResponse,
    SkillResponse,
    SkillPaginationResponse,
    SkillCopyEventResponse,
    SkillDownloadResponse,
    SkillRecommendationGroupsResponse,
)


def _serialize_version(version: Any | None) -> dict[str, object] | None:
    if version is None:
        return None
    return {
        "id": version.id,
        "content_type": version.content_type,
        "skill_markdown": version.skill_markdown,
        "package_filename": version.package_filename,
        "package_size": version.package_size,
        "checksum_sha256": version.checksum_sha256,
        "is_latest": version.is_latest,
        "published_at": version.published_at,
        "created_at": version.created_at,
        "updated_at": version.updated_at,
    }


def _serialize_taxonomy_items(items: Any) -> list[dict[str, object]]:
    return [
        {
            "id": getattr(item, "id", None),
            "slug": item.slug,
            "name": item.name,
        }
        for item in items or []
    ]


def _serialize_skill(skill: Any, version: Any | None) -> dict[str, object]:
    return {
        "id": skill.id,
        "slug": skill.slug,
        "name": skill.name,
        "description": skill.description,
        "author_name": skill.author_name,
        "source_type": skill.source_type,
        "source_url": skill.source_url,
        "install_command": skill.install_command,
        "icon": skill.icon,
        "icon_background": skill.icon_background,
        "icon_url": skill.icon_url,
        "publication_status": skill.publication_status,
        "audit_status": skill.audit_status,
        "audit_notes": skill.audit_notes,
        "categories": _serialize_taxonomy_items(getattr(skill, "categories", [])),
        "tags": _serialize_taxonomy_items(getattr(skill, "tags", [])),
        "install_count": skill.install_count,
        "github_stars": skill.github_stars,
        "is_featured": skill.is_featured,
        "position": skill.position,
        "published_at": skill.published_at,
        "created_at": skill.created_at,
        "updated_at": skill.updated_at,
        "latest_version": _serialize_version(version),
    }


@console_ns.route("/explore/skills")
class ConsoleSkillListApi(Resource):
    @console_ns.doc(params=query_params_from_model(SkillListQuery))
    @console_ns.response(200, "Success", console_ns.models[SkillPaginationResponse.__name__])
    def get(self):
        query = SkillListQuery.model_validate(request.args.to_dict(flat=True))
        pagination = SkillService.list_published_skills(
            db.session,
            page=query.page,
            limit=query.limit,
            keyword=query.keyword,
            category=query.category,
            tag=query.tag,
            source_type=query.source_type,
            content_type=query.content_type,
            audit_status=query.audit_status,
            sort=query.sort,
        )
        SkillService.hydrate_taxonomy_items(db.session, pagination.items)
        filters = SkillService.list_published_taxonomy(db.session)
        return dump_response(
            SkillPaginationResponse,
            {
                "data": [
                    _serialize_skill(skill, SkillService.get_latest_version(db.session, skill.id))
                    for skill in pagination.items
                ],
                "filters": {
                    "categories": _serialize_taxonomy_items(filters["categories"]),
                    "tags": _serialize_taxonomy_items(filters["tags"]),
                },
                "has_more": pagination.has_next,
                "limit": query.limit,
                "page": query.page,
                "total": pagination.total,
            },
        )


@console_ns.route("/explore/skills/recommendations")
class ConsoleSkillRecommendationsApi(Resource):
    @console_ns.response(200, "Success", console_ns.models[SkillRecommendationGroupsResponse.__name__])
    def get(self):
        groups = SkillService.list_recommended_skill_groups(db.session)
        return dump_response(
            SkillRecommendationGroupsResponse,
            {
                group_name: [
                    _serialize_skill(skill, SkillService.get_latest_version(db.session, skill.id))
                    for skill in skills
                ]
                for group_name, skills in groups.items()
            },
        )


@console_ns.route("/explore/skills/<slug>")
class ConsoleSkillDetailApi(Resource):
    @console_ns.response(200, "Success", console_ns.models[SkillResponse.__name__])
    def get(self, slug: str):
        skill = SkillService.get_published_skill_by_slug(db.session, slug)
        SkillService.hydrate_taxonomy_items(db.session, [skill])
        version = SkillService.get_latest_version(db.session, skill.id)
        return dump_response(SkillResponse, _serialize_skill(skill, version))


@console_ns.route("/explore/skills/<skill_id>/download")
class ConsoleSkillDownloadApi(Resource):
    @console_ns.response(200, "Skill asset stream")
    def get(self, skill_id: str):
        _skill, _version, asset = SkillService.record_download(db.session, skill_id)
        generator, asset = SkillService.get_download_file_stream(db.session, asset)
        response = Response(generator, mimetype=asset.mime_type, direct_passthrough=True)
        if asset.size > 0:
            response.headers["Content-Length"] = str(asset.size)
        response.headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(asset.filename)}"
        return response


@console_ns.route("/explore/skills/<skill_id>/copy-events")
class ConsoleSkillCopyEventApi(Resource):
    @console_ns.response(200, "Success", console_ns.models[SkillCopyEventResponse.__name__])
    def post(self, skill_id: str):
        skill = SkillService.record_install_copy(db.session, skill_id)
        return dump_response(SkillCopyEventResponse, {"result": "success", "install_count": skill.install_count})
