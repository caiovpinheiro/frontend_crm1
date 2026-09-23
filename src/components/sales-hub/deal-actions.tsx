"use client";

import { apiUrl } from "@/lib/api";
/**
 * DealActions — barra compacta de ações do deal ativo (Sales Hub).
 * ─────────────────────────────────────────────────────────────────
 * Antes, todas essas ações moravam no `DealCrmPanel` à direita. Como
 * o operador pediu "uma tela só" (remover sidebar direita), migramos
 * as três operações críticas pra dentro do próprio card ativo na
 * Fila, em um formato mais compacto:
 *
 *   ▸ DealStageSelector (exportado separadamente)  — agora mora
 *     DENTRO do cabeçalho slate-100 do card ativo (por pedido do
 *     operador: "colocar o botão de mudar fase dentro da área de
 *     destaque")
 *   ▸ DealActions                                   — stepper
 *     horizontal + botões Ganho/Perdido na faixa abaixo do header
 *
 * Ambos compartilham a MESMA API das mutations originais do
 * `DealCrmPanel` (endpoints `/api/deals/:id/move` POST e
 * `/api/deals/:id` PATCH) e o MESMO update otimista via
 * `applyQuickMove` no cache `pipeline-board`. Isso preserva a
 * consistência com Kanban/List views — mover um deal aqui reflete
 * imediatamente em qualquer outra view aberta.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowsExchange as ArrowsExchange,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconTrophy as Trophy,
  IconCircleX as XCircle,
} from "@tabler/icons-react";
import { toast } from "sonner";

import type { BoardDeal } from "@/components/pipeline/kanban-types";
import type { BoardStage } from "@/components/pipeline/kanban-board";
import { cn, formatCurrency } from "@/lib/utils";
import { SUBTLE_SPRING } from "@/lib/design-system";
import { MoveToStageMenu } from "@/features/pipeline-v2/extras/move-to-stage-menu";
import {
  computePopoverPosition,
  usePortalPopover,
} from "@/features/pipeline-v2/extras/use-portal-popover";
import { TooltipHost } from "@/components/ui/tooltip";
import { useCan } from "@/hooks/use-my-permissions";

type StatusFilter = "OPEN" | "WON" | "LOST" | "ALL";

type DealActionsProps = {
  deal: BoardDeal & { stageId: string };
  stages: BoardStage[];
  pipelineId: string;
  statusFilter: StatusFilter;
  onMoved?: (dealId: string) => void;
};

type DealStageSelectorProps = DealActionsProps & {
  /**
   * Quando true (default), o seletor também renderiza o valor formatado
   * do deal no canto direito. Útil pra o header do card ativo, onde
   * removemos a pílula "FASE DO FUNIL" original — agora o seletor de
   * etapa carrega ambas as informações em uma linha só.
   */
  showValue?: boolean;
};

const boardQueryKey = (pid: string, status: StatusFilter = "OPEN") =>
  ["pipeline-board", pid, status] as const;

function cloneBoard(stages: BoardStage[]): BoardStage[] {
  return stages.map((s) => ({ ...s, deals: s.deals.map((d) => ({ ...d })) }));
}

function applyQuickMove(
  stages: BoardStage[],
  dealId: string,
  fromId: string,
  toId: string,
): BoardStage[] {
  const next = cloneBoard(stages);
  const src = next.find((s) => s.id === fromId);
  if (!src) return stages;
  const idx = src.deals.findIndex((d) => d.id === dealId);
  if (idx < 0) return stages;
  const [moved] = src.deals.splice(idx, 1);
  if (!moved) return stages;
  const dst = next.find((s) => s.id === toId);
  // Cross-pipeline: quando o estágio destino não pertence ao board
  // atual, o card apenas sai da origem — o board do funil destino é
  // atualizado via invalidação global em `onSettled`.
  if (dst) dst.deals.unshift(moved);
  for (const col of next) col.deals.forEach((d, i) => { d.position = i; });
  return next;
}

