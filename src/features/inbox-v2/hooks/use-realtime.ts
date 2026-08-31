"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { subscribeSSEEvents } from "@/hooks/use-sse";
import { isEventMessageType } from "@/components/crm/chat-timeline";
import { messagesKey } from "./use-messages";
import { shouldSuppressInboxListRefresh } from "./use-conversation-actions";
import { playInboxPing } from "./use-inbox-sound";
import { rowBelongsToInboxTab, rowStaysOnAutomacaoTab } from "../inbox-queue-tab";
import {
  getConversation,
  getConversationsByIds,
  hasInboxServerFilters,
  type ConversationListRow,
  type InboxFilters,
  type InboxTab,
} from "../api";

/**
 * SSE em /api/sse/messages — preserva exatamente o comportamento do
 * legado (`useSSE` + `scheduleInboxRefresh`):
 *
 *  - 1 EventSource só, compartilhado pela página.
 *  - new_message prefere patch do card no cache; lista inteira só quando
 *    o ticket não está nas páginas e não dá pra inserir (aí invalida só
 *    a aba afetada). Counts: debounce ≥8s.
 *  - conversation_updated: GET /:id só se o card JÁ está na lista
 *    cacheada desta aba (ou o ticket está aberto aqui / payload diz
 *    unassigned e a aba é entrada sem filtros). Id ausente das páginas
 *    → não GET (evita 404×N). Poll 120s ou prepend se o payload for
 *    um row completo. 404 fica em cache ~60s.
 *  - message_status NÃO invalida lista/counts (só ticks da bolha) — evita
 *    refetch storm em cold-load / rajadas de delivery receipts.
 *  - new_message / whatsapp_call invalidam mensagens da conversa
 *    ativa quando o conversationId casa.
 *  - contact_updated passa pelo mesmo debounce da lista.
 *  - Throttle de 1000ms: rajadas de eventos não viram refetch×N.
 *  - message_status: update otimista do tick; refetch só em `failed`
 *    (delivered/read não disparam GET messages de novo).
 *  - Reconexão automática com backoff fixo de 5s em onerror.
 *    NÃO invalida lista no connect/reconnect (só em eventos reais).
 *
 * Aviso sonoro: só em inbound destinado a este operador (assignedToId),
 * para não tocar em quem tem a inbox vazia / não é responsável.
 */

type InfiniteInboxPage = {
  items?: Array<{ id: string; assignedToId?: string | null }>;
};

type NewMessagePayload = {
  conversationId?: string;
  direction?: string;
  assignedToId?: string | null;
  content?: string;
  timestamp?: string;
  messageType?: string;
};

/**
 * Patch in-place do card da conversa no cache da lista (P0-1): um
 * `new_message` atualiza preview/direção/unread do card JÁ carregado em
 * vez de invalidar a lista inteira (35KB) a cada evento da org.
 *
 * Retorna true quando a conversa foi encontrada em alguma página
 * cacheada. Quando não foi (conversa nova ou fora da página/filtro
 * atual), o chamador deve invalidar a lista — é uma mudança estrutural.
 *
 * Não reordena páginas (risco de quebrar o infinite scroll); a posição
 * do card se ajusta no próximo refetch (poll de 60s / troca de aba).
 */
