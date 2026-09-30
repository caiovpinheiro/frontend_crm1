"use client";

/**
 * ConversationChatHost — host canônico do chat (ChatArea + Composer).
 *
 * Antes cada tela ligava os hooks do inbox-v2 por conta própria: o Inbox
 * em `_v2-client.tsx`, o Flow em `sales-hub-chat.tsx` e o Kanban em
 * `deal-chat-binding.tsx` (que ainda reimplementava a lista). Este
 * componente concentra a ligação de dados de UMA conversa — mensagens
 * paginadas, envio (texto/nota), sessão de 24h + template, seleção de
 * canal, fixar/favoritar/reagir/citar, busca, abas, marcar como lida e
 * SSE — para que todo host renderize exatamente o mesmo chat.
 *
 * O que fica com o host de página (via props):
 *  - `headerActionsSlot`: chips/botões à direita do header (antes do kebab).
 *  - `viewersSlot` / `transferSlot`: linha de abas do Composer.
 *  - `floatingCallSlot`: FAB de ligação (default: `DealCallButton` quando
 *    há `dealId`; passe `null` para esconder).
 *  - `onConversationReopened`: enviar numa conversa encerrada cria um
 *    ticket NOVO — a página troca a conversa ativa.
 *
 * `useInboxRealtime` é montado aqui UMA vez por conversa; páginas que já
 * montam o realtime (ex.: `/inbox`) passam `realtime={false}`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { ChatArea } from "@/components/crm/chat-area";
import { FavoritesPanel } from "@/components/crm/favorites-panel";
import type { Message as BubbleMessage } from "@/components/crm/message-bubble";
import { usePinDurationDialog } from "@/components/crm/pin-duration-dialog";
import { ActivitiesPanel } from "@/components/pipeline/deal-workspace/panels/activities";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  isWhatsappComposerSessionExpired,
  lastInboundAtFromThread,
  toMessageBubble,
} from "@/features/inbox-v2/adapters";
import {
  channelUsesWhatsapp24hWindow,
  findLastPublicMessageChannelId,
  useAddNoteToLog,
  useChannelSession,
  useConversationFeatures,
  useDeleteNote,
  useFavoriteMessage,
  useInboxRealtime,
  useMarkConversationRead,
  useMessages,
  usePinMessage,
  usePinNote,
  useReactMessage,
  useSelectedOutboundChannel,
  useSendMessage,
  useUnpinMessage,
  useUpdateNote,
  useWhatsappChannels,
} from "@/features/inbox-v2/hooks";
import { KeepPeekPanel } from "@/features/keeps/keep-peek-panel";
import { DealNotesTab } from "@/features/pipeline-v2/extras/deal-notes-tab";
import { clearBoardUnreadForContact } from "@/features/pipeline-v2/hooks/use-pipeline-realtime";
import { CallHistoryList } from "@/features/softphone/components/call-history-list";
import { DealCallButton } from "@/features/softphone/components/deal-call-button";

import { isSessionClosedError, SESSION_CLOSED_TOAST } from "./channel-switch-confirm";
import { Composer } from "./composer";
import { ConversationActionsMenu } from "./conversation-actions-menu";
import { ConversationTimelineTab } from "./conversation-timeline-tab";
import { whatsappTemplateToPending, type PendingTemplate } from "./template-compose-panel";
import { WhatsappTemplatePickerModal } from "./template-picker-popover";

/** Campos da conversa que o chat consome (status/número/encerramento/24h). */
export interface ConversationChatHostConversation {
  status?: string | null;
  number?: number | null;
  closedAt?: string | null;
  /** `lastInboundAt` da conversa — fallback da janela de 24h da Meta. */
  lastInboundAt?: string | null;
  /** Responsável atual — alimenta o kebab e o Composer (tabulação). */
  assignedToId?: string | null;
}

export interface ConversationChatHostContact {
  id: string;
  name: string;
  phone?: string | null;
  /** Canal do contato/conversa (`whatsapp`, `meta`, …) — badge do avatar
   *  e "Pedir permissão de ligação" no menu "+". */
  channel?: string | null;
}

/** Nota fixada da conversa (aba Notas do deal; ChatArea na fase 2). */
export interface ConversationChatHostPinnedNote {
  id: string;
  content: string;
  senderName?: string | null;
  time?: string | null;
}

