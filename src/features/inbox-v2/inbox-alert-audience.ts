import type { ConversationListRow } from "./api";

/**
 * Quem recebe alerta de mensagem recebida, lendo só o `card` do SSE:
 *
 * - `"mine"`  — atribuída a mim: bip + toast + notificação nativa.
 * - `"queue"` — sem responsável, num departamento de que sou membro:
 *               toast sem som.
 * - `null`    — nada: outro agente, fila da IA, sem departamento ou fora
 *               dos meus. Ver tudo (`canSeeAll`) não amplia: o card chega
 *               para o supervisor, mas o alerta não.
 */
export type InboxAlertAudience = "mine" | "queue";

type AudienceCard = Pick<ConversationListRow, "assignedToId" | "departmentId"> & {
  assignedTo?: { type?: string | null } | null;
};

export function inboxAlertAudience(
  card: AudienceCard,
  meId: string | null | undefined,
  myDepartmentIds: readonly string[] | null | undefined,
): InboxAlertAudience | null {
  if (!meId) return null;
  if (String(card.assignedTo?.type ?? "").toUpperCase() === "AI") return null;
  if (card.assignedToId) return card.assignedToId === meId ? "mine" : null;
  const dept = card.departmentId;
  if (dept && myDepartmentIds?.includes(dept)) return "queue";
  return null;
}
