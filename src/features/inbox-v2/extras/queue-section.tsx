"use client";

import type { ReactNode } from "react";
import type { Icon as TablerIcon } from "@tabler/icons-react";
import { IconChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

type QueueSectionProps = {
  id: string;
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  Icon: TablerIcon;
  iconBg: string;
  iconFg: string;
  children: ReactNode;
};

/**
 * Seção colapsável da lista do Inbox quando 2+ filas estão selecionadas.
 * Header sticky + corpo com transição de altura (grid 0fr → 1fr).
 */
export function QueueSection({
  id,
  label,
  count,
  collapsed,
  onToggle,
  Icon,
  iconBg,
  iconFg,
  children,
}: QueueSectionProps) {
  const bodyId = `inbox-queue-section-${id}`;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        onClick={onToggle}
        className={cn(
          "sticky top-0 z-10 flex w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-left",
          "bg-card outline-none transition-colors hover:bg-[var(--glass-bg-strong)]",
          "focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40",
        )}
      >
        <IconChevronDown
          size={14}
          stroke={2.2}
          aria-hidden
          className={cn(
            "shrink-0 text-[var(--text-muted)] transition-transform duration-200",
            collapsed && "-rotate-90",
          )}
        />
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: iconBg, color: iconFg }}
        >
          <Icon size={13} stroke={2.2} />
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-[12px] font-semibold text-[var(--text-primary)]">
          {label}
        </span>
        <span className="shrink-0 rounded-full bg-[var(--glass-bg-subtle)] px-1.5 py-px text-[10.5px] font-bold tabular-nums text-[var(--text-muted)]">
          {count.toLocaleString("pt-BR")}
        </span>
      </button>

      <div
        id={bodyId}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
      >
        <div
          aria-hidden={collapsed}
          className={cn(
            "min-h-0 overflow-hidden transition-opacity duration-200 motion-reduce:transition-none",
            collapsed ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="flex flex-col gap-1.5 pt-1">
            {count === 0 ? (
              <p className="px-2 py-2 text-center text-[11px] text-[var(--text-muted)]">
                Nenhuma conversa nesta fila
              </p>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
