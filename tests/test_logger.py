"""Tests for core.logger."""

from __future__ import annotations

import logging
from pathlib import Path

from core import logger as logging_setup


def test_setup_creates_three_sinks(isolated_data_dir: Path) -> None:
    try:
        logging_setup._reset_for_tests()
        logging_setup.setup_logging("debug")
        for name in ("app.log", "downloader.log", "api.log"):
            assert (isolated_data_dir / "logs" / name).exists(), name
        assert logging.getLogger("downloader").propagate is False
        assert logging.getLogger("api").propagate is False
        assert logging.getLogger().level == logging.DEBUG

        logging.getLogger("downloader.test").info("hello downloader")
        logging.getLogger("api.test").info("hello api")
        for handler in logging.getLogger("downloader").handlers:
            handler.flush()
        content = (isolated_data_dir / "logs" / "downloader.log").read_text(encoding="utf-8")
        assert "hello downloader" in content
    finally:
        logging_setup._reset_for_tests()


def test_setup_is_idempotent(isolated_data_dir: Path) -> None:
    try:
        logging_setup._reset_for_tests()
        logging_setup.setup_logging("info")
        root_handlers = len(logging.getLogger().handlers)
        downloader_handlers = len(logging.getLogger("downloader").handlers)
        logging_setup.setup_logging("error")  # re-call only adjusts levels
        assert len(logging.getLogger().handlers) == root_handlers
        assert len(logging.getLogger("downloader").handlers) == downloader_handlers
        assert logging.getLogger().level == logging.ERROR
    finally:
        logging_setup._reset_for_tests()
