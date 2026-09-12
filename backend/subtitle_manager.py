"""Subtitle decisioning: which subtitle files to fetch and whether to embed.

Embedding support follows container reality (yt-dlp maps mp4 to mov_text,
mkv to a native track, webm to WebVTT); audio-only files cannot hold
subtitles at all.
"""

from __future__ import annotations

from typing import Any

from .models import AUDIO_CONTAINERS, DownloadRequest, MediaInfo, SubtitleMode

EMBED_SUPPORTED_CONTAINERS = ("mp4", "mkv", "webm")


def can_embed(container: str) -> bool:
    return container in EMBED_SUPPORTED_CONTAINERS


def subtitle_options(request: DownloadRequest, media: MediaInfo) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Return ``(ydl_opts_fragment, postprocessors)`` for the subtitle choice."""
    if request.subtitle_mode is SubtitleMode.NONE:
        return {}, []
    if request.container in AUDIO_CONTAINERS:
        return {}, []

    lang = request.subtitle_lang or ""
    manual = any(s.language == lang and not s.auto_captions for s in media.subtitles)
    auto = any(s.language == lang and s.auto_captions for s in media.subtitles)
    if not manual and not auto:
        raise ValueError(f"subtitle language {lang!r} is not available for this media")

    opts: dict[str, Any] = {"subtitleslangs": [lang]}
    if manual:
        opts["writesubtitles"] = True
    if auto:
        opts["writeautomaticsub"] = True

    if request.subtitle_mode is SubtitleMode.EMBEDDED and can_embed(request.container):
        return opts, [{"key": "FFmpegEmbedSubtitle"}]
    return opts, []
