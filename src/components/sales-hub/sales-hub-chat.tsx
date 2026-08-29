"use client";

/**
 * SalesHubChat — o chat do Sales Hub é o MESMO stack do `/inbox`.
 *
 * O Sales Hub usava `ConversationHeader` + `ChatWindow` (stack legado do
 * inbox v1): bolhas inline, composer de uma linha e header WhatsApp-like.
 * O `/inbox` renderiza `ChatArea` (header + bolhas `MessageBubble` +
 * separadores de dia) com `composerSlot={<Composer />}` do inbox-v2.
 * Eram dois componentes diferentes — nenhum ajuste de estilo no
 * `ChatWindow` deixaria os dois iguais.
 *
 * Este componente replica a ligação de dados do `/inbox` (`_v2-client`)
 * para um deal: mesmas queries, mesmas mutations, mesmos componentes
 * visuais. As ações específicas de negócio (Ganho/Perdido, gaveta CRM)
 * entram por `headerActionsSlot`.
 */

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { ChatArea } from "@/components/crm/chat-area";
import type { Message as BubbleMessage } from "@/components/crm/message-bubble";
import { usesWhatsapp24hWindow } from "@/components/inbox/channel-type-icon";
import { usePinDurationDialog } from "@/components/crm/pin-duration-dialog";
import { ActivitiesPanel } from "@/components/pipeline/deal-workspace/panels/activities";
import {
  isWhatsappComposerSessionExpired,
  lastInboundAtFromThread,
  toMessageBubble,
} from "@/features/inbox-v2/adapters";
import {
  useChannelSession,
  useConversationFeatures,
  useFavoriteMessage,
  useInboxRealtime,
  useMessages,
  usePinMessage,
  useReactMessage,
  useSelectedOutboundChannel,
  useSendMessage,
  useUnpinMessage,
  useWhatsappChannels,
  findLastPublicMessageChannelId,
} from "@/features/inbox-v2/hooks";
import {
  Composer,
  ConversationTimelineTab,
  WhatsappTemplatePickerModal,
  whatsappTemplateToPending,
  type PendingTemplate,
} from "@/features/inbox-v2/extras";
import {
  isSessionClosedError,
  SESSION_CLOSED_TOAST,
} from "@/features/inbox-v2/extras/channel-switch-confirm";
import { DealNotesTab } from "@/features/pipeline-v2/extras";
import { CallHistoryList } from "@/features/softphone/components/call-history-list";
import { DealCallButton } from "@/features/softphone/components/deal-call-button";

export type SalesHubChatProps = {
  conversationId: string;
  conversationStatus?: string | null;
  conversationNumber?: number | null;
  conversationClosedAt?: string | null;
  /** `lastInboundAt` da conversa — fallback da janela de 24h da Meta. */
  lastInboundAt?: string | null;
  contactId: string;
  contactName: string;
  contactPhone?: string | null;
  contactChannel?: string | null;
  dealId: string;
  pipelineId?: string | null;
  /** Ações à direita do header (Ganho/Perdido, gaveta CRM, kebab…). */
  headerActionsSlot?: React.ReactNode;
  /**
   * Enviar numa conversa encerrada reabre como NOVO ticket (id novo). O
   * host precisa trocar a conversa ativa, senão a UI fica presa no
   * ticket antigo e parece que o envio não funcionou.
   */
  onConversationReopened?: (newConversationId: string) => void;
};

