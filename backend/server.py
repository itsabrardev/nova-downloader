"""Headless backend server: local API + built React UI, no Qt.

This is the process the Electron shell spawns. It runs the same
DownloadManager/Analyzer stack as the desktop app but serves the UI at
``http://127.0.0.1:<port>/`` from ``desktop/dist`` instead of opening a
Qt window.

Usage:
    python -m backend.server [--port 8765] [--host 127.0.0.1]
"""

from __future__ import annotations

import argparse
import logging

import uvicorn

from backend.api import create_app
from backend.download_manager import DownloadManager
from core.config import Config
from core.database import Database
from core.logger import setup_logging
from core.paths import app_root_dir, assets_dir

logger = logging.getLogger("server")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="NovaDownloader headless backend")
    parser.add_argument("--port", type=int, default=None, help="override config api_port")
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args(argv)

    config = Config.load()
    if args.port:
        config.api_port = args.port
    config.save()  # persist first-run values (pairing token)
    setup_logging(config.log_level)

    database = Database()
    manager = DownloadManager(config=config, database=database)
    app = create_app(
        manager,
        config,
        database=database,
        static_dir=app_root_dir() / "desktop" / "dist",
        assets_dir=assets_dir(),
    )

    logger.info("NovaDownloader backend listening on http://%s:%s", args.host, config.api_port)
    try:
        uvicorn.run(app, host=args.host, port=config.api_port, log_level="warning")
    finally:
        manager.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
