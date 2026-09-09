"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  groupTeamChatQueues,
  TEAM_CHAT_QUEUES,
  teamChatSelectedSum,
  type TeamChatQueueId,
} from "./filter-catalog";

type FilterSelectorProps = {
  selectedIds: TeamChatQueueId[];
  counts: Partial<Record<TeamChatQueueId, number>>;
  onChange: (ids: TeamChatQueueId[]) => void;
};

export function FilterSelector({ selectedIds, counts, onChange }: FilterSelectorProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null,
  );

  const selected = useMemo(
    () => TEAM_CHAT_QUEUES.filter((q) => selectedIds.includes(q.id)),
    [selectedIds],
  );
  const groups = useMemo(() => groupTeamChatQueues(), []);
  const sum = teamChatSelectedSum(selectedIds, counts);

  useEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = r.bottom + 6;
    const width = Math.max(r.width, 280);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({
      top,
      left,
      width,
      maxHeight: Math.max(220, window.innerHeight - top - 12),
    });

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (el?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(id: TeamChatQueueId) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(TEAM_CHAT_QUEUES.map((q) => q.id).filter((qid) => next.has(qid)));
  }

  return (
    <div className="min-w-0 flex-1" data-tour="bwipo-chat-filters">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "flex h-9 min-w-0 w-full items-center gap-2 rounded-full border border-border bg-card px-2 text-left",
          "outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
      >
        {selected.length === 0 ? (
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Selecione filas</span>
        ) : selected.length === 1 ? (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {selected[0]!.label} · {(counts[selected[0]!.id] ?? 0).toLocaleString("pt-BR")}
          </span>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              {selected.map((q) => (
                <span
                  key={q.id}
                  className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground"
                >
                  {q.label}
                </span>
              ))}
            </span>
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
              {sum.toLocaleString("pt-BR")}
            </span>
          </>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
            selected.length >= 2 && "ml-0",
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
            id={listId}
            role="dialog"
            aria-label="Filas do chat"
            className="fixed z-(--z-above) flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1.5">
              {groups.map((group) => (
                <div key={group.id} className="mb-0.5 last:mb-0">
                  <p
                    className={cn(
                      "px-2 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider",
                      group.tone,
                    )}
                  >
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    const checked = selectedIds.includes(item.id);
                    const count = counts[item.id] ?? 0;
                    const checkboxId = `${listId}-${item.id}`;
                    return (
                      <label
                        key={item.id}
                        htmlFor={checkboxId}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5",
                          "outline-none transition-colors hover:bg-muted/70",
                          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40",
                          checked && "bg-primary/5",
                        )}
                      >
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(item.id)}
                          className="size-4 shrink-0 accent-[var(--brand-primary)] outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        />
                        <span
                          aria-hidden
                          className="flex size-7 shrink-0 items-center justify-center rounded-full"
                          style={{ background: item.iconBg, color: item.iconFg }}
                        >
                          <item.Icon size={14} stroke={2.2} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                          {item.label}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10.5px] font-bold tabular-nums text-muted-foreground">
                          {count.toLocaleString("pt-BR")}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
