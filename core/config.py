"""Application configuration: defaults, validation, JSON persistence.

The file lives at ``%APPDATA%/novadownloader/config.json`` (see
``core.paths``; overridable via NOVA_DATA_DIR). Invalid or out-of-range
values never crash the app: they are coerced or replaced by defaults
and a warning is logged.
"""

from __future__ import annotations

import json
import logging
import secrets
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any

from . import paths
from .utils import clamp

logger = logging.getLogger("core.config")

INT_LIMITS: dict[str, tuple[int, int]] = {
    "max_concurrent_downloads": (1, 6),
    "connections": (1, 16),
    "retries": (0, 10),
    "speed_limit_kbps": (0, 1_000_000),
    "api_port": (1024, 65535),
}
FLOAT_LIMITS: dict[str, tuple[float, float]] = {
    "background_opacity": (0.0, 1.0),
    "blur_intensity": (0.0, 1.0),
    "animation_intensity": (0.0, 1.5),
}
LOG_LEVELS = ("debug", "info", "warning", "error")


@dataclass
class Config:
    """All user-tunable settings with architecture-defined defaults."""

    # Downloads
    download_folder: str = field(default_factory=lambda: str(paths.default_download_dir()))
    max_concurrent_downloads: int = 3
    connections: int = 8
    retries: int = 3
    speed_limit_kbps: int = 0  # 0 = unlimited

    # Local API
    api_port: int = 8765
    api_token_enabled: bool = True
    api_token: str = ""

    # Behaviour
    clipboard_monitor: bool = False
    minimize_to_tray: bool = True
    start_with_windows: bool = False
    notifications: bool = True

    # Appearance
    animated_background: bool = True
    background_opacity: float = 0.35
    blur_intensity: float = 0.5
    animation_intensity: float = 1.0

    # Advanced
    ffmpeg_path: str = ""  # empty = discovery order (settings → bundled → PATH)
    log_level: str = "info"

    # -- construction ---------------------------------------------------
    @classmethod
    def defaults(cls) -> Config:
        """A fresh config with every value at its documented default."""
        return cls()

    # -- validation -----------------------------------------------------
    def sanitized(self) -> Config:
        """Return a copy with all values coerced into their valid ranges."""
        data = asdict(self)
        fallback = Config.defaults()

        for name, (low, high) in INT_LIMITS.items():
            try:
                data[name] = int(clamp(int(data[name]), low, high))
            except (TypeError, ValueError):
                logger.warning("config: %s=%r is invalid, using default", name, data[name])
                data[name] = getattr(fallback, name)

        for name, (low, high) in FLOAT_LIMITS.items():
            try:
                data[name] = round(float(clamp(float(data[name]), low, high)), 3)
            except (TypeError, ValueError):
                logger.warning("config: %s=%r is invalid, using default", name, data[name])
                data[name] = getattr(fallback, name)

        if data["log_level"] not in LOG_LEVELS:
            logger.warning("config: log_level=%r invalid, using 'info'", data["log_level"])
            data["log_level"] = "info"

        data["download_folder"] = str(data["download_folder"]).strip() or str(fallback.download_folder)
        data["ffmpeg_path"] = str(data["ffmpeg_path"]).strip()
        data["api_token"] = str(data["api_token"]).strip()
        return Config(**data)

    def ensure_api_token(self) -> None:
        """Generate the extension pairing token if enabled and missing."""
        if self.api_token_enabled and not self.api_token:
            self.api_token = secrets.token_urlsafe(24)

    # -- persistence ----------------------------------------------------
    @classmethod
    def load(cls, path: Path | None = None) -> Config:
        """Load config from *path* (default location), tolerating problems.

        A missing file, unreadable JSON, unknown keys and wrong value
        types all fall back to defaults instead of raising.
        """
        file = path if path is not None else paths.config_file()
        data: dict[str, Any] = {}
        try:
            raw = json.loads(file.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
        except FileNotFoundError:
            pass
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("config: cannot read %s (%s); using defaults", file, exc)

        defaults = cls.defaults()
        known = {f.name for f in fields(defaults)}
        unknown = set(data) - known
        if unknown:
            logger.debug("config: ignoring unknown key(s): %s", ", ".join(sorted(unknown)))

        merged: dict[str, Any] = {}
        for f in fields(defaults):
            value = data.get(f.name)
            default_value = getattr(defaults, f.name)
            expected = type(default_value)
            if value is None:
                merged[f.name] = default_value
            elif isinstance(value, expected):
                merged[f.name] = value
            elif isinstance(value, (int, float)) and expected in (int, float) and not isinstance(value, bool):
                merged[f.name] = expected(value)  # tolerate int/float crossover
            else:
                logger.warning("config: %s has wrong type %s; using default", f.name, type(value).__name__)
                merged[f.name] = default_value

        config = cls(**merged).sanitized()
        config.ensure_api_token()
        return config

    def save(self, path: Path | None = None) -> None:
        """Persist atomically (write to a temp file, then os.replace)."""
        file = path if path is not None else paths.config_file()
        file.parent.mkdir(parents=True, exist_ok=True)
        tmp = file.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")
        tmp.replace(file)
