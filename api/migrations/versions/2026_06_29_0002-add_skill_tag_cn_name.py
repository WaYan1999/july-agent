"""add skill tag chinese name

Revision ID: 3f7a9c2e6b41
Revises: 9d2b4f6a8c31
Create Date: 2026-06-29 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op


revision = "3f7a9c2e6b41"
down_revision = "9d2b4f6a8c31"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("skill_tags", schema=None) as batch_op:
        batch_op.add_column(sa.Column("cn_name", sa.String(length=255), nullable=True))


def downgrade():
    with op.batch_alter_table("skill_tags", schema=None) as batch_op:
        batch_op.drop_column("cn_name")

