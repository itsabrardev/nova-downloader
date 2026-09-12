import { useDownloads } from "../state/DownloadsContext";

export type Page = "home" | "downloads" | "history" | "settings";

const NAV: { page: Page; label: string; icon: JSX.Element }[] = [
  {
    page: "home",
    label: "Home",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5 10 3.5l7 6" />
        <path d="M5.5 9v7h9V9" />
      </svg>
    ),
  },
  {
    page: "downloads",
    label: "Downloads",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 3v9" />
        <path d="M6.5 8.5 10 12l3.5-3.5" />
        <path d="M4 15.5h12" />
      </svg>
    ),
  },
  {
    page: "history",
    label: "History",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l2.8 2" />
      </svg>
    ),
  },
  {
    page: "settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="2.6" />
        <path d="M10 2.8v2.4M10 14.8v2.4M2.8 10h2.4M14.8 10h2.4M4.9 4.9l1.7 1.7M13.4 13.4l1.7 1.7M15.1 4.9l-1.7 1.7M6.6 13.4l-1.7 1.7" />
      </svg>
    ),
  },
];

export function Sidebar({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  const { activeCount } = useDownloads();

  return (
    <nav className="sidebar">
      <div className="sidebar-nav">
        {NAV.map((item) => (
          <button
            key={item.page}
            type="button"
            className={`nav-item ${page === item.page ? "active" : ""}`}
            onClick={() => onNavigate(item.page)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.page === "downloads" && activeCount > 0 && <span className="nav-badge">{activeCount}</span>}
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        Only download content you own or are allowed to save.
      </div>
    </nav>
  );
}
