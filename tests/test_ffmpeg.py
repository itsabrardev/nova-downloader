"""Tests for backend.ffmpeg (discovery logic — no real binary needed)."""

from __future__ import annotations

from pathlib import Path

import backend.ffmpeg as ffmpeg_module
from backend.ffmpeg import find_ffmpeg, probe
from core import paths
from core.config import Config


class TestFindFFmpeg:
    def test_settings_override_wins(self, tmp_path: Path, monkeypatch) -> None:
        fake = tmp_path / "ffmpeg.exe"
        fake.touch()
        monkeypatch.setattr(paths, "bundled_ffmpeg_path", lambda: tmp_path / "missing.exe")
        assert find_ffmpeg(Config(ffmpeg_path=str(fake))) == fake

    def test_bundled_binary_used_when_no_override(self, tmp_path: Path, monkeypatch) -> None:
        bundled = tmp_path / "ffmpeg" / "ffmpeg.exe"
        bundled.parent.mkdir()
        bundled.touch()
        monkeypatch.setattr(paths, "bundled_ffmpeg_path", lambda: bundled)
        monkeypatch.setattr(ffmpeg_module.shutil, "which", lambda name: None)
        assert find_ffmpeg(Config()) == bundled

    def test_falls_back_to_path_lookup(self, tmp_path: Path, monkeypatch) -> None:
        on_path = tmp_path / "ffmpeg.exe"
        monkeypatch.setattr(paths, "bundled_ffmpeg_path", lambda: tmp_path / "missing.exe")
        monkeypatch.setattr(ffmpeg_module.shutil, "which", lambda name: str(on_path))
        on_path.touch()
        assert find_ffmpeg(Config()) == on_path

    def test_nothing_found_returns_none(self, tmp_path: Path, monkeypatch) -> None:
        monkeypatch.setattr(paths, "bundled_ffmpeg_path", lambda: tmp_path / "missing.exe")
        monkeypatch.setattr(ffmpeg_module.shutil, "which", lambda name: None)
        assert find_ffmpeg(Config()) is None

    def test_missing_override_is_skipped(self, tmp_path: Path, monkeypatch) -> None:
        bundled = tmp_path / "ffmpeg" / "ffmpeg.exe"
        bundled.parent.mkdir()
        bundled.touch()
        monkeypatch.setattr(paths, "bundled_ffmpeg_path", lambda: bundled)
        config = Config(ffmpeg_path=str(tmp_path / "does-not-exist.exe"))
        assert find_ffmpeg(config) == bundled


class TestProbe:
    def test_missing_binary_fails_cleanly(self, tmp_path: Path) -> None:
        ok, detail = probe(tmp_path / "nope.exe")
        assert ok is False
        assert detail  # some human-readable error
