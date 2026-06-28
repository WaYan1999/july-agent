from __future__ import annotations

import re
from pathlib import Path


def test_start_worker_default_queues_include_auto_service_queue() -> None:
    script = Path(__file__).resolve().parents[4] / "dev" / "start-worker"
    content = script.read_text(encoding="utf-8")
    queue_assignments = [queues for queues in re.findall(r'QUEUES="([^"]+)"', content) if "," in queues]

    assert len(queue_assignments) >= 2
    assert all("auto_service" in queues.split(",") for queues in queue_assignments[:2])
