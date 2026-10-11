"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useSSE } from "@/hooks/use-sse";
import { isEventMessageType } from "@/components/crm/chat-timeline";
import type { BoardDealDto, BoardStageDto } from "@/features/pipeline-v2/api";
import { foldActivityOntoDeal } from "@/features/pipeline-v2/board-live-activity";
import { messageActivityTimestamp } from "@/lib/message-activity-sort";
import { dealHiddenFromViewer, getInboxViewerScope } from "@/features/inbox-v2/inbox-viewer-scope";
import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";
import {
  readBoardScope,
  type BoardScope,
  type RealtimeEventName,
  type RealtimePayload,
} from "@/lib/realtime-contract";

/** Só o que o handler trata — `conversation_updated` etc. não chegam aqui. */
const PIPELINE_SSE_EVENTS: readonly RealtimeEventName[] = [
  "new_message",
  "message_status",
  "deal_moved",
];

/** Não entra no preview/ordem do card (igual ao SQL do board). */
const NON_CHAT_MESSAGE_TYPES = new Set([
  "note",
  "ai_draft",
  "ai_summary",
  "whatsapp_call",
  "whatsapp_call_recording",
]);

function skipsBoardPreview(messageType: string | null | undefined): boolean {
  if (!messageType) return false;
  if (isEventMessageType(messageType)) return true;
  const mt = messageType.toLowerCase();
  return NON_CHAT_MESSAGE_TYPES.has(mt) || mt.startsWith("event");
}

/** Cobre `pipeline-board`, `pipeline-board-search` e `pipeline-board-filtered`. */
function isBoardQueryKey(key: readonly unknown[]): boolean {
  const root = key[0];
  return typeof root === "string" && root.startsWith("pipeline-board");
}

/**
 * Board paginado do GET (`["pipeline-board", ...]`).
 * O POST filtrado/busca não entra: é pesado e a lista já está restrita.
 * Invalidar esses caches a cada mensagem de quem não está no filtro
 * deixava o Flow em refresh contínuo.
 */
function isPagedBoardQueryKey(key: readonly unknown[]): boolean {
  return key[0] === "pipeline-board";
}

/** Board filtrado (POST com critérios) — `["pipeline-board-filtered", ...]`. */
function isFilteredBoardQueryKey(key: readonly unknown[]): boolean {
  return key[0] === "pipeline-board-filtered";
}

