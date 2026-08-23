"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  IconAdjustmentsHorizontal,
  IconCheck,
  IconLayoutGrid,
  IconLayoutList,
  IconPlus,
  IconRotateClockwise,
  IconSearch,
  IconSpeakerphone,
} from "@tabler/icons-react";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PageHeader } from "@/components/crm/page-header";
import { EmptyState } from "@/components/crm/empty-state";
import { PageActionsMenu, PagePrimaryButton, PageSegmentedControl } from "@/components/crm/page-toolbar";
import { PaginationGlass } from "@/components/crm/pagination-glass";
import { cn } from "@/lib/utils";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

import { CampaignCards } from "@/features/campaigns/campaign-cards";
import { CampaignDetailDrawer } from "@/features/campaigns/campaign-detail-drawer";
import { CampaignRow } from "@/features/campaigns/campaign-row";
import { CampaignsMiniDash } from "@/features/campaigns/mini-dash";
import { useCampaigns, useDeleteCampaign } from "@/features/campaigns/hooks";
import { MOCK_CAMPAIGNS_PAGE, mockCampaignsPage } from "@/features/campaigns/mock-campaigns";
import { CAMPAIGN_STATUS_FILTERS } from "@/features/campaigns/constants";
import type { CampaignListItem, CampaignStatus } from "@/features/campaigns/types";
import { SORT_KEYS, SORT_LABEL, sortCampaigns, type CampaignSortKey } from "@/features/campaigns/viz";
import { isPageMockMode, shouldAutoDemoEmpty } from "@/lib/page-mock-mode";

type ViewMode = "cards" | "lista";

const CARD_PER_PAGE = [6, 12, 24] as const;
const LIST_PER_PAGE = [25, 50, 100] as const;
const DEFAULT_PER_PAGE = 6;

