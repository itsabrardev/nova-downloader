import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { getNova } from "../lib/electron";

export function TitleBar() {
  const nova = getNova();
  const [version, setVersion] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .status()
      .then((info) => {
        if (!cancelled) setVersion(info.version);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
          <path d="M8 4.5v7M5.4 8.9 8 11.5l2.6-2.6" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="titlebar-name">NovaDownloader</span>
        {version && <span className="titlebar-version">v{version}</span>}
      </div>
      {nova && (
        <div className="titlebar-actions">
          <button type="button" className="win-btn" title="Minimize" onClick={() => nova.minimize()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" /></svg>
          </button>
          <button type="button" className="win-btn" title="Maximize" onClick={() => nova.toggleMaximize()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
          </button>
          <button type="button" className="win-btn win-close" title="Close" onClick={() => nova.close()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
          </button>
        </div>
      )}
    </header>
  );
}
