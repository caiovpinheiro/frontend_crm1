"use client";

import * as React from "react";
import { IconLayoutSidebarRight as PanelRight, IconLayoutNavbar as LayoutPanelTop, IconColumns2 as Columns2, IconColumns3 as Columns3, IconAdjustmentsHorizontal as SlidersHorizontal } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { fetchFilterOptions } from "@/components/pipeline/kanban-filters/api";
import { countActiveFilters, type AdvancedDealFilters, type FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";
import {
  FilterBar,
  FilterDrawer,
  FilterModalThreeCol,
  FilterModalTwoCol,
} from "@/components/pipeline/kanban-filters/v2";

type VariantId = "drawer" | "bar" | "two-col" | "three-col";

const VARIANTS: { id: VariantId; label: string; icon: React.ElementType; description: string }[] = [
  {
    id: "drawer",
    label: "Drawer lateral",
    icon: PanelRight,
    description: "Painel amplo à direita, seções empilhadas com scroll. Estilo Linear/Notion.",
  },
  {
    id: "bar",
    label: "Barra + mega-painel",
    icon: LayoutPanelTop,
    description: "Atalhos numa barra horizontal que expande um painel full-width em grid.",
  },
  {
    id: "two-col",
    label: "Modal 2 colunas",
    icon: Columns2,
    description: "Diálogo grande com navegação por categorias à esquerda e conteúdo à direita.",
  },
  {
    id: "three-col",
    label: "Modal 3 colunas",
    icon: Columns3,
    description: "Modal central reorganizado: atalhos · propriedades · tags. DS v2.",
  },
];

export default function PipelineFiltersShowcase() {
  const [variant, setVariant] = React.useState<VariantId>("drawer");
  const [filters, setFilters] = React.useState<AdvancedDealFilters>({});
  const [open, setOpen] = React.useState(false);

  const [options, setOptions] = React.useState<FilterOptionsResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = React.useState(false);
  const [optionsError, setOptionsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    fetchFilterOptions()
      .then((res) => {
        if (!cancelled) setOptions(res);
      })
      .catch((err) => {
        if (!cancelled) setOptionsError(err?.message ?? "Erro ao carregar opções.");
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ao trocar de variação, fecha overlays para evitar dois abertos.
  React.useEffect(() => {
    setOpen(false);
  }, [variant]);

  const activeCount = countActiveFilters(filters);

  const sharedProps = {
    open,
    onOpenChange: setOpen,
    value: filters,
    options,
    optionsLoading,
    optionsError,
    onApply: setFilters,
    onClear: () => setFilters({}),
    onRequestSave: () => {
      // No preview não faz nada — o save real usa o saved-filters-menu.
    },
  };

  const current = VARIANTS.find((v) => v.id === variant)!;

  return (
    <div className="min-h-screen p-6 lg:p-10">
      <div className="mx-auto max-w-[1280px]">
        {/* Título */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--color-text-secondary)]">
            <SlidersHorizontal className="size-3.5" />
            Showcase · DS v2
          </div>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[var(--color-text-primary)]">Filtros do Pipeline</h1>
          <p className="mt-1 text-[14px] text-[var(--color-text-secondary)]">
            4 variações funcionais do filtro avançado, todas seguindo o Design System v2. Compartilham a mesma lógica e
            dados reais da sua org.
          </p>
        </header>

        {/* Seletor de variação */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VARIANTS.map((v) => {
            const Icon = v.icon;
            const active = variant === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariant(v.id)}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border bg-white p-4 text-left transition-colors",
                  active ? "border-blue-300 ring-2 ring-blue-500/20" : "border-black/6 hover:border-black/10",                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl",
                    active ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">{v.label}</span>
                <span className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">{v.description}</span>
              </button>
            );
          })}
        </div>

        {/* Palco */}
        <div className="rounded-2xl border border-black/6 bg-[var(--color-bg-card)] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight text-[var(--color-text-primary)]">{current.label}</h2>
              <p className="text-[12px] text-[var(--color-text-secondary)]">{current.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters({})}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]"
                >
                  Limpar tudo
                </button>
              )}
              {variant !== "bar" && (
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-[13px] font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <SlidersHorizontal className="size-4" />
                  Abrir filtros
                  {activeCount > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-[11px] font-semibold">
                      {activeCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Variação inline (barra) */}
          {variant === "bar" ? (
            <FilterBar {...sharedProps} />
          ) : (
              <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-black/10 bg-[var(--color-bg-subtle)]/60 px-4 py-10 text-center">
              <p className="max-w-md text-[13px] text-[var(--color-text-secondary)]">
                Clique em <span className="font-medium text-[var(--color-text-primary)]">Abrir filtros</span> para visualizar a variação
                {' '}<span className="font-medium text-[var(--color-text-primary)]">{current.label}</span> em ação.
              </p>
            </div>
          )}
        </div>

        {/* Leitura do estado */}
        <div className="mt-5 rounded-2xl border border-black/6 bg-[var(--color-bg-card)] p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Estado dos filtros</h3>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-text-secondary)]">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-semibold text-white">
                {activeCount}
              </span>
              {activeCount === 1 ? "critério ativo" : "critérios ativos"}
            </span>
          </div>
          <pre className="max-h-64 overflow-auto rounded-xl bg-[var(--color-bg-subtle)] p-4 font-mono text-[12px] leading-relaxed text-[var(--color-text-primary)]">
            {JSON.stringify(filters, null, 2)}
          </pre>
          {optionsError && (
            <p className="mt-3 text-[12px] text-[var(--color-rose)]">
              Não foi possível carregar as opções ({optionsError}). As seções aparecem vazias, mas o layout é navegável.
            </p>
          )}
        </div>
      </div>

      {/* Overlays */}
      {variant === "drawer" && <FilterDrawer {...sharedProps} />}
      {variant === "two-col" && <FilterModalTwoCol {...sharedProps} />}
      {variant === "three-col" && <FilterModalThreeCol {...sharedProps} />}
    </div>
  );
}