export default function CampaignsClientPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const isAuthenticated = authStatus === "authenticated";
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [view, setView] = useState<ViewMode>("cards");
  const [selected, setSelected] = useState<CampaignListItem | null>(null);
  const [sortKey, setSortKey] = useState<CampaignSortKey>("readRate");
  const deleteMutation = useDeleteCampaign();
  const { confirm, dialog: confirmDialog } = useConfirm();

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

  // KPIs e contagens do popover — lote amplo, sem os filtros da lista.
  const metricsQuery = useCampaigns({ page: 1, perPage: 200 }, isAuthenticated);
  const realItems = metricsQuery.data?.items ?? [];

  const isDemoBase = shouldAutoDemoEmpty({
    realCount: realItems.length,
    hasFilters: false,
    isLoading: metricsQuery.isLoading,
    isError: metricsQuery.isError,
  });

  // Em modo demo a paginação roda sobre o mock com os mesmos params da API.
  const demoPage = useMemo(
    () =>
      isDemoBase
        ? mockCampaignsPage({
            page,
            perPage,
            status: statusFilter || undefined,
            search: debouncedSearch || undefined,
          })
        : null,
    [isDemoBase, page, perPage, statusFilter, debouncedSearch],
  );

  const allItems = demoPage ? demoPage.items : listQuery.data?.items ?? [];
  const total = demoPage ? demoPage.total : listQuery.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, lastPage);

  const statusCounts = useMemo(() => {
    const source = isDemoBase ? MOCK_CAMPAIGNS_PAGE.items : realItems;
    const map: Partial<Record<CampaignStatus, number>> = {};
    for (const c of source) {
      map[c.status] = (map[c.status] ?? 0) + 1;
    }
    return map;
  }, [isDemoBase, realItems]);

  const isLoading = listQuery.isLoading;
  const error = isDemoBase ? null : listQuery.error;

  const dashSource = isDemoBase ? MOCK_CAMPAIGNS_PAGE.items : realItems;
  const visibleItems = useMemo(
    () => sortCampaigns(allItems, sortKey),
    [allItems, sortKey],
  );
  const clearFilters = () => {
    setStatusFilter("");
    setSearch("");
  };

  const handleDelete = async (campaign: CampaignListItem) => {
    if (isDemoBase || isPageMockMode() || campaign.id.startsWith("camp-")) {
      toast.info("Modo demonstração — exclusão indisponível.");
      return;
    }
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

  return (
    <div className="v2-screen grid min-w-0 grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
      <NavRailSpacer />

      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden sm:gap-4">
        <PageHeader
          icon={<IconSpeakerphone size={22} stroke={2.2} />}
          title="Campanhas"
          center={
            <CampaignsSearchFilterBar
              search={search}
              onSearch={setSearch}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              sortKey={sortKey}
              onSortChange={setSortKey}
              statusCounts={statusCounts}
              total={dashSource.length}
              onClearAll={clearFilters}
            />
          }
          actions={
            <div className="flex items-center gap-2">
              <PageSegmentedControl
                size="compact"
                aria-label="Automações e campanhas"
                items={[
                  { value: "automations", label: "Automações" },
                  { value: "campaigns", label: "Campanhas" },
                ]}
                value="campaigns"
                onChange={(v) => {
                  if (v === "automations") router.push("/automations");
                }}
              />
              <PageSegmentedControl
                size="compact"
                aria-label="Visualização das campanhas"
                items={[
                  {
                    value: "cards",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <IconLayoutGrid size={13} aria-hidden />
                        Cards
                      </span>
                    ),
                  },
                  {
                    value: "lista",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <IconLayoutList size={13} aria-hidden />
                        Lista
                      </span>
                    ),
                  },
                ]}
                value={view}
                onChange={(v) => {
                  const next = v as ViewMode;
                  setView(next);
                  setPerPage(next === "cards" ? CARD_PER_PAGE[0] : LIST_PER_PAGE[0]);
                  setPage(1);
                }}
              />
              <CampaignsActionsMenu />
            </div>
          }
        />

        <CampaignsMiniDash items={dashSource} />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
            {isLoading && allItems.length === 0 ? (
              <AppLoading variant="inline" className="min-h-[320px]" />
            ) : error ? (
              <div className="rounded-[var(--radius-xl)] border border-[var(--color-danger)]/20 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-6 text-center font-body text-[13px] text-[var(--color-danger-text)]">
                {error instanceof Error ? error.message : "Erro ao carregar."}
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] shadow-[var(--glass-shadow)] backdrop-blur-md">
                <EmptyState
                  icon={<IconSpeakerphone size={28} />}
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
                      <IconPlus size={15} stroke={2.4} /> Nova campanha
                    </PagePrimaryButton>
                  }
                />
              </div>
            ) : view === "cards" ? (
              <div className="pb-3">
                <CampaignCards items={visibleItems} onSelect={setSelected} />
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 pb-3">
                {visibleItems.map((c) => (
                  <CampaignRow key={c.id} campaign={c} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>

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
            perPageOptions={view === "cards" ? CARD_PER_PAGE : LIST_PER_PAGE}
            onPerPageChange={(value) => {
              setPerPage(value);
              setPage(1);
            }}
          />
        </div>
      </main>
      <CampaignDetailDrawer campaign={selected} onClose={() => setSelected(null)} />
      {confirmDialog}
    </div>
  );
}

// ── Busca + popover de filtros (status) ──────────────────────────────────

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 font-display text-[10px] font-bold leading-none text-white">
      {count}
    </span>
  );
}

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
      <IconSearch
        size={15}
        className="absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 text-[var(--text-muted)]"
      />
      <input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Pesquisar e filtrar campanhas..."
        aria-label="Buscar e filtrar campanhas"
        className="h-10 w-full rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] pl-9 pr-24 font-body text-[13px] text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--input-ring-focus)]"
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Filtros"
        className={cn(
          "absolute right-1.5 top-1/2 flex h-7 -translate-y-1/2 items-center justify-center gap-1.5 rounded-full px-2.5 transition-colors",
          activeCount > 0 || open
            ? "bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)]"
            : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)]",
        )}
      >
        <IconAdjustmentsHorizontal size={15} />
        <span className="font-display text-[11px] font-semibold leading-none">
          Filtrar
        </span>
        {activeCount > 0 && (
          <span className="font-display text-[10px] font-bold leading-none tabular-nums">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 flex w-[min(100vw-2rem,380px)] flex-col overflow-visible rounded-[22px] border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] text-left shadow-[var(--glass-shadow-lg)] backdrop-blur-md">
          <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-[14px] font-bold text-[var(--text-primary)]">
                Filtrar por status
              </span>
              <CountBadge count={activeCount} />
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

          <div className="max-h-[min(60vh,420px)] overflow-y-auto px-4 pb-4">
            <div className="flex flex-wrap gap-1.5">
              {CAMPAIGN_STATUS_FILTERS.map((f) => {
                const selected = statusFilter === f.value;
                const count =
                  f.value === ""
                    ? total
                    : statusCounts[f.value as CampaignStatus] ?? 0;
                return (
                  <button
                    key={f.value || "all"}
                    type="button"
                    onClick={() => onStatusChange(f.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12px] font-bold transition-colors",
                      selected
                        ? "border-[var(--brand-primary)] bg-[var(--color-primary-soft)] text-[var(--brand-primary)]"
                        : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]",
                    )}
                  >
                    {selected && <IconCheck size={12} stroke={2.4} />}
                    {f.label}
                    <span
                      className={cn(
                        "min-w-[18px] rounded-full px-1.5 text-center text-[10px] font-bold",
                        selected
                          ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
                          : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 border-t border-[var(--glass-border)] pt-3">
              <p className="mb-2 font-display text-[12px] font-semibold text-[var(--text-muted)]">
                Ordenar
              </p>
              <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Ordenar campanhas">
                {SORT_KEYS.map((key) => {
                  const selected = sortKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onSortChange(key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12px] font-bold transition-colors",
                        selected
                          ? "border-[var(--brand-primary)] bg-[var(--color-primary-soft)] text-[var(--brand-primary)]"
                          : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]",
                      )}
                    >
                      {selected && <IconCheck size={12} stroke={2.4} />}
                      {SORT_LABEL[key]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
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
          icon: <IconPlus size={14} stroke={2.6} />,
          label: "Nova campanha",
          onClick: () => router.push("/campaigns/new"),
          primary: true,
        },
        {
          icon: <IconLayoutGrid size={13} />,
          label: "Gerenciar segmentos",
          onClick: () => router.push("/campaigns/segments"),
          divider: true,
        },
      ]}
    />
  );
}
