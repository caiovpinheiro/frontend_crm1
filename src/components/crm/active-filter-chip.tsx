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
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-secondary px-2.5",
        "font-body text-[11px] font-medium leading-none text-foreground",
        "transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      <X className="size-3 shrink-0 opacity-70" aria-hidden="true" />
    </button>
  )
}
