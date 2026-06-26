"""add skills library tables

Revision ID: 6f2d8a1b9c40
Revises: c8f4a6b2d3e1
Create Date: 2026-06-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

import models.types


revision = "6f2d8a1b9c40"
down_revision = "c8f4a6b2d3e1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "skills",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", models.types.LongText(), nullable=False),
        sa.Column("author_name", sa.String(length=255), nullable=True),
        sa.Column("source_type", sa.String(length=32), server_default=sa.text("'other'"), nullable=False),
        sa.Column("source_url", sa.String(length=1024), nullable=True),
        sa.Column("install_command", models.types.LongText(), nullable=True),
        sa.Column("icon", sa.String(length=255), nullable=True),
        sa.Column("icon_background", sa.String(length=255), nullable=True),
        sa.Column("icon_url", sa.String(length=1024), nullable=True),
        sa.Column("publication_status", sa.String(length=32), server_default=sa.text("'draft'"), nullable=False),
        sa.Column("audit_status", sa.String(length=32), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("audit_notes", models.types.LongText(), nullable=True),
        sa.Column("install_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("github_stars", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("position", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", models.types.StringUUID(), nullable=True),
        sa.Column("updated_by", models.types.StringUUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="skill_pkey"),
    )
    with op.batch_alter_table("skills", schema=None) as batch_op:
        batch_op.create_index("idx_skills_audit_status", ["audit_status"], unique=False)
        batch_op.create_index("idx_skills_publication_status_position", ["publication_status", "position"], unique=False)
        batch_op.create_index("idx_skills_slug_unique", ["slug"], unique=True)
        batch_op.create_index("idx_skills_source_type", ["source_type"], unique=False)

    op.create_table(
        "skill_versions",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("skill_id", models.types.StringUUID(), nullable=False),
        sa.Column(
            "content_type",
            sa.String(length=32),
            server_default=sa.text("'remote_reference'"),
            nullable=False,
        ),
        sa.Column("skill_markdown", models.types.LongText(), nullable=True),
        sa.Column("package_filename", sa.String(length=255), nullable=True),
        sa.Column("package_size", sa.Integer(), nullable=True),
        sa.Column("checksum_sha256", sa.String(length=255), nullable=True),
        sa.Column("is_latest", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], name="skill_version_skill_id_fkey", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="skill_version_pkey"),
    )
    with op.batch_alter_table("skill_versions", schema=None) as batch_op:
        batch_op.create_index("idx_skill_versions_skill_latest", ["skill_id", "is_latest"], unique=False)

    op.create_table(
        "skill_categories",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("position", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="skill_category_pkey"),
    )
    with op.batch_alter_table("skill_categories", schema=None) as batch_op:
        batch_op.create_index("idx_skill_categories_slug_unique", ["slug"], unique=True)

    op.create_table(
        "skill_tags",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="skill_tag_pkey"),
    )
    with op.batch_alter_table("skill_tags", schema=None) as batch_op:
        batch_op.create_index("idx_skill_tags_slug_unique", ["slug"], unique=True)

    op.create_table(
        "skill_assets",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("skill_id", models.types.StringUUID(), nullable=False),
        sa.Column("version_id", models.types.StringUUID(), nullable=True),
        sa.Column("asset_type", sa.String(length=32), server_default=sa.text("'markdown'"), nullable=False),
        sa.Column("upload_file_id", models.types.StringUUID(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], name="skill_asset_skill_id_fkey", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["upload_file_id"], ["upload_files.id"], name="skill_asset_upload_file_id_fkey"),
        sa.ForeignKeyConstraint(["version_id"], ["skill_versions.id"], name="skill_asset_version_id_fkey"),
        sa.PrimaryKeyConstraint("id", name="skill_asset_pkey"),
    )
    with op.batch_alter_table("skill_assets", schema=None) as batch_op:
        batch_op.create_index("idx_skill_assets_skill_version", ["skill_id", "version_id"], unique=False)

    op.create_table(
        "skill_category_bindings",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("skill_id", models.types.StringUUID(), nullable=False),
        sa.Column("category_id", models.types.StringUUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["skill_categories.id"],
            name="skill_category_binding_category_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["skill_id"],
            ["skills.id"],
            name="skill_category_binding_skill_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="skill_category_binding_pkey"),
        sa.UniqueConstraint("skill_id", "category_id", name="unique_skill_category_binding"),
    )

    op.create_table(
        "skill_tag_bindings",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("skill_id", models.types.StringUUID(), nullable=False),
        sa.Column("tag_id", models.types.StringUUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.ForeignKeyConstraint(
            ["skill_id"],
            ["skills.id"],
            name="skill_tag_binding_skill_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["skill_tags.id"],
            name="skill_tag_binding_tag_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="skill_tag_binding_pkey"),
        sa.UniqueConstraint("skill_id", "tag_id", name="unique_skill_tag_binding"),
    )


def downgrade():
    op.drop_table("skill_tag_bindings")
    op.drop_table("skill_category_bindings")
    with op.batch_alter_table("skill_assets", schema=None) as batch_op:
        batch_op.drop_index("idx_skill_assets_skill_version")
    op.drop_table("skill_assets")
    with op.batch_alter_table("skill_tags", schema=None) as batch_op:
        batch_op.drop_index("idx_skill_tags_slug_unique")
    op.drop_table("skill_tags")
    with op.batch_alter_table("skill_categories", schema=None) as batch_op:
        batch_op.drop_index("idx_skill_categories_slug_unique")
    op.drop_table("skill_categories")
    with op.batch_alter_table("skill_versions", schema=None) as batch_op:
        batch_op.drop_index("idx_skill_versions_skill_latest")
    op.drop_table("skill_versions")
    with op.batch_alter_table("skills", schema=None) as batch_op:
        batch_op.drop_index("idx_skills_source_type")
        batch_op.drop_index("idx_skills_slug_unique")
        batch_op.drop_index("idx_skills_publication_status_position")
        batch_op.drop_index("idx_skills_audit_status")
    op.drop_table("skills")