function patchInboxConversationCard(
  qc: QueryClient,
  data: NewMessagePayload,
): boolean {
  if (!data.conversationId) return false;
  // Eventos de timeline (distribuição, etc.) não substituem o preview do card.
  if (isEventMessageType(data.messageType)) {
    const entries = qc.getQueriesData<{ pages?: Array<{ items?: ConversationListRow[] }> }>({
      queryKey: ["inbox-conversations"],
    });
    for (const [, cached] of entries) {
      if (!cached?.pages) continue;
      for (const page of cached.pages) {
        if (page?.items?.some((c) => c?.id === data.conversationId)) return true;
      }
    }
    return false;
  }
  const direction =
    data.direction === "in" || data.direction === "out" ? data.direction : null;
  const ts =
    typeof data.timestamp === "string" && data.timestamp
      ? data.timestamp
      : new Date().toISOString();
  const content = typeof data.content === "string" ? data.content : "";

  const entries = qc.getQueriesData<{ pages?: Array<{ items?: ConversationListRow[] }> }>({
    queryKey: ["inbox-conversations"],
  });
  let found = false;
  for (const [queryKey, cached] of entries) {
    if (!cached?.pages) continue;
    let touched = false;
    const pages = cached.pages.map((page) => {
      const items = page?.items;
      if (!items) return page;
      const idx = items.findIndex((c) => c?.id === data.conversationId);
      if (idx < 0) return page;
      found = true;
      touched = true;
      const conv = items[idx];
      const nextItems = items.slice();
      nextItems[idx] = {
        ...conv,
        lastMessageAt: ts,
        updatedAt: ts,
        ...(direction === "in"
          ? {
              lastInboundAt: ts,
              unreadCount: (conv.unreadCount ?? 0) + 1,
            }
          : {}),
        ...(data.assignedToId !== undefined
          ? { assignedToId: data.assignedToId }
          : {}),
        // messageType "" força o adapter a re-inferir o ícone pelo
        // placeholder do content ("[Áudio]", "📎 ...") da nova mensagem.
        lastMessagePreview: {
          content,
          messageType: "",
          mediaUrl: null,
          direction: direction ?? conv.lastMessagePreview?.direction ?? "",
          sendStatus: direction === "out" ? "sent" : null,
          sendError: null,
        },
        // Campo "futuro" tem precedência no adapter — se existir na row,
        // precisa acompanhar o patch pra não exibir preview velho.
        ...(conv.lastMessage
          ? {
              lastMessage: {
                ...conv.lastMessage,
                preview: content,
                direction: direction ?? conv.lastMessage.direction,
              },
            }
          : {}),
      };
      return { ...page, items: nextItems };
    });
    if (touched) qc.setQueryData(queryKey, { ...cached, pages });
  }
  return found;
}

type InboxListPage = {
  items?: ConversationListRow[];
  total?: number;
};

type InboxListCache = {
  pages?: InboxListPage[];
  pageParams?: unknown[];
};

function conversationMatchesId(
  row: ConversationListRow | undefined,
  conversationId: string,
): boolean {
  if (!row) return false;
  if (row.id === conversationId) return true;
  return row.number != null && String(row.number) === conversationId;
}

function inboxTabFromQueryKey(queryKey: readonly unknown[]): InboxTab | null {
  if (queryKey[0] !== "inbox-conversations") return null;
  const tab = queryKey[1];
  return typeof tab === "string" ? (tab as InboxTab) : null;
}

function inboxFiltersFromQueryKey(
  queryKey: readonly unknown[],
): InboxFilters | undefined {
  const raw = queryKey[2];
  return raw && typeof raw === "object" ? (raw as InboxFilters) : undefined;
}

function inboxSearchFromQueryKey(queryKey: readonly unknown[]): string {
  const raw = queryKey[3];
  return typeof raw === "string" ? raw.trim() : "";
}

function bumpPageTotals(pages: InboxListPage[], delta: number): InboxListPage[] {
  if (delta === 0) return pages;
  return pages.map((page) =>
    typeof page.total === "number"
      ? { ...page, total: Math.max(0, page.total + delta) }
      : page,
  );
}

function rowFitsCachedQuery(
  row: ConversationListRow,
  tab: InboxTab,
  present: boolean,
): boolean {
  if (tab === "automacao") return present && rowStaysOnAutomacaoTab(row);
  return rowBelongsToInboxTab(row, tab);
}

function rowKnownToMissFilters(
  row: ConversationListRow,
  filters: InboxFilters | undefined,
): boolean {
  if (!filters) return false;
  if (filters.withoutOwner && row.assignedToId) return true;
  if (
    !filters.withoutOwner &&
    filters.ownerIds?.length &&
    (!row.assignedToId || !filters.ownerIds.includes(row.assignedToId))
  ) {
    return true;
  }
  if (filters.channel && row.channel && filters.channel !== row.channel) {
    return true;
  }
  return false;
}

function canSafelyPrependToQuery(
  row: ConversationListRow,
  queryKey: readonly unknown[],
): boolean {
  if (inboxSearchFromQueryKey(queryKey)) return false;
  const filters = inboxFiltersFromQueryKey(queryKey);
  if (hasInboxServerFilters(filters)) return false;
  const tab = inboxTabFromQueryKey(queryKey);
  if (!tab) return false;
  return rowFitsCachedQuery(row, tab, false);
}

