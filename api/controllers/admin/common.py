"""系统后台 controller 的共享 DTO 与序列化工具。"""

from datetime import datetime
from typing import Any

from pydantic import AliasChoices, Field, field_validator

from fields.base import ResponseModel
from libs.helper import to_timestamp


class AdminPaginationQuery(ResponseModel):
    page: int = Field(default=1, ge=1, le=99999, description="Page number")
    limit: int = Field(default=20, ge=1, le=100, description="Page size")


class AdminMutationResponse(ResponseModel):
    result: str


class AdminPaginationResponse(ResponseModel):
    page: int
    limit: int = Field(validation_alias=AliasChoices("per_page", "limit"))
    total: int
    has_more: bool = Field(validation_alias=AliasChoices("has_next", "has_more"))
    data: list[Any] = Field(validation_alias=AliasChoices("items", "data"))


def normalize_enum_value(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(getattr(value, "value", value))


def normalize_timestamp(value: datetime | int | None) -> int | None:
    return to_timestamp(value)


class TimestampedResponse(ResponseModel):
    created_at: int | None = None
    updated_at: int | None = None

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_timestamp(cls, value: datetime | int | None) -> int | None:
        return normalize_timestamp(value)
