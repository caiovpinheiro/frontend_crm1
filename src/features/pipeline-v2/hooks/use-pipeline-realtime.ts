"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useSSE } from "@/hooks/use-sse";
import { isEventMessageType } from "@/components/crm/chat-timeline";
import type { BoardDealDto, BoardStageDto } from "@/features/pipeline-v2/api";
import { foldActivityOntoDeal } from "@/features/pipeline-v2/board-live-activity";
import { dealHiddenFromViewer, getInboxViewerScope } from "@/features/inbox-v2/inbox-viewer-scope";
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
 * casa pelo id do negócio. Devolve em quais funis algum card casou —
 * `usePipelineRealtime` usa isso para refazer só o board do funil em que
 * o card está fora da página carregada.
 */
function patchBoardMessage(
  qc: QueryClient,
  data: BoardMessagePatch,
  scope: BoardScope | null,
): { found: boolean; matchedPipelineIds: Set<string> } {
  const matchedPipelineIds = new Set<string>();
  const contactId = data.contactId || undefined;
  const dealIds = scope?.dealIds?.length ? new Set(scope.dealIds) : null;
  if (!contactId && !dealIds) return { found: false, matchedPipelineIds };
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
  for (const [queryKey, data_] of boards) {
    if (!Array.isArray(data_)) continue;
    let touched = false;
    const next = data_.map((stage) => {
      let stageTouched = false;
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
        const pipelineId = boardPipelineId(queryKey);
        if (pipelineId) matchedPipelineIds.add(pipelineId);
        if (!folded.changed) return deal;
        stageTouched = true;
        touched = true;
        return folded.deal;
      });
      return stageTouched ? { ...stage, deals } : stage;
    });
    if (touched) qc.setQueryData(queryKey, next);
  }
  return { found, matchedPipelineIds };
}

/**
 * O que um `new_message` pede ao board, além do patch in-place:
 * - `null`: nada a refazer;
 * - `"all"`: refazer todo board paginado em cache (evento sem escopo —
 *   backend antigo — e card fora da página, ou sem `contactId`);
 * - lista de funis: refazer só o board paginado desses funis.
 */
export type BoardRefreshRequest = null | "all" | string[];

/**
 * Aplica um `new_message` nos boards em cache e diz o que precisa ser
 * refeito. Puro em relação ao React: só lê/escreve no `QueryClient`.
 *
 * Com escopo (`pipelineIds`/`dealIds` no evento): mexe só nos cards do
 * contato/negócios do evento; funil fora de `pipelineIds` não é tocado
 * nem refeito; funil do escopo cujo card não está na página carregada é
 * refeito sozinho. Sem escopo: comportamento anterior.
 */
export function applyBoardNewMessage(
  qc: QueryClient,
  payload: RealtimePayload<"new_message">,
): BoardRefreshRequest {
  if (skipsBoardPreview(payload.messageType)) return null;

  const scope = readBoardScope(payload);
  if (scope) {
    const { matchedPipelineIds } = patchBoardMessage(qc, payload, scope);
    const missing = scope.pipelineIds.filter((id) => !matchedPipelineIds.has(id));
    return missing.length > 0 ? missing : null;
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
 * por eventos. O evento de mensagem não traz o card do negócio (etapa,
 * posição), então card fora da página carregada só entra refazendo o
 * board; sem teto, um funil movimentado refazia o board a cada mensagem
 * (uma por segundo = um GET por segundo).
 */
export const BOARD_REFRESH_MIN_INTERVAL_MS = 10_000;

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
 * Não inclui o POST filtrado/busca: quem não está no filtro não pode
 * refazer essa query (no Flow a tela ficava em refresh o tempo todo).
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

function dealFromCard(
  card: Partial<BoardDealDto> & { id: string; title: string },
  position: number,
  updatedAt: string,
): BoardDealDto {
  return {
    id: card.id,
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
 * Aplica `deal_moved` nos boards já em cache. Não cria query, não invalida
 * e não refaz o GET: remove da origem, insere no destino pela `position`
 * (ou pelo sort daquela cache). Idempotente — evento repetido ou o eco do
 * otimista local não duplica o card.
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

  let wrote = false;
  for (const [queryKey, data] of boards) {
    if (!Array.isArray(data)) continue;
    const pipelineId = boardPipelineId(queryKey);
    const contains = data.some((stage) => stage.deals.some((item) => item.id === dealId));
    const inScope = pipelineId != null && affected.has(pipelineId);
    // Busca/filtro só se o card já está nessa cache. Inserir aqui mostraria
    // um negócio que não bate no critério. O board paginado é quem recebe
    // o card que entrou de outro funil.
    const paged = queryKey[0] === "pipeline-board";
    if (!contains && !(paged && inScope)) continue;

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
 *   Com `pipelineIds`/`dealIds` no evento: só os cards e o funil
 *   afetados; funil que não está no evento não é tocado. Sem esses
 *   campos (backend antigo): contato fora da página dispara um refetch
 *   do board paginado. Ver `applyBoardNewMessage`. O refetch é coalescido:
 *   no máximo um a cada `BOARD_REFRESH_MIN_INTERVAL_MS` por funil e só com
 *   a aba visível (`createBoardRefreshScheduler`).
 * - `conversation_updated` → ignora (ticket assign/status/consent não
 *   muda estágio do deal; poll 60s + mutations locais cobrem o board).
 * - `message_status` → patch otimista do `sendStatus` (ticks), sem
 *   recompute do board.
 * - `deal_moved` → tira o card da etapa de origem e coloca na de destino
 *   pela `position`, só nas caches daqueles funis. Sem `invalidateQueries`.
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
