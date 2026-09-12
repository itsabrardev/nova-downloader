"""Structured, rotating file logging.

Three sinks, matching the layout in ``docs/ARCHITECTURE.md``::

    logs/app.log         application / UI / platform   (root logger)
    logs/downloader.log  engine + download manager     (logger "downloader")
    logs/api.log         local HTTP API                (logger "api")

Setup is idempotent: calling it again only adjusts levels.
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from . import paths

_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"
_MAX_BYTES = 5 * 1024 * 1024
_BACKUPS = 5

_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}

_configured = False
_console_handler: logging.StreamHandler | None = None


def _file_handler(log_file: Path, level: int) -> RotatingFileHandler:
    handler = RotatingFileHandler(
        log_file, maxBytes=_MAX_BYTES, backupCount=_BACKUPS, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATEFMT))
    handler.setLevel(level)
    return handler


def setup_logging(level: str = "info", *, console: bool = False) -> None:
    """Configure the three file sinks. Safe to call more than once.

    *level* is one of debug/info/warning/error (unknown values fall
    back to info). *console* mirrors the app log to stderr for
    development.
    """
    global _configured, _console_handler
    resolved = _LEVELS.get(str(level).lower(), logging.INFO)

    root = logging.getLogger()
    downloader = logging.getLogger("downloader")
    api = logging.getLogger("api")

    if not _configured:
        root.addHandler(_file_handler(paths.logs_dir() / "app.log", resolved))
        downloader.addHandler(_file_handler(paths.logs_dir() / "downloader.log", resolved))
        api.addHandler(_file_handler(paths.logs_dir() / "api.log", resolved))
        downloader.propagate = False
        api.propagate = False
        _configured = True

    root.setLevel(resolved)
    for log in (root, downloader, api):
        for handler in log.handlers:
            handler.setLevel(resolved)

    if console and _console_handler is None:
        _console_handler = logging.StreamHandler()
        _console_handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATEFMT))
        _console_handler.setLevel(resolved)
        root.addHandler(_console_handler)
    elif _console_handler is not None:
        _console_handler.setLevel(resolved)

    # keep third-party noise out of our files
    for noisy in ("urllib3", "asyncio", "PIL"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Convenience accessor used across the project."""
    return logging.getLogger(name)


def _reset_for_tests() -> None:
    """Detach and close all handlers so a new isolated dir can be used."""
    global _configured, _console_handler
    for name in ("", "downloader", "api"):
        log = logging.getLogger(name)
        for handler in list(log.handlers):
            handler.close()
            log.removeHandler(handler)
    _configured = False
    _console_handler = None
