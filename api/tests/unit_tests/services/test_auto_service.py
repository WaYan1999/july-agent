from __future__ import annotations

import importlib.util
import sys
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from werkzeug.exceptions import BadRequest

from controllers.admin.auto_services import AutoServiceResponse, _serialize_auto_service
from libs.helper import dump_response
from models.auto_service import AutoServiceRunStatus, AutoServiceScheduleType, AutoServiceStatus, AutoServiceType
from services import auto_service as auto_service_module


def _load_auto_service_tasks_module(monkeypatch: pytest.MonkeyPatch):
    class FakeCelery:
        @staticmethod
        def task(*args: object, **kwargs: object):
            def decorator(func):
                return func

            return decorator

    monkeypatch.setitem(sys.modules, "app", SimpleNamespace(celery=FakeCelery()))
    module_path = Path(__file__).resolve().parents[3] / "schedule" / "auto_service_tasks.py"
    spec = importlib.util.spec_from_file_location("_test_auto_service_tasks", module_path)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_execute_auto_service_passes_skill_crawler_config(monkeypatch: pytest.MonkeyPatch) -> None:
    config = {"api_token": "config-token", "from_date": "2026-06-20", "to_date": "2026-06-27", "limit": 50}
    execute_skill_crawler_sync = MagicMock(
        return_value={"status": AutoServiceRunStatus.SUCCESS, "result": {"fetched_count": 0}}
    )
    monkeypatch.setattr(auto_service_module, "execute_skill_crawler_sync", execute_skill_crawler_sync)
    service = SimpleNamespace(service_type=AutoServiceType.SKILL_CRAWLER_SYNC, config=config)

    result = auto_service_module.execute_auto_service(service)

    assert result["status"] == AutoServiceRunStatus.SUCCESS
    execute_skill_crawler_sync.assert_called_once_with(config)


def test_dispatch_service_reuses_existing_active_run(monkeypatch: pytest.MonkeyPatch) -> None:
    active_run = SimpleNamespace(id="run-log-id", status=AutoServiceRunStatus.QUEUED)
    session = SimpleNamespace(scalar=MagicMock(return_value=active_run))
    send_task = MagicMock()
    monkeypatch.setattr(auto_service_module.current_app, "send_task", send_task)

    result = auto_service_module.AutoServiceManager.dispatch_service(
        session,
        "service-id",
        trigger_type="manual",
    )

    assert result is active_run
    send_task.assert_not_called()


def test_dispatch_service_expires_stale_queued_run_before_enqueuing_new_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime(2026, 6, 28, 12, 0, 0)
    stale_run = SimpleNamespace(
        id="stale-run-id",
        status=AutoServiceRunStatus.QUEUED,
        started_at=None,
        finished_at=None,
        error=None,
        created_at=datetime(2026, 6, 27, 12, 0, 0),
    )
    new_run = SimpleNamespace(id="new-run-id", status=AutoServiceRunStatus.QUEUED, celery_task_id=None)
    session = SimpleNamespace(commit=MagicMock())

    monkeypatch.setattr(auto_service_module.AutoServiceManager, "get_active_run", MagicMock(return_value=stale_run))

    def create_run_log(*args: object, commit: bool = True, **kwargs: object) -> SimpleNamespace:
        assert stale_run.status == AutoServiceRunStatus.FAILED
        if commit:
            session.commit()
        return new_run

    monkeypatch.setattr(auto_service_module.AutoServiceManager, "create_run_log", create_run_log)
    monkeypatch.setattr(auto_service_module.current_app, "send_task", MagicMock(return_value=SimpleNamespace(id="task-id")))
    monkeypatch.setattr(auto_service_module, "naive_utc_now", MagicMock(return_value=now))

    result = auto_service_module.AutoServiceManager.dispatch_service(
        session,
        "service-id",
        trigger_type="manual",
    )

    assert result is new_run
    assert stale_run.status == AutoServiceRunStatus.FAILED
    assert stale_run.finished_at == now
    assert stale_run.error
    assert new_run.celery_task_id == "task-id"


