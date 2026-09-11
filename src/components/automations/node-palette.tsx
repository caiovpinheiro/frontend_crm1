"use client";

import { useMemo, useState } from "react";
import {
  IconPin,
  IconPinFilled,
  IconPlus as Plus,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { cn } from "@/lib/utils";
import type { ActionStepType } from "@/lib/automation-workflow";
import { stepTypeLabel } from "@/lib/automation-workflow";

import { DISTRIBUTION_LEADS_ENTRY, stepColor, stepIcon } from "./add-step-node";

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const PALETTE_DRAG_TYPE = "application/x-automation-step";

export type PaletteDragPayload = {
  type: ActionStepType;
  /** Config inicial do step (variantes, ex.: Distribuição por Leads). */
  presetConfig?: Record<string, unknown>;
};

export function readPaletteDragType(
  dataTransfer: DataTransfer | null
): PaletteDragPayload | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(PALETTE_DRAG_TYPE);
  if (!raw) return null;
  // Variantes carregam JSON { type, presetConfig }; itens simples, o type puro.
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as PaletteDragPayload;
      if (parsed && typeof parsed.type === "string") return parsed;
    } catch {
      /* cai no formato simples */
    }
  }
  return { type: raw as ActionStepType };
}

type PaletteItem = {
  type: ActionStepType;
  /** Rótulo próprio (variante); default = stepTypeLabel(type). */
  label?: string;
  presetConfig?: Record<string, unknown>;
};

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
      {
        type: DISTRIBUTION_LEADS_ENTRY.type,
        label: DISTRIBUTION_LEADS_ENTRY.label,
        presetConfig: DISTRIBUTION_LEADS_ENTRY.presetConfig,
      },
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
    // Mesmo nome do STEP_GROUPS / modal "O que deseja automatizar?"
    title: "Mensagens",
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
  onAdd?: (type: ActionStepType, presetConfig?: Record<string, unknown>) => void;
}) {
  const [query, setQuery] = useState("");
  const q = normalize(query.trim());
  const filteredGroups = useMemo(() => {
    if (!q) return GROUPS;
    return GROUPS.map((g) => {
      const titleHit = normalize(g.title).includes(q);
      return {
        ...g,
        items: titleHit
          ? g.items
          : g.items.filter((item) => {
              const label = normalize(item.label ?? stepTypeLabel(item.type));
              const type = normalize(item.type.replace(/_/g, " "));
              return label.includes(q) || type.includes(q);
            }),
      };
    }).filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col border-r border-[var(--glass-border-subtle)] bg-[var(--glass-bg-base)] backdrop-blur-xl",
        className
      )}
    >
      <div className="shrink-0 border-b border-[var(--glass-border-subtle)] px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
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
        <div className="relative mt-3">
          <IconSearch
            size={14}
            stroke={2}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar bloco..."
            aria-label="Pesquisar bloco"
            className={cn(
              "h-9 w-full rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]",
              "pl-8 pr-8 text-[13px] tracking-tight text-[var(--text-primary)]",
              "placeholder:font-medium placeholder:text-[var(--text-muted)] outline-none",
              "focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20",
              "[appearance:textfield] [&::-webkit-search-cancel-button]:hidden"
            )}
          />
          {query ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            >
              <IconX size={12} stroke={2.2} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {filteredGroups.length === 0 ? (
          <p className="px-1 py-8 text-center text-[12px] font-medium tracking-tight text-[var(--text-muted)]">
            Nenhum bloco para &quot;{query.trim()}&quot;.
          </p>
        ) : (
          filteredGroups.map((g) => (
            <div key={g.title}>
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                {g.title}
              </p>
              <ul className="flex flex-col gap-1">
                {g.items.map(({ type, label, presetConfig }) => {
                  const Icon = stepIcon[type] ?? Plus;
                  const color = stepColor[type] ?? "text-[var(--text-muted)]";
                  return (
                    <li key={label ?? type}>
                      <button
                        type="button"
                        data-step-type={type}
                        draggable
                        onClick={() => onAdd?.(type, presetConfig)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            PALETTE_DRAG_TYPE,
                            presetConfig
                              ? JSON.stringify({ type, presetConfig })
                              : type,
                          );
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
                          {label ?? stepTypeLabel(type)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export { PALETTE_DRAG_TYPE };
