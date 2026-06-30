"""add translation settings and usage

Revision ID: 7e4b2a9c1d03
Revises: 3f7a9c2e6b41
Create Date: 2026-06-29 14:30:00.000000

"""

import sqlalchemy as sa
from alembic import op

import models.types


revision = "7e4b2a9c1d03"
down_revision = "3f7a9c2e6b41"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "translation_provider_configs",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("encrypted_api_key", models.types.LongText(), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("monthly_free_quota_chars", sa.BigInteger(), server_default=sa.text("500000"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="translation_provider_config_pkey"),
    )
    with op.batch_alter_table("translation_provider_configs", schema=None) as batch_op:
        batch_op.create_index("idx_translation_provider_configs_provider_unique", ["provider"], unique=True)

    op.create_table(
        "translation_usages",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("used_chars", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="translation_usage_pkey"),
        sa.UniqueConstraint("provider", "month", name="unique_translation_usage_provider_month"),
    )
    with op.batch_alter_table("translation_usages", schema=None) as batch_op:
        batch_op.create_index("idx_translation_usages_provider_month", ["provider", "month"], unique=False)


def downgrade():
    with op.batch_alter_table("translation_usages", schema=None) as batch_op:
        batch_op.drop_index("idx_translation_usages_provider_month")
    op.drop_table("translation_usages")
    with op.batch_alter_table("translation_provider_configs", schema=None) as batch_op:
        batch_op.drop_index("idx_translation_provider_configs_provider_unique")
    op.drop_table("translation_provider_configs")