/** `["pipeline-board*", pipelineId, status, ...]` — as três variantes. */
function boardPipelineId(key: readonly unknown[]): string | null {
  const id = key[1];
  return typeof id === "string" && id ? id : null;
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

function normalizeStatus(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toLowerCase();
  return s in STATUS_RANK ? s : null;
}

/**
 * Atualiza `lastMessage.sendStatus` nos boards em cache quando o ack da
 * Meta/Baileys chega. Sem isto o card fica preso em ✓ (sent): invalidar
 * o board refetcharia o cache-aside de 45s ainda com o status antigo.
 */
function patchBoardLastMessageStatus(
  qc: QueryClient,
  ids: { messageId?: string; internalId?: string },
  status: string,
  sendError?: string | null,
) {
  const nextStatus = normalizeStatus(status);
  if (!nextStatus) return;
  if (!ids.messageId && !ids.internalId) return;

  const boards = qc.getQueriesData<BoardStageDto[]>({
    predicate: (q) => isBoardQueryKey(q.queryKey),
  });

  for (const [queryKey, data] of boards) {
    if (!Array.isArray(data)) continue;
    let touched = false;
    const next = data.map((stage) => {
      let stageTouched = false;
      const deals = stage.deals.map((deal) => {
        const lm = deal.lastMessage;
        if (!lm || String(lm.direction).toLowerCase() !== "out") return deal;
        const hit =
          (ids.internalId != null && lm.id === ids.internalId) ||
          (ids.messageId != null &&
            (lm.id === ids.messageId || lm.externalId === ids.messageId));
        if (!hit) return deal;

        const current = normalizeStatus(lm.sendStatus) ?? "pending";
        // failed sempre sobrescreve; demais só avançam (sent→delivered→read).
        if (
          nextStatus !== "failed" &&
          current !== "failed" &&
          (STATUS_RANK[nextStatus] ?? 0) <= (STATUS_RANK[current] ?? 0)
        ) {
          return deal;
        }

        stageTouched = true;
        touched = true;
        return {
          ...deal,
          lastMessage: {
            ...lm,
            sendStatus: nextStatus,
            sendError:
              nextStatus === "failed"
                ? (sendError ?? lm.sendError ?? null)
                : null,
          },
        };
      });
      return stageTouched ? { ...stage, deals } : stage;
    });
    if (touched) qc.setQueryData(queryKey, next);
  }
}

/**
 * Conversa aberta (chat do negócio, Flow): zera as não lidas dos cards do
 * contato em todos os boards em cache. O POST /read já zera no servidor,
 * mas o board vem de cache-aside e o card ficava com o contador.
 */
export function clearBoardUnreadForContact(qc: QueryClient, contactId: string) {
  const boards = qc.getQueriesData<BoardStageDto[]>({
    predicate: (q) => isBoardQueryKey(q.queryKey),
  });
  for (const [queryKey, data] of boards) {
    if (!Array.isArray(data)) continue;
    let touched = false;
    const next = data.map((stage) => {
      let stageTouched = false;
      const deals = stage.deals.map((deal) => {
        if (deal.contact?.id !== contactId || !deal.unreadCount) return deal;
        stageTouched = true;
        touched = true;
        return { ...deal, unreadCount: 0 };
      });
      return stageTouched ? { ...stage, deals } : stage;
    });
    if (touched) qc.setQueryData(queryKey, next);
  }
}

/**
 * Patch in-place do `lastMessage`/preview do card no board (P0-2): um
 * `new_message` atualiza o card do contato afetado em vez de invalidar
 * o board inteiro (887KB) a cada evento da org. Casa o deal pelo
 * `contact.id` (o payload SSE não traz dealId).
 *
 * Retorna true quando o contato está em algum board cacheado. Quem não
 * está na página não é inserido aqui — o caller dispara um refetch
 * debounced para a janela "mais recentes" passar a incluí-lo.
 */
export function patchBoardLastMessage(
  qc: QueryClient,
  data: BoardMessagePatch,
): boolean {
  return patchBoardMessage(qc, data, null).found;
}

type BoardMessagePatch = {
  contactId?: string | null;
  direction?: string;
  content?: string | null;
  timestamp?: string;
  cardOmitted?: string;
};

/**
 * Núcleo do patch. Com `scope` (evento trouxe `dealIds`), o card também
 * casa pelo id do negócio. Devolve se algum card em cache casou e as
 * chaves dos boards em que nenhum card casou.
 */
function patchBoardMessage(
  qc: QueryClient,
  data: BoardMessagePatch,
  scope: BoardScope | null,
): { found: boolean; missed: (readonly unknown[])[] } {
  const contactId = data.contactId || undefined;
  const dealIds = scope?.dealIds?.length ? new Set(scope.dealIds) : null;
  if (!contactId && !dealIds) return { found: false, missed: [] };
  const direction =
    data.direction === "in" || data.direction === "out" ? data.direction : null;
  const ts =
    typeof data.timestamp === "string" && data.timestamp
      ? data.timestamp
      : new Date().toISOString();
  // Evento redigido (sem texto): não apaga a prévia do card.
  const content =
    typeof data.content === "string"
      ? data.content
      : data.cardOmitted
        ? null
        : "";

  const boards = qc.getQueriesData<BoardStageDto[]>({
    predicate: (q) => isBoardQueryKey(q.queryKey),
  });

  let found = false;
  const missed: (readonly unknown[])[] = [];
  for (const [queryKey, data_] of boards) {
    if (!Array.isArray(data_)) continue;
    const spec = boardSortSpec(queryKey);
    let touched = false;
    let matched = false;
    const next = data_.map((stage) => {
      let stageTouched = false;
      const changedIds = new Set<string>();
      const deals = stage.deals.map((deal) => {
        const folded = foldActivityOntoDeal(deal, {
          contactId,
          dealIds,
          direction,
          content,
          timestamp: ts,
        });
        if (!folded.matched) return deal;
        found = true;
        matched = true;
        if (!folded.changed) return deal;
        stageTouched = true;
        touched = true;
        changedIds.add(deal.id);
        return folded.deal;
      });
      if (!stageTouched) return stage;
      // Board ordenado por última interação: o card que recebeu a mensagem
      // muda de lugar na coluna (no servidor ele já mudou) — sem GET.
      const ordered =
        spec.field === "lastInteraction"
          ? reorderByActivity(deals, changedIds, spec.direction)
          : deals;
      return { ...stage, deals: ordered };
    });
    if (touched) qc.setQueryData(queryKey, next);
    if (!matched) missed.push(queryKey);
  }
  return { found, missed };
}

/**
 * Reposiciona na coluna os cards de `movedIds` pela última interação
 * (`lastMessage.createdAt`); os demais mantêm a ordem que vieram do
 * servidor. `desc` = mais recente no topo; `asc` = mais recente no fim da
 * parte carregada da coluna.
 */
function reorderByActivity(
  deals: BoardDealDto[],
  movedIds: ReadonlySet<string>,
  direction: "asc" | "desc",
): BoardDealDto[] {
  if (movedIds.size === 0) return deals;
  const rest = deals.filter((deal) => !movedIds.has(deal.id));
  const moved = deals.filter((deal) => movedIds.has(deal.id));
  const ts = (deal: BoardDealDto) => messageActivityTimestamp(deal.lastMessage?.createdAt);
  for (const deal of moved) {
    const at = ts(deal);
    let index = rest.findIndex((other) =>
      direction === "desc" ? at > ts(other) : at < ts(other),
    );
    if (index === -1) index = rest.length;
    rest.splice(index, 0, deal);
  }
  return rest;
}

/**
 * O que um evento pede ao board, além do patch in-place:
 * - `null`: nada a refazer;
 * - `"all"`: refazer todo board em cache do agendador (evento sem escopo —
 *   backend antigo — e card fora da página, ou sem `contactId`);
 * - lista de funis: refazer só o board desses funis.
 */
export type BoardRefreshRequest = null | "all" | string[];

/**
 * Board paginado ordenado por "mais recentes" (`lastInteraction:desc`) — o
 * Flow e o Kanban "mais recentes". Nele, quem recebe mensagem vai para o
 * topo da coluna no servidor, mesmo estando além da página carregada.
 */
function isRecentActivityPagedBoard(key: readonly unknown[]): boolean {
  if (!isPagedBoardQueryKey(key)) return false;
  const spec = boardSortSpec(key);
  return spec.field === "lastInteraction" && spec.direction === "desc";
}

/**
 * Aplica um `new_message` nos boards em cache e diz o que precisa ser
 * refeito. Puro em relação ao React: só lê/escreve no `QueryClient`.
 *
 * Com escopo (`pipelineIds`/`dealIds` no evento): patch dos cards do
 * contato/negócios do evento que já estão em cache. Recarga só quando o
 * card do escopo não está num board PAGINADO ordenado por "mais recentes"
 * (`lastInteraction:desc`) de um funil do escopo: ali o negócio sobe para o
 * topo da coluna no servidor e só entra na página refazendo o board (sai
 * pelo agendador: piso de `BOARD_REFRESH_MIN_INTERVAL_MS` por funil e nada
 * com a aba oculta). Nas outras ordenações e nos boards filtrado/busca o
 * card fora do cache continua sem recarga: além da página ele não muda de
 * lugar na janela, e fora do filtro não deve aparecer; negócio novo chega
 * pelo `deal_moved` de criação.
 * Sem escopo (backend antigo): comportamento anterior.
 */
export function applyBoardNewMessage(
  qc: QueryClient,
  payload: RealtimePayload<"new_message">,
): BoardRefreshRequest {
  if (skipsBoardPreview(payload.messageType)) return null;

  const scope = readBoardScope(payload);
  if (scope) {
    const { missed } = patchBoardMessage(qc, payload, scope);
    const inScope = new Set(scope.pipelineIds);
    const refresh = new Set<string>();
    for (const key of missed) {
      if (!isRecentActivityPagedBoard(key)) continue;
      const pipelineId = boardPipelineId(key);
      if (pipelineId && inScope.has(pipelineId)) refresh.add(pipelineId);
    }
    return refresh.size > 0 ? [...refresh] : null;
  }

  // Payload sem contactId (legado): fallback à invalidação debounced do
  // board — não dá pra localizar o card.
  if (!payload.contactId) return "all";
  // Card fora da página carregada: um refetch debounced traz o lead para
  // a janela (mais recentes primeiro). Quem já está na fila só recebe o
  // patch — sem o GET do board inteiro.
  return patchBoardMessage(qc, payload, null).found ? null : "all";
}

/** Atraso do refetch do board depois de um `new_message` fora da página. */
export const BOARD_REFRESH_DEBOUNCE_MS = 800;

/**
 * Intervalo mínimo entre dois refetches do board do MESMO funil causados
 * por eventos: `new_message` SEM escopo (backend antigo) e, com escopo, o
 * card fora da página num board "mais recentes". O evento não traz o card
 * do negócio (etapa, posição), então card fora da página carregada só entra
 * refazendo o board; sem teto, um funil movimentado refazia o board a cada
 * mensagem. Com 10 s, numa organização movimentada toda aba visível
 * recarregava o board a cada 10 s.
 */
export const BOARD_REFRESH_MIN_INTERVAL_MS = 30_000;

/** Pedido sem escopo (`"all"`): refaz todo board paginado em cache. */
const ALL_BOARDS = "*";

function documentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/**
 * Invalidação do board paginado pedida por eventos, coalescida:
 * - junta os pedidos da janela (`delayMs`): vários funis viram uma
 *   invalidação por funil; um pedido `"all"` cobre todos;
 * - no máximo um refetch a cada `minIntervalMs` por funil — o que chega no
 *   intervalo fica pendente e sai quando ele fecha (o primeiro pedido de um
 *   funil parado continua saindo em `delayMs`);
 * - com a aba oculta não refaz nada: o pendente sai quando a aba volta.
 *
 * Não inclui o POST filtrado/busca: quem não está no filtro não pode refazer
 * essa query (no Flow a tela ficava em refresh o tempo todo).
 */
export function createBoardRefreshScheduler(
  qc: QueryClient,
  delayMs = BOARD_REFRESH_DEBOUNCE_MS,
  minIntervalMs = BOARD_REFRESH_MIN_INTERVAL_MS,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Funis (ou `ALL_BOARDS`) à espera de refetch. */
  const pending = new Set<string>();
  /** Último refetch por funil (e de `ALL_BOARDS`), em ms. */
  const lastRun = new Map<string, number>();
  let waitingVisible = false;

  /** Quando `key` pode ser refeito de novo. */
  function dueAt(key: string): number {
    const lastAll = lastRun.get(ALL_BOARDS);
    let last = lastAll;
    if (key === ALL_BOARDS) {
      // "Todos" inclui cada funil: respeita o refetch mais recente de qualquer um.
      for (const at of lastRun.values()) last = last == null ? at : Math.max(last, at);
    } else {
      const own = lastRun.get(key);
      if (own != null) last = last == null ? own : Math.max(last, own);
    }
    return last == null ? 0 : last + minIntervalMs;
  }

  function onVisibility() {
    if (!documentVisible()) return;
    stopWaitingVisible();
    arm();
  }

  function stopWaitingVisible() {
    if (!waitingVisible) return;
    waitingVisible = false;
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function arm() {
    if (timer || pending.size === 0) return;
    if (!documentVisible()) {
      if (!waitingVisible) {
        waitingVisible = true;
        document.addEventListener("visibilitychange", onVisibility);
      }
      return;
    }
    const now = Date.now();
    let earliest = Infinity;
    for (const key of pending) earliest = Math.min(earliest, dueAt(key));
    timer = setTimeout(flush, Math.max(delayMs, earliest - now));
  }

  function flush() {
    timer = null;
    if (!documentVisible()) {
      arm();
      return;
    }
    const now = Date.now();
    const ready = new Set<string>();
    for (const key of pending) {
      if (dueAt(key) <= now) ready.add(key);
    }
    if (ready.size > 0) {
      const all = ready.has(ALL_BOARDS);
      if (all) {
        pending.clear();
        lastRun.set(ALL_BOARDS, now);
      } else {
        for (const key of ready) {
          pending.delete(key);
          lastRun.set(key, now);
        }
      }
      qc.invalidateQueries({
        predicate: (q) => {
          if (!isPagedBoardQueryKey(q.queryKey)) return false;
          if (all) return true;
          const pipelineId = boardPipelineId(q.queryKey);
          return pipelineId != null && ready.has(pipelineId);
        },
      });
    }
    arm();
  }

  return {
    schedule(request: BoardRefreshRequest) {
      if (!request) return;
      if (request === "all") pending.add(ALL_BOARDS);
      else for (const id of request) pending.add(id);
      arm();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
      stopWaitingVisible();
    },
  };
}

type BoardSortSpec = { field: "position" | "createdAt" | "lastInteraction"; direction: "asc" | "desc" };

function boardSortSpec(key: readonly unknown[]): BoardSortSpec {
  const root = key[0];
  const raw = root === "pipeline-board" ? key[3] : key[4];
  if (typeof raw !== "string" || raw === "default" || !raw.includes(":")) {
    return { field: "position", direction: "asc" };
  }
  const [field, direction] = raw.split(":");
  const dir = direction === "desc" ? "desc" : "asc";
  if (field === "createdAt" || field === "lastInteraction") return { field, direction: dir };
  return { field: "position", direction: dir };
}

function boardAcceptsStatus(key: readonly unknown[], status: string | undefined): boolean {
  const filter = key[2];
  if (typeof filter !== "string" || filter === "ALL" || !status) return true;
  return filter === status;
}

function sortValue(deal: BoardDealDto, field: BoardSortSpec["field"]): string | number {
  if (field === "createdAt") return deal.createdAt ?? "";
  if (field === "lastInteraction") return deal.lastMessage?.createdAt ?? deal.updatedAt ?? "";
  return deal.position;
}

function comesBefore(a: BoardDealDto, b: BoardDealDto, spec: BoardSortSpec): boolean {
  const av = sortValue(a, spec.field);
  const bv = sortValue(b, spec.field);
  if (av !== bv) return spec.direction === "desc" ? av > bv : av < bv;
  if (a.position !== b.position) return a.position < b.position;
  return a.id < b.id;
}

function insertionIndex(deals: BoardDealDto[], deal: BoardDealDto, spec: BoardSortSpec): number {
  for (let i = 0; i < deals.length; i++) {
    if (comesBefore(deal, deals[i]!, spec)) return i;
  }
  return deals.length;
}

function isDealCard(value: unknown): value is Partial<BoardDealDto> & { id: string; title: string } {
  if (!value || typeof value !== "object") return false;
  const row = value as { id?: unknown; title?: unknown };
  return typeof row.id === "string" && row.id.length > 0 && typeof row.title === "string" && row.title.length > 0;
}

/** `card.number` do evento; ausente/nulo (backend antigo) = sem número. */
function cardNumber(card: { number?: unknown } | null): number | undefined {
  const value = card?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dealFromCard(
  card: Partial<BoardDealDto> & { id: string; title: string },
  position: number,
  updatedAt: string,
): BoardDealDto {
  return {
    id: card.id,
    number: cardNumber(card),
    title: card.title,
    value: card.value ?? 0,
    status: card.status ?? "OPEN",
    lostReason: card.lostReason ?? null,
    position,
    expectedClose: card.expectedClose ?? null,
    createdAt: card.createdAt ?? updatedAt,
    updatedAt: updatedAt || card.updatedAt || card.createdAt || "",
    isRotting: card.isRotting ?? false,
    contact: card.contact ?? null,
    owner: card.owner ?? null,
    lastMessage: null,
    unreadCount: card.unreadCount ?? 0,
    tags: card.tags,
    priority: card.priority,
    channel: card.channel ?? null,
    productName: card.productName ?? null,
    productType: card.productType ?? null,
  };
}

function movedDeal(
  existing: BoardDealDto | null,
  card: (Partial<BoardDealDto> & { id: string; title: string }) | null,
  position: number,
  updatedAt: string,
): BoardDealDto | null {
  if (existing) {
    return {
      ...existing,
      number: existing.number ?? cardNumber(card),
      position,
      updatedAt: updatedAt || existing.updatedAt,
      status: card?.status ?? existing.status,
      lostReason: card && "lostReason" in card ? (card.lostReason ?? null) : existing.lostReason,
    };
  }
  if (!card) return null;
  return dealFromCard(card, position, updatedAt);
}

function shiftCounts(stage: BoardStageDto, delta: number): BoardStageDto {
  return {
    ...stage,
    totalCount:
      typeof stage.totalCount === "number" ? Math.max(0, stage.totalCount + delta) : stage.totalCount,
    loadedCount:
      typeof stage.loadedCount === "number"
        ? Math.max(0, stage.loadedCount + delta)
        : stage.loadedCount,
  };
}

/**
 * Tira o deal de qualquer coluna e, se `deal` vier preenchido, coloca na
 * etapa destino. Coluna que não contém o deal e não é o destino devolve
 * a mesma referência.
 */
function relocateDeal(
  stages: BoardStageDto[],
  dealId: string,
  toStageId: string,
  deal: BoardDealDto | null,
  spec: BoardSortSpec,
): BoardStageDto[] {
  let changed = false;
  const stripped = stages.map((stage) => {
    if (!stage.deals.some((item) => item.id === dealId)) return stage;
    changed = true;
    const deals = stage.deals.filter((item) => item.id !== dealId);
    return { ...shiftCounts(stage, deals.length - stage.deals.length), deals };
  });
  if (!deal) return changed ? stripped : stages;

  const toIdx = stripped.findIndex((stage) => stage.id === toStageId);
  if (toIdx === -1) return changed ? stripped : stages;

  const stage = stripped[toIdx]!;
  const at = insertionIndex(stage.deals, deal, spec);
  const deals = stage.deals.slice();
  deals.splice(at, 0, deal);
  const next = stripped.slice();
  next[toIdx] = { ...shiftCounts(stage, 1), deals };
  return next;
}

function samePlacement(before: BoardStageDto[], after: BoardStageDto[]): boolean {
  if (before === after) return true;
  if (before.length !== after.length) return false;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    const a = before[i]!;
    const b = after[i]!;
    if (a.totalCount !== b.totalCount || a.loadedCount !== b.loadedCount) return false;
    if (a.deals.length !== b.deals.length) return false;
    for (let j = 0; j < a.deals.length; j++) {
      const left = a.deals[j]!;
      const right = b.deals[j]!;
      if (
        left.id !== right.id ||
        left.position !== right.position ||
        left.updatedAt !== right.updatedAt ||
        left.status !== right.status
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * `deal_moved` de negócio criado: sem etapa de origem (`fromStageId` nulo
 * ou ausente) ou com `created: true`. Backend antigo sempre manda a origem.
 */
function isDealCreatedEvent(payload: RealtimePayload<"deal_moved">): boolean {
  return payload.created === true || payload.fromStageId == null;
}

/**
 * Critérios do filtro avançado que o cliente confere com o card do
 * `deal_moved` de criação. `showAllStages` é só UI; `valueFrom`/`valueTo` a
 * tela aplica sobre o board já carregado; `logic` só vale para campos
 * personalizados (que não estão aqui).
 */
const CARD_CHECKABLE_FILTERS: ReadonlySet<string> = new Set<keyof AdvancedDealFilters>([
  "pipelineId",
  "stageIds",
  "statuses",
  "ownerIds",
  "withoutOwner",
  "tagIds",
  "tagMode",
  "withoutTags",
  "logic",
  "showAllStages",
  "valueFrom",
  "valueTo",
]);

/** O que o evento de criação diz do negócio. `undefined` = não informado. */
type CreatedDealFacts = {
  pipelineId: string;
  stageId: string;
  status: string | undefined;
  ownerId: string | null | undefined;
  tagIds: string[] | undefined;
};

function createdDealFacts(
  payload: RealtimePayload<"deal_moved">,
  card: Partial<BoardDealDto>,
  pipelineId: string,
  stageId: string,
): CreatedDealFacts {
  let ownerId: string | null | undefined;
  if (payload.ownerId !== undefined) ownerId = payload.ownerId;
  else if (card.owner !== undefined) ownerId = card.owner?.id ?? null;
  return {
    pipelineId,
    stageId,
    status: typeof card.status === "string" ? card.status : undefined,
    ownerId,
    tagIds: Array.isArray(card.tags) ? card.tags.map((tag) => tag.id) : undefined,
  };
}

function nonEmptyList(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length > 0 ? value : null;
}

/**
 * O board FILTRADO (`["pipeline-board-filtered", pid, status, filtros, ...]`)
 * aceita o negócio criado? Só quando o filtro canônico (`key[3]`) tem apenas
 * critérios que o card do evento permite conferir (funil, etapa, status,
 * responsável, tags) e o card casa com todos. Busca por texto, campos
 * personalizados, origem, direção da mensagem, datas etc.: o cliente não
 * sabe — `false`. Dado ausente no evento (sem `ownerId`/`tags`) também.
 * Espelha `buildDealWhereFromFilters` do backend (critérios em AND).
 */
function filteredBoardAcceptsCreated(
  key: readonly unknown[],
  facts: CreatedDealFacts,
): boolean {
  const raw = key[3];
  if (typeof raw !== "string") return false;
  let filters: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    filters = parsed as Record<string, unknown>;
  } catch {
    return false;
  }
  if (Object.keys(filters).some((name) => !CARD_CHECKABLE_FILTERS.has(name))) return false;

  if (filters.pipelineId != null && filters.pipelineId !== facts.pipelineId) return false;

  const stageIds = nonEmptyList(filters.stageIds);
  if (stageIds && !stageIds.includes(facts.stageId)) return false;

  const statuses = nonEmptyList(filters.statuses);
  if (statuses && (facts.status === undefined || !statuses.includes(facts.status))) return false;

  const ownerIds = nonEmptyList(filters.ownerIds);
  if (filters.withoutOwner === true) {
    if (facts.ownerId !== null) return false;
  } else if (ownerIds) {
    if (facts.ownerId === undefined || !ownerIds.includes(facts.ownerId)) return false;
  }

  const tagIds = nonEmptyList(filters.tagIds);
  if (filters.withoutTags === true) {
    if (!facts.tagIds || facts.tagIds.length > 0) return false;
  } else if (tagIds) {
    const cardTags = facts.tagIds;
    if (!cardTags) return false;
    const has = (id: unknown) => typeof id === "string" && cardTags.includes(id);
    const mode = filters.tagMode ?? "any";
    if (mode === "any") {
      if (!tagIds.some(has)) return false;
    } else if (mode === "all") {
      if (!tagIds.every(has)) return false;
    } else if (mode === "none") {
      if (tagIds.some(has)) return false;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Aplica `deal_moved` nos boards já em cache. Não cria query, não invalida
 * e não refaz o GET: remove da origem, insere no destino pela `position`
 * (ou pelo sort daquela cache). Idempotente — evento repetido ou o eco do
 * otimista local não duplica o card.
 *
 * Negócio criado (`isDealCreatedEvent`, com `card`, ainda fora de qualquer
 * cache): entra no board paginado do funil destino como um move (o chip de
 * total da etapa sobe junto). No board FILTRADO desse funil só entra quando
 * o filtro tem apenas critérios que o card permite conferir (responsável,
 * etapa, status, tags) e o card casa (`filteredBoardAcceptsCreated`) — sem
 * recarga. Com qualquer outro critério (busca, campos personalizados,
 * origem, direção da mensagem…) não entra nem agenda recarga: aparece na
 * próxima ação/recarga do usuário.
 *
 * Devolve false quando nada foi escrito (evento incompleto, atrasado,
 * board fora do escopo ou já no lugar).
 */
export function applyDealMoved(
  qc: QueryClient,
  payload: RealtimePayload<"deal_moved">,
): boolean {
  const dealId = payload.dealId;
  const toStageId = payload.toStageId;
  const toPipelineId = payload.toPipelineId;
  if (!dealId || !toStageId || !toPipelineId) return false;
  if (typeof payload.position !== "number" || !Number.isFinite(payload.position)) return false;
  const position = payload.position;
  const updatedAt = typeof payload.updatedAt === "string" ? payload.updatedAt : "";
  const fromPipelineId = payload.fromPipelineId ?? null;

  const boards = qc.getQueriesData<BoardStageDto[]>({
    predicate: (q) => isBoardQueryKey(q.queryKey),
  });

  let existing: BoardDealDto | null = null;
  let newest = "";
  for (const [, data] of boards) {
    if (!Array.isArray(data)) continue;
    for (const stage of data) {
      const found = stage.deals.find((deal) => deal.id === dealId);
      if (!found) continue;
      const stamp = found.updatedAt ?? "";
      if (!existing || stamp >= newest) {
        existing = found;
        newest = stamp;
      }
    }
  }
  if (updatedAt && newest && newest > updatedAt) return false;

  // Quem só vê os próprios negócios e o evento diz que o dono é outro: o card
  // sai de onde estiver e NÃO entra no destino (o evento vai para a org toda).
  const hidden = dealHiddenFromViewer(payload.ownerId, getInboxViewerScope(qc));

  const card = isDealCard(payload.card) && payload.card.id === dealId ? payload.card : null;
  const deal = hidden ? null : movedDeal(existing, card, position, updatedAt);
  const affected = new Set(
    [fromPipelineId, toPipelineId].filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  // Negócio novo que nenhum board em cache tem ainda.
  const created = !existing && !!card && isDealCreatedEvent(payload);
  const facts = created && card ? createdDealFacts(payload, card, toPipelineId, toStageId) : null;

  let wrote = false;
  for (const [queryKey, data] of boards) {
    if (!Array.isArray(data)) continue;
    const pipelineId = boardPipelineId(queryKey);
    const contains = data.some((stage) => stage.deals.some((item) => item.id === dealId));
    const inScope = pipelineId != null && affected.has(pipelineId);
    // Busca/filtro só se o card já está nessa cache. Inserir aqui mostraria
    // um negócio que não bate no critério. O board paginado é quem recebe
    // o card que entrou de outro funil. Exceção: negócio criado entra no
    // filtrado do funil destino quando o filtro só tem critérios que o card
    // permite conferir e ele casa — sem recarga. Os demais filtros (busca
    // por texto inclusa) não recebem o card novo.
    const paged = queryKey[0] === "pipeline-board";
    const filteredCreate =
      !!facts &&
      inScope &&
      pipelineId === toPipelineId &&
      isFilteredBoardQueryKey(queryKey) &&
      filteredBoardAcceptsCreated(queryKey, facts);
    if (!contains && !(paged && inScope) && !filteredCreate) continue;

    const accepts = boardAcceptsStatus(queryKey, deal?.status);
    const next = relocateDeal(
      data,
      dealId,
      toStageId,
      accepts ? deal : null,
      boardSortSpec(queryKey),
    );
    if (samePlacement(data, next)) continue;
    qc.setQueryData(queryKey, next);
    wrote = true;
  }
  return wrote;
}

/**
 * Mantém os cards do Kanban/Flow em dia sem esperar o polling de 30s.
 *
 * O board carrega `lastMessage`, que define o rodapé "aguardando resposta"
 * e os ticks enviado/entregue/lido no `DealCard`.
 *
 * - `new_message` → patch in-place do card (a fila do Flow reordena).
 *   Com `pipelineIds`/`dealIds` no evento: patch dos cards em cache; card
 *   fora da página só refaz o board paginado "mais recentes" do funil (o
 *   Flow, o Kanban "mais recentes"). Sem esses campos (backend antigo):
 *   contato fora da página dispara um refetch do board paginado. Ver
 *   `applyBoardNewMessage`.
 *   O refetch é coalescido: no máximo um a cada
 *   `BOARD_REFRESH_MIN_INTERVAL_MS` por funil e só com a aba visível
 *   (`createBoardRefreshScheduler`).
 * - `conversation_updated` → ignora (ticket assign/status/consent não
 *   muda estágio do deal; poll 60s + mutations locais cobrem o board).
 * - `message_status` → patch otimista do `sendStatus` (ticks), sem
 *   recompute do board.
 * - `deal_moved` → tira o card da etapa de origem e coloca na de destino
 *   pela `position`, só nas caches daqueles funis. Sem `invalidateQueries`.
 *   Negócio criado (sem origem) entra pelo mesmo caminho; no board
 *   filtrado, só se o card casa com um filtro que o cliente confere.
 */
export function usePipelineRealtime(enabled = true) {
  const qc = useQueryClient();
  const refreshRef = useRef<ReturnType<typeof createBoardRefreshScheduler> | null>(
    null,
  );

  useEffect(() => {
    const scheduler = createBoardRefreshScheduler(qc);
    refreshRef.current = scheduler;
    return () => {
      scheduler.cancel();
      refreshRef.current = null;
    };
  }, [qc]);

  const handler = useCallback(
    (event: string, data: unknown) => {
      if (event === "message_status") {
        const payload = (data ?? {}) as RealtimePayload<"message_status">;
        if (payload.status) {
          patchBoardLastMessageStatus(
            qc,
            {
              messageId: payload.messageId,
              internalId: payload.internalId,
            },
            payload.status,
            payload.error ?? null,
          );
        }
        return;
      }

      if (event === "new_message") {
        const payload = (data ?? {}) as RealtimePayload<"new_message">;
        refreshRef.current?.schedule(applyBoardNewMessage(qc, payload));
        return;
      }

      if (event === "deal_moved") {
        applyDealMoved(qc, (data ?? {}) as RealtimePayload<"deal_moved">);
        return;
      }

      // conversation_updated: não refetcha o board (~900KB). Ticket
      // assign/resolve/consent não move deal de coluna.
    },
    [qc],
  );

  useSSE("/api/sse/messages", handler, enabled, PIPELINE_SSE_EVENTS);
}

/** Invalidação imediata do board — usar após ações locais (ex.: envio). */
export function invalidatePipelineBoards(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ predicate: (q) => isBoardQueryKey(q.queryKey) });
}

/**
 * Adia o refetch do kanban para depois do paint. No deal detail o
 * invalidate síncrono re-renderiza o board inteiro e atrasa stop/envio
 * de áudio (o inbox não monta o board, então não sente isso).
 */
export function schedulePipelineBoardInvalidation(
  qc: ReturnType<typeof useQueryClient>,
) {
  const run = () => invalidatePipelineBoards(qc);
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(run, { timeout: 1200 });
    return;
  }
  globalThis.setTimeout(run, 0);
}