export function SalesHubChat({
  conversationId,
  conversationStatus,
  conversationNumber,
  conversationClosedAt,
  lastInboundAt,
  contactId,
  contactName,
  contactPhone,
  contactChannel,
  dealId,
  pipelineId,
  headerActionsSlot,
  onConversationReopened,
}: SalesHubChatProps) {
  const { data: session } = useSession();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{
    id: string;
    preview: string;
    senderName?: string | null;
  } | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [externalTemplate, setExternalTemplate] =
    useState<PendingTemplate | null>(null);

  useEffect(() => {
    setDraft("");
    setReplyTo(null);
  }, [conversationId]);

  const {
    data: messagesData,
    fetchOlder,
    hasOlderPages,
    hasOlderTickets,
    isFetchingOlder,
  } = useMessages(conversationId);
  const sendMessage = useSendMessage(conversationId);
  const reactMessage = useReactMessage(conversationId);
  const pinMessage = usePinMessage(conversationId);
  const unpinMessage = useUnpinMessage(conversationId);
  const favoriteMessage = useFavoriteMessage(conversationId);
  const { features: convFeatures } = useConversationFeatures();
  const { requestDuration: requestPinDuration, dialog: pinDurationDialog } =
    usePinDurationDialog();

  useInboxRealtime({
    activeConversationId: conversationId,
    currentUserId: session?.user?.id ?? null,
    enabled: !!conversationId,
  });

  const { data: whatsappChannels } = useWhatsappChannels(!!conversationId);
  const conversationChannelId = messagesData?.channel?.id ?? null;
  const lastMessageChannelId = useMemo(
    () => findLastPublicMessageChannelId(messagesData?.messages),
    [messagesData?.messages],
  );
  const { selectedChannelId, setSelectedChannelId } = useSelectedOutboundChannel(
    {
      conversationId,
      conversationChannelId,
      availableChannels: whatsappChannels,
      lastMessageChannelId,
    },
  );
  const selectedOutbound = whatsappChannels?.find((c) => c.id === selectedChannelId);
  const applyWhatsappSession = usesWhatsapp24hWindow(
    selectedOutbound?.type ?? messagesData?.channel?.type,
  );

  const channelOverrideActive =
    !!selectedChannelId &&
    !!conversationChannelId &&
    selectedChannelId !== conversationChannelId;
  const { data: selectedSession, isFetched: selectedSessionFetched } =
    useChannelSession(
      conversationId,
      selectedChannelId,
      applyWhatsappSession && !!conversationId && !!selectedChannelId,
    );

  const pinnedMessageIds = useMemo(
    () => messagesData?.pinnedMessageIds ?? [],
    [messagesData?.pinnedMessageIds],
  );
  const pinnedIdSet = useMemo(
    () => new Set(pinnedMessageIds),
    [pinnedMessageIds],
  );
  const messageBubbles = useMemo(
    () =>
      (messagesData?.messages ?? []).map((m) => {
        const bubble = toMessageBubble(m, contactName);
        return pinnedIdSet.has(m.id)
          ? { ...bubble, isPinnedMessage: true }
          : bubble;
      }),
    [messagesData?.messages, contactName, pinnedIdSet],
  );
  const pinnedMessagesPreview = useMemo(
    () =>
      pinnedMessageIds
        .map((pid) => messageBubbles.find((m) => m.id === pid))
        .filter((m): m is NonNullable<typeof m> => !!m)
        .map((m) => ({
          id: m.id,
          content: m.content,
          senderName: m.senderName ?? null,
        })),
    [pinnedMessageIds, messageBubbles],
  );

  // Janela de 24h da Meta — mesma regra do /inbox (thread visível reabre).
  const sessionInfo = messagesData?.session;
  const threadLastInboundAt = lastInboundAtFromThread(
    messagesData?.messages,
    selectedChannelId,
    { strictChannel: channelOverrideActive },
  );
  const sessionExpiredEffective = isWhatsappComposerSessionExpired({
    applyWhatsappSession,
    messagesLoaded: Boolean(messagesData),
    channelOverrideActive,
    selectedSessionFetched,
    selectedSessionActive: selectedSession?.active,
    messagesSessionActive: sessionInfo?.active,
    messagesLastInboundAt: sessionInfo?.lastInboundAt ?? lastInboundAt ?? null,
    threadLastInboundAt,
  });
  const canReply = messagesData?.canReply ?? true;
  const isResolved = conversationStatus === "RESOLVED";

  async function handleSend(value: string) {
    try {
      const data = await sendMessage.mutateAsync({
        content: value,
        ...(replyTo ? { replyToId: replyTo.id } : {}),
        ...(selectedChannelId && selectedChannelId !== conversationChannelId
          ? { channelId: selectedChannelId }
          : {}),
      });
      setDraft("");
      setReplyTo(null);
      if (data.reopenedConversationId) {
        onConversationReopened?.(data.reopenedConversationId);
      }
    } catch (err) {
      // Corrida: a sessão de 24h expirou enquanto o agente digitava (o
      // backend bloqueia com 409 antes de criar a mensagem). Em vez do
      // toast genérico, mostra o aviso de sessão e abre o fluxo de template.
      if (isSessionClosedError(err)) {
        toast.error(SESSION_CLOSED_TOAST, {
          action: { label: "Usar Template", onClick: () => setTemplateOpen(true) },
        });
        setTemplateOpen(true);
      } else {
        toast.error((err as Error)?.message || "Falha ao enviar");
      }
      throw err;
    }
  }

  function handleSendNote(value: string) {
    sendMessage.mutate(
      { content: value, asNote: true },
      {
        onSuccess: () => setDraft(""),
        onError: (err) => toast.error(err.message || "Falha ao salvar nota"),
      },
    );
  }

  function handleReplyMessage(message: BubbleMessage) {
    setReplyTo({
      id: message.id,
      preview: (message.content ?? "").slice(0, 120),
      senderName:
        message.type === "incoming" ? contactName : (message.senderName ?? "Você"),
    });
  }

  function handleReactMessage(msg: { id: string }, emoji: string | null) {
    // `null` = pedido de abrir o picker (não muta). `""` = remover reação.
    if (emoji == null) return;
    reactMessage.mutate(
      { messageId: msg.id, emoji },
      { onError: (err) => toast.error(err.message || "Falha ao reagir") },
    );
  }

  async function handlePinMessage(msg: {
    id: string;
    isPinnedMessage?: boolean;
  }) {
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
    unpinMessage.mutate(
      { messageId },
      { onError: (err) => toast.error(err.message || "Falha ao desafixar") },
    );
  }

  function handleFavoriteMessage(msg: { id: string; isFavorited?: boolean }) {
    favoriteMessage.mutate(
      { messageId: msg.id, favorite: !msg.isFavorited },
      {
        onSuccess: (res) =>
          toast.success(
            res.favorited ? "Mensagem favoritada" : "Removida dos favoritos",
          ),
        onError: (err) => toast.error(err.message || "Falha ao favoritar"),
      },
    );
  }

  return (
    <>
      <ChatArea
        contact={{
          name: contactName,
          contactId,
          phone: contactPhone ?? undefined,
          channel: contactChannel ?? null,
        }}
        messages={messageBubbles}
        showSessionAlert={sessionExpiredEffective}
        connection={messagesData?.channel ?? null}
        connections={messagesData?.channels}
        conversationNumber={conversationNumber ?? null}
        conversationId={conversationId}
        onLoadOlder={fetchOlder}
        hasOlder={hasOlderPages}
        hasOlderTickets={hasOlderTickets}
        isLoadingOlder={isFetchingOlder}
        conversationResolved={isResolved}
        conversationClosedAt={conversationClosedAt ?? null}
        onUseTemplate={() => setTemplateOpen(true)}
        onReplyMessage={handleReplyMessage}
        onReactMessage={handleReactMessage}
        onPinMessage={handlePinMessage}
        onFavoriteMessage={handleFavoriteMessage}
        pinnedMessages={pinnedMessagesPreview}
        onUnpinMessage={handleUnpinMessage}
        headerActionsSlot={headerActionsSlot}
        className="rounded-none border-0 shadow-none backdrop-blur-none"
        notesSlot={<DealNotesTab dealId={dealId} pipelineId={pipelineId} />}
        activitiesSlot={
          <div className="flex-1 overflow-auto">
            <ActivitiesPanel
              dealId={dealId}
              contactId={contactId}
              contactName={contactName}
              dealTitle={undefined}
            />
          </div>
        }
        timelineSlot={<ConversationTimelineTab conversationId={conversationId} />}
        callsSlot={
          <div className="flex-1 overflow-auto p-4">
            <CallHistoryList embedded contactId={contactId} />
          </div>
        }
        composerSlot={
          <Composer
            conversationId={conversationId}
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            onSendNote={handleSendNote}
            sending={sendMessage.isPending}
            disabled={!canReply || sessionExpiredEffective}
            placeholder={
              !canReply
                ? "Você não tem permissão para enviar mensagens neste canal."
                : undefined
            }
            isResolved={isResolved}
            contactId={contactId}
            contactName={contactName}
            dealId={dealId}
            deals={[{ id: dealId, title: "Negócio atual" }]}
            externalTemplate={externalTemplate}
            onExternalTemplateConsumed={() => setExternalTemplate(null)}
            onRequestTemplate={() => setTemplateOpen(true)}
            sessionExpired={sessionExpiredEffective}
            signatureAllowed={convFeatures.agentSignatureEnabled}
            signatureEditable={convFeatures.agentSignatureEditable}
            availableChannels={whatsappChannels}
            selectedChannelId={selectedChannelId}
            conversationChannelId={conversationChannelId}
            lastMessageChannelId={lastMessageChannelId}
            onSelectChannel={setSelectedChannelId}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onReopenNewConversation={onConversationReopened}
            conversationNumber={conversationNumber ?? null}
            enableCallPermission={
              contactChannel === "whatsapp" || contactChannel === "meta"
            }
          />
        }
        floatingCallSlot={
          <DealCallButton
            fab
            dealId={dealId}
            phone={contactPhone ?? null}
            contactId={contactId}
          />
        }
      />

      <WhatsappTemplatePickerModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        conversationId={conversationId}
        channelId={selectedChannelId}
        contactName={contactName}
        onPick={(tpl) => {
          setExternalTemplate(whatsappTemplateToPending(tpl));
          setTemplateOpen(false);
        }}
      />

      {pinDurationDialog}
    </>
  );
}
