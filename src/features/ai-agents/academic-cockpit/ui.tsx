"use client";

import { IconAlertTriangle, IconMoodSmile } from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { ChartCard } from "@/components/crm/chart-card";
import { cn } from "@/lib/utils";

import type { NamedCount } from "./types";

/** Grade responsiva dos KPIs — sem largura fixa, sem overflow horizontal. */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

/** Skeleton no padrão do projeto (pulse sobre superfície glass). */
export function CockpitSkeleton({ bars = false }: { bars?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <KpiGrid>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[84px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]"
          />
        ))}
      </KpiGrid>
      {bars && (
        <div className="h-[220px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]" />
      )}
    </div>
  );
}

export function CockpitError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--color-warning-text)]">
        <IconAlertTriangle size={24} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-display text-[15px] font-bold text-[var(--text-secondary)]">
          Não foi possível carregar as métricas
        </p>
        <p className="font-body text-[13px] text-[var(--text-muted)]">{message}</p>
      </div>
      <ButtonGlass size="sm" onClick={onRetry} disabled={retrying}>
        {retrying ? "Carregando…" : "Tentar novamente"}
      </ButtonGlass>
    </div>
  );
}

/**
 * Estado vazio da aba. Deliberadamente discreto e acima do conteúdo: os KPIs
 * continuam visíveis em `0` em vez de sumirem, porque "zerado" é informação —
 * não é ausência de tela.
 */
export function CockpitZeroNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-4 py-3">
      <IconMoodSmile size={18} className="shrink-0 text-[var(--text-muted)]" />
      <p className="min-w-0 font-body text-[12.5px] text-[var(--text-muted)]">{children}</p>
    </div>
  );
}

/**
 * Lista de contagens nomeadas como barras horizontais — substitui os `.bars`
 * do cockpit estático. Sem biblioteca de gráfico: só tokens do DS.
 */
export function MetricBars({
  title,
  subtitle,
  items,
  emptyLabel,
  className,
}: {
  title: string;
  subtitle?: string;
  items: NamedCount[];
  emptyLabel: string;
  className?: string;
}) {
  const max = items.reduce((m, i) => Math.max(m, i.n), 0);

  return (
    <ChartCard title={title} subtitle={subtitle} className={cn("min-w-0", className)}>
      {items.length === 0 ? (
        // Altura mínima: a lista vazia mantém o card com corpo, em vez de
        // colapsar e desalinhar a grade ao lado.
        <div className="flex min-h-[112px] items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border-subtle)] px-4 py-6 text-center">
          <p className="font-body text-[12.5px] text-[var(--text-muted)]">{emptyLabel}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-body text-[12.5px] font-medium text-[var(--text-secondary)]">
                  {item.name}
                </span>
                <span className="shrink-0 font-display text-[13px] font-bold tabular-nums text-[var(--text-primary)]">
                  {item.n}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--glass-bg-overlay)]">
                <div
                  className="h-full rounded-full bg-[var(--brand-primary)]"
                  // Trilho sempre visível; barra some quando o valor é 0 (o
                  // caso comum na DEV) em vez de dividir por zero.
                  style={{
                    width:
                      max > 0 && item.n > 0
                        ? `${Math.max(4, (item.n / max) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

/** Mediana em segundos → "12s" / "3 min 20s". */
export function formatSeconds(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  const min = Math.floor(value / 60);
  const sec = Math.round(value % 60);
  return sec === 0 ? `${min} min` : `${min} min ${sec}s`;
}
