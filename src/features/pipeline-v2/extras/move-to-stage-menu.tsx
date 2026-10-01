"use client";

/*
 * MoveToStageMenu — corpo compartilhado do menu "Mover para" que
 * permite trocar de ESTÁGIO (funil atual) e também de PIPELINE (drill-
 * down "Outro funil"). Reusado pelos vários entry points de mudança
 * de fase (kanban sidebar, card move, inbox, sales hub, bulk, etc.),
 * garantindo comportamento idêntico e evitando divergência.
 *
 * Cada caller mantém o próprio trigger/popover (design local) e apenas
 * embute este corpo. As decisões UX (1A do plano):
 *  - Vista inicial: estágios do funil atual + item "Outro funil".
 *  - Vista drill-down: lista de funis (exceto o atual) → estágios.
 *  - Botão "voltar" retorna à vista inicial.
 *
 * O callback `onSelect(stageId, pipelineId)` recebe também o pipeline
 * do estágio destino — o caller pode usar para roteamento de motivo
 * de perda, invalidação de cache, etc.
 */

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { usePipelines } from "@/features/pipeline-v2/hooks";
import type { PipelineListStageDto } from "@/features/pipeline-v2/api";
import { cn } from "@/lib/utils";

export interface MoveToStageMenuStage {
  id: string;
  name: string;
  color?: string | null;
  position?: number;
  isWon?: boolean;
  isLost?: boolean;
}

interface MoveToStageMenuProps {
  /** Estágios do funil ATUAL, na ordem em que devem aparecer. */
  stages: MoveToStageMenuStage[];
  currentStageId: string | null;
  /** Pipeline atualmente aberto — omitido do drill-down. */
  currentPipelineId: string | null;
  /**
   * Chamado quando o usuário seleciona um estágio. `pipelineId` é o
   * funil do estágio escolhido (útil para roteamento de motivo de
   * perda por funil e invalidação de cache cross-pipeline).
   */
  onSelect: (stageId: string, pipelineId: string | null) => void;
  isPending?: boolean;
  /** Classes extras para o container raiz do menu. */
  className?: string;
  /**
   * Cabeçalho opcional (título/contador). Quando não fornecido, o
   * corpo é renderizado direto — cada caller pode manter o próprio
   * cabeçalho no popover externo.
   */
  header?: React.ReactNode;
  /** Habilita/desabilita a seção "Outro funil". Default: true. */
  enableCrossPipeline?: boolean;
}

/**
 * Altura máxima da lista rolável (etapas ou funis). É o ÚNICO ponto de
 * rolagem do menu: o container externo dos callers não deve ter
 * `max-h`/`overflow-y-auto` próprio — senão aparecem duas barras e o
 * item "Outro funil…" (fora da lista) fica escondido abaixo da dobra.
 */
const MENU_LIST_MAX_H = "max-h-[min(380px,55vh)]";

/** Altura máxima aproximada do menu inteiro (cabeçalho + lista + "Outro funil…"). */
export const MOVE_TO_STAGE_MENU_MAX_HEIGHT = 460;

/**
 * Etapas do funil para mover negócios: as recebidas do board + as que o
 * board não trouxe, vindas de `GET /api/pipelines` (mesma permissão por
 * etapa, já em cache). Com filtro de etapa o board do servidor devolve só
 * as etapas filtradas — sem isto, menu "Mover" e detecção de Perdido
 * (motivo da perda) ficavam restritos às etapas do filtro.
 */
