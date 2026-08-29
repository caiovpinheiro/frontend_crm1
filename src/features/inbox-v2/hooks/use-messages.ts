"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addNoteToLog,
  favoriteMessage,
  getFavoriteMessages,
  getMessages,
  pinMessage,
  unpinMessage,
  pinNote,
  sendAttachment,
  sendMessage,
  sendReaction,
  type FavoriteMessageDto,
  type InboxMessageDto,
  type MessagesResponse,
  type ReactionDto,
} from "../api";

import { invalidatePipelineBoards } from "@/features/pipeline-v2/hooks/use-pipeline-realtime";

export function messagesKey(conversationId: string | null | undefined) {
  return ["messages", conversationId ?? "__none__"] as const;
}

/** Últimas mensagens do ticket. Histórico sobe no scroll (`fetchOlder`). */
const MESSAGE_PAGE = 40;
/** Fatia de tickets anteriores por gesto de scroll — nunca o dump de 8×40. */
const HISTORY_PAGE = 25;

function isTicketSeparator(m: InboxMessageDto) {
  return m.messageType === "ticket-separator" || String(m.id).startsWith("__ticket_sep_");
}

function oldestCursor(messages: InboxMessageDto[]): string | null {
  let oldest: string | null = null;
  for (const m of messages) {
    if (isTicketSeparator(m) || !m.createdAt) continue;
    if (!oldest || m.createdAt < oldest) oldest = m.createdAt;
  }
  return oldest;
}

function inferHasMore(page: MessagesResponse, limit: number): boolean {
  if (typeof page.hasMore === "boolean") return page.hasMore;
  const real = page.messages.filter((m) => !isTicketSeparator(m));
  return real.length >= limit;
}

function mergeTail(
  prev: MessagesResponse | undefined,
  next: MessagesResponse,
): MessagesResponse {
  // Refetch vazio (timeout / 5xx parseado como []) não apaga o que já
  // está na tela — era uma causa de painel branco depois do 1º load.
  if (!next.messages.length && prev?.messages.length) {
    return prev;
  }
  if (!prev?.messages?.length) {
    return {
      ...next,
      hasMore: inferHasMore(next, MESSAGE_PAGE),
      hasOlderTickets: next.hasOlderTickets === true,
      historyLoaded: false,
    };
  }
  const incomingIds = new Set(next.messages.map((m) => String(m.id)));
  const kept = prev.messages.filter((m) => !incomingIds.has(String(m.id)));
  return {
    ...next,
    messages: [...kept, ...next.messages],
    hasMore: prev.hasMore === true,
    hasOlderTickets: prev.hasOlderTickets === true || next.hasOlderTickets === true,
    historyLoaded: prev.historyLoaded === true,
  };
}

function mergeOlder(
  prev: MessagesResponse | undefined,
  page: MessagesResponse,
): MessagesResponse {
  if (!prev) return { ...page, historyLoaded: false };
  const existing = new Set(prev.messages.map((m) => String(m.id)));
  const incoming = page.messages.filter((m) => !existing.has(String(m.id)));
  return {
    ...prev,
    messages: [...incoming, ...prev.messages],
    // Página vazia/duplicada (before ignorado ou fim do ticket) — para
    // de paginar pra o próximo gesto pedir history=1.
    hasMore: incoming.length === 0 ? false : inferHasMore(page, MESSAGE_PAGE),
  };
}

function mergeHistory(
  prev: MessagesResponse | undefined,
  hist: MessagesResponse,
): MessagesResponse {
  if (!prev) return { ...hist, hasMore: false, hasOlderTickets: false, historyLoaded: true };
  const existing = new Set(prev.messages.map((m) => String(m.id)));
  const incoming = hist.messages.filter((m) => !existing.has(String(m.id)));
  return {
    ...prev,
    messages: [...incoming, ...prev.messages],
    hasMore: false,
    hasOlderTickets: hist.hasOlderTickets === true,
    historyLoaded: hist.hasOlderTickets !== true,
  };
}

