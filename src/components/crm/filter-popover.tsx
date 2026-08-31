"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Check, RotateCw, X } from "lucide-react"

import { formDialogPrimaryClass } from "@/components/ui/form-dialog"
import { ModalPortalContext } from "@/components/ui/modal-portal-context"
import { cn } from "@/lib/utils"

/**
 * Chrome do painel Filtrar — referência Tarefas (`TasksSearchFilterBar`).
 * Shell `rounded-2xl`, header Filtros + Limpar, tabs em pílula, body com
 * `rounded-xl` nas opções. Overlay: `--dropdown-solid-bg` (opaco no tema
 * escuro — `bg-card` vaza o conteúdo de baixo).
 */

export const FILTER_POPOVER_PANEL_CLASS =
  "absolute inset-x-0 top-[calc(100%+8px)] z-(--z-popover) flex max-h-[min(78vh,560px)] w-full flex-col overflow-hidden rounded-[22px] border border-border bg-[var(--dropdown-solid-bg)] text-left text-foreground shadow-lg opacity-100 backdrop-blur-none"

export function FilterPopoverPanel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={cn(FILTER_POPOVER_PANEL_CLASS, className)}>{children}</div>
}

export function FilterCountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-primary-foreground">
      {count}
    </span>
  )
}

export function FilterPopoverHeader({
  title = "Filtros",
  count = 0,
  onClear,
  clearDisabled,
}: {
  title?: string
  count?: number
  onClear?: () => void
  clearDisabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-foreground">{title}</span>
        <FilterCountBadge count={count} />
      </div>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          disabled={clearDisabled}
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <RotateCw className="size-3.5" aria-hidden="true" /> Limpar
        </button>
      ) : null}
    </div>
  )
}

export function FilterSegmentedTablist<T extends string>({
  tabs,
  value,
  onChange,
  "aria-label": ariaLabel = "Seções do filtro",
}: {
  tabs: { id: T; label: string; badge?: number; icon?: ReactNode }[]
  value: T
  onChange: (id: T) => void
  "aria-label"?: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex items-center gap-0.5 rounded-full bg-secondary p-1">
      {tabs.map((t) => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-bold transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon ? (
              <span className={active ? "text-primary" : undefined}>{t.icon}</span>
            ) : null}
            {t.label}
            {(t.badge ?? 0) > 0 ? (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {t.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function FilterSegmentedTabs<T extends string>(
  props: {
    tabs: { id: T; label: string; badge?: number; icon?: ReactNode }[]
    value: T
    onChange: (id: T) => void
    "aria-label"?: string
  },
) {
  return (
    <div className="px-4 pb-3">
      <FilterSegmentedTablist {...props} />
    </div>
  )
}

export function FilterSectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-semibold text-muted-foreground">{children}</p>
}

export function FilterPopoverBody({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", className)}>{children}</div>
  )
}

export function FilterPopoverFooter({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex items-center justify-end gap-2 border-t border-border px-4 py-3", className)}>
      {children}
    </div>
  )
}

export function FilterApplyButton({
  onClick,
  children = "Aplicar",
  className,
}: {
  onClick: () => void
  children?: ReactNode
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} className={cn(formDialogPrimaryClass, "h-10 px-4 text-sm font-bold", className)}>
      {children}
    </button>
  )
}

export function FilterRadioRow({
  selected,
  onClick,
  children,
  trailing,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition-colors",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-primary" : "border-border",
        )}
      >
        {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {trailing}
    </button>
  )
}

export function FilterCheckRow({
  checked,
  onClick,
  children,
  trailing,
}: {
  checked: boolean
  onClick: () => void
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors",
        checked ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-secondary",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
        )}
      >
        {checked ? <Check className="size-3" aria-hidden="true" /> : null}
      </span>
      <span className="min-w-0 flex-1 font-semibold">{children}</span>
      {trailing}
    </button>
  )
}

export function FilterChip({
  selected,
  onClick,
  children,
  count,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-secondary",
      )}
    >
      {selected ? <Check className="size-3" strokeWidth={2.4} aria-hidden="true" /> : null}
      {children}
      {typeof count === "number" ? (
        <span
          className={cn(
            "min-w-4 rounded-full px-1.5 text-center text-xs font-bold tabular-nums",
            selected ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

/** Shell de modal Filtrar (Pipeline / Inbox) — mesma linguagem visual de Tarefas. */
export function FilterModalShell({
  title = "Filtros",
  count = 0,
  onClose,
  onClear,
  clearDisabled,
  onApply,
  extraFooter,
  wide,
  labelledBy,
  portalRef,
  children,
}: {
  title?: string
  count?: number
  onClose: () => void
  onClear: () => void
  clearDisabled?: boolean
  onApply: () => void
  extraFooter?: ReactNode
  wide?: boolean
  labelledBy?: string
  portalRef?: (node: HTMLDivElement | null) => void
  children: ReactNode
}) {
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
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
  }, [onClose])

  return (
    <div className="fixed inset-0 z-(--z-popover) flex items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-background/75 backdrop-blur-[2px]"
        onMouseDown={onClose}
        aria-hidden
      />
      <div
        ref={(node) => {
          setPortalNode(node)
          portalRef?.(node)
        }}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ?? title}
        className={cn(
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-[var(--dropdown-solid-bg)] text-foreground shadow-lg",
          wide ? "h-[min(84vh,760px)] max-w-[1120px]" : "h-[min(92dvh,100%)] max-w-lg",
        )}
      >
        <ModalPortalContext.Provider value={portalNode}>
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-bold text-foreground">{title}</span>
              <FilterCountBadge count={count} />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onClear}
                disabled={clearDisabled}
                className="flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                <RotateCw className="size-3.5" aria-hidden="true" /> Limpar
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1">{children}</div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-[var(--dropdown-solid-bg)] px-4 py-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{count}</span> critérios
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {extraFooter}
              <FilterApplyButton onClick={onApply}>Aplicar</FilterApplyButton>
            </div>
          </footer>
        </ModalPortalContext.Provider>
      </div>
    </div>
  )
}
