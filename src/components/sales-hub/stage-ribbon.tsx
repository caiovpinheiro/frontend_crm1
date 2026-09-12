"use client";

/**
 * StageRibbon — controle segmentado das etapas do funil no Flow.
 * Trilha única, segmentos de largura igual; a faixa rola na horizontal quando não cabe.
 * O ScrollMap do Flow (mesmo do Kanban) navega esse recorte.
 */

import { type RefObject } from "react";

import { formatCount } from "@/lib/dashboard-tokens";
import { cn, getContrastColor } from "@/lib/utils";

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

function stageTone(color: string): { bg: string; fg: string } {
  return { bg: color, fg: getContrastColor(color) };
}

export function StageRibbon({
  stages,
  totalDeals,
  selectedStageId,
  onSelectStage,
  compact = false,
  scrollerRef,
}: StageRibbonProps) {
  const items = [
    {
      id: null as string | null,
      label: "Todos",
      count: totalDeals,
      color: "var(--brand-primary, #5b6ff5)",
    },
    ...stages.map((stage) => ({
      id: stage.id as string | null,
      label: stage.name,
      count: stage.count,
      color: stage.color || "#64748b",
    })),
  ];

  return (
    <div
      className={cn(
        "relative w-full min-w-0 shrink-0",
        compact ? "mb-2" : "mb-3",
      )}
    >
      <div
        ref={scrollerRef}
        className="w-full min-w-0 overflow-x-auto scrollbar-none"
        role="tablist"
        aria-label="Filtrar por etapa"
      >
        <div className="flex w-full min-w-max items-stretch gap-0.5 rounded-md bg-muted p-1">
          {items.map((item) => {
            const active =
              item.id === null
                ? selectedStageId === null
                : item.id === selectedStageId;
            const tone = stageTone(item.color);
            return (
              <button
                key={item.id ?? "all"}
                type="button"
                role="tab"
                aria-selected={active}
                aria-pressed={active}
                title={item.label}
                onClick={() =>
                  onSelectStage(item.id === null ? null : active ? null : item.id)
                }
                className={cn(
                  "flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
                  !active && "text-muted-foreground hover:text-foreground",
                )}
                style={
                  active
                    ? { backgroundColor: tone.bg, color: tone.fg }
                    : undefined
                }
              >
                {item.label}
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    active ? "opacity-80" : "text-muted-foreground/70",
                  )}
                >
                  {formatCount(item.count)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