function dealValue(deal: BoardDeal): number {
  if (typeof deal.value === "number") return deal.value;
  const n = Number(deal.value);
  return Number.isNaN(n) ? 0 : n;
}

type MovePayload = {
  dealId: string;
  fromStageId: string;
  toStageId: string;
  /** Funil de destino — informado quando o estágio pertence a outro pipeline. */
  toPipelineId?: string | null;
};
type StatusPayload = { dealId: string; status: "WON" | "LOST" };

/**
 * Hook compartilhado — mutation de mover um deal entre etapas com
 * update otimista no cache `pipeline-board`. Exportado para que o
 * `DealQueue` possa construir seu próprio trigger inline (seta no
 * "ETAPA ATUAL") sem duplicar a lógica de estado.
 */
export function useMoveMutation({
  pipelineId,
  statusFilter,
  stages,
  onMoved,
}: Pick<DealActionsProps, "pipelineId" | "statusFilter" | "stages" | "onMoved">) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: MovePayload) => {
      const res = await fetch(apiUrl(`/api/deals/${vars.dealId}/move`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: vars.toStageId, position: 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "Não foi possível mover o negócio.",
        );
      return data;
    },
    onMutate: async (vars: MovePayload) => {
      const qk = boardQueryKey(pipelineId, statusFilter);
      await queryClient.cancelQueries({ queryKey: qk });
      // A fila do Flow pagina com sufixo `lastInteraction:*` na queryKey.
      // O prefixo cobre o board padrão e essa variante.
      const snapshots = queryClient.getQueriesData<BoardStage[]>({
        queryKey: qk,
      });
      for (const [key, prev] of snapshots) {
        if (!prev) continue;
        queryClient.setQueryData(
          key,
          applyQuickMove(prev, vars.dealId, vars.fromStageId, vars.toStageId),
        );
      }
      return { snapshots };
    },
    onSuccess: (data, vars) => {
      const dest = stages.find((s) => s.id === vars.toStageId);
      if (dest) {
        toast.success(`Movido para "${dest.name}"`, { duration: 2000 });
      } else {
        // Cross-pipeline: pega o nome do estágio (e funil) do payload
        // retornado pelo backend. Fallback: mensagem genérica.
        const payload = data as
          | { stage?: { name?: string; pipeline?: { name?: string } | null } }
          | undefined;
        const toName = payload?.stage?.name ?? null;
        const toPipeName = payload?.stage?.pipeline?.name ?? null;
        toast.success(
          toPipeName && toName
            ? `Movido para "${toPipeName} → ${toName}"`
            : toName
              ? `Movido para "${toName}"`
              : "Negócio movido",
          { duration: 2000 },
        );
      }
      onMoved?.(vars.dealId);
    },
    onError: (e, _v, ctx) => {
      for (const [key, prev] of ctx?.snapshots ?? []) {
        queryClient.setQueryData(key, prev);
      }
      toast.error(e instanceof Error ? e.message : "Erro ao mover negócio");
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["pipeline-board", pipelineId],
      });
      // Cross-pipeline: invalida tambem o board do funil destino,
      // caso esteja aberto em outra tela/aba.
      if (vars.toPipelineId && vars.toPipelineId !== pipelineId) {
        queryClient.invalidateQueries({ queryKey: ["pipeline-board"] });
      }
    },
  });
}

/**
 * Botão compacto "Mover de fase" — mesmo corpo do kanban
 * (`MoveToStageMenu` + `useMoveMutation`). Usado no header da fila
 * Flow, ao lado do sort: age sobre o deal ativo; desabilitado se
 * nenhum estiver selecionado.
 */
