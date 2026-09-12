"""Normalization of raw yt-dlp info into MediaInfo.

Only real metadata becomes selectable options: qualities come from
actual format heights, audio languages from actual per-format language
fields, subtitles from the info dict. Nothing is invented.
"""

from __future__ import annotations

from typing import Any

from .models import (
    AudioTrack,
    FormatInfo,
    FormatKind,
    MediaInfo,
    SubtitleTrack,
    language_label,
)
from .ytdlp_engine import YtDlpEngine

_CODEC_NONE = (None, "none", "unknown")


class Analyzer:
    def __init__(self, engine: YtDlpEngine | None = None) -> None:
        self._engine = engine or YtDlpEngine()

    def analyze(self, url: str) -> MediaInfo:
        """Extract and normalize media information (network required)."""
        info = self._engine.extract(url)
        return self.normalize(url, info)

    @staticmethod
    def normalize(url: str, info: dict[str, Any]) -> MediaInfo:
        raw_formats = info.get("formats") or []
        if raw_formats:
            formats = tuple(Analyzer._formats(raw_formats))
        elif info.get("url") or info.get("ext"):
            # Direct media URLs: the generic extractor exposes no format
            # list, just one playable file in the top-level fields.
            formats = (Analyzer._direct_format(info),)
        else:
            formats = ()
        return MediaInfo(
            url=url,
            title=info.get("title") or "Untitled",
            uploader=info.get("uploader") or info.get("channel"),
            thumbnail=info.get("thumbnail"),
            duration=info.get("duration"),
            is_live=bool(info.get("is_live")),
            formats=formats,
            audio_tracks=Analyzer._audio_tracks(formats, info),
            subtitles=Analyzer._subtitles(info),
        )

    @staticmethod
    def _direct_format(info: dict[str, Any]) -> FormatInfo:
        def codec_or_none(value: Any) -> str | None:
            return value if value not in _CODEC_NONE else None

        return FormatInfo(
            format_id=str(info.get("format_id") or "direct"),
            kind=FormatKind.COMBINED,
            ext=info.get("ext") or "mp4",
            vcodec=codec_or_none(info.get("vcodec")),
            acodec=codec_or_none(info.get("acodec")),
            height=info.get("height"),
            fps=info.get("fps"),
            tbr=info.get("tbr"),
            filesize=info.get("filesize") or info.get("filesize_approx"),
            language=info.get("language"),
        )

    @staticmethod
    def _formats(raw_formats: list[dict[str, Any]]) -> list[FormatInfo]:
        out: list[FormatInfo] = []
        for fmt in raw_formats:
            if fmt.get("ext") == "mhtml":
                continue  # storyboard pages
            vcodec = fmt.get("vcodec")
            acodec = fmt.get("acodec")
            has_video = vcodec not in _CODEC_NONE
            has_audio = acodec not in _CODEC_NONE
            if not has_video and not has_audio:
                if not fmt.get("url"):
                    continue  # metadata-only entries
                # Unknown codecs but a playable URL: a direct media file.
                kind = FormatKind.COMBINED
            elif has_video and has_audio:
                kind = FormatKind.COMBINED
            elif has_video:
                kind = FormatKind.VIDEO
            else:
                kind = FormatKind.AUDIO
            out.append(
                FormatInfo(
                    format_id=str(fmt.get("format_id") or fmt.get("id") or ""),
                    kind=kind,
                    ext=fmt.get("ext") or "",
                    vcodec=vcodec if has_video else None,
                    acodec=acodec if has_audio else None,
                    height=fmt.get("height"),
                    fps=fmt.get("fps"),
                    tbr=fmt.get("tbr"),
                    filesize=fmt.get("filesize") or fmt.get("filesize_approx"),
                    language=fmt.get("language"),
                )
            )
        return out

    @staticmethod
    def _audio_tracks(formats: list[FormatInfo], info: dict[str, Any]) -> tuple[AudioTrack, ...]:
        """Languages present only when the extractor publishes them."""
        langs: list[str] = []
        for fmt in formats:
            if fmt.kind is not FormatKind.VIDEO and fmt.language and fmt.language not in langs:
                langs.append(fmt.language)
        for code in info.get("audio_languages") or []:
            if code and code not in langs:
                langs.append(code)
        if not langs:
            return (AudioTrack("original", "Original"),)
        tracks = [AudioTrack("original", "Original")]
        tracks.extend(AudioTrack(code, language_label(code)) for code in sorted(langs))
        return tuple(tracks)

    @staticmethod
    def _subtitles(info: dict[str, Any]) -> tuple[SubtitleTrack, ...]:
        out: list[SubtitleTrack] = []
        for lang, entries in (info.get("subtitles") or {}).items():
            ext = entries[-1].get("ext", "vtt") if entries else "vtt"
            out.append(
                SubtitleTrack(language=lang, name=language_label(lang), auto_captions=False, ext=ext)
            )
        for lang, entries in (info.get("automatic_captions") or {}).items():
            ext = entries[-1].get("ext", "vtt") if entries else "vtt"
            out.append(
                SubtitleTrack(language=lang, name=language_label(lang), auto_captions=True, ext=ext)
            )
        return tuple(out)