export type ConversationSearchControl = { open: () => void };

export interface ConversationChatHostProps {
  conversationId: string;
  conversation?: ConversationChatHostConversation | null;
  contact: ConversationChatHostContact;
  dealId?: string | null;
  pipelineId?: string | null;
  /** Departamento da conversa — tabulação ao encerrar (Composer + kebab). */
  departmentId?: string | null;
  requireTabulationOnClose?: boolean;
  /** Ações à direita do header, ANTES do kebab (chips, toggles, gaveta…). */
  headerActionsSlot?: ReactNode;
  /** FAB de ligação. `undefined` = `DealCallButton` quando há `dealId`;
   *  `null` = sem FAB. */
  floatingCallSlot?: ReactNode;
  /** "Quem está vendo" — linha de abas do Composer. */
  viewersSlot?: ReactNode;
  /** Slot à esquerda das abas do Composer (ex.: `TransferPopover`). */
  transferSlot?: ReactNode;
  /**
   * "Mensagens favoritas" do kebab. Sem handler o host abre o próprio
   * `FavoritesPanel`; com handler a página assume o painel.
   */
  onOpenFavorites?: () => void;
  /** Abre a busca inline do ChatArea de fora (kebab da página, Ctrl+F…). */
  searchControlRef?: MutableRefObject<ConversationSearchControl | null>;
  /**
   * Enviar/Reabrir numa conversa encerrada cria um NOVO ticket (id novo).
   * A página precisa trocar a conversa ativa, senão a UI fica presa no
   * ticket antigo e parece que o envio não funcionou.
   */
  onConversationReopened?: (newConversationId: string) => void;
  /** Após "Encerrar" (Composer ou kebab). */
  onResolved?: (conversationId: string) => void;
  /** Kebab canônico (`ConversationActionsMenu`) no header. Default true;
   *  páginas que renderizam o próprio kebab em `headerActionsSlot` desligam. */
  showActionsMenu?: boolean;
  /** Abas Tarefas/Notas/Timeline/Chamadas/keeps do ChatArea. Default true.
   *  Notas e Tarefas exigem `dealId`. */
  showTabs?: boolean;
  /** Monta `useInboxRealtime` para esta conversa. Default true — desligue
   *  quando a página já monta o realtime (uma instância por página). */
  realtime?: boolean;
  /** Marca a conversa como lida ao abrir. Default true. */
  markAsRead?: boolean;
  className?: string;

  // ── Notas internas (overrides; o host já liga os hooks por padrão) ──
  /** Fixar/desafixar nota interna (`null` = desafixar). */
  onPinNote?: (noteId: string | null) => void;
  onEditNote?: (noteId: string, content: string) => void | Promise<unknown>;
  onDeleteNote?: (noteId: string) => void;
  /** "Adicionar ao log do negócio" (conteúdo da nota). Default só com `dealId`. */
  onAddToLog?: (content: string) => void;
  /** Nota fixada (banner do ChatArea + aba Notas). `undefined` = o host
   *  resolve `MessagesResponse.pinnedNoteId` na própria thread. */
  pinnedNote?: ConversationChatHostPinnedNote | null;
}

type ReplyTarget = { id: string; preview: string; senderName?: string | null };

const CHAT_AREA_CLASS = "rounded-none border-0 shadow-none backdrop-blur-none";

