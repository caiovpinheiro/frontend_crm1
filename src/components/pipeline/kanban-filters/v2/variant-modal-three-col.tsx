/**
 * Modal canônico do filtro do funil.
 *
 * Chrome: `FilterModalShell` (tokens, rounded-2xl, Limpar no header).
 * Conteúdo: Negócio / Pessoas / Personalizados + tags + ordenação.
 */

"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { IconCheck } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { useIsDesktop } from "@/hooks/use-media-query";
import { TagChip } from "@/components/crm/tag-chip";
import {
  FilterModalShell,
  FilterSegmentedTablist,
} from "@/components/crm/filter-popover";

import {
  ContactCustomFieldsSection,
  ContactSection,
  ConversationSection,
  DealCustomFieldsSection,
  LossReasonsSection,
  OwnersSection,
  QuickFiltersList,
  SearchSection,
  SourcesSection,
  UtmSourcesSection,
  StagesSection,
  StatusSection,
  ValueSection,
  useFilterDraft,
  type SectionProps,
} from "./core";
import { countPanelFilters, isEmptyFilters, type AdvancedDealFilters } from "../types";
import type { VariantProps } from "./types";

export type PipelineSortKey =
  | "default"
  | "interaction_newest"
  | "interaction_oldest"
  | "name_az"
  | "name_za"
  | "created_newest"
  | "created_oldest";

const SORT_OPTIONS: { key: PipelineSortKey; label: string }[] = [
  { key: "default", label: "Padrão (posição)" },
  { key: "interaction_newest", label: "Última interação: mais nova" },
  { key: "interaction_oldest", label: "Última interação: mais antiga" },
  { key: "name_az", label: "Nome: A → Z" },
  { key: "name_za", label: "Nome: Z → A" },
  { key: "created_newest", label: "Criação: mais recente" },
  { key: "created_oldest", label: "Criação: mais antiga" },
];

type MiddleTab = "negocio" | "pessoas" | "custom";

const MIDDLE_TABS: { id: MiddleTab; label: string; hint: string }[] = [
  { id: "negocio", label: "Negócio", hint: "Busca, etapa, origem, status e valor" },
  { id: "pessoas", label: "Pessoas", hint: "Responsável e dados do contato" },
  { id: "custom", label: "Personalizados", hint: "Campos do negócio e contato" },
];

function middleTabCount(id: MiddleTab, f: AdvancedDealFilters): number {
  if (id === "negocio") {
    return (
      (f.search?.trim() ? 1 : 0) +
      (f.stageIds?.length ? 1 : 0) +
      (f.sources?.length || f.withoutSource ? 1 : 0) +
      (f.utmSources?.length || f.withoutUtmSource ? 1 : 0) +
      (f.statuses?.length ? 1 : 0) +
      (f.lostReasons?.length ? 1 : 0) +
      (f.valueFrom != null || f.valueTo != null ? 1 : 0)
    );
  }
  if (id === "pessoas") {
    return (
      (f.ownerIds?.length || f.withoutOwner ? 1 : 0) +
      (f.contactSearch?.trim() ||
      f.contactHasPhone != null ||
      f.contactHasEmail != null ||
      f.withoutContact
        ? 1
        : 0)
    );
  }
  return (f.dealCustomFields?.length ?? 0) + (f.contactCustomFields?.length ?? 0);
}

type ModalProps = VariantProps & {
  sortKey?: PipelineSortKey;
  onSortKeyChange?: (key: PipelineSortKey) => void;
};