export function useMessages(conversationId: string | null) {
  const qc = useQueryClient();
  const fetchingOlderRef = useRef(false);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);

  const query = useQuery<MessagesResponse>({
    queryKey: messagesKey(conversationId),
    queryFn: async () => {
      const page = await getMessages(conversationId as string, { limit: MESSAGE_PAGE });
      const prev = qc.getQueryData<MessagesResponse>(messagesKey(conversationId));
      return mergeTail(prev, page);
    },
    enabled: !!conversationId,
    staleTime: 20_000,
    // SSE invalida na hora em new_message da conversa ativa; o poll é só
    // safety-net. 90s (era 45s) — ver storm de 28/ago/26.
    refetchInterval: 90_000,
    refetchOnWindowFocus: false,
  });

  const fetchOlder = useCallback(async () => {
    if (!conversationId || fetchingOlderRef.current) return;
    const cur = qc.getQueryData<MessagesResponse>(messagesKey(conversationId));
    if (!cur) return;
    const cursor = oldestCursor(cur.messages);
    const canPage = cur.hasMore === true && Boolean(cursor);
    const canHistory =
      !canPage &&
      !cur.historyLoaded &&
      cur.hasOlderTickets === true;
    if (!canPage && !canHistory) return;

    fetchingOlderRef.current = true;
    setIsFetchingOlder(true);
    try {
      if (canPage && cursor) {
        const page = await getMessages(conversationId, {
          before: cursor,
          limit: MESSAGE_PAGE,
        });
        qc.setQueryData(messagesKey(conversationId), (old: MessagesResponse | undefined) =>
          mergeOlder(old, page),
        );
      } else {
        // 1ª fatia de history sem `before` — o cursor do ticket atual
        // filtrava tickets anteriores e a API voltava []. Depois pagina.
        const alreadyHasHistory = cur.messages.some(isTicketSeparator);
        const hist = await getMessages(conversationId, {
          history: true,
          before: alreadyHasHistory ? cursor ?? undefined : undefined,
          limit: HISTORY_PAGE,
          budget: HISTORY_PAGE,
        });
        qc.setQueryData(messagesKey(conversationId), (old: MessagesResponse | undefined) =>
          mergeHistory(old, hist),
        );
      }
    } catch {
      // Mantém a página já pintada. Próximo scroll-up tenta de novo.
    } finally {
      fetchingOlderRef.current = false;
      setIsFetchingOlder(false);
    }
  }, [conversationId, qc]);

  const data = query.data;
  const hasOlderPages = data?.hasMore === true;
  const hasOlderTickets = Boolean(
    data && !data.historyLoaded && data.hasOlderTickets === true,
  );
  const hasOlder = Boolean(data && (hasOlderPages || hasOlderTickets));

  return {
    ...query,
    fetchOlder,
    hasOlder,
    hasOlderPages,
    hasOlderTickets,
    isFetchingOlder,
  };
}

/** Mutation: enviar mensagem de texto ou nota interna. */
export function useSendMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    {
      message: InboxMessageDto;
      metaError?: string;
      conversationId?: string;
      reopenedConversationId?: string;
    },
    Error,
    {
      content: string;
      asNote?: boolean;
      replyToId?: string | null;
      channelId?: string | null;
    }
  >({
    mutationFn: (vars) =>
      sendMessage(conversationId as string, vars),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
      // Reabriu como novo ticket: invalida também o histórico do id novo
      // para o chat carregar a linha do tempo já com a mensagem enviada.
      if (data.reopenedConversationId) {
        qc.invalidateQueries({ queryKey: messagesKey(data.reopenedConversationId) });
        // Emite o evento global — inbox-v2 e deal-workspace do pipeline
        // escutam e trocam o chat ativo para o id novo. Antes só o
        // `useSendAttachment` fazia isso, e um simples envio de TEXTO em
        // conversa RESOLVED deixava o painel do pipeline travado no
        // ticket antigo (parecia que "reabrir" não funcionava).
        emitConversationReopened(data.reopenedConversationId);
        // Também invalida os caches do deal-detail-v2 (pipeline) e do
        // deal/contact (deal-workspace) para o `contact.conversations[0]`
        // apontar para o novo ticket sem reload.
        qc.invalidateQueries({ queryKey: ["deal-detail-v2"] });
        qc.invalidateQueries({ queryKey: ["deal"] });
        qc.invalidateQueries({ queryKey: ["contact"] });
      }
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["conversations", "tab-counts"] });
      // Rodapé "aguardando resposta" dos cards vem do board (lastMessage).
      invalidatePipelineBoards(qc);
    },
  });
}

/** Mutation: fixar / desafixar nota interna de uma conversa. */
export function usePinNote(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; pinnedNoteId: string | null },
    Error,
    { noteId: string | null }
  >({
    mutationFn: ({ noteId }) => pinNote(conversationId as string, noteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
    },
  });
}

/** Mutation: criar nota de deal (adiciona ao log/timeline do negócio). */
export function useAddNoteToLog(dealId: string | null) {
  const qc = useQueryClient();
  return useMutation<{ id: string; content: string }, Error, { content: string }>({
    mutationFn: ({ content }) => addNoteToLog(dealId as string, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-timeline"] });
      qc.invalidateQueries({ queryKey: ["deal-notes", dealId] });
    },
  });
}

