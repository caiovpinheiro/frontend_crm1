"use client";

import * as React from "react";

import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { FilterChip } from "@/components/crm/filter-popover";
import { FilterCategoryColumn, FilterColumnsModal } from "@/components/crm/filter-columns-modal";

/**
 * Barra de busca com filtros em colunas de etiquetas.
 * Injete no slot `center` do PageHeader via `useSettingsHeaderSlots().setCenter(...)`.
 */

export type SettingsFilterOption = {
  value: string;
  label: string;
  count?: number;
};

export type SettingsFilterGroup = {
  key: string;
  /** Rótulo da coluna (ex.: "Filtrar por status"). */
  label: string;
  options: SettingsFilterOption[];
  value: string;
  onChange: (value: string) => void;
};

function tabLabel(label: string) {
  return label.replace(/^filtrar por\s+/i, "");
}

export function SettingsListFilterBar({
  search,
  onSearch,
  placeholder = "Buscar…",
  ariaLabel,
  icon,
  groups = [],
  onClearAll,
  popoverTitle = "Filtros",
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  groups?: SettingsFilterGroup[];
  onClearAll: () => void;
  popoverTitle?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const activeCount = groups.reduce(
    (acc, g) => acc + (g.value !== (g.options[0]?.value ?? "") ? 1 : 0),
    0,
  );
  const chips = groups
    .filter((g) => g.value !== (g.options[0]?.value ?? ""))
    .map((g) => ({
      id: g.key,
      title: tabLabel(g.label),
      count: 1,
      onRemove: () => g.onChange(g.options[0]?.value ?? ""),
    }));
  const hasFilters = groups.length > 0;

  return (
    <div className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder={placeholder}
        ariaLabel={ariaLabel ?? placeholder}
        leading={icon}
        withFilter={hasFilters}
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
        onFocus={() => hasFilters && setOpen(true)}
        chips={chips}
      />

      <FilterColumnsModal
        open={open && hasFilters}
        onClose={() => setOpen(false)}
        onClear={onClearAll}
        onApply={() => setOpen(false)}
        count={activeCount}
        clearDisabled={activeCount === 0 && !search}
        title={popoverTitle}
        labelledBy={popoverTitle}
      >
        {groups.map((group) => (
          <FilterCategoryColumn key={group.key} title={tabLabel(group.label)}>
            {group.options.map((opt) => (
              <FilterChip
                key={opt.value}
                tone="fill"
                selected={group.value === opt.value}
                onClick={() => group.onChange(opt.value)}
                count={opt.count}
              >
                {opt.label}
              </FilterChip>
            ))}
          </FilterCategoryColumn>
        ))}
      </FilterColumnsModal>
    </div>
  );
}