function removeConversationFromInboxCaches(
  qc: QueryClient,
  conversationId: string,
): void {
  const entries = qc.getQueriesData<InboxListCache>({
    queryKey: ["inbox-conversations"],
  });
  for (const [queryKey, cached] of entries) {
    if (!cached?.pages) continue;
    let removed = 0;
    const pages = cached.pages.map((page) => {
      const items = page?.items;
      if (!items?.length) return page;
      const nextItems = items.filter(
        (c) => !conversationMatchesId(c, conversationId),
      );
      if (nextItems.length === items.length) return page;
      removed += items.length - nextItems.length;
      return { ...page, items: nextItems };
    });
    if (removed > 0) {
      qc.setQueryData(queryKey, {
        ...cached,
        pages: bumpPageTotals(pages, -removed),
      });
    }
  }
}

/** Acima disso, 1 refetch das queries que já listam os ids é mais barato
 *  que N× GET /:id (ex.: assign em massa). */
const CARD_SYNC_BURST_LIMIT = 8;

/** Burst de conversation_updated: não re-GET o mesmo id após 404. */
const CONVERSATION_404_TTL_MS = 60_000;
const conversation404UntilMs = new Map<string, number>();

function rememberConversation404(conversationId: string): void {
  conversation404UntilMs.set(
    conversationId,
    Date.now() + CONVERSATION_404_TTL_MS,
  );
}

function isCachedConversation404(conversationId: string): boolean {
  const until = conversation404UntilMs.get(conversationId);
  if (until == null) return false;
  if (until <= Date.now()) {
    conversation404UntilMs.delete(conversationId);
    return false;
  }
  return true;
}

function conversationIdInInboxCaches(
  qc: QueryClient,
  conversationId: string,
): boolean {
  const entries = qc.getQueriesData<InboxListCache>({
    queryKey: ["inbox-conversations"],
  });
  for (const [, cached] of entries) {
    if (
      cached?.pages?.some((page) =>
        page?.items?.some((c) => conversationMatchesId(c, conversationId)),
      )
    ) {
      return true;
    }
  }
  return false;
}

type ConversationUpdatedPayload = {
  conversationId?: string;
  assignedToId?: string | null;
};

/** Payload SSE quase nunca é um card completo — só `{ conversationId }`. */
function conversationRowFromUpdatedEvent(
  raw: unknown,
): ConversationListRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id =
    typeof r.id === "string"
      ? r.id
      : typeof r.conversationId === "string"
        ? r.conversationId
        : "";
  if (!id) return null;
  if (typeof r.channel !== "string" || typeof r.status !== "string") {
    return null;
  }
  const contact = r.contact;
  if (!contact || typeof contact !== "object") return null;
  if (typeof (contact as { id?: unknown }).id !== "string") return null;
  return { ...(r as unknown as ConversationListRow), id };
}

/**
 * Ticket novo na fila livre: GET :id só se ESTA aba é entrada sem
 * busca/filtros e o payload afirma `assignedToId: null`. Qualquer outro
 * "talvez seja meu" vira 404 no GET (visibilidade por depto/dono).
 */
function shouldFetchUnassignedForEntradaTab(
  qc: QueryClient,
  payload: ConversationUpdatedPayload,
): boolean {
  if (payload.assignedToId !== null) return false;
  const entries = qc.getQueriesData<InboxListCache>({
    queryKey: ["inbox-conversations", "entrada"],
  });
  for (const [queryKey, cached] of entries) {
    if (!cached?.pages?.length) continue;
    if (inboxSearchFromQueryKey(queryKey)) continue;
    if (hasInboxServerFilters(inboxFiltersFromQueryKey(queryKey))) continue;
    return true;
  }
  return false;
}

function shouldGetConversationOnUpdated(
  qc: QueryClient,
  conversationId: string,
  activeId: string | null,
  payload: ConversationUpdatedPayload,
): boolean {
  if (conversationIdInInboxCaches(qc, conversationId)) return true;
  if (activeId && conversationId === activeId) return true;
  return shouldFetchUnassignedForEntradaTab(qc, payload);
}

function isConversationNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return /não encontrada|sem permissão|not found/i.test(msg);
}

function invalidateInboxQueriesTouching(
  qc: QueryClient,
  ids: string[],
): void {
  const idSet = new Set(ids);
  const entries = qc.getQueriesData<InboxListCache>({
    queryKey: ["inbox-conversations"],
  });
  let anyHit = false;
  for (const [queryKey, cached] of entries) {
    const hit = cached?.pages?.some((page) =>
      page?.items?.some(
        (c) =>
          c != null &&
          (idSet.has(c.id) ||
            (c.number != null && idSet.has(String(c.number)))),
      ),
    );
    if (!hit) continue;
    anyHit = true;
    qc.invalidateQueries({ queryKey, exact: true });
  }
  if (!anyHit) {
    qc.invalidateQueries({ queryKey: ["inbox-conversations", "entrada"] });
  }
}

/**
 * Substitui / remove / prepend o card nas páginas já cacheadas.
 * Sem search/filtros de servidor, um ticket novo entra no topo da aba
 * certa. Com filtro opaco, invalida só aquela query — nunca a inbox toda.
 */
function applyConversationRowToInboxCaches(
  qc: QueryClient,
  row: ConversationListRow,
): void {
  qc.setQueryData(["inbox-conversation", row.id], row);
  if (row.number != null) {
    qc.setQueryData(["inbox-conversation", String(row.number)], row);
  }

  const entries = qc.getQueriesData<InboxListCache>({
    queryKey: ["inbox-conversations"],
  });
  for (const [queryKey, cached] of entries) {
    if (!cached?.pages) continue;
    const tab = inboxTabFromQueryKey(queryKey);
    if (!tab) continue;

    let found = false;
    const pagesAfterPatch = cached.pages.map((page) => {
      const items = page?.items;
      if (!items) return page;
      const idx = items.findIndex(
        (c) =>
          conversationMatchesId(c, row.id) ||
          (row.number != null && conversationMatchesId(c, String(row.number))),
      );
      if (idx < 0) return page;
      found = true;
      const nextItems = items.slice();
      nextItems[idx] = { ...items[idx], ...row };
      return { ...page, items: nextItems };
    });

    const belongs =
      rowFitsCachedQuery(row, tab, found) &&
      !rowKnownToMissFilters(row, inboxFiltersFromQueryKey(queryKey));

    if (found && belongs) {
      qc.setQueryData(queryKey, { ...cached, pages: pagesAfterPatch });
      continue;
    }

    if (found && !belongs) {
      const pages = pagesAfterPatch.map((page) => {
        const items = page?.items;
        if (!items?.length) return page;
        const nextItems = items.filter(
          (c) =>
            !conversationMatchesId(c, row.id) &&
            !(row.number != null && conversationMatchesId(c, String(row.number))),
        );
        if (nextItems.length === items.length) return page;
        return { ...page, items: nextItems };
      });
      qc.setQueryData(queryKey, {
        ...cached,
        pages: bumpPageTotals(pages, -1),
      });
      continue;
    }

    if (!found && belongs && canSafelyPrependToQuery(row, queryKey)) {
      const pages = cached.pages.slice();
      const first = pages[0] ?? { items: [] };
      pages[0] = {
        ...first,
        items: [row, ...(first.items ?? [])],
      };
      qc.setQueryData(queryKey, {
        ...cached,
        pages: bumpPageTotals(pages, 1),
      });
      continue;
    }

    if (!found && belongs) {
      qc.invalidateQueries({ queryKey, exact: true });
    }
  }
}

function shouldPlayInboundPing(
  qc: QueryClient,
  currentUserId: string | null | undefined,
  data: {
    conversationId?: string;
    direction?: string;
    assignedToId?: string | null;
  },
): boolean {
  if (data.direction !== "in") return false;
  if (!currentUserId) return false;

  // Payload novo: responsável explícito no SSE.
  if (typeof data.assignedToId === "string" && data.assignedToId.length > 0) {
    return data.assignedToId === currentUserId;
  }
  // Sem responsável → fila livre; não é "mensagem deste operador".
  if (data.assignedToId === null) return false;

  // Payload legado (sem assignedToId): só toca se a conversa já está na
  // lista de inbox deste cliente (visibilidade já filtrada no GET).
  if (!data.conversationId) return false;
  const entries = qc.getQueriesData<{ pages?: InfiniteInboxPage[] }>({
    queryKey: ["inbox-conversations"],
  });
  for (const [, cached] of entries) {
    const pages = cached?.pages;
    if (!pages) continue;
    for (const page of pages) {
      const hit = page?.items?.find((c) => c.id === data.conversationId);
      if (!hit) continue;
      if (hit.assignedToId == null) return false;
      return hit.assignedToId === currentUserId;
    }
  }
  return false;
}

