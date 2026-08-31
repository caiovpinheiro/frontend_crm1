"use client";

import * as React from "react";
import { IconCheck, IconRotateClockwise } from "@tabler/icons-react";

import { FilterPopoverPanel } from "@/components/crm/filter-popover";
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
  const ref = React.useRef<HTMLDivElement>(null);
  const { data: agents = [] } = useCoverageAgents();
  const departments = React.useMemo(() => {
    const map = new Map<string, CoverageDepartment>();
    for (const a of agents) for (const d of a.departments) map.set(d.id, d);
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
  }, [agents]);

  const selected = React.useMemo(() => new Set(deptIds), [deptIds]);
  const activeCount = deptIds.length + (showHidden ? 1 : 0);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggleDept = (id: string) => {
    onDeptIdsChange(
      selected.has(id) ? deptIds.filter((x) => x !== id) : [...deptIds, id],
    );
  };

  return (
    <div ref={ref} className="relative w-full">
      <FilterSearchTrigger
        search={search}
        onSearch={onSearch}
        onOpenFilters={() => setOpen((v) => !v)}
        filtersOpen={open}
        activeCount={activeCount}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar e filtrar cobertura"
      />

      {open ? (
        <FilterPopoverPanel>
          <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
            <span className="font-display text-[14px] font-bold text-[var(--text-primary)]">
              Filtros
            </span>
            <button
              type="button"
              onClick={() => {
                onDeptIdsChange([]);
                onShowHiddenChange(false);
              }}
              disabled={activeCount === 0}
              className="flex items-center gap-1 font-display text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)] disabled:opacity-40"
            >
              <IconRotateClockwise size={13} /> Limpar
            </button>
          </div>

          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="grid gap-1.5">
              <p className="font-display text-[12px] font-semibold text-[var(--text-muted)]">
                Área
              </p>
              {departments.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-3 text-center font-body text-[11.5px] text-[var(--text-muted)]">
                  Nenhuma área cadastrada nos agentes.
                </p>
              ) : (
                <div className="max-h-[220px] overflow-y-auto rounded-[12px] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-1 [scrollbar-width:thin]">
                  {departments.map((d) => {
                    const active = selected.has(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDept(d.id)}
                        className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--glass-bg-subtle)]"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            active
                              ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                              : "border-[var(--glass-border)]",
                          )}
                        >
                          {active ? <IconCheck size={11} stroke={3} /> : null}
                        </span>
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="min-w-0 flex-1 truncate font-display text-[12.5px] font-semibold text-[var(--text-primary)]">
                          {d.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-display text-[12px] font-semibold text-[var(--text-primary)]">
                  Mostrar ocultos
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Inclui quem foi escondido da lista (ex.: admins).
                </p>
              </div>
              <SwitchGlass
                checked={showHidden}
                onChange={onShowHiddenChange}
                aria-label="Mostrar ocultos na cobertura"
              />
            </div>
          </div>
        </FilterPopoverPanel>
      ) : null}
    </div>
  );
}
