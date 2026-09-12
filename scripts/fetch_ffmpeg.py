"""Fetch a pinned FFmpeg build into ffmpeg/ffmpeg.exe.

Downloads the widely-used BtbN GPL build for Windows. If the download
fails (offline / blocked), the script prints manual instructions and
exits non-zero — the app also auto-detects FFmpeg on PATH.
"""

from __future__ import annotations

import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFMPEG_DIR = ROOT / "ffmpeg"
URL = "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"


def download(target: Path) -> None:
    print(f"Downloading {URL}")
    print("(large file — several MB; please wait)")

    def progress(blocks: int, block_size: int, total: int) -> None:
        done = blocks * block_size
        if total > 0:
            sys.stdout.write(f"\r  {done // 1024 // 1024} / {total // 1024 // 1024} MB")
            sys.stdout.flush()

    urllib.request.urlretrieve(URL, target, reporthook=progress)
    print()


def extract(target: Path) -> None:
    print("Extracting ffmpeg.exe…")
    with zipfile.ZipFile(target) as archive:
        member = next(
            (name for name in archive.namelist()
             if name.endswith("ffmpeg.exe") and "/" in name),
            None,
        )
        if member is None:
            raise RuntimeError("ffmpeg.exe not found inside the archive")
        FFMPEG_DIR.mkdir(parents=True, exist_ok=True)
        with archive.open(member) as source, open(FFMPEG_DIR / "ffmpeg.exe", "wb") as sink:
            shutil.copyfileobj(source, sink)


def main() -> int:
    if (FFMPEG_DIR / "ffmpeg.exe").is_file():
        print("ffmpeg/ffmpeg.exe already present — delete it to re-fetch.")
        return 0
    if shutil.which("ffmpeg"):
        print("Note: FFmpeg found on PATH; the bundled copy is optional.")
    archive = FFMPEG_DIR / "ffmpeg.zip"
    try:
        download(archive)
        extract(archive)
    except Exception as exc:  # noqa: BLE001 - report any failure cleanly
        print(f"\nDownload failed: {exc}")
        print("Manual fallback:")
        print("  1. Download a Windows FFmpeg build (e.g. from https://www.gyan.dev/ffmpeg/")
        print("     or https://github.com/BtbN/FFmpeg-Builds/releases)")
        print("  2. Copy ffmpeg.exe into: <project>/ffmpeg/ffmpeg.exe")
        return 1
    finally:
        archive.unlink(missing_ok=True)
    print(f"Done: {FFMPEG_DIR / 'ffmpeg.exe'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
