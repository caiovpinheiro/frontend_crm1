"use client";

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

/** Histórico da conversa ativa (ticket atual + histórico capado/paralelo no backend). */
export function useMessages(conversationId: string | null) {
  return useQuery<MessagesResponse>({
    queryKey: messagesKey(conversationId),
    queryFn: () => getMessages(conversationId as string, { history: true }),
    enabled: !!conversationId,
    staleTime: 20_000,
    refetchInterval: 45_000,
    refetchOnWindowFocus: false,
  });
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
