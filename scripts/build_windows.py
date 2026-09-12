"""Build the Windows distributable with PyInstaller (onedir).

Run from the project root with the venv active:

    python scripts/build_windows.py

Output: build/dist/NovaDownloader/NovaDownloader.exe
Put ffmpeg.exe into build/dist/NovaDownloader/ (beside the exe) before
zipping the folder for distribution.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "build" / "dist" / "NovaDownloader"


def main() -> int:
    if shutil.which("pyinstaller") is None and not (ROOT / ".venv" / "Scripts" / "pyinstaller.exe").exists():
        print("PyInstaller not found — install dev requirements first:")
        print("    python -m pip install -r requirements-dev.txt")
        return 1

    command = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean",
        "--windowed",
        "--name", "NovaDownloader",
        "--icon", str(ROOT / "assets" / "icons" / "icon.ico"),
        "--add-data", f"{ROOT / 'qml'};qml",
        "--add-data", f"{ROOT / 'assets'};assets",
        # yt-dlp loads extractor modules lazily; collect them all
        "--collect-submodules", "yt_dlp",
        "--distpath", str(ROOT / "build" / "dist"),
        "--workpath", str(ROOT / "build" / "work"),
        str(ROOT / "app.py"),
    ]
    print("Running PyInstaller…")
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode != 0:
        print("Build failed.")
        return result.returncode

    bundled = ROOT / "ffmpeg" / "ffmpeg.exe"
    if bundled.is_file():
        shutil.copy2(bundled, DIST / "ffmpeg.exe")
        print("Copied ffmpeg.exe beside the executable.")
    else:
        print("NOTE: ffmpeg/ffmpeg.exe not found — the app will look on PATH.")
        print("      Run scripts/fetch_ffmpeg.py and rebuild, or place ffmpeg.exe")
        print("      directly into build/dist/NovaDownloader/ before distributing.")

    print(f"\nBuild complete: {DIST / 'NovaDownloader.exe'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
