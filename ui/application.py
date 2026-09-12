"""Application bootstrap: Qt app, services, controllers, QML engine."""

from __future__ import annotations

import logging
import sys

from PySide6.QtCore import QTimer, QUrl
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtWidgets import QApplication  # full QApplication: tray/menu need QtWidgets

from backend.api import start_api_server
from backend.download_manager import DownloadManager
from core.branding import APP_NAME, APP_VERSION, ORG_NAME
from core.config import Config
from core.database import Database
from core.logger import setup_logging
from core.paths import qml_dir
from ui.controllers import (
    AnalyzeController,
    AppController,
    DownloadsController,
    HistoryController,
    SettingsController,
)
from ui.icon_factory import create_app_icon

logger = logging.getLogger("ui.application")


class NovaApplication:
    """Wires every service together and exposes them to QML."""

    def __init__(self, argv: list[str], *, with_api: bool = True, check_mode: bool = False) -> None:
        self.app = QApplication(argv)
        self.app.setApplicationName(APP_NAME)
        self.app.setApplicationVersion(APP_VERSION)
        self.app.setOrganizationName(ORG_NAME)
        self.app.setWindowIcon(create_app_icon())
        self.app.setQuitOnLastWindowClosed(False)

        self.config = Config.load()
        self.config.save()  # persist first-run values (pairing token)
        setup_logging(self.config.log_level)

        self.database = Database()
        self.manager = DownloadManager(config=self.config, database=self.database)

        self.app_controller = AppController(self.config, self.manager)
        self.analyze_controller = AnalyzeController(self.config, self.manager)
        self.downloads_controller = DownloadsController(self.manager)
        self.history_controller = HistoryController(self.database)
        self.settings_controller = SettingsController(self.config)
        self._wire_controllers()

        self.api_thread = None
        if with_api:
            try:
                self.api_thread = start_api_server(self.manager, self.config)
            except OSError as exc:
                logger.error("API server could not start: %s", exc)

        self._qml_warnings: list[str] = []
        self.engine = QQmlApplicationEngine()
        self.engine.addImportPath(str(qml_dir()))
        self.engine.warnings.connect(self._collect_warnings)

        context = self.engine.rootContext()
        context.setContextProperty("appController", self.app_controller)
        context.setContextProperty("analyzeController", self.analyze_controller)
        context.setContextProperty("downloadsController", self.downloads_controller)
        context.setContextProperty("historyController", self.history_controller)
        context.setContextProperty("settingsController", self.settings_controller)
        context.setContextProperty("downloadsModel", self.downloads_controller.model)
        context.setContextProperty("historyModel", self.history_controller.model)

        self.engine.objectCreated.connect(self._on_object_created)
        self.engine.load(QUrl.fromLocalFile(str(qml_dir() / "Main.qml")))

        if check_mode:
            QTimer.singleShot(4000, self.app.quit)

    def _wire_controllers(self) -> None:
        settings = self.settings_controller
        app = self.app_controller
        settings.configChanged.connect(app.refreshBackground)
        settings.notificationRequested.connect(app.notificationRequested)
        self.downloads_controller.notificationRequested.connect(app.notificationRequested)
        self.history_controller.notificationRequested.connect(app.notificationRequested)
        self.history_controller.redownloadRequested.connect(self._redownload)
        app.quitRequested.connect(self._shutdown)

    def _redownload(self, url: str) -> None:
        self.app_controller.navigate("home")
        self.analyze_controller.analyze(url)

    def _on_object_created(self, obj, _url) -> None:
        if obj is not None:
            self.app_controller.attach_window(obj)
            self.history_controller.refresh()

    def _collect_warnings(self, warnings) -> None:
        for warning in warnings:
            text = warning.toString()
            self._qml_warnings.append(text)
            logger.warning("QML: %s", text)

    def _shutdown(self) -> None:
        logger.info("shutting down")
        self.manager.close()
        self.app.quit()

    def exec(self) -> int:
        code = self.app.exec()
        self.manager.close()
        return code

    # -- self-check -------------------------------------------------------------
    def check_result(self) -> int:
        root_created = bool(self.engine.rootObjects())
        blocking = [w for w in self._qml_warnings if "TypeError" in w or "error" in w.lower()]
        if root_created and not blocking:
            print(f"SELF-CHECK OK: window created, {len(self._qml_warnings)} warning(s)")
            return 0
        print(f"SELF-CHECK FAILED: root={root_created}, issues={blocking[:5]}")
        return 1


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv
    check_mode = "--check" in argv
    with_api = "--no-api" not in argv
    nova = NovaApplication(argv, with_api=with_api, check_mode=check_mode)
    if check_mode:
        QTimer.singleShot(0, lambda: None)  # let the event loop spin up first
        code = nova.exec()
        return nova.check_result() if code == 0 else code
    return nova.exec()


if __name__ == "__main__":
    raise SystemExit(main())
