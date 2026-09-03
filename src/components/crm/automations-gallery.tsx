"use client"

import { Bot } from "lucide-react"

import { DataView } from "@/components/automations/data-view"
import type { CardsTableView } from "@/components/automations/view-toggle"
import type { Automation } from "@/lib/automations-data"
import { cn } from "@/lib/utils"

import { AutomationCard } from "./automation-card"
import { EmptyState } from "./empty-state"
import { LIST_PAGE_STACK_CLASS } from "./pagination-glass"
import { ListColumnLabel } from "./sortable-header"

interface AutomationsGalleryProps {
  automations: Automation[]
  onToggle: (id: string) => void
  onDelete?: (id: string) => void
  view?: CardsTableView
}

const columnClass =
  "grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(240px,1.4fr)_minmax(0,1fr)_88px_100px_140px_120px]"

export function AutomationsGallery({
  automations,
  onToggle,
  onDelete,
  view = "cards",
}: AutomationsGalleryProps) {
  if (automations.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card">
        <EmptyState
          icon={<Bot size={28} />}
          title="Nenhuma automação encontrada."
          description="Ajuste a busca ou o filtro para ver outros fluxos."
        />
      </div>
    )
  }

  const header = (
    <>
      <ListColumnLabel>Automação / gatilho</ListColumnLabel>
      <ListColumnLabel>Fluxo</ListColumnLabel>
      <ListColumnLabel>Sucesso</ListColumnLabel>
      <ListColumnLabel>Execuções</ListColumnLabel>
      <ListColumnLabel>Última execução</ListColumnLabel>
      <ListColumnLabel align="right">Status</ListColumnLabel>
    </>
  )

  return (
    <DataView
      view={view}
      columnClass={columnClass}
      header={header}
      className={cn("min-w-0", LIST_PAGE_STACK_CLASS)}
    >
      {automations.map((a, i) => (
        <AutomationCard
          key={a.id}
          automation={a}
          onToggle={onToggle}
          onDelete={onDelete}
          statusTour={i === 0}
        />
      ))}
    </DataView>
  )
}
