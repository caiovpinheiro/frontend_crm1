import type { ConversationListRow } from "./api";

/**
 * Tipo da conversa para o alerta de mensagem recebida, lendo só o `card`
 * do SSE (o card só chega se o usuário pode listar a conversa):
 *
 * - `"mine"`   — atribuída a mim;
 * - `"queue"`  — sem responsável, num departamento de que sou membro;
 * - `"ai"`     — atendida por um agente de IA (padrão: não avisa);
 * - `"others"` — qualquer outra que eu vejo (outro agente, sem
 *                departamento, fora dos meus).
 *
 * Quais canais cada tipo aciona vem da config do admin
 * (`InboxAlertConfig`, `GET /api/agents/me/alert-config`). Espelha
 * `lib/inbox-alert-config.ts` do backend.
 */
export type InboxAlertKind = "mine" | "queue" | "ai" | "others";
export type InboxAlertChannel = "sound" | "toast" | "native" | "tab";
export type InboxAlertChannels = Record<InboxAlertChannel, boolean>;
export type InboxAlertConfig = Record<InboxAlertKind, InboxAlertChannels>;

export const INBOX_ALERT_KINDS: readonly InboxAlertKind[] = ["mine", "queue", "ai", "others"];
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
  ai: { sound: false, toast: false, native: false, tab: false },
  others: { sound: false, toast: false, native: false, tab: false },
};

/**
 * Completa tipos que a config recebida não tem (backend anterior ao tipo
 * `ai`, config gravada antes dele) com o padrão.
 */
export function withInboxAlertDefaults(
  config: Partial<InboxAlertConfig> | null | undefined,
): InboxAlertConfig {
  const out = { ...DEFAULT_INBOX_ALERT_CONFIG };
  for (const kind of INBOX_ALERT_KINDS) {
    const channels = config?.[kind];
    if (channels) out[kind] = channels;
  }
  return out;
}

type AudienceCard = Pick<ConversationListRow, "assignedToId" | "departmentId"> & {
  assignedTo?: { type?: string | null } | null;
};

/**
 * Quem recebe o aviso na aba do navegador (canal `tab`), escolhido pelo
 * admin para a org (Configurações > Notificações):
 * - `"owner"`      — só o responsável pela conversa;
 * - `"department"` — também conversas dos departamentos do usuário, com
 *                    ou sem responsável;
 * - `"all"`        — qualquer conversa que o usuário vê.
 * `null` = sem escolha: vale a coluna "Aba" da config por tipo.
 * Espelha `lib/inbox-alert-config.ts` do backend.
 */
export type InboxTabAudience = "owner" | "department" | "all";
export const INBOX_TAB_AUDIENCES: readonly InboxTabAudience[] = ["owner", "department", "all"];

export function parseInboxTabAudience(raw: unknown): InboxTabAudience | null {
  return typeof raw === "string" && (INBOX_TAB_AUDIENCES as readonly string[]).includes(raw)
    ? (raw as InboxTabAudience)
    : null;
}

/**
 * Se a aba acende para esta conversa. Com público definido, ele decide
 * sozinho; sem, vale `fallback` (coluna "Aba" do tipo da conversa).
 * O card só chega a quem pode listar a conversa — "all" não amplia a
 * visibilidade, só o aviso.
 */
export function inboxTabAlertFor(
  audience: InboxTabAudience | null | undefined,
  card: AudienceCard,
  meId: string | null | undefined,
  myDepartmentIds: readonly string[] | null | undefined,
  fallback: boolean,
): boolean {
  if (!audience) return fallback;
  if (!meId) return false;
  if (card.assignedToId && card.assignedToId === meId) return true;
  if (audience === "all") return true;
  if (audience === "department") {
    const dept = card.departmentId;
    return Boolean(dept && myDepartmentIds?.includes(dept));
  }
  return false;
}

export function inboxAlertKind(
  card: AudienceCard,
  meId: string | null | undefined,
  myDepartmentIds: readonly string[] | null | undefined,
): InboxAlertKind | null {
  if (!meId) return null;
  if (card.assignedToId && card.assignedToId === meId) return "mine";
  if (String(card.assignedTo?.type ?? "").toUpperCase() === "AI") return "ai";
  const dept = card.departmentId;
  if (!card.assignedToId && dept && myDepartmentIds?.includes(dept)) {
    return "queue";
  }
  return "others";
}
