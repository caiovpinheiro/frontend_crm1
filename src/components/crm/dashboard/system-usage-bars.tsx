"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export type SystemUsageBarRow = {
  id: string;
  name: string;
  seconds: number;
};

type SortMode = "time" | "name";

/** Abaixo disso a linha ganha o alerta de uso baixo. */
const LOW_USAGE_SECONDS = 3600;

const ROW_GRID_CLASS =
  "grid grid-cols-[7.5rem_minmax(0,1fr)_3rem] items-center gap-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)_3rem]";

/** Escala em horas cheias (passo de 1h até 8h, 2h acima disso). */
function usageScale(maxSeconds: number) {
  const maxHours = Math.max(1, Math.ceil(maxSeconds / 3600));
  const step = maxHours > 8 ? 2 : 1;
  const topHours = Math.ceil(maxHours / step) * step;
  const ticks: number[] = [];
  for (let h = 0; h <= topHours; h += step) ticks.push(h);
  return { maxSeconds: topHours * 3600, ticks };
}

function pct(value: number, max: number) {
  return `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
}

export function SystemUsageBars({
  rows,
  average,
  formatValue,
}: {
  rows: SystemUsageBarRow[];
  average: number;
  formatValue: (seconds: number) => string;
}) {
  const [sort, setSort] = useState<SortMode>("time");

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "name") {
      copy.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    } else {
      copy.sort((a, b) => b.seconds - a.seconds);
    }
    return copy;
  }, [rows, sort]);

  const scale = usageScale(Math.max(0, ...rows.map((row) => row.seconds)));
  const avgLeft = pct(average, scale.maxSeconds);
  const showAverage = average > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-primary" />
            Na média ou acima
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-muted-foreground/35" />
            Abaixo da média
          </span>
          {showAverage ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 border-t border-dashed border-muted-foreground" />
              Média {formatValue(average)}
            </span>
          ) : null}
        </div>
        <div
          role="group"
          aria-label="Ordenar usuários"
          className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
        >
          {(
            [
              ["time", "Tempo"],
              ["name", "A–Z"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={sort === mode}
              onClick={() => setSort(mode)}
              className={cn(
                "h-6 rounded-full px-2.5 text-[11px] font-semibold transition-colors",
                sort === mode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(ROW_GRID_CLASS, "h-4")} aria-hidden="true">
        <span />
        <div className="relative h-full text-[10px] tabular-nums text-muted-foreground">
          {scale.ticks.map((hours, index) => (
            <span
              key={hours}
              className={cn(
                "absolute top-0",
                index === 0
                  ? "translate-x-0"
                  : index === scale.ticks.length - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: pct(hours * 3600, scale.maxSeconds) }}
            >
              {hours}h
            </span>
          ))}
        </div>
        <span />
      </div>

      <ul className="flex flex-col">
        {sorted.map((row) => {
          const aboveAverage = row.seconds >= average;
          const low = row.seconds < LOW_USAGE_SECONDS;
          return (
            <li
              key={row.id}
              className={cn(ROW_GRID_CLASS, "h-7")}
              title={`${row.name}: ${formatValue(row.seconds)}`}
            >
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {row.name}
                </span>
                {low ? (
                  <IconAlertTriangle
                    className="size-3.5 shrink-0 text-warning"
                    aria-label="Uso abaixo de 1h"
                  />
                ) : null}
              </span>
              <div className="relative h-full">
                <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      aboveAverage ? "bg-primary" : "bg-muted-foreground/35",
                    )}
                    style={{ width: pct(row.seconds, scale.maxSeconds) }}
                  />
                </div>
                {showAverage ? (
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 border-l border-dashed border-muted-foreground"
                    style={{ left: avgLeft }}
                  />
                ) : null}
              </div>
              <span className="text-right text-[12px] font-semibold tabular-nums text-muted-foreground">
                {formatValue(row.seconds)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
