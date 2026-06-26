from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from .base import TypeBase
from .types import EnumText, LongText, StringUUID


class SkillSourceType(StrEnum):
    GITHUB = "github"
    OFFICIAL = "official"
    SITE = "site"
    OTHER = "other"

    @classmethod
    def value_of(cls, value: str) -> SkillSourceType:
        return cls(value)


class SkillPublicationStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    UNLISTED = "unlisted"
    ARCHIVED = "archived"


class SkillAuditStatus(StrEnum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"
    MANUAL = "manual"


class SkillContentType(StrEnum):
    ZIP_PACKAGE = "zip_package"
    MARKDOWN_FILE = "markdown_file"
    REMOTE_REFERENCE = "remote_reference"


class SkillAssetType(StrEnum):
    PACKAGE = "package"
    MARKDOWN = "markdown"
    ICON = "icon"
    README_ASSET = "readme_asset"


class Skill(TypeBase):
    __tablename__ = "skills"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="skill_pkey"),
        sa.Index("idx_skills_slug_unique", "slug", unique=True),
        sa.Index("idx_skills_publication_status_position", "publication_status", "position"),
        sa.Index("idx_skills_source_type", "source_type"),
        sa.Index("idx_skills_audit_status", "audit_status"),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    slug: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    description: Mapped[str] = mapped_column(LongText, nullable=False, default="")
    author_name: Mapped[str | None] = mapped_column(sa.String(255), nullable=True, default=None)
    source_type: Mapped[SkillSourceType] = mapped_column(
        EnumText(SkillSourceType, length=32),
        nullable=False,
        default=SkillSourceType.OTHER,
        server_default=sa.text("'other'"),
    )
    source_url: Mapped[str | None] = mapped_column(sa.String(1024), nullable=True, default=None)
    install_command: Mapped[str | None] = mapped_column(LongText, nullable=True, default=None)
    icon: Mapped[str | None] = mapped_column(sa.String(255), nullable=True, default=None)
    icon_background: Mapped[str | None] = mapped_column(sa.String(255), nullable=True, default=None)
    icon_url: Mapped[str | None] = mapped_column(sa.String(1024), nullable=True, default=None)
    publication_status: Mapped[SkillPublicationStatus] = mapped_column(
        EnumText(SkillPublicationStatus, length=32),
        nullable=False,
        default=SkillPublicationStatus.DRAFT,
        server_default=sa.text("'draft'"),
    )
    audit_status: Mapped[SkillAuditStatus] = mapped_column(
        EnumText(SkillAuditStatus, length=32),
        nullable=False,
        default=SkillAuditStatus.PENDING,
        server_default=sa.text("'pending'"),
    )
    audit_notes: Mapped[str | None] = mapped_column(LongText, nullable=True, default=None)
    install_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0, server_default=sa.text("0"))
    github_stars: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0, server_default=sa.text("0"))
    position: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0, server_default=sa.text("0"))
    published_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True, default=None)
    created_by: Mapped[str | None] = mapped_column(StringUUID, nullable=True, default=None)
    updated_by: Mapped[str | None] = mapped_column(StringUUID, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, server_default=sa.func.current_timestamp(), init=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        server_default=sa.func.current_timestamp(),
        onupdate=sa.func.current_timestamp(),
        init=False,
    )


class SkillVersion(TypeBase):
    __tablename__ = "skill_versions"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="skill_version_pkey"),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], name="skill_version_skill_id_fkey", ondelete="CASCADE"),
        sa.Index("idx_skill_versions_skill_latest", "skill_id", "is_latest"),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    skill_id: Mapped[str] = mapped_column(StringUUID, nullable=False)
    content_type: Mapped[SkillContentType] = mapped_column(
        EnumText(SkillContentType, length=32),
        nullable=False,
        default=SkillContentType.REMOTE_REFERENCE,
        server_default=sa.text("'remote_reference'"),
    )
    skill_markdown: Mapped[str | None] = mapped_column(LongText, nullable=True, default=None)
    package_filename: Mapped[str | None] = mapped_column(sa.String(255), nullable=True, default=None)
    package_size: Mapped[int | None] = mapped_column(sa.Integer, nullable=True, default=None)
    checksum_sha256: Mapped[str | None] = mapped_column(sa.String(255), nullable=True, default=None)
    is_latest: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False, server_default=sa.text("false"))
    published_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, server_default=sa.func.current_timestamp(), init=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        server_default=sa.func.current_timestamp(),
        onupdate=sa.func.current_timestamp(),
        init=False,
    )


class SkillAsset(TypeBase):
    __tablename__ = "skill_assets"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="skill_asset_pkey"),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], name="skill_asset_skill_id_fkey", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["skill_versions.id"], name="skill_asset_version_id_fkey"),
        sa.ForeignKeyConstraint(["upload_file_id"], ["upload_files.id"], name="skill_asset_upload_file_id_fkey"),
        sa.Index("idx_skill_assets_skill_version", "skill_id", "version_id"),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    skill_id: Mapped[str] = mapped_column(StringUUID, nullable=False)
    upload_file_id: Mapped[str] = mapped_column(StringUUID, nullable=False)
    filename: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    size: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    asset_type: Mapped[SkillAssetType] = mapped_column(
        EnumText(SkillAssetType, length=32),
        nullable=False,
        default=SkillAssetType.MARKDOWN,
        server_default=sa.text("'markdown'"),
    )
    version_id: Mapped[str | None] = mapped_column(StringUUID, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, server_default=sa.func.current_timestamp(), init=False
    )


class SkillCategory(TypeBase):
    __tablename__ = "skill_categories"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="skill_category_pkey"),
        sa.Index("idx_skill_categories_slug_unique", "slug", unique=True),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    slug: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    position: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0, server_default=sa.text("0"))
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, server_default=sa.func.current_timestamp(), init=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        server_default=sa.func.current_timestamp(),
        onupdate=sa.func.current_timestamp(),
        init=False,
    )


class SkillTag(TypeBase):
    __tablename__ = "skill_tags"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="skill_tag_pkey"),
        sa.Index("idx_skill_tags_slug_unique", "slug", unique=True),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    slug: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, server_default=sa.func.current_timestamp(), init=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        server_default=sa.func.current_timestamp(),
        onupdate=sa.func.current_timestamp(),
        init=False,
    )


class SkillCategoryBinding(TypeBase):
    __tablename__ = "skill_category_bindings"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="skill_category_binding_pkey"),
        sa.ForeignKeyConstraint(
            ["skill_id"], ["skills.id"], name="skill_category_binding_skill_id_fkey", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["skill_categories.id"],
            name="skill_category_binding_category_id_fkey",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("skill_id", "category_id", name="unique_skill_category_binding"),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    skill_id: Mapped[str] = mapped_column(StringUUID, nullable=False)
    category_id: Mapped[str] = mapped_column(StringUUID, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, server_default=sa.func.current_timestamp(), init=False
    )


class SkillTagBinding(TypeBase):
    __tablename__ = "skill_tag_bindings"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="skill_tag_binding_pkey"),
        sa.ForeignKeyConstraint(
            ["skill_id"], ["skills.id"], name="skill_tag_binding_skill_id_fkey", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["skill_tags.id"], name="skill_tag_binding_tag_id_fkey", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("skill_id", "tag_id", name="unique_skill_tag_binding"),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    skill_id: Mapped[str] = mapped_column(StringUUID, nullable=False)
    tag_id: Mapped[str] = mapped_column(StringUUID, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime, nullable=False, server_default=sa.func.current_timestamp(), init=False
    )
