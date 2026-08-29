"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconPhoneIncoming, IconPhoneOutgoing, IconStatusChange } from "@tabler/icons-react";

import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import {
  FilterApplyButton,
  FilterChip,
  FilterPopoverBody,
  FilterPopoverFooter,
  FilterPopoverHeader,
  FilterPopoverPanel,
  FilterRadioRow,
  FilterSegmentedTabs,
} from "@/components/crm/filter-popover";
import { formDialogCancelClass } from "@/components/ui/form-dialog";
import type { CallDirection, CallStatus, ListCallsFilters } from "../api/types";

export type CallsFilterState = Pick<
  ListCallsFilters,
  "direction" | "status" | "dateFrom" | "dateTo"
>;

type FilterPanelTab = "direcao" | "status";

const FILTER_TABS: { id: FilterPanelTab; label: string; icon: ReactNode }[] = [
  { id: "direcao", label: "Direção", icon: <IconPhoneIncoming size={14} stroke={2.2} /> },
  { id: "status", label: "Status", icon: <IconStatusChange size={14} stroke={2.2} /> },
];

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
  const [tab, setTab] = useState<FilterPanelTab>("direcao");
  const [draft, setDraft] = useState<CallsFilterState>(filters);

  const activeCount = countActive(filters);
  const draftCount = countActive(draft);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

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

  const tabBadge = (id: FilterPanelTab) => {
    if (id === "direcao") return draft.direction ? 1 : 0;
    if (id === "status") return draft.status ? 1 : 0;
    return 0;
  };

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
      />

      {open ? (
        <FilterPopoverPanel>
          <FilterPopoverHeader
            count={draftCount || activeCount}
            onClear={handleClear}
            clearDisabled={draftCount === 0 && activeCount === 0}
          />
          <FilterSegmentedTabs
            value={tab}
            onChange={setTab}
            tabs={FILTER_TABS.map((t) => ({
              id: t.id,
              label: t.label,
              icon: t.icon,
              badge: tabBadge(t.id),
            }))}
          />
          <FilterPopoverBody>
            {tab === "direcao" ? (
              <div className="flex flex-col gap-0.5" role="listbox" aria-label="Direção">
                {DIRECTION_OPTIONS.map((opt) => (
                  <FilterRadioRow
                    key={opt.value || "all-dir"}
                    selected={(draft.direction ?? "") === opt.value}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        direction: opt.value || undefined,
                      }))
                    }
                  >
                    <span className="flex items-center gap-2">
                      {opt.icon}
                      {opt.label}
                    </span>
                  </FilterRadioRow>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value || "all-st"}
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
              </div>
            )}
          </FilterPopoverBody>
          <FilterPopoverFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={formDialogCancelClass}
            >
              Cancelar
            </button>
            <FilterApplyButton onClick={handleApply}>Aplicar</FilterApplyButton>
          </FilterPopoverFooter>
        </FilterPopoverPanel>
      ) : null}
    </div>
  );
}
