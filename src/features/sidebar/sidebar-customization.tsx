"use client";

/*
 * Editor visual dos itens da sidebar (drag/drop + toggle + reset).
 *
 * Contexto (14/jul/26): a personalizacao de sidebar deixou de ser per-user
 * e passou a ser configuracao de Papel (Role). Ver AGENT.md ("Sidebar por
 * Papel"). Este arquivo agora exporta um COMPONENTE CONTROLADO
 * (`SidebarItemsEditor`) que o `RoleEditor` (features/permissions) reutiliza.
 * A UI (drag handle, toggle, botoes de ordenacao, badge "Obrigatorio") e' a
 * mesma; o que muda e a fonte do estado — o pai controla `items` + `onChange`.
 */

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  RotateCcw,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_CATALOG,
  getSidebarCatalogItem,
  resolveSidebarItems,
  type SidebarItemPreference,
} from "@/lib/sidebar-catalog";

/** Item do estado local: ordem implicita pela posicao no array. */
export interface SidebarEditorItem {
  key: string;
  enabled: boolean;
}

/**
 * Converte SidebarItemPreference[] (com order) para o shape do editor
 * (order implicito). Aceita `null`/undefined -> catalogo padrao completo.
 */
export function toEditorItems(
  pref: SidebarItemPreference[] | null | undefined,
): SidebarEditorItem[] {
  return resolveSidebarItems(pref ?? undefined).map((i) => ({
    key: i.key,
    enabled: i.enabled,
  }));
}

/**
 * Serializa itens do editor para o payload persistivel — reescreve `order`
 * sequencialmente a partir da posicao no array.
 */
export function toPersistItems(
  items: SidebarEditorItem[],
): SidebarItemPreference[] {
  return items.map((it, idx) => ({
    key: it.key,
    enabled: it.enabled,
    order: idx + 1,
  }));
}

interface SidebarItemsEditorProps {
  items: SidebarEditorItem[];
  onChange: (items: SidebarEditorItem[]) => void;
  /** Bloqueia edicao (drag/toggle/reset) — mostra o layout em read-only. */
  disabled?: boolean;
  /** Handler opcional do botao "Restaurar padrao" (catalogo completo). */
  onReset?: () => void;
  className?: string;
}

/**
 * Editor CONTROLADO da lista de itens da sidebar. Nao faz fetch nem save —
 * o pai (RoleEditor) e o dono do estado e persiste via seu proprio mutation.
 */
export function SidebarItemsEditor({
  items,
  onChange,
  disabled,
  onReset,
  className,
}: SidebarItemsEditorProps) {
  const dragIndex = React.useRef<number | null>(null);

  const move = (from: number, to: number) => {
    if (disabled) return;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const toggle = (key: string) => {
    if (disabled) return;
    onChange(items.map((it) => (it.key === key ? { ...it, enabled: !it.enabled } : it)));
  };

  const handleReset = () => {
    if (disabled) return;
    if (onReset) {
      onReset();
    } else {
      onChange(SIDEBAR_CATALOG.map((i) => ({ key: i.key, enabled: true })));
    }
  };

  return (
    <div className={className}>
      <ul className="space-y-2">
        {items.map((it, idx) => {
          const meta = getSidebarCatalogItem(it.key);
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <li
              key={it.key}
              draggable={!disabled}
              onDragStart={() => {
                dragIndex.current = idx;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex.current !== null && dragIndex.current !== idx) {
                  move(dragIndex.current, idx);
                }
                dragIndex.current = null;
              }}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]/40 px-3 py-2.5 transition-opacity",
                !it.enabled && "opacity-60",
                disabled && "cursor-not-allowed",
              )}
            >
              {/* Drag handle + botoes de ordenacao (fallback mobile/a11y) */}
              <div className="flex shrink-0 items-center gap-0.5">
                <span
                  className="hidden cursor-grab text-[var(--text-faint)] active:cursor-grabbing sm:block"
                  aria-hidden
                >
                  <GripVertical className="size-4" />
                </span>
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(idx, idx - 1)}
                    disabled={disabled || idx === 0}
                    aria-label={`Mover ${meta.title} para cima`}
                    className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, idx + 1)}
                    disabled={disabled || idx === items.length - 1}
                    aria-label={`Mover ${meta.title} para baixo`}
                    className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>
              </div>

              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-primary">
                <Icon size={18} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {meta.title}
                  </p>
                  {meta.locked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--glass-bg-base)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      <Lock className="size-2.5" />
                      Obrigatório
                    </span>
                  )}
                </div>
                <p className="truncate text-[12px] text-[var(--color-ink-muted)]">
                  {meta.description}
                </p>
              </div>

              <Switch
                checked={it.enabled}
                disabled={disabled || meta.locked}
                onCheckedChange={() => toggle(it.key)}
                aria-label={`Mostrar ${meta.title} no menu lateral`}
              />
            </li>
          );
        })}
      </ul>

      {(onReset || !disabled) && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 text-xs font-semibold text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" />
            Restaurar padrão
          </button>
        </div>
      )}
    </div>
  );
}
