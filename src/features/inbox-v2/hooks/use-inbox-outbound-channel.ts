"use client";

import { useMemo } from "react";

import {
  isWhatsappComposerSessionExpired,
  lastInboundAtFromThread,
} from "../adapters";
import type { ConversationListRow, MessagesResponse } from "../api";
import {
  findLastPublicMessageChannelId,
  resolveWhatsappSessionScope,
  useChannelSession,
  useSelectedOutboundChannel,
  useWhatsappChannels,
} from "./use-channels";

/**
 * Canal de saída do composer (seletor de número) e estado do envio:
 * janela de 24h do canal escolhido e permissão de responder.
 */
export function useInboxOutboundChannel(params: {
  canFetchInbox: boolean;
  conversationApiId: string | null;
  messagesData: MessagesResponse | undefined;
  activeRow: ConversationListRow | null;
}) {
  const { canFetchInbox, conversationApiId, messagesData, activeRow } = params;
  const messages = messagesData?.messages ?? [];
  const sessionInfo = messagesData?.session;

  // Seletor de canal: lista de WhatsApps CONNECTED da org + estado
  // persistido por conversa. Quando a org tem 1 só canal, o widget não
  // aparece e o backend usa o canal "atual" da conversa (legacy).
  const { data: whatsappChannels } = useWhatsappChannels(canFetchInbox);
  const conversationChannelId = messagesData?.channel?.id ?? null;
  const lastMessageChannelId = useMemo(
    () => findLastPublicMessageChannelId(messagesData?.messages),
    [messagesData?.messages],
  );
  const { selectedChannelId, setSelectedChannelId } = useSelectedOutboundChannel(
    {
      conversationId: conversationApiId,
      conversationChannelId,
      availableChannels: whatsappChannels,
      lastMessageChannelId,
    },
  );
  const selectedOutbound = whatsappChannels?.find((c) => c.id === selectedChannelId);
  // Janela de 24h só em WhatsApp Cloud API: canal Baileys (provider
  // `BAILEYS_MD` em `channels[].provider` / `channelProvider` do GET
  // messages) não tem sessão nem template HSM.
  const sessionScope = resolveWhatsappSessionScope({
    selectedOutbound,
    conversationChannelType: messagesData?.channel?.type,
    conversationChannelProvider: messagesData?.channelProvider,
  });
  const applyWhatsappSession = sessionScope.applyWhatsappSession;

  // Override de canal ativo: revalida a janela de 24h no canal de DESTINO
  // (o `session` do GET messages reflete só o canal da conversa).
  const channelOverrideActive =
    !!selectedChannelId &&
    !!conversationChannelId &&
    selectedChannelId !== conversationChannelId;
  // Sempre a sessão do número escolhido no composer. Sem isso, inbound no
  // Acadêmico vira o channelId do ticket e o CSV (persistido) aparece
  // "24h encerrada" mesmo com janela aberta naquele chip.
  const { data: selectedSession, isFetched: selectedSessionFetched } =
    useChannelSession(
      conversationApiId,
      selectedChannelId,
      applyWhatsappSession && channelOverrideActive,
      { provider: sessionScope.selectedChannelProvider },
    );

  // Backend é source of truth quando disponível (`session.active`).
  // Fallback: thread visível (inbound do cliente reabre na hora — o cache
  // `channel-session` não acompanhava o SSE) e, sem `session`, lastInboundAt.
  const sessionActiveFromBackend = sessionInfo?.active;
  const threadLastInboundAt = lastInboundAtFromThread(
    messages,
    selectedChannelId,
    { strictChannel: channelOverrideActive },
  );
  const sessionExpiredEffective = isWhatsappComposerSessionExpired({
    applyWhatsappSession,
    messagesLoaded: Boolean(activeRow && messagesData),
    channelOverrideActive,
    selectedSessionFetched,
    selectedSessionActive: selectedSession?.active,
    messagesSessionActive: sessionActiveFromBackend,
    messagesLastInboundAt:
      sessionInfo?.lastInboundAt ?? activeRow?.lastInboundAt ?? null,
    threadLastInboundAt,
    channelProvider: sessionScope.channelProvider,
    selectedChannelProvider: sessionScope.selectedChannelProvider,
  });
  // Bloco C (25/jun/26): backend pode setar `canReply:false` quando o
  // usuário não tem `channel.send`. Default true preserva compat com
  // backend antigo (que não envia o campo).
  const canReply = messagesData?.canReply ?? true;
  const composerDisabled = !canReply || sessionExpiredEffective;
  const composerPlaceholder = !canReply
    ? "Você não tem permissão para enviar mensagens neste canal."
    : undefined;

  return {
    whatsappChannels,
    conversationChannelId,
    lastMessageChannelId,
    selectedChannelId,
    setSelectedChannelId,
    effectiveProvider: sessionScope.effectiveProvider,
    sessionExpiredEffective,
    composerDisabled,
    composerPlaceholder,
  };
}