/**
 * Mutation: reagir a uma mensagem (agente → cliente).
 *
 * `emoji` vazio (`""`) = remover a reação anterior deste agente
 * (toggle-off segue o comportamento oficial do WhatsApp Cloud API).
 *
 * O backend atualiza `Message.reactions` no DB e propaga a reação
 * para o cliente via Meta Graph (quando o canal é Cloud API e a
 * mensagem tem `wamid`).
 */
export function useReactMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    { reactions?: ReactionDto[]; metaError?: string },
    Error,
    { messageId: string; emoji: string }
  >({
    mutationFn: ({ messageId, emoji }) => sendReaction(messageId, emoji),
    onSuccess: () => {
      // Reação altera `Message.reactions` — refetch da conversa ativa
      // pra refletir o badge no bubble sem esperar o SSE.
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
    },
  });
}

/**
 * Mutation: fixar mensagem no topo da conversa (banner estilo WhatsApp).
 * Diferente de `usePinNote` — aceita qualquer mensagem, não só notas.
 * Várias fixadas por conversa (máx. 3); fixar a mesma renova só o prazo.
 */
export function usePinMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    { ok: true },
    Error,
    { messageId: string; durationHours?: number }
  >({
    mutationFn: ({ messageId, durationHours }) =>
      pinMessage(conversationId as string, messageId, durationHours),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
    },
  });
}

/**
 * Mutation: desafixar uma mensagem específica do banner (estilo WhatsApp).
 * Recebe o `messageId` (id de bolha) — obrigatório, já que há várias
 * fixadas possíveis.
 */
export function useUnpinMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { messageId: string }>({
    mutationFn: ({ messageId }) =>
      unpinMessage(conversationId as string, messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
    },
  });
}

/**
 * Mutation: favoritar / desfavoritar mensagem — marcador PESSOAL do
 * agente logado (não aparece pra outros agentes). Sem `favorite`
 * explícito, o backend alterna o estado atual.
 */
export function useFavoriteMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    { favorited: boolean },
    Error,
    { messageId: string; favorite?: boolean }
  >({
    mutationFn: ({ messageId, favorite }) => favoriteMessage(messageId, favorite),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
      qc.invalidateQueries({ queryKey: favoritesKey(conversationId) });
    },
  });
}

export function favoritesKey(conversationId: string | null | undefined) {
  return ["favorites", conversationId ?? "__none__"] as const;
}

/**
 * Lista de mensagens favoritadas (marcador pessoal do agente logado)
 * nesta conversa — alimenta o painel "Mensagens favoritas" do menu (⋮).
 * `enabled` controlado externamente: só busca quando o painel abre.
 */
export function useFavoriteMessagesList(
  conversationId: string | null,
  enabled: boolean,
) {
  return useQuery<FavoriteMessageDto[]>({
    queryKey: favoritesKey(conversationId),
    queryFn: () => getFavoriteMessages(conversationId as string),
    enabled: !!conversationId && enabled,
    staleTime: 5_000,
  });
}

/**
 * Nome do evento global disparado quando um envio reabre uma conversa
 * encerrada como NOVO ticket. O `_v2-client` escuta e troca o chat ativo.
 * (Evento em vez de prop-drilling: os botões de anexo/áudio ficam 3 níveis
 * abaixo do orquestrador.)
 */
export const CONVERSATION_REOPENED_EVENT = "inbox:conversation-reopened";

export function emitConversationReopened(newId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CONVERSATION_REOPENED_EVENT, { detail: { newId } }),
    );
  }
}

/** Mutation: enviar anexo (arquivo, áudio, imagem). */
export function useSendAttachment(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    { message: InboxMessageDto; reopenedConversationId?: string; audioDelivery?: "voice" | "audio" | "document" },
    Error,
    {
      file: File | Blob;
      caption?: string;
      fileName?: string;
      channelId?: string | null;
    }
  >({
    mutationFn: (vars) =>
      sendAttachment(conversationId as string, vars.file, {
        caption: vars.caption,
        fileName: vars.fileName,
        channelId: vars.channelId,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      if (data.reopenedConversationId) {
        qc.invalidateQueries({ queryKey: messagesKey(data.reopenedConversationId) });
        emitConversationReopened(data.reopenedConversationId);
        // Sincroniza os painéis do deal (pipeline + workspace) com o
        // novo ticket. Sem isso o `contact.conversations[0]` continuava
        // apontando pra conversa velha RESOLVED após reopen por anexo.
        qc.invalidateQueries({ queryKey: ["deal-detail-v2"] });
        qc.invalidateQueries({ queryKey: ["deal"] });
        qc.invalidateQueries({ queryKey: ["contact"] });
      }
      invalidatePipelineBoards(qc);
    },
  });
}
