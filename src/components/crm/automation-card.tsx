"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  IconBolt,
  IconTrash,
} from "@tabler/icons-react"
import { SwitchGlass } from "./switch-glass"
import { MiniFlow, type MiniFlowStep } from "./mini-flow"
import { blockKeyForStepType } from "./flow-block-icon"
import type { Automation } from "@/lib/automations-data"

interface AutomationCardProps {
  automation: Automation
  onToggle: (id: string) => void
  /**
   * Quando definido, renderiza um botão lixeira que aparece no hover/focus
   * do card e dispara o handler com o id. O componente NÃO confirma sozinho
   * — quem chama deve usar `useConfirm()` antes de efetivar a remoção.
   * Opcional para preservar usos legados (ex.: galeria preview).
   */
  onDelete?: (id: string) => void
}

export function AutomationCard({ automation, onToggle, onDelete }: AutomationCardProps) {
  const stepTypes =
    automation.stepTypes && automation.stepTypes.length > 0
      ? automation.stepTypes
      : Array.from({ length: automation.steps }, () => "action")
  const steps: MiniFlowStep[] = [
    { blockType: "trigger" },
    ...stepTypes.map((t) => ({ blockType: blockKeyForStepType(t) })),
  ]

  return (
    <article
      className={cn(
        "group relative grid min-h-[68px] min-w-0 shrink-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden border-b border-[var(--glass-border-subtle)] bg-transparent px-3.5 py-3.5 last:border-b-0 transition-colors duration-150 hover:bg-[color-mix(in_srgb,white_48%,transparent)] focus-within:bg-[color-mix(in_srgb,white_48%,transparent)] sm:px-4 lg:min-h-16 lg:grid-cols-[minmax(200px,1.55fr)_minmax(132px,1fr)_72px_88px_112px_96px] lg:gap-4 lg:py-3.5",
      )}
      role="row"
    >
      <Link
        href={`/automations/${automation.id}`}
        className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        aria-label={`Abrir editor de ${automation.name}`}
      >
        <span className="sr-only">Abrir editor</span>
      </Link>

      <div className="pointer-events-none relative z-10 min-w-0" role="cell">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              automation.active
                ? "bg-[var(--color-success)]"
                : "bg-[var(--text-muted)] opacity-45",
            )}
            aria-hidden
          />
          <h3 className="min-w-0 shrink truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
            {automation.name}
          </h3>
          <span className="shrink-0 text-[11px] leading-none text-[var(--text-muted)]/55" aria-hidden>
            •
          </span>
          <span className="flex min-w-0 max-w-[58%] shrink-0 items-center gap-1.5">
            <IconBolt size={13} stroke={2.2} className="shrink-0 text-[var(--brand-primary)]" />
            <span className="min-w-0 truncate font-body text-[12px] text-[var(--text-muted)] sm:text-[12.5px]">
              {automation.trigger}
            </span>
          </span>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 hidden min-w-0 overflow-hidden lg:block" role="cell">
        <MiniFlow steps={steps} max={4} size="sm" connected={false} />
      </div>

      <div className="pointer-events-none relative z-10 hidden text-left lg:block" role="cell">
        <RowMetric value={`${automation.successRate}%`} />
      </div>

      <div className="pointer-events-none relative z-10 hidden text-left lg:block" role="cell">
        <RowMetric value={automation.runs.toLocaleString("pt-BR")} />
      </div>

      <div className="pointer-events-none relative z-10 hidden min-w-0 lg:block" role="cell">
        <RowMetric value={automation.lastRun} subdued />
      </div>

      <div className="relative z-10 flex items-center justify-end gap-1" role="cell">
        <SwitchGlass
          checked={automation.active}
          onChange={() => onToggle(automation.id)}
          size="list"
          className="shrink-0"
          aria-label={`${automation.active ? "Desativar" : "Ativar"} ${automation.name}`}
        />

        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete(automation.id)
            }}
            aria-label={`Excluir ${automation.name}`}
            title="Excluir automação"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              "border border-transparent text-[var(--text-muted)] transition-all duration-150",
              "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
              "hover:border-[var(--color-danger)]/30 hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/40",
            )}
          >
            <IconTrash size={15} stroke={2.2} />
          </button>
        )}
      </div>
    </article>
  )
}

function RowMetric({
  value,
  subdued = false,
}: {
  value: string
  subdued?: boolean
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "truncate font-display text-[13px] font-bold tabular-nums",
          subdued ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]",
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  )
}
