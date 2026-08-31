"use client";

import * as React from "react";
import { IconRotateClockwise } from "@tabler/icons-react";

import { FilterSearchTrigger } from "@/components/crm/filter-search-trigger";
import { FilterPopoverPanel } from "@/components/crm/filter-popover";
import { cn } from "@/lib/utils";
import { kindOptions, priorityOptions } from "./hooks";
import type { DemandItemKind, DemandPriority } from "./types";

export function DemandSearchFilterBar({
  search,
  onSearch,
  kind,
  onKindChange,
  priority,
  onPriorityChange,
}: {
  search: string;
  onSearch: (value: string) => void;
  kind: string;
  onKindChange: (value: string) => void;
  priority: string;
  onPriorityChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const activeCount = (kind !== "ALL" ? 1 : 0) + (priority !== "ALL" ? 1 : 0);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <FilterSearchTrigger
        search={search}
        onSearch={onSearch}
        onOpenFilters={() => setOpen((v) => !v)}
        filtersOpen={open}
        activeCount={activeCount}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar e filtrar demandas"
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
                onKindChange("ALL");
                onPriorityChange("ALL");
              }}
              disabled={activeCount === 0}
              className="flex items-center gap-1 font-display text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)] disabled:opacity-40"
            >
              <IconRotateClockwise size={13} /> Limpar
            </button>
          </div>

          <div className="flex flex-col gap-4 px-4 pb-4">
            <FilterChipGroup
              label="Tipo"
              value={kind}
              onChange={onKindChange}
              options={[{ value: "ALL", label: "Todos" }, ...kindOptions()]}
            />
            <FilterChipGroup
              label="Prioridade"
              value={priority}
              onChange={onPriorityChange}
              options={[{ value: "ALL", label: "Todas" }, ...priorityOptions()]}
            />
          </div>
        </FilterPopoverPanel>
      ) : null}
    </div>
  );
}

function FilterChipGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string | DemandItemKind | DemandPriority; label: string }[];
}) {
  return (
    <div className="grid gap-2">
      <p className="font-display text-[12px] font-semibold text-[var(--text-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded-full px-2.5 py-1 font-display text-[12px] font-semibold transition-colors",
                active
                  ? "bg-[var(--brand-primary)] text-white"
                  : "bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
