import type {
  DownloadBody,
  DownloadTask,
  HistoryRow,
  MediaInfo,
  Settings,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

let token = "";

/** Fetch the pairing token so mutating requests pass the backend check. */
export async function bootstrapApi(): Promise<void> {
  try {
    const res = await fetch("/api/pairing");
    if (res.ok) {
      const data = await res.json();
      token = data.token || "";
    }
  } catch {
    /* backend not up yet — requests will surface clear errors */
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["X-Nova-Token"] = token;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    let code: string | undefined;
    try {
      const data = await res.json();
      message = data?.error?.message || message;
      code = data?.error?.code;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code);
  }
  return (await res.json()) as T;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export const api = {
  errorMessage,
  status: () => request<{ ok: boolean; version: string; queue: { active: number; queued: number } }>("GET", "/api/status"),
  analyze: (url: string) => request<MediaInfo>("POST", "/api/analyze", { url }),
  download: (body: DownloadBody) => request<{ id: number; status: string }>("POST", "/api/download", body),
  downloads: () => request<{ tasks: DownloadTask[]; total: number }>("GET", "/api/downloads?limit=100"),
  taskAction: (id: number, action: "pause" | "resume" | "cancel" | "retry") =>
    request<{ ok: boolean }>("POST", `/api/download/${id}/${action}`),
  pauseAll: () => request<{ ok: boolean; count: number }>("POST", "/api/downloads/pause_all"),
  resumeAll: () => request<{ ok: boolean; count: number }>("POST", "/api/downloads/resume_all"),
  getSettings: () => request<Settings>("GET", "/api/settings"),
  saveSettings: (patch: Partial<Settings>) => request<Settings>("PUT", "/api/settings", patch),
  resetSettings: () => request<Settings>("POST", "/api/settings/reset"),
  history: (params: { search?: string; statuses?: string[]; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.statuses?.length) qs.set("statuses", params.statuses.join(","));
    qs.set("limit", String(params.limit ?? 100));
    if (params.offset) qs.set("offset", String(params.offset));
    return request<{ rows: HistoryRow[]; total: number }>("GET", `/api/history?${qs.toString()}`);
  },
  clearHistory: (statuses?: string[]) =>
    request<{ ok: boolean; removed: number }>(
      "DELETE",
      `/api/history${statuses?.length ? `?statuses=${statuses.join(",")}` : ""}`,
    ),
  openHistoryFile: (id: number) => request<{ ok: boolean }>("POST", `/api/history/${id}/open`),
  revealHistoryFile: (id: number) => request<{ ok: boolean }>("POST", `/api/history/${id}/reveal`),
};
