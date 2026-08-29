/**
 * Variação A — Drawer lateral amplo (DS v2).
 *
 * Painel grande ancorado à direita, altura total. Filtros rápidos em chips no
 * topo, seções empilhadas com scroll. Estilo Linear/Notion.
 */

"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { IconAdjustmentsHorizontal as SlidersHorizontal, IconX as X } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

import {
  ActiveCountBadge,
  ContactCustomFieldsSection,
  ContactSection,
  DealCustomFieldsSection,
  OwnersSection,
  QuickFiltersList,
  SearchSection,
  SourcesSection,
  StagesSection,
  StatusSection,
  TagsSection,
  ValueSection,
  useFilterDraft,
  type SectionProps,
} from "./core";
import type { VariantProps } from "./types";

export function FilterDrawer({
  open,
  onOpenChange,
  value,
  options,
  optionsLoading,
  optionsError,
  onApply,
  onClear,
  onRequestSave,
}: VariantProps) {
  const { draft, setDraftField, applyWhole, toggleArray, reset } = useFilterDraft(value, onApply);

  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  const section: SectionProps = { draft, options, optionsLoading, optionsError, setDraftField, toggleArray };

  return createPortal(
    <div className="fixed inset-0 z-(--z-popover)">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onMouseDown={() => onOpenChange(false)} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Filtros avançados"
        className="absolute right-0 top-0 flex h-full w-[min(540px,100vw)] flex-col bg-[var(--glass-bg-subtle)] shadow-[0_0_60px_-12px_rgba(15,23,42,0.4)]"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
              <SlidersHorizontal className="size-4" />
            </span>
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">Filtros</h2>
              <ActiveCountBadge draft={draft} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </header>

        {/* Quick filters */}
        <div className="border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)] px-5 py-3">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Atalhos</span>
          <QuickFiltersList
            draft={draft}
            onApply={applyWhole}
            orientation="horizontal"
          />
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <SearchSection {...section} />
          <StatusSection {...section} />
          <StagesSection {...section} />
          <SourcesSection {...section} />
          <OwnersSection {...section} />
          <ContactSection {...section} />
          <ValueSection {...section} />
          <DealCustomFieldsSection {...section} />
          <ContactCustomFieldsSection {...section} />
          <TagsSection {...section} />
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-2 border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)] px-5 py-3">
          <button
            type="button"
            onClick={() => {
              reset();
              onClear();
            }}
            className="text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Limpar tudo
          </button>
          <div className="flex items-center gap-2">
            {onRequestSave && (
              <button
                type="button"
                onClick={() => onRequestSave(draft)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--glass-bg-overlay)] px-3 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-strong)]"
              >
                Salvar filtro
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[var(--brand-primary-dark)]")}
            >
              Aplicar
            </button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
