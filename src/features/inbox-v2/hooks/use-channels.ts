"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";
import { usesWhatsapp24hWindow } from "@/components/inbox/channel-type-icon";

import { isBaileysChannelProvider } from "../adapters";
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

export async function fetchOutboundMessagingChannels(): Promise<OutboundChannelOption[]> {
  const res = await fetch(apiUrl("/api/channels"));
  if (!res.ok) {
    throw new Error("Erro ao carregar canais.");
  }
  return parseOutboundMessagingChannels(await res.json().catch(() => ({})));
}

/** Corpo de `GET /api/channels` → canais de envio (também usado pelo bootstrap). */
export function parseOutboundMessagingChannels(body: unknown): OutboundChannelOption[] {
  const data = (body ?? {}) as ChannelsResponse;
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
    // Catálogo da org (bloco do bootstrap): sem GET a cada chat que remonta.
    staleTime: 5 * 60_000,
  });
}

/** Conversa/canal Webchat (`"webchat"` na conversa, `"WEBCHAT"` no canal). */
export function isWebchatChannel(type: string | null | undefined): boolean {
  return (type ?? "").trim().toUpperCase() === "WEBCHAT";
}

const NO_OUTBOUND_CHANNELS: OutboundChannelOption[] = [];

/**
 * Canais oferecidos no "Enviar por" para uma conversa. Webchat só responde
 * pelo próprio widget: sem seletor (e sem cair no 1º WhatsApp da org, o que
 * aplicaria a janela de 24h e mandaria `channelId` de outro canal).
 */
export function outboundChannelsForConversation(
  channels: OutboundChannelOption[] | undefined,
  conversationChannel: string | null | undefined,
): OutboundChannelOption[] | undefined {
  return isWebchatChannel(conversationChannel) ? NO_OUTBOUND_CHANNELS : channels;
}

/**
 * Janela de 24h / template HSM: só WhatsApp Cloud API. Baileys (número
 * conectado por QR) é WhatsApp mas não tem janela — o `type` sozinho não
 * distingue, por isso a checagem do `provider`.
 */
export function channelUsesWhatsapp24hWindow(
  channel:
    | { type?: string | null; provider?: string | null }
    | null
    | undefined,
): boolean {
  if (!channel) return false;
  return (
    usesWhatsapp24hWindow(channel.type) &&
    !isBaileysChannelProvider(channel.provider)
  );
}

/**
 * Escopo da janela de 24h para o composer de uma conversa: o canal
 * escolhido no composer (`OutboundChannelOption`, com provider) ou, sem
 * escolha válida, o canal atual da conversa (`channel.type` +
 * `channelProvider` do GET messages). Devolve o que o host passa a
 * `useChannelSession`, `isWhatsappComposerSessionExpired` e ao ChatArea.
 */
export function resolveWhatsappSessionScope(args: {
  selectedOutbound?: { type?: string | null; provider?: string | null } | null;
  conversationChannelType?: string | null;
  conversationChannelProvider?: string | null;
}): {
  /** Aplica a regra de 24h (WhatsApp Cloud API; nunca Baileys/Instagram). */
  applyWhatsappSession: boolean;
  /** Provider do canal atual da conversa (`MessagesResponse.channelProvider`). */
  channelProvider: string | null;
  /** Provider do canal escolhido no composer (`OutboundChannelOption.provider`). */
  selectedChannelProvider: string | null;
  /** Provider por onde a próxima mensagem sai — `channelProvider` do ChatArea. */
  effectiveProvider: string | null;
} {
  const channelProvider = args.conversationChannelProvider ?? null;
  const selectedChannelProvider = args.selectedOutbound?.provider ?? null;
  const scope = args.selectedOutbound ?? {
    type: args.conversationChannelType,
    provider: channelProvider,
  };
  return {
    applyWhatsappSession: channelUsesWhatsapp24hWindow(scope),
    channelProvider,
    selectedChannelProvider,
    effectiveProvider: selectedChannelProvider ?? channelProvider,
  };
}

/**
 * Janela de 24h do contato no canal do composer. A Meta separa CSV e
 * Acadêmico; o ticket só guarda o channelId do último inbound.
 *
 * `opts.provider` (provider do canal consultado): em Baileys não há
 * sessão de 24h — o GET é pulado e `isFetched` fica false.
 */
