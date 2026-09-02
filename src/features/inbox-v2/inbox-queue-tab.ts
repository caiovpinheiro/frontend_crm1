import type { ConversationListRow, InboxTab } from "./api";

function normalizeMessageDirection(
  raw: string | null | undefined,
): "in" | "out" | null {
  const v = String(raw ?? "").toLowerCase();
  if (v === "in" || v === "inbound") return "in";
  if (v === "out" || v === "outbound") return "out";
  return null;
}

function lastMessageDirection(row: ConversationListRow): "in" | "out" | null {
  // Coluna denormalizada = mesmo predicado do backend (`tabToWhere`).
  // Preview/lastMessage são fallback quando o card ainda não hidratou a coluna.
  return (
    normalizeMessageDirection(row.lastMessageDirection) ??
    normalizeMessageDirection(row.lastMessage?.direction) ??
    normalizeMessageDirection(row.lastMessagePreview?.direction)
  );
}

/**
 * Fila canônica da conversa (a mais específica). Usado ao abrir um hit
 * da busca para mudar a aba da inbox junto com o ticket.
 *
 * Encerradas = conversa de fato fechada (`RESOLVED` / `closedAt`). Deal
 * GANHO/PERDIDO com ticket ainda OPEN fica na aba que o status implica
 * (Aguardando, Entrada, …) — estágio do funil não fecha conversa.
 */
export function inboxQueueTabFor(row: ConversationListRow): InboxTab {
  if (row.status === "RESOLVED" || row.closedAt) return "finalizados";
  if (row.hasError) return "erro";

  const assigneeType = (row.assignedTo?.type ?? "").toUpperCase();

  // Responsável IA tem fila própria (`agente_ia`), tenha o aluno respondido
  // ou não — espelha `tabToWhere` no backend.
  if (assigneeType === "AI") return "agente_ia";
  if (!row.assignedToId) return "entrada";

  const dir = lastMessageDirection(row);
  if (dir === "in") return "esperando";
  if (dir === "out") return "respondidas";
  return "entrada";
}

/**
 * A conversa cabe nesta aba da inbox? Usado pelo SSE para mover o card
 * entre caches sem refetch da lista. `ligar` e `todos`/`abertas` são
 * sobreposições (o ticket também vive na fila canônica).
 *
 * Automação não dá pra afirmar pelo row (falta contexto RUNNING) — ver
 * `rowStaysOnAutomacaoTab`.
 */
export function rowBelongsToInboxTab(
  row: ConversationListRow,
  tab: InboxTab,
): boolean {
  const resolved = row.status === "RESOLVED" || Boolean(row.closedAt);
  if (tab === "finalizados") return resolved;
  if (resolved) return tab === "todos";

  if (tab === "todos") return true;
  if (tab === "abertas") return !row.hasError;
  if (tab === "erro") return Boolean(row.hasError);
  if (row.hasError) return false;

  if (tab === "ligar") {
    return row.channel === "whatsapp" && row.whatsappCallConsentStatus === "GRANTED";
  }
  if (tab === "automacao") return false;

  const canonical = inboxQueueTabFor(row);
  if (tab === "entrada") {
    if (canonical !== "entrada") return false;
    // Sem dono e sem inbound = órfão/robô — não é Entrada (tabToWhere).
    if (!row.assignedToId && !row.lastInboundAt) return false;
    return true;
  }
  return canonical === tab;
}

/** Card já listado em Automação permanece até haver dono, inbound ou encerrar. */
export function rowStaysOnAutomacaoTab(row: ConversationListRow): boolean {
  if (row.status === "RESOLVED" || row.closedAt || row.hasError) return false;
  if (row.assignedToId || row.lastInboundAt) return false;
  return true;
}

export function pickVisibleInboxTab(
  preferred: InboxTab,
  visible: readonly { id: InboxTab }[],
): InboxTab | null {
  if (visible.some((t) => t.id === preferred)) return preferred;
  if (visible.some((t) => t.id === "todos")) return "todos";
  return visible[0]?.id ?? null;
}
