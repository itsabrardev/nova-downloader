"""FFmpeg discovery and safe invocation.

Every invocation uses an argument list (never a shell), so no user
string can ever be interpreted as a command.
"""

from __future__ import annotations

import shutil
import subprocess
from collections.abc import Sequence
from pathlib import Path

from core import paths
from core.config import Config


class FFmpegError(Exception):
    """Raised when an FFmpeg invocation fails; message is user-readable."""


def find_ffmpeg(config: Config | None = None) -> Path | None:
    """Discovery order: Settings override → bundled ``ffmpeg/`` → PATH.

    Returns the first existing binary or None. Run :func:`probe` to
    verify the binary actually works before relying on it.
    """
    candidates: list[Path | None] = []
    if config is not None and config.ffmpeg_path:
        candidates.append(Path(config.ffmpeg_path))
    candidates.append(paths.bundled_ffmpeg_path())
    which = shutil.which("ffmpeg")
    candidates.append(Path(which) if which else None)

    for candidate in candidates:
        if candidate is not None and candidate.is_file():
            return candidate
    return None


def probe(ffmpeg_path: Path) -> tuple[bool, str]:
    """Run ``ffmpeg -version``; returns ``(ok, version_line_or_error)``."""
    try:
        proc = subprocess.run(
            [str(ffmpeg_path), "-version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)
    if proc.returncode != 0:
        return False, f"exit code {proc.returncode}"
    lines = (proc.stdout or "").splitlines()
    return True, lines[0] if lines else "ffmpeg"


def run(args: Sequence[str], ffmpeg_path: Path, *, timeout: float = 600) -> subprocess.CompletedProcess:
    """Run ffmpeg with an argument list; raises FFmpegError on failure."""
    if not ffmpeg_path.is_file():
        raise FFmpegError(f"FFmpeg not found at {ffmpeg_path}")
    try:
        proc = subprocess.run(
            [str(ffmpeg_path), *args],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise FFmpegError("FFmpeg timed out.") from exc
    except OSError as exc:
        raise FFmpegError(f"Could not run FFmpeg: {exc}") from exc
    if proc.returncode != 0:
        detail = (proc.stderr or "").strip().splitlines()
        tail = detail[-1] if detail else f"exit code {proc.returncode}"
        raise FFmpegError(f"FFmpeg failed: {tail}")
    return proc
