"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";

import { getChannelSession, type SessionInfo } from "../api";

/**
 * Conexão WhatsApp da org (forma reduzida). Usado pelo seletor de canal
 * acima do composer (Inbox / Deal). O campo `phoneNumber` é exibido como
 * sublinha para o agente distinguir entre dois WhatsApps com nomes
 * parecidos (ex.: "WhatsApp Vendas" 5511… vs "WhatsApp Suporte" 5511…).
 */
export interface OutboundChannelOption {
  id: string;
  name: string;
  type: string;
  provider: string;
  status: string;
  phoneNumber: string | null;
}

interface ApiChannel {
  id: string;
  name: string;
  type: string;
  provider: string;
  status: string;
  phoneNumber?: string | null;
}

interface ChannelsResponse {
  channels?: ApiChannel[];
}

async function fetchOutboundMessagingChannels(): Promise<OutboundChannelOption[]> {
  const res = await fetch(apiUrl("/api/channels"));
  if (!res.ok) {
    throw new Error("Erro ao carregar canais.");
  }
  const data = (await res.json().catch(() => ({}))) as ChannelsResponse;
  const list = Array.isArray(data.channels) ? data.channels : [];
  return list
    .filter(
      (c) =>
        (c.type === "WHATSAPP" ||
          c.type === "INSTAGRAM" ||
          c.type === "FACEBOOK") &&
        c.status === "CONNECTED",
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      provider: c.provider,
      status: c.status,
      phoneNumber: c.phoneNumber ?? null,
    }));
}

/**
 * Canais CONNECTED de mensageria da org (WhatsApp, Instagram, Messenger).
 * Alimenta o seletor "Enviar por". Templates HSM continuam filtrando
 * WhatsApp no picker — esta lista só define canais de texto livre.
 */
export function useWhatsappChannels(enabled = true) {
  return useQuery<OutboundChannelOption[]>({
    queryKey: ["inbox-v2", "outbound-messaging-channels"],
    queryFn: fetchOutboundMessagingChannels,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Janela de 24h do contato no canal do composer. A Meta separa CSV e
 * Acadêmico; o ticket só guarda o channelId do último inbound.
 */
export function useChannelSession(
  conversationId: string | null,
  channelId: string | null,
  enabled: boolean,
) {
  return useQuery<SessionInfo>({
    queryKey: [
      "channel-session",
      conversationId ?? "__none__",
      channelId ?? "__none__",
    ],
    queryFn: () =>
      getChannelSession(conversationId as string, channelId as string),
    enabled: enabled && !!conversationId && !!channelId,
    // Inbound do cliente precisa reabrir a janela na hora; 30s + sem
    // focus refetch deixava o composer "encerrada" com a bolha já no chat.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Estado controlado do canal de envio para uma conversa:
 *   - persiste a escolha do agente em localStorage por conversationId
 *     (a próxima vez que o agente abrir esta mesma conversa, lembra do
 *     canal que ele estava usando — útil para conversas multi-canal)
 *   - default: canal "atual" da conversa (último inbound)
 *   - valida que o canal salvo ainda existe entre os disponíveis (fail
 *     fast quando a org desativa um canal)
 *
 * Devolve `{ selectedChannelId, setSelectedChannelId }` — passe direto
 * para o Composer.
 */
const SELECTED_CHANNEL_STORAGE_PREFIX = "eduit:inbox:selected-channel:";

/** Última mensagem pública (não-nota/evento) com `channelId`. */
export function findLastPublicMessageChannelId(
  messages:
    | Array<{
        channelId?: string | null;
        isPrivate?: boolean;
        private?: boolean;
        messageType?: string;
      }>
    | undefined,
): string | null {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.isPrivate || m.private) continue;
    const t = (m.messageType ?? "").toLowerCase();
    if (t === "note" || t === "event") continue;
    if (m.channelId) return m.channelId;
  }
  return null;
}

export function useSelectedOutboundChannel(args: {
  conversationId: string | null;
  conversationChannelId: string | null | undefined;
  availableChannels: OutboundChannelOption[] | undefined;
  /** Canal da última msg pública — preferido quando o da conversa está morto. */
  lastMessageChannelId?: string | null;
}): {
  selectedChannelId: string | null;
  setSelectedChannelId: (id: string) => void;
} {
  const {
    conversationId,
    conversationChannelId,
    availableChannels,
    lastMessageChannelId,
  } = args;

  const storageKey = useMemo(
    () =>
      conversationId
        ? `${SELECTED_CHANNEL_STORAGE_PREFIX}${conversationId}`
        : null,
    [conversationId],
  );

  const [selectedChannelId, setSelectedChannelIdState] = useState<string | null>(
    null,
  );

  // Re-inicializa o seletor quando a conversa muda ou quando a lista de
  // canais disponíveis chega/atualiza. Ordem de fallback:
  //   1) escolha persistida em localStorage (se ainda válida)
  //   2) última mensagem pública (se o canal ainda está CONNECTED)
  //   3) canal "atual" da conversa — se ainda válido
  //   4) primeiro canal disponível
  //   5) null (sem canais → composer mostra fallback do header padrão)
  useEffect(() => {
    if (!conversationId || !availableChannels) {
      setSelectedChannelIdState(null);
      return;
    }
    const validIds = new Set(availableChannels.map((c) => c.id));

    let next: string | null = null;
    if (storageKey) {
      try {
        const persisted = window.localStorage.getItem(storageKey);
        if (persisted && validIds.has(persisted)) {
          const persistedType = availableChannels.find((c) => c.id === persisted)?.type;
          const convType = availableChannels.find(
            (c) => c.id === conversationChannelId,
          )?.type;
          if (!convType || !persistedType || persistedType === convType) {
            next = persisted;
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (!next && lastMessageChannelId && validIds.has(lastMessageChannelId)) {
      next = lastMessageChannelId;
    }
    if (!next && conversationChannelId && validIds.has(conversationChannelId)) {
      next = conversationChannelId;
    }
    if (!next && availableChannels.length > 0) {
      next = availableChannels[0].id;
    }
    setSelectedChannelIdState(next);
  }, [
    conversationId,
    conversationChannelId,
    lastMessageChannelId,
    availableChannels,
    storageKey,
  ]);

  const setSelectedChannelId = useCallback(
    (id: string) => {
      setSelectedChannelIdState(id);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, id);
        } catch {
          /* ignore */
        }
      }
    },
    [storageKey],
  );

  return { selectedChannelId, setSelectedChannelId };
}