def test_dispatch_service_commits_run_log_before_enqueuing(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[str] = []
    run_log = SimpleNamespace(id="run-log-id", celery_task_id=None)
    session = SimpleNamespace(commit=MagicMock(side_effect=lambda: events.append("commit")))

    monkeypatch.setattr(auto_service_module.AutoServiceManager, "get_active_run", MagicMock(return_value=None))

    def create_run_log(*args: object, commit: bool = True, **kwargs: object) -> SimpleNamespace:
        if commit:
            session.commit()
        return run_log

    def send_task(*args: object, **kwargs: object) -> SimpleNamespace:
        events.append("send_task")
        return SimpleNamespace(id="celery-task-id")

    monkeypatch.setattr(auto_service_module.AutoServiceManager, "create_run_log", create_run_log)
    monkeypatch.setattr(auto_service_module.current_app, "send_task", send_task)

    result = auto_service_module.AutoServiceManager.dispatch_service(
        session,
        "service-id",
        trigger_type="manual",
    )

    assert result is run_log
    assert run_log.celery_task_id == "celery-task-id"
    assert events[:2] == ["commit", "send_task"]


def test_dispatch_service_marks_run_failed_when_enqueue_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2026, 6, 28, 10, 0, 0)
    run_log = SimpleNamespace(
        id="run-log-id",
        status=AutoServiceRunStatus.QUEUED,
        celery_task_id=None,
        finished_at=None,
        error=None,
    )
    session = SimpleNamespace(add=MagicMock(), flush=MagicMock(), commit=MagicMock())

    monkeypatch.setattr(auto_service_module.AutoServiceManager, "get_active_run", MagicMock(return_value=None))

    def create_run_log(*args: object, commit: bool = True, **kwargs: object) -> SimpleNamespace:
        if commit:
            session.commit()
        return run_log

    monkeypatch.setattr(auto_service_module.AutoServiceManager, "create_run_log", create_run_log)
    monkeypatch.setattr(
        auto_service_module.current_app, "send_task", MagicMock(side_effect=RuntimeError("broker down"))
    )
    monkeypatch.setattr(auto_service_module, "naive_utc_now", MagicMock(return_value=now))

    with pytest.raises(RuntimeError, match="broker down"):
        auto_service_module.AutoServiceManager.dispatch_service(
            session,
            "service-id",
            trigger_type="manual",
        )

    assert run_log.status == AutoServiceRunStatus.FAILED
    assert run_log.finished_at == now
    assert run_log.error == "broker down"


def test_mark_run_started_ignores_non_queued_run() -> None:
    run_log = SimpleNamespace(
        id="run-log-id",
        auto_service_id="service-id",
        status=AutoServiceRunStatus.SKIPPED,
        started_at=None,
    )
    session = SimpleNamespace(get=MagicMock(return_value=run_log), commit=MagicMock())

    result = auto_service_module.AutoServiceManager.mark_run_started(session, "run-log-id")

    assert result is None
    assert run_log.status == AutoServiceRunStatus.SKIPPED
    assert run_log.started_at is None
    session.commit.assert_not_called()


