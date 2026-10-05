"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type RankBarRow = {
  id: string;
  label: string;
  /** Caminho pai em tom apagado antes do label (ex.: "Acadêmico"). */
  labelPrefix?: string;
  title?: string;
  value: number;
  labelExtra?: ReactNode;
  /** Elemento antes do label (ex.: chevron de grupo). */
  leading?: ReactNode;
  /** Barra neutra (ex.: linha "Outros"). */
  muted?: boolean;
  /** Recuo de linha filha (grupo expandido). */
  indent?: boolean;
  onClick?: () => void;
  ariaExpanded?: boolean;
};

export function RankBarList({
  rows,
  formatValue = (value) => String(value),
  className,
  variant = "track",
  total,
  max: maxProp,
}: {
  rows: RankBarRow[];
  formatValue?: (value: number) => string;
  className?: string;
  /**
   * `track`: barra sobre trilho cinza com valor alinhado à direita (padrão).
   * `inline`: sem trilho, rótulo largo e valor logo após o fim da barra.
   */
  variant?: "track" | "inline";
  /** Quando informado, mostra o percentual de cada linha sobre este total. */
  total?: number;
  /** Escala da barra; padrão = maior valor das linhas. */
  max?: number;
}) {
  const max = Math.max(1, maxProp ?? 0, ...rows.map((row) => row.value));
  const percent = (value: number) =>
    total && total > 0 ? Math.round((value / total) * 100) : null;

  if (variant === "inline") {
    return (
      <ul className={cn("flex flex-col gap-0.5", className)}>
        {rows.map((row) => {
          const pct = percent(row.value);
          const label = (
            <span
              className="flex min-w-0 items-center text-[13px] leading-snug"
              title={row.title ?? row.label}
            >
              {row.leading}
              <span className="truncate">
                {row.labelPrefix ? (
                  <span className="text-muted-foreground">{row.labelPrefix} › </span>
                ) : null}
                <span className="font-medium text-foreground">{row.label}</span>
              </span>
            </span>
          );
          return (
            <li
              key={row.id}
              className="grid min-w-0 grid-cols-[minmax(0,15rem)_minmax(0,1fr)] items-center gap-3 rounded-lg px-1.5 py-1 hover:bg-secondary/60 max-sm:grid-cols-1 max-sm:gap-1"
            >
              <div className={cn("flex min-w-0 flex-col items-start", row.indent && "pl-5")}>
                {row.onClick ? (
                  <button
                    type="button"
                    onClick={row.onClick}
                    aria-expanded={row.ariaExpanded}
                    className="block w-full min-w-0 text-left"
                  >
                    {label}
                  </button>
                ) : (
                  label
                )}
                {row.labelExtra}
              </div>
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className="min-w-0"
                  style={{ flex: `0 1 ${Math.max(0.5, (row.value / max) * 82)}%` }}
                >
                  <div
                    className={cn(
                      "h-2.5 min-w-[3px] rounded-r-[4px]",
                      row.muted ? "bg-muted-foreground/35" : "bg-primary",
                    )}
                  />
                </div>
                <span className="shrink-0 whitespace-nowrap text-[12px] tabular-nums">
                  <span className="font-semibold text-foreground">{formatValue(row.value)}</span>
                  {pct != null ? (
                    <span className="text-muted-foreground"> · {pct}%</span>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

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
