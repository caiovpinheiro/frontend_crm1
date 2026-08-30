"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconColumns,
  IconDownload,
  IconFileImport,
  IconGridDots,
  IconList,
  IconLoader2,
  IconPlus,
  IconRotateClockwise,
  IconSettings,
  IconUpload,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import {
  PageActionsMenu,
  type PageActionsMenuItem,
  PageSegmentedControl,
} from "@/components/crm/page-toolbar";
import { LIST_PAGE_PANE_CLASS, PaginationGlass } from "@/components/crm/pagination-glass";
import { EmptyState } from "@/components/crm/empty-state";
import { ViewToggle, useCardsTableView } from "@/components/automations/view-toggle";
import { PageChrome } from "@/components/crm/page-header";
import { PipelineHeader } from "@/components/crm/pipeline-header";
import { PipelineSwitcher, AddDealDialog } from "@/features/pipeline-v2/extras";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { ButtonGlass } from "@/components/crm/button-glass";
import {
  DealListTable,
  DEAL_LIST_COLUMNS,
  DEFAULT_DEAL_LIST_COLUMN_KEYS,
  type DealListColumnKey,
  type DealListTab,
} from "@/components/crm/deal-list-table";
import { PipelineSearchFilterBar } from "@/components/pipeline/kanban-filters/v2/search-filter-bar";
import { PipelinePeriodCalendar } from "@/components/pipeline/kanban-filters/pipeline-period-calendar";
import { FilterChips } from "@/components/pipeline/kanban-filters/filter-chips";
import { fetchFilterOptions } from "@/components/pipeline/kanban-filters/api";
import { useKanbanFilters } from "@/components/pipeline/kanban-filters/use-kanban-filters";
import { usePipelineSearchSort } from "@/components/pipeline/kanban-filters/use-pipeline-search-sort";
import {
  isEmptyFilters,
} from "@/components/pipeline/kanban-filters/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { useCan } from "@/hooks/use-my-permissions";
import { useStuckTimeout } from "@/hooks/use-stuck-timeout";

import {
  useBoard,
  useDealsList,
  usePipelineUrlSync,
  usePipelines,
  useTeamUsers,
} from "@/features/pipeline-v2/hooks";
import { toDealListRow } from "@/features/pipeline-v2/adapters";
import {
  ExportPanel,
  ImportPanel,
  useImportExportBump,
  type ExportScope,
} from "@/features/pipeline-v2/import-export";
import type { DealListItemDto } from "@/features/pipeline-v2/api";
import { BulkActionsBar } from "@/components/pipeline/bulk-actions-bar";
import type { BulkScopeContext } from "@/components/pipeline/bulk-edit-fields-dialog";

import { cn } from "@/lib/utils";
import {
  pathForPipelineView,
  writePipelineViewPreference,
} from "@/lib/pipeline-view-preference";
import {
  SEARCH_DEBOUNCE_MS,
  normalizeSearchQuery,
} from "@/lib/search-query";

const DEFAULT_PER_PAGE = 25;
const COLUMNS_STORAGE_KEY = "pipeline-list-columns:v1";

const STATUS_TABS: { id: DealListTab; label: string; icon: React.ReactNode }[] = [
  { id: "abertos", label: "Abertos", icon: <IconClock size={13} /> },
  { id: "ganhos", label: "Ganhos", icon: <IconCircleCheck size={13} /> },
  { id: "perdidos", label: "Perdidos", icon: <IconCircleX size={13} /> },
  { id: "todos", label: "Todos", icon: <IconGridDots size={13} /> },
];

function statusFromTab(tab: DealListTab): "OPEN" | "WON" | "LOST" | undefined {
  if (tab === "abertos") return "OPEN";
  if (tab === "ganhos") return "WON";
  if (tab === "perdidos") return "LOST";
  return undefined;
}

