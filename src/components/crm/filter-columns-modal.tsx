"use client"

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, RotateCw, X } from "lucide-react"

import { FilterApplyButton } from "@/components/crm/filter-popover"
import { formDialogCancelClass } from "@/components/ui/form-dialog"
import { cn } from "@/lib/utils"

function flattenFilterColumns(node: ReactNode): ReactNode[] {
  return Children.toArray(node).flatMap((child) => {
    if (isValidElement(child) && child.type === Fragment) {
      return flattenFilterColumns((child.props as { children?: ReactNode }).children)
    }
    return child ? [child] : []
  })
}

const COL_SCROLL_PX = 272

const scrollArrowClass =
  "absolute top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-secondary"


/**
 * Modal de filtros — variação 2 (etiquetas) em colunas.
 * Cada categoria é uma coluna com pílulas. Funil (kanban) continua no modal próprio.
 */
export function FilterColumnsModal({
  open,
  onClose,
  onClear,
  onApply,
  count,
  clearDisabled,
  title = "Filtros",
  description = "Selecione as etiquetas em cada categoria",
  labelledBy,
  wide = false,
  children,
}: {
  open: boolean
  onClose: () => void
  onClear: () => void
  onApply: () => void
  count: number
  clearDisabled?: boolean
  title?: string
  description?: string
  labelledBy?: string
  /** Uma categoria larga, com etiquetas espalhadas em vez de coluna estreita. */
  wide?: boolean
  children: ReactNode
}) {
  const hScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateHScroll = useCallback(() => {
    const el = hScrollRef.current
    if (!el) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }
    setCanScrollLeft(el.scrollLeft > 12)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 12)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!open) return
    const el = hScrollRef.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      const scroller = hScrollRef.current
      if (!scroller) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        if (scroller.scrollWidth <= scroller.clientWidth + 1) return
        e.preventDefault()
        scroller.scrollLeft += e.deltaX
        return
      }
      const col = (e.target as HTMLElement | null)?.closest("[data-filter-col-scroll]")
      if (col instanceof HTMLElement) return
      if (scroller.scrollWidth <= scroller.clientWidth + 1) return
      if (e.deltaY === 0) return
      e.preventDefault()
      scroller.scrollLeft += e.deltaY
    }

    updateHScroll()
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("scroll", updateHScroll, { passive: true })
    const ro = new ResizeObserver(updateHScroll)
    ro.observe(el)
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("scroll", updateHScroll)
      ro.disconnect()
    }
  }, [open, updateHScroll])

  if (!open || typeof document === "undefined") return null

  const columns = flattenFilterColumns(children)
  const columnCount = columns.length

  function scrollColumns(dir: -1 | 1) {
    hScrollRef.current?.scrollBy({ left: dir * COL_SCROLL_PX, behavior: "smooth" })
  }

  const countLabel =
    count === 0
      ? "Nenhum filtro selecionado"
      : `${count} ${count === 1 ? "filtro selecionado" : "filtros selecionados"}`

  return createPortal(
    <div className="fixed inset-0 z-(--z-popover) flex items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-background/75 backdrop-blur-[2px]"
        onMouseDown={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ?? title}
        className={cn(
          "relative grid h-[min(84vh,720px)] max-h-[min(84vh,720px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-border bg-[var(--dropdown-solid-bg)] text-foreground shadow-lg",
        )}
        style={{
          width: wide
            ? "min(calc(100vw - 2rem), 72rem)"
            : `min(calc(100vw - 2rem), ${Math.max(columnCount * 17.5, 28)}rem)`,
          maxWidth: "72rem",
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onClear}
              disabled={clearDisabled}
              className="flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <RotateCw className="size-3.5" aria-hidden /> Limpar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="relative min-h-0 overflow-hidden">
          {canScrollLeft ? (
            <button
              type="button"
              className={cn(scrollArrowClass, "left-2")}
              aria-label="Ver categorias anteriores"
              onClick={() => scrollColumns(-1)}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
          ) : null}
          {canScrollRight ? (
            <button
              type="button"
              className={cn(scrollArrowClass, "right-2")}
              aria-label="Ver mais categorias"
              onClick={() => scrollColumns(1)}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          ) : null}
          <div
            ref={hScrollRef}
            className="filter-columns-hscroll absolute inset-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <div
              className={cn(
                "flex h-full min-h-0 flex-nowrap items-stretch",
                wide ? "w-full" : "w-max",
                canScrollLeft && "pl-12",
                canScrollRight && "pr-12",
              )}
            >
              {columns}
            </div>
          </div>
        </div>

        <footer className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-[var(--dropdown-solid-bg)] px-5 py-3.5 sm:px-6">
          <p className="min-w-0 truncate text-sm text-muted-foreground">{countLabel}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onClose} className={cn(formDialogCancelClass, "h-10")}>
              Cancelar
            </button>
            <FilterApplyButton onClick={onApply}>Aplicar filtros</FilterApplyButton>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

export function FilterCategoryColumn({
  title,
  hint,
  icon,
  children,
  className,
  stacked = false,
}: {
  title: string
  hint?: string
  icon?: ReactNode
  children: ReactNode
  className?: string
  stacked?: boolean
}) {
  return (
    <section
      className={cn(
        "flex h-full min-h-0 w-[17.5rem] max-w-[85vw] max-h-full shrink-0 flex-col gap-3 overflow-hidden border-r border-border/40 px-4 py-5 last:border-r-0 sm:px-5",
        className,
      )}
    >
      <header className="shrink-0 space-y-0.5">
        <div className="flex items-center gap-2.5">
          {icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </span>
          ) : null}
          <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
        </div>
        {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
      </header>
      <div
        data-filter-col-scroll
        className={cn(
          "min-h-0 flex-1 overflow-x-hidden overflow-y-scroll overscroll-y-contain",
          stacked ? "flex flex-col gap-3" : "flex flex-col gap-1.5",
          "[&>button]:h-auto [&>button]:w-full [&>button]:shrink-0 [&>button]:justify-start [&>button]:whitespace-normal [&>button]:text-left [&>button]:min-w-0",
        )}
      >
        {children}
      </div>
    </section>
  )
}
