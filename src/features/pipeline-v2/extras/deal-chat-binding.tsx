"use client";

/*
 * Conecta o painel direito do DealDetailPanel (tab "Conversa") a
 * uma conversa real do contato. Reusa hooks/components do
 * `inbox-v2` para nao reimplementar mensagens/envio.
 *
 * Retorna varios "slots" (messagesNode, composerNode, sessionAlertNode)
 * pra serem plugados nas props correspondentes do DealDetailPanel.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Fragment } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconChevronDown, IconLoader2, IconMessageCirclePlus, IconPinFilled, IconX } from "@tabler/icons-react";

import { AppLoading } from "@/components/crm/app-loading";
import { apiUrl } from "@/lib/api";
import { avatarInitials } from "@/lib/avatar";
import { useTeamUsers } from "@/features/inbox-v2/hooks/use-permissions";
import { useDealDetail } from "@/features/pipeline-v2/hooks/use-deal-detail";

import { ConnectionDivider, ConversationClosedMarker, DaySeparator, formatChatDayLabel, MessageBubble, StickyDayPill, TicketDivider, useStickyDayLabel, type Message as BubbleMessage } from "@/components/crm/message-bubble";
import { usesWhatsapp24hWindow } from "@/components/inbox/channel-type-icon";
import {
  EventRow,
  isConversationCloseEventText,
  isConversationOpenEventText,
  isHideableChatEvent,
  isRedundantOpenStatusEvent,
  useHideChatEvents,
} from "@/components/crm/chat-timeline";
import { SessionAlert } from "@/components/crm/session-alert";
import { usePinDurationDialog } from "@/components/crm/pin-duration-dialog";
import { formatConnectionLabel, type ConnectionRef } from "@/lib/connection-label";
import {
  Composer,
  WhatsappTemplatePickerModal,
  whatsappTemplateToPending,
  type PendingTemplate,
} from "@/features/inbox-v2/extras";
import {
  useAddNoteToLog,
  useConversationFeatures,
  useFavoriteMessage,
  useInboxRealtime,
  useMessages,
  usePinMessage,
  useUnpinMessage,
  usePinNote,
  useReactMessage,
  useSelectedOutboundChannel,
  useSendMessage,
  useWhatsappChannels,
  findLastPublicMessageChannelId,
  useChannelSession,
} from "@/features/inbox-v2/hooks";
import {
  isWhatsappComposerSessionExpired,
  lastInboundAtFromThread,
  toMessageBubble,
} from "@/features/inbox-v2/adapters";

interface DealChatBindingResult {
  messagesNode: React.ReactNode;
  composerNode: React.ReactNode;
  sessionAlertNode: React.ReactNode | undefined;
  /** Modal que precisa ficar montado em algum ancestral comum. */
  templateModal: React.ReactNode;
  /** Nota fixada na conversa, caso exista, para exibir na tab Notas. */
  pinnedNote: { id: string; content: string; senderName?: string | null; time?: string | null } | null;
  /** Banner de mensagem fixada (estilo WhatsApp) — plugar em `pinnedMessageSlot`
   *  do DealDetailPanel, entre o header de tabs e a lista de mensagens. */
  pinnedMessageSlot: React.ReactNode;
  /** Conexão atual da conversa (qual WhatsApp/conta) — para exibir no header. */
  connection: ConnectionRef | null;
}