/** Chips de tags — coluna dedicada (multi-seleção com busca). */
function TagsChipColumn({
  draft,
  options,
  setDraftField,
}: Pick<SectionProps, "draft" | "options" | "setDraftField">) {
  const [q, setQ] = React.useState("");
  const allTags = React.useMemo(() => options?.tags ?? [], [options?.tags]);
  const selectedIds = draft.tagIds ?? [];
  const selected = new Set(selectedIds);
  const exclude = draft.tagMode === "none";

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(needle));
  }, [allTags, q]);

  function toggle(id: string) {
    const next = selected.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setDraftField("tagIds", next.length ? next : undefined);
    setDraftField("withoutTags", undefined);
    if (next.length === 0) setDraftField("tagMode", undefined);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-[1] space-y-2 bg-[var(--glass-bg-modal)] pb-2">
        <div className="flex items-center justify-between px-0.5">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]">
            Tags
          </span>
          <span className="font-display text-[10.5px] font-bold text-[var(--brand-primary)]">
            {selectedIds.length === 0
              ? "0 selecionadas"
              : exclude
                ? `${selectedIds.length} excluídas`
                : `${selectedIds.length} selecionadas`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { value: "any" as const, label: "Contém" },
              { value: "none" as const, label: "Não contém" },
            ] as const
          ).map((option) => {
            const active = option.value === "none" ? exclude : !exclude;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setDraftField(
                    "tagMode",
                    option.value === "none" ? "none" : undefined,
                  )
                }
                className={cn(
                  "rounded-[var(--radius-md)] px-2 py-1.5 font-display text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-[var(--brand-primary)] text-white"
                    : "border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Localizar tags…"
          className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 font-body text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]/40 focus:ring-2 focus:ring-[var(--brand-primary)]/20"
        />
        {(selectedIds.length > 0 || draft.withoutTags) && (
          <button
            type="button"
            onClick={() => {
              setDraftField("tagIds", undefined);
              setDraftField("withoutTags", undefined);
              setDraftField("tagMode", undefined);
            }}
            className="font-display text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--brand-primary)]"
          >
            Limpar tags
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-wrap content-start gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => {
              const next = !draft.withoutTags;
              setDraftField("withoutTags", next || undefined);
              if (next) {
                setDraftField("tagIds", undefined);
                setDraftField("tagMode", undefined);
              }
            }}
            className={cn(
              "inline-flex items-center rounded-[7px] border px-2 py-1 font-display text-[11.5px] font-semibold transition-colors",
              draft.withoutTags
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]/40",
            )}
          >
            Sem tags
          </button>
          {filtered.map((tag) => {
            const on = selected.has(tag.id);
            return (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                count={tag.dealCount}
                selected={on}
                onClick={() => toggle(tag.id)}
              />
            );
          })}
          {filtered.length === 0 && (
            <p className="w-full py-6 text-center font-body text-[12px] text-[var(--text-muted)]">
              {q.trim() ? "Nenhuma tag encontrada." : "Nenhuma tag cadastrada."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationSegmentation({
  draft,
  setDraftField,
}: Pick<SectionProps, "draft" | "setDraftField">) {
  const statusOptions = [
    { value: "open" as const, label: "Aberta" },
    { value: "closed" as const, label: "Fechada" },
  ];
  const sessionOptions = [
    { value: "open" as const, label: "Aberta" },
    { value: "closed" as const, label: "Fechada" },
  ];
  const directionOptions = [
    { value: "out" as const, label: "Agente" },
    { value: "in" as const, label: "Cliente" },
  ];
  const activeCount =
    (draft.conversationStatus ? 1 : 0) +
    (draft.windowState ? 1 : 0) +
    (draft.lastMessageDirection ? 1 : 0);

  return (
    <div className="mb-4 border-b border-[var(--glass-border-subtle)] pb-4">
      <div className="mb-2.5 flex items-center justify-between px-2">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]">
          Segmentar conversas
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setDraftField("conversationStatus", undefined);
              setDraftField("windowState", undefined);
              setDraftField("lastMessageDirection", undefined);
            }}
            className="font-display text-[10px] font-semibold text-[var(--brand-primary)]"
          >
            Limpar
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-[var(--radius-lg)] border border-slate-200/90 bg-slate-50/80 p-2.5 v2-dark:border-white/12 v2-dark:bg-[color-mix(in_srgb,white_8%,var(--dropdown-solid-bg))]">
        <div>
          <span className="mb-1.5 block font-body text-[10.5px] text-[var(--text-muted)]">
            Status
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {statusOptions.map((option) => {
              const active = draft.conversationStatus === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDraftField(
                      "conversationStatus",
                      active ? undefined : option.value,
                    )
                  }
                  className={cn(
                    "rounded-[var(--radius-md)] px-2 py-1.5 font-display text-[11px] font-semibold transition-colors",
                    active
                      ? "bg-[var(--brand-primary)] text-white"
                      : "bg-[var(--glass-bg-modal)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block font-body text-[10.5px] text-[var(--text-muted)]">
            Sessão da Meta
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {sessionOptions.map((option) => {
              const active = draft.windowState === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDraftField(
                      "windowState",
                      active ? undefined : option.value,
                    )
                  }
                  className={cn(
                    "rounded-[var(--radius-md)] px-2 py-1.5 font-display text-[11px] font-semibold transition-colors",
                    active
                      ? "bg-[var(--brand-primary)] text-white"
                      : "bg-[var(--glass-bg-modal)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block font-body text-[10.5px] text-[var(--text-muted)]">
            Direção da última mensagem
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {directionOptions.map((option) => {
              const active = draft.lastMessageDirection === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDraftField(
                      "lastMessageDirection",
                      active ? undefined : option.value,
                    )
                  }
                  className={cn(
                    "rounded-[var(--radius-md)] px-2 py-1.5 font-display text-[11px] font-semibold transition-colors",
                    active
                      ? "bg-[var(--brand-primary)] text-white"
                      : "bg-[var(--glass-bg-modal)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineFilterShell({
  onClose,
  draft,
  draftCount,
  onClear,
  onApply,
  onRequestSave,
  children,
  wide,
}: {
  onClose: () => void;
  draft: AdvancedDealFilters;
  draftCount: number;
  onClear: () => void;
  onApply: () => void;
  onRequestSave?: (f: AdvancedDealFilters) => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <FilterModalShell
      title="Filtros"
      labelledBy="Filtros do funil"
      count={draftCount}
      onClose={onClose}
      onClear={onClear}
      clearDisabled={isEmptyFilters(draft)}
      onApply={onApply}
      wide={wide}
      extraFooter={
        onRequestSave ? (
          <button
            type="button"
            onClick={() => onRequestSave(draft)}
            disabled={isEmptyFilters(draft)}
            className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-bold text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
          >
            Salvar filtro
          </button>
        ) : null
      }
    >
      {children}
    </FilterModalShell>
  );
}

export function FilterModalThreeCol({
  open,
  onOpenChange,
  value,
  options,
  optionsLoading,
  optionsError,
  onApply,
  onClear,
  onRequestSave,
  sortKey = "default",
  onSortKeyChange,
}: ModalProps) {
  const { draft, setDraftField, applyWhole, toggleArray, reset } = useFilterDraft(
    value,
    onApply,
  );
  const isDesktop = useIsDesktop();
  const draftCount = countPanelFilters(draft);
  const [middleTab, setMiddleTab] = React.useState<MiddleTab>("negocio");
  const middleScrollRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    middleScrollRef.current?.scrollTo({ top: 0 });
  }, [middleTab]);

  if (!open || typeof document === "undefined") return null;

  const section: SectionProps = {
    draft,
    options,
    optionsLoading,
    optionsError,
    setDraftField,
    toggleArray,
  };

  function handleClear() {
    reset();
    onClear();
  }

  function handleApply() {
    applyWhole(draft);
    onOpenChange(false);
  }

  const sortBlock = onSortKeyChange ? (
    <div className="mb-3 space-y-1">
      <span className="px-2 font-display text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]">
        Ordenar
      </span>
      {SORT_OPTIONS.map((opt) => {
        const active = sortKey === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onSortKeyChange(opt.key)}
            className={cn(
              "flex w-full items-center justify-between gap-1.5 rounded-[var(--radius-md)] px-2 py-2 text-left font-display text-[11px] font-semibold leading-snug transition-colors",
              active
                ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
            )}
          >
            <span className="whitespace-nowrap">{opt.label}</span>
            {active && <IconCheck size={13} stroke={2.6} className="shrink-0" />}
          </button>
        );
      })}
      <div className="my-2 border-t border-[var(--glass-border-subtle)]" />
    </div>
  ) : null;

  if (!isDesktop) {
    return createPortal(
      <PipelineFilterShell
        onClose={() => onOpenChange(false)}
        draft={draft}
        draftCount={draftCount}
        onClear={handleClear}
        onApply={handleApply}
        onRequestSave={onRequestSave}
      >
        <div className="h-full space-y-3 overflow-y-auto p-4">
          {sortBlock}
          <QuickFiltersList
            draft={draft}
            onApply={applyWhole}
            onRequestSave={onRequestSave}
            orientation="vertical"
          />
          <SearchSection {...section} />
          <StatusSection {...section} />
          <LossReasonsSection {...section} />
          <StagesSection {...section} />
          <SourcesSection {...section} />
          <UtmSourcesSection {...section} />
          <OwnersSection {...section} />
          <ContactSection {...section} />
          <ConversationSection {...section} />
          <ValueSection {...section} />
          <DealCustomFieldsSection {...section} />
          <ContactCustomFieldsSection {...section} />
          <div className="min-h-[220px] rounded-[var(--radius-lg)] border border-[var(--glass-border-subtle)] p-3">
            <TagsChipColumn {...section} />
          </div>
        </div>
      </PipelineFilterShell>,
      document.body,
    );
  }

  return createPortal(
    <PipelineFilterShell
      wide
      onClose={() => onOpenChange(false)}
      draft={draft}
      draftCount={draftCount}
      onClear={handleClear}
      onApply={handleApply}
      onRequestSave={onRequestSave}
    >
      <div
        className="grid h-full min-h-0"
        style={{ gridTemplateColumns: "235px minmax(0,1.15fr) minmax(270px,.9fr)" }}
      >
        {/* Col 1 — visualizações */}
        <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)] p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:!text-[11.5px] [&_.text-\[13px\]]:!text-[11.5px]">
          {sortBlock}
          <ConversationSegmentation {...section} />
          <span className="px-2 pb-2 font-display text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]">
            Visualizações
          </span>
          <QuickFiltersList
            draft={draft}
            onApply={applyWhole}
            onRequestSave={onRequestSave}
            orientation="vertical"
          />
        </aside>

        {/* Col 2 — uma categoria por vez: reduz ruído e elimina o scroll longo. */}
        <main
          ref={middleScrollRef}
          className="min-h-0 overflow-y-auto bg-[var(--glass-bg-base)] [scrollbar-width:thin]"
        >
          <div className="sticky top-0 z-[2] border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-modal)] px-4 pb-3 pt-4">
            <div
              role="tablist"
              aria-label="Categorias de filtros"
              className="flex items-center gap-1 overflow-x-auto rounded-[var(--radius-lg)] bg-[var(--glass-bg-strong)] p-1 [scrollbar-width:none]"
            >
              {MIDDLE_TABS.map((tab) => {
                const active = middleTab === tab.id;
                const count = middleTabCount(tab.id, draft);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setMiddleTab(tab.id)}
                    className={cn(
                      "inline-flex min-w-max flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-2 font-display text-[11px] font-bold transition-colors",
                      active
                        ? "bg-[var(--glass-bg-modal)] text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                    )}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                          active
                            ? "bg-[var(--brand-primary)] text-white"
                            : "bg-[var(--glass-border)] text-[var(--text-secondary)]",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-5">
            <div className="mb-4">
              <h3 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
                {MIDDLE_TABS.find((tab) => tab.id === middleTab)?.label}
              </h3>
              <p className="mt-0.5 font-body text-[11.5px] text-[var(--text-muted)]">
                {MIDDLE_TABS.find((tab) => tab.id === middleTab)?.hint}
              </p>
            </div>

            <div className="space-y-3">
              {middleTab === "negocio" && (
                <>
                  <SearchSection {...section} />
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] items-stretch gap-3 [&>*]:h-full">
                    <StagesSection {...section} />
                    <SourcesSection {...section} />
          <UtmSourcesSection {...section} />
                    <StatusSection {...section} />
                    <LossReasonsSection {...section} />
                  </div>
                  <ValueSection {...section} />
                </>
              )}

              {middleTab === "pessoas" && (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] items-stretch gap-3 [&>*]:h-full">
                  <OwnersSection {...section} />
                  <ContactSection {...section} />
                </div>
              )}

              {middleTab === "custom" && (
                <div className="space-y-3">
                  <DealCustomFieldsSection {...section} />
                  <ContactCustomFieldsSection {...section} />
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Col 3 — tags */}
        <aside className="min-h-0 overflow-hidden border-l border-[var(--glass-border-subtle)] p-4">
          <TagsChipColumn {...section} />
        </aside>
      </div>
    </PipelineFilterShell>,
    document.body,
  );
}
