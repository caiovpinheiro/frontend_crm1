"use client"

import { createContext, useContext, type CSSProperties, type HTMLAttributes, type ReactNode } from "react"

import {
  LIST_CARD_HEAD_CLASS,
  LIST_CARD_ROW_CLASS,
  LIST_CARD_STACK_CLASS,
  listTableHeadRowClass,
} from "@/components/crm/sortable-header"
import { cn } from "@/lib/utils"

import type { CardsTableView } from "./view-toggle"

type DataViewContextValue = {
  view: CardsTableView
  columnClass: string
  style?: CSSProperties
}

const DataViewContext = createContext<DataViewContextValue>({
  view: "cards",
  columnClass: "",
})

export function DataView({
  view,
  columnClass,
  header,
  children,
  className,
  style,
}: {
  view: CardsTableView
  columnClass: string
  header: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const isTabela = view === "tabela"

  return (
    <DataViewContext.Provider value={{ view, columnClass, style }}>
      <div
        className={cn(
          isTabela
            ? "overflow-hidden rounded-xl border border-border bg-card"
            : LIST_CARD_STACK_CLASS,
          className,
        )}
      >
        <div
          className={cn(
            columnClass,
            isTabela
              ? listTableHeadRowClass("hidden bg-secondary lg:grid")
              : LIST_CARD_HEAD_CLASS,
          )}
          style={style}
        >
          {header}
        </div>
        {children}
      </div>
    </DataViewContext.Provider>
  )
}

export function DataRow({
  className,
  style,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const ctx = useContext(DataViewContext)
  const isTabela = ctx.view === "tabela"

  return (
    <div
      className={cn(
        ctx.columnClass,
        isTabela
          ? "border-t border-border px-5 py-2.5 transition-colors hover:bg-secondary/40"
          : LIST_CARD_ROW_CLASS,
        className,
      )}
      style={ctx.style || style ? { ...ctx.style, ...style } : undefined}
      {...props}
    >
      {children}
    </div>
  )
}
