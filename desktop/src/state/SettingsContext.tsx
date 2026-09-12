import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import { getNova } from "../lib/electron";
import type { Settings } from "../lib/types";
import { useToast } from "./ToastContext";

interface SettingsApi {
  settings: Settings | null;
  update(patch: Partial<Settings>): Promise<void>;
  reset(): Promise<void>;
  reload(): Promise<void>;
}

const SettingsContext = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const toast = useToast();

  const reload = useCallback(async () => {
    try {
      setSettings(await api.getSettings());
    } catch (err) {
      toast.error("Could not load settings", api.errorMessage(err));
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((current) => (current ? { ...current, ...patch } : current));
      try {
        setSettings(await api.saveSettings(patch));
      } catch (err) {
        toast.error("Could not save settings", api.errorMessage(err));
        try {
          setSettings(await api.getSettings());
        } catch {
          /* leave optimistic state in place */
        }
      }
    },
    [toast],
  );

  const reset = useCallback(async () => {
    try {
      setSettings(await api.resetSettings());
      toast.success("Settings reset", "Defaults restored (folder and API kept).");
    } catch (err) {
      toast.error("Could not reset settings", api.errorMessage(err));
    }
  }, [toast]);

  // forward behaviour flags that the Electron shell implements natively
  useEffect(() => {
    const nova = getNova();
    if (!nova || !settings) return;
    nova.setMinimizeToTray(settings.minimize_to_tray);
    nova.setClipboardMonitor(settings.clipboard_monitor);
  }, [settings]);

  const value = useMemo<SettingsApi>(() => ({ settings, update, reset, reload }), [settings, update, reset, reload]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
