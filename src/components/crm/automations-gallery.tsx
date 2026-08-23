"use client"

import { IconRobot } from "@tabler/icons-react"
import { AutomationCard } from "./automation-card"
import { EmptyState } from "./empty-state"
import { ListColumnLabel } from "./sortable-header"
import type { Automation } from "@/lib/automations-data"

interface AutomationsGalleryProps {
  automations: Automation[]
  onToggle: (id: string) => void
  onDelete?: (id: string) => void
}

const GRID_TEMPLATE =
  "minmax(200px,1.55fr) minmax(132px,1fr) 72px 88px 112px 96px"

export function AutomationsGallery({
  automations,
  onToggle,
  onDelete,
}: AutomationsGalleryProps) {
  if (automations.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] shadow-[var(--glass-shadow)] backdrop-blur-md">
        <EmptyState
          icon={<IconRobot size={28} />}
          title="Nenhuma automação encontrada."
          description="Ajuste a busca ou o filtro para ver outros fluxos."
        />
      </div>
    )
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      role="table"
      aria-label="Lista de automações"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-1">
        <div
          className="sticky top-0 z-[2] hidden shrink-0 items-center gap-4 rounded-[var(--radius-md)] border-b border-[var(--glass-border-subtle)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,var(--bg-base,#dde8f5))] px-4 py-2.5 lg:grid"
          style={{ gridTemplateColumns: GRID_TEMPLATE }}
          role="row"
        >
          <span role="columnheader">
            <ListColumnLabel>Automação / gatilho</ListColumnLabel>
          </span>
          <span role="columnheader">
            <ListColumnLabel>Fluxo</ListColumnLabel>
          </span>
          <span role="columnheader">
            <ListColumnLabel>Sucesso</ListColumnLabel>
          </span>
          <span role="columnheader">
            <ListColumnLabel>Execuções</ListColumnLabel>
          </span>
          <span role="columnheader">
            <ListColumnLabel>Última execução</ListColumnLabel>
          </span>
          <span role="columnheader">
            <ListColumnLabel align="right">Status / ações</ListColumnLabel>
          </span>
        </div>

        <div className="flex flex-col gap-2" role="rowgroup">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
