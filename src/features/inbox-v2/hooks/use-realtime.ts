"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { subscribeSSEEvents } from "@/hooks/use-sse";
import { isEventMessageType } from "@/components/crm/chat-timeline";
import { messagesKey } from "./use-messages";
import { shouldSuppressInboxListRefresh } from "./use-conversation-actions";
import { playInboxPing } from "./use-inbox-sound";
import {
  inboxQueueTabFor,
  rowBelongsToAnyInboxTab,
  rowStaysOnAutomacaoTab,
  tabMoved,
} from "../inbox-queue-tab";
import { isInboxTab, parseInboxTabs } from "./use-inbox-filters-url-sync";
import {
  findCachedConversationRow,
  patchInboxTabCounts,
} from "./apply-outbound-inbox-card";
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
 *  - new_message prefere patch do card no cache (zero GET). Card fora
 *    da página hidrata via GET ?ids= em lote (debounce 400ms), só se a
 *    lista da inbox estiver montada. Miss que não entra na lista fica
 *    em skip ~90s — sem poll. Badges ±1 se a fila canônica mudou.
 *  - conversation_updated: GET /:id SOMENTE se o ticket está ABERTO
 *    nesta aba. Card só na lista → patch do payload (se der) ou
 *    ignora; NUNCA GET. Um SSE não vira 404×N só porque o card está
 *    no cache de todo mundo. 404 memo ~60s bloqueia até o aberto.
 *  - message_status NÃO invalida lista/counts (só ticks da bolha) — evita
 *    refetch storm em cold-load / rajadas de delivery receipts.
 *  - new_message / whatsapp_call invalidam mensagens da conversa
 *    ativa quando o conversationId casa.
 *  - contact_updated NÃO invalida a lista (só sidebar do contato).
 *  - Sem timer de lista/counts. Relist só: card fora do cache e ?ids=
 *    falhou, troca de aba/filtro, refresh explícito, reconnect com gap.
 *  - message_status: update otimista do tick; refetch só em `failed`
 *    (delivered/read não disparam GET messages de novo).
 *  - Reconexão automática com backoff fixo de 5s em onerror.
 *    Reconnect após gap: um refetch de lista + counts.
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
 * `found`: conversa está numa página cacheada.
 * `tabMoved`: a fila canônica mudou (esperando↔respondidas, entrada→…).
 * Sem `tabMoved` o badge não muda. Com `tabMoved`, ±1 local (sem GET).
 *
 * Não reordena páginas (risco de quebrar o infinite scroll); a posição
 * do card se ajusta no próximo refetch (poll de 60s / troca de aba).
 */
