"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Menu, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Design System v2 — elementos de toolbar de página.
 *
 * Hierarquia canônica (respeitar em todas as telas /v2):
 *   1. PageHeader        → identidade à esquerda; busca + ações à direita
 *   2. PageToolbarRow    → controles extras raros — preferir `actions` ou painel
 *   3. PageFilterBar     → dropdowns / date pickers estruturais (opcional)
 *   4. conteúdo
 *
 * Busca no slot `center` do PageHeader (renderizado à direita) via
 * `SearchFilterBar` ou `PageSearchBar variant="compact"` (`h-10`).
 * Tabs/segmented → `PageHeader.actions` (`PageSegmentedControl size="compact"`) ou
 * topo do painel de conteúdo quando não couber (ex.: campanhas com muitos status).
 *
 * Cabeçalho de colunas em listas → referência Empresas/Contatos:
 *   `listTableHeadRowClass` + `SortableHeader` / `ListColumnLabel` em `sortable-header.tsx`
 *   (sentence case, 13px semibold, pipes entre colunas, sort opcional — sem caixa alta).
 */

/** Classes padrão do gatilho DropdownGlass em barras de filtro. */
export const PAGE_FILTER_DROPDOWN_CLASS = "min-w-[180px]";

// ── Voltar (legado — preferir PageHeader `back`) ─────────────────────────────

export interface PageBackLinkProps {
  href: string;
  label: string;
  className?: string;
}

/** @deprecated Use `PageHeader` com prop `back`. Mantido para wrappers legacy. */
export function PageBackLink({ href, label, className }: PageBackLinkProps) {
  return (
    <Link
      href={href}
      aria-label={`Voltar para ${label}`}
      className={cn(
        "inline-flex w-fit items-center gap-1 font-display text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)]",
        className,
      )}
    >
      <ArrowLeft size={14} strokeWidth={2.4} className="shrink-0" />
      {label}
    </Link>
  );
}

// ── Busca ────────────────────────────────────────────────────────────────────

export type PageSearchBarVariant = "toolbar" | "compact";

export interface PageSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** `toolbar` = linha abaixo do header (flex-1, 42px). `compact` = slot `center` do PageHeader (`h-10`). */
  variant?: PageSearchBarVariant;
  className?: string;
  "aria-label"?: string;
}

export function PageSearchBar({
  value,
  onChange,
  placeholder = "Buscar...",
  variant = "toolbar",
  className,
  "aria-label": ariaLabel,
}: PageSearchBarProps) {
  if (variant === "compact") {
    return (
      <div className={cn("relative w-full", className)}>
        <Search
          size={15}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          className="h-10 w-full rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] pl-9 pr-4 font-body text-[13px] text-[var(--text-primary)] shadow-none outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--input-ring-focus)]"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-[42px] flex-1 items-center gap-2.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 text-[var(--text-muted)]",
        className,
      )}
    >
      <Search size={18} className="shrink-0" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="min-w-0 flex-1 border-none bg-transparent font-body text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
      />
    </div>
  );
}

// ── Layout rows ────────────────────────────────────────────────────────────

export function PageToolbarRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-3.5", className)}>
      {children}
    </div>
  );
}

export function PageFilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-3", className)}>
      {children}
    </div>
  );
}

// ── Segmented control (pills) ────────────────────────────────────────────────

export interface PageSegmentItem {
  value: string;
  label: React.ReactNode;
}

export interface PageSegmentedControlProps {
  items: readonly PageSegmentItem[];
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  /** `compact` — cabe no slot `actions` do PageHeader. */
  size?: "default" | "compact";
  className?: string;
}

export function PageSegmentedControl({
  items,
  value,
  onChange,
  "aria-label": ariaLabel,
  size = "default",
  className,
}: PageSegmentedControlProps) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "flex shrink-0 flex-nowrap items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-1",
        compact ? "h-10" : null,
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "shrink-0 cursor-pointer whitespace-nowrap rounded-full font-display font-bold transition-colors",
              compact
                ? "h-full px-2.5 text-[11px] leading-none"
                : "px-4 py-2 text-[13px]",
              active
                ? "bg-[var(--glass-bg-modal)] text-[var(--brand-primary)] shadow-[var(--glass-shadow-sm)]"
                : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Botões de página ─────────────────────────────────────────────────────────

const ghostBase =
  "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 font-display text-[13px] font-bold transition-colors";

export function pageGhostButtonClass(active?: boolean) {
  return cn(
    ghostBase,
    active
      ? "border-transparent bg-[var(--glass-bg-modal)] text-[var(--brand-primary)] shadow-[var(--glass-shadow-sm)]"
      : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)]",
  );
}

export const pagePrimaryButtonClass =
  "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(91,111,245,0.35)] transition-all hover:-translate-y-px hover:bg-[var(--brand-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

export interface PageGhostButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function PagePillButton({
  active,
  className,
  children,
  type = "button",
  ...props
}: PageGhostButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "cursor-pointer whitespace-nowrap rounded-full border px-4 py-2 font-display text-[13px] font-bold transition-colors",
        active
          ? "border-transparent bg-[var(--glass-bg-modal)] text-[var(--brand-primary)] shadow-[var(--glass-shadow-sm)]"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-secondary)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export const PageGhostButton = React.forwardRef<
  HTMLButtonElement,
  PageGhostButtonProps
