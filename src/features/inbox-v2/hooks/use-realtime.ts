"use client";

import { logger } from "@/lib/logger";
import { normalizeAdReferral } from "@/lib/ad-referral";
import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { subscribeSSEEvents } from "@/hooks/use-sse";
import { realtimeHandlers, type RealtimePayload } from "@/lib/realtime-contract";
import { useMessageToast } from "@/features/inbox-v2/context/message-toast-context";
import { isEventMessageType } from "@/components/crm/chat-timeline";
import {
  emitConversationReopened,
  isSseMessageStubId,
  messagesKey,
} from "./use-messages";
import { scheduleThreadHydrate } from "./thread-hydrate";
import { shouldSuppressInboxListRefresh } from "./use-conversation-actions";
import { scheduledMessagesKey } from "./use-scheduled-messages";
import { refreshInboxLists, scheduleInboxListRefresh } from "./inbox-list-refresh";
import {
  conversationUpdatedLikelyOnTabs,
  inboxQueueTabFor,
  newMessageLikelyOnTabs,
  rowBelongsToAnyInboxTab,
  rowStaysOnAutomacaoTab,
  tabMoved,
} from "../inbox-queue-tab";
import {
  isClosedInboxRow,
  mergeInboxCardRow,
  sameInboxCardGroup,
} from "../inbox-card-group";
import { isInboxTab, parseInboxTabs } from "./use-inbox-filters-url-sync";
import { findTeamUserById } from "./team-user-cache";
import { getInboxViewerScope, rowHiddenFromViewer } from "../inbox-viewer-scope";
import {
  findCachedConversationRow,
  findOpenInboxGroupSibling,
  patchInboxTabCounts,
  scheduleActiveAutomationQueue,
} from "./apply-outbound-inbox-card";
import {
  getConversation,
  getConversationsByIds,
  hasInboxServerFilters,
  type ConversationListRow,
  type InboxFilters,
  type InboxMessageDto,
  type InboxTab,
  type MessagesResponse,
} from "../api";

/**
 * SSE em /api/sse/messages — preserva exatamente o comportamento do
 * legado (`useSSE` + `scheduleInboxRefresh`):
 *
 *  - 1 EventSource só, compartilhado pela página.
 *  - new_message prefere patch do card no cache (zero GET). Card fora
 *    da página hidrata via GET ?ids= em lote (debounce 2s), só se a
 *    lista da inbox estiver montada e a aba puder mostrar o ticket.
 *    Miss que não entra na lista fica
 *    em skip ~90s — sem poll. Badges ±1 se a fila canônica mudou.
 *  - conversation_updated: GET /:id SOMENTE se o ticket está ABERTO
 *    nesta aba. Card só na lista → patch do payload (se der) ou
 *    ignora; NUNCA GET. Um SSE não vira 404×N só porque o card está
 *    no cache de todo mundo. 404 memo ~60s bloqueia até o aberto.
 *  - message_status NÃO invalida lista/counts (só ticks da bolha) — evita
 *    refetch storm em cold-load / rajadas de delivery receipts.
 *  - new_message da conversa aberta (ou do mesmo card: contato+canal)
 *    appenda a bolha no cache na hora — igual o preview do card. GET
 *    /messages hidrata id/mídia depois; stub `sse:` some no merge.
 *  - contact_updated NÃO invalida a lista (só sidebar do contato).
 *  - Sem timer de lista/counts. Relist só: card fora do cache e ?ids=
 *    falhou, troca de aba/filtro, refresh explícito, reconnect com gap.
 *  - message_status: update otimista do tick; refetch só em `failed`
 *    (delivered/read não disparam GET messages de novo).
 *  - Reconexão automática em onerror com espera crescente (5s, 10s, 20s…
 *    até 60s, ±30%; ver `use-sse.ts`). Reconnect após gap: um refetch de lista + counts + mensagens do
 *    ticket aberto (o gap não tem replay).
 *
 * Aviso sonoro e toast: `InboxMessageAlerts` (layout global), não aqui.
 */

/**
 * `new_message` como chega do barramento — contrato em
 * `@/lib/realtime-contract` (campos e significado documentados lá). Aqui
 * só entram os tipos do inbox para `card` (linha da lista, `InboxSseCard`
 * no backend) e `catalogOrder`.
 */
type NewMessagePayload = Omit<
  RealtimePayload<"new_message">,
  "card" | "catalogOrder" | "referral"
