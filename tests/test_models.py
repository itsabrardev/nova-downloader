"""Tests for backend.models."""

from __future__ import annotations

import pytest

from backend.models import (
    QUALITY_HEIGHTS,
    AudioTrack,
    DownloadRequest,
    FormatInfo,
    FormatKind,
    MediaInfo,
    SubtitleMode,
    TaskStatus,
    height_label,
    language_label,
)
from core.database import DOWNLOAD_STATUSES


def make_format(kind: FormatKind, height: int | None = None, language: str | None = None) -> FormatInfo:
    return FormatInfo(
        format_id="x",
        kind=kind,
        ext="mp4",
        vcodec="h264" if kind is not FormatKind.AUDIO else None,
        acodec="aac" if kind is not FormatKind.VIDEO else None,
        height=height,
        language=language,
    )


class TestTaskStatus:
    def test_values_match_database_vocabulary(self) -> None:
        assert {s.value for s in TaskStatus} == set(DOWNLOAD_STATUSES)

    def test_string_serialization(self) -> None:
        assert TaskStatus.DOWNLOADING.value == "downloading"
        assert TaskStatus.DOWNLOADING == "downloading"  # str-enum comparison


class TestHeightAndLanguageHelpers:
    def test_height_labels(self) -> None:
        assert height_label(4320) == "8K"
        assert height_label(2400) == "4K"  # tier bucketing
        assert height_label(2160) == "4K"
        assert height_label(1440) == "1440p"
        assert height_label(1080) == "1080p"
        assert height_label(300) == "300p"

    def test_language_labels(self) -> None:
        assert language_label("bn") == "Bengali"
        assert language_label("pt-BR") == "Portuguese"  # region stripped
        assert language_label("xx") == "XX"  # unknown code falls back
        assert language_label("original") == "Original"
        assert language_label("") == "Original"

    def test_quality_heights_coverage(self) -> None:
        assert QUALITY_HEIGHTS["4k"] == 2160
        assert QUALITY_HEIGHTS["1080p"] == 1080


class TestMediaInfoQualities:
    def test_derived_from_real_formats_only(self) -> None:
        media = MediaInfo(
            url="u",
            title="t",
            formats=(
                make_format(FormatKind.COMBINED, height=2160),
                make_format(FormatKind.VIDEO, height=1080),
                make_format(FormatKind.VIDEO, height=720),
                make_format(FormatKind.AUDIO),
            ),
        )
        assert media.qualities == ["best", "4K", "1080p", "720p", "audio"]

    def test_duplicate_heights_dedupe_into_one_tier(self) -> None:
        media = MediaInfo(
            url="u",
            title="t",
            formats=(
                make_format(FormatKind.VIDEO, height=1080),
                make_format(FormatKind.VIDEO, height=1082),  # same tier
            ),
        )
        assert media.qualities == ["best", "1080p"]

    def test_audio_only_media(self) -> None:
        media = MediaInfo(url="u", title="t", formats=(make_format(FormatKind.AUDIO),))
        assert media.qualities == ["audio"]
        assert not media.has_video()
        assert media.has_audio()

    def test_no_formats(self) -> None:
        assert MediaInfo(url="u", title="t").qualities == []


class TestDownloadRequest:
    def test_defaults(self) -> None:
        request = DownloadRequest(url="https://x/v/1")
        assert request.quality == "best"
        assert request.container == "mp4"
        assert request.audio_language == "original"
        assert request.subtitle_mode is SubtitleMode.NONE

    def test_rejects_bad_container(self) -> None:
        with pytest.raises(ValueError):
            DownloadRequest(url="u", container="avi")

    def test_rejects_bad_quality(self) -> None:
        with pytest.raises(ValueError):
            DownloadRequest(url="u", quality="240p")

    def test_rejects_embedded_subtitles_in_mp3(self) -> None:
        with pytest.raises(ValueError):
            DownloadRequest(
                url="u",
                quality="audio",
                container="mp3",
                subtitle_mode=SubtitleMode.EMBEDDED,
                subtitle_lang="en",
            )

    def test_subtitles_require_language(self) -> None:
        with pytest.raises(ValueError):
            DownloadRequest(url="u", subtitle_mode=SubtitleMode.EXTERNAL)


class TestAudioTrack:
    def test_is_simple_value_object(self) -> None:
        assert AudioTrack("en", "English").language == "en"
