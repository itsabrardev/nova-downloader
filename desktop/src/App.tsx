import { useEffect, useState } from "react";
import { Background } from "./components/Background";
import { Sidebar } from "./components/Sidebar";
import type { Page } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { bootstrapApi } from "./lib/api";
import { DownloadsPage } from "./pages/DownloadsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { SettingsPage } from "./pages/SettingsPage";
import { DownloadsProvider } from "./state/DownloadsContext";
import { SettingsProvider } from "./state/SettingsContext";
import { ToastProvider } from "./state/ToastContext";

export default function App() {
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [analyzeRequest, setAnalyzeRequest] = useState<{ url: string; nonce: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void bootstrapApi().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestAnalyze = (url: string) => {
    setAnalyzeRequest({ url, nonce: Date.now() });
    setPage("home");
  };

  if (!ready) {
    return <div className="boot-screen">Starting NovaDownloader…</div>;
  }

  return (
    <ToastProvider>
      <SettingsProvider>
        <DownloadsProvider>
          <div className="app">
            <Background />
            <TitleBar />
            <div className="app-body">
              <Sidebar page={page} onNavigate={setPage} />
              <main className="page">
                {page === "home" && <HomePage analyzeRequest={analyzeRequest} onNavigate={setPage} />}
                {page === "downloads" && <DownloadsPage />}
                {page === "history" && <HistoryPage onRedownload={requestAnalyze} />}
                {page === "settings" && <SettingsPage />}
              </main>
            </div>
          </div>
        </DownloadsProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
