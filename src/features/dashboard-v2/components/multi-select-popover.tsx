"use client";

/*
 * Multi-select em popover (glass v2) para a barra de filtros do
 * dashboard. Reaproveita o padrão de popover via portal usado no
 * pipeline v2 (usePortalPopover + computePopoverPosition) e as linhas
 * com checkbox/cor de tag.
 */

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { useModalPortalContainer } from "@/components/ui/modal-portal-context";
import {
  computePopoverPosition,
  usePortalPopover,
} from "@/features/pipeline-v2/extras/use-portal-popover";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Cor opcional (ex.: tag) renderizada como swatch. */
  color?: string;
  sub?: string;
}

interface MultiSelectPopoverProps {
  label: string;
  icon?: React.ReactNode;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
  disabled?: boolean;
  width?: number;
}

export function MultiSelectPopover({
  label,
  icon,
  options,
  selected,
  onChange,
  emptyLabel = "Nenhuma opção disponível",
  disabled,
  width = 264,
}: MultiSelectPopoverProps) {
  const { open, rect, triggerRef, popoverRef, toggle, close } =
    usePortalPopover();
  const portalContainer = useModalPortalContainer();
  const [query, setQuery] = useState("");

  const count = selected.length;
  const visibleOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(needle) ||
        (opt.sub ?? "").toLowerCase().includes(needle),
    );
  }, [options, query]);

  function toggleValue(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const position = computePopoverPosition(rect, 320, width, 8);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border bg-[var(--glass-bg-overlay)] px-2.5 font-display text-[12px] font-semibold shadow-[var(--glass-shadow-sm)] backdrop-blur-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          count > 0
            ? "border-[var(--brand-primary)]/50 text-[var(--text-primary)] ring-1 ring-[var(--brand-primary)]/25"
            : "border-[var(--glass-border)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]/35",
        )}
      >
        {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
        <span>{label}</span>
        {count > 0 && (
          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
        <IconChevronDown size={14} className="text-[var(--text-muted)]" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: position.top, left: position.left, width }}
            className={cn(
              "fixed overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl",
              // Dentro de <dialog> o painel tem z-50; --z-popover (80) já
              // cobre, mas forçamos 200 pra o menu nunca ficar atrás do
              // overflow-hidden do FormDialog (Tags no wizard de campanha).
              portalContainer ? "z-[200]" : "z-(--z-popover)",
            )}
          >
            <div className="flex items-center justify-between border-b border-[var(--glass-border-subtle)] px-3 py-2">
              <span className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {label}
              </span>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="font-display text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)]"
                >
                  Limpar
                </button>
              )}
            </div>

            {options.length > 8 ? (
              <div className="border-b border-[var(--glass-border-subtle)] px-2 py-1.5">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Buscar ${label.toLowerCase()}…`}
                  className="h-8 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </div>
            ) : null}

            <div className="max-h-[280px] overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {options.length === 0 ? (
                <p className="px-2 py-3 text-center font-body text-[12px] italic text-[var(--text-muted)]">
                  {emptyLabel}
                </p>
              ) : visibleOptions.length === 0 ? (
                <p className="px-2 py-3 text-center font-body text-[12px] italic text-[var(--text-muted)]">
                  Nenhuma opção com “{query.trim()}”.
                </p>
              ) : (
                visibleOptions.map((opt) => {
                  const checked = selected.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleValue(opt.value)}
                      className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--glass-bg-subtle)]"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          checked
                            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                            : "border-[var(--glass-border)]",
                        )}
                      >
                        {checked && <IconCheck size={11} stroke={3} />}
                      </span>
                      {opt.color && (
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{
                            background: opt.color,
                            border: `1px solid ${opt.color}99`,
                          }}
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[12.5px] font-semibold text-[var(--text-primary)]">
                          {opt.label}
                        </span>
                        {opt.sub && (
                          <span className="block truncate font-body text-[10.5px] text-[var(--text-muted)]">
                            {opt.sub}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-[var(--glass-border-subtle)] p-1.5">
              <button
                type="button"
                onClick={close}
                className="w-full rounded-[var(--radius-sm)] bg-[var(--glass-bg-subtle)] py-1.5 font-display text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              >
                Fechar
              </button>
            </div>
          </div>,
          portalContainer ?? document.body,
        )}
    </>
  );
}
