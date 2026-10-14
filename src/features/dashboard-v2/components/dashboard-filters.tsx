"use client";

/*
 * Busca + modal Filtrar do dashboard (tópicos na lateral).
 * Período mora no PeriodCalendarButton do header — não duplicar aqui.
 */

import { useState, type ReactNode } from "react";
import {
  IconClock,
  IconBriefcase,
  IconBuilding,
  IconRoute,
  IconStack2,
  IconTag,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";

import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { FilterSidebarDialog } from "@/components/crm/filter-sidebar-dialog";
import { FilterChip } from "@/components/crm/filter-popover";
import {
  SOURCE_NONE,
  type DashboardFiltersState,
} from "@/features/dashboard-v2/api";
import { useDashboardFilterOptions } from "@/features/dashboard-v2/hooks";
import { countStructuralDashboardFilters } from "@/features/dashboard-v2/use-dashboard-filters";
import { IDLE_MINUTE_OPTIONS, idleMinutesLabel } from "@/lib/idle-leads";

/** Funil com etapas, como vem de `GET /api/pipelines` (lista do shell). */
export type DashboardFilterPipeline = {
  id: string;
  name: string;
  stages?: { id: string; name: string; color?: string | null; position: number }[];
};

export function DashboardSearchFilterBar({
  search,
  onSearch,
  filters,
  onPatch,
  pipelines = [],
  canFetch = true,
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
  /** Funis (com etapas) da lista do shell — não vêm das opções de filtro. */
  pipelines?: DashboardFilterPipeline[];
  /** Sessão válida: as opções de filtro só são buscadas com o painel aberto. */
  canFetch?: boolean;
  effectivePipelineId?: string;
  variant: "deals" | "service";
  actorUserIds?: string[];
  onActorUserIdsChange?: (ids: string[]) => void;
  departmentIds?: string[];
  onDepartmentIdsChange?: (ids: string[]) => void;
  /** Atendimentos: usuários da equipe (a aba Negócios usa as opções de filtro). */
  userOptions?: { value: string; label: string }[];
  /** Usuários vistos no funil/uso — o filtro de Negócios se atualiza sozinho. */
  liveUserOptions?: { value: string; label: string }[];
  departmentOptions?: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  // Tags/usuários/origens só aparecem dentro do painel: a rota (cara) sai
  // ao abrir, pela mesma chave de 10 min do Kanban/Flow/Lista — nunca na
  // montagem do dashboard.
  const { data: options } = useDashboardFilterOptions(canFetch && open);

  const structuralCount = countStructuralDashboardFilters(filters);
  const tabulationCount =
    (actorUserIds.length ? 1 : 0) + (departmentIds.length ? 1 : 0);
  const activeCount = variant === "service" ? tabulationCount : structuralCount;

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
        rows.push({ value: s.id, label: s.name, color: s.color ?? "" });
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
  const dealUsers = mergeUserOptions(
    variant === "service" ? userOptions : ownerOptions,
    liveUserOptions,
  );

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
      idleMinutes: undefined,
      lastMessageDirection: undefined,
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
                ...(filters.idleMinutes
                  ? [{
                      id: "idle",
                      title: `Parado há +${idleMinutesLabel(filters.idleMinutes)}`,
                      count: 1,
                      onRemove: () => onPatch({ idleMinutes: undefined }),
                    }]
                  : []),
                ...(filters.lastMessageDirection
                  ? [{
                      id: "dir",
                      title: filters.lastMessageDirection === "in" ? "Cliente" : "Consultor ou automação",
                      count: 1,
                      onRemove: () => onPatch({ lastMessageDirection: undefined }),
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

      <FilterSidebarDialog
        open={open}
        onClose={() => setOpen(false)}
        onClear={handleClear}
        clearDisabled={activeCount === 0}
        ariaLabel="Filtros do dashboard"
        groups={
          variant === "service"
            ? [
                {
                  id: "users",
                  label: "Usuário",
                  hint: "Tabulações e gráficos da equipe",
                  icon: IconUser,
                  count: actorUserIds.length ? 1 : 0,
                  body: chipList(
                    userOptions,
                    actorUserIds,
                    (id) => onActorUserIdsChange?.(toggleId(actorUserIds, id)),
                    "Nenhum usuário",
                  ),
                },
                {
                  id: "depts",
                  label: "Departamento",
                  hint: "Tabulações e gráficos da equipe",
                  icon: IconBuilding,
                  count: departmentIds.length ? 1 : 0,
                  body: chipList(
                    departmentOptions,
                    departmentIds,
                    (id) => onDepartmentIdsChange?.(toggleId(departmentIds, id)),
                    "Nenhum departamento",
                  ),
                },
              ]
            : [
                {
                  id: "pipeline",
                  label: "Pipeline",
                  hint: "Um funil por vez",
                  icon: IconBriefcase,
                  count: 0,
                  body: pipelines.length === 0 ? (
                    <EmptyHint>Nenhum funil</EmptyHint>
                  ) : (
                    <ChipWrap>
                      {pipelines.map((p) => (
                        <FilterChip
                          key={p.id}
                          tone="fill"
                          selected={selectedPipeline === p.id}
                          onClick={() =>
                            onPatch({
                              pipelineIds: [p.id],
                              pipelineId: p.id,
                              stageIds: [],
                            })
                          }
                        >
                          {p.name}
                        </FilterChip>
                      ))}
                    </ChipWrap>
                  ),
                },
                {
                  id: "stages",
                  label: "Etapa",
                  hint: "Etapas do funil selecionado",
                  icon: IconStack2,
                  count: filters.stageIds.length ? 1 : 0,
                  body: chipList(
                    stageOptions,
                    filters.stageIds,
                    (id) => onPatch({ stageIds: toggleId(filters.stageIds, id) }),
                    "Nenhuma etapa",
                  ),
                },
                {
                  id: "tags",
                  label: "Tags",
                  hint: "Etiquetas do negócio",
                  icon: IconTag,
                  count: filters.tagIds.length ? 1 : 0,
                  body: chipList(
                    tagOptions,
                    filters.tagIds,
                    (id) => onPatch({ tagIds: toggleId(filters.tagIds, id) }),
                    "Nenhuma tag cadastrada",
                  ),
                },
                {
                  id: "sources",
                  label: "Origem",
                  hint: "De onde o negócio entrou",
                  icon: IconRoute,
                  count: filters.sources.length ? 1 : 0,
                  body: (
                    <ChipWrap>
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
                    </ChipWrap>
                  ),
                },
                {
                  id: "owners",
                  label: "Consultor",
                  hint: "Responsável pelo negócio",
                  icon: IconUser,
                  count: filters.ownerIds.length ? 1 : 0,
                  body: chipList(
                    ownerOptions,
                    filters.ownerIds,
                    (id) => onPatch({ ownerIds: toggleId(filters.ownerIds, id) }),
                    "Nenhum consultor disponível",
                  ),
                },
                {
                  id: "idle",
                  label: "Leads parados",
                  hint: "Tempo desde a última mensagem",
                  icon: IconClock,
                  count: filters.idleMinutes || filters.lastMessageDirection ? 1 : 0,
                  body: (
                    <div className="space-y-3">
                      <div>
                        <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                          Tempo sem interação
                        </span>
                        <ChipWrap>
                          {IDLE_MINUTE_OPTIONS.map((minutes) => (
                            <FilterChip
                              key={minutes}
                              tone="fill"
                              selected={filters.idleMinutes === minutes}
                              onClick={() =>
                                onPatch({
                                  idleMinutes: filters.idleMinutes === minutes ? undefined : minutes,
                                })
                              }
                            >
                              {idleMinutesLabel(minutes)}
                            </FilterChip>
                          ))}
                        </ChipWrap>
                      </div>
                      <div>
                        <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                          Última mensagem enviada por
                        </span>
                        <ChipWrap>
                          <FilterChip
                            tone="fill"
                            selected={!filters.lastMessageDirection}
                            onClick={() => onPatch({ lastMessageDirection: undefined })}
                          >
                            Qualquer um
                          </FilterChip>
                          <FilterChip
                            tone="fill"
                            selected={filters.lastMessageDirection === "in"}
                            onClick={() => onPatch({ lastMessageDirection: "in" })}
                          >
                            Cliente
                          </FilterChip>
                          <FilterChip
                            tone="fill"
                            selected={filters.lastMessageDirection === "out"}
                            onClick={() => onPatch({ lastMessageDirection: "out" })}
                          >
                            Consultor ou automação
                          </FilterChip>
                        </ChipWrap>
                      </div>
                    </div>
                  ),
                },
                {
                  id: "users",
                  label: "Usuário",
                  hint: "Quem aparece no funil e no uso",
                  icon: IconUsers,
                  count: filters.userIds.length ? 1 : 0,
                  body: chipList(
                    dealUsers,
                    filters.userIds ?? [],
                    (id) => onPatch({ userIds: toggleId(filters.userIds ?? [], id) }),
                    "Nenhum usuário",
                  ),
                },
              ]
        }
      />
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

type ChipOption = { value: string; label: string; color?: string };

function chipList(
  options: ChipOption[],
  selected: string[],
  onToggle: (id: string) => void,
  empty: string,
) {
  if (options.length === 0) return <EmptyHint>{empty}</EmptyHint>;
  return (
    <ChipWrap>
      {options.map((option) => (
        <FilterChip
          key={option.value}
          tone="fill"
          selected={selected.includes(option.value)}
          onClick={() => onToggle(option.value)}
          dotColor={option.color}
        >
          {option.label}
        </FilterChip>
      ))}
    </ChipWrap>
  );
}

function ChipWrap({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-sm italic text-muted-foreground">{children}</p>;
}
