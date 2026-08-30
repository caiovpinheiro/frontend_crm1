"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutGrid,
  Plus,
  Megaphone,
} from "lucide-react";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { cn } from "@/lib/utils";
import { ViewToggle, type CardsTableView } from "@/components/automations/view-toggle";
import { HeaderPillToggle, SectionHeader } from "@/components/crm/section-header";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import {
  FilterChip,
  FilterPopoverBody,
  FilterPopoverHeader,
  FilterPopoverPanel,
  FilterSectionLabel,
} from "@/components/crm/filter-popover";
import { EmptyState } from "@/components/crm/empty-state";
import { PageActionsMenu, PagePrimaryButton } from "@/components/crm/page-toolbar";
import { LIST_PAGE_PANE_CLASS, PaginationGlass } from "@/components/crm/pagination-glass";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

import { CampaignsList } from "@/features/campaigns/campaigns-list";
import { CampaignsMiniDash } from "@/features/campaigns/mini-dash";
import { useAllCampaigns, useCampaignActions, useCampaigns, useDeleteCampaign } from "@/features/campaigns/hooks";
import { CAMPAIGN_STATUS_FILTERS } from "@/features/campaigns/constants";
import type { CampaignAction, CampaignListItem, CampaignStatus } from "@/features/campaigns/types";
import { SORT_KEYS, SORT_LABEL, sortCampaigns, type CampaignSortKey } from "@/features/campaigns/viz";

const LIST_PER_PAGE = [6, 12, 24] as const;
const DEFAULT_PER_PAGE = 6;
const CAMPAIGNS_SORT_LS = "campaigns-list-sort:v1";
const DEFAULT_SORT: CampaignSortKey = "date";

function isCampaignSortKey(raw: string | null): raw is CampaignSortKey {
  return !!raw && (SORT_KEYS as readonly string[]).includes(raw);
}

function readCampaignSort(): CampaignSortKey {
  if (typeof window === "undefined") return DEFAULT_SORT;
  try {
    const raw = localStorage.getItem(CAMPAIGNS_SORT_LS);
    if (isCampaignSortKey(raw)) return raw;
  } catch {
    /* noop */
  }
  return DEFAULT_SORT;
}

function persistCampaignSort(key: CampaignSortKey) {
  try {
    localStorage.setItem(CAMPAIGNS_SORT_LS, key);
  } catch {
    /* noop */
  }
}

export default function CampaignsClientPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const isAuthenticated = authStatus === "authenticated";
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [sortKey, setSortKey] = useState<CampaignSortKey>(DEFAULT_SORT);
  const [view, setView] = useState<CardsTableView>("cards");
  const deleteMutation = useDeleteCampaign();
  const campaignActions = useCampaignActions();
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    const stored = readCampaignSort();
    setSortKey(stored);
    persistCampaignSort(stored);
  }, []);

  const handleSortChange = (next: CampaignSortKey) => {
    setSortKey(next);
    persistCampaignSort(next);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, perPage]);

  // Lista paginada de verdade (API: status/search/page/perPage/total).
  const listQuery = useCampaigns(
    {
      page,
      perPage,
      status: statusFilter || undefined,
      search: debouncedSearch || undefined,
    },
    isAuthenticated,
  );

  // KPIs e contagens do popover — todas as páginas do GET /api/campaigns.
  const metricsQuery = useAllCampaigns(isAuthenticated);
  const realItems = metricsQuery.data ?? [];

  const allItems = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, lastPage);

  const statusCounts = useMemo(() => {
    const map: Partial<Record<CampaignStatus, number>> = {};
    for (const c of realItems) {
      map[c.status] = (map[c.status] ?? 0) + 1;
    }
    return map;
  }, [realItems]);

  const isLoading = listQuery.isLoading;
  const error = listQuery.error;

  const dashSource = realItems;
  const visibleItems = useMemo(
    () => sortCampaigns(allItems, sortKey),
    [allItems, sortKey],
  );
  const clearFilters = () => {
    setStatusFilter("");
    setSearch("");
  };

  const handleDelete = async (campaign: CampaignListItem) => {
    const ok = await confirm({
      title: "Excluir campanha?",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{campaign.name}</strong>? Esta
          ação não pode ser desfeita.
        </>
      ),
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    deleteMutation.mutate(campaign.id, {
      onSuccess: () => toast.success(`Campanha "${campaign.name}" excluída.`),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Erro ao excluir campanha."),
    });
  };

  const handleCampaignAction = (
    campaign: CampaignListItem,
    action: CampaignAction,
  ) => {
    campaignActions.mutate(
      { id: campaign.id, action },
      {
        onSuccess: (res) =>
          toast.success(
            res?.message ??
              (action === "pause" ? "Campanha pausada." : "Campanha retomada."),
          ),
        onError: (err) =>
          toast.error(
            err instanceof Error ? err.message : "Erro ao atualizar a campanha.",
          ),
      },
    );
  };

  return (
    <div
      className={cn(
        "v2-screen v2-screen-fill grid grid-cols-[var(--nav-rail-w,76px)_1fr] bg-background",
        isLoading && allItems.length === 0
          ? "overflow-hidden"
          : "v2-page-scroll overflow-y-auto",
      )}
    >
      <NavRailSpacer />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-4 py-5">
        <SectionHeader
          icon={Megaphone}
          title="Campanhas"
          searchSlot={
            <CampaignsSearchFilterBar
              search={search}
              onSearch={setSearch}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              sortKey={sortKey}
              onSortChange={handleSortChange}
              statusCounts={statusCounts}
              total={dashSource.length}
              onClearAll={clearFilters}
            />
          }
          actions={
            <>
              <ViewToggle value={view} onChange={setView} />
              <HeaderPillToggle
                options={[
                  { key: "automations", label: "Automações" },
                  { key: "campaigns", label: "Campanhas" },
                ]}
                value="campaigns"
                onChange={(v) => {
                  if (v === "automations") router.push("/automations");
                }}
              />
            </>
          }
          menuSlot={<CampaignsActionsMenu />}
        />

        {isLoading && allItems.length === 0 ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : (
        <>
        <CampaignsMiniDash items={dashSource} />

        <div className={LIST_PAGE_PANE_CLASS}>
            {error ? (
              <div className="flex-1 rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center text-sm text-destructive">
                {error instanceof Error ? error.message : "Erro ao carregar."}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card">
                <EmptyState
                  icon={<Megaphone size={28} />}
                  title="Nenhuma campanha"
                  description={
                    debouncedSearch
                      ? `Sem resultados para "${debouncedSearch}".`
                      : statusFilter
                        ? "Nenhuma campanha com esse status."
                        : "Crie sua primeira campanha para disparar mensagens em massa."
                  }
                  action={
                    <PagePrimaryButton href="/campaigns/new">
                      <Plus size={15} strokeWidth={2.4} /> Nova campanha
                    </PagePrimaryButton>
                  }
                />
              </div>
            ) : (
              <CampaignsList
                items={visibleItems}
                onDelete={handleDelete}
                onPause={(campaign) => handleCampaignAction(campaign, "pause")}
                onResume={(campaign) => handleCampaignAction(campaign, "resume")}
                pendingId={
                  campaignActions.isPending
                    ? campaignActions.variables?.id ?? null
                    : null
                }
                view={view}
              />
            )}

          <PaginationGlass
            className="shrink-0"
            total={total}
            entityLabel="campanhas"
            page={safePage}
            lastPage={lastPage}
            canPrev={safePage > 1}
            canNext={safePage < lastPage}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
            perPage={perPage}
            perPageOptions={LIST_PER_PAGE}
            onPerPageChange={(value) => {
              setPerPage(value);
              setPage(1);
            }}
          />
        </div>
        </>
        )}
        </div>
      </main>
      {confirmDialog}
    </div>
  );
}

