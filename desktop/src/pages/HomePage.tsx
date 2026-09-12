import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "../components/GlassCard";
import { UrlInput } from "../components/UrlInput";
import type { Page } from "../components/Sidebar";
import { VideoInfoCard } from "../components/VideoInfoCard";
import { api } from "../lib/api";
import { getNova } from "../lib/electron";
import type { DownloadBody, MediaInfo } from "../lib/types";
import { useToast } from "../state/ToastContext";

export function HomePage({
  analyzeRequest,
  onNavigate,
}: {
  analyzeRequest: { url: string; nonce: number } | null;
  onNavigate: (page: Page) => void;
}) {
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState("");
  const toast = useToast();

  const analyze = useCallback(
    async (url: string) => {
      setBusy(true);
      setMedia(null);
      try {
        setMedia(await api.analyze(url));
      } catch (err) {
        toast.error("Analysis failed", api.errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (analyzeRequest) void analyze(analyzeRequest.url);
  }, [analyzeRequest, analyze]);

  // clipboard link detection (Electron shell only, debounced in main)
  useEffect(() => {
    const nova = getNova();
    if (!nova) return;
    let timer: number | undefined;
    nova.onClipboardUrl((url) => {
      setClipboardUrl(url);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setClipboardUrl(""), 15000);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const startDownload = async (body: DownloadBody) => {
    try {
      await api.download(body);
      toast.success("Added to queue", media?.title ?? body.url);
      onNavigate("downloads");
    } catch (err) {
      toast.error("Could not start download", api.errorMessage(err));
    }
  };

  return (
    <div className="page-inner">
      <div className="home-headline">
        <h1>Grab any video you're allowed to.</h1>
        <p>Paste a link, pick quality, format, audio language and subtitles — NovaDownloader does the rest.</p>
      </div>

      {clipboardUrl && (
        <GlassCard className="clipboard-banner">
          <span className="clipboard-icon">🔗</span>
          <div className="clipboard-text">
            <strong>Video URL detected in clipboard</strong>
            <span title={clipboardUrl}>{clipboardUrl}</span>
          </div>
          <button
            type="button"
            className="btn primary small"
            onClick={() => {
              const url = clipboardUrl;
              setClipboardUrl("");
              void analyze(url);
            }}
          >
            Analyze
          </button>
          <button type="button" className="btn ghost small" onClick={() => setClipboardUrl("")}>
            Ignore
          </button>
        </GlassCard>
      )}

      <UrlInput busy={busy} onAnalyze={(url) => void analyze(url)} />

      {media && <VideoInfoCard key={media.url} media={media} onDownload={(body) => void startDownload(body)} />}

      {busy && (
        <div className="analyzing-hint">
          <span className="spinner" /> Reading real metadata from the page…
        </div>
      )}

      {!media && !busy && (
        <div className="tips">
          <span className="tips-title">Tips</span>
          <ul>
            <li>Only download content you own or are allowed to save.</li>
            <li>The clipboard monitor can catch copied links (enable it in Settings).</li>
            <li>The Chrome extension sends pages here with one click.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
