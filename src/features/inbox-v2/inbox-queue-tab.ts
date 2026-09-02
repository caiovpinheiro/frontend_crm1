import type { ConversationListRow, InboxTab } from "./api";

function lastMessageDirection(row: ConversationListRow): "in" | "out" | null {
  const raw = String(
    row.lastMessage?.direction ?? row.lastMessagePreview?.direction ?? "",
  ).toLowerCase();
  if (raw === "in" || raw === "inbound") return "in";
  if (raw === "out" || raw === "outbound") return "out";
  return null;
}

/**
 * Fila canônica da conversa (a mais específica). Usado ao abrir um hit
 * da busca para mudar a aba da inbox junto com o ticket.
 *
 * Encerradas = conversa de fato fechada (`RESOLVED` / `closedAt`).
 * Resolvendo = `followUpAt` (Acompanhar; ticket continua OPEN).
 * Deal GANHO/PERDIDO com ticket ainda OPEN fica na aba que o status
 * implica (Aguardando, Entrada, …) — estágio do funil não fecha conversa.
 */
export function inboxQueueTabFor(row: ConversationListRow): InboxTab {
  if (row.followUpAt) return "resolvidos";
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
  if (tab === "resolvidos") return Boolean(row.followUpAt);
  if (tab === "finalizados") return resolved && !row.followUpAt;
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

/** A conversa cabe em alguma das filas selecionadas (união). */
export function rowBelongsToAnyInboxTab(
  row: ConversationListRow,
  tabs: readonly InboxTab[],
): boolean {
  if (tabs.length === 0) return false;
  if (tabs.includes("todos")) return rowBelongsToInboxTab(row, "todos");
  return tabs.some((tab) => rowBelongsToInboxTab(row, tab));
}
