"""Shared fixtures: every test runs against an isolated NOVA_DATA_DIR."""

from __future__ import annotations

from pathlib import Path

import pytest

from core import paths


@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect all app-data paths into a per-test temp directory."""
    data_dir = tmp_path / "data"
    monkeypatch.setenv("NOVA_DATA_DIR", str(data_dir))
    paths.reset_caches()
    yield data_dir
    paths.reset_caches()
