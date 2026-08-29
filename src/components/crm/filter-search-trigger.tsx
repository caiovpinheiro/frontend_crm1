"use client";

/**
 * Trigger canônico de busca + Filtrar — thin wrapper de `SearchFilterBar`
 * (pílula `h-10` de `/settings`). Mantido para não quebrar imports de
 * Pipeline, Inbox, Cobertura e Demandas.
 */

import * as React from "react";

import { SearchFilterBar } from "@/components/crm/search-filter-bar";

export type FilterSearchTriggerProps = {
  search: string;
  onSearch: (value: string) => void;
  onOpenFilters: () => void;
  /** Estado aberto do modal — destaca o botão. */
  filtersOpen?: boolean;
  activeCount?: number;
  placeholder?: string;
  ariaLabel?: string;
  /** @deprecated Tooltip legado; o rótulo "Filtrar" já descreve a ação. */
  tooltipLabel?: string;
  className?: string;
  onFocus?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Esconde o texto "Filtrar" (barra compacta mobile). */
  filterLabel?: string | false;
};

export function FilterSearchTrigger({
  search,
  onSearch,
  onOpenFilters,
  filtersOpen = false,
  activeCount = 0,
  placeholder = "Pesquisar e filtrar...",
  ariaLabel,
  tooltipLabel: _tooltipLabel,
  className,
  onFocus,
  onKeyDown,
  filterLabel,
}: FilterSearchTriggerProps) {
  void _tooltipLabel;
  return (
    <SearchFilterBar
      value={search}
      onChange={onSearch}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className={className}
      withFilter
      filterOpen={filtersOpen}
      activeCount={activeCount}
      onFilterClick={onOpenFilters}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      clearable
      filterLabel={filterLabel}
    />
  );
}
