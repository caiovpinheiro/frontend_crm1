"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import { TipScope, tipText } from "@/components/crm/dashboard/chart-tip";
import { openTone, tint } from "@/features/dashboard-v2/measure-colors";
import { cn } from "@/lib/utils";

export type RankBarRow = {
  id: string;
  label: string;
  title?: string;
  /** Comprimento da barra (na escala `max`). */
  value: number;
  /** Barra neutra (ex.: linha "Outros"). */
  muted?: boolean;
  /** Cor da barra desta linha (padrão: `color` da lista). */
  color?: string;
  /** Tom mais claro (ex.: abaixo da média). */
  soft?: boolean;
  /** Parte do `value` já "concluída": barra cheia dentro de uma barra clara. */
  innerValue?: number;
  // ── só no `variant="rank"` ──
  /** Coluna do ranking (padrão: posição, 1-based). */
  rank?: ReactNode;
  /** Segunda linha sob o nome (ex.: caminho da tabulação, "% encerradas"). */
  detail?: string;
  /** Marcador depois do nome (ex.: alerta de uso baixo). */
  badge?: ReactNode;
  /** Valor à direita (padrão: `formatValue(value)`). */
  display?: string;
  /** Segunda linha do valor (ex.: "−1h20", "12 em aberto"). */
  displayDetail?: string;
  /** Texto do balão de hover, uma linha por item (a primeira é o título). */
  tip?: string[];
  /** Substitui a barra (ex.: ponto e traço do TMA). Ocupa a coluna da barra inteira. */
  track?: ReactNode;
};

const ROW_GRID_CLASS =
  "grid grid-cols-[1.1rem_minmax(0,5.6rem)_minmax(0,1fr)_4.6rem] items-center gap-x-2 sm:grid-cols-[1.25rem_minmax(0,9.5rem)_minmax(0,1fr)_5.4rem] sm:gap-x-2.5";

function barBackground(row: RankBarRow, base: string): string {
  if (row.muted) return "var(--muted-foreground)";
  const color = row.color ?? base;
  return row.soft ? tint(color, 50) : color;
}

export function RankBarList({
  rows,
  formatValue = (value) => String(value),
  className,
  variant = "track",
  max: maxProp,
  color = "var(--primary)",
  reference,
  trackHeader,
  limit,
  footer,
  ariaLabel,
}: {
  rows: RankBarRow[];
  formatValue?: (value: number) => string;
  className?: string;
  /**
   * `track`: compacto — nome, barra sobre trilho e valor (cards personalizados).
   * `rank`: ranking completo — posição, nome com 2ª linha, barra/marca e valor com 2ª linha.
   */
  variant?: "track" | "rank";
  /** Escala da barra; padrão = maior valor das linhas (e da referência). */
  max?: number;
  /** Cor da medida (violeta = tempo, azul = conversas...). */
  color?: string;
  /** Linha vertical de referência (ex.: média da equipe), na escala `max`. */
  reference?: { value: number } | null;
  /** Linha acima das barras, na coluna delas (rótulo da média, eixo). */
  trackHeader?: (scale: { max: number; referencePct: number | null }) => ReactNode;
  /** Mostra só as `limit` primeiras e um botão "Ver todos (N)". */
  limit?: number;
  /** Rodapé à esquerda (legenda, contagem). */
  footer?: ReactNode;
  ariaLabel?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const max = Math.max(1, maxProp ?? 0, reference?.value ?? 0, ...rows.map((row) => row.value));
  const referencePct = reference ? (reference.value / max) * 100 : null;
  const capped = limit != null && rows.length > limit;
  const visible = capped && !showAll ? rows.slice(0, limit) : rows;
  const style = { "--rank-color": color } as CSSProperties;

  if (variant === "track") {
    return (
      <ul className={cn("flex flex-col gap-1.5", className)} aria-label={ariaLabel}>
        {visible.map((row) => (
          <li key={row.id} className="flex min-w-0 items-center gap-2.5">
            <div className="w-[9.5rem] min-w-0 shrink-0">
              <p
                className="truncate text-[13px] font-medium text-foreground"
                title={row.title ?? row.label}
              >
                {row.label}
              </p>
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

  return (
    <TipScope className={cn("min-w-0", className)}>
      <div style={style}>
        {trackHeader ? (
          <div className={cn(ROW_GRID_CLASS, "pb-1 text-[10px] text-muted-foreground")} aria-hidden>
            <span />
            <span />
            <div className="relative h-3.5">{trackHeader({ max, referencePct })}</div>
            <span />
          </div>
        ) : null}
        <ol aria-label={ariaLabel} className="flex flex-col">
          {visible.map((row, index) => {
            const base = "var(--rank-color)";
            return (
              <li
                key={row.id}
                data-tip={row.tip ? tipText(...row.tip) : undefined}
                title={row.tip ? undefined : (row.title ?? undefined)}
                className={cn(
                  ROW_GRID_CLASS,
                  "border-b border-border/60 py-1.5 last:border-b-0",
                )}
              >
                <span className="text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {row.rank ?? index + 1}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="flex min-w-0 items-center gap-1 text-[13px] font-semibold text-foreground">
                    <span className="truncate">{row.label}</span>
                    {row.badge}
                  </p>
                  {row.detail ? (
                    <p className="truncate text-[11px] text-muted-foreground">{row.detail}</p>
                  ) : null}
                </div>
                {row.track ? (
                  <div className="relative min-w-0">{row.track}</div>
                ) : (
                  <div className="relative h-2.5 min-w-0 rounded-sm bg-secondary" aria-hidden>
                    <div
                      className="absolute inset-y-0 left-0 min-w-[3px] rounded-sm"
                      style={{
                        width: `${Math.min(100, (row.value / max) * 100)}%`,
                        background:
                          row.innerValue != null ? openTone(row.color ?? base) : barBackground(row, base),
                      }}
                    />
                    {row.innerValue != null ? (
                      <div
                        className="absolute inset-y-0 left-0 min-w-[3px] rounded-sm"
                        style={{
                          width: `${Math.min(100, (Math.min(row.innerValue, row.value) / max) * 100)}%`,
                          background: row.color ?? base,
                        }}
                      />
                    ) : null}
                    {referencePct != null ? (
                      <span
                        className="absolute -bottom-[9px] -top-[9px] w-px bg-foreground/55"
                        style={{ left: `${referencePct}%` }}
                      />
                    ) : null}
                  </div>
                )}
                <div className="text-right leading-tight tabular-nums">
                  <p className="text-[13px] font-semibold text-foreground">
                    {row.display ?? formatValue(row.value)}
                  </p>
                  {row.displayDetail ? (
                    <p className="text-[10.5px] text-muted-foreground">{row.displayDetail}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {footer || capped ? (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">{footer}</div>
            {capped ? (
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll((open) => !open)}
                className="rounded-sm font-semibold text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {showAll ? `Mostrar top ${limit}` : `Ver todos (${rows.length})`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </TipScope>
  );
}

/** Marca de legenda: quadrado com a cor da medida. */
export function LegendSwatch({
  color,
  tone = "full",
  label,
}: {
  color: string;
  tone?: "full" | "open" | "soft";
  label: string;
}) {
  const background =
    tone === "open" ? openTone(color) : tone === "soft" ? tint(color, 50) : color;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="size-2.5 rounded-xs"
        style={{
          background,
          boxShadow: tone === "full" ? undefined : "inset 0 0 0 1px var(--border)",
        }}
      />
      {label}
    </span>
  );
}
