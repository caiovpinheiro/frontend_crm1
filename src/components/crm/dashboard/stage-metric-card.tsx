"use client";

import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { DashboardNavSurface } from "@/features/dashboard-v2/components/dashboard-nav-surface";
import { formatBRL, formatNumber } from "@/features/dashboard-v2/format";
import type { PainelFunnelStage, PainelFunnelUserRow } from "@/features/dashboard-v2/painel-api";
import { cn } from "@/lib/utils";

import { SalsichaBar } from "./salsicha-bar";

function deltaClass(n: number) {
  if (n > 0) return "text-[var(--color-success)]";
  if (n < 0) return "text-destructive";
  return "text-muted-foreground";
}

function formatDelta(n: number) {
  if (n > 0) return `+${n}`;
  return String(n);
}

export function StageMetricCard({
  stage,
  href,
  users,
}: {
  stage: PainelFunnelStage;
  href?: string;
  users: PainelFunnelUserRow[];
}) {
  const max = Math.max(1, ...users.map((u) => u.count));
  const body = (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {stage.name}
          </h3>
          <p className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums text-primary">
            {formatNumber(stage.count)}
          </p>
          <p className="mt-1 text-sm tabular-nums text-foreground">{formatBRL(stage.value)}</p>
        </div>
        <p className={cn("shrink-0 text-[11px] font-semibold tabular-nums", deltaClass(stage.todayDelta))}>
          {stage.todayDelta > 0 ? `+${stage.todayDelta}` : stage.todayDelta} hoje
        </p>
      </header>
      <ul
        data-dashboard-no-drag
        className="mt-4 flex max-h-72 flex-col gap-2.5 overflow-y-auto pr-1"
      >
        {users.map((user) => (
          <li key={user.id}>
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="min-w-0 truncate font-semibold">
                {user.name}{" "}
                <span className="font-normal text-muted-foreground">
                  {formatNumber(user.count)} ({formatBRL(user.value)})
                </span>
              </span>
              <span className={cn("shrink-0 text-[11px] font-semibold tabular-nums", deltaClass(user.todayDelta))}>
                {formatDelta(user.todayDelta)}
              </span>
            </div>
            <SalsichaBar ratio={user.count / max} color={stage.color} className="mt-1" />
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <DashboardNavSurface href={href} className={cn(CARD_SURFACE_CLASS, "block p-4")}>
      {body}
    </DashboardNavSurface>
  );
}