>(function PageGhostButton(
  { active, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(pageGhostButtonClass(active), className)}
      {...props}
    >
      {children}
    </button>
  );
});
PageGhostButton.displayName = "PageGhostButton";

export interface PagePrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  href?: string;
}

export function PagePrimaryButton({
  href,
  className,
  children,
  type = "button",
  ...props
}: PagePrimaryButtonProps) {
  const cls = cn(pagePrimaryButtonClass, className);

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={cls} {...props}>
      {children}
    </button>
  );
}

// ── Menu de ações (padrão Pipeline) ─────────────────────────────────────────
//
// Referência: PipelineKebabMenu
//   • 1 item só (adicionar): botão `+` dispara a ação direto
//   • 2+ itens: hamburger; 1º CTA (primary) azul permanente
//   • Demais itens: cinza → hover fundo primary-soft + texto/ícone azul
//   • Ícones herdam a cor do botão (sem wrapper muted)

export type PageActionsMenuItem = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Separador acima deste item. */
  divider?: boolean;
  /**
   * CTA primário (azul permanente).
   * - `true`: força azul
   * - `false`: nunca azul (mesmo sendo o 1º)
   * - omitido: o 1º item da lista vira CTA se ninguém marcar `true`
   */
  primary?: boolean;
  /** Estado ativo (ex.: modo demo ligado). */
  active?: boolean;
};

/** Classes do item de menu — use quando o menu for montado manualmente. */
export function pageActionsMenuItemClass(opts?: {
  primary?: boolean;
  active?: boolean;
}) {
  if (opts?.primary) {
    return "flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[12.5px] font-bold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)]/8 disabled:opacity-40";
  }
  if (opts?.active) {
    return "flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[12.5px] font-semibold bg-[var(--brand-primary)]/8 text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)] disabled:opacity-40";
  }
  return "flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)] disabled:opacity-40";
}

export const pageActionsMenuPanelClass =
  "fixed z-(--z-popover) w-[220px] overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] py-1.5 shadow-[0_8px_28px_rgba(15,23,42,0.13)] backdrop-blur-md";

const PAGE_ACTIONS_MENU_WIDTH = 220;
/** Gutter from the visible content edge (excludes the page scrollbar). */
const PAGE_ACTIONS_MENU_GUTTER = 8;

export const pageActionsMenuTriggerClass =
  "flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90";

export function PageActionsMenu({
  items,
  "aria-label": ariaLabel = "Ações",
  className,
  menuClassName,
}: {
  items: PageActionsMenuItem[];
  "aria-label"?: string;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState<{ top: number; right: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const updateCoords = React.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Align the panel to the trigger's end (`align="end"`), then clamp so it
    // stays inside the visible viewport — not under the thin page scrollbar.
    const visibleRight = document.documentElement.clientWidth;
    let panelRight = Math.min(rect.right, visibleRight - PAGE_ACTIONS_MENU_GUTTER);
    if (panelRight - PAGE_ACTIONS_MENU_WIDTH < PAGE_ACTIONS_MENU_GUTTER) {
      panelRight = PAGE_ACTIONS_MENU_GUTTER + PAGE_ACTIONS_MENU_WIDTH;
    }
    const right = Math.max(PAGE_ACTIONS_MENU_GUTTER, window.innerWidth - panelRight);
    const top = Math.min(rect.bottom + 6, window.innerHeight - PAGE_ACTIONS_MENU_GUTTER);
    setCoords({ top, right });
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
        (!triggerRef.current || !triggerRef.current.contains(target)) &&
        (!panelRef.current || !panelRef.current.contains(target))
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

  const hasForcedPrimary = items.some((it) => it.primary === true);
  const soleItem = items.length === 1 ? items[0] : null;

  if (soleItem) {
    return (
      <div className={cn("relative shrink-0", className)}>
        <button
          type="button"
          onClick={soleItem.onClick}
          disabled={soleItem.disabled}
          aria-label={soleItem.label || ariaLabel}
          className={cn(
            pageActionsMenuTriggerClass,
            soleItem.disabled && "cursor-not-allowed opacity-40",
          )}
        >
          <Plus size={18} strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("relative shrink-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={cn(
          pageActionsMenuTriggerClass,
          open && "ring-2 ring-[var(--brand-primary)]/35 brightness-95",
        )}
      >
        <Menu size={18} strokeWidth={2} />
      </button>
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className={cn(pageActionsMenuPanelClass, menuClassName)}
              style={{ top: coords.top, right: coords.right }}
              role="menu"
            >
              {items.map((it, idx) => {
                const isPrimary =
                  it.primary === true ||
                  (!hasForcedPrimary &&
                    it.primary !== false &&
                    idx === 0 &&
                    !it.active);
                return (
                  <div key={it.label}>
                    {it.divider && (
                      <div className="mx-3 my-1.5 h-px bg-[var(--glass-border-subtle)]" />
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={it.disabled}
                      onClick={() => {
                        setOpen(false);
                        it.onClick();
                      }}
                      className={pageActionsMenuItemClass({
                        primary: isPrimary,
                        active: it.active,
                      })}
                    >
                      <span className="shrink-0">{it.icon}</span>
                      {it.label}
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
