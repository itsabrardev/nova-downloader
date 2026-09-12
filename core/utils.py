"""Small pure helpers shared across the application."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from urllib.parse import urlparse

_MAX_URL_LENGTH = 2048

# Forbidden on Windows; control chars are included except \t \n \r, which
# are handled as ordinary whitespace and collapsed instead.
_WINDOWS_FORBIDDEN = re.compile(r'[<>:"/\\|?*\x00-\x08\x0b\x0c\x0e-\x1f]')
_WHITESPACE = re.compile(r"\s+")
_RESERVED_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{i}" for i in range(1, 10)}
    | {f"LPT{i}" for i in range(1, 10)}
)


def clamp(value: float, low: float, high: float) -> float:
    """Restrict *value* to ``[low, high]``."""
    if high < low:
        raise ValueError("clamp: high must be >= low")
    return max(low, min(high, value))


def sanitize_filename(name: str, max_length: int = 150, fallback: str = "download") -> str:
    """Turn an arbitrary title into a filename safe on Windows and POSIX.

    Replaces forbidden characters, collapses whitespace, strips trailing
    dots/spaces, avoids reserved device names (CON, NUL, ...) and
    truncates to *max_length* while preserving the extension.
    """
    cleaned = _WINDOWS_FORBIDDEN.sub("_", name)
    cleaned = _WHITESPACE.sub(" ", cleaned).strip(" .")
    if not cleaned:
        return fallback

    stem, dot, ext = cleaned.rpartition(".")
    if dot and stem and ext.strip():
        base = stem.strip(" .")
        if base.upper() in _RESERVED_NAMES:
            base = f"_{base}"
        room = max_length - min(len(ext), 20) - 1
        if room > 0:
            truncated = base[:room].rstrip(" .") or fallback
            return f"{truncated}.{ext[:20]}"[:max_length]

    if cleaned.upper() in _RESERVED_NAMES:
        cleaned = f"_{cleaned}"
    return cleaned[:max_length].rstrip(" .") or fallback


def format_bytes(num_bytes: int | float | None) -> str:
    """``842_000_000 -> '842.0 MB'``; ``None``/negative -> ``'—'``."""
    if num_bytes is None or num_bytes < 0:
        return "—"
    value = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if value < 1024 or unit == "PB":
            if unit == "B":
                return f"{int(value)} {unit}"
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} PB"  # pragma: no cover - loop always returns


def format_speed(bytes_per_second: float | None) -> str:
    """``12_582_912 -> '12.0 MB/s'``; zero/unknown -> ``'—'``."""
    if not bytes_per_second or bytes_per_second <= 0:
        return "—"
    return f"{format_bytes(bytes_per_second)}/s"


def format_duration(total_seconds: float | None) -> str:
    """``768 -> '12:48'``, ``3725 -> '1:02:05'``; unknown -> ``'—'``."""
    if total_seconds is None or total_seconds < 0:
        return "—"
    total = int(round(total_seconds))
    hours, rem = divmod(total, 3600)
    minutes, seconds = divmod(rem, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def format_eta(seconds: float | None) -> str:
    """ETA variant with zero padding: ``31 -> '00:31'``, ``3725 -> '01:02:05'``."""
    if seconds is None or seconds < 0:
        return "—"
    total = int(round(seconds))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def is_valid_url(candidate: str | None) -> bool:
    """True for http(s) URLs with a hostname and a sane length."""
    if not candidate or len(candidate) > _MAX_URL_LENGTH:
        return False
    try:
        parsed = urlparse(candidate.strip())
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def utc_now_iso() -> str:
    """Current UTC time as ISO-8601 with second precision and timezone."""
    return datetime.now(UTC).isoformat(timespec="seconds")
