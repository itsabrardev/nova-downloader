"""Tests for core.config."""

from __future__ import annotations

import json
from pathlib import Path

from core.config import Config


class TestDefaults:
    def test_defaults_match_architecture(self) -> None:
        c = Config()
        assert (c.max_concurrent_downloads, c.connections, c.retries, c.api_port) == (3, 8, 3, 8765)
        assert (c.background_opacity, c.blur_intensity, c.animation_intensity) == (0.35, 0.5, 1.0)
        assert c.api_token_enabled is True
        assert c.clipboard_monitor is False
        assert c.notifications is True
        assert c.log_level == "info"
        assert c.ffmpeg_path == ""

    def test_download_folder_default(self) -> None:
        assert Config().download_folder  # always resolves to something non-empty

    def test_defaults_are_within_limits(self) -> None:
        c = Config()
        assert 1 <= c.max_concurrent_downloads <= 6
        assert 1 <= c.connections <= 16
        assert 1024 <= c.api_port <= 65535
        assert 0.0 <= c.background_opacity <= 1.0


class TestSanitized:
    def test_ints_clamped(self) -> None:
        c = Config(connections=999, max_concurrent_downloads=0, api_port=80)
        s = c.sanitized()
        assert s.connections == 16
        assert s.max_concurrent_downloads == 1
        assert s.api_port == 1024

    def test_invalid_types_fall_back(self) -> None:
        c = Config(retries="many", blur_intensity="strong")  # type: ignore[arg-type]
        s = c.sanitized()
        assert s.retries == 3
        assert s.blur_intensity == 0.5

    def test_bad_log_level(self) -> None:
        assert Config(log_level="loud").sanitized().log_level == "info"

    def test_blank_folders(self) -> None:
        s = Config(download_folder="   ", ffmpeg_path="  ").sanitized()
        assert s.download_folder  # falls back to default location
        assert s.ffmpeg_path == ""

    def test_original_unchanged(self) -> None:
        c = Config(connections=999)
        c.sanitized()
        assert c.connections == 999  # sanitized returns a copy


class TestToken:
    def test_token_generated_when_enabled(self) -> None:
        c = Config()
        c.ensure_api_token()
        assert len(c.api_token) >= 24

    def test_token_not_generated_when_disabled(self) -> None:
        c = Config(api_token_enabled=False)
        c.ensure_api_token()
        assert c.api_token == ""

    def test_existing_token_preserved(self) -> None:
        c = Config(api_token="existing-token")
        c.ensure_api_token()
        assert c.api_token == "existing-token"


class TestLoadSave:
    def test_load_missing_file_returns_defaults(self, tmp_path: Path) -> None:
        c = Config.load(tmp_path / "missing.json")
        assert c.api_port == 8765
        assert c.api_token  # token is generated even on first run

    def test_roundtrip(self, tmp_path: Path) -> None:
        file = tmp_path / "config.json"
        c = Config(api_port=9000, retries=5, animation_intensity=0.8)
        c.save(file)
        loaded = Config.load(file)
        assert loaded.api_port == 9000
        assert loaded.retries == 5
        assert loaded.animation_intensity == 0.8

    def test_save_writes_valid_json_atomically(self, tmp_path: Path) -> None:
        file = tmp_path / "config.json"
        Config(api_port=1234).save(file)
        data = json.loads(file.read_text(encoding="utf-8"))
        assert data["api_port"] == 1234
        assert not list(tmp_path.glob("*.tmp"))

    def test_load_invalid_json_uses_defaults(self, tmp_path: Path) -> None:
        file = tmp_path / "config.json"
        file.write_text("{not json at all", encoding="utf-8")
        assert Config.load(file).api_port == 8765

    def test_out_of_range_values_clamped(self, tmp_path: Path) -> None:
        file = tmp_path / "config.json"
        file.write_text(json.dumps({"connections": 999, "max_concurrent_downloads": "abc"}), encoding="utf-8")
        c = Config.load(file)
        assert c.connections == 16
        assert c.max_concurrent_downloads == 3

    def test_wrong_value_type_falls_back(self, tmp_path: Path) -> None:
        file = tmp_path / "config.json"
        file.write_text(json.dumps({"log_level": 42, "download_folder": ["nope"]}), encoding="utf-8")
        c = Config.load(file)
        assert c.log_level == "info"
        assert isinstance(c.download_folder, str) and c.download_folder

    def test_unknown_keys_ignored(self, tmp_path: Path) -> None:
        file = tmp_path / "config.json"
        file.write_text(json.dumps({"no_such_key": 1, "api_port": 9000}), encoding="utf-8")
        assert Config.load(file).api_port == 9000

    def test_token_disabled_not_generated(self, tmp_path: Path) -> None:
        file = tmp_path / "config.json"
        file.write_text(json.dumps({"api_token_enabled": False}), encoding="utf-8")
        assert Config.load(file).api_token == ""

    def test_int_float_crossover_tolerated(self, tmp_path: Path) -> None:
        file = tmp_path / "config.json"
        file.write_text(json.dumps({"background_opacity": 1}), encoding="utf-8")
        assert Config.load(file).background_opacity == 1.0
