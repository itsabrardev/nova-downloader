import type { TaskStatus } from "./types";

/** Formatting helpers mirroring core.utils (Python) so the UI matches 1:1. */

export function formatBytes(numBytes: number | null | undefined): string {
  if (numBytes === null || numBytes === undefined || numBytes < 0) return "—";
  let value = Number(numBytes);
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  for (const unit of units) {
    if (value < 1024 || unit === "PB") {
      return unit === "B" ? `${Math.round(value)} ${unit}` : `${value.toFixed(1)} ${unit}`;
    }
    value /= 1024;
  }
  return `${value.toFixed(1)} PB`;
}

export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "—";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) return "—";
  const total = Math.round(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German",
  bn: "Bengali", hi: "Hindi", ja: "Japanese", ko: "Korean",
  zh: "Chinese", ar: "Arabic", ru: "Russian", pt: "Portuguese",
  ur: "Urdu", tr: "Turkish", it: "Italian", id: "Indonesian",
  nl: "Dutch", pl: "Polish", sv: "Swedish", th: "Thai",
  vi: "Vietnamese", fa: "Persian", ta: "Tamil", te: "Telugu",
  mr: "Marathi", ml: "Malayalam", pa: "Punjabi", gu: "Gujarati",
  kn: "Kannada", or: "Odia", ne: "Nepali", si: "Sinhala",
  my: "Burmese", km: "Khmer", fil: "Filipino", ms: "Malay",
  he: "Hebrew", uk: "Ukrainian", cs: "Czech", ro: "Romanian",
  hu: "Hungarian", el: "Greek", da: "Danish", fi: "Finnish", no: "Norwegian",
};

export function languageLabel(code: string | null | undefined): string {
  if (!code || code.toLowerCase() === "original") return "Original";
  const base = code.replace("_", "-").split("-")[0].toLowerCase();
  return LANGUAGE_NAMES[base] || LANGUAGE_NAMES[code.toLowerCase()] || code.toUpperCase();
}

export const STATUS_COLORS: Record<TaskStatus, string> = {
  completed: "var(--success)",
  failed: "var(--danger)",
  cancelled: "var(--text-faint)",
  paused: "var(--warning)",
  downloading: "var(--accent)",
  processing: "var(--cyan)",
  analyzing: "var(--cyan)",
  queued: "var(--text-dim)",
};

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
    case "paused": return "Paused";
    case "downloading": return "Downloading";
    case "processing": return "Processing";
    case "analyzing": return "Analyzing";
    default: return "Queued";
  }
}
