"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "@tabler/icons-react";

import type { PipelineListStageDto } from "@/features/pipeline-v2/api";
import { MoveToStageMenu } from "@/features/pipeline-v2/extras/move-to-stage-menu";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// InboxStageDropdown — dropdown glass de troca de fase para o DealCard
// do ContactAside (inbox). Mesmo padrão visual do StageDropdown do pipeline.
// ─────────────────────────────────────────────────────────────────
export function InboxStageDropdown({
  stages,
  currentStageId,
  currentPipelineId,
  isPending,
  canMove = true,
  onSelect,
}: {
  stages: PipelineListStageDto[];
  currentStageId: string | null;
  currentPipelineId: string | null;
  isPending: boolean;
  canMove?: boolean;
  onSelect: (stageId: string, toPipelineId?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const current = stages.find((s) => s.id === currentStageId);
  const disabled = isPending || !canMove;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      // Fecha ao clicar fora — o menu esta portado no body entao precisa
      // checar tambem se o clique caiu dentro do menu.
      const menu = document.getElementById("inbox-stage-dropdown-menu");
      if (menu?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Calcula posicao do trigger em coord de viewport (position:fixed) para o
  // portal — evita clip pelo overflow do aside e garante que o menu apareca
  // sempre por cima, sem "vazar" para fora quando encosta na borda direita.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const b = triggerRef.current.getBoundingClientRect();
    const longest = stages.reduce((n, s) => Math.max(n, s.name.length), 0);
    const menuWidth = Math.min(
      Math.max(220, longest * 8 + 48),
      Math.min(320, window.innerWidth - 16),
    );
    const wouldOverflow = b.left + menuWidth > window.innerWidth - 8;
    const left = wouldOverflow ? Math.max(8, b.right - menuWidth) : b.left;
    setPos({ top: b.bottom + 4, left, width: menuWidth });
  }, [open, stages]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={canMove ? undefined : "Sem permissão para mover entre etapas"}
        onClick={() => {
          if (!canMove) return;
          setOpen((v) => !v);
        }}
        className={cn(
          "flex max-w-[min(100%,11rem)] items-center gap-1 font-display text-[11px] font-semibold text-[var(--text-muted)] transition-opacity hover:text-[var(--text-primary)] hover:opacity-80 disabled:opacity-50",
          isPending && "cursor-wait",
          !canMove && "cursor-default hover:opacity-100 hover:text-[var(--text-muted)]",
        )}
      >
        {current?.color && (
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: current.color }}
          />
        )}
        <span className="truncate">{current?.name ?? "Sem estagio"}</span>
        <IconChevronDown
          size={11}
          className={cn("shrink-0 transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            id="inbox-stage-dropdown-menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-(--z-popover) overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white py-1 shadow-[0_12px_32px_rgba(15,20,40,0.18)] v2-dark:bg-[#1a1f2e] v2-dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
          >
            <MoveToStageMenu
              stages={stages}
              currentStageId={currentStageId}
              currentPipelineId={currentPipelineId}
              isPending={isPending}
              onSelect={(stageId, toPipeId) => {
                onSelect(stageId, toPipeId);
                setOpen(false);
              }}
            />
          </div>,
          document.body,
        )
      }
    </div>
  );
}
