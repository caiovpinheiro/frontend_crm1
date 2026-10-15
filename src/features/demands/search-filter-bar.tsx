"use client";

import * as React from "react";

import { FilterSearchTrigger } from "@/components/crm/filter-search-trigger";
import { FilterChip } from "@/components/crm/filter-popover";
import { FilterSidebarDialog } from "@/components/crm/filter-sidebar-dialog";
import { IconCategory, IconFlag } from "@tabler/icons-react";
import { kindOptions, priorityOptions } from "./hooks";

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
  const activeCount = (kind !== "ALL" ? 1 : 0) + (priority !== "ALL" ? 1 : 0);

  return (
    <div className="relative w-full">
      <FilterSearchTrigger
        search={search}
        onSearch={onSearch}
        onOpenFilters={() => setOpen((v) => !v)}
        filtersOpen={open}
        activeCount={activeCount}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar e filtrar demandas"
        chips={[
          ...(kind !== "ALL"
            ? [{ id: "kind", title: "Tipo", count: 1, onRemove: () => onKindChange("ALL") }]
            : []),
          ...(priority !== "ALL"
            ? [{ id: "priority", title: "Prioridade", count: 1, onRemove: () => onPriorityChange("ALL") }]
            : []),
        ]}
      />

      <FilterSidebarDialog
        open={open}
        onClose={() => setOpen(false)}
        onClear={() => {
          onKindChange("ALL");
          onPriorityChange("ALL");
        }}
        clearDisabled={activeCount === 0}
        ariaLabel="Filtros de demandas"
        groups={[
          {
            id: "kind",
            label: "Tipo",
            hint: "Tipo da demanda",
            icon: IconCategory,
            count: kind !== "ALL" ? 1 : 0,
            body: (
              <div className="flex flex-wrap gap-2">
                {[{ value: "ALL", label: "Todos" }, ...kindOptions()].map((o) => (
                  <FilterChip
                    key={o.value}
                    tone="fill"
                    selected={kind === o.value}
                    onClick={() => onKindChange(o.value)}
                  >
                    {o.label}
                  </FilterChip>
                ))}
              </div>
            ),
          },
          {
            id: "priority",
            label: "Prioridade",
            hint: "Urgência da demanda",
            icon: IconFlag,
            count: priority !== "ALL" ? 1 : 0,
            body: (
              <div className="flex flex-wrap gap-2">
                {[{ value: "ALL", label: "Todas" }, ...priorityOptions()].map((o) => (
                  <FilterChip
                    key={o.value}
                    tone="fill"
                    selected={priority === o.value}
                    onClick={() => onPriorityChange(o.value)}
                  >
                    {o.label}
                  </FilterChip>
                ))}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
