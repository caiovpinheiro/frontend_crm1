"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconSettings } from "@tabler/icons-react";

import { RequirePermission } from "@/components/auth/require-permission";
import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PipelineHeader } from "@/components/crm/pipeline-header";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import type { DealDetail } from "@/components/crm/deal-detail-panel";
import { FieldConfigPanel } from "@/components/crm/fields/field-config-panel";
import type { BoardStage } from "@/components/pipeline/kanban-board";
import { SalesHubView } from "@/components/pipeline/sales-hub-view";
import type { DealQueueSortMode } from "@/components/sales-hub/deal-queue";
import { avatarInitials } from "@/features/inbox-v2/adapters";
import { useContactSidebar } from "@/features/inbox-v2/hooks";
import { useStuckTimeout } from "@/hooks/use-stuck-timeout";
import type { BoardSortParam } from "@/features/pipeline-v2/api";
import {
  useBoard,
  useBoardFiltered,
  boardKey,
  BOARD_PAGE_SIZE,
  useDealDeepLink,
  useDealDetail,
  usePipelineRealtime,
  usePipelineUrlSync,
  usePipelines,
} from "@/features/pipeline-v2/hooks";
import { PipelineSwitcher } from "@/features/pipeline-v2/extras";
import { personNameFromDealTitle, sanitizeContactName } from "@/lib/display-name";
import {
  pathForPipelineView,
  writePipelineViewPreference,
} from "@/lib/pipeline-view-preference";
import {
  SEARCH_DEBOUNCE_MS,
  normalizeSearchQuery,
} from "@/lib/search-query";
import { PipelineSearchFilterBar } from "@/components/pipeline/kanban-filters/v2/search-filter-bar";
import { PipelinePeriodCalendar } from "@/components/pipeline/kanban-filters/pipeline-period-calendar";
import { FilterChips } from "@/components/pipeline/kanban-filters/filter-chips";
import { fetchFilterOptions } from "@/components/pipeline/kanban-filters/api";
import { useKanbanFilters } from "@/components/pipeline/kanban-filters/use-kanban-filters";
import { usePipelineSearchSort } from "@/components/pipeline/kanban-filters/use-pipeline-search-sort";
import {
  isEmptyFilters,
  hasServerSideFilters,
  type AdvancedDealFilters,
} from "@/components/pipeline/kanban-filters/types";

/** Restante no servidor: flag `hasMore` OU `totalCount > deals.length`. */
function stageHasMoreServer(s: {
  hasMore?: boolean;
  totalCount?: number;
  deals: { length: number };
}): boolean {
  if (s.hasMore === true) return true;
  return typeof s.totalCount === "number" && s.deals.length < s.totalCount;
}

const SALESHUB_QUEUE_SORT_LS = "saleshub-queue-sort:v1";

const AVATAR_SLUGS = [
  "blue",
  "violet",
  "indigo",
  "sky",
  "cyan",
  "emerald",
  "green",
  "lime",
  "amber",
  "orange",
  "rose",
  "pink",
  "coral",
  "teal",
  "mint",
  "gray",
] as const;

function avatarColorSlugFromName(name: string | null | undefined): string {
  const safe = (name ?? "").trim();
  if (!safe) return "gray";
  let sum = 0;
  for (let i = 0; i < safe.length; i += 1) sum += safe.charCodeAt(i);
  return AVATAR_SLUGS[sum % AVATAR_SLUGS.length];
}

function readQueueSort(): DealQueueSortMode {
  if (typeof window === "undefined") return "message_new";
  try {
    const raw = localStorage.getItem(SALESHUB_QUEUE_SORT_LS);
    if (
      raw === "message_new" ||
      raw === "message_old" ||
      raw === "created_new" ||
      raw === "created_old"
    ) {
      return raw;
    }
  } catch {
    /* noop */
  }
  return "message_new";
}

export type SalesHubHostProps = {
  /**
   * Quando true, mostra o rótulo "Sales Hub" na faixa secundária
   * (rota standalone `/saleshub`). No tab Flow do Pipeline fica oculto.
   */
  showPipelineName?: boolean;
};

/**
 * Host compartilhado do Sales Hub — usado em `/saleshub` e `/pipeline/flow`.
 * Preserva deep-link `?deal=` via `useDealDeepLink`.
 * Busca + filtros avançados espelham o kanban (`PipelineSearchFilterBar`).
 */
