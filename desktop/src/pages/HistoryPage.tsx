import { useCallback, useEffect, useState } from "react";
import { PillSelector } from "../components/PillSelector";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatBytes, formatDate, languageLabel } from "../lib/format";
import type { HistoryRow } from "../lib/types";
import { useToast } from "../state/ToastContext";

type FilterKey = "all" | "completed" | "failed" | "cancelled";

const FILTER_STATUSES: Record<FilterKey, string[] | null> = {
  all: null,
  completed: ["completed"],
  failed: ["failed"],
  cancelled: ["cancelled"],
};

const PAGE_SIZE = 100;

export function HistoryPage({ onRedownload }: { onRedownload: (url: string) => void }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [nonce, setNonce] = useState(0);
  const toast = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchDraft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const load = useCallback(
    async (offset: number) => {
      try {
        const data = await api.history({
          search: search || undefined,
          statuses: FILTER_STATUSES[filter] ?? undefined,
          limit: PAGE_SIZE,
          offset,
        });
        setRows((current) => (offset === 0 ? data.rows : [...current, ...data.rows]));
        setTotal(data.total);
      } catch (err) {
        toast.error("Could not load history", api.errorMessage(err));
      }
    },
    [filter, search, toast],
  );

  useEffect(() => {
    void load(0);
  }, [load, nonce]);

  // light refresh so finished downloads appear without manual reload
  useEffect(() => {
    const timer = window.setInterval(() => setNonce((n) => n + 1), 6000);
    return () => window.clearInterval(timer);
  }, []);

  const clearHistory = async () => {
    if (!window.confirm("Delete all completed, failed and cancelled history entries?")) return;
    try {
      const result = await api.clearHistory();
      toast.success("History cleared", `${result.removed} ${result.removed === 1 ? "entry" : "entries"} removed.`);
      setNonce((n) => n + 1);
    } catch (err) {
      toast.error("Could not clear history", api.errorMessage(err));
    }
  };

  const openFile = async (row: HistoryRow) => {
    try {
      await api.openHistoryFile(row.id);
    } catch (err) {
      toast.error("Could not open file", api.errorMessage(err));
    }
  };

  const revealFile = async (row: HistoryRow) => {
    try {
      await api.revealHistoryFile(row.id);
    } catch (err) {
      toast.error("Could not reveal file", api.errorMessage(err));
    }
  };

  return (
    <div className="page-inner wide">
      <div className="page-header">
        <div>
          <h1>History</h1>
          <p className="page-subtitle">{total} {total === 1 ? "entry" : "entries"} in the local database</p>
        </div>
        <div className="page-actions">
          <input
            className="input search"
            type="search"
            placeholder="Search title, uploader, URL…"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <button type="button" className="btn ghost danger" onClick={() => void clearHistory()}>
            Clear
          </button>
        </div>
      </div>

      <PillSelector<FilterKey>
        options={[
          { value: "all", label: "All" },
          { value: "completed", label: "Completed" },
          { value: "failed", label: "Failed" },
          { value: "cancelled", label: "Cancelled" },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>Nothing here yet.</p>
          <p className="faint">Finished downloads show up in this list.</p>
        </div>
      ) : (
        <div className="history-list">
          {rows.map((row) => {
            const hasFile = !!row.file_path && row.status === "completed";
            return (
              <article key={row.id} className="history-row">
                <div className="download-thumb">
                  {row.thumbnail_url ? (
                    <img
                      src={row.thumbnail_url}
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
                <div className="history-main">
                  <div className="history-title-line">
                    <span className="download-title" title={row.title ?? row.url}>{row.title ?? row.url}</span>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="download-meta">
                    {row.quality ?? "—"} · {(row.container ?? "?").toUpperCase()} · {languageLabel(row.audio_language)}
                    {row.subtitle_mode && row.subtitle_mode !== "none" && row.subtitle_lang ? ` · subs ${row.subtitle_lang}` : ""}
                  </div>
                  <div className="history-dates">
                    {formatDate(row.created_at)} · {row.total_bytes ? formatBytes(row.total_bytes) : "—"}
                  </div>
                </div>
                <div className="history-actions">
                  <button type="button" className="btn ghost small" onClick={() => onRedownload(row.url)} title="Analyze again on the Home page">
                    Redownload
                  </button>
                  {hasFile && (
                    <>
                      <button type="button" className="btn ghost small" onClick={() => void openFile(row)}>
                        Open
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => void revealFile(row)}>
                        Show in folder
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
          {rows.length < total && (
            <button type="button" className="btn ghost load-more" onClick={() => void load(rows.length)}>
              Load more ({total - rows.length} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
