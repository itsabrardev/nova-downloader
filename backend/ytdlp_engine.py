"""Embedding layer over the yt-dlp Python API.

yt-dlp runs in-process: analysis via ``extract_info``, downloads via
``download`` with progress hooks. Cancellation raises yt-dlp's own
``DownloadCancelled`` from the hook; pausing is cooperative (the hook
sleeps between chunks/fragments while the pause flag is set).
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import Any

import yt_dlp
from yt_dlp.utils import DownloadCancelled, DownloadError

from core.config import Config

_PROGRESS_KEYS = (
    "status",
    "filename",
    "downloaded_bytes",
    "total_bytes",
    "total_bytes_estimate",
    "speed",
    "eta",
    "fragment_index",
    "fragment_count",
)

#: (needle in lowercase message, error code, human message)
_FRIENDLY_PATTERNS: tuple[tuple[str, str, str], ...] = (
    ("private video", "UNAVAILABLE", "This video is private."),
    ("members-only", "UNAVAILABLE", "This video is members-only."),
    ("sign in", "UNAVAILABLE", "This video requires signing in."),
    ("confirm your age", "UNAVAILABLE", "This video is age-restricted and unavailable."),
    ("unsupported url", "UNSUPPORTED_URL", "This page doesn't expose a downloadable video."),
    ("no video formats", "UNSUPPORTED_URL", "No downloadable media was found on this page."),
    ("drm", "PROTECTED_CONTENT", "This content is protected and cannot be downloaded."),
    ("is not a valid url", "INVALID_URL", "The link is not a valid video URL."),
    ("http error 404", "UNSUPPORTED_URL", "The video was not found (404)."),
    ("http error 429", "NETWORK", "The site is rate-limiting requests; try again later."),
    ("http error 403", "NETWORK", "The server refused to serve this stream."),
    ("unable to download webpage", "NETWORK", "Could not reach the site (network problem)."),
    ("timed out", "NETWORK", "The connection timed out."),
    ("getaddrinfo failed", "NETWORK", "Could not resolve the site address."),
    ("connection", "NETWORK", "The connection was interrupted."),
)


class EngineError(Exception):
    """Download-engine failure with a user-readable message and a code."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "ENGINE_ERROR",
        original: Exception | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.original = original


def friendly_error(exc: Exception) -> tuple[str, str]:
    """Map a raw engine exception to ``(error_code, human_message)``."""
    text = str(exc).lower()
    for needle, code, message in _FRIENDLY_PATTERNS:
        if needle in text:
            return code, message
    cleaned = str(exc).replace("ERROR: ", "").strip()
    return "ENGINE_ERROR", cleaned[:300] or "The download engine reported an unknown error."


class TaskControl:
    """Thread-safe pause/cancel signals shared between manager and hooks."""

    def __init__(self) -> None:
        self._pause = threading.Event()
        self._cancel = threading.Event()

    def pause(self) -> None:
        self._pause.set()

    def resume(self) -> None:
        self._pause.clear()

    def cancel(self) -> None:
        self._cancel.set()

    @property
    def paused(self) -> bool:
        return self._pause.is_set()

    @property
    def cancelled(self) -> bool:
        return self._cancel.is_set()


def normalize_progress(payload: dict[str, Any]) -> dict[str, Any]:
    """Copy the hook fields we care about, with an effective total size."""
    out = {key: payload.get(key) for key in _PROGRESS_KEYS}
    out["total_bytes_effective"] = payload.get("total_bytes") or payload.get("total_bytes_estimate")
    return out


def build_hook(control: TaskControl, on_progress: Callable[[dict[str, Any]], None]) -> Callable[[dict[str, Any]], None]:
    """Wrap ``on_progress`` with pause-sleep and cancel-raise semantics."""

    def hook(payload: dict[str, Any]) -> None:
        if control.cancelled:
            raise DownloadCancelled()
        while control.paused and not control.cancelled:
            time.sleep(0.2)
        if control.cancelled:
            raise DownloadCancelled()
        on_progress(normalize_progress(payload))

    return hook


class YtDlpEngine:
    """Thin, cancellable wrapper around yt-dlp's Python API."""

    def __init__(self, config: Config | None = None) -> None:
        self._config = config or Config()

    def extract(self, url: str) -> dict[str, Any]:
        """Fetch raw media info without downloading (network required)."""
        opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "skip_download": True,
            "socket_timeout": 30,
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except DownloadError as exc:
            code, message = friendly_error(exc)
            raise EngineError(message, code=code, original=exc) from exc
        if not info:
            raise EngineError("The page returned no media information.", code="UNSUPPORTED_URL")
        return info

    def download(
        self,
        url: str,
        ydl_opts: dict[str, Any],
        *,
        on_progress: Callable[[dict[str, Any]], None],
        control: TaskControl,
    ) -> None:
        """Download *url*; raises EngineError or DownloadCancelled."""
        hook = build_hook(control, on_progress)
        opts = {**ydl_opts, "progress_hooks": [hook]}
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
        except DownloadCancelled:
            raise
        except DownloadError as exc:
            code, message = friendly_error(exc)
            raise EngineError(message, code=code, original=exc) from exc
