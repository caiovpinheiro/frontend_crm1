"use client";

import { IconPin, IconPinFilled, IconPlus as Plus } from "@tabler/icons-react";

import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { cn } from "@/lib/utils";
import type { ActionStepType } from "@/lib/automation-workflow";
import { stepTypeLabel } from "@/lib/automation-workflow";

import { stepColor, stepIcon } from "./add-step-node";

const PALETTE_DRAG_TYPE = "application/x-automation-step";

export function readPaletteDragType(
  dataTransfer: DataTransfer | null
): ActionStepType | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(PALETTE_DRAG_TYPE);
  if (!raw) return null;
  return raw as ActionStepType;
}

type PaletteItem = { type: ActionStepType };

const GROUPS: { title: string; items: PaletteItem[] }[] = [
  {
    title: "Ações",
    items: [
      { type: "send_email" },
      { type: "move_stage" },
      { type: "mark_deal_won" },
      { type: "mark_deal_lost" },
      { type: "assign_owner" },
      { type: "transfer_department" },
      { type: "add_tag" },
      { type: "remove_tag" },
      { type: "update_field" },
      { type: "create_activity" },
      { type: "update_lead_score" },
      { type: "execute_distribution" },
    ],
  },
  {
    title: "Salesbot",
    items: [
      { type: "question" },
      { type: "wait_for_reply" },
      { type: "set_variable" },
      { type: "goto" },
      { type: "transfer_automation" },
      { type: "tabulate_conversation" },
      { type: "finish_conversation" },
      { type: "finish" },
    ],
  },
  {
    title: "Lógica",
    items: [{ type: "delay" }, { type: "condition" }, { type: "round_robin" }, { type: "business_hours" }, { type: "check_agent_status" }],
  },
  {
    title: "WhatsApp",
    items: [
      { type: "send_whatsapp_message" },
      { type: "send_whatsapp_template" },
      { type: "send_whatsapp_media" },
      { type: "send_whatsapp_interactive" },
      { type: "send_whatsapp_list" },
      { type: "send_whatsapp_flow" },
      { type: "send_product" },
    ],
  },
  {
    title: "Integrações",
    items: [{ type: "webhook" }],
  },
  {
    title: "IA",
    items: [{ type: "transfer_to_ai_agent" }, { type: "ask_ai_agent" }],
  },
];

/**
 * NodePalette — sidebar esquerda do editor de automação com os blocos
 * arrastáveis. Visual glass + ícones por tipo (mesma `stepColor` do
 * AddStepNode/ActionNode).
 */
export function NodePalette({
  className,
  pinned,
  onTogglePin,
  onAdd,
}: {
  className?: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  onAdd?: (type: ActionStepType) => void;
}) {
  return (
    <div
      className={cn(
        "scrollbar-thin flex flex-col gap-4 overflow-y-auto border-r border-[var(--glass-border-subtle)] bg-[var(--glass-bg-base)] p-4 backdrop-blur-xl",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--glass-border-subtle)] pb-3">
        <div className="min-w-0">
          <p className="font-heading text-[15px] font-extrabold tracking-tighter text-[var(--text-primary)]">
            Blocos
          </p>
          <p className="mt-0.5 text-[11px] font-medium tracking-tight text-[var(--text-muted)]">
            Arraste para o canvas
          </p>
        </div>
        {onTogglePin ? (
          <TooltipGlass label={pinned ? "Desafixar" : "Fixar"} side="bottom">
            <button
              type="button"
              aria-label={pinned ? "Desafixar" : "Fixar"}
              aria-pressed={!!pinned}
              onClick={onTogglePin}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors",
                pinned
                  ? "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)]"
              )}
            >
              {pinned ? (
                <IconPinFilled size={16} stroke={1.7} />
              ) : (
                <IconPin size={16} stroke={1.7} />
              )}
            </button>
          </TooltipGlass>
        ) : null}
      </div>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
            {g.title}
          </p>
          <ul className="flex flex-col gap-1">
            {g.items.map(({ type }) => {
              const Icon = stepIcon[type] ?? Plus;
              const color = stepColor[type] ?? "text-[var(--text-muted)]";
              return (
                <li key={type}>
                  <button
                    type="button"
                    data-step-type={type}
                    draggable
                    onClick={() => onAdd?.(type)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(PALETTE_DRAG_TYPE, type);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="group/item flex w-full cursor-grab items-center gap-2.5 rounded-xl border border-[var(--glass-border-subtle)] bg-[var(--color-bg-card)] px-2.5 py-2 text-left transition-all duration-200 hover:-translate-y-px hover:border-primary/30 hover:bg-[var(--color-primary-soft)]/40 hover:shadow-[var(--shadow-indigo-glow)] active:cursor-grabbing"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-subtle)] ring-1 ring-[var(--color-border)] transition-all group-hover/item:scale-105 group-hover/item:bg-[var(--color-bg-card)] group-hover/item:ring-primary/20",
                        color
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] font-bold leading-tight tracking-tight text-foreground">
                      {stepTypeLabel(type)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export { PALETTE_DRAG_TYPE };