export function SalesHubHost({ showPipelineName = false }: SalesHubHostProps = {}) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";

  useEffect(() => {
    writePipelineViewPreference("flow");
  }, []);

  const { search, setSearch, sortKey, setSortKey } = usePipelineSearchSort();
  const [sortMode, setSortMode] = useState<DealQueueSortMode>(readQueueSort);
  const { filters, setFilters, patch: patchFilters, clear: clearFilters } =
    useKanbanFilters();
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

  const { activeDealId, setActiveDeal, normalizeDealId, syncDealNumber } =
    useDealDeepLink();

  const pipelinesQuery = usePipelines(isAuthenticated);
  const pipelines = pipelinesQuery.data;
  const { pipelineId, setPipelineId } = usePipelineUrlSync(pipelines);

  useEffect(() => {
    try {
      localStorage.setItem(SALESHUB_QUEUE_SORT_LS, sortMode);
    } catch {
      /* noop */
    }
  }, [sortMode]);

  // Flow inclui abas Ganho/Perdido — precisa de ALL, senão WON/LOST
  // nunca entram no board e as contagens ficam em 0.
  const status = "ALL" as const;

  const boardSort = useMemo<BoardSortParam | undefined>(() => {
    if (sortKey === "created_newest")
      return { field: "createdAt", direction: "desc" };
    if (sortKey === "created_oldest")
      return { field: "createdAt", direction: "asc" };
    if (sortKey === "interaction_newest")
      return { field: "lastInteraction", direction: "desc" };
    if (sortKey === "interaction_oldest")
      return { field: "lastInteraction", direction: "asc" };
    return undefined;
  }, [sortKey]);

  const rawSearch = (filters.search ?? search).trim();
  const [debouncedSearch, setDebouncedSearch] = useState(rawSearch);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(rawSearch), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [rawSearch]);

  // Critérios avançados (chips/modal) entram no POST com debounce curto —
  // evita fan-out de POSTs caros (~status=ALL) ao clicar vários chips.
  // Busca já tem debounce próprio acima; aqui só o restante.
  const advancedForQuery = useMemo(() => {
    const { search: _s, ...rest } = filters;
    return rest;
  }, [filters]);
  const advancedKey = JSON.stringify(advancedForQuery);
  const [debouncedAdvanced, setDebouncedAdvanced] = useState(advancedForQuery);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setDebouncedAdvanced(JSON.parse(advancedKey) as AdvancedDealFilters);
      } catch {
        setDebouncedAdvanced({});
      }
    }, 200);
    return () => clearTimeout(t);
  }, [advancedKey]);

  const queryFilters = useMemo(() => {
    const f: AdvancedDealFilters = { ...debouncedAdvanced };
    const q = normalizeSearchQuery(debouncedSearch);
    if (q) f.search = q;
    return f;
  }, [debouncedAdvanced, debouncedSearch]);

  const hasServerBoard = hasServerSideFilters(queryFilters);
  // Filtros já aplicados na UI mas ainda no debounce → board normal fica
  // visível (sem flash vazio) até o POST disparar.
  const filtersPendingDebounce =
    advancedKey !== JSON.stringify(debouncedAdvanced);

  // "Carregar mais" da fila: stageId → extras cumulativos além da página
  // inicial (10). A fila do Flow é FLAT (mistura etapas), então cada
  // disparo expande TODAS as colunas com hasMore de uma vez — mesmo
  // padrão do kanban (`_v2-client`): com ≥1 offset o board passa a vir
  // do POST /board (única rota que aceita offset) na mesma queryKey.
  const [boardExtraByStage, setBoardExtraByStage] = useState<Record<string, number>>({});
  const [loadingMoreQueue, setLoadingMoreQueue] = useState(false);

  const boardFiltered = useBoardFiltered({
    pipelineId,
    status,
    filters: queryFilters,
    sort: boardSort,
    enabled: isAuthenticated && hasServerBoard,
  });
  const boardNormal = useBoard({
    pipelineId,
    status,
    sort: boardSort,
    // Mantém o GET até o POST filtrado resolver — senão LS de filtros
    // desliga o board normal no mount e a fila abre vazia ("Todos 0").
    enabled: isAuthenticated && (!hasServerBoard || !boardFiltered.data),
    perStage: BOARD_PAGE_SIZE,
    offsetByStage: boardExtraByStage,
  });

  usePipelineRealtime(isAuthenticated);

  const queryClient = useQueryClient();

  // Expansões "Carregar mais": cada disparo soma +10 nas etapas com
  // hasMore e refaz o board (POST com offsetByStage — o queryFn já
  // enxerga o estado novo no render que segue o setState).
  const extrasKey = JSON.stringify(boardExtraByStage);
  useEffect(() => {
    if (Object.keys(boardExtraByStage).length === 0) return;
    queryClient
      .refetchQueries({
        queryKey: boardKey(pipelineId ?? "pl-1", status, boardSort),
        exact: true,
      })
      .finally(() => setLoadingMoreQueue(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrasKey]);

  // Troca de funil/status/ordenação/filtro → expansões voltam a 10.
  useEffect(() => {
    setBoardExtraByStage({});
    setLoadingMoreQueue(false);
  }, [pipelineId, status, boardSort, hasServerBoard]);

  const handleQueueLoadMore = useCallback((stageId?: string | null) => {
    const stages = boardNormal.data ?? [];
    const targets = (
      stageId ? stages.filter((s) => s.id === stageId) : stages
    ).filter(stageHasMoreServer);
    if (targets.length === 0) return;
    setLoadingMoreQueue(true);
    setBoardExtraByStage((prev) => {
      const next = { ...prev };
      for (const s of targets) {
        next[s.id] = (next[s.id] ?? 0) + BOARD_PAGE_SIZE;
      }
      return next;
    });
  }, [boardNormal.data]);

  // Com filtros server-side o boardFiltered segue perStage 200 — sem
  // load-more de rede (espelha o kanban, que esconde o botão).
  // Não depende só de `hasMore === true`: badge usa totalCount e o
  // flag às vezes falta no cache — restante = total − loaded.
  const queueHasMore =
    !hasServerBoard && (boardNormal.data ?? []).some(stageHasMoreServer);

  const boardHasSnapshot =
    Array.isArray(boardNormal.data) || Array.isArray(boardFiltered.data);
  const boardFetching =
    boardNormal.isFetching ||
    boardNormal.isLoading ||
    boardFiltered.isFetching ||
    boardFiltered.isLoading;
  const boardError =
    !boardHasSnapshot &&
    !boardFetching &&
    (hasServerBoard ? boardFiltered.isError : boardNormal.isError);

  // Query recém-enabled fica 1 tick em pending+idle (`refetchOnMount: false`).
  // Sem o hold, esse tick renderiza a UI real com board vazio ("Nenhum deal").
  // 50ms é teto rígido: se o fetch nunca disparar, solta — nunca vira gate
  // eterno (era o que `!isFetched` fazia no host antigo).
  const [idleHold, setIdleHold] = useState(true);
  useEffect(() => {
    if (!pipelineId) {
      setIdleHold(true);
      return;
    }
    if (boardHasSnapshot || boardError || boardFetching) {
      setIdleHold(false);
      return;
    }
    const t = window.setTimeout(() => setIdleHold(false), 50);
    return () => window.clearTimeout(t);
  }, [pipelineId, boardHasSnapshot, boardError, boardFetching]);

  const normalIdleUnfetched =
    !boardNormal.data &&
    boardNormal.fetchStatus === "idle" &&
    !boardNormal.isFetched &&
    !boardNormal.isError;
  const filteredIdleUnfetched =
    !boardFiltered.data &&
    boardFiltered.fetchStatus === "idle" &&
    !boardFiltered.isFetched &&
    !boardFiltered.isError;

  useLayoutEffect(() => {
    if (!pipelineId || !isAuthenticated) return;
    if (normalIdleUnfetched) void boardNormal.refetch();
    if (hasServerBoard && filteredIdleUnfetched) void boardFiltered.refetch();
    // refetch() é estável o bastante; objetos do useQuery mudam todo render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pipelineId,
    isAuthenticated,
    hasServerBoard,
    normalIdleUnfetched,
    filteredIdleUnfetched,
  ]);

  const boardPending =
    !!pipelineId &&
    !boardHasSnapshot &&
    !boardError &&
    (boardFetching || idleHold);

  const boardRefreshing =
    filtersPendingDebounce ||
    (hasServerBoard && (boardFiltered.isFetching || boardFiltered.isPending));

  // Enquanto o POST não resolve: NÃO zerar a fila (`?? []`). placeholderData
  // do hook cobre filtro→filtro; normal→filtrado cai no GET em cache.
  const boardRaw = hasServerBoard
    ? (boardFiltered.data ?? boardNormal.data ?? [])
    : (boardNormal.data ?? []);

  // Faixa de valor é cliente-only (igual kanban).
  const board = useMemo(() => {
    const vMin =
      filters.valueFrom != null ? Number(filters.valueFrom) : null;
    const vMax = filters.valueTo != null ? Number(filters.valueTo) : null;
    const hasValue = vMin !== null || vMax !== null;
    if (!hasValue) return boardRaw;
    return boardRaw.map((stage) => {
      const deals = stage.deals.filter((d) => {
        const val = Number(d.value) || 0;
        if (vMin !== null && val < vMin) return false;
        if (vMax !== null && val > vMax) return false;
        return true;
      });
      return { ...stage, deals, totalCount: deals.length };
    });
  }, [boardRaw, filters.valueFrom, filters.valueTo]);

  const stages = board as BoardStage[];

  const dealById = useMemo(() => {
    const map = new Map<string, (typeof board)[number]["deals"][number]>();
    for (const s of board) {
      for (const d of s.deals) {
        map.set(d.id, d);
        if (d.number != null) map.set(String(d.number), d);
      }
    }
    return map;
  }, [board]);

  // Resolve ?deal=<número> pelo board sem esperar GET /deals/:id.
  useEffect(() => {
    if (!activeDealId || !/^\d+$/.test(activeDealId)) return;
    const hit = dealById.get(activeDealId);
    if (hit) {
      normalizeDealId(hit.id);
      syncDealNumber(hit.number);
    }
  }, [activeDealId, dealById, normalizeDealId, syncDealNumber]);

  const { data: dealDetail } = useDealDetail(activeDealId);

  useEffect(() => {
    normalizeDealId(dealDetail?.id);
    syncDealNumber((dealDetail as { number?: number } | undefined)?.number);
  }, [dealDetail, normalizeDealId, syncDealNumber]);

  // Rede de segurança: o shell do Flow depende de `pipelineId`, que só sai
  // de null com a lista de funis. Query travada (idle que nunca dispara,
  // resposta que nunca chega) não tem `isError` — sem o timeout a tela
  // girava para sempre.
  const pipelinesEmpty = Array.isArray(pipelines) && pipelines.length === 0;
  const pipelinesStuck = useStuckTimeout(
    isAuthenticated && !pipelineId && !pipelinesQuery.isError && !pipelinesEmpty,
  );
  const pipelinesFailed =
    !pipelineId && (pipelinesQuery.isError || pipelinesEmpty || pipelinesStuck);

  const boardDealSeed = useMemo(() => {
    if (!activeDealId) return null;
    return dealById.get(activeDealId) ?? null;
  }, [activeDealId, dealById]);

  /** Prefer CUID (board seed / detail) over `?deal=<número>` cru. */
  const resolvedDealId =
    dealDetail?.id ?? boardDealSeed?.id ?? activeDealId;

  // Mesma fonte do kanban (`_v2-client`): contact panel + dealPanelFields.
  const dealContactId =
    dealDetail?.contact?.id ?? boardDealSeed?.contact?.id ?? null;
  const { data: dealContact } = useContactSidebar(dealContactId);

  const customFieldsSlot = useMemo(() => {
    const contactFields = dealContact?.inboxLeadPanelFields ?? [];
    const dealPanelFields = dealDetail?.dealPanelFields ?? [];
    const seen = new Set<string>();
    type CFEntry = {
      fieldId: string;
      label?: string;
      name?: string;
      value: string | null;
      type: string;
      options?: string[];
      highlightRules?: unknown[] | null;
      highlight?: { severity: string; label: string } | null;
      _et: "contact" | "deal";
      _eid: string;
    };
    const tagged: CFEntry[] = [
      ...contactFields.map((f) => ({
        ...f,
        _et: "contact" as const,
        _eid: dealContactId ?? "",
      })),
      ...dealPanelFields.map((f) => ({
        ...f,
        _et: "deal" as const,
        _eid: resolvedDealId ?? "",
      })),
    ];
    return tagged
      .filter((f) => {
        if (seen.has(f.fieldId)) return false;
        seen.add(f.fieldId);
        return true;
      })
      .map((f) => ({
        fieldId: f.fieldId,
        label: f.label || f.name || f.fieldId,
        value: f.value,
        type: f.type,
        options: f.options ?? [],
        entityType: f._et,
        entityId: f._eid,
        highlightRules: f.highlightRules ?? null,
        highlight: f.highlight ?? null,
      }));
  }, [dealContact, dealDetail?.dealPanelFields, dealContactId, resolvedDealId]);

  const activeDealStageName = useMemo(() => {
    if (!resolvedDealId) return undefined;
    const onBoard = board.find((s) =>
      s.deals.some((d) => d.id === resolvedDealId),
    )?.name;
    if (onBoard) return onBoard;
    return (dealDetail as { stage?: { name?: string } } | undefined)?.stage?.name;
  }, [resolvedDealId, board, dealDetail]);

  const detailDeal: DealDetail | null = useMemo(() => {
    if (dealDetail) {
      const contactName =
        sanitizeContactName(dealDetail.contact?.name) ||
        personNameFromDealTitle(dealDetail.title) ||
        "Sem nome";
      const ownerName = dealDetail.owner?.name?.trim() || "Sem responsavel";
      return {
        id: dealDetail.id,
        number: (dealDetail as { number?: number }).number ?? null,
        contactId: dealDetail.contact?.id ?? null,
        contactNumber:
          (dealDetail.contact as { number?: number } | null)?.number ?? null,
        name: contactName,
        initials: avatarInitials(contactName),
        avatarColor: avatarColorSlugFromName(contactName),
        phone: dealDetail.contact?.phone ?? undefined,
        email: dealDetail.contact?.email ?? null,
        whatsappUsername:
          (dealDetail.contact as { whatsappUsername?: string | null } | null)
            ?.whatsappUsername ?? null,
        contactSource:
          (dealDetail.contact as { source?: string | null } | null)?.source ??
          null,
        value: dealDetail.value ?? null,
        online: undefined,
        stage: activeDealStageName,
        pipelineName:
          (dealDetail as { stage?: { pipeline?: { name?: string } } }).stage
            ?.pipeline?.name ?? null,
        owner: {
          initials: avatarInitials(ownerName),
          name: ownerName,
          avatarColor: avatarColorSlugFromName(ownerName),
        },
        status:
          (dealDetail as { status?: "OPEN" | "WON" | "LOST" }).status ?? null,
        lostReason:
          (dealDetail as { lostReason?: string | null }).lostReason ?? null,
      };
    }

    if (!boardDealSeed) return null;
    const contactName =
      sanitizeContactName(boardDealSeed.contact?.name) ||
      personNameFromDealTitle(boardDealSeed.title) ||
      "Sem nome";
    const ownerName = boardDealSeed.owner?.name?.trim() || "Sem responsavel";
    return {
      id: boardDealSeed.id,
      number: boardDealSeed.number ?? null,
      contactId: boardDealSeed.contact?.id ?? null,
      contactNumber: boardDealSeed.contact?.number ?? null,
      name: contactName,
      initials: avatarInitials(contactName),
      avatarColor: avatarColorSlugFromName(contactName),
      phone: boardDealSeed.contact?.phone ?? undefined,
      email: boardDealSeed.contact?.email ?? null,
      whatsappUsername: null,
      contactSource: null,
      value: boardDealSeed.value ?? null,
      online: undefined,
      stage: activeDealStageName,
      pipelineName: pipelines?.find((p) => p.id === pipelineId)?.name ?? null,
      owner: {
        initials: avatarInitials(ownerName),
        name: ownerName,
        avatarColor: avatarColorSlugFromName(ownerName),
      },
      status:
        (boardDealSeed.status as "OPEN" | "WON" | "LOST" | undefined) ?? null,
      lostReason: boardDealSeed.lostReason ?? null,
    };
  }, [
    dealDetail,
    boardDealSeed,
    activeDealStageName,
    pipelines,
    pipelineId,
  ]);

  // Sem sessão o middleware redireciona; renderizar o shell aqui prendia a
  // tela para sempre, porque `usePipelines` fica desligada e `pipelineId`
  // nunca sai de null (o `!isAuthenticated` abaixo era inalcançável).
  if (sessionStatus === "unauthenticated") {
    return null;
  }

  // Chrome sempre visível. Loader/erro só no body — query idle ou
  // `GET /pipelines` pendurado não cobre a página inteira.
  const pendingShell =
    (sessionStatus === "loading" || !pipelineId) && !pipelinesFailed;
  const hasActiveFilters = !isEmptyFilters(filters) || !!search.trim();

  return (
    <div
      className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4"
      style={{ gridTemplateRows: "1fr" }}
    >
      <NavRailSpacer />

      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
        <PipelineHeader
          tabsOverride={<></>}
          activeView="flow"
          onViewChange={(view) => {
            writePipelineViewPreference(view);
            if (view === "flow") return;
            router.push(pathForPipelineView(view));
          }}
          titleAccessory={
            <PipelineSwitcher
              variant="icon"
              selectedId={pipelineId}
              onChange={(id) => {
                setPipelineId(id);
                setActiveDeal(null);
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
              placeholder="Buscar no funil…"
              pipelineId={pipelineId}
              onFilterPanelOpenChange={setFilterPanelOpen}
              onPickDeal={(deal) => {
                const dest = deal.stage?.pipelineId;
                if (dest && dest !== pipelineId) setPipelineId(dest);
                setActiveDeal(deal.id, deal.number);
              }}
            />
          }
          period={<PipelinePeriodCalendar filters={filters} onPatch={patchFilters} />}
          pipelineNameSlot={
            showPipelineName ? (
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                Sales Hub
              </span>
            ) : undefined
          }
          menuSlot={
            <PageActionsMenu
              aria-label="Ações do pipeline"
              items={[
                {
                  icon: <IconSettings size={13} />,
                  label: "Configurar pipeline",
                  onClick: () => router.push("/settings/pipeline"),
                },
              ]}
            />
          }
        />

        {pipelinesFailed ? (
          <AppLoading
            variant="inline"
            className="min-h-0 flex-1"
            error={
              pipelinesEmpty
                ? "Nenhum funil configurado nesta organização."
                : "Não foi possível carregar os funis."
            }
            onRetry={() => void pipelinesQuery.refetch()}
          />
        ) : pendingShell || !pipelineId ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : (
          <>
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 px-0.5">
            <span className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--brand-primary)]">
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

        {/* Sem wrapper glass opaco — board do Flow senta no mesh lavanda
            como o kanban (colunas `glass-bg` contrastam com cards). */}
        <div
          className={`relative min-h-0 flex-1 overflow-hidden transition-opacity duration-200 ${
            boardRefreshing ? "opacity-70" : "opacity-100"
          }`}
          aria-busy={boardRefreshing || undefined}
        >
          {boardRefreshing && (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-[var(--color-primary-soft)]"
              aria-hidden
            >
              <div className="h-full w-1/3 animate-pulse bg-[var(--brand-primary)]" />
            </div>
          )}
          <SalesHubView
            key={pipelineId}
            pipelineId={pipelineId}
            stages={stages}
            statusFilter={status}
            searchQuery={hasServerBoard ? "" : search}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            queueHasMore={queueHasMore}
            queueLoadingMore={loadingMoreQueue}
            onQueueLoadMore={handleQueueLoadMore}
            queueBoardPending={boardPending}
            activeDealId={resolvedDealId}
            onActiveDealChange={setActiveDeal}
            detailDeal={detailDeal}
            customFieldsSlot={customFieldsSlot}
            contactFieldConfigSlot={
              <RequirePermission permission="settings:custom_fields">
                <FieldConfigPanel entities={["contact"]} context="deal_panel_v2" />
              </RequirePermission>
            }
            dealFieldConfigSlot={
              <RequirePermission permission="settings:custom_fields">
                <FieldConfigPanel entities={["deal"]} context="deal_panel_v2" />
              </RequirePermission>
            }
            onOpenFullDeal={(dealId) => {
              const d = dealById.get(dealId);
              if (d?.number != null) {
                router.push(
                  `/pipeline?deal=${encodeURIComponent(String(d.number))}`,
                );
                return;
              }
              router.push("/pipeline");
            }}
          />
        </div>
          </>
        )}
      </main>
    </div>
  );
}
