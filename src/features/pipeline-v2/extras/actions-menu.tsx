"use client";

/*
 * Menu de ações ("...") + handler do botão "Ganhar" do header do
 * DealDetailPanel. PUT /api/deals/:id/status via useSetDealStatus.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconTrash,
  IconCircleX,
  IconCircleCheck,
  IconRefresh,
  IconCopy,
} from "@tabler/icons-react";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { useConfirm } from "@/components/ui/confirm-dialog";

import { LossReasonDialog } from "@/components/pipeline/loss-reason-dialog";
import { DuplicateDealDialog } from "@/features/pipeline-v2/extras/duplicate-deal-dialog";
import {
  useDeleteDeal,
  usePipelineLossReasons,
  useSetDealStatus,
} from "@/features/pipeline-v2/hooks";
import type { DealStatus, StatusFilter } from "@/features/pipeline-v2/api";

interface DealActionsMenuProps {
  dealId: string | null;
  currentStatus: DealStatus | string;
  pipelineId: string | null;
  statusFilter?: StatusFilter;
  trigger: React.ReactNode;
  /** Notifica o caller para fechar o detail panel apos exclusao. */
  onDeleted?: () => void;
}

export function DealActionsMenu({
  dealId,
  currentStatus,
  pipelineId,
  statusFilter = "OPEN",
  trigger,
  onDeleted,
}: DealActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  const setStatus = useSetDealStatus(pipelineId, statusFilter);
  const deleteDealMut = useDeleteDeal(pipelineId, statusFilter);
  const { confirm, dialog } = useConfirm();

  const { data: lossMeta } = usePipelineLossReasons(pipelineId);
  const lossReasonsActive = Boolean(lossMeta?.lossReasonRequired);

  useEffect(() => {
    if (!open) return;
    // Calcula posição fixed a partir do trigger para escapar de overflow:hidden
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      // O dropdown é renderizado via portal em document.body (fora do
      // containerRef), então precisa ser checado à parte — senão um clique
      // num item do menu conta como "fora", fecha o menu no mousedown e o
      // onClick do botão nunca dispara (ex.: "Excluir negócio" sem efeito).
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !(dropdownRef.current && dropdownRef.current.contains(target))
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function apply(status: DealStatus, lostReason?: string) {
    if (!dealId) return;
    setStatus.mutate(
      { dealId, status, lostReason },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        disabled={!dealId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>

      {open && dropdownPos && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="w-56 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-white py-1.5 shadow-[0_8px_32px_rgba(15,20,40,0.18)]"
          style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right, zIndex: "var(--z-popover)" }}
          role="menu"
        >
          {/* Status group */}
          <div className="px-3 pb-1 pt-0.5">
            <span className="font-display text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Alterar status
            </span>
          </div>

          {currentStatus !== "LOST" && (
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={() => {
                setOpen(false);
                if (lossReasonsActive) setLostDialogOpen(true);
                else apply("LOST");
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[13px] font-semibold text-[#dc2626] transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <IconCircleX size={15} strokeWidth={2} />
              Marcar como perdido
            </button>
          )}
          {currentStatus !== "WON" && (
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={() => apply("WON")}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[13px] font-semibold text-[#16a34a] transition-colors hover:bg-green-50 disabled:opacity-50"
            >
              <IconCircleCheck size={15} strokeWidth={2} />
              Marcar como ganho
            </button>
          )}
          {currentStatus !== "OPEN" && (
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={() => apply("OPEN")}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)] disabled:opacity-50"
            >
              <IconRefresh size={15} strokeWidth={2} />
              Reabrir negócio
            </button>
          )}

          <button
            type="button"
            disabled={!dealId}
            onClick={() => {
              setOpen(false);
              setDuplicateOpen(true);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)] disabled:opacity-50"
          >
            <IconCopy size={15} strokeWidth={2} />
            Duplicar negócio
          </button>

          {/* Separator */}
          <div className="mx-3 my-1.5 h-px bg-slate-100" />

          {/* Danger zone */}
          <button
            type="button"
            disabled={!dealId || deleteDealMut.isPending}
            onClick={async () => {
              if (!dealId) return;
              const ok = await confirm({
                title: "Excluir negócio?",
                description: "Esta ação não pode ser desfeita.",
                confirmLabel: "Excluir",
                destructive: true,
              });
              if (!ok) return;
              deleteDealMut.mutate(
                { dealId },
                {
                  onSuccess: () => {
                    setOpen(false);
                    onDeleted?.();
                  },
                },
              );
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[13px] font-semibold text-[#dc2626] transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            <IconTrash size={14} strokeWidth={2} />
            Excluir negócio
          </button>
        </div>,
        document.body,
      )}

      {dialog}

      {/* Tabulação do motivo da perda (catálogo + "Outro") */}
      <DuplicateDealDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        dealId={dealId}
      />
      <LossReasonDialog
        open={lostDialogOpen}
        onOpenChange={setLostDialogOpen}
        pipelineId={pipelineId}
        isPending={setStatus.isPending}
        onConfirm={(reason) => {
          apply("LOST", reason);
          setLostDialogOpen(false);
        }}
      />
    </div>
  );
}

interface DealDeleteButtonProps {
  dealId: string | null;
  pipelineId: string | null;
  statusFilter?: StatusFilter;
  /** Notifica o caller para fechar o detail panel apos exclusao. */
  onDeleted?: () => void;
  trigger: React.ReactNode;
}

/**
 * Botão dedicado "Excluir negócio" do header — atalho direto (sem
 * abrir o menu "..."). Reusa useDeleteDeal e pede confirmação.
 */
export function DealDeleteButton({
  dealId,
  pipelineId,
  statusFilter = "OPEN",
  onDeleted,
  trigger,
}: DealDeleteButtonProps) {
  const deleteDealMut = useDeleteDeal(pipelineId, statusFilter);
  const { confirm, dialog } = useConfirm();

  async function handleClick() {
    if (!dealId) return;
    const ok = await confirm({
      title: "Excluir negócio?",
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    deleteDealMut.mutate(
      { dealId },
      { onSuccess: () => onDeleted?.() },
    );
  }

  return (
    <>
      <TooltipGlass label="Excluir negócio" side="bottom">
        <button
          type="button"
          disabled={!dealId || deleteDealMut.isPending}
          onClick={handleClick}
          className="inline-flex disabled:opacity-60"
          aria-label="Excluir negócio"
        >
          {trigger}
        </button>
      </TooltipGlass>
      {dialog}
    </>
  );
}

interface WinButtonProps {
  dealId: string | null;
  currentStatus: DealStatus | string;
  pipelineId: string | null;
  statusFilter?: StatusFilter;
  trigger: React.ReactNode;
}

/** Botão dedicado "Ganhar" do header — sem dropdown. */
export function WinButton({
  dealId,
  currentStatus,
  pipelineId,
  statusFilter = "OPEN",
  trigger,
}: WinButtonProps) {
  const setStatus = useSetDealStatus(pipelineId, statusFilter);

  const isWon = currentStatus === "WON";

  function handleClick() {
    if (!dealId) return;
    setStatus.mutate({
      dealId,
      status: isWon ? "OPEN" : "WON",
    });
  }

  return (
    <TooltipGlass label={isWon ? "Reabrir negócio" : "Marcar como ganho"} side="top">
      <button
        type="button"
        disabled={!dealId || setStatus.isPending}
        onClick={handleClick}
        className="inline-flex"
      >
        {trigger}
      </button>
    </TooltipGlass>
  );
}
