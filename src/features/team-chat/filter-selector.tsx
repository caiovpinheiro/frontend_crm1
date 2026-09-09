"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { IconChevronDown, IconInfoCircle } from "@tabler/icons-react";

import { CountBadge } from "@/components/crm/count-badge";
import { cn } from "@/lib/utils";

import {
  TEAM_CHAT_FILTERS,
  teamChatFilterChips,
  teamChatFilterSelectedCount,
  teamChatFilterTriggerLabel,
  teamChatFilterVisual,
  type TeamChatFilterCounts,
  type TeamChatFilterId,
} from "./filter-catalog";

type TeamChatFilterSelectorProps = {
  selectedIds: readonly TeamChatFilterId[];
  counts: TeamChatFilterCounts;
  onToggle: (id: TeamChatFilterId) => void;
};

function groupFilters() {
  const groups: {
    key: string;
    label: string;
    tone: string;
    items: typeof TEAM_CHAT_FILTERS[number][];
  }[] = [];
  for (const item of TEAM_CHAT_FILTERS) {
    const last = groups[groups.length - 1];
    if (last && last.key === item.group) {
      last.items.push(item);
      continue;
    }
    groups.push({
      key: item.group,
      label: item.groupLabel,
      tone: item.groupTone,
      items: [item],
    });
  }
  return groups;
}

function useVisibleChipCount(chipCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(chipCount);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || chipCount === 0) {
      setVisible(chipCount);
      return;
    }
    const measure = () => {
      const chips = [...root.querySelectorAll<HTMLElement>("[data-queue-chip]")];
      const overflowEl = root.querySelector<HTMLElement>("[data-queue-overflow]");
      const totalEl = root.querySelector<HTMLElement>("[data-queue-total]");
      const reserved =
        (overflowEl ? overflowEl.offsetWidth : 28) +
        (totalEl ? totalEl.offsetWidth : 32) +
        12;
      const budget = Math.max(48, root.clientWidth - reserved);
      let used = 0;
      let count = 0;
      for (const chip of chips) {
        const hidden = chip.hasAttribute("data-chip-hidden");
        if (hidden) chip.removeAttribute("data-chip-hidden");
        const w = chip.offsetWidth + 4;
        if (hidden) chip.setAttribute("data-chip-hidden", "");
        if (count === 0 || used + w <= budget) {
          used += w;
          count += 1;
        } else break;
      }
      setVisible(Math.max(1, count));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    measure();
    return () => ro.disconnect();
  }, [chipCount]);

  return { ref, visible };
}

function TriggerFace({
  selectedIds,
  counts,
}: {
  selectedIds: readonly TeamChatFilterId[];
  counts: TeamChatFilterCounts;
}) {
  const chips = teamChatFilterChips(selectedIds, counts);
  const total = teamChatFilterSelectedCount(selectedIds, counts);
  const label = teamChatFilterTriggerLabel(selectedIds, counts);
  const isMulti = selectedIds.length > 1;
  const { ref, visible } = useVisibleChipCount(isMulti ? chips.length : 0);
  const hidden = isMulti ? Math.max(0, chips.length - visible) : 0;

  if (selectedIds.length === 0) {
    return (
      <span className="min-w-0 truncate text-sm font-medium text-[var(--inbox-text-muted)]">
        {label}
      </span>
    );
  }
  if (selectedIds.length === 1) {
    return (
      <span className="min-w-0 truncate text-sm font-semibold text-[var(--inbox-text)]">
        {label}
      </span>
    );
  }

  return (
    <div ref={ref} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      {chips.map((chip, i) => (
        <span
          key={chip.id}
          data-queue-chip=""
          data-chip-hidden={i >= visible ? "" : undefined}
          className={cn(
            "inline-flex max-w-[9.5rem] items-center gap-1 rounded-full border border-[var(--inbox-border)] bg-[var(--inbox-surface)] px-1.5 py-0.5",
            i >= visible && "hidden",
          )}
        >
          <span className="truncate text-[11px] font-semibold text-[var(--inbox-text)]">
            {chip.label}
          </span>
          {chip.count != null ? (
            <span className="text-[10px] font-bold tabular-nums text-[var(--inbox-text-muted)]">
              {chip.count.toLocaleString("pt-BR")}
            </span>
          ) : null}
        </span>
      ))}
      {hidden > 0 ? (
        <span
          data-queue-overflow=""
          className="shrink-0 rounded-full bg-[var(--glass-bg-subtle)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--inbox-text-muted)]"
        >
          +{hidden}
        </span>
      ) : (
        <span data-queue-overflow="" className="invisible absolute h-0 w-7" aria-hidden />
      )}
      {total != null ? (
        <span data-queue-total="" className="ml-0.5 shrink-0">
          <CountBadge value={total} highlight />
        </span>
      ) : (
        <span data-queue-total="" className="invisible absolute h-0 w-8" aria-hidden />
      )}
    </div>
  );
}

