"""定时从爬虫服务器同步 Skill 库数据。"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta

import app
from configs import dify_config
from extensions.ext_database import db
from services.skill_crawler_sync_service import SkillCrawlerSyncError, SkillCrawlerSyncService

logger = logging.getLogger(__name__)


def utcnow_date() -> date:
    return datetime.now(UTC).date()


@app.celery.task(queue="skill_crawler")
def sync_skills_from_crawler_task() -> dict[str, object]:
    if not dify_config.SKILL_CRAWLER_API_URL or not dify_config.SKILL_CRAWLER_API_TOKEN:
        logger.info("skill crawler sync skipped because endpoint or token is not configured")
        return {"skipped": True, "reason": "skill_crawler_sync_not_configured"}

    to_date = utcnow_date()
    from_date = to_date - timedelta(days=dify_config.SKILL_CRAWLER_SYNC_DAYS_BACK)
    try:
        result = SkillCrawlerSyncService.from_config().sync(
            session=db.session,
            from_date=from_date,
            to_date=to_date,
        )
    except SkillCrawlerSyncError:
        logger.exception("skill crawler sync failed")
        raise
    except Exception:
        logger.exception("unexpected skill crawler sync failure")
        raise
    return result.model_dump()
