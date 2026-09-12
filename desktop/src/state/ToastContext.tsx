import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ToastKind = "info" | "success" | "error" | "warning";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastApi {
  push(kind: ToastKind, title: string, message?: string): void;
  success(title: string, message?: string): void;
  error(title: string, message?: string): void;
  info(title: string, message?: string): void;
  warning(title: string, message?: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_AFTER_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-4), { id, kind, title, message }]);
      window.setTimeout(() => remove(id), DISMISS_AFTER_MS);
    },
    [remove],
  );

  const value = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, message) => push("success", title, message),
      error: (title, message) => push("error", title, message),
      info: (title, message) => push("info", title, message),
      warning: (title, message) => push("warning", title, message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-host" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`} onClick={() => remove(toast.id)}>
            <div className="toast-title">{toast.title}</div>
            {toast.message && <div className="toast-message">{toast.message}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
