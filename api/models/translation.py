from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from .base import TypeBase
from .types import LongText, StringUUID


class TranslationProviderConfig(TypeBase):
    """系统级翻译服务配置。"""

    __tablename__ = "translation_provider_configs"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="translation_provider_config_pkey"),
        sa.Index("idx_translation_provider_configs_provider_unique", "provider", unique=True),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    provider: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    encrypted_api_key: Mapped[str | None] = mapped_column(LongText, nullable=True, default=None)
    enabled: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=False,
        server_default=sa.text("false"),
    )
    monthly_free_quota_chars: Mapped[int] = mapped_column(
        sa.BigInteger,
        nullable=False,
        default=500_000,
        server_default=sa.text("500000"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        server_default=sa.func.current_timestamp(),
        init=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        server_default=sa.func.current_timestamp(),
        onupdate=sa.func.current_timestamp(),
        init=False,
    )


class TranslationUsage(TypeBase):
    """按自然月记录系统实际发起的翻译字符数。"""

    __tablename__ = "translation_usages"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="translation_usage_pkey"),
        sa.UniqueConstraint("provider", "month", name="unique_translation_usage_provider_month"),
        sa.Index("idx_translation_usages_provider_month", "provider", "month"),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    provider: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    month: Mapped[str] = mapped_column(sa.String(7), nullable=False)
    used_chars: Mapped[int] = mapped_column(
        sa.BigInteger,
        nullable=False,
        default=0,
        server_default=sa.text("0"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        server_default=sa.func.current_timestamp(),
        init=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        server_default=sa.func.current_timestamp(),
        onupdate=sa.func.current_timestamp(),
        init=False,
    )
