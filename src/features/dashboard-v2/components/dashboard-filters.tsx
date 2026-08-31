"use client";

/*
 * Busca + modal Filtrar do dashboard (etiquetas em colunas).
 * Período mora no PeriodCalendarButton do header — não duplicar aqui.
 */

import { useState } from "react";

import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { FilterChip } from "@/components/crm/filter-popover";
import { FilterCategoryColumn, FilterColumnsModal } from "@/components/crm/filter-columns-modal";
import type { FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";
import {
  SOURCE_NONE,
  type DashboardFiltersState,
} from "@/features/dashboard-v2/api";
import { countStructuralDashboardFilters } from "@/features/dashboard-v2/use-dashboard-filters";

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
  const [open, setOpen] = useState(false);

  const structuralCount = countStructuralDashboardFilters(filters);
  const tabulationCount =
    (actorUserIds.length ? 1 : 0) + (departmentIds.length ? 1 : 0);
  const activeCount = variant === "service" ? tabulationCount : structuralCount;

  const pipelines = options?.pipelines ?? [];
  const selectedPipelineIds = filters.pipelineIds?.length
    ? filters.pipelineIds
    : effectivePipelineId
      ? [effectivePipelineId]
      : [];
  const selectedPipeline = selectedPipelineIds[0] ?? "";
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
  }));
  const dealUsers = mergeUserOptions(userOptions, liveUserOptions);

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

  return (
    <div className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar no dashboard"
        withFilter
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
        chips={
          variant === "service"
            ? [
                ...(actorUserIds.length
                  ? [{
                      id: "users",
                      title: "Usuários",
                      count: actorUserIds.length,
                      onRemove: () => onActorUserIdsChange?.([]),
                    }]
                  : []),
                ...(departmentIds.length
                  ? [{
                      id: "depts",
                      title: "Departamento",
                      count: departmentIds.length,
                      onRemove: () => onDepartmentIdsChange?.([]),
                    }]
                  : []),
              ]
            : [
                ...(filters.stageIds.length
                  ? [{
                      id: "stages",
                      title: "Etapas",
                      count: filters.stageIds.length,
                      onRemove: () => onPatch({ stageIds: [] }),
                    }]
                  : []),
                ...(filters.tagIds.length
                  ? [{
                      id: "tags",
                      title: "Tags",
                      count: filters.tagIds.length,
                      onRemove: () => onPatch({ tagIds: [] }),
                    }]
                  : []),
                ...(filters.sources.length
                  ? [{
                      id: "sources",
                      title: "Origem",
                      count: filters.sources.length,
                      onRemove: () => onPatch({ sources: [] }),
                    }]
                  : []),
                ...(filters.ownerIds.length
                  ? [{
                      id: "owners",
                      title: "Consultor",
                      count: filters.ownerIds.length,
                      onRemove: () => onPatch({ ownerIds: [] }),
                    }]
                  : []),
                ...(filters.userIds.length
                  ? [{
                      id: "users",
                      title: "Usuários",
                      count: filters.userIds.length,
                      onRemove: () => onPatch({ userIds: [] }),
                    }]
                  : []),
              ]
        }
      />

      <FilterColumnsModal
        open={open}
        onClose={() => setOpen(false)}
        onClear={handleClear}
        onApply={() => setOpen(false)}
        count={activeCount}
        clearDisabled={activeCount === 0}
        title="Filtros"
        labelledBy="Filtros do dashboard"
      >
        {variant === "service" ? (
          <>
            <FilterCategoryColumn title="Usuário">
              {userOptions.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">Nenhum usuário</p>
              ) : (
                userOptions.map((u) => (
                  <FilterChip
                    key={u.value}
                    tone="fill"
                    selected={actorUserIds.includes(u.value)}
                    onClick={() => onActorUserIdsChange?.(toggleId(actorUserIds, u.value))}
                  >
                    {u.label}
                  </FilterChip>
                ))
              )}
            </FilterCategoryColumn>
            <FilterCategoryColumn title="Departamento">
              {departmentOptions.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">Nenhum departamento</p>
              ) : (
                departmentOptions.map((d) => (
                  <FilterChip
                    key={d.value}
                    tone="fill"
                    selected={departmentIds.includes(d.value)}
                    onClick={() => onDepartmentIdsChange?.(toggleId(departmentIds, d.value))}
                  >
                    {d.label}
                  </FilterChip>
                ))
              )}
            </FilterCategoryColumn>
          </>
        ) : (
          <>
            <FilterCategoryColumn title="Pipeline" hint="Um funil por vez">
              {pipelines.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">Nenhum funil</p>
              ) : (
                pipelines.map((p) => (
                  <FilterChip
                    key={p.id}
                    tone="fill"
                    selected={selectedPipeline === p.id}
                    onClick={() => {
                      onPatch({
                        pipelineIds: [p.id],
                        pipelineId: p.id,
                        stageIds: [],
                      });
                    }}
                  >
                    {p.name}
                  </FilterChip>
                ))
              )}
            </FilterCategoryColumn>
            <FilterCategoryColumn title="Etapa">
              {stageOptions.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">Nenhuma etapa</p>
              ) : (
                stageOptions.map((s) => (
                  <FilterChip
                    key={s.value}
                    tone="fill"
                    selected={filters.stageIds.includes(s.value)}
                    onClick={() => onPatch({ stageIds: toggleId(filters.stageIds, s.value) })}
                    dotColor={s.color}
                  >
                    {s.label}
                  </FilterChip>
                ))
              )}
            </FilterCategoryColumn>
            <FilterCategoryColumn title="Tags">
              {tagOptions.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">Nenhuma tag cadastrada</p>
              ) : (
                tagOptions.map((t) => (
                  <FilterChip
                    key={t.value}
                    tone="fill"
                    selected={filters.tagIds.includes(t.value)}
                    onClick={() => onPatch({ tagIds: toggleId(filters.tagIds, t.value) })}
                    dotColor={t.color}
                  >
                    {t.label}
                  </FilterChip>
                ))
              )}
            </FilterCategoryColumn>
            <FilterCategoryColumn title="Origem">
              {sourceOptions.map((s) => (
                <FilterChip
                  key={s.value}
                  tone="fill"
                  selected={filters.sources.includes(s.value)}
                  onClick={() => onPatch({ sources: toggleId(filters.sources, s.value) })}
                >
                  {s.label}
                </FilterChip>
              ))}
            </FilterCategoryColumn>
            <FilterCategoryColumn title="Consultor">
              {ownerOptions.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">Nenhum consultor disponível</p>
              ) : (
                ownerOptions.map((u) => (
                  <FilterChip
                    key={u.value}
                    tone="fill"
                    selected={filters.ownerIds.includes(u.value)}
                    onClick={() => onPatch({ ownerIds: toggleId(filters.ownerIds, u.value) })}
                  >
                    {u.label}
                  </FilterChip>
                ))
              )}
            </FilterCategoryColumn>
            <FilterCategoryColumn title="Usuário" hint="Quem aparece no funil e no uso">
              {dealUsers.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">Nenhum usuário</p>
              ) : (
                dealUsers.map((u) => (
                  <FilterChip
                    key={u.value}
                    tone="fill"
                    selected={(filters.userIds ?? []).includes(u.value)}
                    onClick={() =>
                      onPatch({ userIds: toggleId(filters.userIds ?? [], u.value) })
                    }
                  >
                    {u.label}
                  </FilterChip>
                ))
              )}
            </FilterCategoryColumn>
          </>
        )}
      </FilterColumnsModal>
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
