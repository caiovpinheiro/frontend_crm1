"use client";

import { CategoricalChart } from "@/components/crm/dashboard/categorical-chart";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { resolveChartType } from "@/features/dashboard-v2/chart-types";
import { DashboardNavSurface } from "@/features/dashboard-v2/components/dashboard-nav-surface";
import { formatBRL, formatDurationMs, formatNumber } from "@/features/dashboard-v2/format";
import type { NegociosCustomCard } from "@/features/dashboard-v2/use-negocios-grid";
import { cn } from "@/lib/utils";

export type CustomMetricRow = {
  id: string;
  name: string;
  value: number;
};

export function CustomMetricCard({
  def,
  value,
  unit,
  rows,
  href,
}: {
  def: NegociosCustomCard;
  value: number | null;
  unit: "count" | "money" | "duration";
  rows: CustomMetricRow[];
  href?: string;
}) {
  const chartType = resolveChartType(def.chartType);
  const formatted =
    value == null
      ? "—"
      : unit === "money"
        ? formatBRL(value)
        : unit === "duration"
          ? formatDurationMs(value)
          : formatNumber(value);

  const inner = (
    <>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {def.title}
          </h3>
          <p className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums text-primary">
            {formatted}
          </p>
        </div>
      </header>
      {rows.length > 0 ? (
        <div data-dashboard-no-drag className="mt-4">
          <CategoricalChart
            type={chartType}
            rows={rows}
            formatValue={(value) =>
              unit === "money"
                ? formatBRL(value)
                : unit === "duration"
                  ? formatDurationMs(value)
                  : formatNumber(value)
            }
          />
        </div>
      ) : null}
    </>
  );

  return (
    <DashboardNavSurface href={href} className={cn(CARD_SURFACE_CLASS, "block p-4")}>
      {inner}
    </DashboardNavSurface>
  );
}
