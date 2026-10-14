"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  IconAdjustmentsHorizontal,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export type FilterSidebarGroup = {
  id: string;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  count: number;
  body: ReactNode;
};

/**
 * Modal de filtros com os tópicos na lateral e o conteúdo do tópico ativo
 * à direita. O mesmo desenho do dashboard.
 */
export function FilterSidebarDialog({
  open,
  onClose,
  onClear,
  clearDisabled,
  groups,
  ariaLabel = "Filtros",
}: {
  open: boolean;
  onClose: () => void;
  onClear: () => void;
  clearDisabled: boolean;
  groups: FilterSidebarGroup[];
  ariaLabel?: string;
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const active = groups.find((group) => group.id === groupId) ?? groups[0];

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !active || typeof document === "undefined") return null;

  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return createPortal(
    <div className="fixed inset-0 z-(--z-popover) flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onMouseDown={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="relative flex h-[min(82vh,720px)] w-[min(1000px,100%)] overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
      >
        <aside className="flex w-[248px] shrink-0 flex-col border-r border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)]">
          <div className="flex items-center gap-2.5 px-4 py-4">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
              <IconAdjustmentsHorizontal className="size-4" />
            </span>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                Filtros
              </h2>
              {total > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-[11px] font-semibold text-white">
                  {total}
                </span>
              ) : null}
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-3">
            {groups.map((group) => {
              const selected = group.id === active.id;
              const Icon = group.icon;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setGroupId(group.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    selected
                      ? "bg-[var(--color-enterprise-bg)]"
                      : "hover:bg-[var(--glass-bg-overlay)]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg",
                      selected
                        ? "bg-[var(--brand-primary)] text-white"
                        : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[13px] font-medium",
                        selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                      )}
                    >
                      {group.label}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--text-muted)]">
                      {group.hint}
                    </span>
                  </span>
                  {group.count > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-[11px] font-semibold text-white">
                      {group.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className="border-t border-[var(--glass-border-subtle)] p-3">
            <button
              type="button"
              onClick={onClear}
              disabled={clearDisabled}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-ink-soft transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <IconTrash className="size-3.5" />
              Limpar
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-[var(--glass-border-subtle)] px-6 py-4">
            <div>
              <h3 className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
                {active.label}
              </h3>
              <p className="text-[12px] text-[var(--text-muted)]">{active.hint}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              aria-label="Fechar"
            >
              <IconX className="size-4" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">{active.body}</div>
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--glass-border-subtle)] px-6 py-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-5 text-[13px] font-medium text-white transition-colors hover:bg-[var(--brand-primary-dark)]"
            >
              Aplicar filtros
            </button>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
