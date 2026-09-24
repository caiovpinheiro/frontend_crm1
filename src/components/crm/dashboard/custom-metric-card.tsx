"use client";

import { CategoricalChart } from "@/components/crm/dashboard/categorical-chart";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { resolveChartType, type DashboardChartType } from "@/features/dashboard-v2/chart-types";
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

export function TaskInsightCard({
  title,
  total,
  groups,
  chartType,
}: {
  title: string;
  total: number;
  groups: {
    id: string;
    name: string;
    count: number;
    items: { id: string; title: string; dueAt: string | null }[];
  }[];
  chartType?: DashboardChartType;
}) {
  const rows = groups.map((group) => ({ id: group.id, name: group.name, value: group.count }));
  return (
    <div className={cn(CARD_SURFACE_CLASS, "block p-4")}>
      <h3 className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <p className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums text-primary">
        {formatNumber(total)}
      </p>
      {rows.length > 0 ? (
        <div data-dashboard-no-drag className="mt-4">
          <CategoricalChart
            type={resolveChartType(chartType)}
            rows={rows}
            formatValue={(value) => formatNumber(value)}
          />
        </div>
      ) : null}
      <ul className="mt-3 space-y-3">
        {groups.map((group) => (
          <li key={group.id}>
            <p className="text-xs font-semibold text-foreground">
              {group.name}
              <span className="ml-1 tabular-nums text-muted-foreground">{group.count}</span>
            </p>
            <ul className="mt-1 space-y-1">
              {group.items.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-foreground">{item.title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {item.dueAt
                      ? new Date(item.dueAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Sem prazo"}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
