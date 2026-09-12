"""Tests for backend.ytdlp_engine — offline (hooks and error mapping)."""

from __future__ import annotations

import threading

import pytest
from yt_dlp.utils import DownloadCancelled, DownloadError

from backend.ytdlp_engine import (
    EngineError,
    TaskControl,
    build_hook,
    friendly_error,
    normalize_progress,
)


class TestFriendlyError:
    def test_private_video(self) -> None:
        code, message = friendly_error(DownloadError("ERROR: Private video. Sign in if you own it"))
        assert code == "UNAVAILABLE"
        assert "private" in message.lower()

    def test_unsupported_url(self) -> None:
        code, _ = friendly_error(DownloadError("ERROR: Unsupported URL: https://x/"))
        assert code == "UNSUPPORTED_URL"

    def test_network(self) -> None:
        code, _ = friendly_error(DownloadError("ERROR: unable to download webpage: <timeout>"))
        assert code == "NETWORK"

    def test_unknown_falls_back_with_cleaned_message(self) -> None:
        code, message = friendly_error(DownloadError("ERROR: something exotic happened"))
        assert code == "ENGINE_ERROR"
        assert message == "something exotic happened"

    def test_no_substring_false_positive_on_page(self) -> None:
        # "webpage" must NOT trip a naive "age" matcher
        code, _ = friendly_error(DownloadError("ERROR: unable to download webpage"))
        assert code == "NETWORK"


class TestTaskControl:
    def test_pause_resume_cycle(self) -> None:
        control = TaskControl()
        assert not control.paused
        control.pause()
        assert control.paused
        control.resume()
        assert not control.paused

    def test_cancel_is_sticky(self) -> None:
        control = TaskControl()
        control.cancel()
        assert control.cancelled
        control.resume()  # resume does not un-cancel
        assert control.cancelled


class TestNormalizeProgress:
    def test_copies_known_keys_and_fills_effective_total(self) -> None:
        payload = {
            "status": "downloading",
            "downloaded_bytes": 100,
            "total_bytes_estimate": 1000,
            "speed": 12.5,
            "eta": 72,
            "info_dict": {"id": "x"},  # ignored noise
        }
        out = normalize_progress(payload)
        assert out["status"] == "downloading"
        assert out["downloaded_bytes"] == 100
        assert out["total_bytes"] is None
        assert out["total_bytes_effective"] == 1000
        assert "info_dict" not in out

    def test_prefers_exact_total_over_estimate(self) -> None:
        out = normalize_progress({"total_bytes": 50, "total_bytes_estimate": 80})
        assert out["total_bytes_effective"] == 50


class TestBuildHook:
    def test_forwards_normalized_progress(self) -> None:
        seen: list[dict] = []
        hook = build_hook(TaskControl(), seen.append)
        hook({"status": "downloading", "downloaded_bytes": 5})
        assert seen[0]["downloaded_bytes"] == 5
        assert "total_bytes_effective" in seen[0]

    def test_raises_download_cancelled_when_cancelled(self) -> None:
        control = TaskControl()
        control.cancel()
        hook = build_hook(control, lambda p: None)
        with pytest.raises(DownloadCancelled):
            hook({"status": "downloading"})

    def test_pause_blocks_until_resumed(self) -> None:
        control = TaskControl()
        seen: list[dict] = []
        hook = build_hook(control, seen.append)
        control.pause()

        errors: list[Exception] = []

        def run_hook() -> None:
            try:
                hook({"status": "downloading"})
            except Exception as exc:  # pragma: no cover - failure signal
                errors.append(exc)

        thread = threading.Thread(target=run_hook)
        thread.start()
        thread.join(timeout=0.3)
        assert thread.is_alive()  # still paused, not consuming CPU beyond sleep
        control.resume()
        thread.join(timeout=1.0)
        assert not thread.is_alive()
        assert not errors
        assert len(seen) == 1

    def test_cancel_breaks_out_of_pause(self) -> None:
        control = TaskControl()
        outcome: list[Exception] = []
        hook = build_hook(control, lambda p: None)
        control.pause()

        def run_hook() -> None:
            try:
                hook({"status": "downloading"})
            except Exception as exc:
                outcome.append(exc)

        thread = threading.Thread(target=run_hook)
        thread.start()
        control.cancel()
        thread.join(timeout=1.0)
        assert not thread.is_alive()
        assert isinstance(outcome[0], DownloadCancelled)


class TestEngineError:
    def test_carries_code_and_original(self) -> None:
        original = DownloadError("boom")
        err = EngineError("It broke.", code="NETWORK", original=original)
        assert err.code == "NETWORK"
        assert err.original is original
        assert str(err) == "It broke."
