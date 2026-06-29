"""add skill featured flag

Revision ID: 4c1e9b2a7d60
Revises: 8a7f3c2d9b10
Create Date: 2026-06-28 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op


revision = "4c1e9b2a7d60"
down_revision = "8a7f3c2d9b10"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("skills", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("is_featured", sa.Boolean(), server_default=sa.text("false"), nullable=False)
        )
        batch_op.create_index(
            "idx_skills_publication_featured_position",
            ["publication_status", "is_featured", "position"],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table("skills", schema=None) as batch_op:
        batch_op.drop_index("idx_skills_publication_featured_position")
        batch_op.drop_column("is_featured")
