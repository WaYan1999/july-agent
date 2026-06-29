"""Skills 后台管理服务。

后台接口由 ADMIN_API_KEY 保护，可以跨租户维护全部 Skills。服务负责
校验 slug、发布状态、latest version 约束、分类标签绑定和上传资产解析。
"""

from __future__ import annotations

import hashlib
import mimetypes
import os
import re
import zipfile
from collections.abc import Mapping, Sequence
from datetime import datetime
from io import BytesIO
from pathlib import PurePath
from typing import Any
from uuid import uuid4

from sqlalchemy import Select, delete, or_, select
from sqlalchemy.orm import Session, scoped_session
from werkzeug.datastructures import FileStorage
from werkzeug.exceptions import BadRequest, NotFound

from configs import dify_config
from extensions.ext_database import db
from extensions.ext_storage import storage
from extensions.storage.storage_type import StorageType
from libs.datetime_utils import naive_utc_now
from libs.helper import escape_like_pattern
from models import (
    CreatorUserRole,
    Skill,
    SkillAsset,
    SkillAssetType,
    SkillAuditStatus,
    SkillCategory,
    SkillCategoryBinding,
    SkillContentType,
    SkillPublicationStatus,
    SkillSourceType,
    SkillTag,
    SkillTagBinding,
    SkillVersion,
    UploadFile,
)

SessionLike = Session | scoped_session
SLUG_PATTERN = re.compile(r"^[a-z0-9_:-]+(?:-[a-z0-9_:-]+)*$")
MAX_MARKDOWN_PREVIEW_BYTES = 256 * 1024
SYSTEM_UPLOAD_TENANT_ID = "00000000-0000-0000-0000-000000000000"
SYSTEM_UPLOAD_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000"
ALLOWED_ASSET_EXTENSIONS = {".zip", ".md", ".markdown"}


