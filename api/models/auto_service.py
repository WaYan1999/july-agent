from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import TypeBase
from .types import AdjustedJSON, EnumText, LongText, StringUUID


class AutoServiceType(StrEnum):
    SKILL_CRAWLER_SYNC = "skill_crawler_sync"
    DATASET_QUEUE_MONITOR = "dataset_queue_monitor"


class AutoServiceScheduleType(StrEnum):
    INTERVAL = "interval"
    CRON = "cron"
    MANUAL = "manual"


class AutoServiceStatus(StrEnum):
    ENABLED = "enabled"
    DISABLED = "disabled"


class AutoServiceRunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class AutoService(TypeBase):
    """系统后台可配置的自动服务定义。"""

    __tablename__ = "auto_services"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="auto_service_pkey"),
        sa.Index("idx_auto_services_code_unique", "code", unique=True),
        sa.Index("idx_auto_services_status_next_run", "status", "next_run_at"),
        sa.Index("idx_auto_services_service_type", "service_type"),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    code: Mapped[str] = mapped_column(sa.String(80), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    service_type: Mapped[AutoServiceType] = mapped_column(
        EnumText(AutoServiceType, length=64),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(LongText, nullable=True, default=None)
    status: Mapped[AutoServiceStatus] = mapped_column(
        EnumText(AutoServiceStatus, length=32),
        nullable=False,
        default=AutoServiceStatus.DISABLED,
        server_default=sa.text("'disabled'"),
    )
    schedule_type: Mapped[AutoServiceScheduleType] = mapped_column(
        EnumText(AutoServiceScheduleType, length=32),
        nullable=False,
        default=AutoServiceScheduleType.MANUAL,
        server_default=sa.text("'manual'"),
    )
    interval_minutes: Mapped[int | None] = mapped_column(sa.Integer, nullable=True, default=None)
    cron_expression: Mapped[str | None] = mapped_column(sa.String(255), nullable=True, default=None)
    timezone: Mapped[str] = mapped_column(
        sa.String(64), nullable=False, default="Asia/Shanghai", server_default=sa.text("'Asia/Shanghai'")
    )
    config: Mapped[dict[str, Any]] = mapped_column(AdjustedJSON, nullable=False, default_factory=dict)
    last_run_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True, default=None)
    last_run_status: Mapped[AutoServiceRunStatus | None] = mapped_column(
        EnumText(AutoServiceRunStatus, length=32),
        nullable=True,
        default=None,
    )
    next_run_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True, default=None)
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

    run_logs: Mapped[list[AutoServiceRunLog]] = relationship(
        "AutoServiceRunLog",
        init=False,
        back_populates="auto_service",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by=lambda: AutoServiceRunLog.created_at.desc(),
    )


class AutoServiceRunLog(TypeBase):
    """自动服务每次投递与执行的可查询日志。"""

    __tablename__ = "auto_service_run_logs"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="auto_service_run_log_pkey"),
        sa.ForeignKeyConstraint(
            ["auto_service_id"],
            ["auto_services.id"],
            name="auto_service_run_log_service_id_fkey",
            ondelete="CASCADE",
        ),
        sa.Index("idx_auto_service_run_logs_service_created", "auto_service_id", "created_at"),
        sa.Index("idx_auto_service_run_logs_status", "status"),
        sa.Index("idx_auto_service_run_logs_task_id", "celery_task_id"),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    auto_service_id: Mapped[str] = mapped_column(StringUUID, nullable=False)
    status: Mapped[AutoServiceRunStatus] = mapped_column(
        EnumText(AutoServiceRunStatus, length=32),
        nullable=False,
        default=AutoServiceRunStatus.QUEUED,
        server_default=sa.text("'queued'"),
    )
    trigger_type: Mapped[str] = mapped_column(sa.String(32), nullable=False, default="scheduled")
    celery_task_id: Mapped[str | None] = mapped_column(sa.String(255), nullable=True, default=None)
    started_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True, default=None)
    finished_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True, default=None)
    duration_ms: Mapped[int | None] = mapped_column(sa.Integer, nullable=True, default=None)
    result: Mapped[dict[str, Any] | None] = mapped_column(AdjustedJSON, nullable=True, default=None)
    error: Mapped[str | None] = mapped_column(LongText, nullable=True, default=None)
    snapshot_path: Mapped[str | None] = mapped_column(sa.String(1024), nullable=True, default=None)
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

    auto_service: Mapped[AutoService] = relationship(
        "AutoService",
        init=False,
        back_populates="run_logs",
    )
