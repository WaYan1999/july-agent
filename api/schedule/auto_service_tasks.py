"""后台自动服务调度与执行任务。"""

from __future__ import annotations

import logging

from sqlalchemy.orm import sessionmaker

import app
from configs import dify_config
from extensions.ext_database import db
from models.auto_service import AutoServiceRunStatus
from services.auto_service import AutoServiceManager, execute_auto_service

logger = logging.getLogger(__name__)


@app.celery.task(name="schedule.auto_service_tasks.poll_auto_services", queue="auto_service")
def poll_auto_services() -> None:
    session_factory = sessionmaker(bind=db.engine, expire_on_commit=False)
    with session_factory() as session:
        AutoServiceManager.repair_missing_next_run_at_cursors(
            session,
            limit=dify_config.AUTO_SERVICE_POLLER_BATCH_SIZE,
        )
        due_services = AutoServiceManager.fetch_due_services(
            session,
            limit=dify_config.AUTO_SERVICE_POLLER_BATCH_SIZE,
        )
        dispatched_count = 0
        for service in due_services:
            if AutoServiceManager.has_active_run(session, service.id):
                continue
            try:
                AutoServiceManager.dispatch_service(session, service.id, trigger_type="scheduled")
            except Exception:
                logger.exception("Failed to dispatch due auto service %s", service.id)
                continue
            dispatched_count += 1

    if dispatched_count > 0:
        logger.info("Dispatched %d auto service run(s)", dispatched_count)


@app.celery.task(name="schedule.auto_service_tasks.run_auto_service", queue="auto_service")
def run_auto_service(run_log_id: str) -> None:
    session_factory = sessionmaker(bind=db.engine, expire_on_commit=False)
    with session_factory() as session:
        started_run = AutoServiceManager.mark_run_started(session, run_log_id)
        if started_run is None:
            return
        run_log, service = started_run
        try:
            run_result = execute_auto_service(service)
        except Exception as exc:
            logger.exception("Auto service %s failed", service.id)
            run_result = {
                "status": AutoServiceRunStatus.FAILED,
                "error": str(exc),
                "snapshot_path": getattr(exc, "snapshot_path", None),
            }
        AutoServiceManager.mark_run_finished(
            session,
            run_log=run_log,
            service=service,
            run_result=run_result,
        )
