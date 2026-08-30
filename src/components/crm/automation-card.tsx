"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  Trash2,
  Zap,
} from "lucide-react"
import { SwitchGlass } from "./switch-glass"
import { MiniFlow, type MiniFlowStep } from "./mini-flow"
import { blockKeyForStepType } from "./flow-block-icon"
import type { Automation } from "@/lib/automations-data"
import { DataRow } from "@/components/automations/data-view"

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

function SuccessBadge({ rate }: { rate: number }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-14 justify-center rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums",
        rate >= 100
          ? "bg-success-soft text-success"
          : rate > 0
            ? "bg-warning-soft text-warning"
            : "bg-secondary text-muted-foreground",
      )}
    >
      {rate}%
    </span>
  )
}

export function AutomationCard({
  automation,
  onToggle,
  onDelete,
}: AutomationCardProps) {
  const stepTypes =
    automation.stepTypes && automation.stepTypes.length > 0
      ? automation.stepTypes
      : Array.from({ length: automation.steps }, () => "action")
  const steps: MiniFlowStep[] = [
    { blockType: "trigger" },
    ...stepTypes.map((t) => ({ blockType: blockKeyForStepType(t) })),
  ]

  return (
    <DataRow className="group relative cursor-pointer">
      <Link
        href={`/automations/${automation.id}`}
        className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Abrir editor de ${automation.name}`}
      >
        <span className="sr-only">Abrir editor</span>
      </Link>

      <div className="pointer-events-none relative z-10 flex items-center gap-3">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            automation.active ? "bg-success" : "bg-muted-foreground/40",
          )}
          aria-label={automation.active ? "Ativa" : "Inativa"}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {automation.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <Zap size={14} strokeWidth={2} className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{automation.trigger}</span>
          </p>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 overflow-x-auto">
        <span className="mb-1 block text-xs text-muted-foreground lg:hidden">Fluxo</span>
        <MiniFlow steps={steps} max={4} size="sm" connected={false} />
      </div>

      <div className="pointer-events-none relative z-10 flex items-center gap-2 lg:block">
        <span className="text-xs text-muted-foreground lg:hidden">Sucesso</span>
        <SuccessBadge rate={automation.successRate} />
      </div>

      <div className="pointer-events-none relative z-10 flex items-center gap-2 lg:block">
        <span className="text-xs text-muted-foreground lg:hidden">Execuções</span>
        <span className="text-sm font-semibold tabular-nums">
          {automation.runs.toLocaleString("pt-BR")}
        </span>
      </div>

      <div className="pointer-events-none relative z-10 flex items-center gap-2 lg:block">
        <span className="text-xs text-muted-foreground lg:hidden">Última</span>
        <span className="text-sm text-muted-foreground">{automation.lastRun}</span>
      </div>

      <div className="relative z-10 flex items-center gap-1 lg:justify-end">
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
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              "text-muted-foreground transition-colors",
              "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
              "hover:bg-destructive/10 hover:text-destructive",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40",
            )}
          >
            <Trash2 size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </DataRow>
  )
}
