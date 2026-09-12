"""Single source of truth for product branding.

Change these values to rebrand the application; every other module
(QML UI, tray, local API, installer name) reads from here.
"""

from __future__ import annotations

APP_NAME = "NovaDownloader"
APP_ID = "novadownloader"  # app-data folder name, stable machine identifier
APP_VERSION = "0.1.0"
ORG_NAME = "NovaDownloader"
USER_AGENT = f"{APP_NAME}/{APP_VERSION} ({APP_ID})"
