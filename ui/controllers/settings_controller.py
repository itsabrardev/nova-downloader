"""Settings bridge: QML-facing properties over the shared Config object.

Mutations write through immediately (shared object + persisted JSON) so
the download manager picks up live values (speed limit, connections,
concurrency) without a restart.
"""

from __future__ import annotations

import logging
import sys

from PySide6.QtCore import Property, QObject, Signal, Slot

from core.config import LOG_LEVELS, Config
from core.paths import config_file
from core.utils import clamp

logger = logging.getLogger("ui.settings")


class SettingsController(QObject):
    configChanged = Signal()
    notificationRequested = Signal(str, str)

    def __init__(self, config: Config, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._config = config

    # -- helpers ----------------------------------------------------------------
    def _save(self) -> None:
        try:
            self._config.save()
        except OSError as exc:
            logger.error("cannot save config: %s", exc)
            self.notificationRequested.emit("Could not save settings", str(exc))
            return
        self.configChanged.emit()

    # -- General ------------------------------------------------------------------
    @Property(bool, notify=configChanged)
    def minimizeToTray(self) -> bool:
        return self._config.minimize_to_tray

    @minimizeToTray.setter
    def minimizeToTray(self, value: bool) -> None:
        self._config.minimize_to_tray = bool(value)
        self._save()

    @Property(bool, notify=configChanged)
    def clipboardMonitor(self) -> bool:
        return self._config.clipboard_monitor

    @clipboardMonitor.setter
    def clipboardMonitor(self, value: bool) -> None:
        self._config.clipboard_monitor = bool(value)
        self._save()

    @Property(bool, notify=configChanged)
    def notifications(self) -> bool:
        return self._config.notifications

    @notifications.setter
    def notifications(self, value: bool) -> None:
        self._config.notifications = bool(value)
        self._save()

    @Property(bool, notify=configChanged)
    def startWithWindows(self) -> bool:
        return self._config.start_with_windows

    @startWithWindows.setter
    def startWithWindows(self, value: bool) -> None:
        self._config.start_with_windows = bool(value)
        self._set_autostart(bool(value))
        self._save()

    def _set_autostart(self, enabled: bool) -> None:
        if sys.platform != "win32":
            return
        try:
            import winreg

            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0,
                winreg.KEY_SET_VALUE,
            )
            try:
                if enabled:
                    target = (
                        f'"{sys.executable}" "{sys.argv[0]}"'
                        if not getattr(sys, "frozen", False)
                        else f'"{sys.executable}"'
                    )
                    winreg.SetValueEx(key, "NovaDownloader", 0, winreg.REG_SZ, target)
                else:
                    try:
                        winreg.DeleteValue(key, "NovaDownloader")
                    except FileNotFoundError:
                        pass
            finally:
                winreg.CloseKey(key)
        except OSError as exc:
            logger.warning("autostart registration failed: %s", exc)
            self.notificationRequested.emit("Autostart", "Windows did not accept the startup registration.")

    # -- Downloads -------------------------------------------------------------------
    @Property(str, notify=configChanged)
    def downloadFolder(self) -> str:
        return self._config.download_folder

    @downloadFolder.setter
    def downloadFolder(self, value: str) -> None:
        value = (value or "").strip()
        if value and value != self._config.download_folder:
            self._config.download_folder = value
            self._save()

    @Property(int, notify=configChanged)
    def maxConcurrentDownloads(self) -> int:
        return self._config.max_concurrent_downloads

    @maxConcurrentDownloads.setter
    def maxConcurrentDownloads(self, value: int) -> None:
        self._config.max_concurrent_downloads = int(clamp(int(value), 1, 6))
        self._save()

    @Property(int, notify=configChanged)
    def connections(self) -> int:
        return self._config.connections

    @connections.setter
    def connections(self, value: int) -> None:
        self._config.connections = int(clamp(int(value), 1, 16))
        self._save()

    @Property(int, notify=configChanged)
    def retries(self) -> int:
        return self._config.retries

    @retries.setter
    def retries(self, value: int) -> None:
        self._config.retries = int(clamp(int(value), 0, 10))
        self._save()

    @Property(int, notify=configChanged)
    def speedLimitKbps(self) -> int:
        return self._config.speed_limit_kbps

    @speedLimitKbps.setter
    def speedLimitKbps(self, value: int) -> None:
        self._config.speed_limit_kbps = max(0, int(value))
        self._save()

    # -- Appearance ---------------------------------------------------------------------
    @Property(bool, notify=configChanged)
    def animatedBackground(self) -> bool:
        return self._config.animated_background

    @animatedBackground.setter
    def animatedBackground(self, value: bool) -> None:
        self._config.animated_background = bool(value)
        self._save()

    @Property(float, notify=configChanged)
    def backgroundOpacity(self) -> float:
        return self._config.background_opacity

    @backgroundOpacity.setter
    def backgroundOpacity(self, value: float) -> None:
        self._config.background_opacity = round(clamp(float(value), 0.0, 1.0), 3)
        self._save()

    @Property(float, notify=configChanged)
    def blurIntensity(self) -> float:
        return self._config.blur_intensity

    @blurIntensity.setter
    def blurIntensity(self, value: float) -> None:
        self._config.blur_intensity = round(clamp(float(value), 0.0, 1.0), 3)
        self._save()

    @Property(float, notify=configChanged)
    def animationIntensity(self) -> float:
        return self._config.animation_intensity

    @animationIntensity.setter
    def animationIntensity(self, value: float) -> None:
        self._config.animation_intensity = round(clamp(float(value), 0.0, 1.5), 3)
        self._save()

    # -- Advanced --------------------------------------------------------------------------
    @Property(str, notify=configChanged)
    def ffmpegPath(self) -> str:
        return self._config.ffmpeg_path

    @ffmpegPath.setter
    def ffmpegPath(self, value: str) -> None:
        self._config.ffmpeg_path = (value or "").strip()
        self._save()

    @Property(str, notify=configChanged)
    def logLevel(self) -> str:
        return self._config.log_level

    @logLevel.setter
    def logLevel(self, value: str) -> None:
        value = str(value).lower()
        self._config.log_level = value if value in LOG_LEVELS else "info"
        self._save()

    @Property(bool, notify=configChanged)
    def apiTokenEnabled(self) -> bool:
        return self._config.api_token_enabled

    @apiTokenEnabled.setter
    def apiTokenEnabled(self, value: bool) -> None:
        self._config.api_token_enabled = bool(value)
        if not self._config.api_token:
            self._config.ensure_api_token()
        self._save()

    @Property(str, notify=configChanged)
    def apiToken(self) -> str:
        return self._config.api_token

    @Property(str, constant=True)
    def configPath(self) -> str:
        return str(config_file())

    # -- actions ---------------------------------------------------------------------------
    @Slot()
    def resetSettings(self) -> None:
        fresh = Config.defaults()
        for field in ("max_concurrent_downloads", "connections", "retries", "speed_limit_kbps",
                      "animated_background", "background_opacity", "blur_intensity",
                      "animation_intensity", "ffmpeg_path", "log_level", "clipboard_monitor",
                      "notifications", "minimize_to_tray"):
            setattr(self._config, field, getattr(fresh, field))
        self._save()
        self.notificationRequested.emit("Settings reset", "Defaults restored (folder and API kept).")
