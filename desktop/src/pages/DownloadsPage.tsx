import { DownloadCard } from "../components/DownloadCard";
import { useDownloads } from "../state/DownloadsContext";

export function DownloadsPage() {
  const { tasks, connected, activeCount, queuedCount, pauseAll, resumeAll } = useDownloads();

  return (
    <div className="page-inner wide">
      <div className="page-header">
        <div>
          <h1>Downloads</h1>
          <p className="page-subtitle">
            {connected ? (
              <>
                {activeCount} active · {queuedCount} queued
              </>
            ) : (
              <span className="error-text">Backend offline — reconnecting…</span>
            )}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn ghost" onClick={() => void pauseAll()}>
            Pause all
          </button>
          <button type="button" className="btn primary" onClick={() => void resumeAll()}>
            Resume all
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <svg width="42" height="42" viewBox="0 0 20 20" fill="none" stroke="var(--text-faint)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 15.5h12" />
          </svg>
          <p>No downloads yet.</p>
          <p className="faint">Analyze a link on the Home page to get started.</p>
        </div>
      ) : (
        <div className="download-list">
          {tasks.map((task) => (
            <DownloadCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
