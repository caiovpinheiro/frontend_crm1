"use client";

import { useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
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
  inboxQueueSectionPriority,
} from "../inbox-queue-tab";
import { isInboxConversationNumberParam } from "./use-inbox-url-sync";

/**
 * Page size pedido por request. O backend tem cap em 200 (ver
 * `_backend/src/services/conversations.ts`). 50 preenche a coluna
 * (mesmo lote do first-paint Kommo); lote de 10 deixava o sentinela
 * sempre visível e disparava página atrás de página.
 */
const PAGE_SIZE = 50;

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

function channelKey(c: ConversationListRow["channel"]) {
  return typeof c === "string" ? c : JSON.stringify(c ?? "");
}

function groupKey(r: ConversationListRow) {
  return r.contact?.id ? `c:${r.contact.id}::${channelKey(r.channel)}` : `id:${r.id}`;
}

/**
 * Uma página por fila em paralelo, tag `queueTab`, claim exclusivo
 * (ligar → entrada → …) para a lista multi-seção não misturar buckets.
 */
async function listConversationsTaggedByTab(args: {
  tabs: readonly InboxTab[];
  filters: InboxFilters;
  search: string;
  page: number;
}): Promise<ConversationListResponse> {
  const pages = await Promise.all(
    args.tabs.map(async (tab) => {
      const res = await listConversations({
        tab,
        ...args.filters,
        search: args.search,
        perPage: PAGE_SIZE,
        page: args.page,
      });
      return { tab, res };
    }),
  );

  const claimOrder = [
    ...INBOX_QUEUE_SECTION_ORDER.filter((t) => args.tabs.includes(t)),
    ...args.tabs.filter((t) => !INBOX_QUEUE_SECTION_ORDER.includes(t)),
  ];

  const claimed = new Map<string, ConversationListRow>();
  const claimedGroups = new Set<string>();
  for (const tab of claimOrder) {
    const pack = pages.find((p) => p.tab === tab);
    if (!pack) continue;
    for (const row of pack.res.items ?? []) {
      if (!row?.id) continue;
      const gk = groupKey(row);
      if (claimed.has(row.id) || claimedGroups.has(gk)) continue;
      claimed.set(row.id, { ...row, queueTab: tab });
      claimedGroups.add(gk);
    }
  }

  const items = [...claimed.values()].sort((a, b) => activityTs(b) - activityTs(a));
  const hasMore = pages.some((p) => {
    const perPage = p.res.perPage ?? PAGE_SIZE;
    const n = p.res.items?.length ?? 0;
    if (p.res.hasMore === true) return true;
    if (p.res.hasMore === false) return false;
    return n >= perPage;
  });
  const total = pages.reduce((sum, p) => sum + (p.res.total ?? 0), 0);

  return {
    items,
    total,
    page: args.page,
    perPage: PAGE_SIZE,
    hasMore,
    nextCursor: null,
  };
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
  const query = useInfiniteQuery<ConversationListResponse>({
    queryKey: ["inbox-conversations", tabKey, params.filters, params.search],
    queryFn: ({ pageParam }) => {
      if (parallelTabs) {
        const page =
          typeof pageParam === "number"
            ? pageParam
            : typeof pageParam === "string" && /^\d+$/.test(pageParam)
              ? Number(pageParam)
              : 1;
        return listConversationsTaggedByTab({
          tabs: parallelTabs,
          filters: params.filters,
          search: params.search,
          page,
        });
      }
      const base = {
        tab: params.tab,
        ...params.filters,
        search: params.search,
        perPage: PAGE_SIZE,
      };
      if (typeof pageParam === "string" && pageParam.length > 0) {
        return listConversations({ ...base, cursor: pageParam });
      }
      return listConversations({
        ...base,
        page: typeof pageParam === "number" ? pageParam : 1,
      });
    },
    initialPageParam: 1 as string | number,
    getNextPageParam: (last) => {
      const perPage = last.perPage ?? PAGE_SIZE;
      const itemCount = last.items?.length ?? 0;
      if (parallelTabs) {
        if (last.hasMore === false) return undefined;
        if (last.hasMore === true) return (last.page ?? 1) + 1;
        if (itemCount === 0) return undefined;
        return (last.page ?? 1) + 1;
      }
      if (itemCount < perPage) return undefined;
      if (last.hasMore === false) return undefined;
      if (last.nextCursor) return last.nextCursor;
      // Fallback OFFSET (backend velho sem nextCursor).
      if (last.hasMore === true) return (last.page ?? 1) + 1;
      const page = last.page ?? 1;
      const total = last.total ?? 0;
      const loaded = page * perPage;
      if (total > perPage + 1) return loaded < total ? page + 1 : undefined;
      return page + 1;
    },
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
    // Colapsa por CONTATO+CANAL (não por `id`): no modelo de ticket, reabrir
    // uma conversa encerrada gera um NOVO id (ticket B), e o ticket A
    // (RESOLVED) continuava aparecendo como um segundo card do mesmo número.
    // Regra do operador: 1 card por número — o histórico dos tickets antigos
    // fica acessível na timeline contínua do chat (separadores de ticket),
    // não como cards separados. Mantemos, por contato+canal, o ticket com
    // atividade mais recente (o ativo; os resolvidos ficam congelados pois
    // qualquer nova mensagem reabre como ticket novo). Também cobre o dedupe
    // antigo por `id` (mesma conversa repetida entre páginas do infinite
    // scroll quando ela "pula" de página no servidor).
    const byGroup = new Map<string, ConversationListRow>();
    for (const row of flat) {
      if (!row?.id) continue;
      const key = groupKey(row);
      const prev = byGroup.get(key);
      if (!prev) {
        byGroup.set(key, row);
        continue;
      }
      const prevPri = inboxQueueSectionPriority(prev.queueTab ?? undefined);
      const nextPri = inboxQueueSectionPriority(row.queueTab ?? undefined);
      if (nextPri < prevPri) {
        byGroup.set(key, row);
        continue;
      }
      if (nextPri === prevPri && activityTs(row) >= activityTs(prev)) {
        byGroup.set(key, {
          ...row,
          queueTab: row.queueTab ?? prev.queueTab,
        });
      }
    }
    const items: ConversationListRow[] = [...byGroup.values()];
    const last = pages[pages.length - 1];
    const anyMore = pages.some((p) => p?.hasMore === true);
    return {
      items,
      total: last.total,
      page: last.page,
      perPage: last.perPage,
      hasMore: parallelTabs ? anyMore || last.hasMore : last.hasMore,
      nextCursor: last.nextCursor ?? null,
    };
  }, [query.data, parallelTabs]);

  return {
    data,
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
  const filterKey = filters
    ? {
        ownerIds: filters.ownerIds ?? (filters.ownerId ? [filters.ownerId] : []),
        withoutOwner: filters.withoutOwner ?? false,
        channel: filters.channel ?? null,
        channelIds: filters.channelIds ?? [],
        stageIds: filters.stageIds ?? (filters.stageId ? [filters.stageId] : []),
        tagIds: filters.tagIds ?? [],
        sources: filters.sources ?? [],
        sessionExpiresWithinHours: filters.sessionExpiresWithinHours ?? null,
        windowState: filters.windowState ?? null,
      }
    : null;
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
