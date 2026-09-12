"""Tests for backend.subtitle_manager."""

from __future__ import annotations

import pytest

from backend.models import DownloadRequest, MediaInfo, SubtitleMode, SubtitleTrack
from backend.subtitle_manager import can_embed, subtitle_options


def media_with_subs(*tracks: SubtitleTrack) -> MediaInfo:
    return MediaInfo(url="u", title="t", subtitles=tracks)


MANUAL_EN = SubtitleTrack("en", "English", auto_captions=False)
AUTO_HI = SubtitleTrack("hi", "Hindi", auto_captions=True)
AUTO_EN = SubtitleTrack("en", "English", auto_captions=True)


class TestCanEmbed:
    def test_containers(self) -> None:
        assert can_embed("mp4")
        assert can_embed("mkv")
        assert can_embed("webm")
        assert not can_embed("mp3")


class TestSubtitleOptions:
    def test_none_mode(self) -> None:
        request = DownloadRequest(url="u", subtitle_mode=SubtitleMode.NONE)
        assert subtitle_options(request, media_with_subs(MANUAL_EN)) == ({}, [])

    def test_audio_container_ignores_subtitles(self) -> None:
        request = DownloadRequest(
            url="u", quality="audio", container="mp3",
            subtitle_mode=SubtitleMode.EXTERNAL, subtitle_lang="en",
        )
        assert subtitle_options(request, media_with_subs(MANUAL_EN)) == ({}, [])

    def test_external_manual(self) -> None:
        request = DownloadRequest(url="u", subtitle_mode=SubtitleMode.EXTERNAL, subtitle_lang="en")
        opts, postprocessors = subtitle_options(request, media_with_subs(MANUAL_EN, AUTO_HI))
        assert opts == {"writesubtitles": True, "subtitleslangs": ["en"]}
        assert postprocessors == []

    def test_auto_only_language_also_writes_automatic(self) -> None:
        request = DownloadRequest(url="u", subtitle_mode=SubtitleMode.EXTERNAL, subtitle_lang="hi")
        opts, _ = subtitle_options(request, media_with_subs(MANUAL_EN, AUTO_HI))
        assert opts == {"writeautomaticsub": True, "subtitleslangs": ["hi"]}

    def test_manual_and_auto_both_written_when_both_exist(self) -> None:
        request = DownloadRequest(url="u", subtitle_mode=SubtitleMode.EXTERNAL, subtitle_lang="en")
        opts, _ = subtitle_options(request, media_with_subs(MANUAL_EN, AUTO_EN))
        assert opts["writesubtitles"] is True
        assert opts["writeautomaticsub"] is True

    def test_embedded_mp4_adds_postprocessor(self) -> None:
        request = DownloadRequest(url="u", subtitle_mode=SubtitleMode.EMBEDDED, subtitle_lang="en")
        opts, postprocessors = subtitle_options(request, media_with_subs(MANUAL_EN))
        assert opts["writesubtitles"] is True
        assert postprocessors == [{"key": "FFmpegEmbedSubtitle"}]

    def test_rejects_unavailable_language(self) -> None:
        request = DownloadRequest(url="u", subtitle_mode=SubtitleMode.EXTERNAL, subtitle_lang="zz")
        with pytest.raises(ValueError, match="not available"):
            subtitle_options(request, media_with_subs(MANUAL_EN))
