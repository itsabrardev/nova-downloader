"""Tests for backend.download_manager — offline via a scriptable fake engine."""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any

import pytest
from yt_dlp.utils import DownloadCancelled

from backend.download_manager import DownloadManager
from backend.models import DownloadRequest, FormatInfo, FormatKind, MediaInfo
from backend.ytdlp_engine import EngineError, normalize_progress
from core.config import Config
from core.database import Database


def make_media(url: str = "https://x/1") -> MediaInfo:
    return MediaInfo(
        url=url,
        title="Fake Video",
        uploader="Fake Channel",
        duration=60.0,
        formats=(
            FormatInfo("v", FormatKind.VIDEO, "mp4", vcodec="h264", height=720),
            FormatInfo("a", FormatKind.AUDIO, "m4a", acodec="aac"),
        ),
    )


class FakeAnalyzer:
    def __init__(self, media: MediaInfo | None = None, error: Exception | None = None) -> None:
        self.media = media or make_media()
        self.error = error
        self.calls = 0

    def analyze(self, url: str) -> MediaInfo:
        self.calls += 1
        if self.error:
            raise self.error
        return self.media


class ScriptEngine:
    """Replays a payload script; mimics the real hook's normalize step."""

    def __init__(self, script: list[dict[str, Any]] | None = None, fail_with: Exception | None = None,
                 step_delay: float = 0.0) -> None:
        self.script = script or []
        self.fail_with = fail_with
        self.step_delay = step_delay
        self.download_calls: list[str] = []

    def download(self, url: str, ydl_opts: dict, *, on_progress, control) -> None:
        self.download_calls.append(url)
        for raw in self.script:
            if control.cancelled:
                raise DownloadCancelled()
            while control.paused and not control.cancelled:
                time.sleep(0.02)
            if control.cancelled:
                raise DownloadCancelled()
            on_progress(normalize_progress(raw))
            if self.step_delay:
                time.sleep(self.step_delay)
        if self.fail_with is not None:
            raise self.fail_with


def progress_script(total: int = 1000, steps: int = 8, filename: str = "video.mp4") -> list[dict[str, Any]]:
    payloads = []
    for i in range(1, steps + 1):
        payloads.append({
            "status": "downloading",
            "filename": filename,
            "downloaded_bytes": int(total * i / steps),
            "total_bytes": total,
            "speed": 200.0,
            "eta": max(0, 10 - i),
        })
    payloads.append({"status": "finished", "filename": filename,
                     "downloaded_bytes": total, "total_bytes": total})
    return payloads


