from datetime import UTC, datetime
from typing import Any

from flask import request
from flask_restx import Resource
from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

from controllers.admin import admin_ns
from controllers.admin.common import normalize_enum_value
from controllers.admin.wraps import admin_required
from controllers.common.schema import query_params_from_model, register_response_schema_models, register_schema_models
from extensions.ext_database import db
from fields.base import ResponseModel
from libs.helper import dump_response
from models.auto_service import (
    AutoService,
    AutoServiceRunLog,
    AutoServiceRunStatus,
    AutoServiceScheduleType,
    AutoServiceStatus,
    AutoServiceType,
)
from services.auto_service import AutoServiceManager


class AutoServiceListQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=99999)
    limit: int = Field(default=20, ge=1, le=100)
    keyword: str | None = Field(default=None, max_length=80)
    status: AutoServiceStatus | None = None
    service_type: AutoServiceType | None = None


class AutoServiceRunLogListQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=99999)
    limit: int = Field(default=20, ge=1, le=100)
    status: AutoServiceRunStatus | None = None


class AutoServiceMutationPayload(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=80)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    service_type: AutoServiceType | None = None
    status: AutoServiceStatus | None = None
    schedule_type: AutoServiceScheduleType | None = None
    interval_minutes: int | None = Field(default=None, ge=1)
    cron_expression: str | None = Field(default=None, max_length=255)
    timezone: str | None = Field(default=None, max_length=64)
    config: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


class AutoServiceCreatePayload(AutoServiceMutationPayload):
    code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=255)
    service_type: AutoServiceType


class AutoServiceRunLogResponse(ResponseModel):
    id: str
    auto_service_id: str
    status: str
    trigger_type: str
    celery_task_id: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    snapshot_path: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, value: object) -> str | None:
        return normalize_enum_value(value)

    @field_serializer("started_at", "finished_at", "created_at", "updated_at", when_used="json")
    def _serialize_datetime(self, value: datetime | None) -> str | None:
        return serialize_utc_datetime(value)


class AutoServiceResponse(ResponseModel):
    id: str
    code: str
    name: str
    description: str | None = None
    service_type: str
    status: str
    schedule_type: str
    interval_minutes: int | None = None
    cron_expression: str | None = None
    timezone: str
    config: dict[str, Any]
    last_run_at: datetime | None = None
    last_run_status: str | None = None
    next_run_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    latest_run_log: AutoServiceRunLogResponse | None = None

    @field_validator("service_type", "status", "schedule_type", "last_run_status", mode="before")
    @classmethod
    def _normalize_enum_like(cls, value: object) -> str | None:
        return normalize_enum_value(value)

    @field_serializer("last_run_at", "next_run_at", "created_at", "updated_at", when_used="json")
    def _serialize_datetime(self, value: datetime | None) -> str | None:
        return serialize_utc_datetime(value)


class AutoServicePaginationResponse(ResponseModel):
    data: list[AutoServiceResponse]
    has_more: bool
    limit: int
    page: int
    total: int


class AutoServiceRunLogPaginationResponse(ResponseModel):
    data: list[AutoServiceRunLogResponse]
    has_more: bool
    limit: int
    page: int
    total: int


register_schema_models(
    admin_ns,
    AutoServiceListQuery,
    AutoServiceRunLogListQuery,
    AutoServiceMutationPayload,
    AutoServiceCreatePayload,
)
register_response_schema_models(
    admin_ns,
    AutoServiceRunLogResponse,
    AutoServiceResponse,
    AutoServicePaginationResponse,
    AutoServiceRunLogPaginationResponse,
)


def serialize_utc_datetime(value: datetime | None) -> str | None:
    """自动服务时间按 UTC 入库；接口输出补充 Z，避免前端把无时区时间当成本地时间。"""
    if value is None:
        return None
    utc_value = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return utc_value.isoformat().replace("+00:00", "Z")


def _serialize_run_log(run_log: AutoServiceRunLog | None) -> dict[str, object] | None:
    if run_log is None:
        return None
    return {
        "id": run_log.id,
        "auto_service_id": run_log.auto_service_id,
        "status": run_log.status,
        "trigger_type": run_log.trigger_type,
        "celery_task_id": run_log.celery_task_id,
        "started_at": run_log.started_at,
        "finished_at": run_log.finished_at,
        "duration_ms": run_log.duration_ms,
        "result": run_log.result,
        "error": run_log.error,
        "snapshot_path": run_log.snapshot_path,
        "created_at": run_log.created_at,
        "updated_at": run_log.updated_at,
    }


