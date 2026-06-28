from datetime import datetime, time
from typing import Any

from flask import request
from flask_restx import Resource
from pydantic import BaseModel, ConfigDict, Field, field_validator

from controllers.admin import admin_ns
from controllers.admin.wraps import admin_required
from controllers.common.schema import query_params_from_model, register_response_schema_models, register_schema_models
from extensions.ext_database import db
from fields.base import ResponseModel
from libs.helper import dump_response
from models import SkillAuditStatus, SkillContentType, SkillPublicationStatus, SkillSourceType
from services.admin_skill_service import AdminSkillService
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
    publication_status: str | None = Field(default=None, max_length=32)
    source_type: str | None = Field(default=None, max_length=32)
    audit_status: str | None = Field(default=None, max_length=32)
    updated_at_start: datetime | None = None
    updated_at_end: datetime | None = None
    sort: str | None = Field(default=None, max_length=32)

    @field_validator("updated_at_start", mode="before")
    @classmethod
    def _normalize_updated_at_start(cls, value: object) -> object:
        if isinstance(value, str) and len(value) == 10:
            return datetime.combine(datetime.strptime(value, "%Y-%m-%d").date(), time.min)
        return value

    @field_validator("updated_at_end", mode="before")
    @classmethod
    def _normalize_updated_at_end(cls, value: object) -> object:
        if isinstance(value, str) and len(value) == 10:
            return datetime.combine(datetime.strptime(value, "%Y-%m-%d").date(), time.max)
        return value


class SkillCreatePayload(BaseModel):
    slug: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    author_name: str | None = Field(default=None, max_length=255)
    source_type: SkillSourceType = SkillSourceType.OTHER
    source_url: str | None = Field(default=None, max_length=1024)
    install_command: str | None = None
    icon: str | None = Field(default=None, max_length=255)
    icon_background: str | None = Field(default=None, max_length=255)
    icon_url: str | None = Field(default=None, max_length=1024)
    publication_status: SkillPublicationStatus = SkillPublicationStatus.DRAFT
    audit_status: SkillAuditStatus = SkillAuditStatus.PENDING
    audit_notes: str | None = None
    categories: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    install_count: int = Field(default=0, ge=0)
    github_stars: int = Field(default=0, ge=0)
    position: int = Field(default=0, ge=0)
    content_type: SkillContentType = SkillContentType.REMOTE_REFERENCE
    skill_markdown: str | None = None

    model_config = ConfigDict(extra="forbid")


class SkillUpdatePayload(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1)
    author_name: str | None = Field(default=None, max_length=255)
    source_type: SkillSourceType | None = None
    source_url: str | None = Field(default=None, max_length=1024)
    install_command: str | None = None
    icon: str | None = Field(default=None, max_length=255)
    icon_background: str | None = Field(default=None, max_length=255)
    icon_url: str | None = Field(default=None, max_length=1024)
    publication_status: SkillPublicationStatus | None = None
    audit_status: SkillAuditStatus | None = None
    audit_notes: str | None = None
    categories: list[str] | None = None
    tags: list[str] | None = None
    install_count: int | None = Field(default=None, ge=0)
    github_stars: int | None = Field(default=None, ge=0)
    position: int | None = Field(default=None, ge=0)
    content_type: SkillContentType | None = None
    skill_markdown: str | None = None

    model_config = ConfigDict(extra="forbid")


class SkillTaxonomyListQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=99999)
    limit: int = Field(default=20, ge=1, le=100)
    keyword: str | None = Field(default=None, max_length=80)


class SkillCategoryCreatePayload(BaseModel):
    slug: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    position: int = Field(default=0, ge=0)

    model_config = ConfigDict(extra="forbid")


class SkillCategoryUpdatePayload(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    position: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(extra="forbid")


class SkillTagCreatePayload(BaseModel):
    slug: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)

    model_config = ConfigDict(extra="forbid")