def wait_for(predicate, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return False


@pytest.fixture()
def env(tmp_path: Path):
    download_dir = tmp_path / "downloads"
    download_dir.mkdir()
    config = Config(download_folder=str(download_dir), max_concurrent_downloads=2)
    return config, download_dir


def make_manager(config, analyzer=None, engine=None) -> DownloadManager:
    return DownloadManager(
        config=config, database=Database(),
        analyzer=analyzer or FakeAnalyzer(media=make_media()),
        engine_factory=lambda: engine if engine is not None else ScriptEngine(progress_script()),
    )


def status_of(manager: DownloadManager, task_id: int) -> str:
    task = manager.get_task(task_id)
    return task["status"] if task else ""


class TestLifecycle:
    def test_enqueue_to_completed(self, env) -> None:
        config, download_dir = env
        (download_dir / "video.mp4").write_bytes(b"x" * 10)
        manager = make_manager(config)
        task_id = manager.enqueue(DownloadRequest(url="https://x/1"))
        assert wait_for(lambda: status_of(manager, task_id) == "completed")
        task = manager.get_task(task_id)
        assert task["progress"] == 1.0
        assert task["title"] == "Fake Video"
        assert task["file_path"].endswith("video.mp4")
        manager.close()

    def test_media_from_pre_analysis_skips_analyzer(self, env) -> None:
        config, _ = env
        analyzer = FakeAnalyzer()
        manager = make_manager(config, analyzer=analyzer)
        manager.enqueue(DownloadRequest(url="https://x/1"), media=make_media())
        assert wait_for(lambda: status_of(manager, 1) == "completed")
        assert analyzer.calls == 0  # cached media used, no network analysis
        manager.close()

    def test_failure_maps_error(self, env) -> None:
        config, _ = env
        engine = ScriptEngine(fail_with=EngineError("The connection was interrupted.", code="NETWORK"))
        manager = make_manager(config, engine=engine)
        task_id = manager.enqueue(DownloadRequest(url="https://x/1"))
        assert wait_for(lambda: status_of(manager, task_id) == "failed")
        task = manager.get_task(task_id)
        assert task["error_code"] == "NETWORK"
        assert "interrupted" in task["error_message"]
        manager.close()

    def test_retry_after_failure_succeeds(self, env) -> None:
        config, _ = env
        attempts = {"n": 0}

        class FlakyEngine:
            def download(self, url, ydl_opts, *, on_progress, control) -> None:
                attempts["n"] += 1
                if attempts["n"] == 1:
                    raise EngineError("boom", code="ENGINE_ERROR")
                for raw in progress_script():
                    on_progress(normalize_progress(raw))

        manager = make_manager(config)
        manager._engine_factory = lambda: FlakyEngine()
        task_id = manager.enqueue(DownloadRequest(url="https://x/1"))
        assert wait_for(lambda: status_of(manager, task_id) == "failed")
        assert manager.retry(task_id) is True
        assert wait_for(lambda: status_of(manager, task_id) == "completed")
        assert attempts["n"] == 2
        manager.close()

    def test_cancel_queued_task_never_starts_engine(self, env) -> None:
        config, _ = env
        config.max_concurrent_downloads = 1
        release = threading.Event()

        class BlockingEngine:
            def download(self, url, ydl_opts, *, on_progress, control) -> None:
                release.wait(5)

        manager = make_manager(config)
        manager._engine_factory = lambda: BlockingEngine()
        first = manager.enqueue(DownloadRequest(url="https://x/1"))
        second = manager.enqueue(DownloadRequest(url="https://x/2"))
        assert wait_for(lambda: status_of(manager, first) == "downloading")
        assert status_of(manager, second) == "queued"
        assert manager.cancel(second) is True
        assert status_of(manager, second) == "cancelled"
        release.set()
        manager.close()

    def test_pause_resume_roundtrip(self, env) -> None:
        config, _ = env
        slow = ScriptEngine(
            [{"status": "downloading", "filename": "v.mp4", "downloaded_bytes": i * 10,
              "total_bytes": 10_000, "speed": 10.0, "eta": 3} for i in range(400)],
            step_delay=0.005,
        )
        manager = make_manager(config, engine=slow)
        task_id = manager.enqueue(DownloadRequest(url="https://x/1"))
        assert wait_for(lambda: status_of(manager, task_id) == "downloading")
        assert manager.pause(task_id) is True
        assert status_of(manager, task_id) == "paused"
        assert manager.resume(task_id) is True
        assert wait_for(lambda: status_of(manager, task_id) == "completed", timeout=10)
        manager.close()

    def test_cancel_paused_task(self, env) -> None:
        config, _ = env
        slow = ScriptEngine(
            [{"status": "downloading", "filename": "v.mp4", "downloaded_bytes": i,
              "total_bytes": 100_000, "speed": 10.0, "eta": 9} for i in range(500)],
            step_delay=0.005,
        )
        manager = make_manager(config, engine=slow)
        task_id = manager.enqueue(DownloadRequest(url="https://x/1"))
        assert wait_for(lambda: status_of(manager, task_id) == "downloading")
        manager.pause(task_id)
        manager.cancel(task_id)
        assert wait_for(lambda: status_of(manager, task_id) == "cancelled")
        manager.close()

    def test_pause_rejects_wrong_state(self, env) -> None:
        config, _ = env
        manager = make_manager(config)
        task_id = manager.enqueue(DownloadRequest(url="https://x/1"))
        assert wait_for(lambda: status_of(manager, task_id) == "completed")
        assert manager.pause(task_id) is False
        assert manager.retry(task_id) is False  # completed cannot retry
        manager.close()


class TestProgress:
    def test_progress_fields(self, env) -> None:
        config, _ = env
        events: list[str] = []
        manager = make_manager(config)
        manager.add_listener(lambda event, tid: events.append(event))
        manager.enqueue(DownloadRequest(url="https://x/1"))
        assert wait_for(lambda: status_of(manager, 1) == "completed")
        task = manager.get_task(1)
        assert task["downloaded_bytes"] == 1000
        assert task["total_bytes"] == 1000
        assert "progress" in events and "created" in events and "status" in events
        manager.close()

    def test_speed_computed_from_window(self) -> None:
        from collections import deque

        from backend.download_manager import _window_speed

        samples = deque([(0.0, 0), (1.0, 100), (2.0, 200), (3.0, 300)])
        assert _window_speed(samples, 3.5) == pytest.approx(100.0, rel=0.2)
        assert _window_speed(deque([(0.0, 0)]), 0.1) == 0.0


class TestConcurrencyAndRecovery:
    def test_concurrency_cap(self, env) -> None:
        config, _ = env
        config.max_concurrent_downloads = 1
        slow = ScriptEngine(
            [{"status": "downloading", "filename": "v.mp4", "downloaded_bytes": i,
              "total_bytes": 100_000, "speed": 5.0, "eta": 9} for i in range(500)],
            step_delay=0.005,
        )
        manager = make_manager(config, engine=slow)
        first = manager.enqueue(DownloadRequest(url="https://x/1"))
        second = manager.enqueue(DownloadRequest(url="https://x/2"))
        assert wait_for(lambda: status_of(manager, first) == "downloading")
        manager.pause(first)
        time.sleep(0.3)
        assert status_of(manager, second) == "queued"  # cap=1, paused task holds its slot
        manager.cancel(first)
        assert wait_for(lambda: status_of(manager, second) == "downloading")
        manager.cancel(second)
        manager.close()

    def test_persistence_recovery(self, env) -> None:
        config, _ = env
        config.max_concurrent_downloads = 1
        release = threading.Event()

        class BlockingEngine:
            def download(self, url, ydl_opts, *, on_progress, control) -> None:
                release.wait(5)

        manager = make_manager(config)
        manager._engine_factory = lambda: BlockingEngine()
        done = manager.enqueue(DownloadRequest(url="https://done/1"), media=make_media("https://done/1"))
        blocked = manager.enqueue(DownloadRequest(url="https://queued/1"), media=make_media("https://queued/1"))
        assert wait_for(lambda: status_of(manager, done) == "downloading")
        manager.cancel(blocked)
        release.set()
        assert wait_for(lambda: status_of(manager, done) == "completed")
        manager.close()

        # fresh manager over the same database recovers tasks and history
        manager2 = DownloadManager(config=config, analyzer=FakeAnalyzer(),
                                   engine_factory=lambda: ScriptEngine(progress_script()))
        tasks = {t["url"]: t for t in manager2.get_tasks()}
        assert tasks["https://done/1"]["status"] == "completed"  # hydrated from DB
        assert tasks["https://queued/1"]["status"] == "cancelled"
        assert manager2.retry(tasks["https://queued/1"]["id"]) is True
        assert wait_for(lambda: status_of(manager2, tasks["https://queued/1"]["id"]) == "completed")
        manager2.close()
