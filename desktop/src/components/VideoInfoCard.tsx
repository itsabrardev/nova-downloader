import { useEffect, useMemo, useState } from "react";
import { formatBytes, formatDuration, languageLabel } from "../lib/format";
import type { DownloadBody, MediaFormat, MediaInfo } from "../lib/types";
import { GlassCard } from "./GlassCard";
import { PillSelector } from "./PillSelector";

const TIER_HEIGHTS: Record<string, number> = {
  "360p": 360, "480p": 480, "720p": 720, "1080p": 1080, "1440p": 1440,
  "4k": 2160, "4K": 2160, "8k": 4320, "8K": 4320,
};

const VIDEO_CONTAINERS = ["mp4", "mkv", "webm"] as const;

type SubMode = "none" | "external" | "embedded";

function pickSize(format: MediaFormat | undefined, duration: number | null): { bytes: number | null; approx: boolean } {
  if (!format) return { bytes: null, approx: false };
  if (format.filesize) return { bytes: format.filesize, approx: false };
  if (format.tbr && duration) return { bytes: (format.tbr * 1000 / 8) * duration, approx: true };
  return { bytes: null, approx: false };
}

/** Best-effort "what will I download" estimate from real format metadata. */
function estimateSize(media: MediaInfo, quality: string): string {
  const videoFormats = media.formats.filter((f) => f.kind !== "audio");
  const audioFormats = media.formats.filter((f) => f.kind === "audio");
  const byQuality = (a: MediaFormat, b: MediaFormat) =>
    (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0);

  if (quality.toLowerCase() === "audio") {
    const best = [...audioFormats].sort(byQuality)[0];
    const { bytes, approx } = pickSize(best, media.duration);
    return bytes === null ? "—" : `${approx ? "~" : ""}${formatBytes(bytes)}`;
  }

  const cap = quality.toLowerCase() === "best" ? Infinity : TIER_HEIGHTS[quality] ?? Infinity;
  const bestVideo = [...videoFormats].filter((f) => (f.height ?? 0) <= cap).sort(byQuality)[0];
  if (!bestVideo) return "—";

  let { bytes, approx } = pickSize(bestVideo, media.duration);
  if (bestVideo.kind !== "combined") {
    const bestAudio = [...audioFormats].sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0))[0];
    const audioSize = pickSize(bestAudio, media.duration);
    bytes = bytes === null ? null : bytes + (audioSize.bytes ?? 0);
    approx = approx || audioSize.approx;
  }
  return bytes === null ? "—" : `${approx ? "~" : ""}${formatBytes(bytes)}`;
}

export function VideoInfoCard({
  media,
  onDownload,
}: {
  media: MediaInfo;
  onDownload: (body: DownloadBody) => void;
}) {
  const [quality, setQuality] = useState(media.qualities[0] ?? "best");
  const [container, setContainer] = useState<string>("mp4");
  const [audioLanguage, setAudioLanguage] = useState("original");
  const [subMode, setSubMode] = useState<SubMode>("none");
  const defaultSub = useMemo(
    () => media.subtitles.find((s) => !s.auto)?.language ?? media.subtitles[0]?.language ?? "",
    [media],
  );
  const [subLang, setSubLang] = useState(defaultSub);

  const isAudioOnly = quality.toLowerCase() === "audio";

  // keep container compatible with the selected quality tier
  useEffect(() => {
    if (isAudioOnly && container !== "mp3") setContainer("mp3");
    if (!isAudioOnly && container === "mp3") setContainer("mp4");
  }, [isAudioOnly, container]);

  const estimate = estimateSize(media, quality);
  const host = (() => {
    try {
      return new URL(media.url).host;
    } catch {
      return media.url;
    }
  })();

  const download = () =>
    onDownload({
      url: media.url,
      quality: quality.toLowerCase(),
      format: container,
      audio_language: audioLanguage,
      subtitle_mode: subMode,
      subtitle_lang: subMode === "none" ? null : subLang,
    });

  return (
    <GlassCard className="video-info">
      <div className="video-info-head">
        <div className="video-thumb">
          {media.thumbnail ? (
            <img
              src={media.thumbnail}
              alt=""
              loading="lazy"
              onError={(event) => {
                (event.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="video-thumb-placeholder">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="3" y="5" width="18" height="14" rx="2.5" />
                <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
              </svg>
            </div>
          )}
          {media.is_live && <span className="live-badge">LIVE</span>}
        </div>
        <div className="video-meta">
          <h3 className="video-title" title={media.title}>{media.title}</h3>
          <div className="video-sub">
            {media.uploader || "Unknown uploader"} · {formatDuration(media.duration)}
            {media.formats.length > 0 && ` · ${media.formats.length} formats`}
          </div>
          <div className="video-sub faint" title={media.url}>{host}</div>
        </div>
        <div className="video-estimate" title="Estimated from real format metadata">
          <span className="video-estimate-size">{estimate}</span>
          <span className="video-estimate-label">estimated</span>
        </div>
      </div>

      <div className="video-options">
        <PillSelector
          label="Quality"
          options={media.qualities.map((q) => ({ value: q, label: q }))}
          value={quality}
          onChange={setQuality}
        />
        <PillSelector
          label="Format"
          options={(isAudioOnly ? ["mp3"] : [...VIDEO_CONTAINERS]).map((c) => ({
            value: c,
            label: c.toUpperCase(),
          }))}
          value={container}
          onChange={setContainer}
        />
        {media.audio_tracks.length > 1 && (
          <PillSelector
            label="Audio"
            options={media.audio_tracks.map((track) => ({
              value: track.language,
              label: track.label || languageLabel(track.language),
            }))}
            value={audioLanguage}
            onChange={setAudioLanguage}
          />
        )}
        {media.subtitles.length > 0 && (
          <>
            <PillSelector<SubMode>
              label="Subtitles"
              options={[
                { value: "none", label: "None" },
                { value: "external", label: "External file" },
                { value: "embedded", label: "Embedded", disabled: container === "mp3", title: "Not available for MP3" },
              ]}
              value={subMode}
              onChange={setSubMode}
            />
            {subMode !== "none" && (
              <label className="field sub-lang-field">
                <span className="pill-label">Subtitle language</span>
                <select
                  className="input select"
                  value={subLang}
                  onChange={(event) => setSubLang(event.target.value)}
                >
                  {media.subtitles.map((sub) => (
                    <option key={`${sub.language}-${sub.name}`} value={sub.language}>
                      {sub.name || languageLabel(sub.language)} ({sub.language}){sub.auto ? " · auto" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      </div>

      <div className="video-actions">
        <button type="button" className="btn primary large" onClick={download}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 15.5h12" />
          </svg>
          Download
        </button>
        <span className="video-note">
          {media.is_live
            ? "Live stream — availability depends on the site."
            : isAudioOnly
              ? "Audio-only MP3 extraction"
              : `Saved to your download folder as ${container.toUpperCase()}`}
        </span>
      </div>
    </GlassCard>
  );
}
