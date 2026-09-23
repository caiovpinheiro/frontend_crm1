import type { ConversationListRow } from "./api";

/**
 * Tipo da conversa para o alerta de mensagem recebida, lendo só o `card`
 * do SSE (o card só chega se o usuário pode listar a conversa):
 *
 * - `"mine"`   — atribuída a mim;
 * - `"queue"`  — sem responsável, num departamento de que sou membro;
 * - `"others"` — qualquer outra que eu vejo (outro agente, fila da IA,
 *                sem departamento, fora dos meus).
 *
 * Quais canais cada tipo aciona vem da config do admin
 * (`InboxAlertConfig`, `GET /api/agents/me/alert-config`). Espelha
 * `lib/inbox-alert-config.ts` do backend.
 */
export type InboxAlertKind = "mine" | "queue" | "others";
export type InboxAlertChannel = "sound" | "toast" | "native" | "tab";
export type InboxAlertChannels = Record<InboxAlertChannel, boolean>;
export type InboxAlertConfig = Record<InboxAlertKind, InboxAlertChannels>;

export const INBOX_ALERT_KINDS: readonly InboxAlertKind[] = ["mine", "queue", "others"];
export const INBOX_ALERT_CHANNELS: readonly InboxAlertChannel[] = [
  "sound",
  "toast",
  "native",
  "tab",
];

/** Padrão sem config (igual ao backend): o comportamento anterior. */
export const DEFAULT_INBOX_ALERT_CONFIG: InboxAlertConfig = {
  mine: { sound: true, toast: true, native: true, tab: true },
  queue: { sound: false, toast: true, native: false, tab: false },
  others: { sound: false, toast: false, native: false, tab: false },
};

type AudienceCard = Pick<ConversationListRow, "assignedToId" | "departmentId"> & {
  assignedTo?: { type?: string | null } | null;
};

export function inboxAlertKind(
  card: AudienceCard,
  meId: string | null | undefined,
  myDepartmentIds: readonly string[] | null | undefined,
): InboxAlertKind | null {
  if (!meId) return null;
  if (card.assignedToId && card.assignedToId === meId) return "mine";
  const isAi = String(card.assignedTo?.type ?? "").toUpperCase() === "AI";
  const dept = card.departmentId;
  if (!isAi && !card.assignedToId && dept && myDepartmentIds?.includes(dept)) {
    return "queue";
  }
  return "others";
}
