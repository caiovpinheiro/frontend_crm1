"use client"

import { Bot } from "lucide-react"
import { AutomationCard } from "./automation-card"
import { EmptyState } from "./empty-state"
import { cn } from "@/lib/utils"
import type { Automation } from "@/lib/automations-data"
import { ListColumnLabel, LIST_CARD_HEAD_CLASS, LIST_CARD_STACK_CLASS } from "./sortable-header"

interface AutomationsGalleryProps {
  automations: Automation[]
  onToggle: (id: string) => void
  onDelete?: (id: string) => void
}

const columnClass =
  "grid grid-cols-1 items-center gap-4 lg:grid-cols-[minmax(240px,1.4fr)_minmax(0,1fr)_88px_100px_140px_120px]"

export function AutomationsGallery({
  automations,
  onToggle,
  onDelete,
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

  return (
    <section
      className={cn("min-w-0", LIST_CARD_STACK_CLASS)}
      aria-label="Lista de automações"
    >
      <div className={cn(columnClass, LIST_CARD_HEAD_CLASS)}>
        <ListColumnLabel>Automação / gatilho</ListColumnLabel>
        <ListColumnLabel>Fluxo</ListColumnLabel>
        <ListColumnLabel>Sucesso</ListColumnLabel>
        <ListColumnLabel>Execuções</ListColumnLabel>
        <ListColumnLabel>Última execução</ListColumnLabel>
        <ListColumnLabel align="right">Status</ListColumnLabel>
      </div>

      {automations.map((a) => (
        <AutomationCard
          key={a.id}
          automation={a}
          onToggle={onToggle}
          onDelete={onDelete}
          columnClass={columnClass}
        />
      ))}
    </section>
  )
}
