"""SQLite persistence: schema migrations and the downloads/settings DAO.

A single connection guarded by an RLock serves all threads (UI, API
server, download workers). WAL mode keeps reads cheap while tasks
write throttled progress updates.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from . import paths
from .utils import clamp, utc_now_iso

DOWNLOAD_STATUSES = (
    "queued",
    "analyzing",
    "downloading",
    "processing",
    "paused",
    "completed",
    "failed",
    "cancelled",
)
TERMINAL_STATUSES = ("completed", "failed", "cancelled")
ACTIVE_STATUSES = ("analyzing", "downloading", "processing")

DOWNLOAD_COLUMNS = (
    "id",
    "url",
    "title",
    "uploader",
    "thumbnail_url",
    "thumbnail_path",
    "duration_s",
    "quality",
    "container",
    "audio_language",
    "subtitle_mode",
    "subtitle_lang",
    "status",
    "progress",
    "total_bytes",
    "downloaded_bytes",
    "file_path",
    "error_code",
    "error_message",
    "created_at",
    "updated_at",
    "started_at",
    "completed_at",
)
_WRITABLE_COLUMNS = tuple(c for c in DOWNLOAD_COLUMNS if c not in ("id", "created_at"))

_ORDER_WHITELIST = (
    "created_at DESC",
    "created_at ASC",
    "updated_at DESC",
    "title ASC",
    "title DESC",
    "completed_at DESC",
)

#: Ordered DDL scripts; ``_MIGRATIONS[v - 1]`` upgrades the schema to
#: ``PRAGMA user_version == v``. Append only — never edit shipped entries.
_MIGRATIONS: tuple[str, ...] = (
    # v1 — initial schema (see docs/ARCHITECTURE.md §11)
    """
    CREATE TABLE IF NOT EXISTS downloads (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        url              TEXT    NOT NULL,
        title            TEXT,
        uploader         TEXT,
        thumbnail_url    TEXT,
        thumbnail_path   TEXT,
        duration_s       REAL,
        quality          TEXT,
        container        TEXT,
        audio_language   TEXT,
        subtitle_mode    TEXT,
        subtitle_lang    TEXT,
        status           TEXT    NOT NULL DEFAULT 'queued',
        progress         REAL    NOT NULL DEFAULT 0,
        total_bytes      INTEGER,
        downloaded_bytes INTEGER NOT NULL DEFAULT 0,
        file_path        TEXT,
        error_code       TEXT,
        error_message    TEXT,
        created_at       TEXT    NOT NULL,
        updated_at       TEXT    NOT NULL,
        started_at       TEXT,
        completed_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_status  ON downloads (status);
    CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads (created_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """,
)


def _check_status(value: Any) -> str:
    if value not in DOWNLOAD_STATUSES:
        raise ValueError(f"unknown download status: {value!r}")
    return value


class Database:
    """Thread-safe wrapper around the application's SQLite database."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        self._path = Path(db_path) if db_path is not None else paths.database_file()
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        self._migrate()

    # -- lifecycle --------------------------------------------------------
    def _migrate(self) -> None:
        with self._lock:
            current = self._conn.execute("PRAGMA user_version").fetchone()[0]
            for version, script in enumerate(_MIGRATIONS, start=1):
                if version > current:
                    self._conn.executescript(script)
                    self._conn.execute(f"PRAGMA user_version={version}")
            self._conn.commit()

    @property
    def user_version(self) -> int:
        with self._lock:
            return int(self._conn.execute("PRAGMA user_version").fetchone()[0])

    @property
    def journal_mode(self) -> str:
        with self._lock:
            return str(self._conn.execute("PRAGMA journal_mode").fetchone()[0])

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __enter__(self) -> Database:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    # -- downloads --------------------------------------------------------
    def insert_download(self, record: dict[str, Any]) -> int:
        """Insert a new download row and return the new task id.

        Keys must be writable columns (``id``/``created_at`` are
        ignored); ``status`` and timestamps receive defaults.
        """
        data = {k: v for k, v in record.items() if k in _WRITABLE_COLUMNS}
        if "status" in data:
            _check_status(data["status"])
        now = utc_now_iso()
        data.setdefault("status", "queued")
        data.setdefault("created_at", now)
        data.setdefault("updated_at", now)
        columns = ", ".join(data)
        placeholders = ", ".join("?" for _ in data)
        with self._lock:
            cursor = self._conn.execute(
                f"INSERT INTO downloads ({columns}) VALUES ({placeholders})",
                tuple(data.values()),
            )
            self._conn.commit()
            return int(cursor.lastrowid)

    def update_download(self, task_id: int, **fields: Any) -> bool:
        """Update writable columns of one row; False if the row doesn't exist."""
        unknown = set(fields) - set(_WRITABLE_COLUMNS)
        if unknown:
            raise ValueError(f"unknown column(s): {', '.join(sorted(unknown))}")
        if "status" in fields:
            _check_status(fields["status"])
        if not fields:
            return False
        fields["updated_at"] = utc_now_iso()
        assignments = ", ".join(f"{name}=?" for name in fields)
        with self._lock:
            cursor = self._conn.execute(
                f"UPDATE downloads SET {assignments} WHERE id=?",
                (*fields.values(), task_id),
            )
            self._conn.commit()
            return cursor.rowcount > 0

    def get_download(self, task_id: int) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM downloads WHERE id=?", (task_id,)).fetchone()
        return dict(row) if row else None

    def query_downloads(
        self,
        *,
        status: str | None = None,
        statuses: Iterable[str] | None = None,
        search: str | None = None,
        order: str = "created_at DESC",
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        """Paged download list with optional status filter and text search.

        Returns ``(rows, total_matching)``.
        """
        if status is not None:
            statuses = [_check_status(status)]
        params: list[Any] = []
        clauses: list[str] = []
        if statuses is not None:
            status_list = [_check_status(s) for s in statuses]
            clauses.append(f"status IN ({', '.join('?' for _ in status_list)})")
            params.extend(status_list)
        if search and search.strip():
            needle = f"%{search.strip()}%"
            clauses.append("(title LIKE ? OR uploader LIKE ? OR url LIKE ?)")
            params.extend([needle, needle, needle])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        if order not in _ORDER_WHITELIST:
            order = "created_at DESC"
        limit = int(clamp(limit, 1, 500))
        offset = max(0, int(offset))

        with self._lock:
            total = self._conn.execute(
                f"SELECT COUNT(*) FROM downloads {where}", params
            ).fetchone()[0]
            rows = self._conn.execute(
                f"SELECT * FROM downloads {where} ORDER BY {order} LIMIT ? OFFSET ?",
                (*params, limit, offset),
            ).fetchall()
        return [dict(row) for row in rows], int(total)

    def count_by_status(self) -> dict[str, int]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT status, COUNT(*) AS n FROM downloads GROUP BY status"
            ).fetchall()
        return {row["status"]: int(row["n"]) for row in rows}

    def reset_active_to_queued(self) -> int:
        """Startup recovery: interrupted tasks go back to the queue."""
        with self._lock:
            cursor = self._conn.execute(
                "UPDATE downloads SET status='queued', updated_at=? "
                f"WHERE status IN ({', '.join('?' for _ in ACTIVE_STATUSES)})",
                (utc_now_iso(), *ACTIVE_STATUSES),
            )
            self._conn.commit()
            return cursor.rowcount

    def delete_history(self, statuses: Iterable[str] = TERMINAL_STATUSES) -> int:
        """Delete terminal-status rows; returns the number removed."""
        status_list = [_check_status(s) for s in statuses]
        with self._lock:
            cursor = self._conn.execute(
                f"DELETE FROM downloads WHERE status IN ({', '.join('?' for _ in status_list)})",
                status_list,
            )
            self._conn.commit()
            return cursor.rowcount

    # -- settings -----------------------------------------------------------
    def get_setting(self, key: str, default: Any = None) -> Any:
        with self._lock:
            row = self._conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        if row is None:
            return default
        try:
            return json.loads(row["value"])
        except json.JSONDecodeError:
            return default

    def set_setting(self, key: str, value: Any) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, json.dumps(value)),
            )
            self._conn.commit()
