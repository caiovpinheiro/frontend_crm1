"use client"

import { LayoutGrid, List } from "lucide-react"

import { cn } from "@/lib/utils"

export type CardsTableView = "cards" | "tabela"

export function ViewToggle({
  value,
  onChange,
}: {
  value: CardsTableView
  onChange: (v: CardsTableView) => void
}) {
  return (
    <div
      role="group"
      aria-label="Modo de visualização"
      className="flex h-10 items-center rounded-full border border-border bg-card p-1"
    >
      <button
        type="button"
        aria-label="Cards"
        aria-pressed={value === "cards"}
        onClick={() => onChange("cards")}
        className={cn(
          "flex size-8 items-center justify-center rounded-full transition-colors",
          value === "cards"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Tabela"
        aria-pressed={value === "tabela"}
        onClick={() => onChange("tabela")}
        className={cn(
          "flex size-8 items-center justify-center rounded-full transition-colors",
          value === "tabela"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