> & {
  card?: ConversationListRow;
  catalogOrder?: InboxMessageDto["catalogOrder"];
  referral?: InboxMessageDto["referral"];
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

  let conv = findCachedConversationRow(qc, data.conversationId);
  if (!conv && data.card?.id) {
    conv = findCachedConversationRow(qc, data.card.id);
  }
  // Inbound/outbound num ticket já encerrado: o card visível é o OPEN
  // do mesmo contato+canal. Sem isto o SSE prepende o encerrado em Todas.
  if (conv && isClosedInboxRow(conv)) {
    const live = findOpenInboxGroupSibling(qc, data.card ?? conv);
    if (live) conv = live;
    else return { found: true, tabMoved: false, fromTab: null, toTab: null };
  }
  if (!conv) return { found: false, tabMoved: false, fromTab: null, toTab: null };

  const prevTab = inboxQueueTabFor(conv);
  // Evento atrasado (mais antigo que o card): conta a não lida, mas não
  // pinta uma mensagem velha na prévia. Mesmo segundo passa — o
  // WhatsApp manda timestamp em segundos e a chegada é a melhor ordem.
  const stale =
    conv.lastMessageAt != null &&
    Date.parse(ts) < Date.parse(conv.lastMessageAt);
  if (stale) {
    if (direction === "in") {
      applyConversationRowToInboxCaches(qc, {
        ...conv,
        unreadCount: (conv.unreadCount ?? 0) + 1,
      });
    }
    return { found: true, tabMoved: false, fromTab: prevTab, toTab: prevTab };
  }
  const next: ConversationListRow = {
    ...conv,
    lastMessageAt: ts,
    updatedAt: ts,
    ...(direction ? { lastMessageDirection: direction } : {}),
    ...(direction === "in"
      ? {
          lastInboundAt: ts,
          unreadCount: (conv.unreadCount ?? 0) + 1,
          // Texto do card = última mensagem do cliente. `hidden` chega
          // sem texto (redigido no servidor): não apaga a prévia.
          ...(data.cardOmitted === "hidden"
            ? {}
            : {
                lastInboundPreview: {
                  content,
                  messageType: data.messageType || "text",
                  createdAt: ts,
                },
              }),
        }
      : {}),
    ...(data.card
      ? {
          hasHumanReply: data.card.hasHumanReply ?? conv.hasHumanReply,
          hasAgentReply: data.card.hasAgentReply ?? conv.hasAgentReply,
          hasActiveAutomation:
            data.card.hasActiveAutomation ?? conv.hasActiveAutomation,
        }
      : direction === "out"
        ? { hasAgentReply: true }
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

function activeInboxListTabs(qc: QueryClient): InboxTab[] {
  const tabs = new Set<InboxTab>();
  for (const q of qc.getQueryCache().findAll({ queryKey: ["inbox-conversations"] })) {
    if (!q.isActive() || q.state.data == null) continue;
    for (const t of inboxTabsFromQueryKey(q.queryKey)) tabs.add(t);
  }
  return [...tabs];
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

/**
 * `cardOmitted: "hidden"`: o servidor avisa que ESTE usuário não lista mais a
 * conversa (transferida a outro, fora do escopo). Sai das listas e dos
 * badges; o cache da conversa individual recebe os campos novos — o chat que
 * continua aberto (e o diálogo "Transferir conversa") lê o responsável certo.
 */
function removeHiddenConversation(
  qc: QueryClient,
  payload: ConversationUpdatedPayload,
): void {
  const id = payload.conversationId;
  if (!id) return;
  const existing = findCachedConversationRow(qc, id);
  if (!existing) return;
  const next = overlayConversationUpdated(qc, existing, payload);
  removeConversationFromInboxCaches(qc, id);
  qc.setQueryData(["inbox-conversation", next.id], next);
  if (next.number != null) {
    qc.setQueryData(["inbox-conversation", String(next.number)], next);
  }
}

/** Teto do `GET ?ids=` (`getConversationsByIds`). Acima disso, refresh
 *  (1ª página) das listas que já mostram os ids (ex.: assign em massa). */
const CARD_SYNC_BURST_LIMIT = 80;

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

const MISSING_HYDRATE_DEBOUNCE_MS = 2_000;
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

/** `conversation_updated` — contrato em `@/lib/realtime-contract`. */
type ConversationUpdatedPayload = RealtimePayload<"conversation_updated">;

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

/** Snapshot `card` (bus) or a full row at the envelope root (legacy). */
function conversationRowFromSsePayload(raw: unknown): ConversationListRow | null {
  if (!raw || typeof raw !== "object") return null;
  const nested = (raw as { card?: unknown }).card;
  if (nested && typeof nested === "object") {
    return conversationRowFromUpdatedEvent(nested);
  }
  return conversationRowFromUpdatedEvent(raw);
}

/** GET :id só para o ticket ABERTO (CUID ou número da URL). */
function eventTouchesOpenConversation(
  qc: QueryClient,
  eventConversationId: string,
  activeId: string | null,
  eventCard?: ConversationListRow | null,
  eventContactId?: string | null,
  /**
   * Aceita só o contato como prova de que o evento é do thread aberto. O
   * servidor não manda `card` de conversa que este usuário não pode listar,
   * então sem isso a mensagem que cai num ticket irmão do mesmo contato não
   * tem como ser reconhecida e o chat aberto para de atualizar. Vale apenas
   * para refazer o thread já aberto (que passou pelo controle de acesso) —
   * não use em caminhos que buscam a conversa do evento.
   */
  allowContactOnlyMatch = false,
): boolean {
  if (!activeId) return false;
  if (eventConversationId === activeId) return true;
  const open = findCachedConversationRow(qc, activeId);
  if (!open) return false;
  if (conversationMatchesId(open, eventConversationId)) return true;
  const eventRow = eventCard ?? findCachedConversationRow(qc, eventConversationId);
  if (eventRow) {
    if (conversationMatchesId(eventRow, activeId)) return true;
    // 1 card / contato+plataforma: o SSE pode ser do ticket irmão (outra WABA).
    if (sameInboxCardGroup(open, eventRow)) return true;
  }
  const contactId = eventContactId || eventCard?.contact?.id;
  if (
    open.contact?.id &&
    contactId &&
    open.contact.id === contactId &&
    eventCard?.channel &&
    sameInboxCardGroup(open, eventCard)
  ) {
    return true;
  }
  if (
    allowContactOnlyMatch &&
    !eventCard &&
    open.contact?.id &&
    contactId &&
    open.contact.id === contactId
  ) {
    return true;
  }
  return false;
}

function sseMessageAlreadyInThread(
  messages: InboxMessageDto[],
  stub: InboxMessageDto,
): InboxMessageDto | null {
  const stubTs = Date.parse(stub.createdAt);
  return (
    messages.find((m) => {
      if (String(m.id) === stub.id) return true;
      if (!(stub.content ?? "").trim()) return false;
      if (m.direction !== stub.direction) return false;
      if ((m.content ?? "") !== (stub.content ?? "")) return false;
      if (!m.createdAt || !Number.isFinite(stubTs)) return true;
      const dt = Math.abs(Date.parse(m.createdAt) - stubTs);
      return !Number.isFinite(dt) || dt < 8_000;
    }) ?? null
  );
}

/**
 * O que o `new_message` fez na conversa aberta:
 *  - `stub`: bolha nova (stub `sse:`) — precisa do GET para id/mídia;
 *  - `real`: a mensagem já está lá com o id real (eco do envio do agente);
 *  - `none`: nada a pintar (timeline, sem direção, cache vazio) — só o GET.
 */
type OpenChatAppend =
  | { kind: "stub"; stubId: string }
  | { kind: "real" }
  | { kind: "none" };

/** Bolha imediata no chat aberto — mesmo payload que já patcha o card. */
function appendSseMessageToOpenChat(
  qc: QueryClient,
  activeId: string,
  data: NewMessagePayload,
): OpenChatAppend {
  if (isEventMessageType(data.messageType)) return { kind: "none" };
  const direction =
    data.direction === "in" || data.direction === "out" ? data.direction : null;
  if (!direction) return { kind: "none" };
  const ts =
    typeof data.timestamp === "string" && data.timestamp
      ? data.timestamp
      : new Date().toISOString();
  const content = typeof data.content === "string" ? data.content : "";
  const senderName =
    typeof data.senderName === "string" && data.senderName.trim()
      ? data.senderName.trim()
      : null;
  const stub: InboxMessageDto = {
    id: `sse:${data.conversationId ?? activeId}:${ts}:${content.slice(0, 80)}`,
    conversationId: data.conversationId ?? activeId,
    direction,
    content,
    messageType: data.messageType || "text",
    createdAt: ts,
    senderName,
    channelId: data.card?.channelId ?? null,
    catalogOrder:
      data.catalogOrder && Array.isArray(data.catalogOrder.items)
        ? data.catalogOrder
        : undefined,
    referral: normalizeAdReferral(data.referral) ?? null,
  };
  let outcome: OpenChatAppend = { kind: "none" };
  qc.setQueryData<MessagesResponse>(messagesKey(activeId), (old) => {
    if (!old?.messages) return old;
    const present = sseMessageAlreadyInThread(old.messages, stub);
    if (present) {
      const presentId = String(present.id);
      outcome = isSseMessageStubId(presentId)
        ? { kind: "stub", stubId: presentId }
        : { kind: "real" };
      return old;
    }
    outcome = { kind: "stub", stubId: stub.id };
    return {
      ...old,
      messages: [...old.messages, stub],
      session:
        direction === "in"
          ? {
              active: true,
              lastInboundAt: ts,
              expiresAt: old.session?.expiresAt ?? null,
            }
          : old.session,
    };
  });
  return outcome;
}

/**
 * Cliente volta a falar depois do encerramento: `findOrCreateConversation`
 * (webhook) só reusa conversa ativa, então o inbound abre um ticket NOVO.
 * O chat continuava no ticket encerrado — que nunca mais recebe mensagem —
 * enquanto o card, que é um por contato+canal, já exibia a prévia nova.
 * Troca o chat para o ticket novo pelo mesmo caminho do reopen por envio
 * do agente. Retorna true quando assumiu o evento.
 */
function followInboundToNewTicket(
  qc: QueryClient,
  openId: string,
  data: NewMessagePayload,
): boolean {
  const newId = data.conversationId;
  if (!newId || newId === openId) return false;
  if (isEventMessageType(data.messageType)) return false;
  const open = findCachedConversationRow(qc, openId);
  if (!open || !isClosedInboxRow(open)) return false;
  const incoming = data.card ?? findCachedConversationRow(qc, newId);
  if (incoming) {
    if (isClosedInboxRow(incoming)) return false;
    if (!sameInboxCardGroup(open, incoming)) return false;
  } else {
    const contactId = data.contactId ?? null;
    if (!open.contact?.id || !contactId || open.contact.id !== contactId) {
      return false;
    }
  }
  emitConversationReopened(newId);
  return true;
}

function shouldGetConversationOnUpdated(
  qc: QueryClient,
  conversationId: string,
  activeId: string | null,
): boolean {
  return eventTouchesOpenConversation(qc, conversationId, activeId);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function hasPatchableUpdatedFields(payload: ConversationUpdatedPayload): boolean {
  return (
    payload.assignedToId !== undefined ||
    typeof payload.status === "string" ||
    payload.closedAt !== undefined ||
    payload.followUpAt !== undefined ||
    payload.departmentId !== undefined ||
    typeof payload.unreadCount === "number" ||
    typeof payload.lastMessageAt === "string" ||
    isRecord(payload.lastMessagePreview) ||
    typeof payload.whatsappCallConsentStatus === "string"
  );
}

/**
 * Responsável do evento: o objeto do payload (com nome, backend novo) manda;
 * sem nome, só reaproveita o que já se sabe do MESMO usuário (cache da conversa
 * ou equipe). Usuário diferente sem nome → `null`: manter o objeto anterior
 * pintava o card com o nome de quem não atende mais — o card "no meu nome" que
 * dá 404 no clique.
 */
function assignedToFromEvent(
  qc: QueryClient,
  payload: ConversationUpdatedPayload,
  existing: ConversationListRow,
): ConversationListRow["assignedTo"] {
  const nextId = payload.assignedToId ?? null;
  if (nextId == null) return null;
  const fromEvent = payload.assignedTo;
  const sameUser = nextId === existing.assignedToId ? existing.assignedTo : null;
  const name =
    (typeof fromEvent?.name === "string" && fromEvent.name.trim()
      ? fromEvent.name
      : null) ??
    sameUser?.name ??
    findTeamUserById(qc, nextId)?.name ??
    null;
  if (name == null) {
    if (!sameUser) return null;
    return {
      ...sameUser,
      type: fromEvent?.type ?? sameUser.type,
    };
  }
  const team = findTeamUserById(qc, nextId);
  return {
    ...(sameUser ?? {}),
    id: nextId,
    name,
    type: fromEvent?.type ?? sameUser?.type ?? team?.type ?? "HUMAN",
    ...(fromEvent?.avatarUrl !== undefined
      ? { avatarUrl: fromEvent.avatarUrl }
      : team?.avatarUrl !== undefined && !sameUser
        ? { avatarUrl: team.avatarUrl }
        : {}),
  };
}

/**
 * Sobrepõe ao `base` os campos que o evento traz (só vêm os que mudaram).
 * Sem `base` no cache não há o que sobrepor — quem chama decide.
 */
function overlayConversationUpdated(
  qc: QueryClient,
  base: ConversationListRow,
  payload: ConversationUpdatedPayload,
): ConversationListRow {
  const next: ConversationListRow = { ...base };
  if (payload.assignedToId !== undefined) {
    next.assignedToId = payload.assignedToId ?? null;
    next.assignedTo = assignedToFromEvent(qc, payload, base);
  }
  if (payload.departmentId !== undefined) {
    next.departmentId = payload.departmentId ?? null;
    if (next.department && next.department.id !== next.departmentId) {
      next.department = null;
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
  if (typeof payload.unreadCount === "number") {
    next.unreadCount = Math.max(0, payload.unreadCount);
  }
  if (typeof payload.lastMessageAt === "string") {
    next.lastMessageAt = payload.lastMessageAt;
  }
  if (isRecord(payload.lastMessagePreview)) {
    const p = payload.lastMessagePreview;
    const content = typeof p.content === "string" ? p.content : "";
    const direction =
      typeof p.direction === "string" && p.direction
        ? p.direction
        : (base.lastMessagePreview?.direction ?? "");
    next.lastMessagePreview = {
      content,
      messageType: typeof p.messageType === "string" ? p.messageType : "",
      mediaUrl: typeof p.mediaUrl === "string" ? p.mediaUrl : null,
      direction,
      sendStatus: base.lastMessagePreview?.sendStatus ?? null,
      sendError: base.lastMessagePreview?.sendError ?? null,
    };
    if (direction === "in" || direction === "out") {
      next.lastMessageDirection = direction;
    }
    if (base.lastMessage) {
      next.lastMessage = {
        ...base.lastMessage,
        preview: content,
        direction:
          direction === "in" || direction === "out"
            ? direction
            : base.lastMessage.direction,
      };
    }
    if (direction === "in") {
      next.lastInboundPreview = {
        content,
        messageType: typeof p.messageType === "string" && p.messageType ? p.messageType : "text",
        createdAt: next.lastMessageAt ?? new Date().toISOString(),
      };
    }
  }
  if (typeof payload.whatsappCallConsentStatus === "string") {
    next.whatsappCallConsentStatus = payload.whatsappCallConsentStatus;
  }
  return next;
}

/**
 * Mescla os campos do evento no card cacheado (todas as páginas/abas) e
 * reavalia a aba. Zero GET quando dá para decidir localmente:
 *  - a aba é por status/fila, não por dono: quem só vê as próprias
 *    (`rowHiddenFromViewer`) perde a conversa transferida na hora;
 *  - escopo do usuário desconhecido (permissões ainda sem resposta): o card
 *    pode ter ficado invisível — 1 refetch (1ª página) só das listas que o
 *    contêm, como antes. Quem tem visibilidade ampla recebe o card de volta.
 */
function applyConversationUpdatedPatch(
  qc: QueryClient,
  payload: ConversationUpdatedPayload,
  currentUserId: string | null,
): boolean {
  const id = payload.conversationId;
  if (!id || !hasPatchableUpdatedFields(payload)) return false;
  const existing = findCachedConversationRow(qc, id);
  if (!existing) return false;
  const next = overlayConversationUpdated(qc, existing, payload);
  const scope = getInboxViewerScope(qc);
  const movedToAnotherUser =
    next.assignedToId != null &&
    next.assignedToId !== existing.assignedToId &&
    next.assignedToId !== currentUserId;
  applyConversationRowToInboxCaches(qc, next);
  if (movedToAnotherUser && (scope == null || scope.ownOnly == null)) {
    invalidateInboxQueriesTouching(qc, [id]);
  }
  return true;
}

function isConversationNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return /não encontrada|sem permissão|not found/i.test(msg);
}

/** Erro de abertura de conversa que prova que o card não é deste usuário. */
export function isInboxConversationDeniedError(err: unknown): boolean {
  return isConversationNotFoundError(err);
}

/**
 * Card que o servidor recusa (404/sem permissão): tira da lista e bloqueia
 * re-hidratação por ~60s. Sem isto o card fantasma volta no próximo SSE.
 */
export function purgePhantomInboxConversation(
  qc: QueryClient,
  conversationId: string,
): void {
  rememberConversation404(conversationId);
  removeConversationFromInboxCaches(qc, conversationId);
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
    void refreshInboxLists(qc, { queryKey, exact: true });
  }
  if (!anyHit) {
    void refreshInboxLists(qc, { queryKey: ["inbox-conversations", "entrada"] });
  }
}

/**
 * Substitui / remove / prepend o card nas páginas já cacheadas.
 * Sem search/filtros de servidor, um ticket novo entra no topo da aba
 * certa. Com filtro opaco, invalida só aquela query — nunca a inbox toda.
 * Também remove irmãos do mesmo contato+canal (órfã SSE sem channelId
 * vs ticket já listado) para não duplicar o card.
 */
function applyConversationRowToInboxCaches(
  qc: QueryClient,
  row: ConversationListRow,
): void {
  const prev = findCachedConversationRow(qc, row.id);
  const fromTab = prev ? inboxQueueTabFor(prev) : null;
  const toTab = inboxQueueTabFor(row);
  const mergedRow = prev ? mergeInboxCardRow(prev, row) : row;

  qc.setQueryData(["inbox-conversation", mergedRow.id], mergedRow);
  if (mergedRow.number != null) {
    const prevByNum = qc.getQueryData<ConversationListRow>([
      "inbox-conversation",
      String(mergedRow.number),
    ]);
    qc.setQueryData(
      ["inbox-conversation", String(mergedRow.number)],
      prevByNum ? mergeInboxCardRow(prevByNum, mergedRow) : mergedRow,
    );
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
          conversationMatchesId(c, mergedRow.id) ||
          (mergedRow.number != null &&
            conversationMatchesId(c, String(mergedRow.number))),
      );
      if (idx < 0) return page;
      found = true;
      const nextItems = items.slice();
      nextItems[idx] = mergeInboxCardRow(items[idx]!, mergedRow);
      return { ...page, items: nextItems };
    });

    const belongs =
      rowFitsCachedQuery(mergedRow, tabs, found) &&
      !rowKnownToMissFilters(mergedRow, inboxFiltersFromQueryKey(queryKey)) &&
      !rowHiddenFromViewer(mergedRow, getInboxViewerScope(qc));

    if (found && belongs) {
      let siblingRemoved = 0;
      const pages = pagesAfterPatch.map((page) => {
        const items = page?.items;
        if (!items?.length) return page;
        const nextItems = items.filter((c) => {
          if (
            conversationMatchesId(c, mergedRow.id) ||
            (mergedRow.number != null &&
              conversationMatchesId(c, String(mergedRow.number)))
          ) {
            return true;
          }
          if (sameInboxCardGroup(c, mergedRow)) {
            siblingRemoved += 1;
            return false;
          }
          return true;
        });
        if (nextItems.length === items.length) return page;
        return { ...page, items: nextItems };
      });
      qc.setQueryData(queryKey, {
        ...cached,
        pages:
          siblingRemoved > 0
            ? bumpPageTotals(pages, -siblingRemoved)
            : pages,
      });
      continue;
    }

    if (found && !belongs) {
      const pages = pagesAfterPatch.map((page) => {
        const items = page?.items;
        if (!items?.length) return page;
        const nextItems = items.filter(
          (c) =>
            !conversationMatchesId(c, mergedRow.id) &&
            !(
              mergedRow.number != null &&
              conversationMatchesId(c, String(mergedRow.number))
            ),
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

    if (!found && belongs && canSafelyPrependToQuery(mergedRow, queryKey)) {
      // Não prepende ticket encerrado em "todos" — pode estar sem permissão.
      // O card só entra via refetch após validação do servidor (GET ?ids=).
      if (isClosedInboxRow(mergedRow) && tabs.some((t) => t === "todos")) {
        continue;
      }
      let siblingRemoved = 0;
      const pages = cached.pages.map((page, pageIdx) => {
        const items = page?.items ?? [];
        const rest = items.filter((c) => {
          if (sameInboxCardGroup(c, mergedRow)) {
            siblingRemoved += 1;
            return false;
          }
          return true;
        });
        if (pageIdx === 0) {
          return { ...page, items: [mergedRow, ...rest] };
        }
        return rest.length === items.length ? page : { ...page, items: rest };
      });
      qc.setQueryData(queryKey, {
        ...cached,
        pages: bumpPageTotals(pages, 1 - siblingRemoved),
      });
      continue;
    }

    if (!found && belongs) {
      // Filtro opaco: não dá para saber onde o card entra. 1ª página da
      // lista, com debounce (uma rajada de eventos = 1 GET), não todas.
      scheduleInboxListRefresh(qc, queryKey);
    }
  }

  // Só ±1 quando o card já estava no cache e a fila canônica mudou.
  // Card novo/fora da página já entra no último GET ?counts=1.
  if (prev && rowHiddenFromViewer(mergedRow, getInboxViewerScope(qc))) {
    // Saiu do escopo do usuário (transferida a outro): some dos badges também.
    if (!rowHiddenFromViewer(prev, getInboxViewerScope(qc))) {
      patchInboxTabCounts(qc, fromTab, null);
    }
  } else if (prev && tabMoved(fromTab, toTab)) {
    patchInboxTabCounts(qc, fromTab, toTab);
  }
}

export function useInboxRealtime(options: {
  activeConversationId: string | null;
  /** Usuário logado — decide o patch do card e a aba (bip: `InboxMessageAlerts`). */
  currentUserId?: string | null;
  enabled?: boolean;
  /**
   * Mensagem RECEBIDA (`direction: "in"`) na conversa aberta. O host marca
   * como lida (`POST /read` → contador zerado e visto azul na Meta): abrir a
   * conversa só marca quando há não lidas, então é este aviso que cobre a
   * mensagem que chega com ela já aberta. Chamado depois do patch do card
   * (o `unreadCount` em cache já conta a mensagem).
   */
  onOpenConversationInbound?: (conversationId: string) => void;
}) {
  const { activeConversationId, currentUserId = null, enabled = true } = options;
  const qc = useQueryClient();
  const activeRef = useRef(activeConversationId);
  activeRef.current = activeConversationId;
  const userIdRef = useRef(currentUserId);
  userIdRef.current = currentUserId;
  const onOpenInboundRef = useRef(options.onOpenConversationInbound);
  onOpenInboundRef.current = options.onOpenConversationInbound;
  const { registerActiveConversation } = useMessageToast();

  useEffect(() => {
    if (!activeConversationId) return;
    return registerActiveConversation(activeConversationId);
  }, [registerActiveConversation, activeConversationId]);

  const dailyStatsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCardSyncIdsRef = useRef<Set<string>>(new Set());
  const inFlightCardSyncIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    function refetchInboxAfterSseGap() {
      // Só a 1ª página das listas montadas — refazer todas as páginas
      // (× K filas) em cada reconexão era a rajada do N-FE-1.
      void refreshInboxLists(qc);
      qc.invalidateQueries({
        queryKey: ["conversations", "tab-counts"],
        refetchType: "active",
      });
      // O gap são ~5s cegos (use-sse.ts) e o stream não tem replay. Sem
      // isto a lista e o preview se curam aqui, mas a thread aberta só no
      // poll de 90s — é a mensagem que aparece no card e não na conversa.
      // Conversas em cache (fechadas) também podem ter perdido mensagens
      // no gap: marcadas como velhas, buscam ao reabrir (com a SSE
      // conectada o `useMessages` não tem poll nem prazo curto).
      qc.invalidateQueries({ queryKey: ["messages"], refetchType: "none" });
      const openId = activeRef.current;
      if (openId) {
        qc.refetchQueries({ queryKey: messagesKey(openId) });
      }
      // O banner de agendados só faz poll com o SSE fora; o que mudou
      // durante o gap (`scheduled_message_updated` perdido) entra aqui: a
      // aberta busca agora, as outras em cache ficam velhas para o reabrir.
      qc.invalidateQueries({
        queryKey: ["scheduled-messages"],
        refetchType: "active",
      });
    }

    // Chips do painel do dia (P1-8): o poll longo (3min) é safety-net; a
    // atualização perceptível vem daqui (debounce 5s, independente dos counts).
    function scheduleDailyStatsRefresh() {
      if (dailyStatsTimerRef.current) return;
      const observed = qc
        .getQueryCache()
        .findAll({ queryKey: ["inbox", "daily-stats"], type: "active" });
      if (observed.length === 0) return;
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

    /**
     * Mudança de uma conversa (status, responsável, departamento, não lidas,
     * prévia). Tudo local sempre que o evento basta; rede só quando não dá:
     *  - `card` (snapshot do barramento, já filtrado pela visibilidade deste
     *    usuário) → insere/atualiza em todas as abas, sem GET;
     *  - `cardOmitted: "hidden"` → o servidor diz que o usuário não lista mais
     *    a conversa: sai das listas, sem GET;
     *  - sem card: patch dos campos do evento no card em cache;
     *  - nada em cache: GET :id só da aberta; GET ?ids= (debounce) só se a aba
     *    puder mostrar.
     * Os 4 s após abrir/marcar lida (`shouldSuppressInboxListRefresh`) só
     * cortam a REDE — o patch local continua.
     */
    function onConversationChanged(raw: unknown) {
      let payload: ConversationUpdatedPayload = (raw ?? {}) as ConversationUpdatedPayload;
      const id = payload.conversationId;
      // Conversa aberta: o usuário está lendo (o host marca como lida a cada
      // mensagem recebida). Um não lido do evento — ou do card —, que pode ser
      // anterior à leitura, não ressuscita o contador do item.
      const reading = Boolean(
        id && eventTouchesOpenConversation(qc, id, activeRef.current),
      );
      if (reading && typeof payload.unreadCount === "number" && payload.unreadCount > 0) {
        payload = { ...payload, unreadCount: undefined };
      }
      const network = !shouldSuppressInboxListRefresh(id ?? activeRef.current);
      if (!id) {
        // Sem conversationId não dá pra patchar o card nem o badge.
        if (network) scheduleDailyStatsRefresh();
        return;
      }
      if (isCachedConversation404(id)) {
        if (!eventTouchesOpenConversation(qc, id, activeRef.current)) {
          removeConversationFromInboxCaches(qc, id);
        }
        scheduleDailyStatsRefresh();
        return;
      }
      try {
        const card = conversationRowFromSsePayload(raw);
        if (card) {
          const row = overlayConversationUpdated(qc, card, payload);
          if (reading) {
            row.unreadCount = findCachedConversationRow(qc, id)?.unreadCount ?? 0;
          }
          applyConversationRowToInboxCaches(qc, row);
        } else if (payload.cardOmitted === "hidden") {
          removeHiddenConversation(qc, payload);
        } else if (applyConversationUpdatedPatch(qc, payload, userIdRef.current)) {
          // Card + badges ±1 sem GET :id / counts=1.
        } else if (!network) {
          // Logo após abrir/marcar lida: não busca nada.
        } else if (shouldGetConversationOnUpdated(qc, id, activeRef.current)) {
          scheduleConversationCardSync(id);
        } else if (
          !findCachedConversationRow(qc, id) &&
          // Atribuída a outro agente que este usuário não lista: o GET ?ids=
          // voltaria vazio (e, a cada transferência da org, N usuários buscando).
          !rowHiddenFromViewer(
            {
              assignedToId: payload.assignedToId ?? null,
              assignedTo: payload.assignedTo
                ? { id: payload.assignedTo.id ?? "", name: "", type: payload.assignedTo.type }
                : null,
            },
            getInboxViewerScope(qc),
          ) &&
          conversationUpdatedLikelyOnTabs(activeInboxListTabs(qc), payload)
        ) {
          scheduleMissingCardHydrate(qc, id);
        }
      } catch (e) {
        logger.error("sse", "conversation_updated list patch failed", e);
      }
      scheduleDailyStatsRefresh();
    }

    // `realtimeHandlers`: nome de evento fora do contrato não compila e
    // cada handler recebe o payload tipado (todo campo opcional).
    const unsubscribe = subscribeSSEEvents(
      "/api/sse/messages",
      realtimeHandlers({
      new_message: (raw) => {
        const data = raw as NewMessagePayload;
        // Atualização do chat aberto: isola da lista para que um erro
        // no merge do thread não quebre o preview do card.
        try {
          if (data.conversationId) {
            if (data.direction === "in") {
              // Janela 24h é por canal; o composer lê `channel-session`
              // (staleTime, sem focus refetch). Sem isto o banner fica
              // "encerrada" depois da resposta do cliente.
              qc.invalidateQueries({
                queryKey: ["channel-session", data.conversationId],
              });
            }
            const openId = activeRef.current;
            const followedNewTicket = Boolean(
              openId && followInboundToNewTicket(qc, openId, data),
            );
            const touchesOpen =
              !followedNewTicket &&
              openId &&
              eventTouchesOpenConversation(
                qc,
                data.conversationId,
                openId,
                data.card,
                data.contactId,
                true,
              );
            if (touchesOpen) {
              // `hidden` chega sem texto/mídia: a bolha sai só do GET.
              let appended: ReturnType<typeof appendSseMessageToOpenChat> = {
                kind: "none",
              };
              if (data.cardOmitted !== "hidden") {
                try {
                  appended = appendSseMessageToOpenChat(qc, openId, data);
                } catch (e) {
                  logger.error("sse", "appendSseMessageToOpenChat failed", e);
                }
              }
              // Hidrata id/mídia com UM GET por rajada (`thread-hydrate.ts`).
              // Eco do envio do próprio agente (bolha real já no cache, gravada
              // pela resposta do POST): nenhum GET.
              if (appended.kind === "stub") {
                scheduleThreadHydrate(qc, openId, { stubId: appended.stubId });
              } else if (appended.kind === "none") {
                scheduleThreadHydrate(qc, openId, { force: true });
              }
              if (openId !== data.conversationId) {
                qc.invalidateQueries({
                  queryKey: messagesKey(data.conversationId),
                  refetchType: "none",
                });
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
        } catch (e) {
          logger.error("sse", "new_message chat update failed", e);
        }

        // Card na lista: patch in-place, zero GET. Fora da página:
        // snapshot `card` entra no cache sem GET. Sem snapshot,
        // GET ?ids= só se o evento puder cair na query ativa.
        try {
          const patch = patchInboxConversationCard(qc, data);
          if (patch.found) {
            // Preview in-place; badges ±1 se tabMoved. Sem GET counts/lista.
          } else if (isEventMessageType(data.messageType)) {
            // Timeline fora da 1ª página: não relista nem re-agrega.
          } else if (data.conversationId) {
            const snapshot = conversationRowFromSsePayload(raw);
            if (snapshot && isClosedInboxRow(snapshot)) {
              const live = findOpenInboxGroupSibling(qc, snapshot);
              if (live) {
                applyConversationRowToInboxCaches(qc, {
                  ...live,
                  lastMessageAt: snapshot.lastMessageAt ?? live.lastMessageAt,
                  lastMessagePreview:
                    snapshot.lastMessagePreview ?? live.lastMessagePreview,
                  lastMessageDirection:
                    snapshot.lastMessageDirection ?? live.lastMessageDirection,
                });
              }
            } else if (
              snapshot &&
              !isClosedInboxRow(snapshot) &&
              newMessageLikelyOnTabs(
                activeInboxListTabs(qc),
                {
                  direction: snapshot.lastMessageDirection ?? data.direction,
                  assignedToId: snapshot.assignedToId ?? data.assignedToId,
                },
                userIdRef.current,
              )
            ) {
              applyConversationRowToInboxCaches(qc, snapshot);
            } else if (
              // `hidden`: o servidor já disse que este usuário não lista a
              // conversa — o GET ?ids= voltaria vazio.
              data.cardOmitted !== "hidden" &&
              newMessageLikelyOnTabs(activeInboxListTabs(qc), data, userIdRef.current)
            ) {
              scheduleMissingCardHydrate(qc, data.conversationId);
            }
          }
          if (!isEventMessageType(data.messageType)) {
            scheduleDailyStatsRefresh();
          }
        } catch (e) {
          logger.error("sse", "new_message card patch failed", e);
        }

        // Recebida na conversa aberta: o host marca como lida.
        if (
          data.direction === "in" &&
          data.conversationId &&
          data.conversationId === activeRef.current &&
          !isEventMessageType(data.messageType)
        ) {
          try {
            onOpenInboundRef.current?.(data.conversationId);
          } catch (e) {
            logger.error("sse", "onOpenConversationInbound failed", e);
          }
        }
      },

      // Tick da bolha: patch no cache de qualquer conversa, nunca GET
      // (F1). `failed` grava o motivo que o evento traz; só sem motivo a
      // conversa ABERTA busca (o GET traduz o erro da Meta).
      message_status: (data) => {
        try {
          if (!data.conversationId || !data.messageId || !data.status) return;
          const statusLc = data.status.toLowerCase();
          const mapped = ({
            pending: "PENDING",
            sent: "SENT",
            delivered: "DELIVERED",
            read: "READ",
            failed: "FAILED",
          } as Record<string, string>)[statusLc];
          if (mapped) {
            const bubbleId = data.messageId;
            const internalId = data.internalId;
            const error =
              statusLc === "failed" && typeof data.error === "string" && data.error.trim()
                ? data.error
                : null;
            qc.setQueryData<MessagesResponse>(
              messagesKey(data.conversationId),
              (old) => {
                if (!old?.messages) return old;
                let touched = false;
                const messages = old.messages.map((m) => {
                  const byInternal = internalId != null && m.id === internalId;
                  if (m.id !== bubbleId && !byInternal) return m;
                  touched = true;
                  return {
                    ...m,
                    // Envio que entrou no cache pelo id interno (resposta
                    // `pending`/fila) passa a usar o id da bolha, o mesmo
                    // que o GET devolve — o merge não duplica a mensagem.
                    ...(byInternal && bubbleId !== internalId ? { id: bubbleId } : {}),
                    status: mapped as InboxMessageDto["status"],
                    sendStatus: statusLc,
                    ...(error ? { sendError: error } : {}),
                  };
                });
                return touched ? { ...old, messages } : old;
              },
            );
            if (
              statusLc === "failed" &&
              !error &&
              data.conversationId === activeRef.current
            ) {
              scheduleThreadHydrate(qc, data.conversationId, { force: true });
            }
          }
          // Leitura (ticks azuis): atualiza timeline do deal e feed /logs.
          if (statusLc === "read") {
            qc.invalidateQueries({ queryKey: ["deal-timeline-v2"] });
            qc.invalidateQueries({ queryKey: ["deal-timeline"] });
            qc.invalidateQueries({ queryKey: ["activity-feed"] });
            qc.invalidateQueries({ queryKey: ["activity-feed-stats"] });
          }
          // Delivery receipts não mudam a lista/counts — só ticks na bolha.
          // Evita cold-load storm quando o SSE despeja message_status em lote.
        } catch {
          /* ignore */
        }
      },

      // Rascunho da IA aprovado (`message_updated`) ou descartado
      // (`message_deleted`) por outro agente: sem eles o cache só mudava no
      // poll, que agora não roda com a SSE conectada. Descartado sai do
      // cache na hora; aprovado vira mensagem enviada — a aberta busca, as
      // outras ficam velhas para o próximo abrir.
      message_deleted: (data) => {
        try {
          if (!data.conversationId || !data.messageId) return;
          const gone = data.messageId;
          qc.setQueryData<MessagesResponse>(messagesKey(data.conversationId), (old) => {
            if (!old?.messages?.some((m) => m.id === gone)) return old;
            return { ...old, messages: old.messages.filter((m) => m.id !== gone) };
          });
        } catch {
          /* ignore */
        }
      },

      message_updated: (data) => {
        try {
          if (!data.conversationId) return;
          if (data.conversationId === activeRef.current) {
            scheduleThreadHydrate(qc, data.conversationId, { force: true });
          } else {
            qc.invalidateQueries({
              queryKey: messagesKey(data.conversationId),
              refetchType: "none",
            });
          }
        } catch {
          /* ignore */
        }
      },

      // `conversation_assigned`/`unassigned` (transferência da IA) têm o mesmo
      // formato do que importa aqui (`conversationId` + `assignedToId`).
      conversation_updated: (raw) => onConversationChanged(raw),
      conversation_assigned: (raw) => onConversationChanged(raw),
      conversation_unassigned: (raw) =>
        onConversationChanged({ ...(raw ?? {}), assignedToId: null }),

      // Timeline (chatter) da conversa — encerramento/reabertura empurrados
      // pelo backend. Invalida ["conversation-timeline", id] p/ o
      // ConversationTimelineTab exibir o evento na hora, mesmo quando a
      // acao veio de outro agente/automacao (sem mutation local).
      conversation_timeline_updated: (data) => {
        try {
          if (data.conversationId) {
            qc.invalidateQueries({
              queryKey: ["conversation-timeline", data.conversationId],
            });
          }
        } catch {
          /* ignore */
        }
      },

      contact_updated: (data) => {
        try {
          if (data.contactId) {
            qc.invalidateQueries({ queryKey: ["contact-sidebar", data.contactId] });
          }
        } catch {
          /* ignore */
        }
      },

      whatsapp_call: (data) => {
        try {
          if (data.conversationId && data.conversationId === activeRef.current) {
            qc.invalidateQueries({ queryKey: messagesKey(activeRef.current) });
          }
        } catch {
          /* ignore */
        }
      },

      // `presence_update` (status de qualquer agente, inclusive o meu) é só
      // patch em `useSystemPresenceSync`: o evento já traz o status — sem
      // GET de confirmação (R3-FE-9, F2).

      // Agendamento criado/cancelado/enviado/falhou na conversa — o banner
      // (`useScheduledMessages`) refaz o GET só se a conversa está aberta
      // em alguma aba desta página (query ativa); o poll de 60s vira
      // fallback para quando o SSE está desconectado.
      scheduled_message_updated: (data) => {
        const id = data?.conversationId;
        if (!id) return;
        qc.invalidateQueries({
          queryKey: scheduledMessagesKey(id),
          refetchType: "active",
        });
      },

      // Ciclo de vida de automações (robô iniciou/avançou/terminou) —
      // atualiza o chip "robô em execução" do chat aberto. O evento traz
      // contactId (contexto não referencia conversa), então invalidamos a
      // query da conversa ativa; se o contato não for o mesmo, o refetch
      // é barato e o resultado idêntico.
      automation_state: (data) => {
        // Invalida o botão "Robôs ativos" (por contato) do evento e,
        // por compat, o chip antigo (por conversa ativa).
        try {
          if (data.contactId) {
            const active =
              data.active ??
              (data.status === "RUNNING" || data.status === "PAUSED");
            scheduleActiveAutomationQueue(
              qc,
              data.contactId,
              active,
              data.createdAt,
            );
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
      }),
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
