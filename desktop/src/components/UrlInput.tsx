import { useState } from "react";

export function UrlInput({
  busy,
  onAnalyze,
}: {
  busy: boolean;
  onAnalyze: (url: string) => void;
}) {
  const [url, setUrl] = useState("");

  const submit = () => {
    const candidate = url.trim();
    if (!candidate || busy) return;
    if (!/^https?:\/\/\S+\.\S+/i.test(candidate)) return; // backend re-validates
    onAnalyze(candidate);
  };

  return (
    <div className="url-input">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6.5 9.5 9.5 6.5" />
        <path d="M5 11a2.5 2.5 0 0 1 0-3.5l1.5-1.5a2.5 2.5 0 0 1 3.5 3.5L9.2 10.3" />
        <path d="M11 5a2.5 2.5 0 0 1 3.5 3.5L13 10a2.5 2.5 0 0 1-3.5 0" />
      </svg>
      <input
        type="url"
        spellCheck={false}
        placeholder="Paste a video page link (https://…)"
        value={url}
        autoFocus
        disabled={busy}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
      />
      <button type="button" className="btn primary" onClick={submit} disabled={busy || !url.trim()}>
        {busy ? "Analyzing…" : "Analyze"}
      </button>
    </div>
  );
}
