"use client";

/*
 * Multi-select em popover (glass v2) para a barra de filtros do
 * dashboard. Reaproveita o padrão de popover via portal usado no
 * pipeline v2 (usePortalPopover + computePopoverPosition) e as linhas
 * com checkbox/cor de tag.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown, IconInfoCircle } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { useModalPortalContainer } from "@/components/ui/modal-portal-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  computePopoverPosition,
  usePortalPopover,
} from "@/features/pipeline-v2/extras/use-portal-popover";

import { matchMultiSelectOptions, type MultiSelectOption } from "./multi-select-popover.utils";
export type { MultiSelectOption } from "./multi-select-popover.utils";
export { matchMultiSelectOptions } from "./multi-select-popover.utils";

interface MultiSelectPopoverProps {
  label: string;
  tooltip?: string;
  icon?: React.ReactNode;
  options: MultiSelectOption[];
  selected?: string[];
  onChange?: (next: string[]) => void;
  emptyLabel?: string;
  disabled?: boolean;
  width?: number;
  /** Classes extras no gatilho (ex.: `w-full` em formulário). */
  triggerClassName?: string;
  /** Força o campo de busca. Sem isso, só aparece com mais de 8 opções. */
  searchable?: boolean;
  /** Modo seleção única: sem checkboxes, fecha ao escolher e permite value/onValueChange. */
  single?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Notifica mudanças no texto de busca (debounced) para busca assíncrona. */
  onSearchQueryChange?: (query: string) => void;
  /** Texto do campo de busca. Padrão: "Buscar <rótulo>…". */
  searchPlaceholder?: string;
}

export function MultiSelectPopover({
  label,
  tooltip,
  icon,
  options,
  selected = [],
  onChange = () => {},
  emptyLabel = "Nenhuma opção disponível",
  disabled,
  width = 264,
  triggerClassName,
  searchable,
  single,
  value,
  onValueChange,
  onSearchQueryChange,
  searchPlaceholder,
}: MultiSelectPopoverProps) {
  const isSingle = Boolean(single);
  const effectiveSelected = isSingle ? (value ? [value] : []) : selected;
  const effectiveOnChange = isSingle
    ? (next: string[]) => onValueChange?.(next[0] ?? "")
    : onChange;
  const { open, rect, triggerRef, popoverRef, toggle, close } =
    usePortalPopover();
  const portalContainer = useModalPortalContainer();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    onSearchQueryChange?.(debouncedQuery);
  }, [debouncedQuery, onSearchQueryChange]);

  const count = selected.length;
  const visibleOptions = useMemo(() => matchMultiSelectOptions(options, debouncedQuery), [options, debouncedQuery]);
  const visibleValues = visibleOptions.map((o) => o.value);
  const allVisibleSelected = visibleValues.length > 0 && visibleValues.every((v) => selected.includes(v));

  function toggleAllVisible() {
    if (allVisibleSelected) {
      const drop = new Set(visibleValues);
      onChange(selected.filter((v) => !drop.has(v)));
    } else {
      onChange([...new Set([...selected, ...visibleValues])]);
    }
  }

  function toggleValue(itemValue: string) {
    if (isSingle) {
      effectiveOnChange(effectiveSelected[0] === itemValue ? [] : [itemValue]);
      close();
      return;
    }
    if (selected.includes(itemValue)) {
      onChange(selected.filter((v) => v !== itemValue));
    } else {
      onChange([...selected, itemValue]);
    }
  }

  const position = computePopoverPosition(rect, 320, width, 8);
  const selectedOption = isSingle
    ? options.find((o) => o.value === effectiveSelected[0])
    : undefined;

  const labelNode = tooltip ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-0.5">
            {label}
            <IconInfoCircle size={12} className="text-[var(--text-muted)]" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs leading-relaxed">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <span>{label}</span>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border bg-[var(--glass-bg-overlay)] px-2.5 font-display text-[12px] font-semibold shadow-[var(--glass-shadow-sm)] backdrop-blur-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          effectiveSelected.length > 0
            ? "border-[var(--brand-primary)]/50 text-[var(--text-primary)] ring-1 ring-[var(--brand-primary)]/25"
            : "border-[var(--glass-border)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]/35",
          triggerClassName,
        )}
      >
        {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
        {selectedOption ? (
          <span className="min-w-0 truncate text-left">
            <span className="block truncate">{selectedOption.label}</span>
            {selectedOption.sub && (
              <span className="block truncate text-[10px] font-normal text-[var(--text-muted)]">{selectedOption.sub}</span>
            )}
          </span>
        ) : (
          labelNode
        )}
        {!isSingle && count > 0 && (
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
            {!isSingle && (
              <div className="flex items-center justify-between gap-2 border-b border-[var(--glass-border-subtle)] px-3 py-2">
                <span className="truncate font-display text-[12px] font-semibold text-[var(--text-secondary)]">
                  {count > 0 ? `${count} selecionado${count > 1 ? "s" : ""}` : labelNode}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  {options.length > 1 && visibleOptions.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllVisible}
                      className="font-display text-[12px] font-semibold text-[var(--brand-primary)] transition-colors hover:underline"
                    >
                      {allVisibleSelected ? "Desmarcar todos" : debouncedQuery ? "Marcar os encontrados" : "Marcar todos"}
                    </button>
                  )}
                  {count > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange([])}
                      className="font-display text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)]"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            )}

            {(searchable ?? options.length > 8) ? (
              <div className="border-b border-[var(--glass-border-subtle)] px-2 py-1.5">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={searchPlaceholder ?? `Buscar ${label.toLowerCase()}…`}
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
                  Nenhuma opção com “{debouncedQuery}”.
                </p>
              ) : (
                visibleOptions.map((opt) => {
                  const checked = effectiveSelected.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleValue(opt.value)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-left transition-colors",
                        checked ? "bg-[var(--brand-primary)]/8 hover:bg-[var(--brand-primary)]/12" : "hover:bg-[var(--glass-bg-subtle)]",
                      )}
                    >
                      {!isSingle && (
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
                      )}
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
                        <span
                          className={cn(
                            "block truncate font-display text-[13px] text-[var(--text-primary)]",
                            checked ? "font-semibold" : "font-medium",
                          )}
                        >
                          {opt.label}
                        </span>
                        {opt.sub && (
                          <span className="block truncate font-body text-[10.5px] text-[var(--text-muted)]">
                            {opt.sub}
                          </span>
                        )}
                      </span>
                      {isSingle && checked && (
                        <IconCheck size={14} className="shrink-0 text-[var(--brand-primary)]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Escolha única fecha ao escolher: não precisa de rodapé. */}
            {!isSingle && (
              <div className="border-t border-[var(--glass-border-subtle)] p-1.5">
                <button
                  type="button"
                  onClick={close}
                  className="w-full rounded-[var(--radius-sm)] bg-[var(--brand-primary)] py-2 font-display text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Concluir
                </button>
              </div>
            )}
          </div>,
          portalContainer ?? document.body,
        )}
    </>
  );
}
