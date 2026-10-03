"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { Message as BubbleMessage } from "@/components/crm/message-bubble";
import { usePinDurationDialog } from "@/components/crm/pin-duration-dialog";
import { useStableCallback } from "@/hooks/use-stable-callback";

import {
  useBulkConversationAction,
  useMarkConversationRead,
} from "./use-conversation-actions";
import {
  useFavoriteMessage,
  usePinMessage,
  useReactMessage,
  useSendMessage,
  useUnpinMessage,
} from "./use-messages";

/**
 * Mutations da conversa ativa e handlers das ações por mensagem (reagir,
 * fixar, favoritar, responder).
 */
export function useInboxMessageActions(
  conversationApiId: string | null,
  contactName: string,
) {
  const sendMessage = useSendMessage(conversationApiId);
  const reactMessage = useReactMessage(conversationApiId);
  const pinMessage = usePinMessage(conversationApiId);
  const unpinMessage = useUnpinMessage(conversationApiId);
  const favoriteMessageMutation = useFavoriteMessage(conversationApiId);
  const markRead = useMarkConversationRead();
  const bulkAction = useBulkConversationAction();
  const { requestDuration: requestPinDuration, dialog: pinDurationDialog } = usePinDurationDialog();
  const [favoritesOpen, setFavoritesOpen] = useState(false);

  // Handler de reação disparado pelo menu contextual de cada bubble.
  // WhatsApp: apertar o mesmo emoji novamente remove; escolher outro
  // substitui. Repassamos `""` pra remoção (backend interpreta como
  // toggle-off + envia reaction vazia à Meta pra limpar no cliente).
  function handleReactMessage(msg: { id: string }, emoji: string | null) {
    if (!conversationApiId) return;
    // `null` = abrir picker (UI); não muta. `""` = remover reação.
    if (emoji == null) return;
    reactMessage.mutate(
      { messageId: msg.id, emoji },
      {
        onError: (err) => toast.error(err.message || "Falha ao reagir"),
      },
    );
  }

  // Fixar: toggle — clicar numa mensagem já fixada desafixa direto (igual
  // WhatsApp). Fixar uma NOVA abre o picker de duração (24h/7d/30d) antes
  // de confirmar. Várias podem ficar fixadas ao mesmo tempo (máx. 3).
  async function handlePinMessage(msg: { id: string; isPinnedMessage?: boolean }) {
    if (!conversationApiId) return;
    if (msg.isPinnedMessage) {
      unpinMessage.mutate(
        { messageId: msg.id },
        {
          onSuccess: () => toast.success("Mensagem desafixada"),
          onError: (err) => toast.error(err.message || "Falha ao desafixar"),
        },
      );
      return;
    }
    const durationHours = await requestPinDuration();
    if (durationHours == null) return;
    pinMessage.mutate(
      { messageId: msg.id, durationHours },
      {
        onSuccess: () => toast.success("Mensagem fixada"),
        onError: (err) => toast.error(err.message || "Falha ao fixar"),
      },
    );
  }

  function handleUnpinMessage(messageId: string) {
    if (!conversationApiId) return;
    unpinMessage.mutate(
      { messageId },
      { onError: (err) => toast.error(err.message || "Falha ao desafixar") },
    );
  }

  // Favoritar: marcador pessoal — sem `favorite` explícito, o backend
  // alterna o estado atual (evita round-trip extra pra saber o estado
  // prévio, que o front já tem local via `msg.isFavorited`).
  function handleFavoriteMessage(msg: { id: string; isFavorited?: boolean }) {
    favoriteMessageMutation.mutate(
      { messageId: msg.id, favorite: !msg.isFavorited },
      {
        onSuccess: (res) =>
          toast.success(res.favorited ? "Mensagem favoritada" : "Removida dos favoritos"),
        onError: (err) => toast.error(err.message || "Falha ao favoritar"),
      },
    );
  }

  // Reply (estilo WhatsApp): guarda a msg selecionada e o Composer mostra
  // a barra de preview. senderName é derivado (backend não retorna direto).
  const [replyTo, setReplyTo] = useState<{
    id: string;
    preview: string;
    senderName?: string | null;
  } | null>(null);

  function handleReplyMessage(message: BubbleMessage) {
    const preview = (message.content ?? "").slice(0, 120);
    const senderName =
      message.type === "incoming"
        ? contactName
        : message.senderName ?? "Você";
    setReplyTo({ id: message.id, preview, senderName });
  }

  // Identidade estável: os handlers vão para cada `MessageBubble` (memo);
  // recriados a cada render da página, derrubavam o memo de todas as bolhas.
  const onReactMessage = useStableCallback(handleReactMessage);
  const onPinMessage = useStableCallback(handlePinMessage);
  const onUnpinMessage = useStableCallback(handleUnpinMessage);
  const onFavoriteMessage = useStableCallback(handleFavoriteMessage);
  const onReplyMessage = useStableCallback(handleReplyMessage);

  return {
    sendMessage,
    markRead,
    bulkAction,
    pinDurationDialog,
    favoritesOpen,
    setFavoritesOpen,
    replyTo,
    setReplyTo,
    handleReactMessage: onReactMessage,
    handlePinMessage: onPinMessage,
    handleUnpinMessage: onUnpinMessage,
    handleFavoriteMessage: onFavoriteMessage,
    handleReplyMessage: onReplyMessage,
  };
}