export function useDealChatBinding(params: {
  conversationId: string | null;
  contactName: string;
  contactId?: string | null;
  /** ID do deal — usado para "Adicionar ao log". */
  dealId?: string | null;
  /**
   * Override opcional. Quando ausente, o hook deriva `sessionExpired` do
   * `session` retornado pela própria query `useMessages` (mesma fonte que o
   * /inbox usa). Mantemos o backend como source of truth quando disponível,
   * com fallback heurístico em `lastInboundAt` se o backend ficar silente.
   */
  sessionExpired?: boolean;
  /** Conversa encerrada (`status = RESOLVED`) — renderiza marcador ao fim
   *  da lista de mensagens, mesmo padrao visual do inbox (ChatArea). */
  isResolved?: boolean;
  /** ISO do encerramento — quando presente, o marcador exibe data/hora. */
  closedAt?: string | null;
  /** Nº do ticket — exibido na barra do Composer. */
  conversationNumber?: number | null;
  departmentId?: string | null;
  requireTabulationOnClose?: boolean;
}): DealChatBindingResult {
  const {
    conversationId,
    contactName,
    contactId,
    dealId,
    sessionExpired: sessionExpiredOverride,
    isResolved,
    closedAt,
    conversationNumber,
    departmentId,
    requireTabulationOnClose,
  } = params;

  const { data: session } = useSession();
  // Avatar das bolhas outgoing — mesma lógica do ChatArea do inbox: iniciais
  // via `avatarInitials` (não divergir do `senderInitials`), nome pra detectar
  // "mensagem minha", e foto fresca por nome (GET /api/users) + foto da sessão.
  const agentName = session?.user?.name?.trim() || "";
  const agentInitials = avatarInitials(agentName) || "·";
  const { data: teamUsers } = useTeamUsers();
  const senderPhotoByName = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const u of teamUsers ?? []) {
      if (u.name) map.set(u.name.trim().toLowerCase(), u.avatarUrl ?? null);
    }
    return map;
  }, [teamUsers]);
  const selfAgentImage = useMemo(() => {
    const key = agentName.toLowerCase();
    return (key ? senderPhotoByName.get(key) : null) ?? session?.user?.image ?? null;
  }, [agentName, senderPhotoByName, session]);

  const { features: convFeatures } = useConversationFeatures();

  const [draft, setDraft] = useState("");
  // Mensagem selecionada para responder (estilo WhatsApp). Reset ao trocar
  // de deal/conversa e após envio bem-sucedido.
  const [replyTo, setReplyTo] = useState<{
    id: string;
    preview: string;
    senderName?: string | null;
  } | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  // Template escolhido no modal (sessão expirada) → abre o painel no Composer.
  const [externalTemplate, setExternalTemplate] = useState<PendingTemplate | null>(null);

  // ── Auto-ensure da conversa ──────────────────────────────────────
  // Para a aba "Conversa" do deal ficar idêntica ao /inbox (composer com
  // "+"/templates funcionando mesmo em lead sem histórico), garantimos uma
  // conversa do contato quando o deal ainda não tem uma vinculada. Reusa o
  // endpoint `skipSend` (cria OU reutiliza a conversa WhatsApp do contato),
  // mesmo comportamento do deal detail legado (`ConversationsPanel`).
  const qc = useQueryClient();
  const [ensuredId, setEnsuredId] = useState<string | null>(null);
  const autoEnsuredRef = useRef(false);
  // Contato do POST em voo. O painel é reusado entre cards (o hook não
  // desmonta ao trocar de deal), então uma resposta atrasada podia vincular
  // a conversa do deal anterior ao card aberto agora.
  const ensureTargetRef = useRef<string | null>(null);

  // `contactId` chega pelo seed do board ANTES do GET /api/deals/:id
  // responder. Nesse intervalo `conversationId` ainda é null mesmo quando o
  // contato já tem ticket, e o auto-ensure abria um ticket vazio só por
  // abrir o card. Assinamos a MESMA query do detail (mesma queryKey → sem
  // request extra) só para esperar a confirmação de que não há conversa.
  const dealDetailQuery = useDealDetail(dealId ?? null);
  const dealDetailContact = dealDetailQuery.data?.contact ?? null;
  const dealDetailSettled =
    !dealId || dealDetailQuery.isSuccess || dealDetailQuery.isError;
  // Sem `dealId` o hook não tem como esperar o detail — mantém o
  // comportamento antigo para quem usa o binding fora do pipeline.
  const canAutoEnsure =
    !dealId ||
    (!!contactId &&
      dealDetailContact?.id === contactId &&
      (dealDetailContact.conversations?.length ?? 0) === 0);

  const ensureMutation = useMutation({
    mutationFn: async (cid: string) => {
      const res = await fetch(apiUrl("/api/conversations/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: cid,
          skipSend: true,
          source: "deal_chat",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Erro ao iniciar conversa");
      return data.conversation as { id: string };
    },
    onSuccess: (conv, cid) => {
      qc.invalidateQueries({ queryKey: ["contact", cid] });
      qc.invalidateQueries({ queryKey: ["conversation-timeline", conv.id] });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      if (ensureTargetRef.current !== cid) return;
      setEnsuredId(conv.id);
    },
    onError: (err: Error) => toast.error(err.message || "Falha ao iniciar conversa"),
  });

  // Reseta o controle de auto-ensure ao trocar de deal/contato.
  useEffect(() => {
    autoEnsuredRef.current = false;
    ensureTargetRef.current = null;
    setEnsuredId(null);
    setReplyTo(null);
  }, [contactId]);

  useEffect(() => {
    if (!canAutoEnsure) return;
    if (conversationId || !contactId) return;
    if (ensuredId || autoEnsuredRef.current || ensureMutation.isPending) return;
    autoEnsuredRef.current = true;
    ensureTargetRef.current = contactId;
    ensureMutation.mutate(contactId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, contactId, ensuredId, canAutoEnsure]);

  // Id efetivo: o do deal (quando já vinculado) ou o recém-garantido.
  const effectiveConversationId = conversationId ?? ensuredId;
  const ensuring =
    !effectiveConversationId &&
    !!contactId &&
    !ensureMutation.isError &&
    (ensureMutation.isPending || !dealDetailSettled || canAutoEnsure);

  const {
    data: messagesResp,
    fetchOlder,
    hasOlder,
    isFetchingOlder,
    isPending: messagesPending,
    isError: messagesFailed,
  } = useMessages(effectiveConversationId);
  const sendMutation = useSendMessage(effectiveConversationId);
  const reactMutation = useReactMessage(effectiveConversationId);
  const pinNoteMutation = usePinNote(effectiveConversationId);
  const pinMessageMutation = usePinMessage(effectiveConversationId);
  const unpinMessageMutation = useUnpinMessage(effectiveConversationId);
  const favoriteMutation = useFavoriteMessage(effectiveConversationId);
  const addToLogMutation = useAddNoteToLog(dealId ?? null);
  const { requestDuration: requestPinDuration, dialog: pinDurationDialog } = usePinDurationDialog();

  // Seletor de canal — mesmo widget/hook do /inbox. Aparece só quando a
  // org tem >1 WhatsApp CONNECTED. Default = canal "atual" da conversa.
  const { data: whatsappChannels } = useWhatsappChannels(
    !!effectiveConversationId,
  );
  const conversationChannelId = messagesResp?.channel?.id ?? null;
  const lastMessageChannelId = useMemo(
    () => findLastPublicMessageChannelId(messagesResp?.messages),
    [messagesResp?.messages],
  );
  const { selectedChannelId, setSelectedChannelId } = useSelectedOutboundChannel(
    {
      conversationId: effectiveConversationId,
      conversationChannelId,
      availableChannels: whatsappChannels,
      lastMessageChannelId,
    },
  );
  const selectedOutbound = whatsappChannels?.find((c) => c.id === selectedChannelId);
  const applyWhatsappSession = usesWhatsapp24hWindow(
    selectedOutbound?.type ?? messagesResp?.channel?.type,
  );
  const { data: selectedSession, isFetched: selectedSessionFetched } =
    useChannelSession(
      effectiveConversationId ?? null,
      selectedChannelId,
      applyWhatsappSession && !!effectiveConversationId && !!selectedChannelId,
    );

  const channelOverrideActive =
    !!selectedChannelId &&
    !!conversationChannelId &&
    selectedChannelId !== conversationChannelId;
  // Mesma regra do /inbox: inbound visível no thread reabre a janela 24h.
  const sessionInfo = messagesResp?.session;
  const sessionExpiredDerived =
    sessionExpiredOverride !== undefined
      ? sessionExpiredOverride
      : isWhatsappComposerSessionExpired({
          applyWhatsappSession,
          messagesLoaded: Boolean(messagesResp),
          channelOverrideActive,
          selectedSessionFetched,
          selectedSessionActive: selectedSession?.active,
          messagesSessionActive: sessionInfo?.active,
          messagesLastInboundAt: sessionInfo?.lastInboundAt ?? null,
          threadLastInboundAt: lastInboundAtFromThread(
            messagesResp?.messages,
            selectedChannelId,
            { strictChannel: channelOverrideActive },
          ),
        });
  const sessionExpired = !!effectiveConversationId && sessionExpiredDerived;
  // Bloco C (25/jun/26): respeita `canReply` exposto pelo backend
  // (mesma fonte que o /inbox). Compat: default true quando ausente.
  const canReply = messagesResp?.canReply ?? true;
  const { hideEvents } = useHideChatEvents();

  // SSE: assina /api/sse/messages e invalida as mensagens da conversa
  // ativa quando chega new_message. Sem isto o chat do deal só atualizava
  // após F5 (useMessages não tem polling) — o inbox já fazia isso.
  useInboxRealtime({
    activeConversationId: effectiveConversationId,
    currentUserId: session?.user?.id ?? null,
    enabled: !!effectiveConversationId,
  });

  const pinnedNoteId = messagesResp?.pinnedNoteId ?? null;
  const pinnedMessageIds = useMemo(
    () => messagesResp?.pinnedMessageIds ?? [],
    [messagesResp?.pinnedMessageIds],
  );
  const pinnedIdSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);

  const bubbles = useMemo(
    () =>
      (messagesResp?.messages ?? []).map((m) => {
        const bubble = toMessageBubble(m, contactName);
        return pinnedIdSet.has(m.id) ? { ...bubble, isPinnedMessage: true } : bubble;
      }),
    [messagesResp, contactName, pinnedIdSet],
  );

  // Nota fixada — usada pela tab Notas do deal.
  const pinnedNote = useMemo(() => {
    if (!pinnedNoteId) return null;
    const raw = (messagesResp?.messages ?? []).find((m) => m.id === pinnedNoteId);
    if (!raw) return null;
    return {
      id: raw.id,
      content: raw.content,
      senderName: raw.senderName ?? null,
      time: raw.createdAt ? new Date(raw.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null,
    };
  }, [pinnedNoteId, messagesResp]);

  // Mensagens fixadas no topo (várias, estilo WhatsApp) — banner exibido
  // via `pinnedMessageSlot` no DealDetailPanel.
  const pinnedMessagesPreview = useMemo(() => {
    return pinnedMessageIds
      .map((pid) => bubbles.find((m) => m.id === pid))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({ id: m.id, content: m.content, senderName: m.senderName ?? null }));
  }, [pinnedMessageIds, bubbles]);

  // Banner cicla entre as fixadas e rola até a mensagem (+ highlight).
  const [activePinIndex, setActivePinIndex] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (activePinIndex >= pinnedMessagesPreview.length && pinnedMessagesPreview.length > 0) {
      setActivePinIndex(0);
    }
  }, [pinnedMessagesPreview.length, activePinIndex]);

  // ── Scroll até o fim + botão flutuante "descer" (estilo WhatsApp) ────
  // O chat do deal fica num drawer e o container rolável (overflow-y-auto)
  // é do DealDetailPanel, não deste hook. Então localizamos esse container
  // subindo a partir da âncora `bottomRef` e ajustamos o scrollTop direto.
  // Mesmo comportamento do inbox (ChatArea): rola ao enviar/receber quando
  // perto do fim; se o operador está lendo histórico e o cliente escreve,
  // mostra o botão com o contador em vez de puxar a tela.
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const findScrollEl = useCallback(() => {
    if (scrollElRef.current?.isConnected) return scrollElRef.current;
    let el: HTMLElement | null = bottomRef.current?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") {
        scrollElRef.current = el;
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }, []);

  const stickyDayLabel = useStickyDayLabel(
    findScrollEl,
    `${effectiveConversationId ?? ""}:${bubbles.length}`,
  );

  const scrollToEnd = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = findScrollEl();
      if (!el) {
        bottomRef.current?.scrollIntoView({ behavior, block: "end" });
      } else {
        requestAnimationFrame(() =>
          el.scrollTo({ top: el.scrollHeight, behavior }),
        );
      }
      setShowScrollDown(false);
      setUnreadCount(0);
    },
    [findScrollEl],
  );

  // Esconde o botão quando o operador chega perto do fim manualmente.
  useEffect(() => {
    const el = findScrollEl();
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (nearBottom) {
        setShowScrollDown(false);
        setUnreadCount(0);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [findScrollEl, effectiveConversationId, bubbles.length > 0]);

  const fetchOlderRef = useRef(fetchOlder);
  fetchOlderRef.current = fetchOlder;
  const [olderArmed, setOlderArmed] = useState(false);
  useEffect(() => {
    setOlderArmed(false);
  }, [effectiveConversationId]);
  useEffect(() => {
    if (!hasOlder || isFetchingOlder || !olderArmed) return;
    const el = findScrollEl();
    if (!el) return;
    const load = () => void fetchOlderRef.current();
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && el.scrollTop <= 0) load();
    };
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (y - startY > 24 && el.scrollTop <= 0) load();
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [findScrollEl, hasOlder, isFetchingOlder, olderArmed]);

  const prevFirstIdRef = useRef<string | null>(null);
  const prevLastIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef(0);
  useLayoutEffect(() => {
    const el = findScrollEl();
    if (!el) return;
    const firstId = bubbles[0]?.id ?? null;
    const lastId = bubbles[bubbles.length - 1]?.id ?? null;
    const prepended =
      prevFirstIdRef.current != null &&
      firstId !== prevFirstIdRef.current &&
      lastId === prevLastIdRef.current;
    if (prepended) {
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
    }
    prevScrollHeightRef.current = el.scrollHeight;
  }, [bubbles, findScrollEl]);
  useEffect(() => {
    const el = findScrollEl();
    const firstId = bubbles[0]?.id ?? null;
    const last = bubbles[bubbles.length - 1];
    const lastId = last?.id ?? null;
    const prevFirst = prevFirstIdRef.current;
    const prevLast = prevLastIdRef.current;
    prevFirstIdRef.current = firstId;
    prevLastIdRef.current = lastId;

    if (lastId === prevLast) return;

    const isSwitchOrInitial = prevLast === null || firstId !== prevFirst;
    if (isSwitchOrInitial) {
      // Dois rAFs: espera o layout refletir as bolhas antes de rolar.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const e = findScrollEl();
          if (e) e.scrollTop = e.scrollHeight;
          if (bubbles.length > 0) setOlderArmed(true);
        }),
      );
      setShowScrollDown(false);
      setUnreadCount(0);
      return;
    }

    const nearBottom = el
      ? el.scrollHeight - el.scrollTop - el.clientHeight < 200
      : true;
    const ownMessage = last?.type === "outgoing";
    if (ownMessage || nearBottom) {
      scrollToEnd("smooth");
    } else {
      setShowScrollDown(true);
      setUnreadCount((n) => n + 1);
    }
  }, [bubbles, effectiveConversationId, findScrollEl, scrollToEnd]);

  const scrollToMessage = useCallback((messageId: string) => {
    // O chat do deal fica num drawer; pode haver a mesma âncora montada no
    // inbox por baixo. Pega a ÚLTIMA ocorrência no DOM (o drawer é renderizado
    // depois) pra rolar dentro do painel certo.
    const els = document.querySelectorAll<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    );
    const el = els[els.length - 1];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(messageId);
    window.setTimeout(() => setHighlightId((cur) => (cur === messageId ? null : cur)), 1600);
  }, []);

  const handleBannerClick = useCallback(() => {
    if (pinnedMessagesPreview.length === 0) return;
    const idx = Math.min(activePinIndex, pinnedMessagesPreview.length - 1);
    const current = pinnedMessagesPreview[idx];
    if (current) scrollToMessage(current.id);
    if (pinnedMessagesPreview.length > 1) {
      setActivePinIndex((i) => (i + 1) % pinnedMessagesPreview.length);
    }
  }, [pinnedMessagesPreview, activePinIndex, scrollToMessage]);

  async function handleSend(value?: string) {
    // Composer passa o texto já com assinatura; fallback no draft local.
    const t = (value ?? draft).trim();
    if (!t || !effectiveConversationId) return;
    try {
      await sendMutation.mutateAsync({
        content: t,
        ...(replyTo ? { replyToId: replyTo.id } : {}),
        // Override só quando o canal escolhido difere do atual da conversa.
        ...(selectedChannelId && selectedChannelId !== conversationChannelId
          ? { channelId: selectedChannelId }
          : {}),
      });
      setDraft("");
      setReplyTo(null);
    } catch (e) {
      toast.error((e as Error)?.message || "Falha ao enviar");
      throw e;
    }
  }

  // Handler do botão "Responder" — deriva o nome do citado a partir da
  // própria bolha (o backend não retorna esse campo diretamente).
  function handleReply(message: BubbleMessage) {
    const preview = (message.content ?? "").slice(0, 120);
    const senderName =
      message.type === "incoming"
        ? contactName
        : message.senderName ?? "Você";
    setReplyTo({ id: message.id, preview, senderName });
  }

  // Reagir dispara no /inbox e tambem aqui (drawer do pipeline). Mesma
  // rota de backend (`/api/messages/:ref/reactions`), mesma mutation.
  // `emoji` vazio = remocao (toggle-off).
  function handleReact(message: BubbleMessage, emoji: string | null) {
    if (!effectiveConversationId) return;
    // `null` = abrir picker (UI); não POST. `""` = remover reação.
    if (emoji == null) return;
    reactMutation.mutate(
      { messageId: message.id, emoji },
      {
        onError: (err) => toast.error(err.message || "Falha ao reagir"),
      },
    );
  }

  // Fixar: mesma rota/mutation do /inbox. Clicar numa já fixada desafixa.
  // Várias podem ficar fixadas ao mesmo tempo (máx. 3).
  async function handlePinMessage(message: BubbleMessage) {
    if (!effectiveConversationId) return;
    if (message.isPinnedMessage) {
      unpinMessageMutation.mutate(
        { messageId: message.id },
        {
          onSuccess: () => toast.success("Mensagem desafixada"),
          onError: (err) => toast.error(err.message || "Falha ao desafixar"),
        },
      );
      return;
    }
    const durationHours = await requestPinDuration();
    if (durationHours == null) return;
    pinMessageMutation.mutate(
      { messageId: message.id, durationHours },
      {
        onSuccess: () => toast.success("Mensagem fixada"),
        onError: (err) => toast.error(err.message || "Falha ao fixar"),
      },
    );
  }

  function handleUnpinMessage(messageId: string) {
    if (!effectiveConversationId) return;
    unpinMessageMutation.mutate(
      { messageId },
      { onError: (err) => toast.error(err.message || "Falha ao desafixar") },
    );
  }

  function handleFavorite(message: BubbleMessage) {
    favoriteMutation.mutate(
      { messageId: message.id, favorite: !message.isFavorited },
      {
        onSuccess: (res) =>
          toast.success(res.favorited ? "Mensagem favoritada" : "Removida dos favoritos"),
        onError: (err) => toast.error(err.message || "Falha ao favoritar"),
      },
    );
  }

  function handleSendNote() {
    const t = draft.trim();
    if (!t || !effectiveConversationId) return;
    sendMutation.mutate(
      { content: t, asNote: true },
      {
        onSuccess: () => setDraft(""),
        onError: (e: Error) => toast.error(e.message || "Falha ao salvar nota"),
      },
    );
  }

  // ── messages ────────────────────────────────────────────────
  let messagesNode: React.ReactNode;
  if (!effectiveConversationId) {
    messagesNode = ensuring ? (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--text-muted)]">
        <IconLoader2 size={22} className="animate-spin" />
        <p className="font-display text-[13px]">Iniciando conversa…</p>
      </div>
    ) : (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]">
          <IconMessageCirclePlus size={28} />
        </div>
        <h3 className="mt-4 font-display text-[15px] font-bold text-[var(--text-primary)]">
          Sem conversa vinculada
        </h3>
        <p className="mt-1.5 max-w-[340px] font-display text-[13px] leading-relaxed text-[var(--text-muted)]">
          Este negócio ainda não tem contato com WhatsApp. Vincule um contato
          com telefone para conversar por aqui.
        </p>
        <Link
          href="/inbox"
          className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-[var(--brand-primary)] px-5 py-2.5 font-display text-[13px] font-bold text-white shadow-[var(--glass-shadow-sm)] transition-opacity hover:opacity-90"
        >
          <IconMessageCirclePlus size={16} />
          Abrir Caixa de Entrada
        </Link>
      </div>
    );
  } else if (messagesPending && !messagesResp) {
    messagesNode = (
      <AppLoading variant="inline" className="min-h-[240px]" label="Carregando mensagens" timeoutMs={0} />
    );
  } else if (messagesFailed && !messagesResp) {
    messagesNode = (
      <AppLoading
        variant="inline"
        className="min-h-[240px]"
        error="Não foi possível carregar as mensagens."
      />
    );
  } else if (bubbles.length === 0) {
    messagesNode = (
      <>
        <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
          Nenhuma mensagem ainda.
        </div>
        {isResolved && (
          <ConversationClosedMarker
            closedAt={closedAt ?? null}
            conversationNumber={conversationNumber}
          />
        )}
        <div ref={bottomRef} />
      </>
    );
  } else {
    // Marca troca de conexão só quando há 2+ contas distintas na conversa.
    const channelsMap = messagesResp?.channels ?? {};
    const distinctChannels = new Set(
      bubbles.map((b) => b.channelId).filter(Boolean) as string[],
    );
    const showConnSwitches = distinctChannels.size >= 2;
    let lastChannelId: string | null = null;
    let lastDayLabel: string | null = null;
    let lastLane: "in" | "out" | "other" | null = null;
    const hasPersistedClose = bubbles.some(
      (m) => m.kind === "event" && isConversationCloseEventText(m.content),
    );
    const sectionHasEvent = (
      from: number,
      pred: (content: string) => boolean,
    ) => {
      for (let i = from + 1; i < bubbles.length; i++) {
        const m = bubbles[i];
        if (m.messageType === "ticket-separator") break;
        if (m.kind === "event" && pred(m.content ?? "")) return true;
      }
      return false;
    };
    const bubbleNodes = bubbles.map((b, index) => {
      // Separador de ticket sintético (?history=1) — mesma lógica do ChatArea
      // do inbox. Sem isto o item vira uma BOLHA VAZIA no chat do deal.
      if (b.messageType === "ticket-separator" && b.ticketInfo) {
        const info = b.ticketInfo;
        const hideDivider = info.isCurrent
          ? sectionHasEvent(index, (c) =>
              isConversationOpenEventText(c, info.number),
            )
          : sectionHasEvent(index, isConversationCloseEventText);
        if (hideDivider) return null;
        lastLane = null;
        return (
          <li key={b.id || `sep-${index}`} className="list-none">
            <TicketDivider
              number={info.number}
              closedAt={info.closedAt}
              isCurrent={info.isCurrent}
              openedAt={info.openedAt}
              openedByName={info.openedByName}
              openedByUserId={info.openedByUserId}
              closedByName={info.closedByName}
              closedByUserId={info.closedByUserId}
            />
          </li>
        );
      }
      // Só renderiza bolhas reais (incoming/outgoing). Descarta itens
      // sintéticos/desconhecidos que, sem conteúdo, apareciam em branco.
      if (b.type !== "incoming" && b.type !== "outgoing") {
        return null;
      }
      if (b.kind === "event" && isRedundantOpenStatusEvent(b.content)) {
        return null;
      }
      if (hideEvents && isHideableChatEvent(b)) {
        return null;
      }
      const dayLabel = formatChatDayLabel(b.createdAt);
      const isNewDay = Boolean(dayLabel && dayLabel !== lastDayLabel);
      const showDay = isNewDay && lastDayLabel !== null;
      if (isNewDay && dayLabel) lastDayLabel = dayLabel;
      let connLabel: string | null = null;
      if (showConnSwitches && b.channelId && b.channelId !== lastChannelId) {
        const ref = channelsMap[b.channelId];
        if (ref) connLabel = formatConnectionLabel(ref);
        lastChannelId = b.channelId;
      }
      const isNoteBubble = b.isNote === true;
      const isEvent = b.kind === "event";
      const lane: "in" | "out" | "other" =
        isEvent || isNoteBubble ? "other" : b.type === "outgoing" ? "out" : "in";
      const clusterBreak = !showDay && lastLane !== null && lastLane !== lane;
      lastLane = lane;
      return (
        <Fragment key={b.id}>
          {showDay && dayLabel ? (
            <li className="pointer-events-none list-none" data-day-label={dayLabel}>
              <DaySeparator date={dayLabel} />
            </li>
          ) : null}
        <li className={`list-none${clusterBreak ? " mt-2" : ""}`} data-day-label={dayLabel || undefined}>
          {connLabel && <ConnectionDivider label={connLabel} />}
          <div
            data-message-id={b.id}
            className={
              highlightId === b.id
                ? "flex flex-col scroll-mt-24 rounded-[var(--radius-lg)] bg-[var(--brand-primary)]/10 shadow-[0_0_0_2px_var(--brand-primary)] transition-[background-color,box-shadow] duration-500"
                : "flex flex-col scroll-mt-24 rounded-[var(--radius-lg)] transition-[background-color,box-shadow] duration-500"
            }
          >
          {isEvent ? (
            <EventRow
              action={b.eventAction ?? "ia"}
              text={b.content}
              actor={b.senderName ?? ""}
              actorId={b.senderUserId}
              time={b.time}
            />
          ) : (
          <MessageBubble
            message={b}
            agentInitials={agentInitials}
            agentName={agentName}
            agentImageUrl={selfAgentImage}
            senderPhotoByName={senderPhotoByName}
            isPinned={isNoteBubble && b.id === pinnedNoteId}
            onPinNote={
              isNoteBubble && effectiveConversationId
                ? (noteId) => pinNoteMutation.mutate({ noteId })
                : undefined
            }
            onAddToLog={
              isNoteBubble && dealId
                ? (content) =>
                    addToLogMutation.mutate(
                      { content },
                      { onSuccess: () => toast.success("Nota adicionada ao log do negócio") },
                    )
                : undefined
            }
            onReplyMessage={isNoteBubble ? undefined : handleReply}
            onReactMessage={isNoteBubble ? undefined : handleReact}
            onPinMessage={isNoteBubble ? undefined : handlePinMessage}
            onFavoriteMessage={isNoteBubble ? undefined : handleFavorite}
          />
          )}
          </div>
        </li>
        </Fragment>
      );
    });
    messagesNode = (
      <div className="flex min-h-full flex-col">
        <StickyDayPill date={stickyDayLabel} loading={isFetchingOlder} paused={!olderArmed} />
        <div className="min-h-0 flex-1" aria-hidden />
        <ul className="flex list-none flex-col gap-0.5">
          {hasOlder && olderArmed && !isFetchingOlder && (
            <li className="list-none pb-1 text-center text-[11px] text-muted-foreground">
              ↑ Role para ver mensagens anteriores
            </li>
          )}
          {bubbleNodes}
        </ul>
        {isResolved && !hasPersistedClose && (
          <ConversationClosedMarker
            closedAt={closedAt ?? null}
            conversationNumber={conversationNumber}
          />
        )}
        <div ref={bottomRef} />
        {showScrollDown && (
          <div className="pointer-events-none sticky bottom-2 z-20 -mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => scrollToEnd("smooth")}
              aria-label={
                unreadCount > 0
                  ? `${unreadCount} mensagens não lidas — ir para o fim`
                  : "Ir para a última mensagem"
              }
              className="pointer-events-auto relative flex size-10 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-px hover:text-[var(--brand-primary)] active:scale-95"
            >
              <IconChevronDown size={20} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[10px] font-bold leading-none text-primary-foreground shadow-[var(--shadow-sm)] tabular-nums">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── composer ────────────────────────────────────────────────
  const composerNode = effectiveConversationId ? (
    <Composer
      conversationId={effectiveConversationId}
      value={draft}
      onChange={setDraft}
      onSend={handleSend}
      onSendNote={handleSendNote}
      sending={sendMutation.isPending}
      disabled={!canReply || !!sessionExpired}
      placeholder={
        !canReply
          ? "Você não tem permissão para enviar mensagens neste canal."
          : undefined
      }
      contactId={contactId}
      contactName={contactName}
      dealId={dealId}
      dealTitle={undefined}
      deals={dealId ? [{ id: dealId, title: "Negócio atual" }] : undefined}
      externalTemplate={externalTemplate}
      onExternalTemplateConsumed={() => setExternalTemplate(null)}
      onRequestTemplate={() => setTemplateOpen(true)}
      sessionExpired={!!sessionExpired}
      signatureAllowed={convFeatures.agentSignatureEnabled}
      signatureEditable={convFeatures.agentSignatureEditable}
      availableChannels={whatsappChannels}
      selectedChannelId={selectedChannelId}
      conversationChannelId={conversationChannelId}
      lastMessageChannelId={lastMessageChannelId}
      onSelectChannel={setSelectedChannelId}
      replyTo={replyTo}
      onCancelReply={() => setReplyTo(null)}
      isResolved={isResolved}
      conversationNumber={conversationNumber ?? null}
      departmentId={departmentId ?? null}
      requireTabulationOnClose={requireTabulationOnClose ?? false}
      enableCallPermission={applyWhatsappSession}
    />
  ) : null;

  // ── session alert (opcional) ────────────────────────────────
  const sessionAlertNode = sessionExpired
    ? <SessionAlert onUseTemplate={() => setTemplateOpen(true)} />
    : null;

  // ── template picker modal ───────────────────────────────────
  const templateModal = (
    <>
      <WhatsappTemplatePickerModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        conversationId={effectiveConversationId ?? null}
        channelId={selectedChannelId}
        contactName={contactName}
        onPick={(tpl) => {
          setExternalTemplate(whatsappTemplateToPending(tpl));
          setTemplateOpen(false);
        }}
      />
      {/* Picker de duração do "Fixar" (24h/7d/30d, estilo WhatsApp) —
          o painel "Mensagens favoritas" fica no kebab do DealDetailPanel
          (TabsBar), que já tem `conversationId` disponível. */}
      {pinDurationDialog}
    </>
  );

  // ── banner de mensagens fixadas (várias, estilo WhatsApp) ─────
  const pinnedMessageSlot = pinnedMessagesPreview.length > 0 ? (() => {
    const idx = Math.min(activePinIndex, pinnedMessagesPreview.length - 1);
    const current = pinnedMessagesPreview[idx];
    return (
      <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.06] px-3 py-2">
        <IconPinFilled size={14} className="shrink-0 text-[var(--brand-primary)]" />
        <button
          type="button"
          onClick={handleBannerClick}
          className="min-w-0 flex-1 cursor-pointer text-left"
          aria-label="Ir para a mensagem fixada"
        >
          <p className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-[var(--brand-primary)]">
            Mensagem fixada
            {pinnedMessagesPreview.length > 1 && (
              <span className="rounded-full bg-[var(--brand-primary)]/15 px-1.5 py-px text-[9px] tabular-nums">
                {idx + 1}/{pinnedMessagesPreview.length}
              </span>
            )}
          </p>
          <p className="truncate text-[12.5px] text-[var(--text-secondary)]">
            {current.senderName ? `${current.senderName}: ` : ""}
            {current.content}
          </p>
        </button>
        <button
          type="button"
          onClick={() => handleUnpinMessage(current.id)}
          aria-label="Desafixar mensagem"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)]"
        >
          <IconX size={14} />
        </button>
      </div>
    );
  })() : null;

  return {
    messagesNode,
    composerNode,
    sessionAlertNode,
    templateModal,
    pinnedNote,
    pinnedMessageSlot,
    connection: messagesResp?.channel ?? null,
  };
}