class SkillTagUpdatePayload(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    name: str | None = Field(default=None, min_length=1, max_length=255)

    model_config = ConfigDict(extra="forbid")


class SkillVersionCreatePayload(BaseModel):
    content_type: SkillContentType = SkillContentType.REMOTE_REFERENCE
    skill_markdown: str | None = None
    package_filename: str | None = Field(default=None, max_length=255)
    package_size: int | None = Field(default=None, ge=0)
    checksum_sha256: str | None = Field(default=None, max_length=255)
    is_latest: bool = True

    model_config = ConfigDict(extra="forbid")


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


class SkillCategoryResponse(SkillTaxonomyResponse):
    position: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SkillTagResponse(SkillTaxonomyResponse):
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SkillAssetResponse(ResponseModel):
    id: str
    skill_id: str
    version_id: str | None = None
    asset_type: str
    upload_file_id: str
    filename: str
    mime_type: str
    size: int
    sha256: str
    created_at: datetime | None = None

    @field_validator("asset_type", mode="before")
    @classmethod
    def _normalize_asset_type(cls, value: object) -> str | None:
        return _normalize_enum_value(value)


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
    has_more: bool
    limit: int
    page: int
    total: int


class SkillCategoryPaginationResponse(ResponseModel):
    data: list[SkillCategoryResponse]
    has_more: bool
    limit: int
    page: int
    total: int


class SkillTagPaginationResponse(ResponseModel):
    data: list[SkillTagResponse]
    has_more: bool
    limit: int
    page: int
    total: int


register_schema_models(
    admin_ns,
    SkillListQuery,
    SkillCreatePayload,
    SkillUpdatePayload,
    SkillVersionCreatePayload,
    SkillTaxonomyListQuery,
    SkillCategoryCreatePayload,
    SkillCategoryUpdatePayload,
    SkillTagCreatePayload,
    SkillTagUpdatePayload,
)
register_response_schema_models(
    admin_ns,
    SkillVersionResponse,
    SkillTaxonomyResponse,
    SkillCategoryResponse,
    SkillTagResponse,
    SkillAssetResponse,
    SkillResponse,
    SkillPaginationResponse,
    SkillCategoryPaginationResponse,
    SkillTagPaginationResponse,
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


def _serialize_category(category: Any) -> dict[str, object]:
    return {
        "id": category.id,
        "slug": category.slug,
        "name": category.name,
        "position": category.position,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    }


def _serialize_tag(tag: Any) -> dict[str, object]:
    return {
        "id": tag.id,
        "slug": tag.slug,
        "name": tag.name,
        "created_at": tag.created_at,
        "updated_at": tag.updated_at,
    }


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
        "position": skill.position,
        "published_at": skill.published_at,
        "created_at": skill.created_at,
        "updated_at": skill.updated_at,
        "latest_version": _serialize_version(version),
    }


def _serialize_asset(asset: Any) -> dict[str, object]:
    return {
        "id": asset.id,
        "skill_id": asset.skill_id,
        "version_id": asset.version_id,
        "asset_type": asset.asset_type,
        "upload_file_id": asset.upload_file_id,
        "filename": asset.filename,
        "mime_type": asset.mime_type,
        "size": asset.size,
        "sha256": asset.sha256,
        "created_at": asset.created_at,
    }


@admin_ns.route("/skills")
class AdminSkillListApi(Resource):
    @admin_ns.doc(params=query_params_from_model(SkillListQuery))
    @admin_ns.response(200, "Success", admin_ns.models[SkillPaginationResponse.__name__])
    @admin_required
    def get(self):
        query = SkillListQuery.model_validate(request.args.to_dict(flat=True))
        pagination = AdminSkillService.list_skills(
            db.session,
            page=query.page,
            limit=query.limit,
            keyword=query.keyword,
            category=query.category,
            publication_status=query.publication_status,
            source_type=query.source_type,
            audit_status=query.audit_status,
            updated_at_start=query.updated_at_start,
            updated_at_end=query.updated_at_end,
            sort=query.sort,
        )
        SkillService.hydrate_taxonomy_items(db.session, pagination.items)
        return dump_response(
            SkillPaginationResponse,
            {
                "data": [
                    _serialize_skill(skill, SkillService.get_latest_version(db.session, skill.id))
                    for skill in pagination.items
                ],
                "has_more": pagination.has_next,
                "limit": query.limit,
                "page": query.page,
                "total": pagination.total,
            },
        )

    @admin_ns.expect(admin_ns.models[SkillCreatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[SkillResponse.__name__])
    @admin_required
    def post(self):
        payload = SkillCreatePayload.model_validate(admin_ns.payload or {})
        skill = AdminSkillService.create_skill(db.session, payload.model_dump())
        SkillService.hydrate_taxonomy_items(db.session, [skill])
        version = SkillService.get_latest_version(db.session, skill.id)
        return dump_response(SkillResponse, _serialize_skill(skill, version))


@admin_ns.route("/skills/<skill_id>")
class AdminSkillApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[SkillResponse.__name__])
    @admin_required
    def get(self, skill_id: str):
        skill = AdminSkillService.get_skill(db.session, skill_id)
        SkillService.hydrate_taxonomy_items(db.session, [skill])
        version = SkillService.get_latest_version(db.session, skill.id)
        return dump_response(SkillResponse, _serialize_skill(skill, version))

    @admin_ns.expect(admin_ns.models[SkillUpdatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[SkillResponse.__name__])
    @admin_required
    def patch(self, skill_id: str):
        payload = SkillUpdatePayload.model_validate(admin_ns.payload or {})
        skill = AdminSkillService.update_skill(db.session, skill_id, payload.model_dump(exclude_unset=True))
        SkillService.hydrate_taxonomy_items(db.session, [skill])
        version = SkillService.get_latest_version(db.session, skill.id)
        return dump_response(SkillResponse, _serialize_skill(skill, version))

    @admin_ns.response(204, "Skill archived")
    @admin_required
    def delete(self, skill_id: str):
        AdminSkillService.archive_skill(db.session, skill_id)
        return "", 204


@admin_ns.route("/skills/<skill_id>/versions")
class AdminSkillVersionListApi(Resource):
    @admin_ns.expect(admin_ns.models[SkillVersionCreatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[SkillVersionResponse.__name__])
    @admin_required
    def post(self, skill_id: str):
        payload = SkillVersionCreatePayload.model_validate(admin_ns.payload or {})
        version = AdminSkillService.create_version(db.session, skill_id, payload.model_dump())
        return dump_response(SkillVersionResponse, _serialize_version(version) or {})


@admin_ns.route("/skills/<skill_id>/assets")
class AdminSkillAssetListApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[SkillAssetResponse.__name__])
    @admin_required
    def post(self, skill_id: str):
        file = request.files.get("file")
        if file is None:
            from werkzeug.exceptions import BadRequest

            raise BadRequest("Skill asset file is required.")
        asset = AdminSkillService.upload_asset_file(db.session, skill_id, file)
        return dump_response(SkillAssetResponse, _serialize_asset(asset))


@admin_ns.route("/skill-categories")
class AdminSkillCategoryListApi(Resource):
    @admin_ns.doc(params=query_params_from_model(SkillTaxonomyListQuery))
    @admin_ns.response(200, "Success", admin_ns.models[SkillCategoryPaginationResponse.__name__])
    @admin_required
    def get(self):
        query = SkillTaxonomyListQuery.model_validate(request.args.to_dict(flat=True))
        pagination = AdminSkillService.list_categories(
            db.session,
            page=query.page,
            limit=query.limit,
            keyword=query.keyword,
        )
        return dump_response(
            SkillCategoryPaginationResponse,
            {
                "data": [_serialize_category(category) for category in pagination.items],
                "has_more": pagination.has_next,
                "limit": query.limit,
                "page": query.page,
                "total": pagination.total,
            },
        )

    @admin_ns.expect(admin_ns.models[SkillCategoryCreatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[SkillCategoryResponse.__name__])
    @admin_required
    def post(self):
        payload = SkillCategoryCreatePayload.model_validate(admin_ns.payload or {})
        category = AdminSkillService.create_category(db.session, payload.model_dump())
        return dump_response(SkillCategoryResponse, _serialize_category(category))


@admin_ns.route("/skill-categories/<category_id>")
class AdminSkillCategoryApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[SkillCategoryResponse.__name__])
    @admin_required
    def get(self, category_id: str):
        category = AdminSkillService.get_category(db.session, category_id)
        return dump_response(SkillCategoryResponse, _serialize_category(category))

    @admin_ns.expect(admin_ns.models[SkillCategoryUpdatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[SkillCategoryResponse.__name__])
    @admin_required
    def patch(self, category_id: str):
        payload = SkillCategoryUpdatePayload.model_validate(admin_ns.payload or {})
        category = AdminSkillService.update_category(db.session, category_id, payload.model_dump(exclude_unset=True))
        return dump_response(SkillCategoryResponse, _serialize_category(category))

    @admin_ns.response(204, "Skill category deleted")
    @admin_required
    def delete(self, category_id: str):
        AdminSkillService.delete_category(db.session, category_id)
        return "", 204


@admin_ns.route("/skill-tags")
class AdminSkillTagListApi(Resource):
    @admin_ns.doc(params=query_params_from_model(SkillTaxonomyListQuery))
    @admin_ns.response(200, "Success", admin_ns.models[SkillTagPaginationResponse.__name__])
    @admin_required
    def get(self):
        query = SkillTaxonomyListQuery.model_validate(request.args.to_dict(flat=True))
        pagination = AdminSkillService.list_tags(
            db.session,
            page=query.page,
            limit=query.limit,
            keyword=query.keyword,
        )
        return dump_response(
            SkillTagPaginationResponse,
            {
                "data": [_serialize_tag(tag) for tag in pagination.items],
                "has_more": pagination.has_next,
                "limit": query.limit,
                "page": query.page,
                "total": pagination.total,
            },
        )

    @admin_ns.expect(admin_ns.models[SkillTagCreatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[SkillTagResponse.__name__])
    @admin_required
    def post(self):
        payload = SkillTagCreatePayload.model_validate(admin_ns.payload or {})
        tag = AdminSkillService.create_tag(db.session, payload.model_dump())
        return dump_response(SkillTagResponse, _serialize_tag(tag))


@admin_ns.route("/skill-tags/<tag_id>")
class AdminSkillTagApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[SkillTagResponse.__name__])
    @admin_required
    def get(self, tag_id: str):
        tag = AdminSkillService.get_tag(db.session, tag_id)
        return dump_response(SkillTagResponse, _serialize_tag(tag))

    @admin_ns.expect(admin_ns.models[SkillTagUpdatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[SkillTagResponse.__name__])
    @admin_required
    def patch(self, tag_id: str):
        payload = SkillTagUpdatePayload.model_validate(admin_ns.payload or {})
        tag = AdminSkillService.update_tag(db.session, tag_id, payload.model_dump(exclude_unset=True))
        return dump_response(SkillTagResponse, _serialize_tag(tag))

    @admin_ns.response(204, "Skill tag deleted")
    @admin_required
    def delete(self, tag_id: str):
        AdminSkillService.delete_tag(db.session, tag_id)
        return "", 204
