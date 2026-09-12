"""URL analysis + hand-off to the download queue (QML bridge)."""

from __future__ import annotations

import logging
import threading

from PySide6.QtCore import Property, QObject, Signal, Slot

from backend.analyzer import Analyzer
from backend.download_manager import DownloadManager
from backend.models import DownloadRequest, SubtitleMode
from backend.ytdlp_engine import EngineError
from core.config import Config
from core.utils import is_valid_url

logger = logging.getLogger("ui.analyze")


class AnalyzeController(QObject):
    busyChanged = Signal()
    mediaReady = Signal(dict)          # payload described in _media_payload
    analyzeFailed = Signal(str, str)   # (title, message)
    downloadStarted = Signal(int, str)  # (task_id, title)

    def __init__(self, config: Config, manager: DownloadManager,
                 analyzer: Analyzer | None = None, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._config = config
        self._manager = manager
        self._analyzer = analyzer if analyzer is not None else Analyzer()
        self._busy = False
        self._last_media: dict = {}

    @Property(bool, notify=busyChanged)
    def busy(self) -> bool:
        return self._busy

    @Slot(str)
    def analyze(self, url: str) -> None:
        url = (url or "").strip()
        if not is_valid_url(url):
            self.analyzeFailed.emit("Invalid URL", "Please paste a valid video link (http/https).")
            return
        if self._busy:
            return
        self._set_busy(True)
        threading.Thread(target=self._analyze_worker, args=(url,), daemon=True).start()

    @Slot(str, str, str, str, str, str)
    def startDownload(self, url: str, quality: str, container: str,
                      audio_language: str, subtitle_mode: str, subtitle_lang: str) -> None:
        url = (url or "").strip()
        if not is_valid_url(url):
            self.analyzeFailed.emit("Invalid URL", "Please analyze a valid video link first.")
            return
        try:
            request = DownloadRequest(
                url=url,
                quality=quality or "best",
                container=container or "mp4",
                audio_language=audio_language or "original",
                subtitle_mode=SubtitleMode(subtitle_mode or "none"),
                subtitle_lang=subtitle_lang if subtitle_mode not in ("", "none") else None,
            )
        except ValueError as exc:
            self.analyzeFailed.emit("Invalid selection", str(exc))
            return
        media = self._last_media.get("url") == url and self._last_media.get("_media_obj")
        task_id = self._manager.enqueue(request, media=media or None)
        title = (self._last_media.get("title") if media else "") or url
        self.downloadStarted.emit(task_id, title)

    # -- worker ---------------------------------------------------------------
    def _analyze_worker(self, url: str) -> None:
        try:
            media = self._analyzer.analyze(url)
            self._manager.cache_media(url, media)
            payload = _media_payload(media)
            self._last_media = {**payload, "_media_obj": media}
            self.mediaReady.emit(payload)
        except EngineError as exc:
            logger.info("analyze failed [%s]: %s", exc.code, exc)
            self.analyzeFailed.emit("Couldn't analyze this page", str(exc))
        except Exception as exc:  # noqa: BLE001 - surface anything to the UI
            logger.exception("analyze crashed")
            self.analyzeFailed.emit("Couldn't analyze this page", str(exc) or "Unexpected error.")
        finally:
            self._set_busy(False)

    def _set_busy(self, busy: bool) -> None:
        self._busy = busy
        self.busyChanged.emit()


def _media_payload(media) -> dict:
    from core.utils import format_duration

    return {
        "url": media.url,
        "title": media.title,
        "uploader": media.uploader or "",
        "thumbnail": media.thumbnail or "",
        "duration": media.duration,
        "durationText": format_duration(media.duration),
        "isLive": media.is_live,
        "qualities": media.qualities,
        "audioTracks": [{"language": t.language, "label": t.label} for t in media.audio_tracks],
        "subtitles": [
            {"language": s.language, "name": s.name, "auto": s.auto_captions}
            for s in media.subtitles
        ],
        "formatCount": len(media.formats),
    }
