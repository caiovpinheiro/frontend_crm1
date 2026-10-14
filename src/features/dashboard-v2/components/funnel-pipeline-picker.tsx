"use client";

import { cn } from "@/lib/utils";

const CREATED_TITLE = "Negócios criados no período, em qualquer etapa.";

const numberFmt = new Intl.NumberFormat("pt-BR");
const compactCurrencyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const currencyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export type FunnelCreatedSummary = {
  count: number;
  value: number;
  today: boolean;
};

function formatCreatedMoney(value: number) {
  return Math.abs(value) >= 1000 ? compactCurrencyFmt.format(value) : currencyFmt.format(value);
}

/**
 * Lista de funis no estilo Kommo: um pipeline por vez.
 * O painel recalcula etapas/KPIs só do funil selecionado.
 * `created` fica no espaço vazio embaixo da lista, no tamanho das etapas.
 */
export function FunnelPipelinePicker({
  pipelines,
  selectedId,
  onSelect,
  created,
}: {
  pipelines: { id: string; name: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  created?: FunnelCreatedSummary;
}) {
  const createdLabel = created?.today ? "Criados hoje" : "Criados no período";
  return (
    <nav aria-label="Funil de vendas" className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        Funil de vendas
      </p>
      {/* Celular: a lista vira um select (a lista de 196 px espremia o funil). */}
      <div className="px-3 pb-1 md:hidden">
        <select
          aria-label="Funil de vendas"
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          disabled={pipelines.length === 0}
          className="h-9 w-full rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pipelines.length === 0 ? <option value="">Nenhum funil</option> : null}
          {selectedId ? null : <option value="">Selecione um funil</option>}
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2 max-md:hidden">
        {pipelines.length === 0 ? (
          <li className="px-2 py-3 text-[12px] text-muted-foreground">
            Nenhum funil
          </li>
        ) : (
          pipelines.map((p) => {
            const active = p.id === selectedId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "w-full truncate rounded-md px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors",
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground",
                  )}
                >
                  {p.name}
                </button>
              </li>
            );
          })
        )}
      </ul>
      {created ? (
        <div
          data-funnel-created
          title={createdLabel + ". " + CREATED_TITLE}
          className="mx-2 mb-1 mt-auto shrink-0 rounded-[var(--radius-md)] border border-[var(--pipeline-border)] bg-[var(--pipeline-surface)] px-2.5 py-2.5"
        >
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-[var(--pipeline-success)]">
            {created.count > 0 ? `+${numberFmt.format(created.count)}` : "0"}
          </p>
          <p className="mt-1.5 font-body text-[12px] font-semibold text-[var(--pipeline-text)]">
            {createdLabel}
          </p>
          <p className="mt-0.5 font-body text-[12px] tabular-nums text-[var(--pipeline-text-secondary)]">
            {created.value > 0 ? formatCreatedMoney(created.value) : "R$ 0"}
          </p>
        </div>
      ) : null}
    </nav>
  );
}
