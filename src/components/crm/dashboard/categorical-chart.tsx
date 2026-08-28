"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  categoricalColor,
  type DashboardChartType,
} from "@/features/dashboard-v2/chart-types";
import { cn } from "@/lib/utils";

export type CategoricalChartRow = {
  id: string;
  name: string;
  value: number;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ChartTooltip({
  active,
  payload,
  formatValue,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: CategoricalChartRow }>;
  formatValue: (value: number) => string;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  const name = row?.name ?? payload[0].name ?? "";
  const value = Number(payload[0].value ?? row?.value ?? 0);
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-foreground">{name}</p>
      <p className="tabular-nums text-muted-foreground">{formatValue(value)}</p>
    </div>
  );
}

type TreemapNode = CategoricalChartRow & { color: string };

function sliceTreemap(
  items: TreemapNode[],
  x: number,
  y: number,
  w: number,
  h: number,
): Array<TreemapNode & { x: number; y: number; w: number; h: number }> {
  if (items.length === 0 || w <= 0 || h <= 0) return [];
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    const cellW = w / items.length;
    return items.map((item, index) => ({
      ...item,
      x: x + index * cellW,
      y,
      w: cellW,
      h,
    }));
  }
  if (items.length === 1) {
    return [{ ...items[0]!, x, y, w, h }];
  }
  const mid = Math.ceil(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);
  const leftSum = left.reduce((sum, item) => sum + item.value, 0);
  const ratio = leftSum / total;
  if (w >= h) {
    const leftW = w * ratio;
    return [
      ...sliceTreemap(left, x, y, leftW, h),
      ...sliceTreemap(right, x + leftW, y, w - leftW, h),
    ];
  }
  const leftH = h * ratio;
  return [
    ...sliceTreemap(left, x, y, w, leftH),
    ...sliceTreemap(right, x, y + leftH, w, h - leftH),
  ];
}

function HtmlTreemap({
  rows,
  formatValue,
}: {
  rows: TreemapNode[];
  formatValue: (value: number) => string;
}) {
  const tiles = sliceTreemap(rows, 0, 0, 100, 100);
  return (
    <div className="relative h-64 w-full overflow-hidden rounded-xl">
      {tiles.map((tile) => (
        <div
          key={tile.id}
          className="absolute overflow-hidden rounded-lg p-2"
          style={{
            left: `calc(${tile.x}% + 2px)`,
            top: `calc(${tile.y}% + 2px)`,
            width: `calc(${tile.w}% - 4px)`,
            height: `calc(${tile.h}% - 4px)`,
            background: tile.color,
          }}
        >
          {tile.w > 12 && tile.h > 14 ? (
            <>
              <p className="truncate text-[12px] font-bold text-primary-foreground">
                {tile.name}
              </p>
              <p className="truncate text-[11px] font-semibold text-primary-foreground/90">
                {formatValue(tile.value)}
              </p>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LegendList({
  rows,
  total,
  formatValue,
}: {
  rows: Array<CategoricalChartRow & { color: string }>;
  total: number;
  formatValue: (value: number) => string;
}) {
  return (
    <ul className="flex max-h-56 min-w-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
      {rows.map((row) => (
        <li key={row.id} className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: row.color }}
            />
            <span className="truncate font-semibold">{row.name}</span>
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {formatValue(row.value)}
            {total > 0 ? (
              <span className="ml-2 text-[11px]">
                {((row.value / total) * 100).toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
                %
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CategoricalChart({
  type,
  rows,
  formatValue,
  average,
  className,
}: {
  type: DashboardChartType;
  rows: CategoricalChartRow[];
  formatValue: (value: number) => string;
  average?: number;
  className?: string;
}) {
  const colored = rows.map((row, index) => ({
    ...row,
    color: categoricalColor(index),
    fill: categoricalColor(index),
  }));
  const max = Math.max(1, ...colored.map((r) => r.value));
  const total = colored.reduce((sum, row) => sum + row.value, 0);
  const mean = average ?? (colored.length ? total / colored.length : 0);

  if (colored.length === 0) return null;

  if (type === "dot") {
    return (
      <div data-chart-type="dot" className={cn("flex flex-col gap-2.5", className)}>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" />
            Valor por item
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-secondary ring-1 ring-border" />
            Média ({formatValue(mean)})
          </span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {colored.map((row) => {
            const ratio = row.value / max;
            const meanRatio = mean / max;
            return (
              <li key={row.id} className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {initials(row.name)}
                </span>
                <span className="w-28 shrink-0 truncate text-[13px] font-semibold">
                  {row.name}
                </span>
                <div className="relative h-6 min-w-0 flex-1">
                  <span
                    className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-border"
                    aria-hidden
                  />
                  <span
                    className="absolute top-0 bottom-0 w-px border-l border-dashed"
                    style={{ left: `${meanRatio * 100}%`, borderColor: "var(--color-warning)" }}
                    aria-hidden
                  />
                  <span
                    className="absolute top-1/2 h-px -translate-y-1/2 bg-primary"
                    style={{ width: `${ratio * 100}%` }}
                  />
                  <span
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                    style={{ left: `${ratio * 100}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-[12px] font-semibold tabular-nums">
                  {formatValue(row.value)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (type === "donut") {
    return (
      <div data-chart-type="donut" className={cn("flex items-center gap-5", className)}>
        <div className="h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={colored}
                dataKey="value"
                nameKey="name"
                innerRadius="58%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="var(--card)"
              >
                {colored.map((row) => (
                  <Cell key={row.id} fill={row.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip formatValue={formatValue} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <LegendList rows={colored} total={total} formatValue={formatValue} />
      </div>
    );
  }

  if (type === "radial") {
    return (
      <div data-chart-type="radial" className={cn("flex items-center gap-5", className)}>
        <div className="h-52 w-52 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              data={colored}
              innerRadius="18%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
            >
              <RadialBar dataKey="value" background={{ fill: "var(--secondary)" }}>
                {colored.map((row) => (
                  <Cell key={row.id} fill={row.color} />
                ))}
              </RadialBar>
              <Tooltip content={<ChartTooltip formatValue={formatValue} />} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <LegendList rows={colored} total={total} formatValue={formatValue} />
      </div>
    );
  }

  if (type === "treemap") {
    return (
      <div data-chart-type="treemap" className={className}>
        <HtmlTreemap rows={colored} formatValue={formatValue} />
      </div>
    );
  }

  if (type === "bar") {
    return (
      <div data-chart-type="bar" className={cn("h-64 w-full", className)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={colored} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={88}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <Tooltip content={<ChartTooltip formatValue={formatValue} />} />
            <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={14}>
              {colored.map((row) => (
                <Cell key={row.id} fill={row.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div data-chart-type="column" className={cn("h-64 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={colored} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            interval={0}
            tickFormatter={(name: string) => name.split(" ")[0] ?? name}
          />
          <YAxis hide />
          <Tooltip content={<ChartTooltip formatValue={formatValue} />} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={28}>
            {colored.map((row) => (
              <Cell key={row.id} fill={row.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
