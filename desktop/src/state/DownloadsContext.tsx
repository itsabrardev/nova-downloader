import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import type { DownloadTask, SpeedSample } from "../lib/types";
import { useSettings } from "./SettingsContext";
import { useToast } from "./ToastContext";

const POLL_MS = 800;
const SAMPLE_WINDOW_MS = 65_000;
const ACTIVE_STATUSES = new Set(["downloading", "analyzing", "processing"]);

interface DownloadsApi {
  tasks: DownloadTask[];
  samples: Map<number, SpeedSample[]>;
  connected: boolean;
  activeCount: number;
  queuedCount: number;
  refresh(): void;
  pause(id: number): Promise<void>;
  resume(id: number): Promise<void>;
  cancel(id: number): Promise<void>;
  retry(id: number): Promise<void>;
  pauseAll(): Promise<void>;
  resumeAll(): Promise<void>;
}

const DownloadsContext = createContext<DownloadsApi | null>(null);

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [samples, setSamples] = useState<Map<number, SpeedSample[]>>(() => new Map());
  const [connected, setConnected] = useState(false);
  const statusMap = useRef<Map<number, string>>(new Map());
  const settingsRef = useRef<{ notifications: boolean } | null>(null);
  const tickRef = useRef<() => void>(() => undefined);
  const toast = useToast();
  const { settings } = useSettings();

  useEffect(() => {
    settingsRef.current = settings ? { notifications: settings.notifications } : null;
  }, [settings]);

  const notify = useCallback(
    (title: string, body: string) => {
      toast.push("info", title, body);
      if (settingsRef.current?.notifications && typeof Notification !== "undefined") {
        try {
          if (Notification.permission === "granted") new Notification(title, { body });
          else if (Notification.permission !== "denied") {
            void Notification.requestPermission().then((permission) => {
              if (permission === "granted") new Notification(title, { body });
            });
          }
        } catch {
          /* notifications unsupported — toasts are enough */
        }
      }
    },
    [toast],
  );

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const { tasks: fresh } = await api.downloads();
        if (stopped) return;
        setConnected(true);

        const previous = statusMap.current;
        for (const task of fresh) {
          const before = previous.get(task.id);
          if (before && before !== task.status) {
            if (task.status === "completed") notify("Download completed", task.title);
            else if (task.status === "failed") {
              notify(`Download failed: ${task.title}`, task.error_message || "The download failed.");
            }
          }
        }
        statusMap.current = new Map(fresh.map((task) => [task.id, task.status]));
        setTasks(fresh);

        const now = Date.now();
        setSamples((current) => {
          const next = new Map(current);
          for (const task of fresh) {
            if (task.status === "downloading") {
              const window = (next.get(task.id) ?? []).filter((sample) => sample.t >= now - SAMPLE_WINDOW_MS);
              window.push({ t: now, speed: task.speed });
              next.set(task.id, window);
            } else if (task.status !== "paused") {
              next.delete(task.id);
            }
          }
          return next;
        });
      } catch {
        if (!stopped) setConnected(false);
      } finally {
        if (!stopped) timer = window.setTimeout(tick, POLL_MS);
      }
    };

    tickRef.current = () => {
      if (timer) window.clearTimeout(timer);
      void tick();
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [notify]);

  const refresh = useCallback(() => tickRef.current(), []);

  const runAction = useCallback(
    async (id: number, action: "pause" | "resume" | "cancel" | "retry") => {
      try {
        await api.taskAction(id, action);
        refresh();
      } catch (err) {
        toast.error(`Could not ${action} download`, api.errorMessage(err));
      }
    },
    [refresh, toast],
  );

  const runBulk = useCallback(
    async (action: "pause_all" | "resume_all") => {
      try {
        const result = await (action === "pause_all" ? api.pauseAll() : api.resumeAll());
        refresh();
        const verb = action === "pause_all" ? "Paused" : "Resumed";
        toast.success(`${verb} ${result.count} download${result.count === 1 ? "" : "s"}`);
      } catch (err) {
        toast.error("Bulk action failed", api.errorMessage(err));
      }
    },
    [refresh, toast],
  );

  const { activeCount, queuedCount } = useMemo(() => {
    let active = 0;
    let queued = 0;
    for (const task of tasks) {
      if (ACTIVE_STATUSES.has(task.status)) active++;
      else if (task.status === "queued") queued++;
    }
    return { activeCount: active, queuedCount: queued };
  }, [tasks]);

  const value = useMemo<DownloadsApi>(
    () => ({
      tasks,
      samples,
      connected,
      activeCount,
      queuedCount,
      refresh,
      pause: (id) => runAction(id, "pause"),
      resume: (id) => runAction(id, "resume"),
      cancel: (id) => runAction(id, "cancel"),
      retry: (id) => runAction(id, "retry"),
      pauseAll: () => runBulk("pause_all"),
      resumeAll: () => runBulk("resume_all"),
    }),
    [tasks, samples, connected, activeCount, queuedCount, refresh, runAction, runBulk],
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}

export function useDownloads(): DownloadsApi {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error("useDownloads must be used inside DownloadsProvider");
  return ctx;
}
