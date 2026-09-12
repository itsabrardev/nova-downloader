"""Downloads page data: task list model, aggregate speed, file actions."""

from __future__ import annotations

import logging
import os
import sys

from PySide6.QtCore import (
    Property,
    QAbstractListModel,
    QModelIndex,
    QObject,
    QProcess,
    Qt,
    QTimer,
    QUrl,
    Signal,
    Slot,
)
from PySide6.QtGui import QDesktopServices

from backend.download_manager import DownloadManager
from core.utils import format_bytes, format_eta, format_speed

logger = logging.getLogger("ui.downloads")

_ACTIVE = ("analyzing", "downloading", "processing")
_SPEED_HISTORY = 120  # samples × 500 ms = 60 s window


class DownloadListModel(QAbstractListModel):
    IdRole = Qt.UserRole + 1
    TitleRole = Qt.UserRole + 2
    StatusRole = Qt.UserRole + 3
    ProgressRole = Qt.UserRole + 4
    DetailRole = Qt.UserRole + 5
    SpeedRole = Qt.UserRole + 6
    EtaRole = Qt.UserRole + 7
    ErrorRole = Qt.UserRole + 8
    ThumbnailRole = Qt.UserRole + 9
    QualityRole = Qt.UserRole + 10
    FilePathRole = Qt.UserRole + 11
    HasFileRole = Qt.UserRole + 12
    CanPauseRole = Qt.UserRole + 13
    CanResumeRole = Qt.UserRole + 14
    CanCancelRole = Qt.UserRole + 15
    CanRetryRole = Qt.UserRole + 16

    _ROLES = {
        IdRole: b"id",
        TitleRole: b"title",
        StatusRole: b"status",
        ProgressRole: b"progress",
        DetailRole: b"detail",
        SpeedRole: b"speed",
        EtaRole: b"eta",
        ErrorRole: b"errorText",
        ThumbnailRole: b"thumbnail",
        QualityRole: b"qualityText",
        FilePathRole: b"filePath",
        HasFileRole: b"hasFile",
        CanPauseRole: b"canPause",
        CanResumeRole: b"canResume",
        CanCancelRole: b"canCancel",
        CanRetryRole: b"canRetry",
    }

    def __init__(self, manager: DownloadManager, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._manager = manager
        self._rows: list[dict] = []

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:  # noqa: B008 (Qt override)
        return 0 if parent.isValid() else len(self._rows)

    def data(self, index: QModelIndex, role: int = Qt.DisplayRole):
        if not index.isValid() or not (0 <= index.row() < len(self._rows)):
            return None
        row = self._rows[index.row()]
        key = self._ROLES.get(role)
        return row.get(key.decode()) if key else None

    def roleNames(self) -> dict:
        return dict(self._ROLES)

    def refresh(self) -> None:
        snapshots = self._manager.get_tasks(limit=300)
        active = [t for t in snapshots if t["status"] in _ACTIVE or t["status"] == "paused"]
        queued = [t for t in snapshots if t["status"] == "queued"]
        rest = [t for t in snapshots if t not in active and t not in queued]
        ordered = active + queued + rest
        self.beginResetModel()
        self._rows = [self._decorate(task) for task in ordered]
        self.endResetModel()

    @staticmethod
    def _decorate(task: dict) -> dict:
        status = task["status"]
        downloaded = format_bytes(task["downloaded_bytes"])
        total = format_bytes(task["total_bytes"]) if task["total_bytes"] else "—"
        subtitle = ""
        if task.get("subtitle_mode") and task["subtitle_mode"] != "none":
            subtitle = f" · subs {task.get('subtitle_lang', '')}"
        detail = (
            f"{task['quality']} · {task['container'].upper()} · {task['audio_language']}{subtitle}"
        )
        return {
            "id": task["id"],
            "title": task["title"],
            "status": status,
            "progress": task["progress"],
            "detail": detail,
            "speed": format_speed(task["speed"]) if status in _ACTIVE else "—",
            "eta": format_eta(task["eta"]) if status in _ACTIVE else "—",
            "errorText": task["error_message"] or "",
            "thumbnail": task["thumbnail"] or "",
            "qualityText": f"{downloaded} / {total}",
            "filePath": task["file_path"] or "",
            "hasFile": bool(task["file_path"]) and status == "completed",
            "canPause": status in ("downloading",),
            "canResume": status == "paused",
            "canCancel": status in ("queued", "analyzing", "downloading", "processing", "paused"),
            "canRetry": status in ("failed", "cancelled"),
        }


class DownloadsController(QObject):
    modelReset = Signal()
    statsChanged = Signal()
    managerEvent = Signal(str, int)  # marshals worker-thread events to the GUI thread
    notificationRequested = Signal(str, str)

    def __init__(self, manager: DownloadManager, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._manager = manager
        self.model = DownloadListModel(manager, self)
        self._active = 0
        self._queued = 0
        self._history: list[float] = []
        self._peak = 0.0
        self._downloaded_total = 0

        manager.add_listener(self._forward_event)
        self.managerEvent.connect(self._on_event)

        self._refresh_timer = QTimer(self)
        self._refresh_timer.setInterval(400)
        self._refresh_timer.timeout.connect(self._tick)
        self._refresh_timer.start()
        self._tick()

    def _forward_event(self, event: str, task_id: int) -> None:
        self.managerEvent.emit(event, task_id)  # queued connection → GUI thread

    def _on_event(self, _event: str, _task_id: int) -> None:
        # refresh is coalesced by the timer; events just keep it lively
        self._tick()

    def _tick(self) -> None:
        counts = self._manager.counts()
        self._active = sum(counts.get(s, 0) for s in _ACTIVE)
        self._queued = counts.get("queued", 0)
        snapshots = self._manager.get_tasks(statuses=list(_ACTIVE), limit=20)
        aggregate = sum(task["speed"] for task in snapshots)
        self._history.append(aggregate)
        if len(self._history) > _SPEED_HISTORY:
            del self._history[: len(self._history) - _SPEED_HISTORY]
        self._peak = max([*self._history, 0.0])
        self._downloaded_total = sum(task["downloaded_bytes"] for task in snapshots)
        self.model.refresh()
        self.statsChanged.emit()

    # -- QML properties -------------------------------------------------------
    @Property(int, notify=statsChanged)
    def activeCount(self) -> int:
        return self._active

    @Property(int, notify=statsChanged)
    def queuedCount(self) -> int:
        return self._queued

    @Property(str, notify=statsChanged)
    def currentSpeedText(self) -> str:
        return format_speed(self._history[-1] if self._history else 0.0)

    @Property(str, notify=statsChanged)
    def averageSpeedText(self) -> str:
        if not self._history or not any(v > 0 for v in self._history):
            return "—"
        positive = [v for v in self._history if v > 0]
        return format_speed(sum(positive) / len(positive))

    @Property(str, notify=statsChanged)
    def peakSpeedText(self) -> str:
        return format_speed(self._peak)

    @Property(str, notify=statsChanged)
    def downloadedNowText(self) -> str:
        return format_bytes(self._downloaded_total)

    @Property("QVariantList", notify=statsChanged)
    def speedHistory(self):
        return list(self._history)

    # -- QML actions ----------------------------------------------------------
    @Slot(int)
    def pause(self, task_id: int) -> None:
        self._manager.pause(task_id)

    @Slot(int)
    def resume(self, task_id: int) -> None:
        self._manager.resume(task_id)

    @Slot(int)
    def cancel(self, task_id: int) -> None:
        self._manager.cancel(task_id)

    @Slot(int)
    def retry(self, task_id: int) -> None:
        self._manager.retry(task_id)

    @Slot()
    def pauseAll(self) -> None:
        self._manager.pause_all()

    @Slot()
    def resumeAll(self) -> None:
        self._manager.resume_all()

    @Slot()
    def retryFailed(self) -> None:
        self._manager.retry_failed()

    @Slot(int)
    def openFile(self, task_id: int) -> None:
        task = self._manager.get_task(task_id)
        if not task or not task["file_path"]:
            self.notificationRequested.emit("No file yet", "This download has no finished file.")
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(task["file_path"]))

    @Slot(int)
    def openFolder(self, task_id: int) -> None:
        task = self._manager.get_task(task_id)
        if not task or not task["file_path"]:
            self.notificationRequested.emit("No folder yet", "This download has no finished file.")
            return
        if sys.platform == "win32":
            QProcess.startDetached("explorer", ["/select,", task["file_path"]])
        else:
            QDesktopServices.openUrl(QUrl.fromLocalFile(os.path.dirname(task["file_path"])))
