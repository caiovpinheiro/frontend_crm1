import { cn } from "@/lib/utils";

import {
  STATUS_DOT,
  type AutomationRunStatus,
} from "./automations-data";

export function StatusDot({
  status,
  className,
}: {
  status: AutomationRunStatus;
  className?: string;
}) {
  const meta = STATUS_DOT[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]",
        className,
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", meta.dot)}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