def test_poll_auto_services_dispatches_due_services_through_manager(monkeypatch: pytest.MonkeyPatch) -> None:
    auto_service_tasks = _load_auto_service_tasks_module(monkeypatch)
    service = SimpleNamespace(id="service-id", next_run_at=datetime(2026, 6, 28, 9, 24, 3))
    session = SimpleNamespace(add=MagicMock(), flush=MagicMock(), commit=MagicMock())
    session_context = MagicMock()
    session_context.__enter__.return_value = session
    session_context.__exit__.return_value = None
    session_factory = MagicMock(return_value=session_context)
    dispatch_service = MagicMock(return_value=SimpleNamespace(id="run-log-id"))

    monkeypatch.setattr(auto_service_tasks, "db", SimpleNamespace(engine=object()))
    monkeypatch.setattr(auto_service_tasks, "sessionmaker", MagicMock(return_value=session_factory))
    monkeypatch.setattr(
        auto_service_tasks.AutoServiceManager,
        "fetch_due_services",
        MagicMock(return_value=[service]),
    )
    monkeypatch.setattr(
        auto_service_tasks.AutoServiceManager,
        "repair_missing_next_run_at_cursors",
        MagicMock(return_value=0),
    )
    monkeypatch.setattr(auto_service_tasks.AutoServiceManager, "has_active_run", MagicMock(return_value=False))
    monkeypatch.setattr(auto_service_tasks.AutoServiceManager, "dispatch_service", dispatch_service)

    auto_service_tasks.poll_auto_services()

    dispatch_service.assert_called_once_with(session, "service-id", trigger_type="scheduled")
    assert service.next_run_at == datetime(2026, 6, 28, 9, 24, 3)
    session.add.assert_not_called()
    session.flush.assert_not_called()


def test_run_auto_service_marks_run_failed_when_execution_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    auto_service_tasks = _load_auto_service_tasks_module(monkeypatch)
    run_log = SimpleNamespace(id="run-log-id")
    service = SimpleNamespace(id="service-id")
    session = SimpleNamespace()
    session_context = MagicMock()
    session_context.__enter__.return_value = session
    session_context.__exit__.return_value = None
    session_factory = MagicMock(return_value=session_context)
    mark_run_finished = MagicMock()

    monkeypatch.setattr(auto_service_tasks, "db", SimpleNamespace(engine=object()))
    monkeypatch.setattr(auto_service_tasks, "sessionmaker", MagicMock(return_value=session_factory))
    monkeypatch.setattr(
        auto_service_tasks.AutoServiceManager,
        "mark_run_started",
        MagicMock(return_value=(run_log, service)),
    )
    monkeypatch.setattr(auto_service_tasks, "execute_auto_service", MagicMock(side_effect=RuntimeError("sync failed")))
    monkeypatch.setattr(auto_service_tasks.AutoServiceManager, "mark_run_finished", mark_run_finished)

    auto_service_tasks.run_auto_service("run-log-id")

    mark_run_finished.assert_called_once()
    run_result = mark_run_finished.call_args.kwargs["run_result"]
    assert run_result["status"] == AutoServiceRunStatus.FAILED
    assert run_result["error"] == "sync failed"


def test_repair_missing_next_run_at_uses_last_run_time(monkeypatch: pytest.MonkeyPatch) -> None:
    service = SimpleNamespace(
        id="service-id",
        status=AutoServiceStatus.ENABLED,
        schedule_type=AutoServiceScheduleType.INTERVAL,
        interval_minutes=60,
        cron_expression=None,
        timezone="Asia/Shanghai",
        next_run_at=None,
        last_run_at=datetime(2026, 6, 28, 8, 24, 3),
        created_at=datetime(2026, 6, 28, 7, 24, 3),
    )
    session = SimpleNamespace(scalars=MagicMock(return_value=[service]), commit=MagicMock())
    monkeypatch.setattr(auto_service_module.AutoServiceManager, "has_active_run", MagicMock(return_value=False))

    repaired_count = auto_service_module.AutoServiceManager.repair_missing_next_run_at_cursors(
        session,
        limit=50,
        now=datetime(2026, 6, 28, 9, 30, 0),
    )

    assert repaired_count == 1
    assert service.next_run_at == datetime(2026, 6, 28, 9, 24, 3)
    session.commit.assert_called_once()


