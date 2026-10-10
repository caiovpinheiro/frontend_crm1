"use client";

import { cn } from "@/lib/utils";

/**
 * Lista de funis no estilo Kommo: um pipeline por vez.
 * O painel recalcula etapas/KPIs só do funil selecionado.
 */
export function FunnelPipelinePicker({
  pipelines,
  selectedId,
  onSelect,
}: {
  pipelines: { id: string; name: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
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
    </nav>
  );
}
