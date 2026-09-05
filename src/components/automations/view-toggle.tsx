"use client"

import { useCallback, useEffect, useState } from "react"
import { LayoutGrid, List } from "lucide-react"

import { cn } from "@/lib/utils"

export type CardsTableView = "cards" | "tabela"

const LIST_VIEW_STORAGE_KEY = "crm:list-view"

function readStoredView(): CardsTableView {
  if (typeof window === "undefined") return "cards"
  try {
    const raw = localStorage.getItem(LIST_VIEW_STORAGE_KEY)
    if (raw === "cards" || raw === "tabela") return raw
  } catch {
    /* private mode */
  }
  return "cards"
}

/** Última escolha cards/tabela — compartilhada entre as listas do app. */
export function useCardsTableView(): [
  CardsTableView,
  (v: CardsTableView) => void,
] {
  const [view, setViewState] = useState<CardsTableView>("cards")

  useEffect(() => {
    setViewState(readStoredView())
  }, [])

  const setView = useCallback((next: CardsTableView) => {
    setViewState(next)
    try {
      localStorage.setItem(LIST_VIEW_STORAGE_KEY, next)
    } catch {
      /* noop */
    }
  }, [])
  return [view, setView]
}

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
      className="flex h-10 items-center rounded-full border border-border bg-card p-1 shadow-none"
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
