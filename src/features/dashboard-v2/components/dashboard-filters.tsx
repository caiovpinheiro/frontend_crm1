"use client";

/*
 * Busca + modal Filtrar do dashboard (etiquetas em colunas).
 * Período mora no PeriodCalendarButton do header — não duplicar aqui.
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  IconAdjustmentsHorizontal,
  IconBriefcase,
  IconBuilding,
  IconRoute,
  IconStack2,
  IconTag,
  IconTrash,
  IconUser,
  IconUsers,
  IconX,
} from "@tabler/icons-react";

import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { FilterChip } from "@/components/crm/filter-popover";
import { cn } from "@/lib/utils";
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

      <DashboardFilterDialog
        open={open}
        onClose={() => setOpen(false)}
        onClear={handleClear}
        clearDisabled={activeCount === 0}
        groups={
          variant === "service"
            ? [
                {
                  id: "users",
                  label: "Usuário",
                  hint: "Quem registrou a tabulação",
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
                  hint: "Departamento da tabulação",
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

type FilterGroup = {
  id: string;
  label: string;
  hint: string;
  icon: typeof IconTag;
  count: number;
  body: ReactNode;
};

function DashboardFilterDialog({
  open,
  onClose,
  onClear,
  clearDisabled,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  onClear: () => void;
  clearDisabled: boolean;
  groups: FilterGroup[];
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const active = groups.find((group) => group.id === groupId) ?? groups[0];

  useEffect(() => {
    if (!open) return;
    setGroupId(groups[0]?.id ?? "");
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
    // groups muda a cada render; o reset é só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open || !active || typeof document === "undefined") return null;

  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return createPortal(
    <div className="fixed inset-0 z-(--z-popover) flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onMouseDown={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtros do dashboard"
        className="relative flex h-[min(82vh,720px)] w-[min(1000px,100%)] overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
      >
        <aside className="flex w-[248px] shrink-0 flex-col border-r border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)]">
          <div className="flex items-center gap-2.5 px-4 py-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
              <IconAdjustmentsHorizontal className="size-4" />
            </span>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                Filtros
              </h2>
              {total > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-[11px] font-semibold text-white">
                  {total}
                </span>
              ) : null}
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-3">
            {groups.map((group) => {
              const selected = group.id === active.id;
              const Icon = group.icon;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setGroupId(group.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    selected
                      ? "bg-[var(--color-enterprise-bg)]"
                      : "hover:bg-[var(--glass-bg-overlay)]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg",
                      selected
                        ? "bg-[var(--brand-primary)] text-white"
                        : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[13px] font-medium",
                        selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                      )}
                    >
                      {group.label}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--text-muted)]">
                      {group.hint}
                    </span>
                  </span>
                  {group.count > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-[11px] font-semibold text-white">
                      {group.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className="border-t border-[var(--glass-border-subtle)] p-3">
            <button
              type="button"
              onClick={onClear}
              disabled={clearDisabled}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-ink-soft transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <IconTrash className="size-3.5" />
              Limpar
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-[var(--glass-border-subtle)] px-6 py-4">
            <div>
              <h3 className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
                {active.label}
              </h3>
              <p className="text-[12px] text-[var(--text-muted)]">{active.hint}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              aria-label="Fechar"
            >
              <IconX className="size-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">{active.body}</div>
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--glass-border-subtle)] px-6 py-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-5 text-[13px] font-medium text-white transition-colors hover:bg-[var(--brand-primary-dark)]"
            >
              Aplicar filtros
            </button>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
