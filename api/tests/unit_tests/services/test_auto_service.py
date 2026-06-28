from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from werkzeug.exceptions import BadRequest

from controllers.admin.auto_services import AutoServiceResponse, _serialize_auto_service
from libs.helper import dump_response
from models.auto_service import AutoServiceRunStatus, AutoServiceScheduleType, AutoServiceStatus, AutoServiceType
from services import auto_service as auto_service_module


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
