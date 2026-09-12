"""Filesystem layout for application data.

All writable per-user data lives under one directory so it is easy to
locate and clean up:

    %APPDATA%/novadownloader/            (Windows, per-user roaming)
    ~/.local/share/novadownloader/       (fallback / non-Windows dev)

The location can be overridden with the NOVA_DATA_DIR environment
variable, which is also how the test suite isolates itself from the
real user profile.
"""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

from .branding import APP_ID, APP_NAME


def is_frozen() -> bool:
    """True when running from a PyInstaller bundle."""
    return getattr(sys, "frozen", False)


@lru_cache(maxsize=1)
def app_root_dir() -> Path:
    """Directory of the installed application (repo root in development).

    Used to locate user-replaceable items such as ``ffmpeg/ffmpeg.exe``.
    """
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def resource_root() -> Path:
    """Read-only bundled resources (``qml/``, ``assets/``).

    Inside a PyInstaller bundle these live in ``sys._MEIPASS``; in
    development they sit in the repo root.
    """
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass)
    return app_root_dir()


@lru_cache(maxsize=1)
def app_data_dir() -> Path:
    """Writable per-user data directory (config, database, logs, cache)."""
    override = os.environ.get("NOVA_DATA_DIR")
    if override:
        path = Path(override)
    elif sys.platform == "win32":
        appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        path = Path(appdata) / APP_ID
    else:
        path = Path.home() / ".local" / "share" / APP_ID
    path.mkdir(parents=True, exist_ok=True)
    return path


def config_file() -> Path:
    return app_data_dir() / "config.json"


def database_file() -> Path:
    return app_data_dir() / "novadownloader.db"


def logs_dir() -> Path:
    path = app_data_dir() / "logs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def thumbnail_cache_dir() -> Path:
    path = app_data_dir() / "thumbnails"
    path.mkdir(parents=True, exist_ok=True)
    return path


def default_download_dir() -> Path:
    return Path.home() / "Downloads" / APP_NAME


def bundled_ffmpeg_path() -> Path:
    return app_root_dir() / "ffmpeg" / "ffmpeg.exe"


def qml_dir() -> Path:
    return resource_root() / "qml"


def assets_dir() -> Path:
    return resource_root() / "assets"


def reset_caches() -> None:
    """Forget cached directories (used by tests after changing NOVA_DATA_DIR)."""
    app_root_dir.cache_clear()
    app_data_dir.cache_clear()
