import type { WhatsAppGroupMessage } from "./types";

/**
 * Mensagem na tela. Só no cliente: `pending` enquanto o POST não volta;
 * `local` quando saiu no WhatsApp mas o servidor não devolveu a gravada.
 */
export type GroupThreadMessage = WhatsAppGroupMessage & { pending?: boolean; local?: boolean };

export type GroupMessagesCache = { messages: GroupThreadMessage[] } | undefined;

export function optimisticGroupMessage(text: string, tempId: string, now = new Date()): GroupThreadMessage {
  return {
    id: tempId,
    fromJid: "me",
    fromName: null,
    fromPhone: null,
    fromMe: true,
    text,
    createdAt: now.toISOString(),
    pending: true,
  };
}

/** Acrescenta a mensagem otimista no fim da conversa (cache vazio inclusive). */
export function appendPendingMessage(
  cache: GroupMessagesCache,
  msg: GroupThreadMessage,
): { messages: GroupThreadMessage[] } {
  return { messages: [...(cache?.messages ?? []), msg] };
}

/**
 * Troca a otimista pela gravada no servidor. Sem a gravada (histórico não
 * salvo), mantém o texto na tela como enviado — a mensagem saiu no WhatsApp.
 */
export function settlePendingMessage(
  cache: GroupMessagesCache,
  tempId: string,
  saved: WhatsAppGroupMessage | null | undefined,
): { messages: GroupThreadMessage[] } {
  const list = cache?.messages ?? [];
  const next: GroupThreadMessage[] = [];
  for (const m of list) {
    if (m.id !== tempId) {
      if (!saved || m.id !== saved.id) next.push(m);
      continue;
    }
    next.push(saved ?? { ...m, pending: false, local: true });
  }
  return { messages: next };
}

export function dropPendingMessage(
  cache: GroupMessagesCache,
  tempId: string,
): { messages: GroupThreadMessage[] } {
  return { messages: (cache?.messages ?? []).filter((m) => m.id !== tempId) };
}

/**
 * Quando o poll traz a lista do servidor, mantém no fim as mensagens só do
 * cliente (pendentes ou enviadas sem gravação) que o servidor ainda não
 * tem — senão a mensagem some e reaparece.
 */
export function mergeServerMessages(
  server: WhatsAppGroupMessage[],
  previous: GroupMessagesCache,
): GroupThreadMessage[] {
  const mine = new Set(server.filter((m) => m.fromMe).map((m) => m.text));
  const keep = (previous?.messages ?? []).filter(
    (m) => m.pending || (m.local && !mine.has(m.text)),
  );
  return keep.length ? [...server, ...keep] : server;
}

export type ThreadDay = { key: string; iso: string; items: GroupThreadMessage[] };

/** Agrupa por dia (separador "Hoje", "Ontem"…), preservando a ordem. */
export function groupMessagesByDay(messages: GroupThreadMessage[]): ThreadDay[] {
  const days: ThreadDay[] = [];
  for (const m of messages) {
    const key = new Date(m.createdAt).toDateString();
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(m);
    else days.push({ key, iso: m.createdAt, items: [m] });
  }
  return days;
}

/** Mesma pessoa em sequência curta: só a primeira bolha mostra nome e "cauda". */
export function isFirstOfRun(items: GroupThreadMessage[], index: number): boolean {
  if (index === 0) return true;
  const prev = items[index - 1];
  const cur = items[index];
  return prev.fromMe !== cur.fromMe || prev.fromJid !== cur.fromJid;
}
