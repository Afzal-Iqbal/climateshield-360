from __future__ import annotations

from pathlib import Path
from urllib.error import URLError

import pandas as pd
import pytest

from climateshield.config import INGEST_INTERVAL_SECONDS, RAW_HOURLY_DIR
from climateshield.ingest.http import RateLimiter, clear_robots_cache, fetch_url, robots_allows
from climateshield.ingest.run import _append_unique
from climateshield.ingest.schedule import run_hourly_loop, windows_task_command, write_windows_task_script
from climateshield.io_utils import write_raw_hourly_bytes


def test_scheduler_interval_is_hourly() -> None:
    assert INGEST_INTERVAL_SECONDS == 3600
    command = windows_task_command("python")
    assert "/SC HOURLY" in command
    assert "ingest-hourly --once" in command


def test_hourly_loop_once_and_repeat(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0, "slept": []}

    def fake_ingest():
        calls["n"] += 1
        return {"cycle": calls["n"]}

    def fake_sleep(seconds):
        calls["slept"].append(seconds)

    once = run_hourly_loop(once=True, ingest_fn=fake_ingest, sleep_fn=fake_sleep)
    assert once == [{"cycle": 1}]
    assert calls["slept"] == []

    calls["n"] = 0
    repeated = run_hourly_loop(cycles=2, interval_seconds=3600, ingest_fn=fake_ingest, sleep_fn=fake_sleep)
    assert [row["cycle"] for row in repeated] == [1, 2]
    assert calls["slept"] == [3600]


def test_duplicate_keys_are_skipped() -> None:
    existing = pd.DataFrame({"row_id": ["Lahore|2026-10-19T00:00:00Z"], "precipitation_mm": [1.2]})
    incoming = pd.DataFrame(
        {
            "row_id": ["Lahore|2026-10-19T00:00:00Z", "Lahore|2026-10-19T01:00:00Z"],
            "precipitation_mm": [9.9, 0.4],
        }
    )
    combined, n_new, n_dup = _append_unique(existing, incoming, "row_id")
    assert n_new == 1
    assert n_dup == 1
    assert list(combined["row_id"]) == ["Lahore|2026-10-19T00:00:00Z", "Lahore|2026-10-19T01:00:00Z"]
    assert combined.loc[combined["row_id"] == "Lahore|2026-10-19T00:00:00Z", "precipitation_mm"].iloc[0] == 1.2


def test_hourly_raw_write_allowed_collected_blocked(tmp_path: Path) -> None:
    target = RAW_HOURLY_DIR / "pytest" / "sample.json"
    write_raw_hourly_bytes(target, b'{"ok": true}')
    assert target.exists()
    target.unlink()
    target.parent.rmdir()
    with pytest.raises(PermissionError):
        write_raw_hourly_bytes(Path("data/raw/collected_datasets/nope.json"), b"x")


def test_fetch_retries_on_server_error(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts = {"n": 0}

    class FakeResponse:
        def __init__(self):
            self.headers = {"ETag": "abc"}
            self.status = 200

        def read(self):
            return b'{"hourly": {"time": []}}'

        def geturl(self):
            return "https://api.open-meteo.com/v1/forecast"

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout=30):
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise URLError("temporary failure")
        return FakeResponse()

    monkeypatch.setattr("climateshield.ingest.http.urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr("climateshield.ingest.http.time.sleep", lambda seconds: None)
    limiter = RateLimiter(min_interval_seconds=0)
    response = fetch_url("https://api.open-meteo.com/v1/forecast", retries=3, limiter=limiter)
    assert response.status == 200
    assert attempts["n"] == 3


def test_robots_block(monkeypatch: pytest.MonkeyPatch) -> None:
    clear_robots_cache()

    class FakeResponse:
        headers = {}
        status = 200

        def read(self):
            return b"User-agent: *\nDisallow: /\n"

        def geturl(self):
            return "https://example.invalid/robots.txt"

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(
        "climateshield.ingest.http.urllib.request.urlopen",
        lambda request, timeout=30: FakeResponse(),
    )
    allowed, note = robots_allows("https://example.invalid/secret", limiter=RateLimiter(0))
    assert allowed is False
    assert "disallows /" in note
    clear_robots_cache()


def test_windows_task_script_written() -> None:
    path = write_windows_task_script()
    text = Path(path).read_text(encoding="utf-8")
    assert "ClimateShield360HourlyIngest" in text
    assert "ingest-hourly --once" in text