def test_execute_skill_crawler_sync_reads_config_dates_token_and_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    sync_result = SimpleNamespace(
        model_dump=MagicMock(return_value={"fetched_count": 1, "snapshot_path": None}),
        snapshot_path=None,
    )
    sync = MagicMock(return_value=sync_result)
    service = SimpleNamespace(sync=sync)
    from_config = MagicMock(return_value=service)
    monkeypatch.setattr(auto_service_module.SkillCrawlerSyncService, "from_config", from_config)
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_URL", "https://env.example.com")
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_TOKEN", "env-token")

    result = auto_service_module.execute_skill_crawler_sync(
        {
            "api_url": "https://config.example.com",
            "api_token": "config-token",
            "from_date": "2026-06-20",
            "to_date": "2026-06-27",
            "limit": 50,
            "star": 100,
        }
    )

    assert result["status"] == AutoServiceRunStatus.SUCCESS
    from_config.assert_called_once_with(base_url="https://config.example.com", token="config-token")
    sync.assert_called_once_with(
        session=auto_service_module.db.session,
        from_date=date(2026, 6, 20),
        to_date=date(2026, 6, 27),
        limit=50,
        star=100,
    )


def test_execute_skill_crawler_sync_reads_request_example_headers_and_params(monkeypatch: pytest.MonkeyPatch) -> None:
    sync_result = SimpleNamespace(
        model_dump=MagicMock(return_value={"fetched_count": 1, "snapshot_path": None}),
        snapshot_path=None,
    )
    sync = MagicMock(return_value=sync_result)
    from_config = MagicMock(return_value=SimpleNamespace(sync=sync))
    monkeypatch.setattr(auto_service_module.SkillCrawlerSyncService, "from_config", from_config)
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_URL", "https://env.example.com")
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_TOKEN", "env-token")

    auto_service_module.execute_skill_crawler_sync(
        {
            "headers": {"Authorization": "Bearer config-token"},
            "params": {"from_date": "2026-06-20", "to_date": "2026-06-27", "limit": 50, "star": 200},
        }
    )

    from_config.assert_called_once_with(base_url="https://env.example.com", token="config-token")
    sync.assert_called_once_with(
        session=auto_service_module.db.session,
        from_date=date(2026, 6, 20),
        to_date=date(2026, 6, 27),
        limit=50,
        star=200,
    )


def test_execute_skill_crawler_sync_defaults_to_today_and_limit_50(monkeypatch: pytest.MonkeyPatch) -> None:
    sync_result = SimpleNamespace(
        model_dump=MagicMock(return_value={"fetched_count": 0, "snapshot_path": None}),
        snapshot_path=None,
    )
    sync = MagicMock(return_value=sync_result)
    monkeypatch.setattr(
        auto_service_module.SkillCrawlerSyncService,
        "from_config",
        MagicMock(return_value=SimpleNamespace(sync=sync)),
    )
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_URL", "https://env.example.com")
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_TOKEN", "env-token")
    monkeypatch.setattr(
        auto_service_module,
        "datetime",
        SimpleNamespace(now=MagicMock(return_value=SimpleNamespace(date=MagicMock(return_value=date(2026, 6, 27))))),
    )

    auto_service_module.execute_skill_crawler_sync({})

    sync.assert_called_once_with(
        session=auto_service_module.db.session,
        from_date=date(2026, 6, 27),
        to_date=date(2026, 6, 27),
        limit=50,
        star=None,
    )


def test_execute_skill_crawler_sync_uses_token_alias_and_env_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    sync_result = SimpleNamespace(
        model_dump=MagicMock(return_value={"fetched_count": 0, "snapshot_path": None}),
        snapshot_path=None,
    )
    monkeypatch.setattr(
        auto_service_module.SkillCrawlerSyncService,
        "from_config",
        MagicMock(return_value=SimpleNamespace(sync=MagicMock(return_value=sync_result))),
    )
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_URL", "https://env.example.com")
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_TOKEN", "env-token")

    auto_service_module.execute_skill_crawler_sync({"token": "alias-token"})

    auto_service_module.SkillCrawlerSyncService.from_config.assert_called_once_with(
        base_url="https://env.example.com",
        token="alias-token",
    )


