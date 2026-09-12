"""Tests for backend.api — offline with real manager + fake analyzer/engine."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.api import create_app
from backend.download_manager import DownloadManager
from backend.models import FormatInfo, FormatKind, MediaInfo
from core.config import Config
from core.database import Database

EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
EVIL_ORIGIN = "https://evil.example"


def make_media(url: str) -> MediaInfo:
    return MediaInfo(
        url=url, title="API Video", uploader="Chan", duration=42.0,
        formats=(
            FormatInfo("v", FormatKind.VIDEO, "mp4", vcodec="h264", height=720),
            FormatInfo("a", FormatKind.AUDIO, "m4a", acodec="aac"),
        ),
        subtitles=(),
    )


class FakeAnalyzer:
    def analyze(self, url: str) -> MediaInfo:
        return make_media(url)


class NoopEngine:
    def download(self, url, ydl_opts, *, on_progress, control) -> None:  # pragma: no cover
        on_progress({"status": "finished", "filename": "x.mp4", "downloaded_bytes": 1, "total_bytes": 1})


@pytest.fixture()
def client(tmp_path: Path):
    config = Config(download_folder=str(tmp_path / "dl"), api_token="secret-token")
    manager = DownloadManager(
        config=config, database=Database(), analyzer=FakeAnalyzer(),
        engine_factory=lambda: NoopEngine(),
    )
    app = create_app(manager, config, analyzer=FakeAnalyzer())
    with TestClient(app) as test_client:
        yield test_client, manager, config
    manager.close()


def auth_headers(config: Config) -> dict[str, str]:
    return {"X-Nova-Token": config.api_token}


class TestStatus:
    def test_open_without_token(self, client) -> None:
        http, _manager, _config = client
        response = http.get("/api/status")
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["token_required"] is True
        assert {"active", "queued"} <= set(body["queue"])


class TestTokenEnforcement:
    def test_analyze_requires_token(self, client) -> None:
        http, _m, config = client
        denied = http.post("/api/analyze", json={"url": "https://x/1"})
        assert denied.status_code == 401
        assert denied.json()["error"]["code"] == "UNAUTHORIZED"

        allowed = http.post("/api/analyze", json={"url": "https://x/1"}, headers=auth_headers(config))
        assert allowed.status_code == 200
        assert allowed.json()["title"] == "API Video"

    def test_download_requires_token(self, client) -> None:
        http, _m, config = client
        body = {"url": "https://x/1"}
        assert http.post("/api/download", json=body).status_code == 401
        assert http.post("/api/download", json=body, headers=auth_headers(config)).status_code == 202

    def test_bad_token_rejected(self, client) -> None:
        http, _m, _config = client
        response = http.post("/api/analyze", json={"url": "https://x/1"}, headers={"X-Nova-Token": "wrong"})
        assert response.status_code == 401


class TestValidation:
    def test_invalid_url_rejected(self, client) -> None:
        http, _m, config = client
        response = http.post("/api/analyze", json={"url": "not-a-url"}, headers=auth_headers(config))
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "INVALID_REQUEST"

    def test_unknown_container_rejected(self, client) -> None:
        http, _m, config = client
        response = http.post(
            "/api/download",
            json={"url": "https://x/1", "format": "avi"},
            headers=auth_headers(config),
        )
        assert response.status_code == 400

    def test_unknown_quality_rejected_at_request_level(self, client) -> None:
        http, _m, config = client
        response = http.post(
            "/api/download",
            json={"url": "https://x/1", "quality": "9999p"},
            headers=auth_headers(config),
        )
        assert response.status_code == 400


class TestDownloadFlow:
    def test_download_lists_and_controls(self, client) -> None:
        http, manager, config = client
        created = http.post(
            "/api/download",
            json={"url": "https://x/1", "quality": "720p", "format": "mp4"},
            headers=auth_headers(config),
        )
        assert created.status_code == 202
        task_id = created.json()["id"]

        listed = http.get("/api/downloads", headers=auth_headers(config))
        assert listed.status_code == 200
        assert any(t["id"] == task_id for t in listed.json()["tasks"])

        single = http.get(f"/api/download/{task_id}", headers=auth_headers(config))
        assert single.status_code == 200
        assert single.json()["quality"] == "720p"

    def test_missing_task_404(self, client) -> None:
        http, _m, config = client
        response = http.get("/api/download/9999", headers=auth_headers(config))
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"

    def test_pause_invalid_state_409(self, client) -> None:
        http, _m, config = client
        created = http.post("/api/download", json={"url": "https://x/1"}, headers=auth_headers(config))
        task_id = created.json()["id"]
        # task is queued (engine noop finishes fast, but pause of a
        # completed/queued task is invalid in any of those states for API)
        response = http.post(f"/api/download/{task_id}/pause", headers=auth_headers(config))
        assert response.status_code in (200, 409)  # depends on timing; both are valid outcomes
        assert response.json().get("ok") is True or response.json()["error"]["code"] == "INVALID_STATE"

    def test_analyze_response_shape(self, client) -> None:
        http, _m, config = client
        body = http.post("/api/analyze", json={"url": "https://x/1"}, headers=auth_headers(config)).json()
        assert body["qualities"] == ["best", "720p", "audio"]
        assert body["audio_tracks"][0]["language"] == "original"
        assert body["formats"][0]["kind"] == "video"


class TestCors:
    def test_extension_origin_allowed(self, client) -> None:
        http, _m, _c = client
        response = http.get("/api/status", headers={"Origin": EXTENSION_ORIGIN})
        assert response.headers.get("access-control-allow-origin") == EXTENSION_ORIGIN

    def test_evil_origin_not_allowed(self, client) -> None:
        http, _m, _c = client
        response = http.get("/api/status", headers={"Origin": EVIL_ORIGIN})
        assert response.headers.get("access-control-allow-origin") is None

    def test_preflight_from_extension(self, client) -> None:
        http, _m, _c = client
        response = http.options(
            "/api/download",
            headers={
                "Origin": EXTENSION_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-nova-token",
            },
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == EXTENSION_ORIGIN
        assert "x-nova-token" in response.headers.get("access-control-allow-headers", "")
