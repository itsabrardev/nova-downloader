"""Top-level application controller: navigation, tray, clipboard, toasts."""

from __future__ import annotations

import logging
import time

from PySide6.QtCore import Property, QObject, QTimer, QUrl, Signal, Slot
from PySide6.QtGui import QClipboard, QDesktopServices, QGuiApplication
from PySide6.QtWidgets import QMenu, QSystemTrayIcon

from backend.download_manager import DownloadManager
from backend.models import TaskStatus
from core.branding import APP_NAME, APP_VERSION
from core.config import Config
from core.paths import assets_dir
from core.utils import is_valid_url

logger = logging.getLogger("ui.app")

_TRAY_MENU_PAGES = ("home", "downloads", "history", "settings")


class AppController(QObject):
    clipboardUrlDetected = Signal(str)
    notificationRequested = Signal(str, str)
    quitRequested = Signal()
    currentPageChanged = Signal()
    backgroundChanged = Signal()

    def __init__(self, config: Config, manager: DownloadManager, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._config = config
        self._manager = manager
        self._page = "home"
        self._window = None  # QQuickWindow, attached after QML load
        self._last_clipboard = ""
        self._last_notify = 0.0

        self._clipboard: QClipboard | None = None
        clipboard = QGuiApplication.clipboard()
        if clipboard is not None:
            self._clipboard = clipboard
            clipboard.dataChanged.connect(self._on_clipboard_changed)
        self._clipboard_debounce = QTimer(self)
        self._clipboard_debounce.setSingleShot(True)
        self._clipboard_debounce.setInterval(800)
        self._clipboard_debounce.timeout.connect(self._check_clipboard)

        manager.add_listener(self._on_manager_event)

        self._tray = QSystemTrayIcon(self)
        self._tray.setToolTip(APP_NAME)
        self._build_tray_menu()
        self._tray.show()

    # -- QML-facing API -----------------------------------------------------
    @Property(str, constant=True)
    def appName(self) -> str:
        return APP_NAME

    @Property(str, constant=True)
    def appVersion(self) -> str:
        return APP_VERSION

    @Property(str, notify=currentPageChanged)
    def currentPage(self) -> str:
        return self._page

    @Property(str, notify=backgroundChanged)
    def backgroundVideoUrl(self) -> str:
        if not self._config.animated_background:
            return ""
        source = assets_dir() / "background.mp4"
        if source.is_file():
            return QUrl.fromLocalFile(str(source)).toString()
        for candidate in assets_dir().glob("background.*"):
            if candidate.suffix.lower() in (".mp4", ".webm", ".mov"):
                return QUrl.fromLocalFile(str(candidate)).toString()
        return ""

    @Slot()
    def refreshBackground(self) -> None:
        self.backgroundChanged.emit()

    def attach_window(self, window) -> None:
        self._window = window

    @Slot(str)
    def navigate(self, page: str) -> None:
        if page in _TRAY_MENU_PAGES and page != self._page:
            self._page = page
            self.currentPageChanged.emit()

    @Slot()
    def handleClose(self) -> None:
        """Frameless window closing: hide to tray when configured."""
        if self._config.minimize_to_tray and self._window is not None:
            self._window.hide()
        else:
            self.quitRequested.emit()

    @Slot(str)
    def openUrl(self, url: str) -> None:
        QDesktopServices.openUrl(QUrl(url))

    # -- internals ------------------------------------------------------------
    def _on_clipboard_changed(self) -> None:
        if self._config.clipboard_monitor:
            self._clipboard_debounce.start()

    def _check_clipboard(self) -> None:
        if self._clipboard is None:
            return
        text = (self._clipboard.text() or "").strip()
        if text == self._last_clipboard or not is_valid_url(text):
            return
        host = QUrl(text).host()
        if host in ("127.0.0.1", "localhost"):
            return
        self._last_clipboard = text
        self.clipboardUrlDetected.emit(text)

    def _on_manager_event(self, event: str, task_id: int) -> None:
        if event != "status" or not self._config.notifications:
            return
        task = self._manager.get_task(task_id)
        if task is None or task["status"] not in ("completed", "failed"):
            return
        now = time.monotonic()
        if now - self._last_notify < 2.0:
            return
        self._last_notify = now
        if task["status"] == TaskStatus.COMPLETED.value:
            self.notificationRequested.emit("Download completed", task["title"])
        else:
            message = task["error_message"] or "The download failed."
            self.notificationRequested.emit(f"Download failed: {task['title']}", message)

    def _build_tray_menu(self) -> None:
        menu = QMenu()
        menu.addAction("Open NovaDownloader", self._show_main_window)
        menu.addSeparator()
        menu.addAction("Pause all", self._manager.pause_all)
        menu.addAction("Resume all", self._manager.resume_all)
        menu.addSeparator()
        menu.addAction("Downloads", lambda: self.navigate("downloads"))
        menu.addAction("Settings", lambda: self.navigate("settings"))
        menu.addSeparator()
        menu.addAction("Exit", self.quitRequested.emit)
        self._tray.setContextMenu(menu)
        self._tray.activated.connect(
            lambda reason: self._show_main_window()
            if reason == QSystemTrayIcon.ActivationReason.DoubleClick
            else None
        )

    def _show_main_window(self) -> None:
        if self._window is not None:
            self._window.show()
            self._window.showNormal()
            self._window.raise_()
