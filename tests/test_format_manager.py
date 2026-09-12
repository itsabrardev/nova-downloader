"""Tests for backend.format_manager."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.format_manager import build_format_selector, build_ydl_options
from backend.models import (
    AudioTrack,
    DownloadRequest,
    FormatInfo,
    FormatKind,
    MediaInfo,
    SubtitleMode,
    SubtitleTrack,
)
from core.config import Config


def media_with(*heights: int, languages: tuple[str, ...] = ("en",)) -> MediaInfo:
    formats: list[FormatInfo] = []
    for height in heights:
        formats.append(
            FormatInfo(
                format_id=f"v{height}", kind=FormatKind.VIDEO, ext="mp4",
                vcodec="h264", height=height,
            )
        )
    for lang in languages:
        formats.append(
            FormatInfo(format_id=f"a{lang}", kind=FormatKind.AUDIO, ext="m4a",
                       acodec="aac", language=lang)
        )
    tracks = tuple(
        AudioTrack("original", "Original") if lang == "original" else AudioTrack(lang, lang)
        for lang in ("original", *languages)
    )
    return MediaInfo(url="u", title="t", formats=tuple(formats), audio_tracks=tracks)


class TestBuildFormatSelector:
    def test_best_mp4(self) -> None:
        request = DownloadRequest(url="u")
        assert build_format_selector(request, media_with(1080)) == "bv*[ext=mp4]+ba/bv*+ba/b"

    def test_1080p_mp4(self) -> None:
        request = DownloadRequest(url="u", quality="1080p")
        assert build_format_selector(request, media_with(2160, 1080)) == (
            "bv*[height<=1080][ext=mp4]+ba/bv*[height<=1080]+ba/b[height<=1080]"
        )

    def test_mkv_has_no_ext_preference(self) -> None:
        request = DownloadRequest(url="u", quality="best", container="mkv")
        assert build_format_selector(request, media_with(720)) == "bv*+ba/b"

    def test_720p_webm(self) -> None:
        request = DownloadRequest(url="u", quality="720p", container="webm")
        assert build_format_selector(request, media_with(720)) == (
            "bv*[height<=720][ext=webm]+ba/bv*[height<=720]+ba/b[height<=720]"
        )

    def test_audio_only_with_language(self) -> None:
        request = DownloadRequest(url="u", quality="audio", container="mp3", audio_language="bn")
        assert build_format_selector(request, media_with(1080, languages=("en", "bn"))) == (
            "ba[language=bn]/ba/b"
        )

    def test_audio_only_mp4_prefers_m4a(self) -> None:
        request = DownloadRequest(url="u", quality="audio", container="mp4")
        assert build_format_selector(request, media_with(1080)) == "ba[ext=m4a]/ba/b"

    def test_audio_only_mp4_with_language(self) -> None:
        request = DownloadRequest(url="u", quality="audio", container="mp4", audio_language="bn")
        assert build_format_selector(request, media_with(1080, languages=("en", "bn"))) == (
            "ba[ext=m4a][language=bn]/ba[language=bn]/b"
        )

    def test_audio_only_webm_prefers_webm(self) -> None:
        request = DownloadRequest(url="u", quality="audio", container="webm")
        assert build_format_selector(request, media_with(1080)) == "ba[ext=webm]/ba/b"

    def test_audio_only_mkv_accepts_any_ext(self) -> None:
        request = DownloadRequest(url="u", quality="audio", container="mkv")
        assert build_format_selector(request, media_with(1080)) == "ba/b"

    def test_audio_only_original(self) -> None:
        request = DownloadRequest(url="u", quality="audio")
        assert build_format_selector(request, media_with(1080)) == "ba[ext=m4a]/ba/b"

    def test_merge_with_language_prefers_it_atomically(self) -> None:
        request = DownloadRequest(url="u", quality="1080p", audio_language="bn")
        # Language preference applies to BOTH merge alternatives; the
        # combined-format fallback is the safety net if it vanishes.
        assert build_format_selector(request, media_with(1080, languages=("en", "bn"))) == (
            "bv*[height<=1080][ext=mp4]+ba[language=bn]/"
            "bv*[height<=1080]+ba[language=bn]/b[height<=1080]"
        )

    def test_rejects_unavailable_quality(self) -> None:
        request = DownloadRequest(url="u", quality="4k")
        with pytest.raises(ValueError, match="not available"):
            build_format_selector(request, media_with(1080))

    def test_rejects_unavailable_language(self) -> None:
        request = DownloadRequest(url="u", audio_language="fr")
        with pytest.raises(ValueError, match="not available"):
            build_format_selector(request, media_with(1080, languages=("en",)))


class TestBuildYdlOptions:
    def test_core_download_options(self, tmp_path: Path) -> None:
        config = Config(connections=8, retries=3)
        opts = build_ydl_options(
            DownloadRequest(url="https://x/1"), media_with(1080),
            config=config, ffmpeg_path=Path("C:/f/ffmpeg.exe"), download_dir=tmp_path,
        )
        assert opts["format"] == "bv*[ext=mp4]+ba/bv*+ba/b"
        assert opts["merge_output_format"] == "mp4"
        assert opts["concurrent_fragment_downloads"] == 8
        assert opts["retries"] == 3
        assert opts["continuedl"] is True
        assert opts["noplaylist"] is True
        assert opts["ffmpeg_location"] == str(Path("C:/f/ffmpeg.exe"))
        assert str(tmp_path) in opts["outtmpl"]
        assert "ratelimit" not in opts  # unlimited by default

    def test_speed_limit_translated_to_bytes(self, tmp_path: Path) -> None:
        config = Config(speed_limit_kbps=1024)
        opts = build_ydl_options(
            DownloadRequest(url="u"), media_with(1080),
            config=config, ffmpeg_path=None, download_dir=tmp_path,
        )
        assert opts["ratelimit"] == 1024 * 1024

    def test_mp3_gets_extract_postprocessor_and_no_merge(self, tmp_path: Path) -> None:
        request = DownloadRequest(url="u", quality="audio", container="mp3")
        opts = build_ydl_options(
            request, media_with(1080), config=Config(), ffmpeg_path=None, download_dir=tmp_path,
        )
        assert "merge_output_format" not in opts
        assert opts["postprocessors"] == [
            {"key": "FFmpegExtractAudio", "codec": "mp3", "preferredquality": "0"}
        ]

    def test_external_subtitles(self, tmp_path: Path) -> None:
        media = MediaInfo(
            url="u", title="t", formats=media_with(1080).formats,
            subtitles=(SubtitleTrack("en", "English", auto_captions=False),),
        )
        request = DownloadRequest(url="u", subtitle_mode=SubtitleMode.EXTERNAL, subtitle_lang="en")
        opts = build_ydl_options(
            request, media, config=Config(), ffmpeg_path=None, download_dir=tmp_path,
        )
        assert opts["writesubtitles"] is True
        assert opts["subtitleslangs"] == ["en"]
        assert "postprocessors" not in opts

    def test_embedded_subtitles(self, tmp_path: Path) -> None:
        media = MediaInfo(
            url="u", title="t", formats=media_with(1080).formats,
            subtitles=(SubtitleTrack("en", "English", auto_captions=False),),
        )
        request = DownloadRequest(url="u", subtitle_mode=SubtitleMode.EMBEDDED, subtitle_lang="en")
        opts = build_ydl_options(
            request, media, config=Config(), ffmpeg_path=None, download_dir=tmp_path,
        )
        assert opts["postprocessors"] == [{"key": "FFmpegEmbedSubtitle"}]