export function TeamChatFilterSelector({
  selectedIds,
  counts,
  onToggle,
}: TeamChatFilterSelectorProps) {
  const selected = TEAM_CHAT_FILTERS.filter((item) => selectedIds.includes(item.id));
  const triggerTitle =
    selected.length === 0
      ? "Selecione filas"
      : selected.map((item) => item.label).join(", ");

  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = btnRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const top = r.bottom + 6;
    const width = Math.max(r.width, 360);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({
      top,
      left,
      width,
      maxHeight: Math.max(220, window.innerHeight - top - 12),
    });

    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="min-w-0 flex-1">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={triggerTitle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerTitle}
        className={cn(
          "flex h-9 min-w-0 w-full items-center gap-2 rounded-full border border-[var(--team-chat-line)] bg-card px-2 text-left shadow-sm",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
        )}
      >
        <TriggerFace selectedIds={selectedIds} counts={counts} />
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label="Filas do Bwipo Chat"
            className="fixed z-(--z-above) flex min-h-0 flex-col overflow-hidden rounded-[var(--inbox-radius)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[0_12px_32px_rgba(15,23,42,0.18)] backdrop-blur-xl"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              isolation: "isolate",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--glass-border-subtle)] px-3 py-1.5">
              <span className="font-display text-[13px] font-semibold text-[var(--inbox-text)]">
                Filas
              </span>
              <IconChevronDown size={15} className="rotate-180 text-[var(--inbox-text-muted)]" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-0.5">
              {groupFilters().map((group) => (
                <div key={group.key} className="mb-0.5 last:mb-0">
                  <p
                    className={cn(
                      "px-2 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider",
                      group.tone,
                    )}
                  >
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    const isActive = selectedIds.includes(item.id);
                    const visual = teamChatFilterVisual(item.id);
                    const inputId = `bwipo-chat-filter-${item.id}`;
                    const count = counts[item.id];
                    return (
                      <label
                        key={item.id}
                        htmlFor={inputId}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-1 text-left transition-colors",
                          isActive
                            ? "bg-[var(--color-info-bg)]"
                            : "hover:bg-[var(--glass-bg-strong)]",
                        )}
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={isActive}
                          onChange={() => onToggle(item.id)}
                          className={cn(
                            "size-4 shrink-0 rounded-[var(--radius-xs)] border-border",
                            "accent-[var(--inbox-brand)] outline-none",
                            "focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
                          )}
                        />
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-full"
                          style={{ background: visual.bg, color: visual.fg }}
                          aria-hidden
                        >
                          <visual.Icon size={14} stroke={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate font-display text-[13px] font-semibold leading-tight",
                              isActive ? "text-[var(--color-info)]" : "text-[var(--inbox-text)]",
                            )}
                          >
                            {item.label}
                          </span>
                          <span className="block truncate text-[11px] leading-snug text-[var(--inbox-text-muted)]">
                            {item.description}
                          </span>
                        </span>
                        {count != null ? <CountBadge value={count} highlight={isActive} /> : null}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="flex shrink-0 items-start gap-1.5 border-t border-[var(--glass-border-subtle)] px-3 py-2 text-[11px] leading-snug text-[var(--inbox-text-muted)]">
              <IconInfoCircle size={13} className="mt-px shrink-0" />
              <span>Marque várias filas para ver juntas. Contagens por fila.</span>
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