function patchInboxConversationCard(
  qc: QueryClient,
  data: NewMessagePayload,
): {
  found: boolean;
  tabMoved: boolean;
  fromTab: InboxTab | null;
  toTab: InboxTab | null;
} {
  if (!data.conversationId) {
    return { found: false, tabMoved: false, fromTab: null, toTab: null };
  }
  // Eventos de timeline (distribuição, etc.) não substituem o preview do card.
  if (isEventMessageType(data.messageType)) {
    const entries = qc.getQueriesData<{ pages?: Array<{ items?: ConversationListRow[] }> }>({
      queryKey: ["inbox-conversations"],
    });
    for (const [, cached] of entries) {
      if (!cached?.pages) continue;
      for (const page of cached.pages) {
        if (page?.items?.some((c) => conversationMatchesId(c, data.conversationId!))) {
          return { found: true, tabMoved: false, fromTab: null, toTab: null };
        }
      }
    }
    return { found: false, tabMoved: false, fromTab: null, toTab: null };
  }
  const direction =
    data.direction === "in" || data.direction === "out" ? data.direction : null;
  const ts =
    typeof data.timestamp === "string" && data.timestamp
      ? data.timestamp
      : new Date().toISOString();
  const content = typeof data.content === "string" ? data.content : "";

  const conv = findCachedConversationRow(qc, data.conversationId);
  if (!conv) return { found: false, tabMoved: false, fromTab: null, toTab: null };

  const prevTab = inboxQueueTabFor(conv);
  const next: ConversationListRow = {
    ...conv,
    lastMessageAt: ts,
    updatedAt: ts,
    ...(direction ? { lastMessageDirection: direction } : {}),
    ...(direction === "in"
      ? {
          lastInboundAt: ts,
          unreadCount: (conv.unreadCount ?? 0) + 1,
        }
      : {}),
    // Outbound humano/agente: sem isto Entrada (hasHumanReply=false) não
    // promove para Respondidas — card sobe e fica como não respondido.
    ...(direction === "out"
      ? { hasHumanReply: true, hasAgentReply: true }
      : {}),
    ...(data.assignedToId !== undefined
      ? { assignedToId: data.assignedToId }
      : {}),
    lastMessagePreview: {
      content,
      messageType: "",
      mediaUrl: null,
      direction: direction ?? conv.lastMessagePreview?.direction ?? "",
      sendStatus: direction === "out" ? "sent" : null,
      sendError: null,
    },
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
  const nextTab = inboxQueueTabFor(next);
  if (conv.queueTab && conv.queueTab !== nextTab) {
    next.queueTab = nextTab;
  }
  applyConversationRowToInboxCaches(qc, next);
  return {
    found: true,
    tabMoved: nextTab !== prevTab,
    fromTab: prevTab,
    toTab: nextTab,
  };
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
  const want = String(conversationId);
  if (String(row.id) === want) return true;
  return row.number != null && String(row.number) === want;
}

function inboxTabsFromQueryKey(queryKey: readonly unknown[]): InboxTab[] {
  if (queryKey[0] !== "inbox-conversations") return [];
  const tab = queryKey[1];
  if (typeof tab === "string") return parseInboxTabs(tab);
  if (Array.isArray(tab)) return tab.filter((t): t is InboxTab => isInboxTab(t));
  return [];
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
  tabs: readonly InboxTab[],
  present: boolean,
): boolean {
  if (tabs.length === 0) return false;
  if (tabs.includes("automacao") && tabs.length === 1) {
    return present && rowStaysOnAutomacaoTab(row);
  }
  if (tabs.includes("automacao") && present && rowStaysOnAutomacaoTab(row)) {
    return true;
  }
  return rowBelongsToAnyInboxTab(row, tabs);
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
  const tabs = inboxTabsFromQueryKey(queryKey);
  if (tabs.length === 0) return false;
  return rowFitsCachedQuery(row, tabs, false);
}

function removeConversationFromInboxCaches(
  qc: QueryClient,
  conversationId: string,
): void {
  const existing = findCachedConversationRow(qc, conversationId);
  const fromTab = existing ? inboxQueueTabFor(existing) : null;
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
  if (fromTab) patchInboxTabCounts(qc, fromTab, null);
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

/** Card visível na lista montada: nunca GET ?ids=. Pipeline/sales-hub
 *  sem observer da lista também não hidratam — o chat aberto usa :id. */
function hasActiveInboxListQuery(qc: QueryClient): boolean {
  return qc
    .getQueryCache()
    .findAll({ queryKey: ["inbox-conversations"] })
    .some((q) => q.isActive() && q.state.data != null);
}

const MISSING_HYDRATE_DEBOUNCE_MS = 400;
const MISSING_HYDRATE_SKIP_TTL_MS = 90_000;
const MISSING_HYDRATE_ERROR_TTL_MS = 15_000;
const missingHydratePending = new Set<string>();
const missingHydrateInFlight = new Set<string>();
const missingHydrateSkipUntilMs = new Map<string, number>();
let missingHydrateTimer: ReturnType<typeof setTimeout> | null = null;

function isMissingHydrateSkipped(conversationId: string): boolean {
  const until = missingHydrateSkipUntilMs.get(conversationId);
  if (until == null) return false;
  if (until <= Date.now()) {
    missingHydrateSkipUntilMs.delete(conversationId);
    return false;
  }
  return true;
}

function rememberMissingHydrateSkip(
  conversationId: string,
  ttlMs = MISSING_HYDRATE_SKIP_TTL_MS,
): void {
  missingHydrateSkipUntilMs.set(conversationId, Date.now() + ttlMs);
}

function shouldHydrateMissingCard(
  qc: QueryClient,
  conversationId: string,
): boolean {
  if (!conversationId) return false;
  if (isCachedConversation404(conversationId)) return false;
  if (isMissingHydrateSkipped(conversationId)) return false;
  if (findCachedConversationRow(qc, conversationId)) return false;
  if (!hasActiveInboxListQuery(qc)) return false;
  return true;
}

function flushMissingCardHydrate(qc: QueryClient): void {
  const ids = [...missingHydratePending].filter((id) => {
    missingHydratePending.delete(id);
    return shouldHydrateMissingCard(qc, id) && !missingHydrateInFlight.has(id);
  });
  if (ids.length === 0) return;
  for (const id of ids) missingHydrateInFlight.add(id);
  void (async () => {
    try {
      const rows = await getConversationsByIds(ids);
      for (const row of rows) {
        applyConversationRowToInboxCaches(qc, row);
      }
      for (const id of ids) {
        if (!findCachedConversationRow(qc, id)) {
          rememberMissingHydrateSkip(id);
        }
      }
    } catch {
      for (const id of ids) {
        rememberMissingHydrateSkip(id, MISSING_HYDRATE_ERROR_TTL_MS);
      }
    } finally {
      for (const id of ids) missingHydrateInFlight.delete(id);
    }
  })();
}

function scheduleMissingCardHydrate(
  qc: QueryClient,
  conversationId: string,
): void {
  if (!shouldHydrateMissingCard(qc, conversationId)) return;
  if (missingHydrateInFlight.has(conversationId)) return;
  if (missingHydratePending.has(conversationId)) return;
  missingHydratePending.add(conversationId);
  if (missingHydrateTimer) return;
  missingHydrateTimer = setTimeout(() => {
    missingHydrateTimer = null;
    flushMissingCardHydrate(qc);
  }, MISSING_HYDRATE_DEBOUNCE_MS);
}

type ConversationUpdatedPayload = {
  conversationId?: string;
  assignedToId?: string | null;
  status?: string;
  closedAt?: string | null;
  followUpAt?: string | null;
  whatsappCallConsentStatus?: string;
  assignedTo?: { type?: string | null } | null;
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

/** GET :id só para o ticket ABERTO (CUID ou número da URL). */
function eventTouchesOpenConversation(
  qc: QueryClient,
  eventConversationId: string,
  activeId: string | null,
): boolean {
  if (!activeId) return false;
  if (eventConversationId === activeId) return true;
  const open = findCachedConversationRow(qc, activeId);
  if (open && conversationMatchesId(open, eventConversationId)) return true;
  const eventRow = findCachedConversationRow(qc, eventConversationId);
  return Boolean(eventRow && conversationMatchesId(eventRow, activeId));
}

function shouldGetConversationOnUpdated(
  qc: QueryClient,
  conversationId: string,
  activeId: string | null,
): boolean {
  return eventTouchesOpenConversation(qc, conversationId, activeId);
}

function hasPatchableUpdatedFields(payload: ConversationUpdatedPayload): boolean {
  return (
    payload.assignedToId !== undefined ||
    typeof payload.status === "string" ||
    payload.closedAt !== undefined ||
    payload.followUpAt !== undefined ||
    typeof payload.whatsappCallConsentStatus === "string"
  );
}

/** Mescla assignedTo/status/closedAt no card cacheado e reavalia a aba. */
function applyConversationUpdatedPatch(
  qc: QueryClient,
  payload: ConversationUpdatedPayload,
): boolean {
  const id = payload.conversationId;
  if (!id || !hasPatchableUpdatedFields(payload)) return false;
  const existing = findCachedConversationRow(qc, id);
  if (!existing) return false;
  const next: ConversationListRow = { ...existing };
  if (payload.assignedToId !== undefined) {
    next.assignedToId = payload.assignedToId;
    if (payload.assignedToId == null) {
      next.assignedTo = null;
    } else if (payload.assignedTo && existing.assignedTo) {
      next.assignedTo = {
        ...existing.assignedTo,
        type: payload.assignedTo.type ?? existing.assignedTo.type,
      };
    }
  }
  if (
    payload.status === "OPEN" ||
    payload.status === "RESOLVED" ||
    payload.status === "PENDING" ||
    payload.status === "SNOOZED"
  ) {
    next.status = payload.status;
  }
  if (payload.closedAt !== undefined) next.closedAt = payload.closedAt;
  if (payload.followUpAt !== undefined) next.followUpAt = payload.followUpAt;
  if (typeof payload.whatsappCallConsentStatus === "string") {
    next.whatsappCallConsentStatus = payload.whatsappCallConsentStatus;
  }
  applyConversationRowToInboxCaches(qc, next);
  return true;
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
  const prev = findCachedConversationRow(qc, row.id);
  const fromTab = prev ? inboxQueueTabFor(prev) : null;
  const toTab = inboxQueueTabFor(row);

  qc.setQueryData(["inbox-conversation", row.id], row);
  if (row.number != null) {
    qc.setQueryData(["inbox-conversation", String(row.number)], row);
  }

  const entries = qc.getQueriesData<InboxListCache>({
    queryKey: ["inbox-conversations"],
  });
  for (const [queryKey, cached] of entries) {
    if (!cached?.pages) continue;
    const tabs = inboxTabsFromQueryKey(queryKey);
    if (tabs.length === 0) continue;

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
      rowFitsCachedQuery(row, tabs, found) &&
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

  // Só ±1 quando o card já estava no cache e a fila canônica mudou.
  // Card novo/fora da página já entra no último GET ?counts=1.
  if (prev && tabMoved(fromTab, toTab)) {
    patchInboxTabCounts(qc, fromTab, toTab);
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

  const dailyStatsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCardSyncIdsRef = useRef<Set<string>>(new Set());
  const inFlightCardSyncIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    function refetchInboxAfterSseGap() {
      qc.invalidateQueries({
        queryKey: ["inbox-conversations"],
        refetchType: "active",
      });
      qc.invalidateQueries({
        queryKey: ["conversations", "tab-counts"],
        refetchType: "active",
      });
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

    // conversation_updated: GET /:id só do ticket ABERTO. 404 memo
    // bloqueia mesmo o aberto (~60s). Card só na lista não entra aqui.
    function scheduleConversationCardSync(conversationId: string) {
      if (isCachedConversation404(conversationId)) return;
      if (!shouldGetConversationOnUpdated(qc, conversationId, activeRef.current)) {
        return;
      }
      if (inFlightCardSyncIdsRef.current.has(conversationId)) return;
      if (pendingCardSyncIdsRef.current.has(conversationId)) return;
      pendingCardSyncIdsRef.current.add(conversationId);
      if (cardSyncTimerRef.current) return;
      cardSyncTimerRef.current = setTimeout(() => {
        cardSyncTimerRef.current = null;
        const ids = [...pendingCardSyncIdsRef.current].filter(
          (id) =>
            !isCachedConversation404(id) &&
            shouldGetConversationOnUpdated(qc, id, activeRef.current),
        );
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
                  if (!eventTouchesOpenConversation(qc, ids[0], activeRef.current)) {
                    removeConversationFromInboxCaches(qc, ids[0]);
                  }
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

    const unsubscribe = subscribeSSEEvents(
      "/api/sse/messages",
      {
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
            if (eventTouchesOpenConversation(qc, data.conversationId, activeRef.current)) {
              // Conversa aberta: refetch imediato para exibir a mensagem.
              qc.invalidateQueries({ queryKey: messagesKey(activeRef.current) });
              if (activeRef.current !== data.conversationId) {
                qc.invalidateQueries({ queryKey: messagesKey(data.conversationId) });
              }
            } else {
              // Outra conversa: marca stale sem refetch imediato.
              // Quando o operador navegar até ela, verá dados frescos.
              qc.invalidateQueries({
                queryKey: messagesKey(data.conversationId),
                refetchType: "none",
              });
            }
          }
          // Card na lista: patch in-place, zero GET. Fora da página:
          // GET ?ids= em lote só se a inbox estiver montada.
          const patch = patchInboxConversationCard(qc, data);
          if (patch.found) {
            // Preview in-place; badges ±1 se tabMoved. Sem GET counts/lista.
          } else if (isEventMessageType(data.messageType)) {
            // Timeline fora da 1ª página: não relista nem re-agrega.
          } else if (data.conversationId) {
            scheduleMissingCardHydrate(qc, data.conversationId);
          }
          if (!isEventMessageType(data.messageType)) {
            scheduleDailyStatsRefresh();
          }
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
          // Sem conversationId não dá pra patchar o card nem o badge.
          scheduleDailyStatsRefresh();
          return;
        }
        if (isCachedConversation404(id)) {
          if (!eventTouchesOpenConversation(qc, id, activeRef.current)) {
            removeConversationFromInboxCaches(qc, id);
          }
          scheduleDailyStatsRefresh();
          return;
        }
        const completeRow = conversationRowFromUpdatedEvent(raw);
        if (completeRow) {
          applyConversationRowToInboxCaches(qc, completeRow);
        } else if (applyConversationUpdatedPatch(qc, payload)) {
          // Card + badges ±1 sem GET :id / counts=1.
        } else if (shouldGetConversationOnUpdated(qc, id, activeRef.current)) {
          scheduleConversationCardSync(id);
        } else if (!findCachedConversationRow(qc, id)) {
          scheduleMissingCardHydrate(qc, id);
        }
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
      },
      refetchInboxAfterSseGap,
    );

    return () => {
      alive = false;
      unsubscribe();
      if (dailyStatsTimerRef.current) clearTimeout(dailyStatsTimerRef.current);
      dailyStatsTimerRef.current = null;
      if (cardSyncTimerRef.current) clearTimeout(cardSyncTimerRef.current);
      cardSyncTimerRef.current = null;
      pendingCardSyncIdsRef.current.clear();
      inFlightCardSyncIdsRef.current.clear();
    };
  }, [enabled, qc]);
}
