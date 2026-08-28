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

export function pickVisibleInboxTab(
  preferred: InboxTab,
  visible: readonly { id: InboxTab }[],
): InboxTab | null {
  if (visible.some((t) => t.id === preferred)) return preferred;
  if (visible.some((t) => t.id === "todos")) return "todos";
  return visible[0]?.id ?? null;
}
