"""Skills 前台目录服务。

Console API 只能读取已发布 Skills。这里集中维护发布状态过滤、
latest version 关联、下载计数和复制安装命令计数，避免控制器泄露后台状态。
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.orm import Session, scoped_session
from werkzeug.exceptions import NotFound

from extensions.ext_database import db
from extensions.ext_storage import storage
from libs.helper import escape_like_pattern
from models import (
    Skill,
    SkillAsset,
    SkillCategory,
    SkillCategoryBinding,
    SkillContentType,
    SkillPublicationStatus,
    SkillTag,
    SkillTagBinding,
    SkillVersion,
    UploadFile,
)

SessionLike = Session | scoped_session


class SkillService:
    """面向普通用户的 Skills 只读服务。"""

    @staticmethod
    def _paginate(session: SessionLike, stmt: Select[tuple[Skill]], *, page: int, limit: int):
        return db.paginate(select=stmt, page=page, per_page=limit, error_out=False)

    @classmethod
    def list_published_skills(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
        category: str | None = None,
        tag: str | None = None,
        source_type: str | None = None,
        content_type: str | None = None,
        audit_status: str | None = None,
        sort: str | None = None,
    ):
        stmt = select(Skill).where(Skill.publication_status == SkillPublicationStatus.PUBLISHED)
        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:80])
            stmt = stmt.where(
                or_(
                    Skill.name.ilike(f"%{escaped_keyword}%"),
                    Skill.slug.ilike(f"%{escaped_keyword}%"),
                    Skill.description.ilike(f"%{escaped_keyword}%"),
                    Skill.author_name.ilike(f"%{escaped_keyword}%"),
                )
            )
        if source_type:
            stmt = stmt.where(Skill.source_type == source_type)
        if audit_status:
            stmt = stmt.where(Skill.audit_status == audit_status)
        if content_type:
            stmt = stmt.join(SkillVersion, and_(SkillVersion.skill_id == Skill.id, SkillVersion.is_latest.is_(True)))
            stmt = stmt.where(SkillVersion.content_type == content_type)
        if category:
            stmt = (
                stmt.join(SkillCategoryBinding, SkillCategoryBinding.skill_id == Skill.id)
                .join(SkillCategory, SkillCategory.id == SkillCategoryBinding.category_id)
                .where(SkillCategory.slug == category)
            )
        if tag:
            stmt = (
                stmt.join(SkillTagBinding, SkillTagBinding.skill_id == Skill.id)
                .join(SkillTag, SkillTag.id == SkillTagBinding.tag_id)
                .where(SkillTag.slug == tag)
            )

        stmt = cls._apply_sort(stmt, sort)
        return cls._paginate(session, stmt, page=page, limit=limit)

    @staticmethod
    def _apply_sort(stmt: Select[tuple[Skill]], sort: str | None):
        if sort == "latest":
            return stmt.order_by(Skill.published_at.desc(), Skill.created_at.desc())
        if sort == "downloads":
            return stmt.order_by(Skill.install_count.desc(), Skill.created_at.desc())
        if sort == "name":
            return stmt.order_by(Skill.name.asc())
        return stmt.order_by(Skill.position.asc(), Skill.published_at.desc(), Skill.created_at.desc())

    @staticmethod
    def get_published_skill_by_slug(session: SessionLike, slug: str) -> Skill:
        skill = session.scalar(
            select(Skill).where(
                Skill.slug == slug,
                Skill.publication_status == SkillPublicationStatus.PUBLISHED,
            )
        )
        if skill is None:
            raise NotFound("Skill not found.")
        return skill

    @staticmethod
    def get_published_skill_by_id(session: SessionLike, skill_id: str) -> Skill:
        skill = session.scalar(
            select(Skill).where(
                Skill.id == skill_id,
                Skill.publication_status == SkillPublicationStatus.PUBLISHED,
            )
        )
        if skill is None:
            raise NotFound("Skill not found.")
        return skill

    @staticmethod
    def get_latest_version(session: SessionLike, skill_id: str) -> SkillVersion | None:
        return session.scalar(
            select(SkillVersion).where(SkillVersion.skill_id == skill_id, SkillVersion.is_latest.is_(True))
        )

    @staticmethod
    def get_download_asset(session: SessionLike, skill_id: str, version_id: str) -> SkillAsset | None:
        return session.scalar(
            select(SkillAsset).where(SkillAsset.skill_id == skill_id, SkillAsset.version_id == version_id).limit(1)
        )

    @staticmethod
    def get_download_file_stream(session: SessionLike, asset: SkillAsset):
        upload_file = session.scalar(select(UploadFile).where(UploadFile.id == asset.upload_file_id).limit(1))
        if upload_file is None:
            raise NotFound("Skill asset not found.")
        return storage.load(upload_file.key, stream=True), asset

    @staticmethod
    def hydrate_taxonomy_items(session: SessionLike, skills: Sequence[Skill]) -> None:
        skill_ids = [skill.id for skill in skills]
        if not skill_ids:
            return

        categories_by_skill_id: dict[str, list[SkillCategory]] = {skill_id: [] for skill_id in skill_ids}
        category_rows = session.execute(
            select(SkillCategoryBinding.skill_id, SkillCategory)
            .join(SkillCategory, SkillCategory.id == SkillCategoryBinding.category_id)
            .where(SkillCategoryBinding.skill_id.in_(skill_ids))
            .order_by(SkillCategory.position.asc(), SkillCategory.name.asc())
        ).all()
        for skill_id, category in category_rows:
            categories_by_skill_id.setdefault(skill_id, []).append(category)

        tags_by_skill_id: dict[str, list[SkillTag]] = {skill_id: [] for skill_id in skill_ids}
        tag_rows = session.execute(
            select(SkillTagBinding.skill_id, SkillTag)
            .join(SkillTag, SkillTag.id == SkillTagBinding.tag_id)
            .where(SkillTagBinding.skill_id.in_(skill_ids))
            .order_by(SkillTag.name.asc())
        ).all()
        for skill_id, tag in tag_rows:
            tags_by_skill_id.setdefault(skill_id, []).append(tag)

        for skill in skills:
            skill.categories = categories_by_skill_id.get(skill.id, [])
            skill.tags = tags_by_skill_id.get(skill.id, [])

    @staticmethod
    def list_published_taxonomy(session: SessionLike) -> dict[str, list[SkillCategory | SkillTag]]:
        categories = session.scalars(
            select(SkillCategory)
            .join(SkillCategoryBinding, SkillCategoryBinding.category_id == SkillCategory.id)
            .join(Skill, Skill.id == SkillCategoryBinding.skill_id)
            .where(Skill.publication_status == SkillPublicationStatus.PUBLISHED)
            .distinct()
            .order_by(SkillCategory.position.asc(), SkillCategory.name.asc())
        ).all()
        tags = session.scalars(
            select(SkillTag)
            .join(SkillTagBinding, SkillTagBinding.tag_id == SkillTag.id)
            .join(Skill, Skill.id == SkillTagBinding.skill_id)
            .where(Skill.publication_status == SkillPublicationStatus.PUBLISHED)
            .distinct()
            .order_by(SkillTag.name.asc())
        ).all()
        return {"categories": list(categories), "tags": list(tags)}

    @staticmethod
    def record_install_copy(session: SessionLike, skill_id: str) -> Skill:
        skill = SkillService.get_published_skill_by_id(session, skill_id)
        skill.install_count += 1
        session.commit()
        return skill

    @staticmethod
    def record_download(session: SessionLike, skill_id: str) -> tuple[Skill, SkillVersion, SkillAsset]:
        skill = SkillService.get_published_skill_by_id(session, skill_id)
        version = SkillService.get_latest_version(session, skill.id)
        if version is None or version.content_type == SkillContentType.REMOTE_REFERENCE:
            raise NotFound("Skill asset not found.")
        asset = SkillService.get_download_asset(session, skill.id, version.id)
        if asset is None:
            raise NotFound("Skill asset not found.")
        skill.install_count += 1
        session.commit()
        return skill, version, asset
