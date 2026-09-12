"""Maps a DownloadRequest to concrete yt-dlp download options.

The selector strings always include fallbacks so a missing preferred
variant degrades gracefully instead of failing the whole download.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from core.config import Config

from .models import AUDIO_CONTAINERS, CONTAINERS, QUALITY_HEIGHTS, DownloadRequest, MediaInfo
from .subtitle_manager import subtitle_options


def _audio_atom(request: DownloadRequest) -> str:
    """Atomic audio expression for use *inside* a merge alternative.

    Must not contain ``/`` alternatives of its own: splicing a chain
    here would raise its fallbacks to the top level of the selector
    and let a low-quality combined format win over the any-extension
    merge. Language fallback happens at the whole-alternative level.
    """
    lang = request.audio_language
    if lang and lang != "original":
        return f"ba[language={lang}]"
    return "ba"


def build_format_selector(request: DownloadRequest, media: MediaInfo) -> str:
    """Compose the yt-dlp ``format:`` expression for *request*.

    Raises ValueError when the request names a quality or language the
    media does not actually offer — the UI never shows those, so this
    guards against stale or hand-crafted requests (e.g. via the API).
    """
    if request.quality not in media.qualities:
        raise ValueError(f"quality {request.quality!r} is not available for this media")
    if request.audio_language != "original" and not any(
        track.language == request.audio_language for track in media.audio_tracks
    ):
        raise ValueError(f"audio language {request.audio_language!r} is not available for this media")

    if request.container in AUDIO_CONTAINERS or request.quality == "audio":
        lang = request.audio_language
        lang_atom = f"[language={lang}]" if lang and lang != "original" else ""
        # Prefer audio in a codec family the target container can hold
        # without transcoding (mp4 → m4a, webm → opus/webm). mkv accepts
        # anything; mp3 is always transcoded by the extract postprocessor.
        ext_pref = {"mp4": "m4a", "webm": "webm"}.get(request.container)
        if ext_pref:
            return f"ba[ext={ext_pref}]{lang_atom}/ba{lang_atom}/b"
        if lang_atom:
            return f"ba{lang_atom}/ba/b"
        return "ba/b"

    cap = None if request.quality == "best" else QUALITY_HEIGHTS[request.quality]
    video = "bv*" if cap is None else f"bv*[height<={cap}]"
    combined_cap = "" if cap is None else f"[height<={cap}]"
    audio = _audio_atom(request)
    preferred_ext = {"mp4": "mp4", "webm": "webm"}.get(request.container)
    if preferred_ext:
        return f"{video}[ext={preferred_ext}]+{audio}/{video}+{audio}/b{combined_cap}"
    return f"{video}+{audio}/b{combined_cap}"


def build_ydl_options(
    request: DownloadRequest,
    media: MediaInfo,
    *,
    config: Config,
    ffmpeg_path: Path | None,
    download_dir: Path,
) -> dict[str, Any]:
    """Full yt-dlp option dict for one task (progress hooks added by the engine)."""
    audio_only = request.container in AUDIO_CONTAINERS or request.quality == "audio"
    opts: dict[str, Any] = {
        "format": build_format_selector(request, media),
        "outtmpl": str(download_dir / "%(title).100B.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "continuedl": True,
        "concurrent_fragment_downloads": config.connections,
        "retries": config.retries,
        "fragment_retries": config.retries,
        "socket_timeout": 30,
    }
    if ffmpeg_path is not None:
        opts["ffmpeg_location"] = str(ffmpeg_path)
    if not audio_only:
        opts["merge_output_format"] = request.container
    if config.speed_limit_kbps > 0:
        opts["ratelimit"] = config.speed_limit_kbps * 1024  # KB/s -> bytes/s

    postprocessors: list[dict[str, Any]] = []
    if audio_only and request.container == "mp3":
        postprocessors.append(
            {"key": "FFmpegExtractAudio", "codec": "mp3", "preferredquality": "0"}
        )
    sub_opts, sub_postprocessors = subtitle_options(request, media)
    opts.update(sub_opts)
    postprocessors.extend(sub_postprocessors)
    if postprocessors:
        opts["postprocessors"] = postprocessors
    return opts


def validate_container(container: str) -> str:
    if container not in CONTAINERS:
        raise ValueError(f"unsupported container: {container!r}")
    return container
