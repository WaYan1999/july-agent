"""add auto service management

Revision ID: 8a7f3c2d9b10
Revises: 6f2d8a1b9c40
Create Date: 2026-06-26 00:00:02.000000

"""

import sqlalchemy as sa
from alembic import op

import models.types

revision = "8a7f3c2d9b10"
down_revision = "6f2d8a1b9c40"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "auto_services",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", models.types.LongText(), nullable=True),
        sa.Column("service_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'disabled'"), nullable=False),
        sa.Column("schedule_type", sa.String(length=32), server_default=sa.text("'manual'"), nullable=False),
        sa.Column("interval_minutes", sa.Integer(), nullable=True),
        sa.Column("cron_expression", sa.String(length=255), nullable=True),
        sa.Column("timezone", sa.String(length=64), server_default=sa.text("'Asia/Shanghai'"), nullable=False),
        sa.Column("config", models.types.AdjustedJSON(), nullable=False),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("last_run_status", sa.String(length=32), nullable=True),
        sa.Column("next_run_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="auto_service_pkey"),
    )
    with op.batch_alter_table("auto_services", schema=None) as batch_op:
        batch_op.create_index("idx_auto_services_code_unique", ["code"], unique=True)
        batch_op.create_index("idx_auto_services_service_type", ["service_type"], unique=False)
        batch_op.create_index("idx_auto_services_status_next_run", ["status", "next_run_at"], unique=False)

    op.create_table(
        "auto_service_run_logs",
        sa.Column("id", models.types.StringUUID(), nullable=False),
        sa.Column("auto_service_id", models.types.StringUUID(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'queued'"), nullable=False),
        sa.Column("trigger_type", sa.String(length=32), nullable=False),
        sa.Column("celery_task_id", sa.String(length=255), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("result", models.types.AdjustedJSON(), nullable=True),
        sa.Column("error", models.types.LongText(), nullable=True),
        sa.Column("snapshot_path", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
        sa.ForeignKeyConstraint(
            ["auto_service_id"],
            ["auto_services.id"],
            name="auto_service_run_log_service_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="auto_service_run_log_pkey"),
    )
    with op.batch_alter_table("auto_service_run_logs", schema=None) as batch_op:
        batch_op.create_index("idx_auto_service_run_logs_service_created", ["auto_service_id", "created_at"])
        batch_op.create_index("idx_auto_service_run_logs_status", ["status"])
        batch_op.create_index("idx_auto_service_run_logs_task_id", ["celery_task_id"])

    auto_services = sa.table(
        "auto_services",
        sa.column("id", models.types.StringUUID()),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", models.types.LongText()),
        sa.column("service_type", sa.String),
        sa.column("status", sa.String),
        sa.column("schedule_type", sa.String),
        sa.column("interval_minutes", sa.Integer),
        sa.column("timezone", sa.String),
        sa.column("config", models.types.AdjustedJSON()),
    )
    op.bulk_insert(
        auto_services,
        [
            {
                "id": "00000000-0000-0000-0000-000000000801",
                "code": "skill-crawler-sync",
                "name": "Skill 爬虫同步",
                "description": "按配置从爬虫服务器同步 Skill 库数据。",
                "service_type": "skill_crawler_sync",
                "status": "disabled",
                "schedule_type": "interval",
                "interval_minutes": 60,
                "timezone": "Asia/Shanghai",
                "config": {},
            },
            {
                "id": "00000000-0000-0000-0000-000000000802",
                "code": "dataset-queue-monitor",
                "name": "数据集队列监控",
                "description": "监控数据集 Celery 队列积压并记录结果。",
                "service_type": "dataset_queue_monitor",
                "status": "disabled",
                "schedule_type": "interval",
                "interval_minutes": 30,
                "timezone": "Asia/Shanghai",
                "config": {"queue_name": "dataset"},
            },
        ],
    )


def downgrade():
    op.execute("DELETE FROM auto_service_run_logs WHERE auto_service_id IN "
               "('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000802')")
    op.execute("DELETE FROM auto_services WHERE id IN "
               "('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000802')")
    with op.batch_alter_table("auto_service_run_logs", schema=None) as batch_op:
        batch_op.drop_index("idx_auto_service_run_logs_task_id")
        batch_op.drop_index("idx_auto_service_run_logs_status")
        batch_op.drop_index("idx_auto_service_run_logs_service_created")
    op.drop_table("auto_service_run_logs")
    with op.batch_alter_table("auto_services", schema=None) as batch_op:
        batch_op.drop_index("idx_auto_services_status_next_run")
        batch_op.drop_index("idx_auto_services_service_type")
        batch_op.drop_index("idx_auto_services_code_unique")
    op.drop_table("auto_services")