function readStoredColumns(): DealListColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_DEAL_LIST_COLUMN_KEYS;
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_DEAL_LIST_COLUMN_KEYS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_DEAL_LIST_COLUMN_KEYS;
    const allowed = new Set(DEAL_LIST_COLUMNS.map((c) => c.key));
    const keys = parsed.filter(
      (k): k is DealListColumnKey => typeof k === "string" && allowed.has(k as DealListColumnKey),
    );
    if (!keys.includes("dealTitle")) keys.unshift("dealTitle");
    return keys.length ? keys : DEFAULT_DEAL_LIST_COLUMN_KEYS;
  } catch {
    return DEFAULT_DEAL_LIST_COLUMN_KEYS;
  }
}

export default function V2PipelineListClientPage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";
  const bump = useImportExportBump();
  const queryClient = useQueryClient();

  useEffect(() => {
    writePipelineViewPreference("list");
  }, []);

  // `?q=` (busca) e `?sort=` na URL — link copiável reproduz a visão.
  const { search, setSearch, sortKey, setSortKey } = usePipelineSearchSort();
  const [debounced, setDebounced] = useState(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [statusTab, setStatusTab] = useState<DealListTab>("abertos");
  const [addOpen, setAddOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState<"import" | "export" | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [dupesOpen, setDupesOpen] = useState(false);
  const [activeColumnKeys, setActiveColumnKeys] = useState<DealListColumnKey[]>(readStoredColumns);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [view, setView] = useCardsTableView();

  const { filters, setFilters, patch: patchFilters, clear: clearFilters } = useKanbanFilters();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(activeColumnKeys));
    } catch {
      /* noop */
    }
  }, [activeColumnKeys]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const filterOptionsQuery = useQuery({
    queryKey: ["kanban-filter-options"],
    queryFn: fetchFilterOptions,
    enabled: isAuthenticated && (filterPanelOpen || !isEmptyFilters(filters)),
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const filterOptions = filterOptionsQuery.data ?? null;
  const filterOptionsLoading = filterOptionsQuery.isLoading;

  const pipelinesQuery = usePipelines(isAuthenticated);
  const pipelines = pipelinesQuery.data ?? [];
  const { pipelineId, setPipelineId } = usePipelineUrlSync(
    pipelinesQuery.data,
  );

  const advancedForList = useMemo(() => {
    const { search: _ignore, ...rest } = filters;
    return rest;
  }, [filters]);

  const listSearch = normalizeSearchQuery(debounced);

  const dealsQuery = useDealsList({
    pipelineId: pipelineId ?? undefined,
    search: listSearch || undefined,
    status: statusFromTab(statusTab),
    page,
    perPage,
    filters: isEmptyFilters(advancedForList) ? undefined : advancedForList,
    enabled: isAuthenticated && !!pipelineId,
  });

  const boardQuery = useBoard({
    pipelineId,
    status: "OPEN",
    enabled: isAuthenticated && !!pipelineId,
  });
  const stages = (boardQuery.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? undefined,
    isLost: Boolean(s.isLost),
  }));
  const { data: teamUsers = [] } = useTeamUsers(isAuthenticated && selectedIds.size > 0);

  const total = dealsQuery.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const items = dealsQuery.data?.items ?? [];
  const rows = items.map(toDealListRow);

  // Limpa seleção ao mudar página / filtros / pipeline / status.
  useEffect(() => {
    // Limpa só quando o contexto da lista muda — NÃO ao trocar de página
    // (seleção acumula entre páginas para ações em massa).
    setSelectedIds(new Set());
  }, [pipelineId, statusTab, debounced, filters]);

  const scopeContext = useMemo<BulkScopeContext | undefined>(() => {
    if (!pipelineId) return undefined;
    const status =
      statusTab === "abertos"
        ? "OPEN"
        : statusTab === "ganhos"
          ? "WON"
          : statusTab === "perdidos"
            ? "LOST"
            : "ALL";
    let stage: { id: string; name: string; total: number } | null = null;
    const stageIds = filters.stageIds;
    if (stageIds?.length === 1) {
      const s = stages.find((x) => x.id === stageIds[0]);
      if (s) stage = { id: s.id, name: s.name, total };
    }
    return {
      pipelineId,
      status,
      filters: { ...filters, ...(listSearch ? { search: listSearch } : {}) },
      pipelineTotal: total,
      stage,
    };
  }, [pipelineId, statusTab, filters, listSearch, stages, total]);

  const tabCounts = useMemo(
    () => ({
      abertos: rows.filter((d) => d.status === "OPEN").length,
      ganhos: rows.filter((d) => d.status === "WON").length,
      perdidos: rows.filter((d) => d.status === "LOST").length,
      todos: rows.length,
    }),
    [rows],
  );

  const hasActiveFilters = !isEmptyFilters(filters) || !!search.trim();
  const pipelinesEmpty =
    pipelinesQuery.isFetched && pipelines.length === 0;
  const pipelinesPending =
    sessionStatus === "loading" ||
    (isAuthenticated && !pipelineId && !pipelinesEmpty && !pipelinesQuery.isError);
  const pipelinesStuck = useStuckTimeout(pipelinesPending);
  const waitingForPipeline = pipelinesPending && !pipelinesStuck;
  const dealsPending =
    !!pipelineId && !dealsQuery.data && !dealsQuery.isError;
  const dealsStuck = useStuckTimeout(dealsPending);
  const waitingForDeals = dealsPending && !dealsStuck;

  function toggleColumn(key: DealListColumnKey) {
    if (key === "dealTitle") return;
    setActiveColumnKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      const next = [...prev, key];
      return DEFAULT_DEAL_LIST_COLUMN_KEYS.filter((k) => next.includes(k));
    });
  }

  function openDeal(id: string, number?: number | null) {
    if (number != null) {
      router.push(`/pipeline?deal=${encodeURIComponent(String(number))}`);
      return;
    }
    router.push("/pipeline");
  }

  return (
    <div
      className={cn(
        "v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4",
      )}
    >
      <NavRailSpacer />

      <PageChrome
        header={
        <PipelineHeader
          activeView="list"
          onViewChange={(view) => {
            writePipelineViewPreference(view);
            if (view === "list") return;
            router.push(pathForPipelineView(view));
          }}
          titleAccessory={
            <PipelineSwitcher
              variant="icon"
              selectedId={pipelineId}
              onChange={(id) => {
                setPipelineId(id);
                setPage(1);
              }}
            />
          }
          searchSlot={
            <PipelineSearchFilterBar
              search={search}
              onSearch={setSearch}
              filters={filters}
              onApplyFilters={setFilters}
              onClearFilters={() => {
                clearFilters();
                setSearch("");
              }}
              options={filterOptions}
              optionsLoading={filterOptionsLoading}
              sortKey={sortKey}
              onSortKeyChange={setSortKey}
              placeholder="Buscar por título, contato, CPF, RGM…"
              pipelineId={pipelineId}
              onFilterPanelOpenChange={setFilterPanelOpen}
              onPickDeal={(deal) => {
                const dest = deal.stage?.pipelineId;
                if (dest && dest !== pipelineId) setPipelineId(dest);
                openDeal(deal.id, deal.number);
              }}
            />
          }
          period={
            <>
              <PipelinePeriodCalendar filters={filters} onPatch={patchFilters} />
              <ViewToggle value={view} onChange={setView} />
            </>
          }
          tabsOverride={
            <PageSegmentedControl
              size="compact"
              aria-label="Filtrar negócios por status"
              items={STATUS_TABS.map((t) => ({
                value: t.id,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {t.icon}
                    {t.label}
                    <span className="min-w-[18px] rounded-full bg-[var(--glass-bg-strong)] px-1.5 text-center text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
                      {tabCounts[t.id]}
                    </span>
                  </span>
                ),
              }))}
              value={statusTab}
              onChange={(v) => setStatusTab(v as DealListTab)}
            />
          }
          menuSlot={
            <ListActionsMenu
              onAdd={() => setAddOpen(true)}
              onImport={() => setImportExportOpen("import")}
              onExport={() => setImportExportOpen("export")}
              onColumns={() => setColumnsOpen(true)}
              onDupes={() => setDupesOpen(true)}
            />
          }
        />
        }
        bodyClassName="gap-4"
      >

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 px-0.5">
            <span className="text-xs font-semibold tracking-wide text-primary">
              Filtros ativos
            </span>
            {!isEmptyFilters(filters) && (
              <FilterChips
                filters={filters}
                options={filterOptions}
                onPatch={patchFilters}
              />
            )}
            {search.trim() && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-[11px] font-medium text-primary"
              >
                Busca: {search.trim()}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clearFilters();
                setSearch("");
              }}
              className="font-display text-[11px] font-semibold text-[var(--text-muted)] underline-offset-2 hover:text-[var(--brand-primary)] hover:underline"
            >
              Limpar todos
            </button>
          </div>
        )}

        <div className={LIST_PAGE_PANE_CLASS}>
        {waitingForPipeline || waitingForDeals ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : dealsQuery.error || dealsStuck ? (
          <div className="flex-1 rounded-[var(--radius-xl)] border border-[var(--color-danger)]/20 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-6 text-center font-body text-[13px] text-[var(--color-danger-text)]">
            {dealsQuery.error instanceof Error
              ? dealsQuery.error.message
              : "Erro ao carregar negócios."}
          </div>
        ) : !pipelineId ? (
          <div className="flex-1 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-md shadow-[var(--glass-shadow)]">
            <EmptyState
              icon={<IconList size={28} />}
              title="Selecione um pipeline"
              description="Pipeline ativo nao retornou estagios. Verifique a configuracao no painel de administracao."
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex-1 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-md shadow-[var(--glass-shadow)]">
            <EmptyState
              icon={<IconList size={28} />}
              title="Nenhum negócio encontrado"
              description={
                hasActiveFilters
                  ? "Nenhum negócio corresponde aos filtros. Ajuste ou limpe os critérios."
                  : "Use o menu de ações para criar o primeiro negócio."
              }
            />
          </div>
        ) : (
          <DealListTable
            className="min-h-0 flex-1"
            deals={rows}
            statusTab={statusTab}
            visibleColumns={activeColumnKeys}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            view={view}
            onRowClick={(id) => {
              const item = items.find((d) => d.id === id);
              openDeal(id, item?.number);
            }}
          />
        )}

        <PaginationGlass
          total={total}
          entityLabel="negócios"
          page={page}
          lastPage={lastPage}
          canPrev={page > 1}
          canNext={page < lastPage}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          perPage={perPage}
          perPageOptions={[25, 50, 100, 1000]}
          onPerPageChange={(value) => {
            setPerPage(value);
            setPage(1);
          }}
        />
        </div>
      </PageChrome>

      {pipelineId ? (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          selectedIds={selectedIds}
          onClear={() => setSelectedIds(new Set())}
          pipelineId={pipelineId}
          stages={stages}
          users={teamUsers.map((u) => ({ id: u.id, name: u.name }))}
          scopeContext={scopeContext}
        />
      ) : null}

      <AddDealDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        stages={stages}
        defaultStageId={stages[0]?.id ?? null}
        pipelineId={pipelineId}
        statusFilter="OPEN"
      />

      {importExportOpen && (
        <ImportExportModal
          activeTab={importExportOpen}
          onClose={() => setImportExportOpen(null)}
          bump={() => {
            bump();
            void queryClient.invalidateQueries({ queryKey: ["deals-list"] });
          }}
          exportScope={{
            pipelineId,
            // Espelha exatamente o que `dealsQuery` pediu: `advancedForList`
            // (sem o `search` do modal, que a lista ignora) + a busca já
            // normalizada. Do contrário o "exportar base filtrada" traria um
            // recorte diferente do que está na tela.
            filters: {
              ...advancedForList,
              ...(listSearch ? { search: listSearch } : {}),
            },
            status: statusFromTab(statusTab) ?? "ALL",
            filteredTotal: total,
          }}
        />
      )}

      <ColumnsDialog
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        activeKeys={activeColumnKeys}
        onToggle={toggleColumn}
        onReset={() => setActiveColumnKeys(DEFAULT_DEAL_LIST_COLUMN_KEYS)}
      />

      <DealDuplicatesSheet
        open={dupesOpen}
        onOpenChange={setDupesOpen}
        pipelineId={pipelineId}
        status={statusFromTab(statusTab)}
        enabled={isAuthenticated && !!pipelineId}
        onOpenDeal={openDeal}
      />
    </div>
  );
}

