/**
 * Barra de busca do Kanban — abre o modal canônico de filtros (B + Kommo)
 * e o dropdown de resultados (mesmo mecanismo da Inbox).
 */

"use client";

import * as React from "react";
import { toast } from "sonner";
import { IconBriefcase } from "@tabler/icons-react";

import { FilterSearchTrigger } from "@/components/crm/filter-search-trigger";
import {
  OmnisearchHitAvatar,
  OmnisearchHitButton,
  OmnisearchResultsPanel,
  OmnisearchSection,
  OmnisearchStatusPill,
} from "@/components/crm/omnisearch-results";
import { useOmnisearchMenu } from "@/components/crm/use-omnisearch-menu";
import { sanitizeContactName } from "@/lib/display-name";
import type { DealListItemDto } from "@/features/pipeline-v2/api/list";
import { usePipelines } from "@/features/pipeline-v2/hooks";
import { usePipelineOmnisearch } from "@/features/pipeline-v2/use-pipeline-omnisearch";

import { dealFilterChips } from "../filter-chips";
import { createSavedFilter } from "../api";
import {
  countPanelFilters,
  type AdvancedDealFilters,
  type FilterOptionsResponse,
} from "../types";
import {
  FilterModalThreeCol,
  type PipelineSortKey,
} from "./variant-modal-three-col";

export type { PipelineSortKey };

const DEAL_STATUS: Record<DealListItemDto["status"], string> = {
  OPEN: "Aberto",
  WON: "Ganho",
  LOST: "Perdido",
};

interface PipelineSearchFilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  filters: AdvancedDealFilters;
  onApplyFilters: (next: AdvancedDealFilters) => void;
  onClearFilters: () => void;
  options: FilterOptionsResponse | null;
  optionsLoading: boolean;
  optionsError?: string | null;
  sortKey?: PipelineSortKey;
  onSortKeyChange?: (key: PipelineSortKey) => void;
  placeholder?: string;
  className?: string;
  pipelineId?: string | null;
  onPickDeal?: (deal: DealListItemDto) => void;
  onFilterPanelOpenChange?: (open: boolean) => void;
}

export function PipelineSearchFilterBar({
  search,
  onSearch,
  filters,
  onApplyFilters,
  onClearFilters,
  options,
  optionsLoading,
  optionsError,
  sortKey = "default",
  onSortKeyChange,
  placeholder = "Pesquisar e filtrar...",
  className,
  pipelineId: _pipelineId,
  onPickDeal,
  onFilterPanelOpenChange,
}: PipelineSearchFilterBarProps) {
  void _pipelineId;
  const [open, setOpenState] = React.useState(false);
  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next);
      onFilterPanelOpenChange?.(next);
    },
    [onFilterPanelOpenChange],
  );
  const [saving, setSaving] = React.useState(false);

  const hits = usePipelineOmnisearch(search, search.trim().length >= 3);
  const { data: pipelines = [] } = usePipelines();
  const pipelineNameById = React.useMemo(
    () => new Map(pipelines.map((p) => [p.id, p.name])),
    [pipelines],
  );
  const menu = useOmnisearchMenu(search, hits.items.length);
  // Período (criação/fechamento) marca o ícone do calendário, não o Filtrar.
  const activeCount = countPanelFilters(filters) + (search.trim() ? 1 : 0);
  const chips = React.useMemo(
    () =>
      dealFilterChips(filters, options, (partial) =>
        onApplyFilters({ ...filters, ...partial }),
      ),
    [filters, options, onApplyFilters],
  );

  function pickDeal(deal: DealListItemDto) {
    onPickDeal?.(deal);
    onSearch("");
    menu.close();
  }

  async function handleSave(current: AdvancedDealFilters) {
    if (saving) return;
    const name = window.prompt("Nome do filtro salvo:");
    if (!name?.trim()) return;
    setSaving(true);
    try {
      await createSavedFilter({
        name: name.trim(),
        entityType: "kanban_deals",
        filterConfig: current,
        isShared: false,
      });
      toast.success("Filtro salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o filtro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={className}>
      <div ref={menu.wrapRef}>
        <FilterSearchTrigger
          search={search}
          onSearch={onSearch}
          onFocus={() => menu.setFocused(true)}
          onKeyDown={(e) =>
            menu.onInputKeyDown(e, () => {
              const deal = hits.items[menu.activeIndex] ?? hits.items[0];
              if (deal) pickDeal(deal);
            })
          }
          onOpenFilters={() => {
            setOpen(true);
            menu.close();
          }}
          filtersOpen={open}
          activeCount={activeCount}
          placeholder={placeholder}
          ariaLabel="Buscar e filtrar negócios"
          chips={chips}
        />
      </div>

      {menu.showHits && menu.coords && typeof document !== "undefined" && (
        <OmnisearchResultsPanel
          coords={menu.coords}
          loading={hits.isLoading || hits.waitingDebounce}
          query={hits.query || search.trim()}
          empty={hits.items.length === 0}
          total={hits.items.length}
          onSeeAll={menu.close}
        >
          <OmnisearchSection
            icon={<IconBriefcase size={13} />}
            label="Negócios"
            count={hits.items.length}
          >
            {hits.items.map((deal, i) => {
              const name = sanitizeContactName(deal.contact?.name) || deal.title || "Negócio";
              const stage = deal.stage?.name?.trim() || null;
              const funnel = deal.stage?.pipelineId
                ? pipelineNameById.get(deal.stage.pipelineId)
                : null;
              const detail = [funnel, stage ? `Etapa ${stage}` : deal.title]
                .filter(Boolean)
                .join(" · ");
              return (
                <OmnisearchHitButton
                  key={deal.id}
                  active={i === menu.activeIndex}
                  onHover={() => menu.setActiveIndex(i)}
                  onClick={() => pickDeal(deal)}
                >
                  <OmnisearchHitAvatar
                    id={deal.contact?.id ?? deal.id}
                    name={name}
                    imageUrl={deal.contact?.avatarUrl}
                    overlay={<IconBriefcase size={10} />}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                        {name}
                      </span>
                      {deal.number != null && (
                        <span className="shrink-0 font-body text-[12px] tabular-nums text-[var(--text-muted)]">
                          #{deal.number}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 truncate font-body text-[12px] text-[var(--text-secondary)]">
                      {detail}
                    </span>
                  </span>
                  <OmnisearchStatusPill tone={deal.status === "LOST" ? "danger" : "success"}>
                    {DEAL_STATUS[deal.status]}
                  </OmnisearchStatusPill>
                </OmnisearchHitButton>
              );
            })}
          </OmnisearchSection>
        </OmnisearchResultsPanel>
      )}

      <FilterModalThreeCol
        open={open}
        onOpenChange={setOpen}
        value={filters}
        options={options}
        optionsLoading={optionsLoading}
        optionsError={optionsError ?? null}
        onApply={onApplyFilters}
        onClear={onClearFilters}
        onRequestSave={handleSave}
        sortKey={sortKey}
        onSortKeyChange={onSortKeyChange}
      />
    </div>
  );
}
