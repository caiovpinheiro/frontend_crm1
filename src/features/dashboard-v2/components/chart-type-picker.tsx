"use client";

import {
  BarChart3,
  ChartPie,
  CircleDot,
  LayoutGrid,
  AlignLeft,
  Radar,
} from "lucide-react";

import {
  DASHBOARD_CHART_TYPE_LABELS,
  DASHBOARD_CHART_TYPES,
  type DashboardChartType,
} from "@/features/dashboard-v2/chart-types";
import { cn } from "@/lib/utils";

const ICONS: Record<DashboardChartType, typeof BarChart3> = {
  bar: AlignLeft,
  column: BarChart3,
  donut: ChartPie,
  radial: Radar,
  dot: CircleDot,
  treemap: LayoutGrid,
};

export function ChartTypePicker({
  value,
  onChange,
  className,
}: {
  value: DashboardChartType;
  onChange: (next: DashboardChartType) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de gráfico"
      className={cn(
        "flex flex-wrap gap-1 rounded-xl border border-border bg-secondary/50 p-1",
        className,
      )}
    >
      {DASHBOARD_CHART_TYPES.map((id) => {
        const Icon = ICONS[id];
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
              selected
                ? "bg-primary/10 text-primary ring-1 ring-primary"
                : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            {DASHBOARD_CHART_TYPE_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}
