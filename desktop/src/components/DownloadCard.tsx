import { useState } from "react";
import { api } from "../lib/api";
import { formatBytes, formatDuration, formatEta, formatSpeed, languageLabel } from "../lib/format";
import { getNova } from "../lib/electron";
import type { DownloadTask } from "../lib/types";
import { useDownloads } from "../state/DownloadsContext";
import { useToast } from "../state/ToastContext";
import { ProgressBar } from "./ProgressBar";
import { SpeedGraph } from "./SpeedGraph";
import { StatusBadge } from "./StatusBadge";

export function DownloadCard({ task }: { task: DownloadTask }) {
  const { samples, pause, resume, cancel, retry } = useDownloads();
  const toast = useToast();
  const [fileBusy, setFileBusy] = useState(false);

  const pct = Math.round(task.progress * 100);
  const graphSamples = samples.get(task.id) ?? [];
  const hasFile = task.status === "completed" && !!task.file_path;

  const openFile = async () => {
    setFileBusy(true);
    try {
      const nova = getNova();
      if (nova) await nova.openPath(task.file_path);
      else await api.openHistoryFile(task.id);
    } catch (err) {
      toast.error("Could not open file", api.errorMessage(err));
    } finally {
      setFileBusy(false);
    }
  };

  const revealFile = async () => {
    setFileBusy(true);
    try {
      const nova = getNova();
      if (nova) await nova.revealPath(task.file_path);
      else await api.revealHistoryFile(task.id);
    } catch (err) {
      toast.error("Could not reveal file", api.errorMessage(err));
    } finally {
      setFileBusy(false);
    }
  };

  let statusLine: string;
  switch (task.status) {
    case "downloading":
      statusLine = `${formatBytes(task.downloaded_bytes)} / ${formatBytes(task.total_bytes)} · ${formatSpeed(task.speed)} · ETA ${formatEta(task.eta)}`;
      break;
    case "analyzing":
      statusLine = "Fetching media info…";
      break;
    case "processing":
      statusLine = "Merging / converting with FFmpeg…";
      break;
    case "paused":
      statusLine = `Paused at ${pct}% · ${formatBytes(task.downloaded_bytes)} / ${formatBytes(task.total_bytes)}`;
      break;
    case "queued":
      statusLine = "Waiting for a free slot…";
      break;
    case "completed":
      statusLine = `${formatBytes(task.total_bytes)} · done in ${task.duration ? formatDuration(task.duration) + " video" : "queue time"}`;
      break;
    default:
      statusLine = task.error_message || "The download did not finish.";
  }

  return (
    <article className={`download-card status-${task.status}`}>
      <div className="download-thumb">
        {task.thumbnail ? (
          <img
            src={task.thumbnail}
            alt=""
            loading="lazy"
            onError={(event) => {
              (event.target as HTMLImageElement).style.visibility = "hidden";
            }}
          />
        ) : (
          <div className="video-thumb-placeholder small">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
            </svg>
          </div>
        )}
      </div>

      <div className="download-body">
        <div className="download-head">
          <span className="download-title" title={task.title}>{task.title}</span>
          <StatusBadge status={task.status} />
        </div>
        <div className="download-meta">
          {task.quality} · {task.container.toUpperCase()} · {languageLabel(task.audio_language)}
          {task.subtitle_mode !== "none" && task.subtitle_lang ? ` · subs ${task.subtitle_lang}` : ""}
          {task.uploader ? ` · ${task.uploader}` : ""}
        </div>
        <ProgressBar value={task.progress} status={task.status} />
        <div className={`download-stats ${task.status === "failed" ? "error-text" : ""}`}>{statusLine}</div>
        {task.status === "downloading" && graphSamples.length > 1 && <SpeedGraph samples={graphSamples} height={44} />}
      </div>

      <div className="download-actions">
        {(task.status === "downloading" || task.status === "analyzing" || task.status === "processing") && (
          <>
            <button type="button" className="btn ghost small" onClick={() => void pause(task.id)} title="Cooperative pause">
              Pause
            </button>
            <button type="button" className="btn ghost small danger" onClick={() => void cancel(task.id)}>
              Cancel
            </button>
          </>
        )}
        {task.status === "paused" && (
          <>
            <button type="button" className="btn primary small" onClick={() => void resume(task.id)}>
              Resume
            </button>
            <button type="button" className="btn ghost small danger" onClick={() => void cancel(task.id)}>
              Cancel
            </button>
          </>
        )}
        {task.status === "queued" && (
          <button type="button" className="btn ghost small danger" onClick={() => void cancel(task.id)}>
            Cancel
          </button>
        )}
        {(task.status === "failed" || task.status === "cancelled") && (
          <button type="button" className="btn primary small" onClick={() => void retry(task.id)}>
            Retry
          </button>
        )}
        {hasFile && (
          <>
            <button type="button" className="btn ghost small" disabled={fileBusy} onClick={() => void openFile()}>
              Open
            </button>
            <button type="button" className="btn ghost small" disabled={fileBusy} onClick={() => void revealFile()}>
              Show in folder
            </button>
          </>
        )}
      </div>
    </article>
  );
}
