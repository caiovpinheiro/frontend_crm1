"use client"

import { Children, useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { RotateCw, X } from "lucide-react"

import { FilterApplyButton } from "@/components/crm/filter-popover"
import { formDialogCancelClass } from "@/components/ui/form-dialog"
import { cn } from "@/lib/utils"

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
  children: ReactNode
}) {
  const hScrollRef = useRef<HTMLDivElement>(null)

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
      const col = (e.target as HTMLElement | null)?.closest("[data-filter-col-scroll]")
      if (col instanceof HTMLElement) {
        const canY = col.scrollHeight > col.clientHeight + 1
        const dy = e.deltaY
        const atTop = col.scrollTop <= 0
        const atBottom = col.scrollTop + col.clientHeight >= col.scrollHeight - 1
        if (canY && ((dy < 0 && !atTop) || (dy > 0 && !atBottom))) return
      }
      if (el.scrollWidth <= el.clientWidth + 1) return
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (delta === 0) return
      e.preventDefault()
      el.scrollLeft += delta
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [open])

  if (!open || typeof document === "undefined") return null

  const columnCount = Children.toArray(children).length
  const tall = columnCount > 4

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
          "relative flex max-h-[min(84vh,720px)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-[var(--dropdown-solid-bg)] text-foreground shadow-lg sm:w-max sm:max-w-6xl",
          tall && "h-[min(84vh,720px)]",
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
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

        <div
          ref={hScrollRef}
          className={cn(
            "filter-columns-hscroll min-h-0 overflow-x-auto overflow-y-hidden overscroll-x-contain",
            tall && "flex-1",
          )}
        >
          <div className="inline-flex h-full min-h-0 w-max min-w-full flex-nowrap items-stretch">
            {children}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary/40 px-5 py-3.5 sm:px-6">
          <p className="text-sm text-muted-foreground">{countLabel}</p>
          <div className="flex items-center gap-2">
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
        "flex h-full min-h-0 w-[min(16rem,85vw)] shrink-0 flex-col gap-3 border-r border-border/40 px-4 py-5 last:border-r-0 sm:px-5",
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
          "flex min-h-0 grow flex-col items-stretch overflow-x-hidden overflow-y-auto overscroll-y-contain",
          stacked ? "gap-3" : "gap-1.5",
          "[&>button]:w-full [&>button]:justify-start [&>button]:min-w-0",
        )}
      >
        {children}
      </div>
    </section>
  )
}