def test_execute_skill_crawler_sync_rejects_zero_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_URL", "https://env.example.com")
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_TOKEN", "env-token")

    with pytest.raises(BadRequest, match="limit must be between"):
        auto_service_module.execute_skill_crawler_sync({"limit": 0})


def test_execute_skill_crawler_sync_rejects_negative_star(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_URL", "https://env.example.com")
    monkeypatch.setattr(auto_service_module.dify_config, "SKILL_CRAWLER_API_TOKEN", "env-token")

    with pytest.raises(BadRequest, match="star must be greater"):
        auto_service_module.execute_skill_crawler_sync({"star": -1})


def test_normalize_auto_service_values_defaults_timezone_to_shanghai() -> None:
    values = auto_service_module.normalize_auto_service_values(
        {
            "code": "skill-crawler-sync",
            "name": "Skill 爬虫同步",
            "service_type": AutoServiceType.SKILL_CRAWLER_SYNC,
            "schedule_type": "interval",
            "interval_minutes": 60,
        },
        existing=None,
    )

    assert values["timezone"] == "Asia/Shanghai"


def test_auto_service_response_marks_naive_datetime_as_utc() -> None:
    service = SimpleNamespace(
        id="service-id",
        code="skill-crawler-sync",
        name="Skill crawler sync",
        description=None,
        service_type=AutoServiceType.SKILL_CRAWLER_SYNC,
        status=AutoServiceStatus.ENABLED,
        schedule_type=AutoServiceScheduleType.INTERVAL,
        interval_minutes=60,
        cron_expression=None,
        timezone="Asia/Shanghai",
        config={},
        last_run_at=None,
        last_run_status=None,
        next_run_at=datetime(2026, 6, 27, 6, 25, 40),
        created_at=datetime(2026, 6, 27, 5, 25, 40),
        updated_at=datetime(2026, 6, 27, 5, 25, 40),
        run_logs=[],
    )

    payload = dump_response(AutoServiceResponse, _serialize_auto_service(service))

    assert payload["next_run_at"] == "2026-06-27T06:25:40Z"


def test_interval_next_run_uses_current_base_time_not_created_at() -> None:
    service = SimpleNamespace(
        status=AutoServiceStatus.ENABLED,
        schedule_type=AutoServiceScheduleType.INTERVAL,
        interval_minutes=60,
        created_at=datetime(2026, 6, 20, 1, 0, 0),
    )

    next_run_at = auto_service_module.compute_next_run_at(service, base_time=datetime(2026, 6, 27, 5, 25, 40))

    assert next_run_at == datetime(2026, 6, 27, 6, 25, 40)


def test_update_service_recomputes_interval_next_run_from_current_time(monkeypatch: pytest.MonkeyPatch) -> None:
    service = SimpleNamespace(
        id="service-id",
        code="skill-crawler-sync",
        name="Skill crawler sync",
        description=None,
        service_type=AutoServiceType.SKILL_CRAWLER_SYNC,
        status=AutoServiceStatus.ENABLED,
        schedule_type=AutoServiceScheduleType.INTERVAL,
        interval_minutes=30,
        cron_expression=None,
        timezone="Asia/Shanghai",
        config={},
        created_at=datetime(2026, 6, 20, 1, 0, 0),
        next_run_at=None,
    )
    session = SimpleNamespace(get=MagicMock(return_value=service), commit=MagicMock())
    monkeypatch.setattr(
        auto_service_module,
        "naive_utc_now",
        MagicMock(return_value=datetime(2026, 6, 27, 5, 25, 40)),
    )

    auto_service_module.AutoServiceManager.update_service(
        session,
        "service-id",
        {"interval_minutes": 60},
    )

    assert service.next_run_at == datetime(2026, 6, 27, 6, 25, 40)
    session.commit.assert_called_once()
