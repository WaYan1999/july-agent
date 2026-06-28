"""系统自动服务管理与执行编排。

本模块只负责后台可配置自动服务的元数据、调度游标和执行日志。具体业务执行保持在现有
服务中，例如 Skill 爬虫同步继续由 `SkillCrawlerSyncService` 完成；自动服务的 `config`
用于覆盖同步窗口、分页大小和请求鉴权等运行参数。
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import UTC, date, datetime, timedelta
from typing import Any, NotRequired, TypedDict

from celery import current_app
from kombu.utils.url import parse_url  # type: ignore[import-untyped]
from redis import Redis
from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session, scoped_session
from werkzeug.exceptions import BadRequest, NotFound

from configs import dify_config
from extensions.ext_database import db
from libs.datetime_utils import naive_utc_now
from libs.helper import escape_like_pattern
from libs.schedule_utils import calculate_next_run_at
from models.auto_service import (
    AutoService,
    AutoServiceRunLog,
    AutoServiceRunStatus,
    AutoServiceScheduleType,
    AutoServiceStatus,
    AutoServiceType,
)
from services.skill_crawler_sync_service import SkillCrawlerSyncError, SkillCrawlerSyncService

logger = logging.getLogger(__name__)

SessionLike = Session | scoped_session
DEFAULT_SKILL_CRAWLER_SYNC_LIMIT = 50
MAX_SKILL_CRAWLER_SYNC_LIMIT = 500
DEFAULT_AUTO_SERVICE_TIMEZONE = "Asia/Shanghai"


class AutoServiceValues(TypedDict, total=False):
    code: str
    name: str
    description: str | None
    service_type: AutoServiceType | str
    status: AutoServiceStatus | str
    schedule_type: AutoServiceScheduleType | str
    interval_minutes: int | None
    cron_expression: str | None
    timezone: str
    config: dict[str, Any]


class AutoServiceRunResult(TypedDict):
    status: AutoServiceRunStatus
    result: NotRequired[dict[str, Any] | None]
    error: NotRequired[str | None]
    snapshot_path: NotRequired[str | None]


class AutoServiceManager:
    """后台自动服务的 CRUD、调度游标与运行日志管理。"""

    @staticmethod
    def _paginate(session: SessionLike, stmt: Select[tuple[Any]], *, page: int, limit: int):
        return db.paginate(select=stmt, page=page, per_page=limit, error_out=False)

    @classmethod
    def list_services(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
        status: AutoServiceStatus | str | None = None,
        service_type: AutoServiceType | str | None = None,
    ):
        stmt = select(AutoService).order_by(AutoService.updated_at.desc())
        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:80])
            stmt = stmt.where(
                or_(
                    AutoService.name.ilike(f"%{escaped_keyword}%"),
                    AutoService.code.ilike(f"%{escaped_keyword}%"),
                    AutoService.description.ilike(f"%{escaped_keyword}%"),
                )
            )
        if status:
            stmt = stmt.where(AutoService.status == AutoServiceStatus(status))
        if service_type:
            stmt = stmt.where(AutoService.service_type == AutoServiceType(service_type))
        return cls._paginate(session, stmt, page=page, limit=limit)

    @staticmethod
    def get_service(session: SessionLike, service_id: str) -> AutoService:
        service = session.get(AutoService, service_id)
        if service is None:
            raise NotFound("Auto service not found.")
        return service

    @staticmethod
    def create_service(session: SessionLike, values: AutoServiceValues) -> AutoService:
        normalized = normalize_auto_service_values(values, existing=None)
        service = AutoService(**normalized)
        service.next_run_at = compute_next_run_at(service, base_time=naive_utc_now())
        session.add(service)
        session.commit()
        return service

    @staticmethod
    def update_service(session: SessionLike, service_id: str, values: AutoServiceValues) -> AutoService:
        service = AutoServiceManager.get_service(session, service_id)
        normalized = normalize_auto_service_values(values, existing=service)
        for field_name, value in normalized.items():
            setattr(service, field_name, value)
        service.next_run_at = compute_next_run_at(service, base_time=naive_utc_now())
        session.commit()
        return service

    @staticmethod
    def delete_service(session: SessionLike, service_id: str) -> None:
        service = AutoServiceManager.get_service(session, service_id)
        session.delete(service)
        session.commit()

    @staticmethod
    def list_run_logs(
        session: SessionLike,
        *,
        service_id: str,
        page: int,
        limit: int,
        status: AutoServiceRunStatus | str | None = None,
    ):
        AutoServiceManager.get_service(session, service_id)
        stmt = (
            select(AutoServiceRunLog)
            .where(AutoServiceRunLog.auto_service_id == service_id)
            .order_by(AutoServiceRunLog.created_at.desc())
        )
        if status:
            stmt = stmt.where(AutoServiceRunLog.status == AutoServiceRunStatus(status))
        return AutoServiceManager._paginate(session, stmt, page=page, limit=limit)

    @staticmethod
    def create_run_log(
        session: SessionLike,
        *,
        service_id: str,
        trigger_type: str,
        status: AutoServiceRunStatus = AutoServiceRunStatus.QUEUED,
        commit: bool = True,
    ) -> AutoServiceRunLog:
        AutoServiceManager.get_service(session, service_id)
        run_log = AutoServiceRunLog(auto_service_id=service_id, trigger_type=trigger_type, status=status)
        session.add(run_log)
        if commit:
            session.commit()
        else:
            session.flush()
        return run_log

    @staticmethod
    def get_active_run(session: SessionLike, service_id: str) -> AutoServiceRunLog | None:
        return session.scalar(
            select(AutoServiceRunLog)
            .where(
                AutoServiceRunLog.auto_service_id == service_id,
                AutoServiceRunLog.status.in_([AutoServiceRunStatus.QUEUED, AutoServiceRunStatus.RUNNING]),
            )
            .order_by(AutoServiceRunLog.created_at.desc())
        )

    @staticmethod
    def dispatch_service(session: SessionLike, service_id: str, *, trigger_type: str) -> AutoServiceRunLog:
        active_run = AutoServiceManager.get_active_run(session, service_id)
        if active_run is not None:
            return active_run

        run_log = AutoServiceManager.create_run_log(
            session,
            service_id=service_id,
            trigger_type=trigger_type,
            commit=False,
        )
        task = current_app.send_task(
            "schedule.auto_service_tasks.run_auto_service",
            args=[run_log.id],
            queue="auto_service",
        )
        run_log.celery_task_id = task.id
        session.commit()
        return run_log

    @staticmethod
    def mark_run_started(session: SessionLike, run_log_id: str) -> tuple[AutoServiceRunLog, AutoService] | None:
        run_log = session.get(AutoServiceRunLog, run_log_id)
        if run_log is None:
            raise NotFound("Auto service run log not found.")
        if run_log.status != AutoServiceRunStatus.QUEUED:
            logger.info("Skip auto service run log %s because status is %s", run_log_id, run_log.status)
            return None
        service = AutoServiceManager.get_service(session, run_log.auto_service_id)
        now = naive_utc_now()
        run_log.status = AutoServiceRunStatus.RUNNING
        run_log.started_at = now
        service.last_run_at = now
        service.last_run_status = AutoServiceRunStatus.RUNNING
        session.commit()
        return run_log, service

    @staticmethod
    def mark_run_finished(
        session: SessionLike,
        *,
        run_log: AutoServiceRunLog,
        service: AutoService,
        run_result: AutoServiceRunResult,
    ) -> AutoServiceRunLog:
        now = naive_utc_now()
        run_log.finished_at = now
        run_log.status = run_result["status"]
        run_log.result = run_result.get("result")
        run_log.error = run_result.get("error")
        run_log.snapshot_path = run_result.get("snapshot_path")
        if run_log.started_at is not None:
            run_log.duration_ms = int((now - run_log.started_at).total_seconds() * 1000)

        service.last_run_at = now
        service.last_run_status = run_log.status
        service.next_run_at = compute_next_run_at(service, base_time=now)
        session.commit()
        return run_log

    @staticmethod
    def fetch_due_services(session: Session, *, limit: int) -> list[AutoService]:
        now = naive_utc_now()
        services = session.scalars(
            select(AutoService)
            .where(
                AutoService.status == AutoServiceStatus.ENABLED,
                AutoService.schedule_type != AutoServiceScheduleType.MANUAL,
                AutoService.next_run_at.isnot(None),
                AutoService.next_run_at <= now,
            )
            .order_by(AutoService.next_run_at.asc())
            .with_for_update(skip_locked=True)
            .limit(limit)
        )
        return list(services)

    @staticmethod
    def has_active_run(session: SessionLike, service_id: str) -> bool:
        return AutoServiceManager.get_active_run(session, service_id) is not None


def normalize_auto_service_values(
    values: Mapping[str, Any],
    *,
    existing: AutoService | None,
) -> dict[str, Any]:
    merged: dict[str, Any] = {
        "schedule_type": existing.schedule_type if existing else AutoServiceScheduleType.MANUAL,
        "status": existing.status if existing else AutoServiceStatus.DISABLED,
        "timezone": existing.timezone if existing else DEFAULT_AUTO_SERVICE_TIMEZONE,
        "config": existing.config if existing else {},
        "interval_minutes": existing.interval_minutes if existing else None,
        "cron_expression": existing.cron_expression if existing else None,
    }
    if existing is not None:
        merged.update(
            {
                "code": existing.code,
                "name": existing.name,
                "description": existing.description,
                "service_type": existing.service_type,
            }
        )
    merged.update(values)

    required_fields = ("code", "name", "service_type")
    missing = [field_name for field_name in required_fields if not merged.get(field_name)]
    if missing:
        raise BadRequest(f"Auto service field is required: {', '.join(missing)}.")

    merged["code"] = str(merged["code"]).strip()
    merged["name"] = str(merged["name"]).strip()
    merged["description"] = normalize_optional_string(merged.get("description"))
    merged["service_type"] = AutoServiceType(merged["service_type"])
    merged["status"] = AutoServiceStatus(merged["status"])
    merged["schedule_type"] = AutoServiceScheduleType(merged["schedule_type"])
    merged["timezone"] = (
        str(merged.get("timezone") or DEFAULT_AUTO_SERVICE_TIMEZONE).strip() or DEFAULT_AUTO_SERVICE_TIMEZONE
    )
    merged["config"] = dict(merged.get("config") or {})

    interval_minutes = merged.get("interval_minutes")
    merged["interval_minutes"] = int(interval_minutes) if interval_minutes is not None else None
    merged["cron_expression"] = normalize_optional_string(merged.get("cron_expression"))
    validate_schedule_config(merged)
    return merged


def normalize_optional_string(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def validate_schedule_config(values: Mapping[str, Any]) -> None:
    schedule_type = AutoServiceScheduleType(values["schedule_type"])
    if schedule_type == AutoServiceScheduleType.INTERVAL:
        interval_minutes = values.get("interval_minutes")
        if interval_minutes is None or int(interval_minutes) < 1:
            raise BadRequest("Interval schedule requires interval_minutes >= 1.")
    if schedule_type == AutoServiceScheduleType.CRON:
        cron_expression = values.get("cron_expression")
        if not cron_expression:
            raise BadRequest("Cron schedule requires cron_expression.")
        try:
            calculate_next_run_at(str(cron_expression), str(values.get("timezone") or DEFAULT_AUTO_SERVICE_TIMEZONE))
        except Exception as exc:
            raise BadRequest(f"Cron schedule is invalid: {exc}") from exc


def compute_next_run_at(service: AutoService, *, base_time: datetime) -> datetime | None:
    if service.status != AutoServiceStatus.ENABLED:
        return None
    if service.schedule_type == AutoServiceScheduleType.MANUAL:
        return None
    if service.schedule_type == AutoServiceScheduleType.INTERVAL:
        if service.interval_minutes is None:
            return None
        return base_time + timedelta(minutes=service.interval_minutes)
    if service.schedule_type == AutoServiceScheduleType.CRON and service.cron_expression:
        aware_base = base_time.replace(tzinfo=UTC) if base_time.tzinfo is None else base_time
        return calculate_next_run_at(service.cron_expression, service.timezone, aware_base).replace(tzinfo=None)
    return None


def execute_auto_service(service: AutoService) -> AutoServiceRunResult:
    if service.service_type == AutoServiceType.SKILL_CRAWLER_SYNC:
        return execute_skill_crawler_sync(service.config)
    if service.service_type == AutoServiceType.DATASET_QUEUE_MONITOR:
        return execute_dataset_queue_monitor(service.config)
    raise BadRequest(f"Unsupported auto service type: {service.service_type}.")


def execute_skill_crawler_sync(config: Mapping[str, Any] | None = None) -> AutoServiceRunResult:
    config = config or {}
    params = config.get("params") if isinstance(config.get("params"), Mapping) else {}
    base_url = normalize_optional_string(config.get("api_url") or config.get("base_url")) or normalize_optional_string(
        dify_config.SKILL_CRAWLER_API_URL
    )
    token = resolve_skill_crawler_sync_token(config) or normalize_optional_string(
        dify_config.SKILL_CRAWLER_API_TOKEN
    )
    if not base_url or not token:
        return {
            "status": AutoServiceRunStatus.SKIPPED,
            "result": {"skipped": True, "reason": "skill_crawler_sync_not_configured"},
        }

    to_date = parse_skill_crawler_sync_date(
        get_skill_crawler_sync_option(config, params, "to_date"), field_name="to_date"
    ) or datetime.now(UTC).date()
    from_date = parse_skill_crawler_sync_date(
        get_skill_crawler_sync_option(config, params, "from_date"), field_name="from_date"
    ) or to_date
    if from_date > to_date:
        raise BadRequest("Skill crawler sync config from_date must be earlier than or equal to to_date.")
    limit = parse_skill_crawler_sync_limit(get_skill_crawler_sync_option(config, params, "limit"))
    star = parse_skill_crawler_sync_star(get_skill_crawler_sync_option(config, params, "star"))
    try:
        result = SkillCrawlerSyncService.from_config(base_url=base_url, token=token).sync(
            session=db.session,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            star=star,
        )
    except SkillCrawlerSyncError:
        logger.exception("skill crawler auto service failed")
        raise

    result_payload = result.model_dump()
    return {
        "status": AutoServiceRunStatus.SUCCESS,
        "result": result_payload,
        "snapshot_path": result.snapshot_path,
    }


def get_skill_crawler_sync_option(config: Mapping[str, Any], params: Mapping[str, Any], key: str) -> object:
    if key in config:
        return config[key]
    return params.get(key)


def resolve_skill_crawler_sync_token(config: Mapping[str, Any]) -> str | None:
    token = normalize_optional_string(config.get("api_token") or config.get("token"))
    if token:
        return token
    headers = config.get("headers")
    if not isinstance(headers, Mapping):
        return None
    authorization = normalize_optional_string(headers.get("Authorization") or headers.get("authorization"))
    if not authorization:
        return None
    prefix = "bearer "
    if authorization.lower().startswith(prefix):
        return normalize_optional_string(authorization[len(prefix) :])
    return authorization


def parse_skill_crawler_sync_date(value: object, *, field_name: str) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    normalized = str(value).strip()
    if not normalized:
        return None
    try:
        return date.fromisoformat(normalized)
    except ValueError as exc:
        raise BadRequest(f"Skill crawler sync config {field_name} must be YYYY-MM-DD.") from exc


def parse_skill_crawler_sync_limit(value: object) -> int:
    if value is None or str(value).strip() == "":
        return DEFAULT_SKILL_CRAWLER_SYNC_LIMIT
    try:
        limit = int(value)
    except (TypeError, ValueError) as exc:
        raise BadRequest("Skill crawler sync config limit must be an integer.") from exc
    if limit < 1 or limit > MAX_SKILL_CRAWLER_SYNC_LIMIT:
        raise BadRequest(
            f"Skill crawler sync config limit must be between 1 and {MAX_SKILL_CRAWLER_SYNC_LIMIT}."
        )
    return limit


def parse_skill_crawler_sync_star(value: object) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        star = int(value)
    except (TypeError, ValueError) as exc:
        raise BadRequest("Skill crawler sync config star must be an integer.") from exc
    if star < 0:
        raise BadRequest("Skill crawler sync config star must be greater than or equal to 0.")
    return star


def execute_dataset_queue_monitor(config: Mapping[str, Any]) -> AutoServiceRunResult:
    threshold = dify_config.QUEUE_MONITOR_THRESHOLD
    if threshold is None:
        return {
            "status": AutoServiceRunStatus.SKIPPED,
            "result": {"skipped": True, "reason": "queue_monitor_threshold_not_configured"},
        }

    queue_name = str(config.get("queue_name") or "dataset")
    redis_config = parse_url(dify_config.CELERY_BROKER_URL)
    celery_redis = Redis(
        host=str(redis_config.get("hostname") or "localhost"),
        port=int(redis_config.get("port") or 6379),
        password=str(pwd) if (pwd := redis_config.get("password")) is not None else None,
        db=int(redis_config.get("virtual_host")) if redis_config.get("virtual_host") else 1,
        ssl=dify_config.BROKER_USE_SSL,
        ssl_ca_certs=dify_config.REDIS_SSL_CA_CERTS if dify_config.BROKER_USE_SSL else None,
        ssl_cert_reqs=getattr(dify_config, "REDIS_SSL_CERT_REQS", None) if dify_config.BROKER_USE_SSL else None,
        ssl_certfile=getattr(dify_config, "REDIS_SSL_CERTFILE", None) if dify_config.BROKER_USE_SSL else None,
        ssl_keyfile=getattr(dify_config, "REDIS_SSL_KEYFILE", None) if dify_config.BROKER_USE_SSL else None,
        socket_timeout=5,
        socket_connect_timeout=5,
        health_check_interval=30,
    )
    queue_length = celery_redis.llen(queue_name)
    exceeded = queue_length >= threshold
    if exceeded:
        logger.warning("Queue %s task count exceeded the limit: %s/%s", queue_name, queue_length, threshold)
    return {
        "status": AutoServiceRunStatus.SUCCESS,
        "result": {
            "queue_name": queue_name,
            "queue_length": int(queue_length),
            "threshold": threshold,
            "exceeded": exceeded,
        },
    }