class AdminSkillService:
    """面向系统后台的 Skills 管理服务。"""

    @staticmethod
    def _paginate(session: SessionLike, stmt: Select[tuple[Skill]], *, page: int, limit: int):
        return db.paginate(select=stmt, page=page, per_page=limit, error_out=False)

    @staticmethod
    def _paginate_categories(session: SessionLike, stmt: Select[tuple[SkillCategory]], *, page: int, limit: int):
        return db.paginate(select=stmt, page=page, per_page=limit, error_out=False)

    @staticmethod
    def _paginate_tags(session: SessionLike, stmt: Select[tuple[SkillTag]], *, page: int, limit: int):
        return db.paginate(select=stmt, page=page, per_page=limit, error_out=False)

    @staticmethod
    def get_skill(session: SessionLike, skill_id: str) -> Skill:
        skill = session.get(Skill, skill_id)
        if skill is None:
            raise NotFound("Skill not found.")
        return skill

    @staticmethod
    def get_category(session: SessionLike, category_id: str) -> SkillCategory:
        category = session.get(SkillCategory, category_id)
        if category is None:
            raise NotFound("Skill category not found.")
        return category

    @staticmethod
    def get_tag(session: SessionLike, tag_id: str) -> SkillTag:
        tag = session.get(SkillTag, tag_id)
        if tag is None:
            raise NotFound("Skill tag not found.")
        return tag

    @classmethod
    def list_skills(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
        publication_status: str | None = None,
        source_type: str | None = None,
        audit_status: str | None = None,
        category: str | None = None,
        min_github_stars: int | None = None,
        updated_at_start: datetime | None = None,
        updated_at_end: datetime | None = None,
        sort: str | None = None,
    ):
        stmt = cls._build_skill_list_stmt(
            keyword=keyword,
            publication_status=publication_status,
            source_type=source_type,
            audit_status=audit_status,
            category=category,
            min_github_stars=min_github_stars,
            updated_at_start=updated_at_start,
            updated_at_end=updated_at_end,
        )
        stmt = cls._apply_skill_sort(stmt, sort)
        return cls._paginate(session, stmt, page=page, limit=limit)

    @staticmethod
    def _build_skill_list_stmt(
        *,
        keyword: str | None = None,
        publication_status: str | None = None,
        source_type: str | None = None,
        audit_status: str | None = None,
        category: str | None = None,
        min_github_stars: int | None = None,
        updated_at_start: datetime | None = None,
        updated_at_end: datetime | None = None,
    ) -> Select[tuple[Skill]]:
        stmt = select(Skill)
        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:80])
            stmt = stmt.where(Skill.name.ilike(f"%{escaped_keyword}%", escape="\\"))
        if publication_status:
            stmt = stmt.where(Skill.publication_status == publication_status)
        if source_type:
            stmt = stmt.where(Skill.source_type == source_type)
        if audit_status:
            stmt = stmt.where(Skill.audit_status == audit_status)
        if category:
            escaped_category = escape_like_pattern(category[:80])
            stmt = (
                stmt.join(SkillCategoryBinding, SkillCategoryBinding.skill_id == Skill.id)
                .join(SkillCategory, SkillCategory.id == SkillCategoryBinding.category_id)
                .where(
                    or_(
                        SkillCategory.slug.ilike(f"%{escaped_category}%", escape="\\"),
                        SkillCategory.name.ilike(f"%{escaped_category}%", escape="\\"),
                    )
                )
            )
        if min_github_stars is not None:
            stmt = stmt.where(Skill.github_stars >= min_github_stars)
        if updated_at_start:
            stmt = stmt.where(Skill.updated_at >= updated_at_start)
        if updated_at_end:
            stmt = stmt.where(Skill.updated_at <= updated_at_end)
        return stmt

    @staticmethod
    def _apply_skill_sort(stmt: Select[tuple[Skill]], sort: str | None):
        if sort == "downloads_desc":
            return stmt.order_by(Skill.install_count.desc(), Skill.updated_at.desc(), Skill.id.desc())
        if sort == "downloads_asc":
            return stmt.order_by(Skill.install_count.asc(), Skill.updated_at.desc(), Skill.id.desc())
        if sort == "github_stars_desc":
            return stmt.order_by(Skill.github_stars.desc(), Skill.updated_at.desc(), Skill.id.desc())
        if sort == "github_stars_asc":
            return stmt.order_by(Skill.github_stars.asc(), Skill.updated_at.desc(), Skill.id.desc())
        return stmt.order_by(Skill.position.asc(), Skill.updated_at.desc())

    @classmethod
    def list_categories(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
    ):
        stmt = select(SkillCategory).order_by(SkillCategory.position.asc(), SkillCategory.name.asc())
        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:80])
            stmt = stmt.where(
                or_(
                    SkillCategory.name.ilike(f"%{escaped_keyword}%"),
                    SkillCategory.slug.ilike(f"%{escaped_keyword}%"),
                )
            )
        return cls._paginate_categories(session, stmt, page=page, limit=limit)

    @classmethod
    def list_tags(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
    ):
        stmt = select(SkillTag).order_by(SkillTag.name.asc())
        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:80])
            stmt = stmt.where(
                or_(
                    SkillTag.name.ilike(f"%{escaped_keyword}%"),
                    SkillTag.slug.ilike(f"%{escaped_keyword}%"),
                )
            )
        return cls._paginate_tags(session, stmt, page=page, limit=limit)

    @staticmethod
    def validate_slug(slug: str) -> str:
        if not SLUG_PATTERN.match(slug):
            raise BadRequest("Skill slug is invalid.")
        return slug

    @classmethod
    def create_skill(cls, session: SessionLike, values: Mapping[str, Any]) -> Skill:
        slug = cls.validate_slug(str(values["slug"]))
        publication_status = values.get("publication_status", SkillPublicationStatus.DRAFT)
        published_at = naive_utc_now() if publication_status == SkillPublicationStatus.PUBLISHED else None
        skill = Skill(
            slug=slug,
            name=str(values["name"]),
            description=str(values["description"]),
            author_name=values.get("author_name"),
            source_type=values.get("source_type", SkillSourceType.OTHER),
            source_url=values.get("source_url"),
            install_command=values.get("install_command"),
            icon=values.get("icon"),
            icon_background=values.get("icon_background"),
            icon_url=values.get("icon_url"),
            publication_status=publication_status,
            audit_status=values.get("audit_status", SkillAuditStatus.PENDING),
            audit_notes=values.get("audit_notes"),
            install_count=int(values.get("install_count", 0)),
            github_stars=int(values.get("github_stars", 0)),
            is_featured=bool(values.get("is_featured", False)),
            position=int(values.get("position", 0)),
            published_at=published_at,
            created_by=values.get("created_by"),
            updated_by=values.get("updated_by"),
        )
        session.add(skill)
        session.flush()
        if "categories" in values:
            cls.sync_category_bindings(session, skill.id, values.get("categories") or [])
        if "tags" in values:
            cls.sync_tag_bindings(session, skill.id, values.get("tags") or [])
        version = SkillVersion(
            skill_id=skill.id,
            content_type=values.get("content_type", SkillContentType.REMOTE_REFERENCE),
            skill_markdown=values.get("skill_markdown"),
            package_filename=values.get("package_filename"),
            package_size=values.get("package_size"),
            checksum_sha256=values.get("checksum_sha256"),
            is_latest=True,
            published_at=published_at,
        )
        session.add(version)
        session.commit()
        return skill

    @classmethod
    def create_category(cls, session: SessionLike, values: Mapping[str, Any]) -> SkillCategory:
        category = SkillCategory(
            slug=cls.validate_slug(str(values["slug"])),
            name=str(values["name"]),
            position=int(values.get("position", 0)),
        )
        session.add(category)
        session.commit()
        return category

    @classmethod
    def create_tag(cls, session: SessionLike, values: Mapping[str, Any]) -> SkillTag:
        tag = SkillTag(
            slug=cls.validate_slug(str(values["slug"])),
            name=str(values["name"]),
        )
        session.add(tag)
        session.commit()
        return tag

    @classmethod
    def update_skill(cls, session: SessionLike, skill_id: str, values: Mapping[str, Any]) -> Skill:
        skill = cls.get_skill(session, skill_id)
        if "slug" in values:
            skill.slug = cls.validate_slug(str(values["slug"]))
        for field_name in (
            "name",
            "description",
            "author_name",
            "source_type",
            "source_url",
            "install_command",
            "icon",
            "icon_background",
            "icon_url",
            "audit_status",
            "audit_notes",
            "install_count",
            "github_stars",
            "is_featured",
            "position",
            "updated_by",
        ):
            if field_name in values:
                setattr(skill, field_name, values[field_name])
        if "categories" in values:
            cls.sync_category_bindings(session, skill.id, values.get("categories") or [])
        if "tags" in values:
            cls.sync_tag_bindings(session, skill.id, values.get("tags") or [])
        if "publication_status" in values:
            next_status = values["publication_status"]
            skill.publication_status = next_status
            if next_status == SkillPublicationStatus.PUBLISHED and skill.published_at is None:
                skill.published_at = naive_utc_now()
        if "content_type" in values or "skill_markdown" in values:
            version = cls.get_latest_version(session, skill.id)
            if version is None:
                version = SkillVersion(skill_id=skill.id, is_latest=True)
                session.add(version)
                session.flush()
            if "content_type" in values:
                version.content_type = values["content_type"]
            if "skill_markdown" in values:
                version.skill_markdown = values["skill_markdown"]
        session.commit()
        return skill

    @classmethod
    def batch_publish_skills(
        cls,
        session: SessionLike,
        *,
        skill_ids: Sequence[str] | None = None,
        keyword: str | None = None,
        publication_status: str | None = None,
        source_type: str | None = None,
        audit_status: str | None = None,
        category: str | None = None,
        min_github_stars: int | None = None,
        updated_at_start: datetime | None = None,
        updated_at_end: datetime | None = None,
    ) -> int:
        normalized_skill_ids = [skill_id for skill_id in dict.fromkeys(skill_ids or []) if skill_id]
        if normalized_skill_ids:
            stmt = select(Skill).where(Skill.id.in_(normalized_skill_ids))
        else:
            stmt = cls._build_skill_list_stmt(
                keyword=keyword,
                publication_status=publication_status,
                source_type=source_type,
                audit_status=audit_status,
                category=category,
                min_github_stars=min_github_stars,
                updated_at_start=updated_at_start,
                updated_at_end=updated_at_end,
            )

        skills = session.scalars(stmt).all()
        if not skills:
            return 0

        published_at = naive_utc_now()
        for skill in skills:
            skill.publication_status = SkillPublicationStatus.PUBLISHED
            if skill.published_at is None:
                skill.published_at = published_at
        session.commit()
        return len(skills)

    @classmethod
    def update_category(cls, session: SessionLike, category_id: str, values: Mapping[str, Any]) -> SkillCategory:
        category = cls.get_category(session, category_id)
        if "slug" in values:
            category.slug = cls.validate_slug(str(values["slug"]))
        if "name" in values:
            category.name = str(values["name"])
        if "position" in values:
            category.position = int(values["position"])
        session.commit()
        return category

    @classmethod
    def update_tag(cls, session: SessionLike, tag_id: str, values: Mapping[str, Any]) -> SkillTag:
        tag = cls.get_tag(session, tag_id)
        if "slug" in values:
            tag.slug = cls.validate_slug(str(values["slug"]))
        if "name" in values:
            tag.name = str(values["name"])
        session.commit()
        return tag

    @staticmethod
    def archive_skill(session: SessionLike, skill_id: str) -> Skill:
        skill = AdminSkillService.get_skill(session, skill_id)
        skill.publication_status = SkillPublicationStatus.ARCHIVED
        session.commit()
        return skill

    @classmethod
    def delete_category(cls, session: SessionLike, category_id: str) -> None:
        category = cls.get_category(session, category_id)
        session.delete(category)
        session.commit()

    @classmethod
    def delete_tag(cls, session: SessionLike, tag_id: str) -> None:
        tag = cls.get_tag(session, tag_id)
        session.delete(tag)
        session.commit()

    @staticmethod
    def create_version(session: SessionLike, skill_id: str, values: Mapping[str, Any]) -> SkillVersion:
        skill = AdminSkillService.get_skill(session, skill_id)
        make_latest = bool(values.get("is_latest", True))
        if make_latest:
            versions = session.scalars(select(SkillVersion).where(SkillVersion.skill_id == skill.id)).all()
            for version in versions:
                version.is_latest = False
        version = SkillVersion(
            skill_id=skill.id,
            content_type=values.get("content_type", SkillContentType.REMOTE_REFERENCE),
            skill_markdown=values.get("skill_markdown"),
            package_filename=values.get("package_filename"),
            package_size=values.get("package_size"),
            checksum_sha256=values.get("checksum_sha256"),
            is_latest=make_latest,
            published_at=values.get("published_at"),
        )
        session.add(version)
        session.commit()
        return version

    @staticmethod
    def get_latest_version(session: SessionLike, skill_id: str) -> SkillVersion | None:
        return session.scalar(
            select(SkillVersion).where(SkillVersion.skill_id == skill_id, SkillVersion.is_latest.is_(True))
        )

    @classmethod
    def sync_category_bindings(cls, session: SessionLike, skill_id: str, slugs: list[str]) -> None:
        session.execute(delete(SkillCategoryBinding).where(SkillCategoryBinding.skill_id == skill_id))
        for slug in cls._normalized_unique_slugs(slugs):
            category = cls._get_or_create_category(session, slug)
            session.add(SkillCategoryBinding(skill_id=skill_id, category_id=category.id))

    @classmethod
    def sync_tag_bindings(cls, session: SessionLike, skill_id: str, slugs: list[str]) -> None:
        session.execute(delete(SkillTagBinding).where(SkillTagBinding.skill_id == skill_id))
        for slug in cls._normalized_unique_slugs(slugs):
            tag = cls._get_or_create_tag(session, slug)
            session.add(SkillTagBinding(skill_id=skill_id, tag_id=tag.id))

    @classmethod
    def _normalized_unique_slugs(cls, slugs: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for raw_slug in slugs:
            slug = cls.validate_slug(str(raw_slug).strip())
            if slug not in seen:
                seen.add(slug)
                normalized.append(slug)
        return normalized

    @staticmethod
    def _get_or_create_category(session: SessionLike, slug: str) -> SkillCategory:
        category = session.scalar(select(SkillCategory).where(SkillCategory.slug == slug))
        if category is None:
            category = SkillCategory(slug=slug, name=slug)
            session.add(category)
            session.flush()
        return category

    @staticmethod
    def _get_or_create_tag(session: SessionLike, slug: str) -> SkillTag:
        tag = session.scalar(select(SkillTag).where(SkillTag.slug == slug))
        if tag is None:
            tag = SkillTag(slug=slug, name=slug)
            session.add(tag)
            session.flush()
        return tag

    @classmethod
    def upload_asset_file(cls, session: SessionLike, skill_id: str, file: FileStorage) -> SkillAsset:
        filename = PurePath(file.filename or "").name
        extension = os.path.splitext(filename)[1].lower()
        if not filename or extension not in ALLOWED_ASSET_EXTENSIONS:
            raise BadRequest("Only .zip, .md and .markdown skill assets are supported.")

        content = file.stream.read()
        if not content:
            raise BadRequest("Skill asset file is empty.")

        skill = cls.get_skill(session, skill_id)
        version = cls.get_latest_version(session, skill.id)
        if version is None:
            version = SkillVersion(
                skill_id=skill.id,
                content_type=SkillContentType.REMOTE_REFERENCE,
                is_latest=True,
            )
            session.add(version)
            session.flush()

        fallback_markdown: str | None = None
        skill_markdown: str | None = None
        if extension == ".zip":
            fallback_markdown, skill_markdown = cls.extract_markdown_from_zip(content)
        else:
            markdown = cls.read_markdown_content(content)
            if filename.lower() == "readme.md":
                fallback_markdown = markdown
            else:
                skill_markdown = markdown

        upload_file = cls._create_system_upload_file(
            session,
            filename=filename,
            content=content,
            mimetype=file.mimetype or mimetypes.guess_type(filename)[0] or "application/octet-stream",
            extension=extension.lstrip("."),
        )
        return cls.attach_asset_from_upload_file(
            session,
            skill=skill,
            version=version,
            upload_file=upload_file,
            content=content,
            fallback_markdown=fallback_markdown,
            skill_markdown=skill_markdown,
        )

    @staticmethod
    def _create_system_upload_file(
        session: SessionLike,
        *,
        filename: str,
        content: bytes,
        mimetype: str,
        extension: str,
    ) -> UploadFile:
        file_uuid = str(uuid4())
        storage_key = f"upload_files/{SYSTEM_UPLOAD_TENANT_ID}/{file_uuid}.{extension}"
        storage.save(storage_key, content)
        now = naive_utc_now()
        upload_file = UploadFile(
            tenant_id=SYSTEM_UPLOAD_TENANT_ID,
            storage_type=StorageType(dify_config.STORAGE_TYPE),
            key=storage_key,
            name=filename,
            size=len(content),
            extension=extension,
            mime_type=mimetype,
            created_by_role=CreatorUserRole.ACCOUNT,
            created_by=SYSTEM_UPLOAD_ACCOUNT_ID,
            created_at=now,
            used=True,
            used_by=SYSTEM_UPLOAD_ACCOUNT_ID,
            used_at=now,
            hash=hashlib.sha3_256(content).hexdigest(),
        )
        session.add(upload_file)
        session.flush()
        return upload_file

    @staticmethod
    def attach_asset_from_upload_file(
        session: SessionLike,
        *,
        skill: Skill,
        version: SkillVersion,
        upload_file: UploadFile,
        content: bytes,
        fallback_markdown: str | None,
        skill_markdown: str | None,
    ) -> SkillAsset:
        extension = os.path.splitext(upload_file.name)[1].lower()
        content_type = SkillContentType.ZIP_PACKAGE if extension == ".zip" else SkillContentType.MARKDOWN_FILE
        asset_type = SkillAssetType.PACKAGE if content_type == SkillContentType.ZIP_PACKAGE else SkillAssetType.MARKDOWN
        checksum = AdminSkillService.compute_sha256(content)
        asset = SkillAsset(
            skill_id=skill.id,
            upload_file_id=upload_file.id,
            filename=upload_file.name,
            mime_type=upload_file.mime_type or "application/octet-stream",
            size=upload_file.size,
            sha256=checksum,
            asset_type=asset_type,
            version_id=version.id,
        )
        version.content_type = content_type
        version.package_filename = upload_file.name
        version.package_size = upload_file.size
        version.checksum_sha256 = checksum
        markdown = skill_markdown if skill_markdown is not None else fallback_markdown
        if markdown is not None:
            version.skill_markdown = markdown
        session.add(asset)
        session.commit()
        return asset

    @staticmethod
    def compute_sha256(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    @staticmethod
    def extract_markdown_from_zip(content: bytes) -> tuple[str | None, str | None]:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            names = [name for name in archive.namelist() if not name.endswith("/")]
            safe_names = [name for name in names if ".." not in name.split("/") and not name.startswith("/")]
            readme_name = next((name for name in safe_names if name.lower() == "readme.md"), None)
            skill_name = next((name for name in safe_names if name.lower() == "skill.md"), None)
            fallback_name = next(
                (name for name in safe_names if "/" not in name and name.lower().endswith(".md")),
                None,
            )
            selected_name = readme_name or skill_name or fallback_name
            if selected_name is None:
                return None, None
            raw = archive.read(selected_name, pwd=None)[:MAX_MARKDOWN_PREVIEW_BYTES]
            text = raw.decode("utf-8")
            if selected_name == skill_name and readme_name is None:
                return None, text
            return text, None

    @staticmethod
    def read_markdown_content(content: bytes) -> str:
        try:
            return content[:MAX_MARKDOWN_PREVIEW_BYTES].decode("utf-8")
        except UnicodeDecodeError as exc:
            raise BadRequest("Markdown file encoding is not supported.") from exc
