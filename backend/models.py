"""Domain models shared across the backend.

Pure data classes + enums — no I/O, no framework imports. Status values
deliberately match the strings persisted by ``core.database``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

CONTAINERS = ("mp4", "mkv", "webm", "mp3")
AUDIO_CONTAINERS = ("mp3",)

#: Quality tier -> maximum video height it may select.
QUALITY_HEIGHTS = {
    "8k": 4320,
    "4k": 2160,
    "1440p": 1440,
    "1080p": 1080,
    "720p": 720,
    "480p": 480,
    "360p": 360,
}
KNOWN_QUALITIES = ("best", "audio", *QUALITY_HEIGHTS)


class TaskStatus(StrEnum):
    QUEUED = "queued"
    ANALYZING = "analyzing"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FormatKind(StrEnum):
    VIDEO = "video"
    AUDIO = "audio"
    COMBINED = "combined"


class SubtitleMode(StrEnum):
    NONE = "none"
    EXTERNAL = "external"
    EMBEDDED = "embedded"


_LANGUAGE_NAMES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "bn": "Bengali", "hi": "Hindi", "ja": "Japanese", "ko": "Korean",
    "zh": "Chinese", "ar": "Arabic", "ru": "Russian", "pt": "Portuguese",
    "ur": "Urdu", "tr": "Turkish", "it": "Italian", "id": "Indonesian",
    "nl": "Dutch", "pl": "Polish", "sv": "Swedish", "th": "Thai",
    "vi": "Vietnamese", "fa": "Persian", "ta": "Tamil", "te": "Telugu",
    "mr": "Marathi", "ml": "Malayalam", "pa": "Punjabi", "gu": "Gujarati",
    "kn": "Kannada", "or": "Odia", "ne": "Nepali", "si": "Sinhala",
    "my": "Burmese", "km": "Khmer", "fil": "Filipino", "ms": "Malay",
    "he": "Hebrew", "uk": "Ukrainian", "cs": "Czech", "ro": "Romanian",
    "hu": "Hungarian", "el": "Greek", "da": "Danish", "fi": "Finnish",
    "no": "Norwegian",
}


def language_label(code: str) -> str:
    """Best-effort display name for an ISO language code."""
    if not code or code.lower() == "original":
        return "Original"
    base = code.replace("_", "-").split("-")[0].lower()
    return _LANGUAGE_NAMES.get(base) or _LANGUAGE_NAMES.get(code.lower()) or code.upper()


def height_label(height: int) -> str:
    """Map a pixel height to its quality-tier label."""
    if height >= 4320:
        return "8K"
    if height >= 2160:
        return "4K"
    if height >= 1440:
        return "1440p"
    if height >= 1080:
        return "1080p"
    if height >= 720:
        return "720p"
    if height >= 480:
        return "480p"
    if height >= 360:
        return "360p"
    return f"{height}p"


@dataclass(frozen=True)
class FormatInfo:
    format_id: str
    kind: FormatKind
    ext: str
    vcodec: str | None = None
    acodec: str | None = None
    height: int | None = None
    fps: float | None = None
    tbr: float | None = None  # total bitrate, kbps
    filesize: int | None = None  # bytes, when known
    language: str | None = None


@dataclass(frozen=True)
class AudioTrack:
    language: str  # "original" or ISO code
    label: str


@dataclass(frozen=True)
class SubtitleTrack:
    language: str
    name: str
    auto_captions: bool
    ext: str = "vtt"


@dataclass(frozen=True)
class MediaInfo:
    url: str
    title: str
    uploader: str | None = None
    thumbnail: str | None = None
    duration: float | None = None
    is_live: bool = False
    formats: tuple[FormatInfo, ...] = ()
    audio_tracks: tuple[AudioTrack, ...] = field(
        default_factory=lambda: (AudioTrack("original", "Original"),)
    )
    subtitles: tuple[SubtitleTrack, ...] = ()

    @property
    def qualities(self) -> list[str]:
        """Selectable quality tiers derived from the *actual* formats.

        Example: ``["best", "4K", "1080p", "720p", "audio"]``. A tier
        never appears unless a real format backs it.
        """
        heights = sorted(
            {f.height for f in self.formats if f.height and f.kind is not FormatKind.AUDIO},
            reverse=True,
        )
        tier_labels: list[str] = []
        for height in heights:
            label = height_label(height)
            if label not in tier_labels:
                tier_labels.append(label)
        out: list[str] = []
        if any(f.kind is not FormatKind.AUDIO for f in self.formats):
            out.append("best")
        out.extend(tier_labels)
        if any(f.kind is FormatKind.AUDIO for f in self.formats):
            out.append("audio")
        return out

    def has_video(self) -> bool:
        return any(f.kind is not FormatKind.AUDIO for f in self.formats)

    def has_audio(self) -> bool:
        return any(f.kind is FormatKind.AUDIO for f in self.formats)


@dataclass(frozen=True)
class DownloadRequest:
    """One user-confirmed download intention (UI or extension origin)."""

    url: str
    quality: str = "best"  # from MediaInfo.qualities
    container: str = "mp4"  # CONTAINERS
    audio_language: str = "original"  # "original" or ISO code from audio_tracks
    subtitle_mode: SubtitleMode = SubtitleMode.NONE
    subtitle_lang: str | None = None

    def __post_init__(self) -> None:
        if self.container not in CONTAINERS:
            raise ValueError(f"unsupported container: {self.container!r}")
        if self.quality not in KNOWN_QUALITIES:
            raise ValueError(f"unknown quality: {self.quality!r}")
        if self.subtitle_mode is SubtitleMode.EMBEDDED and self.container in AUDIO_CONTAINERS:
            raise ValueError("subtitles cannot be embedded into audio-only files")
        if self.subtitle_mode is not SubtitleMode.NONE and not self.subtitle_lang:
            raise ValueError("subtitle_lang is required when subtitles are requested")