export function DealMoveStageButton({
  deal,
  stages,
  pipelineId,
  statusFilter,
  onMoved,
}: {
  deal: (BoardDeal & { stageId: string }) | null;
  stages: BoardStage[];
  pipelineId: string;
  statusFilter: StatusFilter;
  onMoved?: (dealId: string) => void;
}) {
  const { open, rect, triggerRef, popoverRef, toggle, close } =
    usePortalPopover();
  const canChangeStage = useCan("deal:change_stage");
  const moveMutation = useMoveMutation({
    pipelineId,
    statusFilter,
    stages,
    onMoved,
  });
  const position = computePopoverPosition(rect, 320, 240);
  const noDeal = !deal;
  const disabled = noDeal || moveMutation.isPending || !canChangeStage;
  const tooltip = !canChangeStage
    ? "Sem permissão para mover entre etapas"
    : noDeal
      ? "Selecione um negócio"
      : "Mover negócio de fase";

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Fecha o popover se o deal ativo sumir (ex.: moveu de etapa).
  React.useEffect(() => {
    if (!deal && open) close();
  }, [deal, open, close]);

  return (
    <div className="relative shrink-0">
      <TooltipHost label={tooltip} side="top">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={tooltip}
          onClick={() => {
            if (disabled) return;
            toggle();
          }}
          className={cn(
            // Ícone vivo (ciano) — mesma energia do inbox, mas a ação é
            // mover o NEGÓCIO de fase (não transferir conversa).
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-cyan-500 p-0 text-white shadow-[0_2px_8px_rgba(6,182,212,0.35)] transition-all hover:bg-cyan-600",
            open && "bg-cyan-600 ring-[3px] ring-cyan-500/25",
            disabled && "cursor-not-allowed opacity-50 hover:bg-cyan-500",
          )}
        >
          <ArrowsExchange className="size-3.5" strokeWidth={2.2} />
        </button>
      </TooltipHost>
      {open && deal && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              role="listbox"
              className="max-h-[320px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--dropdown-solid-bg)] py-1 shadow-[0_12px_32px_rgba(15,23,42,0.18)] v2-dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: 240,
                zIndex: "var(--z-popover)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <MoveToStageMenu
                stages={stages}
                currentStageId={deal.stageId}
                currentPipelineId={pipelineId}
                isPending={moveMutation.isPending}
                header={
                  <div className="px-3 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Mover para
                  </div>
                }
                onSelect={(stageId, toPipelineId) => {
                  moveMutation.mutate({
                    dealId: deal.id,
                    fromStageId: deal.stageId,
                    toStageId: stageId,
                    toPipelineId,
                  });
                  close();
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Trigger de troca de etapa — popover com lista vertical de todas as
 * etapas. Extraído para ser ancorado DENTRO do header slate-100 do
 * card ativo (antes morava na faixa branca abaixo, junto do stepper).
 */
export function DealStageSelector({
  deal,
  stages,
  pipelineId,
  statusFilter,
  onMoved,
  showValue = true,
}: DealStageSelectorProps) {
  const [stageOpen, setStageOpen] = React.useState(false);
  const canChangeStage = useCan("deal:change_stage");
  const moveMutation = useMoveMutation({
    pipelineId,
    statusFilter,
    stages,
    onMoved,
  });

  const currentStage = stages.find((s) => s.id === deal.stageId) ?? null;
  const stageColor = currentStage?.color ?? "#6366f1";

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!canChangeStage) return;
          setStageOpen((v) => !v);
        }}
        disabled={moveMutation.isPending || !canChangeStage}
        title={
          canChangeStage ? undefined : "Sem permissão para mover entre etapas"
        }
        aria-haspopup="listbox"
        aria-expanded={stageOpen}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-xl border border-border bg-[var(--color-bg-card)] px-3 py-2.5 text-left transition-all hover:border-[var(--glass-border)] dark:bg-[var(--glass-bg-base)]/50 dark:hover:border-slate-600",
          stageOpen &&
            "border-[var(--color-brand-primary)] bg-[var(--color-bg-card)] shadow-[0_0_0_3px_rgba(37,99,235,0.12)] dark:bg-[var(--glass-bg-base)]/80",
          (moveMutation.isPending || !canChangeStage) && "cursor-wait opacity-60",
          !canChangeStage && "cursor-default hover:border-border",
        )}
      >
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: stageColor }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
          Etapa
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold tracking-tight text-foreground">
          {currentStage?.name ?? "—"}
        </span>
        {showValue && deal.value != null && (
          <span className="shrink-0 text-[12px] font-bold tabular-nums tracking-tight text-foreground">
            {formatCurrency(dealValue(deal))}
          </span>
        )}
        {/* Chevron vira 180° quando aberto — affordance clara de
            "este elemento abre uma lista". Substitui o antigo
            ArrowRightLeft rotacionado, que deixava a intenção
            menos evidente. */}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[var(--text-muted)] transition-transform dark:text-[var(--text-muted)]",
            stageOpen && "rotate-180 text-[var(--color-info)] dark:text-[var(--color-info)]",
          )}
          strokeWidth={2.5}
        />
      </button>

      <AnimatePresence>
        {stageOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            // z-50 + popover próprio: como o card ativo agora NÃO tem
            // overflow-hidden, a lista aparece inteira sobre qualquer
            // elemento abaixo. max-h calibrada pra caber ~7 etapas
            // sem precisar rolar; caso ultrapasse, o scroll custom
            // aparece só quando necessário.
            className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-2xl border border-border bg-[var(--color-bg-card)] shadow-[0_20px_48px_-16px_rgba(15,23,42,0.28)] dark:bg-[var(--glass-bg-base)] dark:shadow-[0_20px_48px_-16px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--glass-border-subtle)] px-3 py-2 dark:border-[var(--glass-border)]">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                Mover para
              </span>
              <span className="text-[10px] font-bold tabular-nums text-[var(--color-ink-muted)]">
                {stages.length} etapas
              </span>
            </div>
            <MoveToStageMenu
              stages={stages}
              currentStageId={deal.stageId}
              currentPipelineId={pipelineId}
              isPending={moveMutation.isPending}
              onSelect={(stageId, toPipelineId) => {
                moveMutation.mutate({
                  dealId: deal.id,
                  fromStageId: deal.stageId,
                  toStageId: stageId,
                  toPipelineId,
                });
                setStageOpen(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * DealStageBar — progress-bar de etapas "sabor Kommo" (dentro do card).
 * ────────────────────────────────────────────────────────────────────
 * Substitui o antigo `DealStageSelector` dropdown dentro do
 * `ActiveContactCard`. Mostra o pipeline como UMA barra contínua
 * flat, dividida em segmentos clicáveis por finos separadores
 * brancos. Clicar em qualquer segmento move o deal pra aquela etapa.
 *
 * DNA visual:
 *   Linha 1 — Label "ETAPA" + bullet + nome da etapa em foco
 *             (hover se houver, senão a atual).
 *   Linha 2 — Barra horizontal contínua de 8px:
 *               • Etapa atual  → cor sólida + altura 14px (pop) +
 *                                 ring branco interno + seta ▲ abaixo
 *               • Anteriores   → cor da etapa com 55% alpha
 *               • Futuras      → `bg-slate-200` (vazio "por fazer")
 *               • Hover        → altura sobe pra 12px + brilho
 *             Separadores brancos de 2px entre segmentos
 *             (simulados via `box-shadow: inset -1px 0 0 white`)
 *             pra comunicar "sequência" sem gaps visíveis.
 *
 * Motivo do redesign: as pílulas rounded-full anteriores pareciam
 * "balas isoladas". A nova barra contínua dá identidade de PROGRESSO
 * — o operador enxerga instantaneamente onde o deal está, por onde
 * já passou e o que falta.
 */
export function DealStageBar({
  deal,
  stages,
  pipelineId,
  statusFilter,
  onMoved,
}: DealActionsProps) {
  const [hoverStageId, setHoverStageId] = React.useState<string | null>(null);
  const canChangeStage = useCan("deal:change_stage");

  const moveMutation = useMoveMutation({
    pipelineId,
    statusFilter,
    stages,
    onMoved,
  });

  const currentIdx = stages.findIndex((s) => s.id === deal.stageId);
  const currentStage = currentIdx >= 0 ? stages[currentIdx] : null;
  const hoverStage = hoverStageId
    ? stages.find((s) => s.id === hoverStageId)
    : null;

  const shownStage = hoverStage ?? currentStage;
  const shownName = shownStage?.name ?? "—";
  const shownColor = shownStage?.color ?? "#6366f1";

  return (
    <div
      className="flex flex-col gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Label superior: "ETAPA" + bullet + nome da etapa em foco. */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
          Etapa
        </span>
        <span
          className="size-2 shrink-0 rounded-full transition-colors"
          style={{ backgroundColor: shownColor }}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold tracking-tight text-foreground">
          {shownName}
        </span>
        {moveMutation.isPending && (
          <span className="text-[10px] font-bold text-[var(--color-ink-muted)]">
            movendo…
          </span>
        )}
        {!canChangeStage && (
          <span className="text-[10px] font-bold text-[var(--color-ink-muted)]">
            só leitura
          </span>
        )}
      </div>

      {/* Barra contínua. Padding vertical invisível amplia a hit-area
          pra clicar ser fácil mesmo com a barra visual fina. */}
      <div
        className="relative flex h-[14px] w-full items-center py-1"
        onMouseLeave={() => setHoverStageId(null)}
        role="group"
        aria-label="Mover deal entre etapas"
      >
        <div className="flex h-full w-full overflow-hidden rounded-full bg-[var(--color-border)] dark:bg-slate-700">
          {stages.map((stage, idx) => {
            const isCurrent = stage.id === deal.stageId;
            const isPast = currentIdx >= 0 && idx < currentIdx;
            const isHovered = stage.id === hoverStageId;
            const isLast = idx === stages.length - 1;

            // Estado visual:
            //   • current → cor sólida 100%
            //   • past    → cor da etapa em 55% alpha (rastro)
            //   • future  → transparente (herda slate-200 do trilho)
            let background: string | undefined;
            if (isCurrent) background = stage.color;
            else if (isPast) background = `${stage.color}8c`; // ~55% alpha

            return (
              <motion.button
                key={stage.id}
                type="button"
                onClick={() => {
                  if (!canChangeStage || isCurrent || moveMutation.isPending) return;
                  moveMutation.mutate({
                    dealId: deal.id,
                    fromStageId: deal.stageId,
                    toStageId: stage.id,
                  });
                }}
                onMouseEnter={() => setHoverStageId(stage.id)}
                disabled={moveMutation.isPending || !canChangeStage}
                aria-label={
                  isCurrent
                    ? `Etapa atual: ${stage.name}`
                    : `Mover para ${stage.name}`
                }
                aria-current={isCurrent}
                animate={{
                  opacity:
                    isHovered || isCurrent || hoverStageId === null
                      ? 1
                      : 0.85,
                }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "relative h-full flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-primary)]/50",
                  canChangeStage &&
                    !isCurrent &&
                    !moveMutation.isPending &&
                    "cursor-pointer",
                  (isCurrent || !canChangeStage) && "cursor-default",
                  moveMutation.isPending &&
                    !isCurrent &&
                    "cursor-wait opacity-70",
                )}
                style={{
                  backgroundColor: background,
                  // Separador branco sutil entre segmentos (evita o
                  // "bloco colorido contínuo sem leitura"). Invisível
                  // no último segmento.
                  boxShadow: isLast
                    ? undefined
                    : "inset -1px 0 0 rgba(255,255,255,0.9)",
                }}
              >
                {/* Destaque do hover — barra interna azul finíssima
                    no topo do segmento alvo. Não desloca layout. */}
                {isHovered && !isCurrent && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--color-brand-primary)]"
                    aria-hidden
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Marcador de POSIÇÃO ATUAL — um "pin" fino vertical que
            atravessa a barra do topo à base, com cabeça colorida
            acima. Anima via layoutId quando o deal muda de etapa.
            Largura absoluta calculada via % do currentIdx. */}
        {currentStage && currentIdx >= 0 && stages.length > 0 && (
          <motion.div
            layoutId={`deal-stage-pin-${deal.id}`}
            transition={SUBTLE_SPRING}
            className="pointer-events-none absolute top-0 flex h-full flex-col items-center"
            style={{
              left: `calc(${((currentIdx + 0.5) / stages.length) * 100}% - 3px)`,
            }}
          >
            <span
              className="absolute inset-y-0 w-[3px] rounded-full ring-2 ring-white"
              style={{ backgroundColor: currentStage.color }}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

/**
 * Stepper visual compacto: uma barrinha por etapa, preenchidas até a
 * etapa atual. Sem botões nem actions — é só um indicador de progresso.
 * Foi extraído do antigo `DealActions` pra poder morar no rodapé do
 * header slate-100 do card ativo (sem competir por espaço com outras
 * ações que migraram pro header do chat).
 */
export function DealStepper({
  deal,
  stages,
}: Pick<DealActionsProps, "deal" | "stages">) {
  const stageIdx = stages.findIndex((s) => s.id === deal.stageId);
  const currentStage = stageIdx >= 0 ? stages[stageIdx] : null;
  const stageColor = currentStage?.color ?? "#6366f1";

  return (
    <div className="flex gap-1">
      {stages.map((s, i) => {
        const filled = stageIdx >= 0 && i <= stageIdx;
        return (
          <motion.div
            key={s.id}
            layout
            transition={SUBTLE_SPRING}
            className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]/70"
          >
            <motion.div
              layout
              animate={{ width: filled ? "100%" : "0%" }}
              transition={SUBTLE_SPRING}
              className="h-full rounded-full"
              style={{ backgroundColor: stageColor }}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Ganho / Perdido em uma única linha horizontal compacta. Por pedido
 * do operador ("otimizar o card") esses botões saíram do rodapé do
 * card ativo e passaram a morar no header do chat — área permanente
 * da tela, sempre acessível enquanto a conversa está aberta.
 *
 * Variante visual: tons suaves (emerald-50 / red-50) quando a
 * ação ainda é possível; tom sólido e shadow quando o deal já
 * está travado no status respectivo.
 */
export function DealOutcomeButtons({
  deal,
  pipelineId,
  className,
}: Pick<DealActionsProps, "deal" | "pipelineId"> & { className?: string }) {
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: async (vars: StatusPayload) => {
      const res = await fetch(apiUrl(`/api/deals/${vars.dealId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: vars.status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "Não foi possível atualizar o status.",
        );
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(
        vars.status === "WON" ? "Negócio ganho" : "Negócio perdido",
        { duration: 2000 },
      );
      queryClient.invalidateQueries({
        queryKey: ["pipeline-board", pipelineId],
      });
      queryClient.invalidateQueries({ queryKey: ["sales-hub"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    },
  });

  const dealStatus = (deal.status ?? "OPEN").toUpperCase() as
    | "OPEN"
    | "WON"
    | "LOST";

  // DNA design-system: estrutura idêntica a soft chips (rounded-full,
  // px-2 py-0.5, text-12 medium). Estado "venceu/perdeu" promove o
  // chip a um tom sólido sem mudar a forma.
  const baseChip =
    "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-60";

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          statusMutation.mutate({ dealId: deal.id, status: "WON" });
        }}
        whileTap={{ scale: 0.97 }}
        transition={SUBTLE_SPRING}
        disabled={statusMutation.isPending || dealStatus === "WON"}
        className={cn(
          baseChip,
          "min-w-0 flex-1",
          dealStatus === "WON"
            ? "bg-[var(--color-success)] text-white"
            : "bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:bg-[var(--color-success-bg)]",
        )}
      >
        <Trophy className="size-3.5" strokeWidth={2} />
        Ganho
      </motion.button>
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          statusMutation.mutate({ dealId: deal.id, status: "LOST" });
        }}
        whileTap={{ scale: 0.97 }}
        transition={SUBTLE_SPRING}
        disabled={statusMutation.isPending || dealStatus === "LOST"}
        className={cn(
          baseChip,
          "min-w-0 flex-1",
          dealStatus === "LOST"
            ? "bg-[var(--color-danger)] text-white"
            : "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] hover:bg-[var(--color-rose-soft)]",
        )}
      >
        <XCircle className="size-3.5" strokeWidth={2} />
        Perdido
      </motion.button>
    </div>
  );
}