export function useInboxRealtime(options: {
  activeConversationId: string | null;
  /** Usuário logado — necessário para filtrar o bip por responsável. */
  currentUserId?: string | null;
  enabled?: boolean;
}) {
  const { activeConversationId, currentUserId = null, enabled = true } = options;
  const qc = useQueryClient();
  const activeRef = useRef(activeConversationId);
  activeRef.current = activeConversationId;
  const userIdRef = useRef(currentUserId);
  userIdRef.current = currentUserId;

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dailyStatsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCardSyncIdsRef = useRef<Set<string>>(new Set());
  const inFlightCardSyncIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }, [activeConversationId]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    function scheduleInboxRefresh() {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      }, 1000);
      scheduleCountsRefresh();
    }

    // Badges das 8 abas: 8s (era 1s). 20 operadores × cada msg virava
    // 20 scans de counts. Distribuição tem poll 20s/30s + SSE próprio.
    function scheduleCountsRefresh() {
      if (countsTimerRef.current) return;
      countsTimerRef.current = setTimeout(() => {
        countsTimerRef.current = null;
        qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
      }, 8000);
    }

    // Chips do painel do dia (P1-8): o poll longo (3min) é safety-net; a
    // atualização perceptível vem daqui (debounce 5s, independente dos counts).
    function scheduleDailyStatsRefresh() {
      if (dailyStatsTimerRef.current) return;
      dailyStatsTimerRef.current = setTimeout(() => {
        dailyStatsTimerRef.current = null;
        qc.invalidateQueries({ queryKey: ["inbox", "daily-stats"] });
      }, 5000);
    }

    // conversation_updated: 1 GET /:id só para tickets que JÁ estão na
    // lista cacheada desta aba (ou abertos aqui). Nunca GET da lista
    // inteira; id ausente → poll 120s / prepend se o payload for row.
    function scheduleConversationCardSync(
      conversationId: string,
      payload: ConversationUpdatedPayload,
    ) {
      if (isCachedConversation404(conversationId)) {
        if (!conversationIdInInboxCaches(qc, conversationId)) return;
      }
      if (inFlightCardSyncIdsRef.current.has(conversationId)) return;
      if (pendingCardSyncIdsRef.current.has(conversationId)) return;
      if (
        !shouldGetConversationOnUpdated(
          qc,
          conversationId,
          activeRef.current,
          payload,
        )
      ) {
        return;
      }
      pendingCardSyncIdsRef.current.add(conversationId);
      if (cardSyncTimerRef.current) return;
      cardSyncTimerRef.current = setTimeout(() => {
        cardSyncTimerRef.current = null;
        const ids = [...pendingCardSyncIdsRef.current].filter((id) => {
          if (isCachedConversation404(id) && !conversationIdInInboxCaches(qc, id)) {
            return false;
          }
          return true;
        });
        pendingCardSyncIdsRef.current.clear();
        if (ids.length === 0) return;
        if (ids.length > CARD_SYNC_BURST_LIMIT) {
          invalidateInboxQueriesTouching(qc, ids);
          return;
        }
        for (const id of ids) inFlightCardSyncIdsRef.current.add(id);
        void (async () => {
          try {
            if (ids.length === 1) {
              try {
                const row = await getConversation(ids[0]);
                if (!alive) return;
                applyConversationRowToInboxCaches(qc, row);
              } catch (err) {
                if (isConversationNotFoundError(err)) {
                  rememberConversation404(ids[0]);
                  removeConversationFromInboxCaches(qc, ids[0]);
                }
              }
              return;
            }
            try {
              const rows = await getConversationsByIds(ids);
              if (!alive) return;
              for (const row of rows) {
                applyConversationRowToInboxCaches(qc, row);
              }
            } catch {
              // Batch falhou: não evicta. Próximo SSE/poll tenta de novo.
            }
          } finally {
            for (const id of ids) inFlightCardSyncIdsRef.current.delete(id);
          }
        })();
      }, 1000);
    }

    const unsubscribe = subscribeSSEEvents("/api/sse/messages", {
      new_message: (raw: unknown) => {
        try {
          const data = raw as NewMessagePayload;
          if (shouldPlayInboundPing(qc, userIdRef.current, data)) {
            playInboxPing();
          }
          if (data.conversationId) {
            if (data.direction === "in") {
              // Janela 24h é por canal; o composer lê `channel-session`
              // (staleTime, sem focus refetch). Sem isto o banner fica
              // "encerrada" depois da resposta do cliente.
              qc.invalidateQueries({
                queryKey: ["channel-session", data.conversationId],
              });
            }
            if (data.conversationId === activeRef.current) {
              // Conversa aberta: refetch imediato para exibir a mensagem.
              qc.invalidateQueries({ queryKey: messagesKey(activeRef.current) });
            } else {
              // Outra conversa: marca stale sem refetch imediato.
              // Quando o operador navegar até ela, verá dados frescos.
              qc.invalidateQueries({
                queryKey: messagesKey(data.conversationId),
                refetchType: "none",
              });
            }
          }
          // Patch in-place do card quando a conversa está na página
          // cacheada; invalidação da lista só quando ela NÃO está
          // (conversa nova/fora da página = mudança estrutural).
          if (patchInboxConversationCard(qc, data)) {
            scheduleCountsRefresh();
          } else {
            scheduleInboxRefresh();
          }
          scheduleDailyStatsRefresh();
        } catch {
          /* ignore */
        }
      },

      message_status: (raw: unknown) => {
        try {
          const data = raw as {
            conversationId?: string;
            /** Id da bolha (= externalId/wamid no Meta). */
            messageId?: string;
            /** UUID interno — fallback p/ payloads antigos. */
            internalId?: string;
            status?: string;
          };
          if (data.conversationId) {
            // Atualização otimista do tick (sent→delivered→read) sem
            // esperar o refetch — evita atraso perceptível nos ticks azuis.
            if (data.messageId && data.status) {
              const mapped = ({
                pending: "PENDING",
                sent: "SENT",
                delivered: "DELIVERED",
                read: "READ",
                failed: "FAILED",
              } as Record<string, string>)[data.status.toLowerCase()];
              if (mapped) {
                const bubbleId = data.messageId;
                const internalId = data.internalId;
                qc.setQueryData(
                  messagesKey(data.conversationId),
                  (old: { messages?: Array<{ id: string; status?: string; sendStatus?: string | null }> } | undefined) => {
                    if (!old?.messages) return old;
                    return {
                      ...old,
                      messages: old.messages.map((m) =>
                        m.id === bubbleId || (internalId != null && m.id === internalId)
                          ? { ...m, status: mapped, sendStatus: data.status!.toLowerCase() }
                          : m,
                      ),
                    };
                  },
                );
              }
            }
            // Tick já atualizado de forma otimista acima. Refetch só em
            // failed (precisa sendError completo); delivered/read não
            // disparam GET messages — evita spam na conversa aberta.
            const statusLc = (data.status ?? "").toLowerCase();
            if (statusLc === "failed") {
              if (data.conversationId === activeRef.current) {
                void qc.refetchQueries({
                  queryKey: messagesKey(data.conversationId),
                });
              } else {
                qc.invalidateQueries({
                  queryKey: messagesKey(data.conversationId),
                  refetchType: "none",
                });
              }
            } else if (data.conversationId !== activeRef.current) {
              qc.invalidateQueries({
                queryKey: messagesKey(data.conversationId),
                refetchType: "none",
              });
            }
            // Leitura (ticks azuis): atualiza timeline do deal e feed /logs.
            if (statusLc === "read") {
              qc.invalidateQueries({ queryKey: ["deal-timeline-v2"] });
              qc.invalidateQueries({ queryKey: ["deal-timeline"] });
              qc.invalidateQueries({ queryKey: ["activity-feed"] });
              qc.invalidateQueries({ queryKey: ["activity-feed-stats"] });
            }
          }
          // Delivery receipts não mudam a lista/counts — só ticks na bolha.
          // Evita cold-load storm quando o SSE despeja message_status em lote.
        } catch {
          /* ignore */
        }
      },

      conversation_updated: (raw: unknown) => {
        const payload = (raw ?? {}) as ConversationUpdatedPayload;
        const id = payload.conversationId;
        if (shouldSuppressInboxListRefresh(id ?? activeRef.current)) {
          scheduleDailyStatsRefresh();
          return;
        }
        if (!id) {
          scheduleInboxRefresh();
          scheduleDailyStatsRefresh();
          return;
        }
        if (isCachedConversation404(id) && !conversationIdInInboxCaches(qc, id)) {
          scheduleCountsRefresh();
          scheduleDailyStatsRefresh();
          return;
        }
        const completeRow = conversationRowFromUpdatedEvent(raw);
        if (completeRow) {
          applyConversationRowToInboxCaches(qc, completeRow);
        } else if (
          shouldGetConversationOnUpdated(qc, id, activeRef.current, payload)
        ) {
          scheduleConversationCardSync(id, payload);
        }
        scheduleCountsRefresh();
        scheduleDailyStatsRefresh();
      },

      // Timeline (chatter) da conversa — encerramento/reabertura empurrados
      // pelo backend. Invalida ["conversation-timeline", id] p/ o
      // ConversationTimelineTab exibir o evento na hora, mesmo quando a
      // acao veio de outro agente/automacao (sem mutation local).
      conversation_timeline_updated: (raw: unknown) => {
        try {
          const data = raw as {
            conversationId?: string;
          };
          if (data.conversationId) {
            qc.invalidateQueries({
              queryKey: ["conversation-timeline", data.conversationId],
            });
          }
        } catch {
          /* ignore */
        }
      },

      contact_updated: (raw: unknown) => {
        try {
          const data = raw as {
            contactId?: string;
          };
          scheduleInboxRefresh();
          if (data.contactId) {
            qc.invalidateQueries({ queryKey: ["contact-sidebar", data.contactId] });
          }
        } catch {
          /* ignore */
        }
      },

      whatsapp_call: (raw: unknown) => {
        try {
          const data = raw as {
            conversationId?: string;
          };
          if (data.conversationId && data.conversationId === activeRef.current) {
            qc.invalidateQueries({ queryKey: messagesKey(activeRef.current) });
          }
        } catch {
          /* ignore */
        }
      },

      presence_update: () => {
        qc.invalidateQueries({ queryKey: ["my-agent-status"] });
      },

      // Ciclo de vida de automações (robô iniciou/avançou/terminou) —
      // atualiza o chip "robô em execução" do chat aberto. O evento traz
      // contactId (contexto não referencia conversa), então invalidamos a
      // query da conversa ativa; se o contato não for o mesmo, o refetch
      // é barato e o resultado idêntico.
      automation_state: (raw: unknown) => {
        // Invalida o botão "Robôs ativos" (por contato) do evento e,
        // por compat, o chip antigo (por conversa ativa).
        try {
          const data = raw as {
            contactId?: string;
          };
          if (data.contactId) {
            qc.invalidateQueries({
              queryKey: ["active-automations-contact", data.contactId],
            });
            qc.invalidateQueries({
              queryKey: ["automation-history-contact", data.contactId],
            });
          }
        } catch {
          /* ignore */
        }
        if (activeRef.current) {
          qc.invalidateQueries({
            queryKey: ["active-automations", activeRef.current],
          });
        }
      },
    });

    return () => {
      alive = false;
      unsubscribe();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      if (countsTimerRef.current) clearTimeout(countsTimerRef.current);
      countsTimerRef.current = null;
      if (dailyStatsTimerRef.current) clearTimeout(dailyStatsTimerRef.current);
      dailyStatsTimerRef.current = null;
      if (cardSyncTimerRef.current) clearTimeout(cardSyncTimerRef.current);
      cardSyncTimerRef.current = null;
      pendingCardSyncIdsRef.current.clear();
      inFlightCardSyncIdsRef.current.clear();
    };
  }, [enabled, qc]);
}
