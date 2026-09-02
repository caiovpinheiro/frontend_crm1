"use client";

/**
 * StageRibbon — chevrons encadeados do funil no Flow.
 * Largura mínima por etapa; a faixa rola na horizontal quando não cabe.
 * O ScrollMap do Flow (mesmo do Kanban) navega esse recorte.
 */

import { type RefObject } from "react";

import { cn } from "@/lib/utils";

type StageRibbonStage = {
  id: string;
  name: string;
  color: string;
  count: number;
};

type StageRibbonProps = {
  stages: StageRibbonStage[];
  totalDeals: number;
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
  /** Menos altura — com deal ativo no hub, libera espaço para o chat. */
  compact?: boolean;
  /** Faixa rolável — o ScrollMap do parent usa o mesmo ref. */
  scrollerRef?: RefObject<HTMLDivElement | null>;
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
}: {
  label: string;
  count: number | string;
  color: string;
  active: boolean;
  first: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      style={{
        clipPath: first ? CLIP_FIRST : CLIP_CHEVRON,
        backgroundColor: active
          ? color
          : `color-mix(in srgb, ${color} 16%, #ffffff)`,
        color: active ? "#ffffff" : color,
      }}
      className={cn(
        "relative flex w-[132px] shrink-0 items-center justify-center gap-1.5 font-display font-semibold tracking-tight transition-[filter,opacity] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 md:min-w-[132px] md:w-auto md:flex-1 md:basis-[132px]",
        first ? "pl-2.5 pr-4 sm:pl-3 sm:pr-5" : "pl-4 pr-4 sm:pl-5 sm:pr-5",
        compact ? "h-8 text-[11.5px] sm:h-9 sm:text-[12px]" : "h-9 text-[12px] sm:h-10 sm:text-[12.5px]",
        active ? "z-[1]" : "hover:brightness-[0.97]",
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

export function StageRibbon({
  stages,
  totalDeals,
  selectedStageId,
  onSelectStage,
  compact = false,
  scrollerRef,
}: StageRibbonProps) {
  const allActive = selectedStageId === null;
  const allColor = "var(--brand-primary, #5b6ff5)";

  return (
    <div
      className={cn(
        "relative w-full min-w-0 shrink-0",
        compact ? "mb-2" : "mb-3",
      )}
    >
      <div
        ref={scrollerRef}
        className="flex w-full min-w-0 items-stretch gap-1 overflow-x-auto scrollbar-none"
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
          return (
            <StageChevron
              key={stage.id}
              label={stage.name}
              count={stage.count}
              color={stage.color || "#64748b"}
              active={isActive}
              first={false}
              compact={compact}
              onClick={() => onSelectStage(isActive ? null : stage.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