export function useChannelSession(
  conversationId: string | null,
  channelId: string | null,
  enabled: boolean,
  opts?: { provider?: string | null },
) {
  const baileys = isBaileysChannelProvider(opts?.provider);
  return useQuery<SessionInfo>({
    queryKey: [
      "channel-session",
      conversationId ?? "__none__",
      channelId ?? "__none__",
    ],
    queryFn: () =>
      getChannelSession(conversationId as string, channelId as string),
    enabled: enabled && !!conversationId && !!channelId && !baileys,
    // SSE invalida no inbound. Cache curto evita refetch em todo foco.
    staleTime: 20_000,
    refetchOnWindowFocus: false,
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
        messageType?: string | number;
      }>
    | undefined,
): string | null {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.isPrivate || m.private) continue;
    const t = String(m.messageType ?? "").toLowerCase();
    if (t === "note" || t === "event") continue;
    if (m.channelId) return m.channelId;
  }
  return null;
}

/**
 * Última mensagem DO CLIENTE (inbound pública) com `channelId`: o número em
 * que o cliente escreveu por último. Nota interna e evento não contam.
 */
export function findLastInboundMessage(
  messages:
    | Array<{
        id?: string | null;
        direction?: string | null;
        channelId?: string | null;
        isPrivate?: boolean;
        private?: boolean;
        messageType?: string | number;
      }>
    | undefined,
): { id: string | null; channelId: string } | null {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.direction !== "in") continue;
    if (m.isPrivate || m.private) continue;
    const t = String(m.messageType ?? "").toLowerCase();
    if (t === "note" || t === "event" || t.startsWith("event:")) continue;
    if (m.channelId) return { id: m.id ?? null, channelId: m.channelId };
  }
  return null;
}

/**
 * Escolha manual guardada por conversa. `afterInboundId` = última mensagem do
 * cliente quando o consultor escolheu: chegou outra depois, a escolha caduca e
 * o seletor volta para o canal do cliente. Valor antigo (só o id) é aceito.
 */
type PersistedChannelChoice = { channelId: string; afterInboundId: string | null };

function readPersistedChoice(raw: string | null): PersistedChannelChoice | null {
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const o = JSON.parse(raw) as Partial<PersistedChannelChoice>;
      if (typeof o.channelId === "string" && o.channelId) {
        return {
          channelId: o.channelId,
          afterInboundId: typeof o.afterInboundId === "string" ? o.afterInboundId : null,
        };
      }
    } catch {
      return null;
    }
    return null;
  }
  return { channelId: raw, afterInboundId: null };
}

export function useSelectedOutboundChannel(args: {
  conversationId: string | null;
  conversationChannelId: string | null | undefined;
  availableChannels: OutboundChannelOption[] | undefined;
  /** Canal da última msg pública — preferido quando o da conversa está morto. */
  lastMessageChannelId?: string | null;
  /**
   * Última mensagem do cliente (`findLastInboundMessage`). Quando o cliente
   * escreve por um canal, o seletor passa a enviar por ele — a escolha manual
   * só vale até a próxima mensagem do cliente.
   */
  lastInbound?: { id: string | null; channelId: string } | null;
}): {
  selectedChannelId: string | null;
  setSelectedChannelId: (id: string) => void;
} {
  const {
    conversationId,
    conversationChannelId,
    availableChannels,
    lastMessageChannelId,
    lastInbound,
  } = args;
  const lastInboundId = lastInbound?.id ?? null;
  const lastInboundChannelId = lastInbound?.channelId ?? null;

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
        const choice = readPersistedChoice(window.localStorage.getItem(storageKey));
        // Cliente escreveu depois da escolha (ou escolha sem marca): vale o
        // canal do cliente.
        const stale =
          !!choice &&
          !!lastInboundChannelId &&
          validIds.has(lastInboundChannelId) &&
          (choice.afterInboundId == null || choice.afterInboundId !== lastInboundId);
        const persisted = choice && !stale ? choice.channelId : null;
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
    if (!next && lastInboundChannelId && validIds.has(lastInboundChannelId)) {
      next = lastInboundChannelId;
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
    lastInboundId,
    lastInboundChannelId,
    availableChannels,
    storageKey,
  ]);

  const setSelectedChannelId = useCallback(
    (id: string) => {
      setSelectedChannelIdState(id);
      if (storageKey) {
        try {
          const choice: PersistedChannelChoice = { channelId: id, afterInboundId: lastInboundId };
          window.localStorage.setItem(storageKey, JSON.stringify(choice));
        } catch {
          /* ignore */
        }
      }
    },
    [storageKey, lastInboundId],
  );

  return { selectedChannelId, setSelectedChannelId };
}
