import { cn } from "@/lib/utils"
import { FlowChip } from "./flow-chip"

export interface MiniFlowStep {
  blockType: string
}

interface MiniFlowProps {
  steps: MiniFlowStep[]
  /** Limita a quantidade visível; o excedente vira um "+N" */
  max?: number
  size?: "sm" | "md"
  /** Traços entre nós (padrão). `false` = só chips, como no mock DS v2. */
  connected?: boolean
  className?: string
}

/**
 * Visualização compacta de um fluxo: um chip colorido por tipo de passo.
 */
export function MiniFlow({
  steps,
  max = 5,
  connected = true,
  className,
}: MiniFlowProps) {
  const visible = steps.slice(0, max)
  const overflow = steps.length - visible.length

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {visible.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <FlowChip type={step.blockType} />
          {connected && i < visible.length - 1 && (
            <span className="h-px w-3 shrink-0 bg-border" aria-hidden />
          )}
        </div>
      ))}

      {overflow > 0 && (
        <span className="flex h-9 items-center rounded-xl border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  )
}
