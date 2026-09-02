"use client";

/**
 * StageRibbon — chevrons encadeados do funil no Flow.
 * Preenchem a largura (flex-1); ativo = cor sólida; inativo = pastel.
 * Etapas (exceto Todos / ganho / perdido) podem ser reordenadas arrastando
 * o próprio chevron — mesmo contrato de Configurações do funil.
 */

import { useRef, useState, type DragEvent } from "react";

import { cn } from "@/lib/utils";

type StageRibbonStage = {
  id: string;
  name: string;
  color: string;
  count: number;
  /** Ganho/perdido — não entra no drag (igual Configurações). */
  locked?: boolean;
};

type StageRibbonProps = {
  stages: StageRibbonStage[];
  totalDeals: number;
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
  /** Menos altura — com deal ativo no hub, libera espaço para o chat. */
  compact?: boolean;
  /** Persistência da nova ordem (`stageIds`). Sem callback, o drag fica off. */
  onReorderStages?: (orderedIds: string[]) => void;
};

/** Primeiro segmento: borda reta à esquerda, ponta à direita. */
const CLIP_FIRST =
  "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)";
/** Demais: entalhe à esquerda (encaixa no chevron anterior). */
const CLIP_CHEVRON =
  "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";

function StageChevron({
  label,
  count,
  color,
  active,
  first,
  compact,
  onClick,
  draggable = false,
  dragging = false,
  dropTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  label: string;
  count: number | string;
  color: string;
  active: boolean;
  first: boolean;
  compact: boolean;
  onClick: () => void;
  draggable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: (e: DragEvent<HTMLButtonElement>) => void;
  onDragOver?: (e: DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: (e: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: (e: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-pressed={active}
      title={draggable ? `${label} — arraste para reordenar` : label}
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        clipPath: first ? CLIP_FIRST : CLIP_CHEVRON,
        backgroundColor: active
          ? color
          : `color-mix(in srgb, ${color} 16%, #ffffff)`,
        color: active ? "#ffffff" : color,
      }}
      className={cn(
        "relative flex w-[132px] shrink-0 items-center justify-center gap-1.5 font-display font-semibold tracking-tight transition-[filter,opacity] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 md:w-auto md:min-w-0 md:flex-1 md:basis-0",
        first ? "pl-2.5 pr-4 sm:pl-3 sm:pr-5" : "pl-4 pr-4 sm:pl-5 sm:pr-5",
        compact ? "h-8 text-[11.5px] sm:h-9 sm:text-[12px]" : "h-9 text-[12px] sm:h-10 sm:text-[12.5px]",
        active ? "z-[1]" : "hover:brightness-[0.97]",
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "z-[2] opacity-45",
        dropTarget && "ring-2 ring-primary/45 ring-offset-1",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span
        className={cn(
          "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums leading-none sm:h-[22px] sm:min-w-[22px] sm:text-[11px]",
        )}
        style={
          active
            ? { backgroundColor: "rgba(255,255,255,0.28)", color: "#ffffff" }
            : {
                backgroundColor: `color-mix(in srgb, ${color} 22%, #ffffff)`,
                color: `color-mix(in srgb, ${color} 82%, #1a1a1a)`,
              }
        }
      >
        {count}
      </span>
    </button>
  );
}

function moveId(ids: string[], fromId: string, toId: string): string[] {
  const next = [...ids];
  const from = next.indexOf(fromId);
  const to = next.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return ids;
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

export function StageRibbon({
  stages,
  totalDeals,
  selectedStageId,
  onSelectStage,
  compact = false,
  onReorderStages,
}: StageRibbonProps) {
  const allActive = selectedStageId === null;
  const allColor = "var(--brand-primary, #5b6ff5)";
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const skipClickRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);
  const dragOriginXRef = useRef(0);
  const canReorder =
    Boolean(onReorderStages) && stages.filter((s) => !s.locked).length > 1;

  function handleStageClick(stageId: string, isActive: boolean) {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    onSelectStage(isActive ? null : stageId);
  }

  return (
    <div
      className={cn(
        "relative w-full min-w-0 shrink-0",
        compact ? "mb-2" : "mb-3",
      )}
    >
      <div
        className="flex w-full min-w-0 items-stretch gap-1 overflow-x-auto scrollbar-none md:overflow-visible"
        role="tablist"
        aria-label="Filtrar por etapa"
      >
        <StageChevron
          label="Todos"
          count={totalDeals}
          color={allColor}
          active={allActive}
          first
          compact={compact}
          onClick={() => onSelectStage(null)}
        />

        {stages.map((stage) => {
          const isActive = stage.id === selectedStageId;
          const draggable = canReorder && !stage.locked;
          return (
            <StageChevron
              key={stage.id}
              label={stage.name}
              count={stage.count}
              color={stage.color || "#64748b"}
              active={isActive}
              first={false}
              compact={compact}
              draggable={draggable}
              dragging={draggingId === stage.id}
              dropTarget={dropId === stage.id && draggingId !== stage.id}
              onClick={() => handleStageClick(stage.id, isActive)}
              onDragStart={
                draggable
                  ? (e) => {
                      e.dataTransfer.setData("text/plain", stage.id);
                      e.dataTransfer.effectAllowed = "move";
                      draggingIdRef.current = stage.id;
                      dragOriginXRef.current = e.clientX;
                      skipClickRef.current = false;
                      setDraggingId(stage.id);
                    }
                  : undefined
              }
              onDragOver={
                draggable
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const source = draggingIdRef.current;
                      if (source && source !== stage.id) setDropId(stage.id);
                    }
                  : undefined
              }
              onDragLeave={
                draggable
                  ? () => {
                      setDropId((cur) => (cur === stage.id ? null : cur));
                    }
                  : undefined
              }
              onDrop={
                draggable
                  ? (e) => {
                      e.preventDefault();
                      const sourceId =
                        e.dataTransfer.getData("text/plain") ||
                        draggingIdRef.current;
                      skipClickRef.current = true;
                      draggingIdRef.current = null;
                      setDropId(null);
                      setDraggingId(null);
                      if (!sourceId || sourceId === stage.id || !onReorderStages) {
                        return;
                      }
                      const ids = stages.map((s) => s.id);
                      const next = moveId(ids, sourceId, stage.id);
                      if (next === ids) return;
                      onReorderStages(next);
                    }
                  : undefined
              }
              onDragEnd={(e) => {
                if (Math.abs(e.clientX - dragOriginXRef.current) > 6) {
                  skipClickRef.current = true;
                }
                draggingIdRef.current = null;
                setDraggingId(null);
                setDropId(null);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
