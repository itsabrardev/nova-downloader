"""Manual smoke test for the backend engine (requires network + ffmpeg for downloads).

Usage:
    python scripts/smoke_engine.py analyze <url> [--json]
    python scripts/smoke_engine.py download <url> [--quality 1080p] [--format mp4]
        [--audio-language original] [--subtitle-lang en] [--subtitle-mode none|external|embedded]
        [--out DIR]

Examples:
    python scripts/smoke_engine.py analyze https://www.youtube.com/watch?v=dQw4w9WgXcQ
    python scripts/smoke_engine.py download <url> --quality audio --format mp3
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.analyzer import Analyzer  # noqa: E402
from backend.ffmpeg import find_ffmpeg  # noqa: E402
from backend.format_manager import build_ydl_options  # noqa: E402
from backend.models import DownloadRequest, SubtitleMode  # noqa: E402
from backend.ytdlp_engine import EngineError, TaskControl, YtDlpEngine  # noqa: E402
from core.config import Config  # noqa: E402
from core.logger import setup_logging  # noqa: E402
from core.paths import app_root_dir  # noqa: E402
from core.utils import format_bytes, format_duration, format_speed  # noqa: E402


def _engine() -> YtDlpEngine:
    return YtDlpEngine(Config.load())


def cmd_analyze(args: argparse.Namespace) -> int:
    try:
        media = Analyzer(_engine()).analyze(args.url)
    except EngineError as exc:
        print(f"Analyze failed [{exc.code}]: {exc}")
        return 1
    if args.json:
        print(json.dumps(dataclasses.asdict(media), indent=2))
        return 0
    print(f"Title:     {media.title}")
    print(f"Uploader:  {media.uploader or '—'}")
    print(f"Duration:  {format_duration(media.duration)}   Live: {media.is_live}")
    print(f"Thumbnail: {media.thumbnail or '—'}")
    print(f"Qualities: {', '.join(media.qualities) or '—'}")
    print(f"Audio:     {', '.join(t.label for t in media.audio_tracks)}")
    subs = ", ".join(f"{s.language}{' (auto)' if s.auto_captions else ''}" for s in media.subtitles)
    print(f"Subtitles: {subs or '—'}")
    print(f"Formats:   {len(media.formats)}")
    for fmt in media.formats[:12]:
        size = f" {format_bytes(fmt.filesize)}" if fmt.filesize else ""
        print(f"  [{fmt.kind.value:8}] {fmt.format_id:12} {fmt.ext:5} "
              f"h={fmt.height or '-':4} tbr={fmt.tbr or '-'}{size}")
    return 0


def cmd_download(args: argparse.Namespace) -> int:
    config = Config.load()
    setup_logging(config.log_level, console=True)
    print("Analyzing…")
    try:
        media = Analyzer(_engine()).analyze(args.url)
    except EngineError as exc:
        print(f"Analyze failed [{exc.code}]: {exc}")
        return 1
    print(f"→ {media.title} ({', '.join(media.qualities)})")

    request = DownloadRequest(
        url=args.url,
        quality=args.quality,
        container=args.format,
        audio_language=args.audio_language,
        subtitle_mode=SubtitleMode(args.subtitle_mode),
        subtitle_lang=args.subtitle_lang if args.subtitle_mode != "none" else None,
    )
    out_dir = Path(args.out) if args.out else app_root_dir() / "build" / "smoke_downloads"
    out_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg_path = find_ffmpeg(config)
    print(f"FFmpeg:    {ffmpeg_path or 'NOT FOUND (merge/mp3 will fail)'}")

    try:
        opts = build_ydl_options(request, media, config=config, ffmpeg_path=ffmpeg_path, download_dir=out_dir)
    except ValueError as exc:
        print(f"Invalid request: {exc}")
        return 1
    print(f"Selector:  {opts['format']}")

    control = TaskControl()
    last_print = 0.0

    def on_progress(payload: dict) -> None:
        nonlocal last_print
        now = time.monotonic()
        if payload.get("status") != "downloading" and payload.get("status") != "finished":
            return
        if now - last_print < 0.5 and payload.get("status") != "finished":
            return
        last_print = now
        done = payload.get("downloaded_bytes") or 0
        total = payload.get("total_bytes_effective")
        speed = payload.get("speed")
        eta = payload.get("eta")
        total_s = format_bytes(total) if total else "?"
        eta_s = f"{eta}s" if eta else "—"
        print(f"\r  {payload['status']:11} {format_bytes(done)} / {total_s}"
              f"  {format_speed(speed):>10}  eta {eta_s}   ", end="", flush=True)
        if payload.get("status") == "finished":
            print()

    try:
        _engine().download(args.url, opts, on_progress=on_progress, control=control)
    except KeyboardInterrupt:
        print("\nCancelling…")
        control.cancel()
        return 130
    except EngineError as exc:
        print(f"\nDownload failed [{exc.code}]: {exc}")
        return 1
    print("Done.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="NovaDownloader backend engine smoke test")
    sub = parser.add_subparsers(dest="command", required=True)

    p_analyze = sub.add_parser("analyze", help="analyze a URL and print media info")
    p_analyze.add_argument("url")
    p_analyze.add_argument("--json", action="store_true")

    p_download = sub.add_parser("download", help="download a URL")
    p_download.add_argument("url")
    p_download.add_argument("--quality", default="best")
    p_download.add_argument("--format", default="mp4", choices=["mp4", "mkv", "webm", "mp3"])
    p_download.add_argument("--audio-language", default="original")
    p_download.add_argument("--subtitle-mode", default="none", choices=["none", "external", "embedded"])
    p_download.add_argument("--subtitle-lang", default=None)
    p_download.add_argument("--out", default=None)

    args = parser.parse_args()
    if args.command == "analyze":
        return cmd_analyze(args)
    return cmd_download(args)


if __name__ == "__main__":
    raise SystemExit(main())
