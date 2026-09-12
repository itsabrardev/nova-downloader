"""NovaDownloader entry point.

Usage:
    python app.py             # run the desktop app
    python app.py --no-api    # run without the localhost API server
    python app.py --check     # self-check: load UI, quit, report status
"""

from __future__ import annotations

import sys


def main() -> int:
    from ui.application import main as run_app

    return run_app(sys.argv)


if __name__ == "__main__":
    raise SystemExit(main())
