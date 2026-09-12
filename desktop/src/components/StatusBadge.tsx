import { STATUS_COLORS, statusLabel } from "../lib/format";
import type { TaskStatus } from "../lib/types";

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className="status-badge" style={{ color: STATUS_COLORS[status], borderColor: STATUS_COLORS[status] }}>
      {statusLabel(status)}
    </span>
  );
}
