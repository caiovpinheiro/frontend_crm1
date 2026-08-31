"use client";

/*
 * Busca + popover Filtrar do dashboard.
 * Período mora no PeriodCalendarButton do header — não duplicar aqui.
 */

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import {
  FilterPopoverBody,
  FilterPopoverHeader,
  FilterPopoverPanel,
  FilterSegmentedTabs,
} from "@/components/crm/filter-popover";
import { formLabelClass } from "@/components/ui/form-dialog";
import type { FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";
import {
  SOURCE_NONE,
  type DashboardFiltersState,
} from "@/features/dashboard-v2/api";
import { countStructuralDashboardFilters } from "@/features/dashboard-v2/use-dashboard-filters";

type FilterTab =
  | "pipeline"
  | "etapa"
  | "tags"
  | "origem"
  | "consultor"
  | "usuario"
  | "departamento";

const DEAL_TABS: { id: FilterTab; label: string }[] = [
  { id: "pipeline", label: "Pipeline" },
  { id: "etapa", label: "Etapa" },
  { id: "tags", label: "Tags" },
  { id: "origem", label: "Origem" },
  { id: "consultor", label: "Consultor" },
  { id: "usuario", label: "Usuário" },
];

const TABULATION_TABS: { id: FilterTab; label: string }[] = [
  { id: "usuario", label: "Usuário" },
  { id: "departamento", label: "Depto" },
];

export function DashboardSearchFilterBar({
  search,
  onSearch,
  filters,
  onPatch,
  options,
  effectivePipelineId,
  variant,
  actorUserIds = [],
  onActorUserIdsChange,
  departmentIds = [],
  onDepartmentIdsChange,
  userOptions = [],
  liveUserOptions = [],
  departmentOptions = [],
}: {
  search: string;
  onSearch: (value: string) => void;
  filters: DashboardFiltersState;
  onPatch: (partial: Partial<DashboardFiltersState>) => void;
  options?: FilterOptionsResponse;
  effectivePipelineId?: string;
  variant: "deals" | "service";
  actorUserIds?: string[];
  onActorUserIdsChange?: (ids: string[]) => void;
  departmentIds?: string[];
  onDepartmentIdsChange?: (ids: string[]) => void;
  userOptions?: { value: string; label: string }[];
  /** Usuários vistos no funil/uso — o filtro de Negócios se atualiza sozinho. */
  liveUserOptions?: { value: string; label: string }[];
  departmentOptions?: { value: string; label: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const tabs = variant === "service" ? TABULATION_TABS : DEAL_TABS;
  const [tab, setTab] = useState<FilterTab>(tabs[0].id);

  const structuralCount = countStructuralDashboardFilters(filters);
  const tabulationCount =
    (actorUserIds.length ? 1 : 0) + (departmentIds.length ? 1 : 0);
  const activeCount = variant === "service" ? tabulationCount : structuralCount;
  const showFilter = true;

  useEffect(() => {
    setTab(tabs[0].id);
  }, [variant]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pipelines = options?.pipelines ?? [];
  const selectedPipelineIds = filters.pipelineIds?.length
    ? filters.pipelineIds
    : effectivePipelineId
      ? [effectivePipelineId]
      : [];
  const stageOptions = (() => {
    const seen = new Set<string>();
    const rows: { value: string; label: string; color: string }[] = [];
    for (const p of pipelines) {
      if (selectedPipelineIds.length && !selectedPipelineIds.includes(p.id)) continue;
      for (const s of [...(p.stages ?? [])].sort((a, b) => a.position - b.position)) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        rows.push({ value: s.id, label: s.name, color: s.color });
      }
    }
    return rows;
  })();
  const tagOptions = (options?.tags ?? []).map((t) => ({
    value: t.id,
    label: t.name,
    color: t.color,
  }));
  const sourceOptions = [
    { value: SOURCE_NONE, label: "Sem origem" },
    ...(options?.sources ?? []).map((s) => ({ value: s, label: s })),
  ];
  const ownerOptions = (options?.users ?? []).map((u) => ({
    value: u.id,
    label: u.name,
    sub: u.role,
  }));

  function handleClear() {
    if (variant === "service") {
      onActorUserIdsChange?.([]);
      onDepartmentIdsChange?.([]);
      return;
    }
    onPatch({
      pipelineId: pipelines[0]?.id,
      pipelineIds: pipelines[0]?.id ? [pipelines[0].id] : [],
      userIds: [],
      stageIds: [],
      tagIds: [],
      ownerIds: [],
      sources: [],
    });
  }

  function tabBadge(id: FilterTab): number {
    if (id === "pipeline") return 0;
    if (id === "etapa") return filters.stageIds.length;
    if (id === "tags") return filters.tagIds.length;
    if (id === "origem") return filters.sources.length;
    if (id === "consultor") return filters.ownerIds.length;
    if (id === "usuario") {
      return variant === "deals" ? (filters.userIds?.length ?? 0) : actorUserIds.length;
    }
    if (id === "departamento") return departmentIds.length;
    return 0;
  }

  return (
    <div ref={ref} className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar no dashboard"
        withFilter={showFilter}
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
      />

      {open && showFilter ? (
        <FilterPopoverPanel>
          <FilterPopoverHeader
            count={activeCount}
            onClear={handleClear}
            clearDisabled={activeCount === 0}
          />
          <FilterSegmentedTabs
            value={tab}
            onChange={setTab}
            tabs={tabs.map((t) => ({
              id: t.id,
              label: t.label,
              badge: tabBadge(t.id),
            }))}
          />
          <FilterPopoverBody>
            {tab === "pipeline" ? (
              <OptionList
                label="Funis"
                hint="Um funil por vez — o painel mostra só as etapas e os números daquele pipeline."
                options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
                selected={
                  filters.pipelineIds?.length
                    ? filters.pipelineIds.slice(0, 1)
                    : effectivePipelineId
                      ? [effectivePipelineId]
                      : []
                }
                onToggle={(id) => {
                  onPatch({
                    pipelineIds: [id],
                    pipelineId: id,
                    stageIds: [],
                  });
                }}
                emptyLabel="Nenhum funil"
              />
            ) : null}
            {tab === "etapa" ? (
              <OptionList
                label="Etapa"
                options={stageOptions}
                selected={filters.stageIds}
                onToggle={(id) =>
                  onPatch({
                    stageIds: toggleId(filters.stageIds, id),
                  })
                }
                emptyLabel="Nenhuma etapa"
              />
            ) : null}
            {tab === "tags" ? (
              <OptionList
                label="Tags"
                options={tagOptions}
                selected={filters.tagIds}
                onToggle={(id) =>
                  onPatch({ tagIds: toggleId(filters.tagIds, id) })
                }
                emptyLabel="Nenhuma tag cadastrada"
              />
            ) : null}
            {tab === "origem" ? (
              <OptionList
                label="Origem"
                options={sourceOptions}
                selected={filters.sources}
                onToggle={(id) =>
                  onPatch({ sources: toggleId(filters.sources, id) })
                }
              />
            ) : null}
            {tab === "consultor" ? (
              <OptionList
                label="Consultor"
                options={ownerOptions}
                selected={filters.ownerIds}
                onToggle={(id) =>
                  onPatch({ ownerIds: toggleId(filters.ownerIds, id) })
                }
                emptyLabel="Nenhum consultor disponível"
              />
            ) : null}
            {tab === "usuario" ? (
              variant === "deals" ? (
                <OptionList
                  label="Usuário"
                  hint="Atualiza com quem aparece no funil e no uso do sistema."
                  options={mergeUserOptions(userOptions, liveUserOptions)}
                  selected={filters.userIds ?? []}
                  onToggle={(id) =>
                    onPatch({ userIds: toggleId(filters.userIds ?? [], id) })
                  }
                  emptyLabel="Nenhum usuário"
                />
              ) : (
                <OptionList
                  label="Usuário"
                  options={userOptions}
                  selected={actorUserIds}
                  onToggle={(id) =>
                    onActorUserIdsChange?.(toggleId(actorUserIds, id))
                  }
                  emptyLabel="Nenhum usuário"
                />
              )
            ) : null}
            {tab === "departamento" ? (
              <OptionList
                label="Departamento"
                options={departmentOptions}
                selected={departmentIds}
                onToggle={(id) =>
                  onDepartmentIdsChange?.(toggleId(departmentIds, id))
                }
                emptyLabel="Nenhum departamento"
              />
            ) : null}
          </FilterPopoverBody>
        </FilterPopoverPanel>
      ) : null}
    </div>
  );
}

function mergeUserOptions(
  catalog: { value: string; label: string }[],
  live: { value: string; label: string }[],
) {
  const map = new Map<string, string>();
  for (const u of [...catalog, ...live]) {
    if (!map.has(u.value)) map.set(u.value, u.label);
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function toggleId(current: string[], id: string): string[] {
  return current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
}

function OptionList({
  label,
  hint,
  options,
  selected,
  onToggle,
  single,
  emptyLabel = "Nenhuma opção",
}: {
  label: string;
  hint?: string;
  options: { value: string; label: string; color?: string; sub?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  single?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div>
      <span className={formLabelClass}>{label}</span>
      {hint ? <p className="mb-2 text-xs text-muted-foreground">{hint}</p> : null}
      {options.length === 0 ? (
        <p className="py-3 text-center text-sm italic text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {options.map((opt) => {
            const on = selected.includes(opt.value);
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => onToggle(opt.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition-colors",
                    on
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground hover:bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      single ? "rounded-full" : "rounded",
                      on
                        ? "border-primary bg-primary"
                        : "border-border bg-card",
                    )}
                  >
                    {on ? (
                      <span
                        className={cn(
                          "bg-primary-foreground",
                          single ? "size-1.5 rounded-full" : "size-2 rounded-[1px]",
                        )}
                      />
                    ) : null}
                  </span>
                  {opt.color ? (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: opt.color }}
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {opt.label}
                  </span>
                  {opt.sub ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {opt.sub}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
