/**
 * Variação B — Barra + mega-painel (DS v2).
 *
 * Filtros como chips/atalhos numa barra horizontal sob o header. Um botão
 * "Filtros avançados" expande um painel full-width logo abaixo, com todas as
 * seções organizadas num grid responsivo. Inline (sem portal).
 */

"use client";

import * as React from "react";
import { IconAdjustmentsHorizontal as SlidersHorizontal, IconChevronDown as ChevronDown, IconX as X } from "@tabler/icons-react";

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
  countPanelFilters,
  useFilterDraft,
  type SectionProps,
} from "./core";
import type { VariantProps } from "./types";

export function FilterBar({
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
  const section: SectionProps = { draft, options, optionsLoading, optionsError, setDraftField, toggleArray };
  const activeCount = countPanelFilters(draft);

  return (
    <div className="rounded-2xl border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)]">
      {/* Barra */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors",
            open || activeCount > 0
              ? "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-dark)]"
              : "bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)]",
          )}
        >
          <SlidersHorizontal className="size-4" />
          Filtros avançados
          {activeCount > 0 && (
            <span
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                open || activeCount > 0 ? "bg-[var(--glass-bg)] text-white" : "bg-[var(--brand-primary)] text-white",
              )}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>

        <div className="h-6 w-px bg-[var(--glass-border-subtle)]" />

        <QuickFiltersList draft={draft} onApply={applyWhole} orientation="horizontal" />

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              reset();
              onClear();
            }}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
          >
            <X className="size-3.5" />
            Limpar ({activeCount})
          </button>
        )}
      </div>

      {/* Mega-painel */}
      {open && (
        <div className="border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)]/60 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div className="space-y-3">
              <SearchSection {...section} />
              <StatusSection {...section} />
              <SourcesSection {...section} />
            </div>
            <div className="space-y-3">
              <StagesSection {...section} />
              <ValueSection {...section} />
              <DealCustomFieldsSection {...section} />
            </div>
            <div className="space-y-3">
              <OwnersSection {...section} />
              <ContactSection {...section} />
              <ContactCustomFieldsSection {...section} />
            </div>
            <div className="space-y-3">
              <TagsSection {...section} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-[var(--glass-border-subtle)] pt-3">
            <span className="inline-flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
              <ActiveCountBadge draft={draft} />
              {activeCount === 0 ? "Nenhum filtro ativo" : `${activeCount} ${activeCount === 1 ? "filtro ativo" : "filtros ativos"}`}
            </span>
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
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[var(--brand-primary-dark)]"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
