"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type RankBarRow = {
  id: string;
  label: string;
  title?: string;
  value: number;
  labelExtra?: ReactNode;
};

export function RankBarList({
  rows,
  formatValue = (value) => String(value),
  className,
}: {
  rows: RankBarRow[];
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {rows.map((row) => (
        <li key={row.id} className="flex min-w-0 items-center gap-2.5">
          <div className="w-[9.5rem] shrink-0 min-w-0">
            <p
              className="truncate text-[13px] font-medium text-foreground"
              title={row.title ?? row.label}
            >
              {row.label}
            </p>
            {row.labelExtra}
          </div>
          <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-[12px] font-semibold tabular-nums text-muted-foreground">
            {formatValue(row.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
