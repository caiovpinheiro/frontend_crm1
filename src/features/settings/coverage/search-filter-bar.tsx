"use client";

import * as React from "react";
import { IconCheck } from "@tabler/icons-react";

import { FilterCategoryColumn, FilterColumnsModal } from "@/components/crm/filter-columns-modal";
import { FilterSearchTrigger } from "@/components/crm/filter-search-trigger";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { cn } from "@/lib/utils";

import { useCoverageAgents, type CoverageDepartment } from "./coverage-board";

export function CoverageSearchFilterBar({
  search,
  onSearch,
  deptIds,
  onDeptIdsChange,
  showHidden,
  onShowHiddenChange,
}: {
  search: string;
  onSearch: (value: string) => void;
  deptIds: string[];
  onDeptIdsChange: (ids: string[]) => void;
  showHidden: boolean;
  onShowHiddenChange: (v: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const { data: agents = [] } = useCoverageAgents();
  const departments = React.useMemo(() => {
    const map = new Map<string, CoverageDepartment>();
    for (const a of agents) for (const d of a.departments) map.set(d.id, d);
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
  }, [agents]);

  const selected = React.useMemo(() => new Set(deptIds), [deptIds]);
  const activeCount = deptIds.length + (showHidden ? 1 : 0);

  const toggleDept = (id: string) => {
    onDeptIdsChange(
      selected.has(id) ? deptIds.filter((x) => x !== id) : [...deptIds, id],
    );
  };

  return (
    <div className="relative w-full">
      <FilterSearchTrigger
        search={search}
        onSearch={onSearch}
        onOpenFilters={() => setOpen((v) => !v)}
        filtersOpen={open}
        activeCount={activeCount}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar e filtrar cobertura"
        chips={[
          ...(deptIds.length
            ? [{ id: "area", title: "Área", count: deptIds.length, onRemove: () => onDeptIdsChange([]) }]
            : []),
          ...(showHidden
            ? [{ id: "hidden", title: "Ocultos", count: 1, onRemove: () => onShowHiddenChange(false) }]
            : []),
        ]}
      />

      <FilterColumnsModal
        open={open}
        onClose={() => setOpen(false)}
        onClear={() => {
          onDeptIdsChange([]);
          onShowHiddenChange(false);
        }}
        onApply={() => setOpen(false)}
        count={activeCount}
        clearDisabled={activeCount === 0}
        title="Filtros"
        labelledBy="Filtros de cobertura"
      >
        <FilterCategoryColumn title="Área">
          {departments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-secondary px-3 py-3 text-sm text-muted-foreground">
              Nenhuma área cadastrada nos agentes.
            </p>
          ) : (
            departments.map((d) => {
              const active = selected.has(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDept(d.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {active ? <IconCheck size={12} stroke={3} /> : null}
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </button>
              );
            })
          )}
        </FilterCategoryColumn>
        <FilterCategoryColumn title="Visibilidade" stacked>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Mostrar ocultos</p>
              <p className="text-xs text-muted-foreground">
                Inclui quem foi escondido da lista (ex.: admins).
              </p>
            </div>
            <SwitchGlass
              checked={showHidden}
              onChange={onShowHiddenChange}
              aria-label="Mostrar ocultos na cobertura"
            />
          </div>
        </FilterCategoryColumn>
      </FilterColumnsModal>
    </div>
  );
}
