"use client";

/**
 * Campo "Motivo da perda" nas Informações do Negócio.
 * Clique → funis (scoped) → motivos do funil. Grava só `Deal.lostReason`.
 *
 * Usa portal + posição fixed (mesmo padrão de TagsPopover) — o DropdownMenu
 * genérico desalinha neste aside por causa do zoom `.v2-root`.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { updateDeal } from "@/features/pipeline-v2/api/deals";
import { usePipelines } from "@/features/pipeline-v2/hooks";
import { dealDetailKey } from "@/features/pipeline-v2/hooks/use-deal-detail";
import { usePipelineLossReasons } from "@/features/pipeline-v2/hooks/use-pipeline-loss-reasons";
import {
  computePopoverPosition,
  usePortalPopover,
} from "@/features/pipeline-v2/extras/use-portal-popover";
import { cn } from "@/lib/utils";

type Props = {
  dealId: string;
  value?: string | null;
  compact?: boolean;
  className?: string;
};

const POPOVER_W = 260;
const POPOVER_H = 320;

export function DealLostReasonField({ dealId, value, compact = true, className }: Props) {
  const qc = useQueryClient();
  const { open, rect, triggerRef, popoverRef, toggle, close } = usePortalPopover();
  const [view, setView] = useState<
    { kind: "pipelines" } | { kind: "reasons"; pipelineId: string; pipelineName: string }
  >({ kind: "pipelines" });

  const { data: pipelines = [], isLoading: loadingPipelines } = usePipelines(open);
  const pipelineId = view.kind === "reasons" ? view.pipelineId : "";
  // Mesma chave do kanban/diálogo de perda (`pipeline-loss-reasons`): antes
  // uma chave própria refazia o GET já em cache.
  const { data: lossMeta, isLoading: loadingReasons } = usePipelineLossReasons(
    pipelineId || null,
    { enabled: open && view.kind === "reasons" },
  );
  const reasons = lossMeta?.reasons ?? [];

  useEffect(() => {
    if (!open) setView({ kind: "pipelines" });
  }, [open]);

  const save = useMutation({
    mutationFn: (lostReason: string | null) => updateDeal(dealId, { lostReason }),
    onSuccess: (_data, lostReason) => {
      void qc.invalidateQueries({ queryKey: dealDetailKey(dealId) });
      void qc.invalidateQueries({ queryKey: ["pipeline-board"] });
      close();
      toast.success(
        lostReason?.trim()
          ? "Motivo da perda atualizado"
          : "Motivo da perda removido",
      );
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Falha ao salvar motivo"),
  });

  const display = value?.trim() || "";
  const triggerLabel = display || "+ Adicionar";
  const pos = computePopoverPosition(rect, POPOVER_H, POPOVER_W);

  return (
    <div
      className={cn(
        compact
          ? "flex min-w-0 max-w-full items-center justify-between gap-2 py-2 text-sm"
          : "flex min-w-0 flex-col gap-1 rounded-xl border border-slate-100 bg-white p-3",
        className,
      )}
    >
      <span
        className={cn(
          compact
            ? "w-[38%] shrink-0 text-[12px] font-medium leading-tight text-slate-500"
            : "text-[10px] font-bold uppercase tracking-wider text-slate-400",
        )}
      >
        Motivo da perda
      </span>
      <div
        className={cn(
          "flex min-w-0 items-center gap-1",
          compact ? "max-w-full flex-1" : "",
        )}
      >
        <button
          ref={triggerRef}
          type="button"
          disabled={save.isPending}
          onClick={toggle}
          className={cn(
            "flex min-w-0 flex-1 items-center text-left font-display text-[12px] font-semibold transition-colors",
            display
              ? "text-[var(--text-primary)] hover:text-[var(--brand-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--brand-primary)]",
            save.isPending && "opacity-60",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
        </button>
        {display ? (
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--color-danger)]"
            title="Limpar motivo"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
          >
            <IconX size={12} />
          </button>
        ) : null}
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              role="menu"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: POPOVER_W,
                zIndex: 80,
              }}
              className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--color-bg-card)] p-1.5 text-[var(--text-primary)] shadow-xl backdrop-blur-xl"
            >
              {view.kind === "pipelines" ? (
                <>
                  <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Selecione o funil
                  </p>
                  <div className="max-h-64 overflow-y-auto">
                    {loadingPipelines ? (
                      <p className="px-2 py-3 text-[12px] text-[var(--text-muted)]">
                        Carregando funis…
                      </p>
                    ) : pipelines.length === 0 ? (
                      <p className="px-2 py-3 text-[12px] text-[var(--text-muted)]">
                        Nenhum funil disponível para o seu usuário.
                      </p>
                    ) : (
                      pipelines.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]"
                          onClick={() =>
                            setView({
                              kind: "reasons",
                              pipelineId: p.id,
                              pipelineName: p.name,
                            })
                          }
                        >
                          <span className="truncate">{p.name}</span>
                          <IconChevronRight
                            size={14}
                            className="shrink-0 text-[var(--text-muted)]"
                          />
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="mb-0.5 flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold text-[var(--brand-primary)] hover:bg-[var(--color-primary-soft)]"
                    onClick={() => setView({ kind: "pipelines" })}
                  >
                    <IconChevronLeft size={14} />
                    <span className="truncate">{view.pipelineName}</span>
                  </button>
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Motivo da perda
                  </p>
                  <div className="max-h-56 overflow-y-auto">
                    {loadingReasons ? (
                      <p className="px-2 py-3 text-[12px] text-[var(--text-muted)]">
                        Carregando motivos…
                      </p>
                    ) : reasons.length === 0 ? (
                      <p className="px-2 py-3 text-[12px] text-[var(--text-muted)]">
                        Este funil não tem motivos cadastrados em Configurações →
                        Pipeline.
                      </p>
                    ) : (
                      reasons.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          role="menuitem"
                          className={cn(
                            "flex w-full rounded-lg px-2 py-2 text-left text-[12.5px] font-medium hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
                            display === r.label
                              ? "font-semibold text-[var(--brand-primary)]"
                              : "text-[var(--text-primary)]",
                          )}
                          onClick={() => save.mutate(r.label)}
                        >
                          {r.label}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
