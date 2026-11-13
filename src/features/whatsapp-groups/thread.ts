import type { Message } from "@/components/crm/message-bubble/types";

import type { WhatsAppGroupMessage } from "./types";

/**
 * Mensagem na tela. Só no cliente: `pending` enquanto o POST não volta;
 * `local` quando saiu no WhatsApp mas o servidor não devolveu a gravada.
 */
export type GroupThreadMessage = WhatsAppGroupMessage & { pending?: boolean; local?: boolean };

export type GroupMessagesCache = { messages: GroupThreadMessage[] } | undefined;

export function optimisticGroupMessage(
  text: string,
  tempId: string,
  now = new Date(),
  media?: { messageType: string; fileName: string } | null,
  replyTo?: GroupThreadMessage["replyTo"],
): GroupThreadMessage {
  return {
    id: tempId,
    fromJid: "me",
    fromName: null,
    fromPhone: null,
    fromMe: true,
    text,
    messageType: media?.messageType ?? "text",
    // Sem URL enquanto sobe: o balão mostra o rótulo até o servidor responder.
    mediaUrl: null,
    mimeType: null,
    fileName: media?.fileName ?? null,
    reactions: [],
    replyTo: replyTo ?? null,
    canReact: false,
    createdAt: now.toISOString(),
    pending: true,
  };
}

/** Tipo provisório do anexo pelo MIME do navegador (o servidor confirma). */
export function pendingAttachmentType(mime: string, fileName: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return /^audio-\d+\./.test(fileName) ? "ptt" : "audio";
  return "document";
}

/** Rótulo provisório do anexo enquanto sobe. */
export function pendingAttachmentText(messageType: string, fileName: string): string {
  return messageType === "ptt" || messageType === "audio" ? "[áudio]" : `📎 ${fileName}`;
}

const MEDIA_TYPES = new Set(["image", "video", "audio", "ptt", "document", "sticker"]);

/** Mensagem do grupo com arquivo? (decide balão de mídia × texto) */
export function isGroupMediaMessage(msg: Pick<WhatsAppGroupMessage, "messageType">): boolean {
  return MEDIA_TYPES.has(msg.messageType);
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

/**
 * Mensagem do grupo no formato do balão do CRM (`MessageContent`): o mesmo
 * player de áudio e os mesmos cartões de imagem/vídeo/documento, que só
 * carregam o arquivo quando a pessoa toca.
 */
export function toBubbleMessage(msg: GroupThreadMessage): Message {
  return {
    id: msg.id,
    content: msg.text,
    time: msg.createdAt,
    createdAt: msg.createdAt,
    type: msg.fromMe ? "outgoing" : "incoming",
    messageType: msg.messageType,
    mediaUrl: msg.mediaUrl,
  };
}

/** O número reage uma vez: troca a reação "me" (mesmo emoji de novo remove). */
export function toggleMyReaction(
  reactions: WhatsAppGroupMessage["reactions"],
  emoji: string,
  name: string | null,
): WhatsAppGroupMessage["reactions"] {
  const mine = reactions.find((r) => r.from === "me");
  const rest = reactions.filter((r) => r.from !== "me");
  if (!emoji || mine?.emoji === emoji) return rest;
  return [...rest, { emoji, from: "me", name }];
}

/** Aplica reações numa mensagem do cache. */
export function patchMessageReactions(
  cache: GroupMessagesCache,
  messageId: string,
  reactions: WhatsAppGroupMessage["reactions"],
): GroupMessagesCache {
  if (!cache) return cache;
  return { messages: cache.messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)) };
}
