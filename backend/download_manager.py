"""Download queue manager: task lifecycle, scheduling, persistence.

One authoritative task store guarded by an RLock. The scheduler thread
admits queued tasks to a bounded worker pool (size = Settings value,
read live so changes apply without restart). Progress updates arrive on
worker threads via engine hooks; UI and API read snapshots under the
same lock.

Known v1 limitation (documented in docs/ARCHITECTURE.md): a paused
DOWNLOADING task keeps its worker slot (cooperative pause); queued
tasks behind it are not admitted until it resumes or is cancelled.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from yt_dlp.utils import DownloadCancelled

from core.config import Config
from core.database import Database
from core.utils import utc_now_iso

from .analyzer import Analyzer
from .ffmpeg import find_ffmpeg
from .format_manager import build_ydl_options
from .models import DownloadRequest, MediaInfo, SubtitleMode, TaskStatus
from .ytdlp_engine import EngineError, TaskControl, YtDlpEngine

logger = logging.getLogger("downloader.manager")

#: (event, task_id) — "created" | "status" | "progress" | "removed"
EventCallback = Callable[[str, int], None]

_MAX_WORKERS = 6  # thread pool ceiling; the live config gates admissions
_SPEED_WINDOW_S = 4.0
_DB_WRITE_INTERVAL_S = 1.0
_PART_SUFFIXES = (".part", ".ytdl", ".temp", ".f")  # .f*, .part etc.


@dataclass
class DownloadTask:
    """Runtime state of one download task (mutated under manager lock)."""

    id: int
    request: DownloadRequest
    priority: int
    status: TaskStatus = TaskStatus.QUEUED
    title: str = ""
    uploader: str | None = None
    thumbnail: str | None = None
    duration: float | None = None
    progress: float = 0.0
    downloaded_bytes: int = 0
    total_bytes: int | None = None
    speed: float = 0.0
    eta: float | None = None
    error_code: str = ""
    error_message: str = ""
    file_path: str = ""
    created_at: str = field(default_factory=utc_now_iso)
    started_at: str | None = None
    completed_at: str | None = None
    media: MediaInfo | None = None
    control: TaskControl = field(default_factory=TaskControl)
    _samples: deque = field(default_factory=lambda: deque(maxlen=120))
    _last_filename: str = ""
    _last_db_write: float = 0.0

    def snapshot(self) -> dict[str, Any]:
        request = self.request
        return {
            "id": self.id,
            "url": request.url,
            "title": self.title or request.url,
            "uploader": self.uploader,
            "thumbnail": self.thumbnail,
            "duration": self.duration,
            "status": self.status.value,
            "progress": round(self.progress, 4),
            "downloaded_bytes": self.downloaded_bytes,
            "total_bytes": self.total_bytes,
            "speed": round(self.speed, 1),
            "eta": self.eta,
            "quality": request.quality,
            "container": request.container,
            "audio_language": request.audio_language,
            "subtitle_mode": request.subtitle_mode.value,
            "subtitle_lang": request.subtitle_lang,
            "error_code": self.error_code,
            "error_message": self.error_message,
            "file_path": self.file_path,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "priority": self.priority,
        }


class DownloadManager:
    """Owns every download task; thread-safe, Qt-free."""

    def __init__(
        self,
        config: Config | None = None,
        database: Database | None = None,
        analyzer: Analyzer | None = None,
        engine_factory: Callable[[], Any] | None = None,
    ) -> None:
        self._config = config if config is not None else Config.load()
        self._db = database if database is not None else Database()
        self._analyzer = analyzer if analyzer is not None else Analyzer()
        self._engine_factory = engine_factory or (lambda: YtDlpEngine(self._config))

        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._tasks: dict[int, DownloadTask] = {}
        self._listeners: list[EventCallback] = []
        self._active: set[int] = set()
        self._priority_counter = 0
        self._media_cache: dict[str, MediaInfo] = {}
        self._running = True

        self._executor = ThreadPoolExecutor(max_workers=_MAX_WORKERS, thread_name_prefix="nova-dl")
        self._scheduler = threading.Thread(target=self._schedule_loop, name="nova-scheduler", daemon=True)
        self._scheduler.start()
        self._recover_tasks()

    # -- lifecycle ---------------------------------------------------------
    def close(self) -> None:
        with self._condition:
            self._running = False
            self._condition.notify_all()
        self._executor.shutdown(wait=False, cancel_futures=True)
        self._db.close()

    def add_listener(self, callback: EventCallback) -> None:
        with self._lock:
            self._listeners.append(callback)

    def _emit(self, event: str, task_id: int) -> None:
        with self._lock:
            listeners = list(self._listeners)
        for listener in listeners:
            try:
                listener(event, task_id)
            except Exception:  # pragma: no cover - listeners must not kill workers
                logger.exception("listener failed for %s/%s", event, task_id)

    # -- public API ----------------------------------------------------------
    def enqueue(self, request: DownloadRequest, media: MediaInfo | None = None) -> int:
        """Create a task and queue it; returns the task id."""
        with self._condition:
            self._priority_counter += 1
            task = DownloadTask(id=0, request=request, priority=self._priority_counter)
            if media is not None:
                self._apply_media(task, media)
            elif request.url in self._media_cache:
                self._apply_media(task, self._media_cache[request.url])
            task.id = self._db.insert_download(self._task_row(task))
            self._tasks[task.id] = task
            self._condition.notify_all()
        self._emit("created", task.id)
        return task.id

    def cache_media(self, url: str, media: MediaInfo) -> None:
        """Remember analysis results so enqueue can skip re-analysis."""
        with self._lock:
            self._media_cache[url] = media

    def get_task(self, task_id: int) -> dict[str, Any] | None:
        with self._lock:
            task = self._tasks.get(task_id)
            return task.snapshot() if task else None

    def get_tasks(self, statuses: list[str] | None = None, limit: int = 200) -> list[dict[str, Any]]:
        with self._lock:
            selected = [
                task for task in self._tasks.values()
                if statuses is None or task.status.value in statuses
            ]
            selected.sort(key=lambda task: task.priority)
            snapshots = [task.snapshot() for task in selected]
        return snapshots[:limit]

    def counts(self) -> dict[str, int]:
        with self._lock:
            counts: dict[str, int] = {}
            for task in self._tasks.values():
                counts[task.status.value] = counts.get(task.status.value, 0) + 1
            return counts

    # -- task actions ----------------------------------------------------------
    def pause(self, task_id: int) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None or task.status is not TaskStatus.DOWNLOADING:
                return False
            task.control.pause()
        self._set_status(task_id, TaskStatus.PAUSED)
        return True

    def resume(self, task_id: int) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None or task.status is not TaskStatus.PAUSED:
                return False
            task.control.resume()
        self._set_status(task_id, TaskStatus.DOWNLOADING)
        return True

    def cancel(self, task_id: int) -> bool:
        flipped_now = False
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            if task.status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED):
                return False
            task.control.cancel()
            if task.status is TaskStatus.QUEUED:
                self._transition(task, TaskStatus.CANCELLED)
                self._db.update_download(task_id, status="cancelled")
                self._condition.notify_all()
                flipped_now = True
        if flipped_now:
            self._emit("status", task_id)
        return True  # active tasks flip to CANCELLED when the hook raises

    def retry(self, task_id: int) -> bool:
        """Re-queue a FAILED or CANCELLED task.

        Paused tasks must be cancelled first — their worker is parked
        inside the old control object's pause loop and must exit before
        the task can safely re-enter the queue.
        """
        with self._condition:
            task = self._tasks.get(task_id)
            if task is None or task.status not in (TaskStatus.FAILED, TaskStatus.CANCELLED):
                return False
            task.error_code = ""
            task.error_message = ""
            task.progress = 0.0
            task.downloaded_bytes = 0
            task.speed = 0.0
            task.eta = None
            task.completed_at = None
            task.control = TaskControl()
            self._priority_counter += 1
            task.priority = self._priority_counter
            self._transition(task, TaskStatus.QUEUED)
            self._db.update_download(
                task.id, status="queued", progress=0.0, downloaded_bytes=0,
                error_code=None, error_message=None, completed_at=None,
            )
            self._condition.notify_all()
        self._emit("status", task_id)
        return True

    def pause_all(self) -> int:
        return sum(1 for tid in list(self._tasks) if self.pause(tid))

    def resume_all(self) -> int:
        return sum(1 for tid in list(self._tasks) if self.resume(tid))

    def cancel_all(self) -> int:
        return sum(1 for tid in list(self._tasks) if self.cancel(tid))

    def retry_failed(self) -> int:
        with self._lock:
            failed = [t.id for t in self._tasks.values() if t.status is TaskStatus.FAILED]
        return sum(1 for tid in failed if self.retry(tid))

    def reorder(self, task_ids: list[int]) -> bool:
        """Assign queue order to queued tasks (index 0 downloads first)."""
        with self._condition:
            for index, task_id in enumerate(task_ids):
                task = self._tasks.get(task_id)
                if task is not None and task.status is TaskStatus.QUEUED:
                    task.priority = index
            self._condition.notify_all()
        return True

    # -- scheduling ----------------------------------------------------------
    def _schedule_loop(self) -> None:
        while True:
            with self._condition:
                self._condition.wait_for(
                    lambda: not self._running
                    or (len(self._active) < self._config.max_concurrent_downloads and self._next_queued() is not None)
                )
                if not self._running:
                    return
                task = self._next_queued()
                if task is None:
                    continue
                self._active.add(task.id)
                if task.media is None:
                    self._transition(task, TaskStatus.ANALYZING)
                else:
                    self._transition(task, TaskStatus.DOWNLOADING)
                task_id = task.id
            self._emit("status", task_id)
            self._executor.submit(self._run_task, task_id)

    def _next_queued(self) -> DownloadTask | None:
        queued = [t for t in self._tasks.values() if t.status is TaskStatus.QUEUED]
        return min(queued, key=lambda t: t.priority) if queued else None

    # -- worker ---------------------------------------------------------------
    def _run_task(self, task_id: int) -> None:
        try:
            task = self._tasks.get(task_id)
            if task is None or task.status in (TaskStatus.CANCELLED,):
                return
            if task.media is None:
                media = self._analyzer.analyze(task.request.url)
                with self._lock:
                    self._apply_media(task, media)
                    self._db.update_download(
                        task_id, title=task.title, uploader=task.uploader,
                        thumbnail_url=task.thumbnail, duration_s=task.duration,
                    )
                    self._media_cache[task.request.url] = media
                self._set_status(task_id, TaskStatus.DOWNLOADING)

            started_at = time.monotonic()
            with self._lock:
                task.started_at = utc_now_iso()
                self._db.update_download(task_id, started_at=task.started_at)
            download_dir = Path(self._config.download_folder)
            download_dir.mkdir(parents=True, exist_ok=True)
            ffmpeg_path = find_ffmpeg(self._config)
            opts = build_ydl_options(
                task.request, task.media, config=self._config,
                ffmpeg_path=ffmpeg_path, download_dir=download_dir,
            )
            engine = self._engine_factory()
            engine.download(
                task.request.url, opts,
                on_progress=lambda payload: self._handle_progress(task_id, payload),
                control=task.control,
            )
            file_path = self._locate_output(download_dir, started_at)
            with self._lock:
                task.progress = 1.0
                task.speed = 0.0
                task.eta = None
                task.file_path = str(file_path) if file_path else task.file_path
                task.completed_at = utc_now_iso()
                self._db.update_download(
                    task_id, status="completed", progress=1.0, downloaded_bytes=task.downloaded_bytes,
                    total_bytes=task.total_bytes, file_path=task.file_path or None,
                    completed_at=task.completed_at, error_code=None, error_message=None,
                )
                task.status = TaskStatus.COMPLETED
            self._emit("status", task_id)
            logger.info("task %s completed: %s", task_id, task.file_path)
        except DownloadCancelled:
            with self._lock:
                self._finalize_interrupted(task_id, TaskStatus.CANCELLED, "", "")
            self._emit("status", task_id)
        except EngineError as exc:
            with self._lock:
                self._finalize_interrupted(task_id, TaskStatus.FAILED, exc.code, str(exc))
                logger.warning("task %s failed [%s]: %s", task_id, exc.code, exc)
            self._emit("status", task_id)
        except Exception as exc:  # unexpected — never kill the worker silently
            with self._lock:
                self._finalize_interrupted(task_id, TaskStatus.FAILED, "ENGINE_ERROR", str(exc))
            logger.exception("task %s crashed", task_id)
            self._emit("status", task_id)
        finally:
            with self._condition:
                self._active.discard(task_id)
                self._condition.notify_all()

    def _finalize_interrupted(self, task_id: int, status: TaskStatus, code: str, message: str) -> None:
        task = self._tasks.get(task_id)
        if task is None:
            return
        task.status = status
        task.error_code = code
        task.error_message = message
        task.speed = 0.0
        task.eta = None
        self._db.update_download(
            task_id, status=status.value, error_code=code or None,
            error_message=message or None, progress=round(task.progress, 4),
        )

    def _handle_progress(self, task_id: int, payload: dict[str, Any]) -> None:
        now = time.monotonic()
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            filename = payload.get("filename") or ""
            if filename and filename != task._last_filename:
                task._last_filename = filename
                task._samples.clear()  # new file (video → audio) resets the window
            downloaded = payload.get("downloaded_bytes") or 0
            total = payload.get("total_bytes_effective")
            if downloaded >= task.downloaded_bytes:
                task.downloaded_bytes = downloaded
            if total:
                task.total_bytes = total
            task._samples.append((now, downloaded))
            task.speed = _window_speed(task._samples, now)
            if payload.get("eta") is not None:
                task.eta = float(payload["eta"])
            elif task.speed > 1024 and task.total_bytes:
                task.eta = max(0.0, (task.total_bytes - task.downloaded_bytes) / task.speed)
            if task.total_bytes:
                task.progress = min(1.0, task.downloaded_bytes / task.total_bytes)
            if payload.get("status") == "finished":
                task.status = TaskStatus.PROCESSING
                self._db.update_download(task_id, status="processing")
            if now - task._last_db_write >= _DB_WRITE_INTERVAL_S:
                task._last_db_write = now
                self._db.update_download(
                    task_id, progress=round(task.progress, 4),
                    downloaded_bytes=task.downloaded_bytes, total_bytes=task.total_bytes,
                )
        self._emit("progress", task_id)

    def _set_status(self, task_id: int, status: TaskStatus) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            self._transition(task, status)
            self._db.update_download(task_id, status=status.value)
        self._emit("status", task_id)

    def _transition(self, task: DownloadTask, status: TaskStatus) -> None:
        task.status = status
        if status is TaskStatus.COMPLETED:
            task.completed_at = task.completed_at or utc_now_iso()

    def _apply_media(self, task: DownloadTask, media: MediaInfo) -> None:
        task.media = media
        task.title = media.title
        task.uploader = media.uploader
        task.thumbnail = media.thumbnail
        task.duration = media.duration

    def _locate_output(self, download_dir: Path, started_at: float) -> Path | None:
        """Newest finished media file in *download_dir* created during the task."""
        try:
            candidates = [
                path for path in download_dir.iterdir()
                if path.is_file()
                and not path.name.endswith(_PART_SUFFIXES)
                and path.stat().st_mtime >= started_at - 1.0
                and path.stat().st_size > 0
            ]
        except OSError:
            return None
        return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None

    def _task_row(self, task: DownloadTask) -> dict[str, Any]:
        request = task.request
        return {
            "url": request.url,
            "title": task.title or None,
            "uploader": task.uploader,
            "thumbnail_url": task.thumbnail,
            "duration_s": task.duration,
            "quality": request.quality,
            "container": request.container,
            "audio_language": request.audio_language,
            "subtitle_mode": request.subtitle_mode.value,
            "subtitle_lang": request.subtitle_lang,
            "status": task.status.value,
            "progress": task.progress,
            "downloaded_bytes": task.downloaded_bytes,
            "total_bytes": task.total_bytes,
            "file_path": task.file_path or None,
            "created_at": task.created_at,
        }

    def _recover_tasks(self) -> None:
        """Reload tasks from the database at startup.

        Non-terminal tasks re-enter the queue; the most recent
        terminal rows are hydrated too so history/retry work without a
        database round-trip.
        """
        self._db.reset_active_to_queued()
        rows, _total = self._db.query_downloads(
            statuses=("queued", "analyzing", "downloading", "processing", "paused"), limit=500
        )
        terminal_rows, _t = self._db.query_downloads(
            statuses=("completed", "failed", "cancelled"), limit=50
        )
        for row in [*rows, *terminal_rows]:
            request = DownloadRequest(
                url=row["url"],
                quality=row["quality"] or "best",
                container=row["container"] or "mp4",
                audio_language=row["audio_language"] or "original",
                subtitle_mode=SubtitleMode(row["subtitle_mode"] or "none"),
                subtitle_lang=row["subtitle_lang"],
            )
            row_status = row["status"]
            if row_status == "paused":
                row_status = "queued"  # no worker survives a restart; re-queue it
                self._db.update_download(row["id"], status="queued")
            with self._lock:
                self._priority_counter += 1
                task = DownloadTask(id=row["id"], request=request, priority=self._priority_counter)
                task.status = TaskStatus(row_status)
                task.title = row["title"] or ""
                task.uploader = row["uploader"]
                task.thumbnail = row["thumbnail_url"]
                task.duration = row["duration_s"]
                task.progress = row["progress"] or 0.0
                task.downloaded_bytes = row["downloaded_bytes"] or 0
                task.total_bytes = row["total_bytes"]
                task.file_path = row["file_path"] or ""
                task.created_at = row["created_at"]
                self._tasks[task.id] = task
        if rows:
            logger.info("recovered %d task(s) from database", len(rows))


def _window_speed(samples: deque, now: float) -> float:
    """Bytes/second over the trailing speed window; 0 when unknown."""
    older: tuple[float, int] | None = None
    for sample in samples:
        if sample[0] <= now - _SPEED_WINDOW_S:
            older = sample
        else:
            break
    if older is None:
        if len(samples) < 2:
            return 0.0
        older = samples[0]
    dt = now - older[0]
    if dt <= 0.2:
        return 0.0
    delta = samples[-1][1] - older[1]
    return max(0.0, delta / dt)
