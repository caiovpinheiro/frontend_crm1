"use client";

/*
 * Editor visual dos itens da sidebar (drag/drop + toggle + reset).
 *
 * Componente CONTROLADO: o pai e o dono do estado. Usado no editor de
 * Papel (`RoleEditor`) e no overlay pessoal em /settings/profile.
 */

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Lock,
  RotateCcw,
} from "lucide-react";

import { SwitchGlass } from "@/components/crm/switch-glass";
import {
  LIST_CARD_ROW_CLASS,
  LIST_CARD_STACK_CLASS,
} from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_CATALOG,
  getSidebarCatalogItem,
  resolveSidebarItems,
  type SidebarItemPreference,
} from "@/lib/sidebar-catalog";
import type { SidebarPreferencesResponse } from "./types";

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

/**
 * Itens editaveis no Perfil: so o que o papel liberou. O que o admin
 * escondeu nao entra — o usuario nao reexibe pelo overlay pessoal.
 */
export function toPersonalEditorItems(
  prefs: SidebarPreferencesResponse | undefined,
): SidebarEditorItem[] {
  if (!prefs?.sidebar?.items) return [];
  const roleItems = prefs.roleSidebar?.items ?? prefs.sidebar.items;
  const roleAllowed = new Set(
    roleItems
      .filter((it) => it.enabled || Boolean(getSidebarCatalogItem(it.key)?.locked))
      .map((it) => it.key),
  );
  const available = prefs.availableKeys?.length
    ? new Set(prefs.availableKeys)
    : null;
  return toEditorItems(prefs.sidebar.items).filter((it) => {
    if (!roleAllowed.has(it.key)) return false;
    if (available && !available.has(it.key)) return false;
    return true;
  });
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
      <ul className={LIST_CARD_STACK_CLASS}>
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
                LIST_CARD_ROW_CLASS,
                "flex items-center gap-3",
                !it.enabled && "opacity-60",
                disabled && "cursor-not-allowed",
              )}
            >
              <div className="flex shrink-0 items-center gap-0.5">
                <span
                  className="hidden cursor-grab text-muted-foreground active:cursor-grabbing sm:block"
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
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, idx + 1)}
                    disabled={disabled || idx === items.length - 1}
                    aria-label={`Mover ${meta.title} para baixo`}
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>
              </div>

              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon size={18} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {meta.title}
                  </p>
                  {meta.locked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Lock className="size-3" />
                      Obrigatório
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {meta.description}
                </p>
              </div>

              <SwitchGlass
                checked={it.enabled}
                disabled={disabled || meta.locked}
                onChange={() => toggle(it.key)}
                size="list"
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
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" />
            Restaurar padrão
          </button>
        </div>
      )}
    </div>
  );
}
