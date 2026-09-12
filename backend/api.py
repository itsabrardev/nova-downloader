"""Local HTTP API for the Chrome extension — localhost only.

Security model (docs/ARCHITECTURE.md §8):
- binds 127.0.0.1 only, never 0.0.0.0
- CORS restricted to chrome-extension:// origins (32-char ids)
- optional-but-default pairing token on every mutating endpoint
- pydantic-validated inputs; only enum-constrained choices are accepted
- output paths derive from the app's configured download folder only
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Any, Literal

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from core.branding import APP_NAME, APP_VERSION
from core.config import FLOAT_LIMITS, INT_LIMITS, LOG_LEVELS, Config
from core.database import TERMINAL_STATUSES
from core.paths import config_file
from core.utils import clamp, is_valid_url

from .analyzer import Analyzer
from .download_manager import DownloadManager
from .models import CONTAINERS, KNOWN_QUALITIES, DownloadRequest, SubtitleMode
from .ytdlp_engine import EngineError

logger = logging.getLogger("api")

_EXTENSION_ORIGIN = r"^chrome-extension://[a-p]{32}$"
_QUALITY_PATTERN = r"^(best|audio|[0-9]{3,4}p|1440p|8k|4k)$"


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _error_body(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message}}


class AnalyzeBody(BaseModel):
    url: str = Field(min_length=8, max_length=2048)

    @field_validator("url")
    @classmethod
    def _valid_url(cls, value: str) -> str:
        if not is_valid_url(value):
            raise ValueError("not a valid http(s) URL")
        return value.strip()


class DownloadBody(AnalyzeBody):
    quality: str = Field(default="best", pattern=_QUALITY_PATTERN)
    format: str = Field(default="mp4")
    audio_language: str = Field(default="original", max_length=35)
    subtitle_mode: Literal["none", "external", "embedded"] = "none"
    subtitle_lang: str | None = Field(default=None, max_length=35)

    @field_validator("format")
    @classmethod
    def _known_container(cls, value: str) -> str:
        if value not in CONTAINERS:
            raise ValueError(f"unsupported format {value!r}")
        return value

    @field_validator("quality")
    @classmethod
    def _known_quality(cls, value: str) -> str:
        if value not in KNOWN_QUALITIES and not value.endswith("p"):
            raise ValueError(f"unknown quality {value!r}")
        return value


class SettingsBody(BaseModel):
    """Partial config update; only whitelisted keys are accepted."""

    download_folder: str | None = None
    max_concurrent_downloads: int | None = None
    connections: int | None = None
    retries: int | None = None
    speed_limit_kbps: int | None = None
    api_port: int | None = None
    api_token_enabled: bool | None = None
    clipboard_monitor: bool | None = None
    minimize_to_tray: bool | None = None
    start_with_windows: bool | None = None
    notifications: bool | None = None
    animated_background: bool | None = None
    background_opacity: float | None = None
    blur_intensity: float | None = None
    animation_intensity: float | None = None
    ffmpeg_path: str | None = None
    log_level: str | None = None


def create_app(
    manager: DownloadManager,
    config: Config,
    analyzer: Analyzer | None = None,
    database: Any | None = None,
    static_dir: Path | str | None = None,
    assets_dir: Path | str | None = None,
) -> FastAPI:
    """App factory sharing the process-wide download manager."""
    app = FastAPI(title=f"{APP_NAME} local API", version=APP_VERSION, docs_url=None, redoc_url=None)

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=_EXTENSION_ORIGIN,
        allow_methods=["GET", "POST"],
        allow_headers=["content-type", "x-nova-token"],  # lowercase: browsers preflight lowercase
    )

    _analyzer = analyzer if analyzer is not None else manager._analyzer

    # -- auth ------------------------------------------------------------------
    def verify_token(request: Request) -> None:
        if not config.api_token_enabled:
            return
        supplied = request.headers.get("X-Nova-Token", "")
        if supplied != config.api_token:
            raise ApiError(401, "UNAUTHORIZED", "Pairing token missing or wrong.")

    # -- error handling ----------------------------------------------------------
    @app.exception_handler(ApiError)
    async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content=_error_body(exc.code, exc.message))

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=400, content=_error_body("INVALID_REQUEST", "Invalid request payload."))

    # -- endpoints -------------------------------------------------------------
    @app.get("/api/status")
    def status() -> dict[str, Any]:
        counts = manager.counts()
        return {
            "ok": True,
            "app": APP_NAME,
            "version": APP_VERSION,
            "queue": {
                "active": counts.get("downloading", 0) + counts.get("analyzing", 0) + counts.get("processing", 0),
                "queued": counts.get("queued", 0),
            },
            "token_required": config.api_token_enabled,
        }

    @app.post("/api/analyze")
    def analyze(body: AnalyzeBody, request: Request) -> dict[str, Any]:
        verify_token(request)
        try:
            media = _analyzer.analyze(body.url)
        except EngineError as exc:
            raise ApiError(502, exc.code, str(exc)) from exc
        manager.cache_media(body.url, media)
        return _media_payload(media)

    @app.post("/api/download", status_code=202)
    def download(body: DownloadBody, request: Request) -> dict[str, Any]:
        verify_token(request)
        try:
            dl_request = DownloadRequest(
                url=body.url,
                quality=body.quality,
                container=body.format,
                audio_language=body.audio_language,
                subtitle_mode=SubtitleMode(body.subtitle_mode),
                subtitle_lang=body.subtitle_lang if body.subtitle_mode != "none" else None,
            )
        except ValueError as exc:
            raise ApiError(400, "INVALID_REQUEST", str(exc)) from exc
        media = getattr(manager, "_media_cache", {}).get(body.url)
        task_id = manager.enqueue(dl_request, media=media)
        return {"id": task_id, "status": "queued"}

    @app.get("/api/downloads")
    def downloads(
        request: Request,
        status_filter: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        verify_token(request)
        limit = max(1, min(limit, 500))
        offset = max(0, offset)
        statuses = [status_filter] if status_filter else None
        tasks = manager.get_tasks(statuses=statuses, limit=limit + offset)
        return {"tasks": tasks[offset : offset + limit], "total": len(tasks)}

    @app.get("/api/download/{task_id}")
    def download_by_id(task_id: int, request: Request) -> dict[str, Any]:
        verify_token(request)
        task = manager.get_task(task_id)
        if task is None:
            raise ApiError(404, "NOT_FOUND", f"No download with id {task_id}.")
        return task

    def _action(task_id: int, request: Request, method_name: str, ok_message: str) -> dict[str, Any]:
        verify_token(request)
        method = getattr(manager, method_name)
        if not method(task_id):
            raise ApiError(409, "INVALID_STATE", f"Cannot {ok_message} download {task_id} in its current state.")
        return {"ok": True}

    @app.post("/api/download/{task_id}/pause")
    def pause_task(task_id: int, request: Request) -> dict[str, Any]:
        return _action(task_id, request, "pause", "pause")

    @app.post("/api/download/{task_id}/resume")
    def resume_task(task_id: int, request: Request) -> dict[str, Any]:
        return _action(task_id, request, "resume", "resume")

    @app.post("/api/download/{task_id}/cancel")
    def cancel_task(task_id: int, request: Request) -> dict[str, Any]:
        return _action(task_id, request, "cancel", "cancel")

    @app.post("/api/download/{task_id}/retry")
    def retry_task(task_id: int, request: Request) -> dict[str, Any]:
        return _action(task_id, request, "retry", "retry")

    @app.post("/api/downloads/pause_all")
    def pause_all(request: Request) -> dict[str, Any]:
        verify_token(request)
        return {"ok": True, "count": manager.pause_all()}

    @app.post("/api/downloads/resume_all")
    def resume_all(request: Request) -> dict[str, Any]:
        verify_token(request)
        return {"ok": True, "count": manager.resume_all()}

    # -- desktop UI: pairing ----------------------------------------------------
    # Unauthenticated on purpose: browsers block cross-origin reads via CORS,
    # so only same-origin UI code (or a local process, which could read the
    # config file anyway) can obtain the token.
    @app.get("/api/pairing")
    def pairing() -> dict[str, Any]:
        return {"token_required": config.api_token_enabled, "token": config.api_token}

    # -- desktop UI: settings -----------------------------------------------------
    @app.get("/api/settings")
    def get_settings(request: Request) -> dict[str, Any]:
        verify_token(request)
        return _settings_payload(config)

    @app.put("/api/settings")
    def put_settings(body: SettingsBody, request: Request) -> dict[str, Any]:
        verify_token(request)
        _apply_settings(config, body.model_dump(exclude_none=True))
        return _settings_payload(config)

    @app.post("/api/settings/reset")
    def reset_settings(request: Request) -> dict[str, Any]:
        verify_token(request)
        fresh = Config.defaults()
        keep = {"download_folder", "api_port", "api_token_enabled", "api_token"}
        for key, value in asdict(fresh).items():
            if key not in keep:
                setattr(config, key, value)
        config.save()
        return _settings_payload(config)

    # -- desktop UI: history -------------------------------------------------------
    db = database if database is not None else getattr(manager, "_db", None)

    @app.get("/api/history")
    def history(
        request: Request,
        search: str | None = None,
        statuses: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        verify_token(request)
        status_list = [s.strip() for s in (statuses or "").split(",") if s.strip()] or None
        try:
            rows, total = db.query_downloads(
                statuses=status_list,
                search=search,
                limit=int(clamp(limit, 1, 500)),
                offset=max(0, offset),
            )
        except ValueError as exc:
            raise ApiError(400, "INVALID_REQUEST", str(exc)) from exc
        return {"rows": rows, "total": total}

    @app.delete("/api/history")
    def clear_history(request: Request, statuses: str | None = None) -> dict[str, Any]:
        verify_token(request)
        status_list = [s.strip() for s in (statuses or "").split(",") if s.strip()]
        try:
            removed = db.delete_history(statuses=status_list or TERMINAL_STATUSES)
        except ValueError as exc:
            raise ApiError(400, "INVALID_REQUEST", str(exc)) from exc
        return {"ok": True, "removed": removed}

    @app.post("/api/history/{row_id}/open")
    def open_history_file(row_id: int, request: Request) -> dict[str, Any]:
        verify_token(request)
        row = db.get_download(row_id)
        path = (row or {}).get("file_path") or ""
        if not path:
            raise ApiError(404, "NOT_FOUND", "No file recorded for this entry.")
        _open_path(path)
        return {"ok": True}

    @app.post("/api/history/{row_id}/reveal")
    def reveal_history_file(row_id: int, request: Request) -> dict[str, Any]:
        verify_token(request)
        row = db.get_download(row_id)
        path = (row or {}).get("file_path") or ""
        if not path:
            raise ApiError(404, "NOT_FOUND", "No file recorded for this entry.")
        _reveal_path(path)
        return {"ok": True}

    @app.get("/api/background")
    def get_background():
        from fastapi.responses import FileResponse
        target_assets = Path(assets_dir) if assets_dir is not None else Path(__file__).resolve().parent.parent / "assets"
        bg_video = target_assets / "background.mp4"
        if bg_video.is_file():
            return FileResponse(str(bg_video), media_type="video/mp4")
        raise ApiError(404, "NOT_FOUND", "No background video available")

    # -- static UI (added last so /api routes always win) --------------------------
    if assets_dir is not None and Path(assets_dir).is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    if static_dir is not None and Path(static_dir).is_dir():
        app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="ui")

    return app


def _media_payload(media: Any) -> dict[str, Any]:
    return {
        "url": media.url,
        "title": media.title,
        "uploader": media.uploader,
        "thumbnail": media.thumbnail,
        "duration": media.duration,
        "is_live": media.is_live,
        "qualities": media.qualities,
        "formats": [
            {
                "id": f.format_id,
                "kind": f.kind.value,
                "ext": f.ext,
                "vcodec": f.vcodec,
                "acodec": f.acodec,
                "height": f.height,
                "fps": f.fps,
                "tbr": f.tbr,
                "filesize": f.filesize,
                "language": f.language,
            }
            for f in media.formats
        ],
        "audio_tracks": [
            {"language": t.language, "label": t.label} for t in media.audio_tracks
        ],
        "subtitles": [
            {"language": s.language, "name": s.name, "auto": s.auto_captions, "ext": s.ext}
            for s in media.subtitles
        ],
    }


def _settings_payload(config: Config) -> dict[str, Any]:
    data = asdict(config)
    data["config_path"] = str(config_file())
    return data


def _apply_settings(config: Config, updates: dict[str, Any]) -> None:
    """Coerce and write whitelisted keys onto the live config, then persist."""
    for key, value in updates.items():
        if key in INT_LIMITS:
            value = int(clamp(int(value), *INT_LIMITS[key]))
        elif key in FLOAT_LIMITS:
            value = round(float(clamp(float(value), *FLOAT_LIMITS[key])), 3)
        elif key == "log_level":
            value = value if value in LOG_LEVELS else "info"
        elif key in ("download_folder", "ffmpeg_path"):
            value = str(value).strip()
        setattr(config, key, value)
    config.save()


def _open_path(path: str) -> None:
    if sys.platform == "win32":
        os.startfile(path)  # noqa: S606 - platform API, path comes from our DB
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])


def _reveal_path(path: str) -> None:
    if sys.platform == "win32":
        subprocess.Popen(["explorer", "/select,", path])
    else:
        _open_path(str(Path(path).parent))


def start_api_server(manager: DownloadManager, config: Config, analyzer: Analyzer | None = None) -> threading.Thread:
    """Run the API in a daemon thread inside the desktop app process."""
    from core.paths import assets_dir as get_assets_dir
    app = create_app(manager, config, analyzer, assets_dir=get_assets_dir())
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=config.api_port, log_level="warning", log_config=None)
    )
    thread = threading.Thread(target=server.run, name="nova-api", daemon=True)
    thread.start()
    logger.info("local API listening on http://127.0.0.1:%s", config.api_port)
    return thread
