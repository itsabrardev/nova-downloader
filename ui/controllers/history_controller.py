"""History page data: DB-backed model with search, filters, actions."""

from __future__ import annotations

import logging
import os
import sys
from datetime import UTC, datetime

from PySide6.QtCore import (
    Property,
    QAbstractListModel,
    QModelIndex,
    QObject,
    QProcess,
    Qt,
    QUrl,
    Signal,
    Slot,
)
from PySide6.QtGui import QDesktopServices

from core.database import Database
from core.utils import format_bytes

logger = logging.getLogger("ui.history")

FILTERS = {
    "all": None,
    "completed": ("completed",),
    "failed": ("failed",),
    "cancelled": ("cancelled",),
}


def _format_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        stamp = datetime.fromisoformat(iso)
    except ValueError:
        return iso
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=UTC)
    return stamp.astimezone().strftime("%Y-%m-%d %H:%M")


class HistoryListModel(QAbstractListModel):
    IdRole = Qt.UserRole + 1
    TitleRole = Qt.UserRole + 2
    StatusRole = Qt.UserRole + 3
    UrlRole = Qt.UserRole + 4
    DateTextRole = Qt.UserRole + 5
    QualityRole = Qt.UserRole + 6
    DetailRole = Qt.UserRole + 7
    FilePathRole = Qt.UserRole + 8
    HasFileRole = Qt.UserRole + 9
    ThumbnailRole = Qt.UserRole + 10

    _ROLES = {
        IdRole: b"id",
        TitleRole: b"title",
        StatusRole: b"status",
        UrlRole: b"url",
        DateTextRole: b"dateText",
        QualityRole: b"qualityText",
        DetailRole: b"detail",
        FilePathRole: b"filePath",
        HasFileRole: b"hasFile",
        ThumbnailRole: b"thumbnail",
    }

    def __init__(self, database: Database, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._db = database
        self._rows: list[dict] = []

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:  # noqa: B008 (Qt override)
        return 0 if parent.isValid() else len(self._rows)

    def data(self, index: QModelIndex, role: int = Qt.DisplayRole):
        if not index.isValid() or not (0 <= index.row() < len(self._rows)):
            return None
        key = self._ROLES.get(role)
        return self._rows[index.row()].get(key.decode()) if key else None

    def roleNames(self) -> dict:
        return dict(self._ROLES)

    def reload(self, search: str = "", filter_key: str = "all") -> None:
        statuses = FILTERS.get(filter_key)
        rows, _total = self._db.query_downloads(
            statuses=statuses, search=search or None, limit=300
        )
        self.beginResetModel()
        self._rows = [self._decorate(row) for row in rows]
        self.endResetModel()

    @staticmethod
    def _decorate(row: dict) -> dict:
        langs = row.get("audio_language") or "original"
        detail = f"{row.get('quality') or '—'} · {(row.get('container') or '?').upper()} · {langs}"
        if row.get("subtitle_mode") and row["subtitle_mode"] != "none":
            detail += f" · subs {row.get('subtitle_lang', '')}"
        size = format_bytes(row.get("total_bytes")) if row.get("total_bytes") else ""
        return {
            "id": row["id"],
            "title": row.get("title") or row["url"],
            "status": row["status"],
            "url": row["url"],
            "dateText": _format_date(row.get("created_at")),
            "qualityText": size or "—",
            "detail": detail,
            "filePath": row.get("file_path") or "",
            "hasFile": bool(row.get("file_path")) and row["status"] == "completed",
            "thumbnail": row.get("thumbnail_url") or "",
        }


class HistoryController(QObject):
    countChanged = Signal()
    redownloadRequested = Signal(str)
    notificationRequested = Signal(str, str)

    def __init__(self, database: Database, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._db = database
        self.model = HistoryListModel(database, self)
        self._search = ""
        self._filter = "all"
        self.model.reload()

    @Property(int, notify=countChanged)
    def count(self) -> int:
        return self.model.rowCount()

    @Slot(str)
    def setSearch(self, search: str) -> None:
        self._search = search
        self.model.reload(self._search, self._filter)
        self.countChanged.emit()

    @Slot(str)
    def setFilter(self, filter_key: str) -> None:
        if filter_key in FILTERS:
            self._filter = filter_key
            self.model.reload(self._search, self._filter)
            self.countChanged.emit()

    @Slot()
    def refresh(self) -> None:
        self.model.reload(self._search, self._filter)
        self.countChanged.emit()

    @Slot()
    def clearHistory(self) -> None:
        removed = self._db.delete_history()
        self.refresh()
        self.notificationRequested.emit("History cleared", f"{removed} entr{'y' if removed == 1 else 'ies'} removed.")

    @Slot(int)
    def openFile(self, row_id: int) -> None:
        row = self._db.get_download(row_id)
        if not row or not row.get("file_path"):
            self.notificationRequested.emit("No file", "The file location is not recorded.")
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(row["file_path"]))

    @Slot(int)
    def openFolder(self, row_id: int) -> None:
        row = self._db.get_download(row_id)
        if not row or not row.get("file_path"):
            self.notificationRequested.emit("No folder", "The file location is not recorded.")
            return
        if sys.platform == "win32":
            QProcess.startDetached("explorer", ["/select,", row["file_path"]])
        else:
            QDesktopServices.openUrl(QUrl.fromLocalFile(os.path.dirname(row["file_path"])))

    @Slot(int)
    def redownload(self, row_id: int) -> None:
        row = self._db.get_download(row_id)
        if row:
            self.redownloadRequested.emit(row["url"])