export function ConversationChatHost({
  conversationId,
  conversation,
  contact,
  dealId,
  pipelineId,
  departmentId,
  requireTabulationOnClose,
  headerActionsSlot,
  floatingCallSlot,
  viewersSlot,
  transferSlot,
  onOpenFavorites,
  searchControlRef,
  onConversationReopened,
  onResolved,
  showActionsMenu = true,
  showTabs = true,
  realtime = true,
  markAsRead = true,
  className,
  onPinNote,
  onEditNote,
  onDeleteNote,
  onAddToLog,
  pinnedNote,
}: ConversationChatHostProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const contactId = contact.id;
  const contactName = contact.name;
  const contactPhone = contact.phone ?? null;
  const contactChannel = contact.channel ?? null;
  const conversationStatus = conversation?.status ?? null;
  const conversationNumber = conversation?.number ?? null;
  const conversationClosedAt = conversation?.closedAt ?? null;
  const lastInboundAt = conversation?.lastInboundAt ?? null;
  const assignedToId = conversation?.assignedToId ?? null;

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [externalTemplate, setExternalTemplate] = useState<PendingTemplate | null>(null);
  const [favoritesOpen, setFavoritesOpen] = useState(false);

  // Trocar de conversa sem remontar (host sem `key`) limpa o estado local
  // — padrão "estado derivado da prop anterior" (sem efeito extra).
  const [stateConversationId, setStateConversationId] = useState(conversationId);
  if (stateConversationId !== conversationId) {
    setStateConversationId(conversationId);
    setDraft("");
    setReplyTo(null);
    setTemplateOpen(false);
    setExternalTemplate(null);
    setFavoritesOpen(false);
  }

  // Busca inline: ref do pai quando existe (kebab da página), senão a nossa.
  const internalSearchRef = useRef<ConversationSearchControl | null>(null);
  const searchRef = searchControlRef ?? internalSearchRef;

  // Abrir a conversa marca como lida (mesmo hook do /inbox: zera o
  // contador da lista de forma otimista) e tira o badge dos cards do
  // contato no board (Kanban/Flow). Dispara UMA vez por conversa: o
  // contactId pode chegar depois (seed do board → detail) sem repetir o
  // POST /read.
  const { mutate: markReadMutate } = useMarkConversationRead();
  const contactIdRef = useRef(contactId);
  useEffect(() => {
    contactIdRef.current = contactId;
  }, [contactId]);
  useEffect(() => {
    if (!markAsRead || !conversationId) return;
    markReadMutate(conversationId, {
      onSuccess: () => {
        const cid = contactIdRef.current;
        if (cid) clearBoardUnreadForContact(queryClient, cid);
      },
    });
  }, [markAsRead, conversationId, markReadMutate, queryClient]);

  const {
    data: messagesData,
    fetchOlder,
    hasOlder,
    hasOlderTickets,
    isFetchingOlder,
    isPending: messagesPending,
    isError: messagesFailed,
  } = useMessages(conversationId);
  const sendMessage = useSendMessage(conversationId, { contactId });
  const { mutate: sendMutate, mutateAsync: sendMutateAsync, isPending: sending } = sendMessage;
  const { mutate: reactMutate } = useReactMessage(conversationId);
  const { mutate: pinMutate } = usePinMessage(conversationId);
  const { mutate: unpinMutate } = useUnpinMessage(conversationId);
  const { mutate: favoriteMutate } = useFavoriteMessage(conversationId);
  const { mutate: pinNoteMutate } = usePinNote(conversationId);
  const { mutateAsync: updateNoteMutateAsync } = useUpdateNote(conversationId);
  const { mutateAsync: deleteNoteMutateAsync } = useDeleteNote(conversationId);
  const { mutate: addToLogMutate } = useAddNoteToLog(dealId ?? null);
  const { confirm: confirmDialog, dialog: confirmDialogNode } = useConfirm();
  const { features: convFeatures } = useConversationFeatures();
  const { requestDuration: requestPinDuration, dialog: pinDurationDialog } =
    usePinDurationDialog();

  useInboxRealtime({
    activeConversationId: conversationId,
    currentUserId: session?.user?.id ?? null,
    enabled: realtime && !!conversationId,
  });

  // ── Canal de envio (multi-WABA) + janela de 24h ──────────────────
  const { data: whatsappChannels } = useWhatsappChannels(!!conversationId);
  const conversationChannelId = messagesData?.channel?.id ?? null;
  const lastMessageChannelId = useMemo(
    () => findLastPublicMessageChannelId(messagesData?.messages),
    [messagesData?.messages],
  );
  const { selectedChannelId, setSelectedChannelId } = useSelectedOutboundChannel({
    conversationId,
    conversationChannelId,
    availableChannels: whatsappChannels,
    lastMessageChannelId,
  });
  const selectedOutbound = whatsappChannels?.find((c) => c.id === selectedChannelId);
  // Janela de 24h só na Cloud API: Baileys é WhatsApp mas não tem sessão
  // nem template — o `provider` (canal escolhido ou o da conversa) decide.
  const channelProvider = messagesData?.channelProvider ?? null;
  const applyWhatsappSession = channelUsesWhatsapp24hWindow(
    selectedOutbound ?? { type: messagesData?.channel?.type, provider: channelProvider },
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
      { provider: selectedOutbound?.provider },
    );

  // Mesma regra do /inbox: inbound visível no thread reabre a janela.
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
    channelProvider,
    selectedChannelProvider: selectedOutbound?.provider,
  });
  const canReply = messagesData?.canReply ?? true;
  const isResolved = conversationStatus === "RESOLVED";

  // ── Bolhas + fixadas ─────────────────────────────────────────────
  const pinnedMessageIds = useMemo(
    () => messagesData?.pinnedMessageIds ?? [],
    [messagesData?.pinnedMessageIds],
  );
  const pinnedIdSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const messageBubbles = useMemo(
    () =>
      (messagesData?.messages ?? []).map((m) => {
        const bubble = toMessageBubble(m, contactName);
        return pinnedIdSet.has(m.id) ? { ...bubble, isPinnedMessage: true } : bubble;
      }),
    [messagesData?.messages, contactName, pinnedIdSet],
  );
  const pinnedMessagesPreview = useMemo(
    () =>
      pinnedMessageIds
        .map((pid) => messageBubbles.find((m) => m.id === pid))
        .filter((m): m is NonNullable<typeof m> => !!m)
        .map((m) => ({ id: m.id, content: m.content, senderName: m.senderName ?? null })),
    [pinnedMessageIds, messageBubbles],
  );

  // Nota fixada (`pinnedNoteId` da thread) — banner do ChatArea e aba Notas.
  const pinnedNoteId = messagesData?.pinnedNoteId ?? null;
  const derivedPinnedNote = useMemo<ConversationChatHostPinnedNote | null>(() => {
    if (!pinnedNoteId) return null;
    const raw = (messagesData?.messages ?? []).find((m) => m.id === pinnedNoteId);
    if (!raw) return null;
    return {
      id: raw.id,
      content: raw.content,
      senderName: raw.senderName ?? null,
      time: raw.createdAt
        ? new Date(raw.createdAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
    };
  }, [pinnedNoteId, messagesData?.messages]);
  const effectivePinnedNote = pinnedNote !== undefined ? pinnedNote : derivedPinnedNote;

  // ── Handlers estáveis (MessageBubble é `memo`) ───────────────────
  const openTemplate = useCallback(() => setTemplateOpen(true), []);
  const closeTemplate = useCallback(() => setTemplateOpen(false), []);
  const consumeExternalTemplate = useCallback(() => setExternalTemplate(null), []);
  const cancelReply = useCallback(() => setReplyTo(null), []);
  // Sem useCallback: o kebab não é memo e o ref pode ser o do pai ou o interno.
  const openSearch = () => searchRef.current?.open();
  const openFavorites = useCallback(() => {
    if (onOpenFavorites) onOpenFavorites();
    else setFavoritesOpen(true);
  }, [onOpenFavorites]);

  const handleSend = useCallback(
    async (value: string) => {
      try {
        const data = await sendMutateAsync({
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
    },
    [sendMutateAsync, replyTo, selectedChannelId, conversationChannelId, onConversationReopened],
  );

  const handleSendNote = useCallback(
    (value: string) => {
      sendMutate(
        { content: value, asNote: true },
        {
          onSuccess: () => setDraft(""),
          onError: (err) => toast.error(err.message || "Falha ao salvar nota"),
        },
      );
    },
    [sendMutate],
  );

  const handleReplyMessage = useCallback(
    (message: BubbleMessage) => {
      setReplyTo({
        id: message.id,
        preview: (message.content ?? "").slice(0, 120),
        senderName:
          message.type === "incoming" ? contactName : (message.senderName ?? "Você"),
      });
    },
    [contactName],
  );

  const handleReactMessage = useCallback(
    (msg: { id: string }, emoji: string | null) => {
      // `null` = pedido de abrir o picker (não muta). `""` = remover reação.
      if (emoji == null) return;
      reactMutate(
        { messageId: msg.id, emoji },
        { onError: (err) => toast.error(err.message || "Falha ao reagir") },
      );
    },
    [reactMutate],
  );

  const handlePinMessage = useCallback(
    async (msg: { id: string; isPinnedMessage?: boolean }) => {
      if (msg.isPinnedMessage) {
        unpinMutate(
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
      pinMutate(
        { messageId: msg.id, durationHours },
        {
          onSuccess: () => toast.success("Mensagem fixada"),
          onError: (err) => toast.error(err.message || "Falha ao fixar"),
        },
      );
    },
    [unpinMutate, pinMutate, requestPinDuration],
  );

  const handleUnpinMessage = useCallback(
    (messageId: string) => {
      unpinMutate(
        { messageId },
        { onError: (err) => toast.error(err.message || "Falha ao desafixar") },
      );
    },
    [unpinMutate],
  );

  const handleFavoriteMessage = useCallback(
    (msg: { id: string; isFavorited?: boolean }) => {
      favoriteMutate(
        { messageId: msg.id, favorite: !msg.isFavorited },
        {
          onSuccess: (res) =>
            toast.success(res.favorited ? "Mensagem favoritada" : "Removida dos favoritos"),
          onError: (err) => toast.error(err.message || "Falha ao favoritar"),
        },
      );
    },
    [favoriteMutate],
  );

  // ── Notas internas (fixar / editar / excluir / log do negócio) ────
  const handlePinNote = useCallback(
    (noteId: string | null) => {
      pinNoteMutate(
        { noteId },
        {
          onError: (err) =>
            toast.error(err.message || (noteId ? "Falha ao fixar nota" : "Falha ao desafixar nota")),
        },
      );
    },
    [pinNoteMutate],
  );

  const handleEditNote = useCallback(
    async (noteId: string, content: string) => {
      try {
        await updateNoteMutateAsync({ noteId, content });
        toast.success("Nota atualizada");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao editar nota");
        throw e;
      }
    },
    [updateNoteMutateAsync],
  );

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      void confirmDialog({
        title: "Excluir nota interna?",
        description: "A nota será removida da conversa. Esta ação não pode ser desfeita.",
        confirmLabel: "Excluir",
        pendingLabel: "Excluindo…",
        destructive: true,
        action: async () => {
          try {
            await deleteNoteMutateAsync({ noteId });
            toast.success("Nota excluída");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Falha ao excluir nota");
            throw e;
          }
        },
      });
    },
    [confirmDialog, deleteNoteMutateAsync],
  );

  const handleAddToLog = useCallback(
    (content: string) => {
      addToLogMutate(
        { content },
        {
          onSuccess: () => toast.success("Nota adicionada ao log do negócio"),
          onError: (err) => toast.error(err.message || "Falha ao adicionar ao log"),
        },
      );
    },
    [addToLogMutate],
  );

  const chatContact = useMemo(
    () => ({
      name: contactName,
      contactId,
      phone: contactPhone ?? undefined,
      channel: contactChannel,
    }),
    [contactName, contactId, contactPhone, contactChannel],
  );

  const enableCallPermission = contactChannel === "whatsapp" || contactChannel === "meta";
  const deals = useMemo(
    () => (dealId ? [{ id: dealId, title: "Negócio atual" }] : undefined),
    [dealId],
  );

  const headerActions =
    headerActionsSlot || showActionsMenu ? (
      <>
        {headerActionsSlot}
        {showActionsMenu ? (
          <ConversationActionsMenu
            conversationId={conversationId}
            conversationNumber={conversationNumber}
            contactId={contactId}
            contactName={contactName}
            isResolved={isResolved}
            assigneeId={assignedToId}
            dealId={dealId ?? null}
            departmentId={departmentId ?? null}
            requireTabulationOnClose={requireTabulationOnClose ?? false}
            onSearchInConversation={openSearch}
            onOpenFavorites={openFavorites}
            onReopenNewConversation={onConversationReopened}
            onResolved={onResolved}
          />
        ) : null}
      </>
    ) : undefined;

  const callFab =
    floatingCallSlot !== undefined ? (
      floatingCallSlot
    ) : dealId ? (
      <DealCallButton fab dealId={dealId} phone={contactPhone} contactId={contactId} />
    ) : null;

  return (
    <>
      <ChatArea
        contact={chatContact}
        messages={messageBubbles}
        showSessionAlert={sessionExpiredEffective}
        connection={messagesData?.channel ?? null}
        connections={messagesData?.channels}
        conversationNumber={conversationNumber}
        conversationId={conversationId}
        onLoadOlder={fetchOlder}
        hasOlder={hasOlder}
        hasOlderTickets={hasOlderTickets}
        isLoadingOlder={isFetchingOlder}
        messagesLoading={messagesPending && !messagesData}
        messagesError={messagesFailed && !messagesData}
        conversationResolved={isResolved}
        conversationClosedAt={conversationClosedAt}
        onUseTemplate={openTemplate}
        onReplyMessage={handleReplyMessage}
        onReactMessage={handleReactMessage}
        onPinMessage={handlePinMessage}
        onFavoriteMessage={handleFavoriteMessage}
        pinnedMessages={pinnedMessagesPreview}
        onUnpinMessage={handleUnpinMessage}
        channelProvider={channelProvider}
        onPinNote={onPinNote ?? handlePinNote}
        onEditNote={onEditNote ?? handleEditNote}
        onDeleteNote={onDeleteNote ?? handleDeleteNote}
        onAddToLog={onAddToLog ?? (dealId ? handleAddToLog : undefined)}
        pinnedNote={effectivePinnedNote}
        headerActionsSlot={headerActions}
        searchControlRef={searchRef}
        className={className ?? CHAT_AREA_CLASS}
        notesSlot={
          showTabs && dealId ? (
            <DealNotesTab
              dealId={dealId}
              pipelineId={pipelineId}
              pinnedNote={effectivePinnedNote}
            />
          ) : undefined
        }
        activitiesSlot={
          showTabs && dealId ? (
            <div className="flex-1 overflow-auto">
              <ActivitiesPanel
                dealId={dealId}
                contactId={contactId}
                contactName={contactName}
                dealTitle={undefined}
              />
            </div>
          ) : undefined
        }
        timelineSlot={
          showTabs ? <ConversationTimelineTab conversationId={conversationId} /> : undefined
        }
        callsSlot={
          showTabs ? (
            <div className="flex-1 overflow-auto p-4">
              <CallHistoryList embedded contactId={contactId} />
            </div>
          ) : undefined
        }
        keepsSlot={showTabs ? <KeepPeekPanel /> : undefined}
        composerSlot={
          <Composer
            conversationId={conversationId}
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            onSendNote={handleSendNote}
            sending={sending}
            disabled={!canReply || sessionExpiredEffective}
            placeholder={
              !canReply
                ? "Você não tem permissão para enviar mensagens neste canal."
                : undefined
            }
            isResolved={isResolved}
            contactId={contactId}
            contactName={contactName}
            dealId={dealId ?? null}
            deals={deals}
            externalTemplate={externalTemplate}
            onExternalTemplateConsumed={consumeExternalTemplate}
            onRequestTemplate={openTemplate}
            sessionExpired={sessionExpiredEffective}
            signatureAllowed={convFeatures.agentSignatureEnabled}
            signatureEditable={convFeatures.agentSignatureEditable}
            availableChannels={whatsappChannels}
            selectedChannelId={selectedChannelId}
            conversationChannelId={conversationChannelId}
            lastMessageChannelId={lastMessageChannelId}
            onSelectChannel={setSelectedChannelId}
            replyTo={replyTo}
            onCancelReply={cancelReply}
            departmentId={departmentId ?? null}
            assignedToId={assignedToId}
            requireTabulationOnClose={requireTabulationOnClose ?? false}
            onReopenNewConversation={onConversationReopened}
            onResolved={onResolved}
            conversationNumber={conversationNumber}
            enableCallPermission={enableCallPermission}
            viewersSlot={viewersSlot}
            transferSlot={transferSlot}
          />
        }
        floatingCallSlot={callFab}
      />

      <WhatsappTemplatePickerModal
        open={templateOpen}
        onClose={closeTemplate}
        conversationId={conversationId}
        channelId={selectedChannelId}
        contactName={contactName}
        onPick={(tpl) => {
          setExternalTemplate(whatsappTemplateToPending(tpl));
          setTemplateOpen(false);
        }}
      />

      {!onOpenFavorites ? (
        <FavoritesPanel
          open={favoritesOpen}
          onOpenChange={setFavoritesOpen}
          conversationId={conversationId}
        />
      ) : null}

      {pinDurationDialog}
      {confirmDialogNode}
    </>
  );
}
