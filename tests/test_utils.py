"""Tests for core.utils."""

from __future__ import annotations

from core.utils import (
    clamp,
    format_bytes,
    format_duration,
    format_eta,
    format_speed,
    is_valid_url,
    sanitize_filename,
    utc_now_iso,
)


class TestSanitizeFilename:
    def test_forbidden_characters_replaced(self) -> None:
        assert sanitize_filename('a<b>:c"/d\\|e?f*g') == "a_b__c__d__e_f_g"

    def test_whitespace_collapsed_and_trimmed(self) -> None:
        assert sanitize_filename("  My   Video \n Title ") == "My Video Title"

    def test_reserved_device_names(self) -> None:
        assert sanitize_filename("CON") == "_CON"
        assert sanitize_filename("con.mp4") == "_con.mp4"
        assert sanitize_filename("lpt7.gz") == "_lpt7.gz"
        # base name before the final extension is "lpt7.tar" — not reserved
        assert sanitize_filename("lpt7.tar.gz") == "lpt7.tar.gz"

    def test_empty_or_blank_falls_back(self) -> None:
        assert sanitize_filename("") == "download"
        assert sanitize_filename("   ") == "download"

    def test_truncation_keeps_extension(self) -> None:
        result = sanitize_filename("a" * 300 + ".mp4", max_length=50)
        assert len(result) <= 50
        assert result.endswith(".mp4")

    def test_trailing_dots_and_spaces_stripped(self) -> None:
        assert sanitize_filename("video... ") == "video"

    def test_normal_name_untouched(self) -> None:
        assert sanitize_filename("My Video (1080p).mp4") == "My Video (1080p).mp4"


class TestFormatters:
    def test_bytes(self) -> None:
        assert format_bytes(0) == "0 B"
        assert format_bytes(1023) == "1023 B"
        assert format_bytes(1024) == "1.0 KB"
        assert format_bytes(842 * 1024 * 1024) == "842.0 MB"  # binary units, like Explorer
        assert format_bytes(1_288_490_188) == "1.2 GB"
        assert format_bytes(None) == "—"
        assert format_bytes(-5) == "—"

    def test_speed(self) -> None:
        assert format_speed(12_582_912) == "12.0 MB/s"
        assert format_speed(0) == "—"
        assert format_speed(None) == "—"

    def test_duration(self) -> None:
        assert format_duration(768) == "12:48"
        assert format_duration(3725) == "1:02:05"
        assert format_duration(59) == "0:59"
        assert format_duration(None) == "—"

    def test_eta(self) -> None:
        assert format_eta(31) == "00:31"
        assert format_eta(3725) == "01:02:05"
        assert format_eta(None) == "—"

    def test_clamp(self) -> None:
        assert clamp(5, 1, 3) == 3
        assert clamp(-1, 0, 10) == 0
        assert clamp(5.0, 0.0, 10.0) == 5.0


class TestUrls:
    def test_valid(self) -> None:
        assert is_valid_url("https://example.com/watch?v=abc")
        assert is_valid_url("http://localhost:8080/video")
        assert is_valid_url("  https://example.com/x  ")  # surrounding spaces tolerated

    def test_invalid(self) -> None:
        assert not is_valid_url("")
        assert not is_valid_url(None)  # type: ignore[arg-type]
        assert not is_valid_url("example.com/x")
        assert not is_valid_url("ftp://example.com/file")
        assert not is_valid_url("javascript:alert(1)")
        assert not is_valid_url("https://" + "a" * 3000)


class TestTimestamps:
    def test_utc_now_iso(self) -> None:
        stamp = utc_now_iso()
        assert "T" in stamp
        assert stamp.endswith("+00:00")