def _serialize_auto_service(service: AutoService) -> dict[str, object]:
    latest_run_log = service.run_logs[0] if getattr(service, "run_logs", []) else None
    return {
        "id": service.id,
        "code": service.code,
        "name": service.name,
        "description": service.description,
        "service_type": service.service_type,
        "status": service.status,
        "schedule_type": service.schedule_type,
        "interval_minutes": service.interval_minutes,
        "cron_expression": service.cron_expression,
        "timezone": service.timezone,
        "config": service.config,
        "last_run_at": service.last_run_at,
        "last_run_status": service.last_run_status,
        "next_run_at": service.next_run_at,
        "created_at": service.created_at,
        "updated_at": service.updated_at,
        "latest_run_log": _serialize_run_log(latest_run_log),
    }


@admin_ns.route("/auto-services")
class AdminAutoServiceListApi(Resource):
    @admin_ns.doc(params=query_params_from_model(AutoServiceListQuery))
    @admin_ns.response(200, "Success", admin_ns.models[AutoServicePaginationResponse.__name__])
    @admin_required
    def get(self):
        query = AutoServiceListQuery.model_validate(request.args.to_dict(flat=True))
        pagination = AutoServiceManager.list_services(
            db.session,
            page=query.page,
            limit=query.limit,
            keyword=query.keyword,
            status=query.status,
            service_type=query.service_type,
        )
        return dump_response(
            AutoServicePaginationResponse,
            {
                "data": [_serialize_auto_service(service) for service in pagination.items],
                "has_more": pagination.has_next,
                "limit": query.limit,
                "page": query.page,
                "total": pagination.total,
            },
        )

    @admin_ns.expect(admin_ns.models[AutoServiceCreatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[AutoServiceResponse.__name__])
    @admin_required
    def post(self):
        payload = AutoServiceCreatePayload.model_validate(admin_ns.payload or {})
        service = AutoServiceManager.create_service(db.session, payload.model_dump(exclude_unset=True))
        return dump_response(AutoServiceResponse, _serialize_auto_service(service))


@admin_ns.route("/auto-services/<service_id>")
class AdminAutoServiceApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[AutoServiceResponse.__name__])
    @admin_required
    def get(self, service_id: str):
        service = AutoServiceManager.get_service(db.session, service_id)
        return dump_response(AutoServiceResponse, _serialize_auto_service(service))

    @admin_ns.expect(admin_ns.models[AutoServiceMutationPayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[AutoServiceResponse.__name__])
    @admin_required
    def patch(self, service_id: str):
        payload = AutoServiceMutationPayload.model_validate(admin_ns.payload or {})
        service = AutoServiceManager.update_service(db.session, service_id, payload.model_dump(exclude_unset=True))
        return dump_response(AutoServiceResponse, _serialize_auto_service(service))

    @admin_ns.response(204, "Auto service deleted")
    @admin_required
    def delete(self, service_id: str):
        AutoServiceManager.delete_service(db.session, service_id)
        return "", 204


@admin_ns.route("/auto-services/<service_id>/run")
class AdminAutoServiceRunApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[AutoServiceRunLogResponse.__name__])
    @admin_required
    def post(self, service_id: str):
        run_log = AutoServiceManager.dispatch_service(db.session, service_id, trigger_type="manual")
        return dump_response(AutoServiceRunLogResponse, _serialize_run_log(run_log) or {})


@admin_ns.route("/auto-services/<service_id>/logs")
class AdminAutoServiceRunLogListApi(Resource):
    @admin_ns.doc(params=query_params_from_model(AutoServiceRunLogListQuery))
    @admin_ns.response(200, "Success", admin_ns.models[AutoServiceRunLogPaginationResponse.__name__])
    @admin_required
    def get(self, service_id: str):
        query = AutoServiceRunLogListQuery.model_validate(request.args.to_dict(flat=True))
        pagination = AutoServiceManager.list_run_logs(
            db.session,
            service_id=service_id,
            page=query.page,
            limit=query.limit,
            status=query.status,
        )
        return dump_response(
            AutoServiceRunLogPaginationResponse,
            {
                "data": [_serialize_run_log(run_log) for run_log in pagination.items],
                "has_more": pagination.has_next,
                "limit": query.limit,
                "page": query.page,
                "total": pagination.total,
            },
        )
