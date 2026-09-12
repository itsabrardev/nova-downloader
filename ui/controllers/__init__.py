"""QML bridge controllers (the only layer importing Qt AND backend)."""

from ui.controllers.analyze_controller import AnalyzeController
from ui.controllers.app_controller import AppController
from ui.controllers.downloads_controller import DownloadsController
from ui.controllers.history_controller import HistoryController
from ui.controllers.settings_controller import SettingsController

__all__ = [
    "AnalyzeController",
    "AppController",
    "DownloadsController",
    "HistoryController",
    "SettingsController",
]
