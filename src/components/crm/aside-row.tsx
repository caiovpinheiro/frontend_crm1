"use client"

import { cn } from "@/lib/utils"
import { CopyValueButton } from "@/components/crm/copy-value-button"

// ─────────────────────────────────────────────────────────────────
// Row — linha de campo nativo dos asides (Inbox e Deal).
// Fonte canônica extraída do contact-aside.tsx (Inbox): container
// text-sm, label slate-500 com ícone 12px, valor à direita.
// ─────────────────────────────────────────────────────────────────

export function Row({
  label,
  value,
  valueStyle,
  children,
  icon,
  isFirst,
  compact,
  className,
}: {
  label: string
  value?: string
  valueStyle?: React.CSSProperties
  children?: React.ReactNode
  /** Ícone 12px à esquerda do label (ref. Stitch). */
  icon?: React.ReactNode
  /** Primeira linha do card não recebe borda superior. */
  isFirst?: boolean
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full items-center justify-between gap-2 text-sm",
        compact ? "py-1.5" : "py-2",
        !isFirst && "border-t border-slate-50",
        className,
      )}
    >
      <span className="flex shrink-0 items-center gap-2 font-medium text-slate-500">
        {icon}
        {label}
      </span>
      <div className="flex min-w-0 max-w-full flex-1 justify-end">
        {children ?? (
          <span className="group flex min-w-0 max-w-full items-center justify-end gap-1">
            <span
              className="min-w-0 max-w-full truncate text-right font-display font-semibold text-[var(--text-primary)]"
              style={valueStyle}
              title={value}
            >
              {value}
            </span>
            {value?.trim() ? <CopyValueButton text={value} /> : null}
          </span>
        )}
      </div>
    </div>
  )
}