// ── Busca + popover de filtros (status) ──────────────────────────────────

function CampaignsSearchFilterBar({
  search,
  onSearch,
  statusFilter,
  onStatusChange,
  sortKey,
  onSortChange,
  statusCounts,
  total,
  onClearAll,
}: {
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  sortKey: CampaignSortKey;
  onSortChange: (v: CampaignSortKey) => void;
  statusCounts: Partial<Record<CampaignStatus, number>>;
  total: number;
  onClearAll: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const activeCount = statusFilter ? 1 : 0;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar campanhas..."
        ariaLabel="Buscar e filtrar campanhas"
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
      />

      {open ? (
        <FilterPopoverPanel>
          <FilterPopoverHeader
            title="Filtros"
            count={activeCount}
            onClear={onClearAll}
            clearDisabled={activeCount === 0 && !search}
          />
          <FilterPopoverBody>
            <FilterSectionLabel>Status</FilterSectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {CAMPAIGN_STATUS_FILTERS.map((f) => {
                const count =
                  f.value === ""
                    ? total
                    : statusCounts[f.value as CampaignStatus] ?? 0;
                return (
                  <FilterChip
                    key={f.value || "all"}
                    selected={statusFilter === f.value}
                    onClick={() => onStatusChange(f.value)}
                    count={count}
                  >
                    {f.label}
                  </FilterChip>
                );
              })}
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <FilterSectionLabel>Ordenar</FilterSectionLabel>
              <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Ordenar campanhas">
                {SORT_KEYS.map((key) => (
                  <FilterChip
                    key={key}
                    selected={sortKey === key}
                    onClick={() => onSortChange(key)}
                  >
                    {SORT_LABEL[key]}
                  </FilterChip>
                ))}
              </div>
            </div>
          </FilterPopoverBody>
        </FilterPopoverPanel>
      ) : null}
    </div>
  );
}

// ── Menu hamburger (CTAs da página) ──────────────────────────────────────

function CampaignsActionsMenu() {
  const router = useRouter();
  return (
    <PageActionsMenu
      items={[
        {
          icon: <Plus size={14} strokeWidth={2.6} />,
          label: "Nova campanha",
          onClick: () => router.push("/campaigns/new"),
          primary: true,
        },
        {
          icon: <LayoutGrid size={13} />,
          label: "Gerenciar segmentos",
          onClick: () => router.push("/campaigns/segments"),
          divider: true,
        },
      ]}
    />
  );
}
