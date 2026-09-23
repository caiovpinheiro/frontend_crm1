import type { BoardStageDto } from "./api";
import { messageActivityTimestamp } from "@/lib/message-activity-sort";

type BoardDeal = BoardStageDto["deals"][number];

export type ActivityPreview = {
  contactId?: string;
  direction?: string | null;
  /**
   * `null` = evento sem texto (redigido no servidor: o usuário não lista
   * a conversa). Atualiza horário/ordem/não lidas e mantém a prévia.
   */
  content: string | null;
  timestamp: string;
};

function lastMessageContent(deal: BoardDeal): string {
  return deal.lastMessage?.content ?? "";
}

/**
 * Aplica uma mensagem (enviada ou recebida) no card. Timestamp mais antigo
 * ou o mesmo preview não alteram o deal — evita reorder duplicado e unread
 * contado duas vezes quando o SSE ecoa o envio otimista.
 */
export function foldActivityOntoDeal<T extends BoardDeal>(
  deal: T,
  data: ActivityPreview,
): { deal: T; matched: boolean; changed: boolean } {
  if (!data.contactId || deal.contact?.id !== data.contactId) {
    return { deal, matched: false, changed: false };
  }
  const direction =
    data.direction === "in" || data.direction === "out" ? data.direction : null;
  const content = data.content ?? lastMessageContent(deal);
  const hasText = data.content != null;
  const ts = data.timestamp;
  const lm = deal.lastMessage;
  const nextTs = messageActivityTimestamp(ts);
  const prevTs = messageActivityTimestamp(lm?.createdAt);
  if (lm && nextTs < prevTs) return { deal, matched: true, changed: false };
  const samePreview =
    !!lm &&
    nextTs === prevTs &&
    (lm.content ?? "") === content &&
    (direction == null || String(lm.direction ?? "").toLowerCase() === direction);
  if (samePreview) return { deal, matched: true, changed: false };
  return {
    matched: true,
    changed: true,
    deal: {
      ...deal,
      lastMessage: {
        ...(lm ?? {}),
        content,
        createdAt: ts,
        direction: direction ?? lm?.direction ?? "",
        sendStatus: direction === "out" ? "sent" : null,
        sendError: null,
      },
      // Texto do card = última mensagem do cliente.
      ...(direction === "in" && hasText
        ? { lastInboundMessage: { content, createdAt: ts } }
        : {}),
      awaitingMessages:
        direction === "in" && hasText
          ? [...(deal.awaitingMessages ?? []), { content, createdAt: ts }].slice(-5)
          : direction === "out"
            ? []
            : deal.awaitingMessages,
      unreadCount:
        direction === "in" ? (deal.unreadCount ?? 0) + 1 : deal.unreadCount,
    },
  };
}

/**
 * Quanto tempo um card que acabou de receber mensagem continua na fila
 * se o refetch do board (página por etapa) não o devolveu.
 */
const LIVE_RETAIN_MS = 15 * 60 * 1000;

/**
 * Conversa aberta no Flow. O refetch da ordenação não pode tirá-la da
 * fila: o chat e o patch de `new_message` dependem do card no cache.
 */
const pinnedDealIds = new Set<string>();

export function setBoardPinnedDealIds(ids: readonly string[]): void {
  pinnedDealIds.clear();
  for (const id of ids) {
    if (id) pinnedDealIds.add(id);
  }
}

type MergeOpts = {
  /** Flow/kanban em `lastInteraction`: não deixa o refetch apagar o card ao vivo. */
  retainOutliers?: boolean;
  now?: number;
};

/**
 * Refetch do board não pode desfazer um `new_message` mais novo que o
 * cache-aside. Com `retainOutliers`, o card que saiu da página (ex.:
 * "mais antigas primeiro" depois de uma resposta) permanece o bastante
 * para a fila reposicionar sem F5.
 */
export function mergeBoardKeepingLiveActivity(
  prev: BoardStageDto[] | undefined,
  next: BoardStageDto[],
  opts?: MergeOpts,
): BoardStageDto[] {
  if (!prev?.length) return next;

  const prevById = new Map<
    string,
    { deal: BoardStageDto["deals"][number]; stageId: string }
  >();
  for (const stage of prev) {
    for (const deal of stage.deals) {
      prevById.set(deal.id, { deal, stageId: stage.id });
    }
  }

  const nextIds = new Set<string>();
  for (const stage of next) {
    for (const deal of stage.deals) nextIds.add(deal.id);
  }

  let changed = false;
  const merged = next.map((stage) => {
    let stageChanged = false;
    const deals = stage.deals.map((deal) => {
      const old = prevById.get(deal.id)?.deal;
      if (!old) return deal;
      const oldTs = messageActivityTimestamp(old.lastMessage?.createdAt);
      const newTs = messageActivityTimestamp(deal.lastMessage?.createdAt);
      if (oldTs <= newTs) return deal;
      stageChanged = true;
      changed = true;
      return {
        ...deal,
        lastMessage: old.lastMessage,
        awaitingMessages: old.awaitingMessages,
        unreadCount: old.unreadCount,
      };
    });
    return stageChanged ? { ...stage, deals } : stage;
  });

  if (!opts?.retainOutliers) return changed ? merged : next;

  const now = opts.now ?? Date.now();
  const extrasByStage = new Map<string, BoardStageDto["deals"]>();
  for (const [id, { deal, stageId }] of prevById) {
    if (nextIds.has(id)) continue;
    const ts = messageActivityTimestamp(deal.lastMessage?.createdAt);
    const pinned = pinnedDealIds.has(id);
    if (!pinned && (ts <= 0 || now - ts > LIVE_RETAIN_MS)) continue;
    const list = extrasByStage.get(stageId) ?? [];
    list.push(deal);
    extrasByStage.set(stageId, list);
  }
  if (extrasByStage.size === 0) return changed ? merged : next;

  return merged.map((stage) => {
    const extras = extrasByStage.get(stage.id);
    if (!extras?.length) return stage;
    return { ...stage, deals: [...stage.deals, ...extras] };
  });
}
