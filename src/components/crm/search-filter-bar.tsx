"use client"

import type { KeyboardEventHandler, ReactNode } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Pílula canônica de busca + Filtrar — referência `/settings`
 * (`SettingsListFilterBar` / Tags, Equipe, Campos).
 *
 * Input `h-10 rounded-full text-[13px]`, lupa `left-3.5` size 15, Filtrar
 * DENTRO da pílula (`h-7`, `right-1.5`, rótulo `text-[11px]`).
 * Calendário de período fica FORA — `PeriodCalendarButton`.
 */
export const SEARCH_PILL_INPUT_CLASS =
  "h-10 w-full rounded-full border border-border bg-card pl-9 font-body text-[13px] text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/40"

export const SEARCH_FILTER_BTN_CLASS =
  "absolute right-1.5 top-1/2 z-[1] flex h-7 -translate-y-1/2 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold leading-none transition-colors"

export function SearchFilterBar({
  value,
  onChange,
  placeholder = "Pesquisar e filtrar...",
  ariaLabel,
  className,
  withFilter = true,
  filterOpen = false,
  activeCount = 0,
  onFilterClick,
  filterSlot,
  filterLabel = "Filtrar",
  onFocus,
  onKeyDown,
  clearable = false,
  leading,
  children,
}: {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
  withFilter?: boolean
  filterOpen?: boolean
  activeCount?: number
  onFilterClick?: () => void
  filterSlot?: ReactNode
  /** `false` esconde o texto e deixa só o ícone (barra compacta). */
  filterLabel?: string | false
  onFocus?: () => void
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  clearable?: boolean
  leading?: ReactNode
  children?: ReactNode
}) {
  const showClear = clearable && Boolean(value?.trim())
  const showFilter = withFilter || Boolean(filterSlot)
  const padRight = showFilter ? (showClear ? "pr-32" : "pr-24") : showClear ? "pr-10" : "pr-4"

  const filterButton = (
    <button
      type="button"
      onClick={onFilterClick}
      aria-label="Filtros"
      aria-expanded={filterOpen}
      className={cn(
        SEARCH_FILTER_BTN_CLASS,
        activeCount > 0 || filterOpen
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <SlidersHorizontal className="size-[15px]" aria-hidden="true" />
      {filterLabel ? <span>{filterLabel}</span> : null}
      {activeCount > 0 ? (
        <span className="text-[10px] font-bold leading-none tabular-nums">{activeCount}</span>
      ) : null}
    </button>
  )

  return (
    <div className={cn("relative w-full", className)}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground">
        {leading ?? <Search className="size-[15px]" aria-hidden="true" />}
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        className={cn(
          SEARCH_PILL_INPUT_CLASS,
          padRight,
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {showClear ? (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange?.("")}
          className={cn(
            "absolute top-1/2 z-[1] grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
            showFilter ? "right-[5.75rem]" : "right-2",
          )}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
      {showFilter ? (filterSlot ?? filterButton) : null}
      {children}
    </div>
  )
}
