"""新增 Skills 工具分类

Revision ID: 9d2b4f6a8c31
Revises: 4c1e9b2a7d60
Create Date: 2026-06-29 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

import models.types


revision = "9d2b4f6a8c31"
down_revision = "4c1e9b2a7d60"
branch_labels = None
depends_on = None

TOOLS_CATEGORY_ID = "00000000-0000-0000-0000-000000000901"


def upgrade():
    bind = op.get_bind()
    existing = bind.execute(
        sa.text("SELECT id FROM skill_categories WHERE slug = :slug"),
        {"slug": "tools"},
    ).first()
    if existing is not None:
        return

    skill_categories = sa.table(
        "skill_categories",
        sa.column("id", models.types.StringUUID()),
        sa.column("slug", sa.String),
        sa.column("name", sa.String),
        sa.column("position", sa.Integer),
    )
    op.bulk_insert(
        skill_categories,
        [
            {
                "id": TOOLS_CATEGORY_ID,
                "slug": "tools",
                "name": "工具",
                "position": 80,
            },
        ],
    )


def downgrade():
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM skill_categories WHERE id = :id AND slug = :slug"),
        {"id": TOOLS_CATEGORY_ID, "slug": "tools"},
    )
