import type { TaskStatus } from "../lib/types";

export function ProgressBar({ value, status }: { value: number; status: TaskStatus }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={`progress status-${status}`}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
