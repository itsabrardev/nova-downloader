"""Tests for backend.analyzer — offline, using fake yt-dlp payloads."""

from __future__ import annotations

from typing import Any

from backend.analyzer import Analyzer
from backend.models import FormatKind

RAW_INFO: dict[str, Any] = {
    "title": "Test Video",
    "uploader": "Test Channel",
    "thumbnail": "https://img/x.jpg",
    "duration": 61.5,
    "is_live": False,
    "formats": [
        {"format_id": "sb0", "ext": "mhtml", "vcodec": "none", "acodec": "none"},  # storyboard
        {"format_id": "0", "ext": "mhtml", "vcodec": "none", "acodec": "none"},
        {"format_id": "18", "ext": "mp4", "vcodec": "avc1", "acodec": "mp4a",
         "height": 360, "tbr": 500, "filesize": 4_000_000},
        {"format_id": "137", "ext": "mp4", "vcodec": "avc1", "acodec": "none",
         "height": 1080, "tbr": 4000, "filesize_approx": 31_000_000},
        {"format_id": "140", "ext": "m4a", "vcodec": "none", "acodec": "mp4a",
         "tbr": 128, "filesize": 1_000_000, "language": "en"},
    ],
    "subtitles": {
        "en": [{"ext": "vtt"}, {"ext": "srt"}],
        "bn": [{"ext": "vtt"}],
    },
    "automatic_captions": {"hi": [{"ext": "vtt"}]},
}


class FakeEngine:
    def __init__(self, info: dict[str, Any]) -> None:
        self._info = info

    def extract(self, url: str) -> dict[str, Any]:
        return self._info


class TestNormalize:
    def test_basic_fields(self) -> None:
        media = Analyzer.normalize("https://x/1", RAW_INFO)
        assert media.url == "https://x/1"
        assert media.title == "Test Video"
        assert media.uploader == "Test Channel"
        assert media.thumbnail == "https://img/x.jpg"
        assert media.duration == 61.5
        assert media.is_live is False

    def test_storyboards_filtered_kinds_detected(self) -> None:
        media = Analyzer.normalize("u", RAW_INFO)
        kinds = [f.kind for f in media.formats]
        assert kinds == [FormatKind.COMBINED, FormatKind.VIDEO, FormatKind.AUDIO]
        assert all(f.ext != "mhtml" for f in media.formats)

    def test_format_fields_preserved(self) -> None:
        media = Analyzer.normalize("u", RAW_INFO)
        audio = media.formats[2]
        assert audio.format_id == "140"
        assert audio.language == "en"
        assert audio.filesize == 1_000_000
        video = media.formats[1]
        assert video.height == 1080
        assert video.filesize == 31_000_000  # falls back to filesize_approx

    def test_audio_tracks_from_language_metadata(self) -> None:
        media = Analyzer.normalize("u", RAW_INFO)
        assert [t.language for t in media.audio_tracks] == ["original", "en"]
        assert media.audio_tracks[1].label == "English"

    def test_audio_tracks_from_info_field(self) -> None:
        info = dict(RAW_INFO, audio_languages=["ja", "fr"])
        media = Analyzer.normalize("u", info)
        assert [t.language for t in media.audio_tracks] == ["original", "en", "fr", "ja"]

    def test_no_language_metadata_means_original_only(self) -> None:
        info = {
            "title": "t",
            "formats": [{"format_id": "140", "ext": "m4a", "vcodec": "none", "acodec": "mp4a"}],
        }
        media = Analyzer.normalize("u", info)
        assert [t.language for t in media.audio_tracks] == ["original"]

    def test_subtitles_manual_and_auto(self) -> None:
        media = Analyzer.normalize("u", RAW_INFO)
        by_lang = {(s.language, s.auto_captions): s for s in media.subtitles}
        assert set(by_lang) == {("en", False), ("bn", False), ("hi", True)}
        assert by_lang[("en", False)].ext == "srt"  # last entry wins
        assert by_lang[("en", False)].name == "English"
        assert by_lang[("hi", True)].name == "Hindi"

    def test_qualities_derived(self) -> None:
        media = Analyzer.normalize("u", RAW_INFO)
        assert media.qualities == ["best", "1080p", "360p", "audio"]

    def test_analyze_uses_engine(self) -> None:
        media = Analyzer(FakeEngine(RAW_INFO)).analyze("https://x/9")
        assert media.url == "https://x/9"
        assert media.title == "Test Video"

    def test_direct_media_url_without_format_list(self) -> None:
        info = {
            "title": "direct_file",
            "url": "https://cdn.example/file.mp4",
            "ext": "mp4",
            "filesize": 1_048_576,
            "duration": 10.0,
        }
        media = Analyzer.normalize("https://cdn.example/file.mp4", info)
        assert len(media.formats) == 1
        fmt = media.formats[0]
        assert fmt.kind is FormatKind.COMBINED
        assert fmt.ext == "mp4"
        assert fmt.filesize == 1_048_576
        assert media.qualities == ["best"]

    def test_direct_media_url_with_codec_less_format_entry(self) -> None:
        # Shape returned by yt-dlp's generic extractor for direct files:
        # one format entry, codecs unknown, but a playable URL.
        info = {
            "title": "direct_file",
            "formats": [
                {"format_id": "mp4", "ext": "mp4", "protocol": "https",
                 "url": "https://cdn.example/file.mp4"},
            ],
        }
        media = Analyzer.normalize("https://cdn.example/file.mp4", info)
        assert len(media.formats) == 1
        assert media.formats[0].kind is FormatKind.COMBINED
        assert media.qualities == ["best"]

    def test_metadata_only_entries_still_filtered(self) -> None:
        info = {
            "title": "t",
            "formats": [
                {"format_id": "meta", "ext": "json"},  # no codecs, no url
            ],
        }
        media = Analyzer.normalize("u", info)
        assert media.formats == ()
