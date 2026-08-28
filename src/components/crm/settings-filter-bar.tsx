"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconRotateClockwise } from "@tabler/icons-react";

import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { cn } from "@/lib/utils";

/**
 * Barra de busca com filtros segmentados em popover — padrão canônico do
 * sistema (referência: Departamentos). Injete no slot `center` do PageHeader
 * (cluster à direita) via `useSettingsHeaderSlots().setCenter(...)`.
 *
 * - Contorno leve enquanto ocioso; foco/hover no padrão brand.
 * - Botão de filtros fica ativo (azul) quando há filtro aplicado ou o popover
 *   está aberto.
 * - Cada grupo é um conjunto de pills de seleção única. A 1ª opção de cada
 *   grupo é tratada como "padrão" (não conta como filtro ativo).
 */

export type SettingsFilterOption = {
  value: string;
  label: string;
  count?: number;
};

export type SettingsFilterGroup = {
  key: string;
  /** Rótulo do grupo no popover (ex.: "Filtrar por status"). */
  label: string;
  options: SettingsFilterOption[];
  value: string;
  onChange: (value: string) => void;
};

function FilterCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 font-display text-[10px] font-bold leading-none text-white">
      {count}
    </span>
  );
}

export function SettingsListFilterBar({
  search,
  onSearch,
  placeholder = "Buscar…",
  ariaLabel,
  icon,
  groups = [],
  onClearAll,
  popoverTitle = "Filtros",
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Ícone à esquerda (default: lupa). */
  icon?: React.ReactNode;
  groups?: SettingsFilterGroup[];
  onClearAll: () => void;
  popoverTitle?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const activeCount = groups.reduce(
    (acc, g) => acc + (g.value !== (g.options[0]?.value ?? "") ? 1 : 0),
    0,
  );
  const hasFilters = groups.length > 0;

  const updateCoords = React.useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(380, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 8);
    setCoords({ top, left, width });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
  }, [open, updateCoords]);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        (!ref.current || !ref.current.contains(target)) &&
        (!popoverRef.current || !popoverRef.current.contains(target))
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updateCoords, { passive: true, capture: true });
    window.addEventListener("resize", updateCoords, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open, updateCoords]);

  return (
    <div ref={ref} className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder={placeholder}
        ariaLabel={ariaLabel ?? placeholder}
        leading={icon}
        withFilter={hasFilters}
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
        onFocus={() => hasFilters && setOpen(true)}
      />

      {open && hasFilters && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ top: coords.top, left: coords.left, width: coords.width }}
          className="fixed z-(--z-popover) flex flex-col overflow-visible rounded-[22px] border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] text-left shadow-[var(--glass-shadow-lg)] backdrop-blur-md">
          <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-[14px] font-bold text-[var(--text-primary)]">
                {popoverTitle}
              </span>
              <FilterCountBadge count={activeCount} />
            </div>
            <button
              type="button"
              onClick={onClearAll}
              disabled={activeCount === 0 && !search}
              className="flex items-center gap-1 font-display text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)] disabled:opacity-40"
            >
              <IconRotateClockwise size={13} /> Limpar
            </button>
          </div>

          <div className="flex max-h-[min(60vh,420px)] flex-col gap-3.5 overflow-y-auto px-4 pb-4">
            {groups.map((group) => (
              <div key={group.key}>
                <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.options.map((opt) => {
                    const selected = group.value === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => group.onChange(opt.value)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12px] font-bold transition-colors",
                          selected
                            ? "border-[var(--brand-primary)] bg-[var(--color-primary-soft)] text-[var(--brand-primary)]"
                            : "border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
                        )}
                      >
                        {selected && <IconCheck size={12} stroke={2.4} />}
                        {opt.label}
                        {typeof opt.count === "number" && (
                          <span
                            className={cn(
                              "min-w-[18px] rounded-full px-1.5 text-center text-[10px] font-bold",
                              selected
                                ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
                                : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                            )}
                          >
                            {opt.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