export function usePipelineMoveStages<T extends MoveToStageMenuStage>(
  pipelineId: string | null,
  stages: readonly T[],
): (T | MoveToStageMenuStage)[] {
  const { data: pipelines } = usePipelines(!!pipelineId);
  return React.useMemo(() => {
    const pipe = pipelineId ? pipelines?.find((p) => p.id === pipelineId) : undefined;
    const extra: MoveToStageMenuStage[] = [];
    if (pipe?.stages?.length) {
      const known = new Set(stages.map((s) => s.id));
      for (const s of pipe.stages) {
        if (known.has(s.id)) continue;
        extra.push({
          id: s.id,
          name: s.name,
          color: s.color,
          position: s.position,
          isWon: s.isWon,
          isLost: s.isLost,
        });
      }
    }
    if (extra.length === 0) return [...stages];
    return [...stages, ...extra].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [pipelineId, pipelines, stages]);
}

export function MoveToStageMenu({
  stages,
  currentStageId,
  currentPipelineId,
  onSelect,
  isPending,
  className,
  header,
  enableCrossPipeline = true,
}: MoveToStageMenuProps) {
  const [view, setView] = React.useState<
    | { kind: "root" }
    | { kind: "pipelines" }
    | { kind: "stages"; pipelineId: string; pipelineName: string }
  >({ kind: "root" });

  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines(
    view.kind !== "root" && enableCrossPipeline,
  );

  const otherPipelines = React.useMemo(
    () => pipelines.filter((p) => p.id !== currentPipelineId),
    [pipelines, currentPipelineId],
  );

  // Todas as etapas do funil atual, mesmo as fora do filtro do board.
  const rootStages = usePipelineMoveStages(currentPipelineId, stages);

  if (view.kind === "root") {
    return (
      <div className={cn("min-w-[220px]", className)}>
        {header}
        <StageList
          stages={rootStages}
          currentStageId={currentStageId}
          isPending={isPending}
          onSelect={(sid) => onSelect(sid, currentPipelineId)}
        />
        {enableCrossPipeline ? (
          <>
            <div className="my-1 h-px bg-[var(--glass-border-subtle,rgba(15,23,42,0.08))]" />
            <button
              type="button"
              onClick={() => setView({ kind: "pipelines" })}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-foreground transition-colors hover:bg-[var(--color-bg-subtle)]"
            >
              <span className="min-w-0 flex-1 truncate">Outro funil…</span>
              <ChevronRight className="size-3.5 text-[var(--color-ink-muted)]" strokeWidth={2.5} />
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (view.kind === "pipelines") {
    return (
      <div className={cn("min-w-[220px]", className)}>
        <BackHeader label="Outro funil" onBack={() => setView({ kind: "root" })} />
        <ul role="listbox" className={cn("scrollbar-thin overflow-y-auto py-1", MENU_LIST_MAX_H)}>
          {pipelinesLoading ? (
            <li className="px-3 py-2 text-[11px] italic text-[var(--color-ink-muted)]">
              Carregando funis…
            </li>
          ) : otherPipelines.length === 0 ? (
            <li className="px-3 py-2 text-[11px] italic text-[var(--color-ink-muted)]">
              Nenhum outro funil disponível.
            </li>
          ) : (
            otherPipelines.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() =>
                    setView({ kind: "stages", pipelineId: p.id, pipelineName: p.name })
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-foreground transition-colors hover:bg-[var(--color-bg-subtle)]"
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <ChevronRight className="size-3.5 text-[var(--color-ink-muted)]" strokeWidth={2.5} />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  }

  const activePipe = pipelines.find((p) => p.id === view.pipelineId);
  const targetStages: MoveToStageMenuStage[] = (activePipe?.stages ?? []).map(
    (s: PipelineListStageDto) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      position: s.position,
      isWon: s.isWon,
      isLost: s.isLost,
    }),
  );

  return (
    <div className={cn("min-w-[220px]", className)}>
      <BackHeader label={view.pipelineName} onBack={() => setView({ kind: "pipelines" })} />
      <StageList
        stages={targetStages}
        currentStageId={null}
        isPending={isPending}
        onSelect={(sid) => onSelect(sid, view.pipelineId)}
      />
    </div>
  );
}

function BackHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--glass-border-subtle,rgba(15,23,42,0.08))] px-2 py-1.5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex size-6 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-foreground"
        aria-label="Voltar"
      >
        <ChevronLeft className="size-3.5" strokeWidth={2.5} />
      </button>
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
        {label}
      </span>
    </div>
  );
}

function StageList({
  stages,
  currentStageId,
  isPending,
  onSelect,
}: {
  stages: MoveToStageMenuStage[];
  currentStageId: string | null;
  isPending?: boolean;
  onSelect: (stageId: string) => void;
}) {
  const sorted = React.useMemo(
    () => [...stages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [stages],
  );
  return (
    <ul role="listbox" className={cn("scrollbar-thin overflow-y-auto py-1", MENU_LIST_MAX_H)}>
      {sorted.length === 0 ? (
        <li className="px-3 py-2 text-[11px] italic text-[var(--color-ink-muted)]">
          Nenhum estágio.
        </li>
      ) : (
        sorted.map((stage) => {
          const isCurrent = stage.id === currentStageId;
          return (
            <li key={stage.id}>
              <button
                type="button"
                role="option"
                aria-selected={isCurrent}
                disabled={isPending || isCurrent}
                onClick={() => {
                  if (!isCurrent) onSelect(stage.id);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold tracking-tight text-foreground transition-colors hover:bg-[var(--color-bg-subtle)]",
                  isCurrent &&
                    "cursor-default bg-[var(--color-primary-soft)]/60 text-[var(--color-primary-dark)]",
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color ?? "#94a3b8" }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{stage.name}</span>
                {isCurrent ? (
                  <Check className="size-3.5 text-[var(--color-info)]" strokeWidth={2.5} />
                ) : null}
              </button>
            </li>
          );
        })
      )}
    </ul>
  );
}
