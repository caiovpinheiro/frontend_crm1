"use client"

import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/** Chip Kommo: título do critério + quantidade, com × para remover o grupo. */
export type ActiveFilterChipModel = {
  id: string
  title: string
  count?: number
  onRemove: () => void
}

export function ActiveFilterChip({
  title,
  count,
  onRemove,
}: Omit<ActiveFilterChipModel, "id">) {
  const label = count != null ? `${title}: ${count}` : title
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onRemove()
      }}
      aria-label={`Remover filtro ${label}`}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary px-3",
        "font-body text-[12px] font-medium leading-none text-foreground shadow-sm",
        "transition-all duration-200 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive hover:shadow-md",
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      <X className="size-3.5 shrink-0 opacity-80" aria-hidden="true" />
    </button>
  )
}
