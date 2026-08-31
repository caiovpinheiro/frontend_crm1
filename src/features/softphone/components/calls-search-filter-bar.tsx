"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconPhoneIncoming, IconPhoneOutgoing, IconStatusChange } from "@tabler/icons-react";

import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { FilterChip } from "@/components/crm/filter-popover";
import { FilterCategoryColumn, FilterColumnsModal } from "@/components/crm/filter-columns-modal";
import type { CallDirection, CallStatus, ListCallsFilters } from "../api/types";

export type CallsFilterState = Pick<
  ListCallsFilters,
  "direction" | "status" | "dateFrom" | "dateTo"
>;

const DIRECTION_OPTIONS: { value: "" | CallDirection; label: string; icon: ReactNode }[] = [
  { value: "", label: "Todas as direções", icon: null },
  { value: "INBOUND", label: "Recebidas", icon: <IconPhoneIncoming size={14} /> },
  { value: "OUTBOUND", label: "Realizadas", icon: <IconPhoneOutgoing size={14} /> },
];

const STATUS_OPTIONS: { value: "" | CallStatus; label: string }[] = [
  { value: "", label: "Todos os status" },
  { value: "ANSWERED", label: "Atendidas" },
  { value: "COMPLETED", label: "Completadas" },
  { value: "MISSED", label: "Perdidas" },
  { value: "BUSY", label: "Ocupado" },
  { value: "FAILED", label: "Falhou" },
];

function countActive(f: CallsFilterState): number {
  let n = 0;
  if (f.direction) n++;
  if (f.status) n++;
  return n;
}

interface CallsSearchFilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  filters: CallsFilterState;
  onFiltersChange: (f: CallsFilterState) => void;
}

/**
 * Busca + painel de filtros — Direção | Status.
 * Período fica no ícone de calendário do SectionHeader.
 */
export function CallsSearchFilterBar({
  search,
  onSearch,
  filters,
  onFiltersChange,
}: CallsSearchFilterBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CallsFilterState>(filters);

  const activeCount = countActive(filters);
  const draftCount = countActive(draft);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  function handleClear() {
    const next: CallsFilterState = {
      direction: undefined,
      status: undefined,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    };
    setDraft(next);
    onFiltersChange(next);
  }

  function handleApply() {
    onFiltersChange({
      ...draft,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar e filtrar chamadas"
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        chips={[
          ...(filters.direction
            ? [{
                id: "direction",
                title: "Direção",
                count: 1,
                onRemove: () => onFiltersChange({ ...filters, direction: undefined }),
              }]
            : []),
          ...(filters.status
            ? [{
                id: "status",
                title: "Status",
                count: 1,
                onRemove: () => onFiltersChange({ ...filters, status: undefined }),
              }]
            : []),
        ]}
      />

      <FilterColumnsModal
        open={open}
        onClose={() => setOpen(false)}
        onClear={handleClear}
        onApply={handleApply}
        count={draftCount || activeCount}
        clearDisabled={draftCount === 0 && activeCount === 0}
        title="Filtros"
        labelledBy="Filtros de chamadas"
      >
        <FilterCategoryColumn title="Direção" icon={<IconPhoneIncoming size={16} stroke={2.2} />}>
          {DIRECTION_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value || "all-dir"}
              tone="fill"
              selected={(draft.direction ?? "") === opt.value}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  direction: opt.value || undefined,
                }))
              }
            >
              {opt.label}
            </FilterChip>
          ))}
        </FilterCategoryColumn>
        <FilterCategoryColumn title="Status" icon={<IconStatusChange size={16} stroke={2.2} />}>
          {STATUS_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value || "all-st"}
              tone="fill"
              selected={(draft.status ?? "") === opt.value}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  status: opt.value || undefined,
                }))
              }
            >
              {opt.label}
            </FilterChip>
          ))}
        </FilterCategoryColumn>
      </FilterColumnsModal>
    </div>
  );
}
