"use client"

import {
  useEffect,
  useRef,
  type KeyboardEventHandler,
  type ReactNode,
} from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"

import {
  ActiveFilterChip,
  type ActiveFilterChipModel,
} from "@/components/crm/active-filter-chip"
import { cn } from "@/lib/utils"

/**
 * Pílula canônica de busca + Filtrar — referência `/settings`
 * (`SettingsListFilterBar` / Tags, Equipe, Campos).
 *
 * Sem filtros: input `h-10 rounded-full`. Com filtros: a pílula inteira
 * vira a faixa de chips Kommo (`Título: N`) + H-scroll, sem campo de busca.
 * Filtrar permanece DENTRO da pílula; calendário fica FORA.
 */
export const SEARCH_PILL_INPUT_CLASS =
  "h-10 w-full rounded-full border border-border bg-card pl-9 font-body text-[13px] text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/40"

export const SEARCH_FILTER_BTN_CLASS =
  "absolute right-1.5 top-1/2 z-[1] flex h-7 -translate-y-1/2 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold leading-none transition-colors"

function SearchPillChipScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const zoomOf = () => {
      const w = el.getBoundingClientRect().width
      return w > 0 ? w / Math.max(el.clientWidth, 1) : 1
    }

    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return
      const dx =
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (dx === 0) return
      el.scrollLeft += dx
      event.preventDefault()
    }

    let drag: {
      pointerId: number
      startX: number
      startLeft: number
      moved: boolean
    } | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return
      if (el.scrollWidth <= el.clientWidth + 1) return
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startLeft: el.scrollLeft,
        moved: false,
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      const delta = (event.clientX - drag.startX) / zoomOf()
      if (!drag.moved && Math.abs(delta) < 4) return
      if (!drag.moved) {
        drag.moved = true
        try {
          el.setPointerCapture(event.pointerId)
        } catch {
          /* capture indisponível — segue no bubble */
        }
      }
      el.scrollLeft = drag.startLeft - delta
      event.preventDefault()
    }

    const endDrag = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return
      const didMove = drag.moved
      if (didMove && el.hasPointerCapture?.(event.pointerId)) {
        try {
          el.releasePointerCapture(event.pointerId)
        } catch {
          /* already released */
        }
      }
      drag = null
      if (!didMove) return
      const blockClick = (clickEvent: Event) => {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
      }
      el.addEventListener("click", blockClick, { capture: true, once: true })
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", endDrag)
    window.addEventListener("pointercancel", endDrag)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", endDrag)
      window.removeEventListener("pointercancel", endDrag)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="search-pill-hscroll my-auto h-7 min-w-0 flex-1 select-none rounded-full"
    >
      <div className="flex h-full w-max min-w-full flex-nowrap items-center gap-1.5 px-1">
        {children}
      </div>
    </div>
  )
}

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
  chips,
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
  /** Chips Kommo dentro da pílula (`Responsável: 7`). */
  chips?: ActiveFilterChipModel[]
  children?: ReactNode
}) {
  const showClear = clearable && Boolean(value?.trim())
  const showFilter = withFilter || Boolean(filterSlot)
  const hasChips = Boolean(chips && chips.length > 0)
  const padRight = showFilter
    ? showClear && !hasChips
      ? "pr-36"
      : "pr-[7.25rem]"
    : showClear && !hasChips
      ? "pr-10"
      : "pr-3"

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

  const inputClass = cn(
    "bg-transparent font-body text-[13px] text-foreground outline-none",
    "placeholder:text-muted-foreground",
    "[&::-webkit-search-cancel-button]:hidden",
  )

  return (
    <div className={cn("relative w-full", className)}>
      {hasChips ? null : (
        <span className="pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground">
          {leading ?? <Search className="size-[15px]" aria-hidden="true" />}
        </span>
      )}
      <div
        className={cn(
          "flex h-10 w-full min-w-0 items-center overflow-hidden rounded-full border border-border bg-card shadow-none",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/40",
          hasChips ? "pl-3" : "pl-9",
          padRight,
        )}
      >
        {hasChips ? (
          <SearchPillChipScroll>
            {chips!.map((chip) => (
              <ActiveFilterChip
                key={chip.id}
                title={chip.title}
                count={chip.count}
                onRemove={chip.onRemove}
              />
            ))}
          </SearchPillChipScroll>
        ) : (
          <input
            type="search"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel ?? placeholder}
            autoComplete="off"
            className={cn(inputClass, "h-full min-w-0 flex-1")}
          />
        )}
      </div>
      {showClear && !hasChips ? (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange?.("")}
          className={cn(
            "absolute top-1/2 z-[1] grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
            showFilter ? "right-[6.5rem]" : "right-2",
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
