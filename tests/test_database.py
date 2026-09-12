"""Tests for core.database."""

from __future__ import annotations

import threading
from typing import Any

import pytest

from core.database import ACTIVE_STATUSES, DOWNLOAD_COLUMNS, Database


@pytest.fixture()
def db() -> Database:
    database = Database()  # default path lives inside isolated NOVA_DATA_DIR
    yield database
    database.close()


def sample(url: str = "https://example.com/v/1", **overrides: Any) -> dict[str, Any]:
    record = {
        "url": url,
        "title": "Sample Video",
        "uploader": "Sample Channel",
        "thumbnail_url": "https://img.example/x.jpg",
        "duration_s": 61.0,
        "quality": "1080p",
        "container": "mp4",
        "audio_language": "original",
        "subtitle_mode": "none",
        "total_bytes": 1_000_000,
    }
    record.update(overrides)
    return record


class TestSchema:
    def test_migrations_applied(self, db: Database) -> None:
        assert db.user_version >= 1

    def test_wal_mode(self, db: Database) -> None:
        assert db.journal_mode.lower() == "wal"

    def test_tables_exist(self, db: Database) -> None:
        with db._lock:
            names = {
                row[0]
                for row in db._conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
        assert {"downloads", "settings"} <= names


class TestInsertGetUpdate:
    def test_insert_returns_id_and_get_roundtrips(self, db: Database) -> None:
        task_id = db.insert_download(sample())
        assert isinstance(task_id, int) and task_id >= 1
        row = db.get_download(task_id)
        assert row is not None
        assert row["title"] == "Sample Video"
        assert row["status"] == "queued"  # default
        assert set(row) == set(DOWNLOAD_COLUMNS)

    def test_get_missing_returns_none(self, db: Database) -> None:
        assert db.get_download(99999) is None

    def test_insert_rejects_unknown_status(self, db: Database) -> None:
        with pytest.raises(ValueError):
            db.insert_download(sample(status="exploding"))

    def test_insert_ignores_non_writable_keys(self, db: Database) -> None:
        task_id = db.insert_download(sample(id=123, created_at="1999-01-01T00:00:00+00:00"))
        row = db.get_download(task_id)
        assert row is not None
        assert row["id"] == task_id
        assert row["created_at"] != "1999-01-01T00:00:00+00:00"

    def test_update_persists(self, db: Database) -> None:
        task_id = db.insert_download(sample())
        assert db.update_download(task_id, status="downloading", progress=0.5, downloaded_bytes=500_000)
        row = db.get_download(task_id)
        assert row is not None
        assert row["status"] == "downloading"
        assert row["progress"] == pytest.approx(0.5)

    def test_update_missing_row_returns_false(self, db: Database) -> None:
        assert not db.update_download(424242, status="paused")

    def test_update_rejects_unknown_column(self, db: Database) -> None:
        task_id = db.insert_download(sample())
        with pytest.raises(ValueError):
            db.update_download(task_id, nope=1)

    def test_update_rejects_unknown_status(self, db: Database) -> None:
        task_id = db.insert_download(sample())
        with pytest.raises(ValueError):
            db.update_download(task_id, status="gone")


class TestQuery:
    def test_status_filter_and_total(self, db: Database) -> None:
        db.insert_download(sample(url="https://a/1", status="queued"))
        db.insert_download(sample(url="https://b/1", status="queued"))
        db.insert_download(sample(url="https://c/1", status="completed"))
        rows, total = db.query_downloads(status="queued")
        assert total == 2 and len(rows) == 2

    def test_multi_status_filter(self, db: Database) -> None:
        db.insert_download(sample(url="https://a/1", status="queued"))
        db.insert_download(sample(url="https://b/1", status="failed"))
        db.insert_download(sample(url="https://c/1", status="completed"))
        _, total = db.query_downloads(statuses=("failed", "completed"))
        assert total == 2

    def test_search_matches_title_uploader_url(self, db: Database) -> None:
        db.insert_download(sample(url="https://a/1", title="Cat Video"))
        db.insert_download(sample(url="https://b/1", uploader="Dog Channel"))
        db.insert_download(sample(url="https://unique-host/1", title="Other"))
        _, total = db.query_downloads(search="cat")
        assert total == 1
        _, total = db.query_downloads(search="dog")
        assert total == 1
        _, total = db.query_downloads(search="unique-host")
        assert total == 1
        _, total = db.query_downloads(search="zzz-no-match")
        assert total == 0

    def test_pagination(self, db: Database) -> None:
        for i in range(5):
            db.insert_download(sample(url=f"https://x/{i}", title=f"Video {i}"))
        rows, total = db.query_downloads(limit=2, offset=2)
        assert total == 5 and len(rows) == 2

    def test_count_by_status(self, db: Database) -> None:
        db.insert_download(sample(url="https://a/1", status="queued"))
        db.insert_download(sample(url="https://b/1", status="queued"))
        db.insert_download(sample(url="https://c/1", status="completed"))
        assert db.count_by_status() == {"queued": 2, "completed": 1}

    def test_reset_active_to_queued(self, db: Database) -> None:
        db.insert_download(sample(url="https://a/1", status="downloading"))
        db.insert_download(sample(url="https://b/1", status="analyzing"))
        db.insert_download(sample(url="https://c/1", status="completed"))
        changed = db.reset_active_to_queued()
        assert changed == 2
        counts = db.count_by_status()
        assert counts["queued"] == 2 and counts["completed"] == 1

    def test_active_statuses_are_non_terminal(self) -> None:
        assert not set(ACTIVE_STATUSES) & {"completed", "failed", "cancelled", "queued", "paused"}

    def test_delete_history_only_terminal(self, db: Database) -> None:
        db.insert_download(sample(url="https://a/1", status="completed"))
        db.insert_download(sample(url="https://b/1", status="failed"))
        db.insert_download(sample(url="https://c/1", status="queued"))
        removed = db.delete_history()
        assert removed == 2
        assert set(db.count_by_status()) == {"queued"}


class TestThreadSafety:
    def test_concurrent_updates(self, db: Database) -> None:
        id_a = db.insert_download(sample(url="https://a/1"))
        id_b = db.insert_download(sample(url="https://b/1"))
        errors: list[Exception] = []

        def hammer(task_id: int) -> None:
            try:
                for i in range(50):
                    db.update_download(task_id, downloaded_bytes=i, progress=i / 50)
            except Exception as exc:  # pragma: no cover - failure signal only
                errors.append(exc)

        threads = [threading.Thread(target=hammer, args=(i,)) for i in (id_a, id_b)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors
        for task_id in (id_a, id_b):
            row = db.get_download(task_id)
            assert row is not None
            assert row["downloaded_bytes"] == 49


class TestSettings:
    def test_missing_key_returns_default(self, db: Database) -> None:
        assert db.get_setting("nope") is None
        assert db.get_setting("nope", 7) == 7

    def test_roundtrip_types(self, db: Database) -> None:
        db.set_setting("str", "hello")
        db.set_setting("int", 42)
        db.set_setting("float", 1.5)
        db.set_setting("bool", True)
        db.set_setting("dict", {"a": [1, 2]})
        assert db.get_setting("str") == "hello"
        assert db.get_setting("int") == 42
        assert db.get_setting("float") == 1.5
        assert db.get_setting("bool") is True
        assert db.get_setting("dict") == {"a": [1, 2]}

    def test_overwrite(self, db: Database) -> None:
        db.set_setting("k", 1)
        db.set_setting("k", 2)
        assert db.get_setting("k") == 2
