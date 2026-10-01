"use client";

import { useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import {
  cancelContactAutomation,
  fetchTabCounts,
  getConversation,
  getActiveAutomations,
  getContactActiveAutomations,
  getContactAutomationHistory,
  listConversations,
  type ActiveAutomationDto,
  type AutomationHistoryDto,
  type ConversationListResponse,
  type ConversationListRow,
  type InboxFilters,
  type InboxTab,
  type TabCounts,
} from "../api";

import { isPreviewMode } from "@/lib/preview-mode";
import {
  INBOX_QUEUE_SECTION_ORDER,
} from "../inbox-queue-tab";
import {
  collapseInboxCardRows,
  inboxCardGroupKey,
  sameInboxCardGroup,
} from "../inbox-card-group";
import { messageActivityTimestamp } from "@/lib/message-activity-sort";
import { isInboxConversationNumberParam } from "./use-inbox-url-sync";

/**
 * Page size pedido por request. O backend tem cap em 200 (ver
 * `_backend/src/services/conversations.ts`). 50 preenche a coluna
 * (mesmo lote do first-paint Kommo); lote de 10 deixava o sentinela
 * sempre visível e disparava página atrás de página.
 */
const PAGE_SIZE = 50;

export const INBOX_CONVERSATIONS_QUERY_PREFIX = "inbox-conversations";

/** Campos da URL que o Inbox filtra no client — fora da queryKey da lista. */
export function inboxListServerFilters(filters: InboxFilters): InboxFilters {
  const {
    lastMessageDirection: _direction,
    lastMessageFrom: _from,
    lastMessageTo: _to,
    createdFrom: _createdFrom,
    createdTo: _createdTo,
    ...serverFilters
  } = filters;
  return serverFilters;
}

function tabCountsFilterKey(filters: InboxFilters) {
  return {
    ownerIds: filters.ownerIds ?? (filters.ownerId ? [filters.ownerId] : []),
    withoutOwner: filters.withoutOwner ?? false,
    channel: filters.channel ?? null,
    channelIds: filters.channelIds ?? [],
    stageIds: filters.stageIds ?? (filters.stageId ? [filters.stageId] : []),
    tagIds: filters.tagIds ?? [],
    sources: filters.sources ?? [],
    sessionExpiresWithinHours: filters.sessionExpiresWithinHours ?? null,
    windowState: filters.windowState ?? null,
  };
}

/**
 * Filas específicas para fetch paralelo. `todos`/`abertas` e aba única
 * continuam no GET com `tab=` único (ou join legado).
 */
function tabsForParallelFetch(
  tab: InboxTab | readonly InboxTab[],
): InboxTab[] | null {
  const tabs = (typeof tab === "string" ? [tab] : [...tab]).filter(Boolean);
  if (tabs.length <= 1) return null;
  if (tabs.some((t) => t === "todos" || t === "abertas")) return null;
  return tabs;
}

function activityTs(r: ConversationListRow) {
  return new Date(r.lastMessageAt ?? r.lastInboundAt ?? r.updatedAt ?? 0).getTime();
}

/** Próximo pedido de UMA fila: cursor do backend ou, sem ele, nº da página. */
export type InboxTabNext = { cursor: string } | { page: number };

/**
 * Posição de cada fila na lista multi-seção. `next: null` = fila esgotada
 * (não é mais consultada). `total` fica guardado para o total da lista não
 * cair quando uma fila esgotada deixa de ser pedida.
 */
export type InboxTabsCursor = Record<
  string,
  { next: InboxTabNext | null; total: number }
>;

/** `pageParam` da lista: nº da página (1ª/legado), cursor, ou cursores por fila. */
export type InboxPageParam =
  | number
  | string
  | { cursor: string; perPage: number }
  | { tabs: InboxTabsCursor; page: number };

/**
 * Página cheia de tickets (≥ `LOW_YIELD_MIN_ITEMS`) que rendeu menos linhas
 * novas que `LOW_YIELD_MIN_NEW_ROWS` (tickets do mesmo contato colapsam num
 * card) faz a seguinte vir maior: `LOW_YIELD_PAGE_SIZE`.
 */
const LOW_YIELD_MIN_ITEMS = 25;
const LOW_YIELD_MIN_NEW_ROWS = 10;
/** Teto do backend (`perPage` ≤ 200). */
const LOW_YIELD_PAGE_SIZE = 200;

/** Quantos cards (grupo contato+canal) a última página acrescentou à lista. */
function newGroupsInLastPage(pages: readonly InboxListPage[]): number {
  const last = pages[pages.length - 1];
  if (!last) return 0;
  const before = new Set<string>();
  for (const page of pages.slice(0, -1)) {
    for (const row of page?.items ?? []) if (row?.id) before.add(inboxCardGroupKey(row));
  }
  const fresh = new Set<string>();
  for (const row of last.items ?? []) {
    if (!row?.id) continue;
    const key = inboxCardGroupKey(row);
    if (!before.has(key)) fresh.add(key);
  }
  return fresh.size;
}

/**
 * Próximo `pageParam` com página maior quando a última quase não rendeu.
 * O topo de "Todas as conversas" pode ter centenas de tickets do mesmo
 * contato: com 50 por vez eram dezenas de GET para aparecer um card novo.
 * Só sem filas em paralelo (cada fila já anda pelo próprio cursor).
 */
export function nextInboxPageParamAdaptive(
  pages: readonly InboxListPage[],
  parallel: boolean,
): InboxPageParam | undefined {
  const last = pages[pages.length - 1];
  if (!last) return undefined;
  const next = nextInboxPageParam(last, parallel);
  if (parallel || typeof next !== "string") return next;
  if ((last.items?.length ?? 0) < LOW_YIELD_MIN_ITEMS) return next;
  if (newGroupsInLastPage(pages) >= LOW_YIELD_MIN_NEW_ROWS) return next;
  return { cursor: next, perPage: LOW_YIELD_PAGE_SIZE };
}

/** Página agregada das filas em paralelo carrega os cursores de cada fila. */
export type InboxListPage = ConversationListResponse & {
  tabsCursor?: InboxTabsCursor;
  /** Alguma resposta da página veio do backend com cursor (campo `nextCursor`). */
  cursorMode?: boolean;
  /** `Date.now()` de quando a página chegou (ordem estável, ver `useConversations`). */
  receivedAt?: number;
};

/**
 * Backend com cursor: `total` e `page` da resposta não são do filtro (o DEV
 * devolve `perPage + 1` e `1` em toda página). Só o backend antigo, sem
 * `nextCursor`, manda um total confiável.
 */
function pageIsCursorMode(page: InboxListPage | undefined): boolean {
  if (!page) return false;
  return page.cursorMode === true || ("nextCursor" in page && !page.tabsCursor);
}

function pageHasMore(res: ConversationListResponse): boolean {
  if (res.hasMore === true) return true;
  if (res.hasMore === false) return false;
  return (res.items?.length ?? 0) >= (res.perPage ?? PAGE_SIZE);
}

/**
 * Uma página por fila em paralelo, tag `queueTab`, claim exclusivo
 * (ligar → entrada → …) para a lista multi-seção não misturar buckets.
 *
 * Cada fila avança pelo PRÓPRIO `nextCursor` (keyset); fila esgotada não é
 * mais consultada. Backend sem `nextCursor` → `page` para aquela fila.
 */
async function listConversationsTaggedByTab(args: {
  tabs: readonly InboxTab[];
  filters: InboxFilters;
  search: string;
  page: number;
  /** Ausente na 1ª página. */
  cursors?: InboxTabsCursor;
}): Promise<InboxListPage> {
  const fetched = await Promise.all(
    args.tabs.map(async (tab) => {
      const state = args.cursors?.[tab];
      // Fila esgotada numa página anterior.
      if (state && state.next === null) {
        return { tab, res: null, requestedPage: null };
      }
      const next = state?.next ?? { page: args.cursors ? args.page : 1 };
      const res = await listConversations({
        tab,
        ...args.filters,
        search: args.search,
        perPage: PAGE_SIZE,
        ...("cursor" in next ? { cursor: next.cursor } : { page: next.page }),
      });
      return { tab, res, requestedPage: "page" in next ? next.page : null };
    }),
  );
  const pages = fetched.filter(
    (p): p is typeof p & { res: ConversationListResponse } => p.res !== null,
  );

  const claimOrder = [
    ...INBOX_QUEUE_SECTION_ORDER.filter((t) => args.tabs.includes(t)),
    ...args.tabs.filter((t) => !INBOX_QUEUE_SECTION_ORDER.includes(t)),
  ];

  const claimed = new Map<string, ConversationListRow>();
  const claimedRows: ConversationListRow[] = [];
  for (const tab of claimOrder) {
    const pack = pages.find((p) => p.tab === tab);
    if (!pack) continue;
    for (const row of pack.res.items ?? []) {
      if (!row?.id) continue;
      if (claimed.has(row.id)) continue;
      if (claimedRows.some((c) => sameInboxCardGroup(c, row))) continue;
      const next = { ...row, queueTab: tab };
      claimed.set(row.id, next);
      claimedRows.push(next);
    }
  }

  const items = claimedRows.sort((a, b) => activityTs(b) - activityTs(a));

  const tabsCursor: InboxTabsCursor = {};
  for (const p of fetched) {
    const prev = args.cursors?.[p.tab];
    if (!p.res) {
      tabsCursor[p.tab] = { next: null, total: prev?.total ?? 0 };
      continue;
    }
    const total = p.res.total ?? prev?.total ?? 0;
    if (!pageHasMore(p.res)) {
      tabsCursor[p.tab] = { next: null, total };
    } else if (p.res.nextCursor) {
      tabsCursor[p.tab] = { next: { cursor: p.res.nextCursor }, total };
    } else {
      // Backend antigo (sem nextCursor): continua por página.
      const current = p.requestedPage ?? p.res.page ?? args.page;
      tabsCursor[p.tab] = { next: { page: current + 1 }, total };
    }
  }
  const hasMore = Object.values(tabsCursor).some((t) => t.next !== null);
  const total = Object.values(tabsCursor).reduce((sum, t) => sum + t.total, 0);

  return {
    items,
    total,
    page: args.page,
    perPage: PAGE_SIZE,
    hasMore,
    nextCursor: null,
    tabsCursor,
    cursorMode: pages.some((p) => "nextCursor" in p.res),
  };
}

/**
 * Próximo `pageParam` da lista, ou `undefined` quando acabou.
 *
 * Com cursor, quem manda é o servidor (`hasMore`/`nextCursor`): os eventos
 * SSE tiram e põem cards nas páginas em cache, então "a última página veio
 * com menos itens que `perPage`" NÃO significa fim da lista — só vale como
 * heurística no modo antigo (backend sem `nextCursor`).
 */
export function nextInboxPageParam(
  last: InboxListPage,
  parallel: boolean,
): InboxPageParam | undefined {
  if (parallel) {
    if (last.tabsCursor) {
      const pending = Object.values(last.tabsCursor).some((t) => t.next !== null);
      return pending
        ? { tabs: last.tabsCursor, page: (last.page ?? 1) + 1 }
        : undefined;
    }
    const itemCount = last.items?.length ?? 0;
    if (last.hasMore === false) return undefined;
    if (last.hasMore === true) return (last.page ?? 1) + 1;
    if (itemCount === 0) return undefined;
    return (last.page ?? 1) + 1;
  }
  if (last.hasMore === false) return undefined;
  if (last.nextCursor) return last.nextCursor;
  // Fallback OFFSET (backend velho sem nextCursor).
  if (last.hasMore === true) return (last.page ?? 1) + 1;
  const perPage = last.perPage ?? PAGE_SIZE;
  const itemCount = last.items?.length ?? 0;
  if (itemCount < perPage) return undefined;
  const page = last.page ?? 1;
  const total = last.total ?? 0;
  const loaded = page * perPage;
  if (total > perPage + 1) return loaded < total ? page + 1 : undefined;
  return page + 1;
}

export function fetchInboxConversationsPage(args: {
  tab: InboxTab | readonly InboxTab[];
  filters: InboxFilters;
  search: string;
  pageParam: unknown;
}): Promise<InboxListPage> {
  const parallelTabs = tabsForParallelFetch(args.tab);
  if (parallelTabs) {
    const param = args.pageParam;
    const tabsParam =
      param && typeof param === "object" && "tabs" in param
        ? (param as { tabs: InboxTabsCursor; page: number })
        : null;
    const page = tabsParam
      ? tabsParam.page
      : typeof param === "number"
        ? param
        : typeof param === "string" && /^\d+$/.test(param)
          ? Number(param)
          : 1;
    return listConversationsTaggedByTab({
      tabs: parallelTabs,
      filters: args.filters,
      search: args.search,
      page,
      // `page` numérico > 1 sem cursores = cache de antes desta versão:
      // todas as filas por página, como era.
      cursors:
        tabsParam?.tabs ??
        (page > 1
          ? Object.fromEntries(
              parallelTabs.map((t) => [t, { next: { page }, total: 0 }]),
            )
          : undefined),
    });
  }
  const base = {
    tab: args.tab,
    ...args.filters,
    search: args.search,
    perPage: PAGE_SIZE,
  };
  if (typeof args.pageParam === "string" && args.pageParam.length > 0) {
    return listConversations({ ...base, cursor: args.pageParam });
  }
  const param = args.pageParam;
  if (param && typeof param === "object" && "cursor" in param) {
    const { cursor, perPage } = param as { cursor: string; perPage: number };
    return listConversations({ ...base, perPage, cursor });
  }
  return listConversations({
    ...base,
    page: typeof args.pageParam === "number" ? args.pageParam : 1,
  });
}

const NO_TIERS: ReadonlyMap<string, number> = new Map();

/**
 * Faixa de cada card na lista: o índice da página em que o grupo
 * contato+canal apareceu primeiro.
 *
 * O servidor pagina por `updatedAt`; a tela ordena pela última mensagem.
 * Sem as faixas, cards de uma página nova caíam ACIMA do fim da lista —
 * fora da vista de quem rolou até o fim, empurrando a lista por cima e
 * segurando a sentinela visível (scroll anchoring) → rajada de páginas.
 * Com as faixas, cada página entra depois das anteriores e o que já estava
 * na tela não se mexe.
 *
 * Card com mensagem DEPOIS de a página dele chegar (evento SSE) volta à
 * faixa 0: mensagem nova continua subindo o card para o topo.
 */
export function inboxListTiers(
  pages: readonly InboxListPage[],
  items: readonly ConversationListRow[],
): ReadonlyMap<string, number> {
  const byGroup = new Map<string, number>();
  pages.forEach((page, index) => {
    for (const row of page?.items ?? []) {
      if (!row?.id) continue;
      const fresh =
        page.receivedAt != null &&
        messageActivityTimestamp(row.lastMessageAt, row.lastInboundAt) > page.receivedAt;
      const tier = fresh ? 0 : index;
      const key = inboxCardGroupKey(row);
      const prev = byGroup.get(key);
      byGroup.set(key, prev == null ? tier : Math.min(prev, tier));
    }
  });
  const tiers = new Map<string, number>();
  for (const row of items) tiers.set(row.id, byGroup.get(inboxCardGroupKey(row)) ?? 0);
  return tiers;
}

/** Aquece a lista + badges da visão atual (shell autenticado → /inbox). */
export function prefetchInboxWarmCache(
  queryClient: QueryClient,
  tab: InboxTab | readonly InboxTab[],
  filters: InboxFilters,
  search = "",
) {
  const tabKey = typeof tab === "string" ? tab : tab.join(",");
  if (!tabKey) return Promise.resolve();
  return Promise.all([
    queryClient.prefetchInfiniteQuery({
      queryKey: [INBOX_CONVERSATIONS_QUERY_PREFIX, tabKey, filters, search],
      queryFn: ({ pageParam }) =>
        fetchInboxConversationsPage({ tab, filters, search, pageParam }),
      initialPageParam: 1 as InboxPageParam,
      staleTime: 60_000,
    }),
    queryClient.prefetchQuery({
      queryKey: ["conversations", "tab-counts", tabCountsFilterKey(filters), null],
      queryFn: () => fetchTabCounts(filters, null),
      staleTime: 60_000,
    }),
  ]);
}

/**
 * Lista paginada (infinite) de conversas da aba ativa.
 * QueryKey mantém o prefixo `inbox-conversations` da Fase 1 para
 * preservar a invalidação cruzada feita pelos componentes do CRM.
 *
 * Retorna shape compatível com o consumo anterior (`data?.items`)
 * agregando todas as páginas já carregadas, e expõe controles
 * de paginação (`fetchNextPage`/`hasNextPage`/`isFetchingNextPage`)
 * para o trigger de scroll infinito da coluna.
 */
export function useConversations(params: {
  tab: InboxTab | readonly InboxTab[];
  filters: InboxFilters;
  search: string;
  enabled?: boolean;
}) {
  const tabKey = typeof params.tab === "string" ? params.tab : params.tab.join(",");
  const parallelTabs = tabsForParallelFetch(params.tab);
  const query = useInfiniteQuery<InboxListPage>({
    queryKey: [INBOX_CONVERSATIONS_QUERY_PREFIX, tabKey, params.filters, params.search],
    queryFn: async ({ pageParam }) => ({
      ...(await fetchInboxConversationsPage({
        tab: params.tab,
        filters: params.filters,
        search: params.search,
        pageParam,
      })),
      receivedAt: Date.now(),
    }),
    initialPageParam: 1 as InboxPageParam,
    // "Carregar mais" busca SÓ a página seguinte (keyset) e anexa; as
    // páginas já carregadas ficam como estão (o SSE as mantém em dia).
    getNextPageParam: (_last, pages) =>
      nextInboxPageParamAdaptive(pages, Boolean(parallelTabs)),
    enabled: isPreviewMode() ? true : (params.enabled ?? true),
    // SSE (`useInboxRealtime`) patcha o card em new_message /
    // conversation_updated. Sem timer: lista só no mount, troca de
    // aba/filtro, refresh explícito, hidratação `?ids=` ou reconnect.
    refetchInterval: false,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    // Troca de aba/filtro: mantém a lista anterior no lugar até a
    // primeira página nova chegar (sem isso o scroller vira skeleton
    // e o sentinela remonta → cascata de fetch).
    placeholderData: keepPreviousData,
  });

  // Agrega todas as páginas carregadas em um único `items[]` pra
  // manter o shape esperado pelos consumidores legados.
  const data = useMemo<ConversationListResponse | undefined>(() => {
    if (!query.data) return undefined;
    const pages = query.data.pages;
    // `p?.items ?? []` evita injetar `undefined` no array agregado quando uma
    // página vem sem `items` (resposta malformada ou page patchada pelo
    // realtime). O `.filter(Boolean)` blinda contra buracos em `items[]`.
    // Sem isso, `rows.map((r) => r.id)` quebra com "Cannot read 'id'".
    const flat = pages
      .flatMap((p) => p?.items ?? [])
      .filter(Boolean) as ConversationListRow[];
    // Colapsa por CONTATO+CANAL(+conta): no modelo de ticket, reabrir
    // uma conversa encerrada gera um NOVO id (ticket B), e o ticket A
    // (RESOLVED) continuava aparecendo como um segundo card do mesmo número.
    // Regra do operador: 1 card por número — o histórico dos tickets antigos
    // fica acessível na timeline contínua do chat (separadores de ticket),
    // não como cards separados. Também cobre dedupe por `id` entre páginas
    // e órfã SSE sem `channelId` vs ticket GET com conta preenchida.
    const items = collapseInboxCardRows(flat);
    const last = pages[pages.length - 1];
    const anyMore = pages.some((p) => p?.hasMore === true);
    const cursorMode = pages.some(pageIsCursorMode);
    return {
      items,
      // Modo cursor: o servidor não manda o total do filtro (vem perPage+1).
      // Quem precisa do total usa os contadores das filas (`?counts=1`).
      total: cursorMode ? undefined : last.total,
      page: cursorMode ? pages.length : last.page,
      perPage: last.perPage,
      // Com cursores por fila a última página já diz se alguma fila continua.
      hasMore:
        parallelTabs && !last.tabsCursor ? anyMore || last.hasMore : last.hasMore,
      nextCursor: last.nextCursor ?? null,
    };
  }, [query.data, parallelTabs]);

  const listTiers = useMemo(
    () => (query.data ? inboxListTiers(query.data.pages, data?.items ?? []) : NO_TIERS),
    [query.data, data],
  );

  return {
    data,
    /**
     * Página de origem de cada card (id → 0, 1, 2…): quem ordena a lista
     * põe cada página DEPOIS das anteriores. Ver `inboxListTiers`.
     */
    listTiers,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isFetched: query.isFetched,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    isPlaceholderData: query.isPlaceholderData,
  };
}

/**
 * Busca UMA conversa pelo `?c=` (número ou CUID legado). Só habilita quando a
 * conversa alvo NÃO está na lista carregada — assim o link abre a conversa
 * mesmo fora da aba/filtro/página atual do usuário. `retry:false` para que
 * um 404 (sem acesso / inexistente) propague rápido e o inbox trate o erro.
 */
export function useConversationById(conversationId: string | null) {
  return useQuery<ConversationListRow>({
    queryKey: ["inbox-conversation", conversationId],
    queryFn: () => getConversation(conversationId as string),
    enabled: Boolean(conversationId) && !isPreviewMode(),
    staleTime: 10_000,
    retry: false,
  });
}

export const activeAutomationsKey = (conversationId: string | null) =>
  ["active-automations", conversationId] as const;

/**
 * Automações vivas (RUNNING/PAUSED) do contato da conversa ativa — chip
 * "robô em execução" no header do chat. Invalidado em tempo real pelo
 * evento SSE `automation_state` (ver use-realtime.ts).
 */
export function useActiveAutomations(conversationId: string | null) {
  return useQuery<{ items: ActiveAutomationDto[] }, Error, ActiveAutomationDto[]>({
    queryKey: activeAutomationsKey(conversationId),
    queryFn: () => getActiveAutomations(conversationId as string),
    enabled:
      Boolean(conversationId) &&
      !isInboxConversationNumberParam(conversationId) &&
      !isPreviewMode(),
    staleTime: 15_000,
    select: (d) => d.items,
  });
}

/** QueryKey do botão "Robôs ativos" (por contato) — inbox e deal. */
export const contactActiveAutomationsKey = (contactId: string | null) =>
  ["active-automations-contact", contactId] as const;

/**
 * Automações vivas (RUNNING/PAUSED) do CONTATO — alimenta o botão
 * "Robôs ativos" ao lado da composer (inbox e deal). Invalidado em
 * tempo real pelo evento SSE `automation_state` (ver use-realtime.ts).
 */
export function useContactActiveAutomations(contactId: string | null) {
  return useQuery<{ items: ActiveAutomationDto[] }, Error, ActiveAutomationDto[]>({
    queryKey: contactActiveAutomationsKey(contactId),
    queryFn: () => getContactActiveAutomations(contactId as string),
    enabled: Boolean(contactId) && !isPreviewMode(),
    staleTime: 15_000,
    select: (d) => d.items,
  });
}

/** QueryKey do histórico de execuções (por contato). */
export const contactAutomationHistoryKey = (contactId: string | null) =>
  ["automation-history-contact", contactId] as const;

/** Histórico de execuções encerradas (COMPLETED/TIMED_OUT) do contato. */
export function useContactAutomationHistory(
  contactId: string | null,
  enabled = true,
) {
  return useQuery<{ items: AutomationHistoryDto[] }, Error, AutomationHistoryDto[]>({
    queryKey: contactAutomationHistoryKey(contactId),
    queryFn: () => getContactAutomationHistory(contactId as string),
    enabled: Boolean(contactId) && enabled && !isPreviewMode(),
    staleTime: 15_000,
    select: (d) => d.items,
  });
}

/** Interrompe manualmente uma automação e revalida a lista + histórico. */
export function useCancelAutomation(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (contextId: string) =>
      cancelContactAutomation(contactId as string, contextId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactActiveAutomationsKey(contactId) });
      qc.invalidateQueries({ queryKey: contactAutomationHistoryKey(contactId) });
    },
  });
}

/** Counts das abas (badges no header). Recebe filtros do funil + busca para
 *  que os badges casem com a lista (refetch via queryKey). */
export function useTabCounts(
  enabled = true,
  filters?: InboxFilters | null,
  search?: string | null,
) {
  const searchKey = search?.trim() || null;
  const filterKey = filters ? tabCountsFilterKey(filters) : null;
  return useQuery<TabCounts>({
    queryKey: ["conversations", "tab-counts", filterKey, searchKey],
    queryFn: () => fetchTabCounts(filters, searchKey),
    // Sem timer. Badges ±1 no SSE; GET `?counts=1` só em troca de
    // aba/filtro/busca, bulk, refresh explícito ou reconnect com gap.
    refetchInterval: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
    enabled: isPreviewMode() ? true : enabled,
  });
}
