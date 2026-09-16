"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconBolt, IconSearch } from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import {
  useQuickReplies,
  useQuickReplyGroups,
  type QuickReply,
  type QuickReplyGroup,
} from "@/features/conversations-settings/hooks/use-quick-replies";
import { cn } from "@/lib/utils";

import { type QuickReplyCatalogItem } from "./quick-reply-catalog";

function fromSettings(row: QuickReply): QuickReplyCatalogItem | null {
  const content = (row.content ?? "").trim();
  if (!content) return null;
  return {
    id: row.id,
    title: (row.title ?? content).trim() || content,
    content,
    group: row.group?.name?.trim() || "Sem grupo",
    attachmentUrl: row.attachmentUrl ?? null,
  };
}

function groupOrder(name: string, groups: QuickReplyGroup[]): number {
  const fromSettingsOrder = groups.find((g) => g.name === name)?.order;
  if (typeof fromSettingsOrder === "number") return fromSettingsOrder;
  return Number.MAX_SAFE_INTEGER;
}

export function QuickReplyPopover({
  disabled,
  sending,
  onSend,
  onOpenChange,
}: {
  disabled?: boolean;
  sending?: boolean;
  onSend: (item: QuickReplyCatalogItem) => void | Promise<void>;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  function setOpenAndNotify(next: boolean | ((prev: boolean) => boolean)) {
    setOpen((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      onOpenChange?.(value);
      return value;
    });
  }

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const repliesQ = useQuickReplies();
  const groupsQ = useQuickReplyGroups();
  const settingGroups = groupsQ.data ?? [];

  const items = useMemo(
    () =>
      (repliesQ.data ?? [])
        .map(fromSettings)
        .filter((item): item is QuickReplyCatalogItem => !!item),
    [repliesQ.data],
  );

  const groups = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) names.add(item.group);
    return [...names].sort(
      (a, b) => groupOrder(a, settingGroups) - groupOrder(b, settingGroups),
    );
  }, [items, settingGroups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (group && item.group !== group) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
      );
    });
  }, [items, query, group]);

  const grouped = useMemo(() => {
    const map = new Map<string, QuickReplyCatalogItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()].sort(
      ([a], [b]) => groupOrder(a, settingGroups) - groupOrder(b, settingGroups),
    );
  }, [filtered, settingGroups]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenAndNotify(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenAndNotify(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setGroup(null);
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  async function pick(item: QuickReplyCatalogItem) {
    if (disabled || sending) return;
    setOpenAndNotify(false);
    await onSend(item);
  }

  return (
    <div ref={wrapRef} className="relative">
      <TooltipGlass label="Mensagens rápidas" side="top">
        <span className="inline-flex">
          <ButtonGlass
            type="button"
            variant="icon"
            size="icon"
            className="h-9 w-9 shrink-0 text-[var(--brand-primary)]"
            aria-label="Mensagens rápidas"
            aria-expanded={open}
            disabled={disabled || sending}
            onClick={(e) => {
              e.stopPropagation();
              setOpenAndNotify((v) => !v);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <IconBolt size={20} />
          </ButtonGlass>
        </span>
      </TooltipGlass>

      {open && (
        <div
          className="absolute bottom-12 left-0 z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.14)] v2-dark:bg-[#1a1f2e]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="border-b border-[var(--glass-border)] px-3 py-2.5">
            <p className="font-display text-[13px] font-semibold text-[var(--text-primary)]">
              Mensagens rápidas
            </p>
            <p className="mt-0.5 font-body text-[11px] text-[var(--text-muted)]">
              Clique para preencher · depois envie
            </p>
            <label className="mt-2 flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2 py-1.5">
              <IconSearch size={13} className="shrink-0 text-[var(--text-muted)]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar frase…"
                className="w-full bg-transparent font-body text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>
          </div>

          <div className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={!group} onClick={() => setGroup(null)}>
              Todas
            </Chip>
            {groups.map((name) => (
              <Chip key={name} active={group === name} onClick={() => setGroup(name)}>
                {name}
              </Chip>
            ))}
          </div>

          <div className="max-h-64 overflow-y-auto px-1.5 pb-2">
            {repliesQ.isLoading ? (
              <p className="px-2 py-6 text-center font-body text-[12px] text-[var(--text-muted)]">
                Carregando mensagens…
              </p>
            ) : grouped.length === 0 ? (
              <p className="px-2 py-6 text-center font-body text-[12px] text-[var(--text-muted)]">
                Nenhuma mensagem cadastrada. Crie em Modelos → Rápidas.
              </p>
            ) : (
              grouped.map(([name, rows]) => (
                <section key={name} className="mb-1">
                  <p className="px-2 pb-0.5 pt-1.5 font-display text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {name}
                  </p>
                  {rows.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={sending}
                      onClick={() => void pick(item)}
                      className="flex w-full flex-col items-start rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--brand-primary)]/8 disabled:opacity-50"
                    >
                      <span className="font-display text-[12.5px] font-semibold text-[var(--text-primary)]">
                        {item.title}
                      </span>
                      {item.title !== item.content && (
                        <span className="mt-0.5 line-clamp-2 font-body text-[11.5px] leading-snug text-[var(--text-muted)]">
                          {item.content}
                        </span>
                      )}
                    </button>
                  ))}
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 font-display text-[11px] font-semibold transition-colors",
        active
          ? "bg-[var(--brand-primary)] text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-secondary)]",
      )}
    >
      {children}
    </button>
  );
}