// ── Menu de ações (padrão Contatos) ──────────────────────────────────────────

function ListActionsMenu({
  onAdd,
  onExport,
  onImport,
  onColumns,
  onDupes,
}: {
  onAdd: () => void;
  onExport: () => void;
  onImport: () => void;
  onColumns: () => void;
  onDupes: () => void;
}) {
  const canImport = useCan("deal:import");
  const canExport = useCan("deal:export");

  const items: PageActionsMenuItem[] = [
    { icon: <IconPlus size={14} stroke={2.6} />, label: "Adicionar negócio", onClick: onAdd, primary: true },
    ...(canImport
      ? [{ icon: <IconFileImport size={13} />, label: "Importar", onClick: onImport }]
      : []),
    ...(canExport
      ? [{ icon: <IconDownload size={13} />, label: "Exportar", onClick: onExport }]
      : []),
    { icon: <IconUsersGroup size={13} />, label: "Localizar duplicados", onClick: onDupes },
    {
      icon: <IconSettings size={13} />,
      label: "Configuração da lista",
      onClick: onColumns,
      divider: true,
    },
  ];

  return <PageActionsMenu aria-label="Ações da lista" items={items} />;
}

// ── Configuração da lista ────────────────────────────────────────────────────

function ColumnsDialog({
  open,
  onOpenChange,
  activeKeys,
  onToggle,
  onReset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeKeys: DealListColumnKey[];
  onToggle: (key: DealListColumnKey) => void;
  onReset: () => void;
}) {
  const activeSet = new Set(activeKeys);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--brand-primary)]">
              <IconColumns size={18} />
            </span>
            <DialogTitle className="text-base">Configuração da lista</DialogTitle>
          </div>
          <DialogDescription className="text-[13px] leading-relaxed">
            Escolha as colunas exibidas na lista de negócios. Suas escolhas ficam salvas neste navegador.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <div className="flex items-center justify-between">
            <span className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Colunas
            </span>
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 font-display text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)]"
            >
              <IconRotateClockwise size={12} /> Restaurar padrão
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEAL_LIST_COLUMNS.map((col) => {
              const on = activeSet.has(col.key);
              const locked = !!col.locked;
              return (
                <button
                  key={col.key}
                  type="button"
                  disabled={locked}
                  onClick={() => onToggle(col.key)}
                  aria-pressed={on}
                  className={cn(
                    "flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors",
                    on
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                      : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]",
                    locked && "cursor-default opacity-90",
                  )}
                >
                  {on ? <IconCheck size={13} stroke={2.6} /> : <IconPlus size={13} stroke={2.4} />}
                  {col.label}
                </button>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <ButtonGlass variant="primary" size="sm" type="button" onClick={() => onOpenChange(false)}>
            Concluído
          </ButtonGlass>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Localizar duplicados ─────────────────────────────────────────────────────

type DupeGroup = {
  key: string;
  label: string;
  reason: string;
  deals: DealListItemDto[];
};

function buildDealDupeGroups(items: DealListItemDto[]): DupeGroup[] {
  const byContact = new Map<string, DealListItemDto[]>();
  const byTitle = new Map<string, DealListItemDto[]>();

  for (const d of items) {
    if (d.contactId) {
      const list = byContact.get(d.contactId) ?? [];
      list.push(d);
      byContact.set(d.contactId, list);
    }
    const titleKey = (d.title || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (titleKey.length >= 3) {
      const list = byTitle.get(titleKey) ?? [];
      list.push(d);
      byTitle.set(titleKey, list);
    }
  }

  const groups: DupeGroup[] = [];
  const seenDealPairs = new Set<string>();

  for (const [contactId, deals] of byContact) {
    if (deals.length < 2) continue;
    const ids = deals.map((d) => d.id).sort().join(",");
    seenDealPairs.add(ids);
    const name = deals[0]?.contact?.name?.trim() || "Contato";
    groups.push({
      key: `contact:${contactId}`,
      label: name,
      reason: `${deals.length} negócios no mesmo contato`,
      deals,
    });
  }

  for (const [titleKey, deals] of byTitle) {
    if (deals.length < 2) continue;
    const ids = deals.map((d) => d.id).sort().join(",");
    if (seenDealPairs.has(ids)) continue;
    groups.push({
      key: `title:${titleKey}`,
      label: deals[0]?.title || titleKey,
      reason: `${deals.length} negócios com o mesmo título`,
      deals,
    });
  }

  return groups.sort((a, b) => b.deals.length - a.deals.length);
}

function DealDuplicatesSheet({
  open,
  onOpenChange,
  pipelineId,
  status,
  enabled,
  onOpenDeal,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipelineId: string | null;
  status: "OPEN" | "WON" | "LOST" | undefined;
  enabled: boolean;
  onOpenDeal: (id: string, number?: number | null) => void;
}) {
  const query = useDealsList({
    pipelineId: pipelineId ?? undefined,
    status,
    page: 1,
    perPage: 200,
    enabled: enabled && open,
  });

  const groups = useMemo(
    () => buildDealDupeGroups(query.data?.items ?? []),
    [query.data?.items],
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Localizar duplicados"
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <p className="font-body text-[13px] leading-relaxed text-[var(--text-muted)]">
          Negócios com o mesmo contato ou o mesmo título (até 200 registros do filtro atual).
          Abra cada um para revisar — a mesclagem automática ainda não está disponível para negócios.
        </p>

        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-muted)]">
            <IconLoader2 size={20} className="animate-spin" />
            Analisando negócios…
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-8 text-center font-body text-[13px] text-[var(--text-muted)]">
            Nenhum possível duplicado encontrado neste recorte.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((g) => (
              <div
                key={g.key}
                className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-[13px] font-bold text-[var(--text-primary)]">
                      {g.label}
                    </p>
                    <p className="font-body text-[12px] text-[var(--text-muted)]">{g.reason}</p>
                  </div>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {g.deals.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenDeal(d.id, d.number);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--glass-bg-overlay)]"
                      >
                        <span className="truncate font-display text-[13px] font-semibold text-[var(--text-secondary)]">
                          {d.title || `Negócio #${d.number ?? d.id.slice(0, 4)}`}
                        </span>
                        <span className="shrink-0 font-body text-[11px] text-[var(--text-muted)]">
                          {d.stage?.name ?? "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormDialog>
  );
}

// ── Import / Export ──────────────────────────────────────────────────────────

function ImportExportModal({
  activeTab,
  onClose,
  bump,
  exportScope,
}: {
  activeTab: "import" | "export";
  onClose: () => void;
  bump: () => void;
  /** Funil + filtros ativos: habilita "exportar só a base filtrada". */
  exportScope?: ExportScope;
}) {
  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/25 px-4 py-4 backdrop-blur-[2px] sm:px-6 sm:py-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1320px] max-h-[92vh] overflow-y-auto rounded-2xl border border-[var(--glass-border)] bg-[var(--dropdown-solid-bg)] shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--glass-border)] bg-[var(--dropdown-solid-bg)]/95 px-6 py-5 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary)]/10">
              {activeTab === "import" ? (
                <IconUpload size={20} className="text-[var(--brand-primary)]" />
              ) : (
                <IconDownload size={20} className="text-[var(--brand-primary)]" />
              )}
            </div>
            <div>
              <h2 className="font-display text-[17px] font-bold text-[var(--text-primary)]">
                {activeTab === "import" ? "Importar negócios" : "Exportar dados"}
              </h2>
              <p className="mt-0.5 font-body text-[13px] text-[var(--text-muted)]">
                {activeTab === "import"
                  ? "CSV de negócios — contatos são criados automaticamente quando nome + email/telefone são informados"
                  : "Baixar base em CSV"}
              </p>
            </div>
          </div>
          <TooltipGlass label="Fechar" side="left">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            >
              <IconX size={17} />
            </button>
          </TooltipGlass>
        </div>
        <div className="p-6 sm:p-8">
          {activeTab === "import" ? (
            <ImportPanel
              fixedEntity="deals"
              onDone={() => {
                bump();
                onClose();
              }}
            />
          ) : (
            <ExportPanel scope={exportScope} />
          )}
        </div>
      </div>
    </div>
  );
}
