// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";

/**
 * O host é a ligação de dados de UMA conversa (ChatArea + Composer). Os
 * hooks do inbox-v2 e os componentes pesados são mockados: aqui só
 * interessa QUE props chegam ao ChatArea/Composer/kebab e o que o host
 * dispara ao abrir/enviar (marcar lida, realtime, reabertura, 24h).
 */

const h = vi.hoisted(() => {
  const chatAreaProps: any[] = [];
  const composerProps: any[] = [];
  const kebabProps: any[] = [];
  const notesTabProps: any[] = [];
  return {
    chatAreaProps,
    composerProps,
    kebabProps,
    notesTabProps,
    messagesData: null as any,
    useMessages: vi.fn(),
    sendMutate: vi.fn(),
    sendMutateAsync: vi.fn(),
    reactMutate: vi.fn(),
    pinMutate: vi.fn(),
    unpinMutate: vi.fn(),
    favoriteMutate: vi.fn(),
    markReadMutate: vi.fn(),
    useInboxRealtime: vi.fn(),
    useWhatsappChannels: vi.fn(),
    useSelectedOutboundChannel: vi.fn(),
    useChannelSession: vi.fn(),
    isSessionExpired: vi.fn(),
    requestPinDuration: vi.fn(),
    clearBoardUnreadForContact: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    pinNoteMutate: vi.fn(),
    updateNoteMutateAsync: vi.fn(),
    deleteNoteMutateAsync: vi.fn(),
    addToLogMutate: vi.fn(),
    confirmDialog: vi.fn(),
  };
});

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "user-1", name: "Agente" } },
    status: "authenticated",
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: h.toastError, success: h.toastSuccess },
}));

vi.mock("@/features/inbox-v2/hooks", async () => {
  // Regra real de 24h × Baileys (só o `type` do canal é mockado abaixo).
  const channels = await vi.importActual<
    typeof import("@/features/inbox-v2/hooks/use-channels")
  >("@/features/inbox-v2/hooks/use-channels");
  // Estável entre renders (como o `useCallback` real); delega ao mesmo mock.
  const markReadIfUnread = (id: string, opts?: unknown) => {
    h.markReadMutate(id, opts);
    return true;
  };
  return {
    useMessages: h.useMessages,
    useSendMessage: () => ({
      mutate: h.sendMutate,
      mutateAsync: h.sendMutateAsync,
      isPending: false,
    }),
    useReactMessage: () => ({ mutate: h.reactMutate }),
    usePinMessage: () => ({ mutate: h.pinMutate }),
    useUnpinMessage: () => ({ mutate: h.unpinMutate }),
    useFavoriteMessage: () => ({ mutate: h.favoriteMutate }),
    usePinNote: () => ({ mutate: h.pinNoteMutate }),
    useUpdateNote: () => ({ mutateAsync: h.updateNoteMutateAsync }),
    useDeleteNote: () => ({ mutateAsync: h.deleteNoteMutateAsync }),
    useAddNoteToLog: () => ({ mutate: h.addToLogMutate }),
    useConversationFeatures: () => ({
      features: { agentSignatureEnabled: true, agentSignatureEditable: false },
    }),
    useInboxRealtime: h.useInboxRealtime,
    useMarkConversationRead: () => ({ mutate: h.markReadMutate }),
    useMarkConversationReadIfUnread: () => markReadIfUnread,
    useWhatsappChannels: h.useWhatsappChannels,
    useSelectedOutboundChannel: h.useSelectedOutboundChannel,
    useChannelSession: h.useChannelSession,
    findLastPublicMessageChannelId: () => "ch-1",
    resolveWhatsappSessionScope: channels.resolveWhatsappSessionScope,
  };
});

vi.mock("@/features/inbox-v2/hooks/use-conversation-typing", () => ({
  useConversationTyping: () => null,
}));

vi.mock("@/features/inbox-v2/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/inbox-v2/adapters")>();
  return {
    ...actual,
    toMessageBubble: (m: any, contactName: string) => ({
      id: m.id,
      content: m.content,
      time: "10:00",
      type: m.direction === "in" ? "incoming" : "outgoing",
      senderName: m.direction === "in" ? contactName : "Agente",
      isNote: m.messageType === "note",
    }),
    lastInboundAtFromThread: () => null,
    isWhatsappComposerSessionExpired: h.isSessionExpired,
  };
});

vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => ({ confirm: h.confirmDialog, dialog: null }),
}));

vi.mock("@/components/crm/chat-area", () => ({
  ChatArea: (props: any) => {
    h.chatAreaProps.push(props);
    return (
      <div data-testid="chat-area" data-conversation={props.conversationId}>
        <div data-testid="header-actions">{props.headerActionsSlot}</div>
        <div data-testid="composer-slot">{props.composerSlot}</div>
        <div data-testid="fab-slot">{props.floatingCallSlot}</div>
        <div data-testid="notes-slot">{props.notesSlot}</div>
      </div>
    );
  },
}));

vi.mock("../composer", () => ({
  Composer: (props: any) => {
    h.composerProps.push(props);
    return (
      <div data-testid="composer" data-conversation={props.conversationId}>
        {props.transferSlot}
        {props.viewersSlot}
      </div>
    );
  },
}));

vi.mock("../conversation-actions-menu", () => ({
  ConversationActionsMenu: (props: any) => {
    h.kebabProps.push(props);
    return (
      <button type="button" data-testid="kebab-favorites" onClick={props.onOpenFavorites}>
        favoritas
      </button>
    );
  },
}));

vi.mock("../conversation-timeline-tab", () => ({
  ConversationTimelineTab: () => <div data-testid="timeline-tab" />,
}));

vi.mock("../template-picker-popover", () => ({
  WhatsappTemplatePickerModal: (props: any) =>
    props.open ? <div data-testid="template-modal" /> : null,
}));

vi.mock("../template-compose-panel", () => ({
  whatsappTemplateToPending: (tpl: unknown) => tpl,
}));

vi.mock("../channel-switch-confirm", () => ({
  SESSION_CLOSED_TOAST: "Sessão de 24h encerrada.",
  isSessionClosedError: (err: unknown) =>
    (err as { code?: string } | null)?.code === "SESSION_CLOSED",
}));

vi.mock("@/components/crm/favorites-panel", () => ({
  FavoritesPanel: (props: any) =>
    props.open ? <div data-testid="favorites-panel" data-conversation={props.conversationId} /> : null,
}));

vi.mock("@/components/crm/pin-duration-dialog", () => ({
  usePinDurationDialog: () => ({ requestDuration: h.requestPinDuration, dialog: null }),
}));

vi.mock("@/components/inbox/channel-type-icon", () => ({
  usesWhatsapp24hWindow: (type?: string | null) => type === "WHATSAPP",
}));

vi.mock("@/components/pipeline/deal-workspace/panels/activities", () => ({
  ActivitiesPanel: () => <div data-testid="activities-tab" />,
}));

vi.mock("@/features/keeps/keep-peek-panel", () => ({
  KeepPeekPanel: () => <div data-testid="keeps-tab" />,
}));

vi.mock("@/features/pipeline-v2/extras/deal-notes-tab", () => ({
  DealNotesTab: (props: any) => {
    h.notesTabProps.push(props);
    return <div data-testid="notes-tab" data-deal={props.dealId} />;
  },
}));

vi.mock("@/features/pipeline-v2/hooks/use-pipeline-realtime", () => ({
  clearBoardUnreadForContact: h.clearBoardUnreadForContact,
}));

vi.mock("@/features/softphone/components/call-history-list", () => ({
  CallHistoryList: () => <div data-testid="calls-tab" />,
}));

vi.mock("@/features/softphone/components/deal-call-button", () => ({
  DealCallButton: (props: any) => (
    <div data-testid="call-fab" data-deal={props.dealId} data-phone={props.phone ?? ""} />
  ),
}));

import { ConversationChatHost } from "../conversation-chat-host";

const actualAdapters = await vi.importActual<typeof import("@/features/inbox-v2/adapters")>(
  "@/features/inbox-v2/adapters",
);

type HostProps = ComponentProps<typeof ConversationChatHost>;

const baseProps: HostProps = {
  conversationId: "conv-1",
  conversation: {
    status: "OPEN",
    number: 42,
    closedAt: null,
    lastInboundAt: "2026-09-29T10:00:00.000Z",
    assignedToId: "user-2",
  },
  contact: { id: "contact-1", name: "Maria", phone: "+5511999990000", channel: "whatsapp" },
  dealId: "deal-1",
  pipelineId: "pipe-1",
  departmentId: "dept-1",
  requireTabulationOnClose: true,
};

function renderHost(overrides: Partial<HostProps> = {}) {
  const qc = new QueryClient();
  const props = { ...baseProps, ...overrides };
  const wrap = (p: HostProps) => (
    <QueryClientProvider client={qc}>
      <ConversationChatHost {...p} />
    </QueryClientProvider>
  );
  const utils = render(wrap(props));
  return {
    ...utils,
    qc,
    rerenderWith: (next: Partial<HostProps> = {}) => utils.rerender(wrap({ ...props, ...next })),
  };
}

const lastChatArea = () => h.chatAreaProps[h.chatAreaProps.length - 1];
const lastComposer = () => h.composerProps[h.composerProps.length - 1];
const lastKebab = () => h.kebabProps[h.kebabProps.length - 1];

beforeEach(() => {
  h.chatAreaProps.length = 0;
  h.composerProps.length = 0;
  h.kebabProps.length = 0;
  h.notesTabProps.length = 0;
  vi.clearAllMocks();

  h.messagesData = {
    messages: [
      { id: "m1", content: "Oi", direction: "in", createdAt: "2026-09-29T10:00:00.000Z" },
      { id: "m2", content: "Olá!", direction: "out", createdAt: "2026-09-29T10:01:00.000Z" },
    ],
    pinnedNoteId: null,
    pinnedMessageIds: ["m1"],
    channelProvider: "META_CLOUD",
    channel: { id: "ch-1", name: "WABA principal", type: "WHATSAPP" },
    channels: {},
    canReply: true,
    session: { active: true, lastInboundAt: "2026-09-29T10:00:00.000Z" },
  };
  h.useMessages.mockImplementation(() => ({
    data: h.messagesData,
    fetchOlder: vi.fn(),
    hasOlder: true,
    hasOlderTickets: false,
    isFetchingOlder: false,
    isPending: false,
    isError: false,
  }));
  h.sendMutateAsync.mockResolvedValue({ message: { id: "m3" } });
  h.useWhatsappChannels.mockReturnValue({
    data: [
      { id: "ch-1", name: "WABA principal", type: "WHATSAPP", provider: "META_CLOUD", status: "CONNECTED", phoneNumber: null },
      { id: "ch-2", name: "WABA acadêmico", type: "WHATSAPP", provider: "META_CLOUD", status: "CONNECTED", phoneNumber: null },
    ],
  });
  h.useSelectedOutboundChannel.mockReturnValue({
    selectedChannelId: "ch-1",
    setSelectedChannelId: vi.fn(),
  });
  h.useChannelSession.mockReturnValue({ data: { active: true }, isFetched: true });
  // Regra real por padrão; testes específicos forçam o resultado.
  h.isSessionExpired.mockImplementation(actualAdapters.isWhatsappComposerSessionExpired);
  h.requestPinDuration.mockResolvedValue(24);
  h.updateNoteMutateAsync.mockResolvedValue({ id: "n1", content: "novo" });
  h.deleteNoteMutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("ConversationChatHost — montagem", () => {
  it("renderiza ChatArea e Composer com as props da conversa", () => {
    renderHost({
      headerActionsSlot: <span data-testid="page-actions">ações</span>,
      viewersSlot: <span data-testid="viewers" />,
      transferSlot: <span data-testid="transfer" />,
    });

    const chat = lastChatArea();
    expect(chat.conversationId).toBe("conv-1");
    expect(chat.conversationNumber).toBe(42);
    expect(chat.conversationResolved).toBe(false);
    expect(chat.contact).toEqual({
      name: "Maria",
      contactId: "contact-1",
      phone: "+5511999990000",
      channel: "whatsapp",
    });
    expect(chat.messages.map((m: any) => m.id)).toEqual(["m1", "m2"]);
    // Fixadas: flag na bolha + preview do banner.
    expect(chat.messages[0].isPinnedMessage).toBe(true);
    expect(chat.pinnedMessages).toEqual([{ id: "m1", content: "Oi", senderName: "Maria" }]);
    expect(chat.hasOlder).toBe(true);
    expect(chat.connection).toEqual(h.messagesData.channel);
    expect(chat.showSessionAlert).toBe(false);
    expect(chat.messagesLoading).toBe(false);

    const composer = lastComposer();
    expect(composer.conversationId).toBe("conv-1");
    expect(composer.disabled).toBe(false);
    expect(composer.isResolved).toBe(false);
    // Funil: "+" nunca tem Finalizar/Reabrir; o botão ✓ segue a chave de
    // Configurações › Conversas (ausente no mock = visível).
    expect(composer.hideResolveInMenu).toBe(true);
    expect(composer.hideResolveButton).toBe(false);
    expect(composer.contactId).toBe("contact-1");
    expect(composer.dealId).toBe("deal-1");
    expect(composer.deals).toEqual([{ id: "deal-1", title: "Negócio atual" }]);
    expect(composer.departmentId).toBe("dept-1");
    expect(composer.requireTabulationOnClose).toBe(true);
    expect(composer.assignedToId).toBe("user-2");
    expect(composer.signatureAllowed).toBe(true);
    expect(composer.signatureEditable).toBe(false);
    expect(composer.selectedChannelId).toBe("ch-1");
    expect(composer.conversationChannelId).toBe("ch-1");
    expect(composer.enableCallPermission).toBe(true);
    expect(composer.conversationNumber).toBe(42);
    // Slots do Composer chegam pela linha de abas.
    expect(screen.getByTestId("viewers")).toBeTruthy();
    expect(screen.getByTestId("transfer")).toBeTruthy();

    // Header: slot da página ANTES do kebab canônico.
    const header = screen.getByTestId("header-actions");
    expect(header.querySelector('[data-testid="page-actions"]')).toBeTruthy();
    expect(header.querySelector('[data-testid="kebab-favorites"]')).toBeTruthy();
    const kebab = lastKebab();
    expect(kebab.conversationId).toBe("conv-1");
    expect(kebab.isResolved).toBe(false);
    expect(kebab.dealId).toBe("deal-1");

    // FAB default (há dealId) e abas do deal.
    expect(screen.getByTestId("call-fab").getAttribute("data-deal")).toBe("deal-1");
    expect(screen.getByTestId("notes-tab").getAttribute("data-deal")).toBe("deal-1");
    expect(chat.activitiesSlot).toBeTruthy();
    expect(chat.timelineSlot).toBeTruthy();
    expect(chat.callsSlot).toBeTruthy();
    expect(chat.keepsSlot).toBeTruthy();
  });

  it("sem dealId não há FAB nem abas Notas/Tarefas; floatingCallSlot=null esconde o FAB", () => {
    renderHost({ dealId: null });
    expect(screen.queryByTestId("call-fab")).toBeNull();
    expect(lastChatArea().notesSlot).toBeUndefined();
    expect(lastChatArea().activitiesSlot).toBeUndefined();
    expect(lastChatArea().onAddToLog).toBeUndefined();
    expect(lastComposer().deals).toBeUndefined();

    cleanup();
    renderHost({ floatingCallSlot: null });
    expect(screen.queryByTestId("call-fab")).toBeNull();
  });

  it("showActionsMenu=false não renderiza o kebab; showTabs=false tira as abas", () => {
    renderHost({ showActionsMenu: false, showTabs: false });
    expect(screen.queryByTestId("kebab-favorites")).toBeNull();
    expect(lastChatArea().headerActionsSlot).toBeUndefined();
    expect(lastChatArea().timelineSlot).toBeUndefined();
    expect(lastChatArea().keepsSlot).toBeUndefined();
  });

  it("nota fixada (fase 2) já alimenta a aba Notas do negócio", () => {
    const pinnedNote = { id: "n1", content: "Ligar amanhã", senderName: "Agente" };
    renderHost({ pinnedNote });
    expect(h.notesTabProps[h.notesTabProps.length - 1].pinnedNote).toEqual(pinnedNote);
  });

  it("estado de carregamento/erro da primeira página vai para o ChatArea", () => {
    h.useMessages.mockImplementation(() => ({
      data: undefined,
      fetchOlder: vi.fn(),
      hasOlder: false,
      hasOlderTickets: false,
      isFetchingOlder: false,
      isPending: true,
      isError: false,
    }));
    renderHost();
    expect(lastChatArea().messagesLoading).toBe(true);
    expect(lastChatArea().messages).toEqual([]);
  });
});

describe("ConversationChatHost — abrir a conversa", () => {
  it("marca como lida ao abrir e limpa o badge do board no sucesso", () => {
    const { qc, rerenderWith } = renderHost();

    expect(h.markReadMutate).toHaveBeenCalledTimes(1);
    expect(h.markReadMutate.mock.calls[0][0]).toBe("conv-1");
    const opts = h.markReadMutate.mock.calls[0][1];
    opts.onSuccess();
    expect(h.clearBoardUnreadForContact).toHaveBeenCalledWith(qc, "contact-1");

    // Trocar de conversa (sem remontar) marca a nova.
    rerenderWith({ conversationId: "conv-2" });
    expect(h.markReadMutate).toHaveBeenCalledTimes(2);
    expect(h.markReadMutate.mock.calls[1][0]).toBe("conv-2");

    // contactId chegando depois (seed do board → detail) NÃO repete o POST.
    rerenderWith({
      conversationId: "conv-2",
      contact: { ...baseProps.contact, id: "contact-real" },
    });
    expect(h.markReadMutate).toHaveBeenCalledTimes(2);
    h.markReadMutate.mock.calls[1][1].onSuccess();
    expect(h.clearBoardUnreadForContact).toHaveBeenLastCalledWith(qc, "contact-real");
  });

  it("markAsRead=false não marca", () => {
    renderHost({ markAsRead: false });
    expect(h.markReadMutate).not.toHaveBeenCalled();
  });

  it("mensagem recebida com a conversa aberta marca como lida e limpa o badge do board", () => {
    const { qc } = renderHost();
    h.markReadMutate.mockClear();
    const { onOpenConversationInbound } = h.useInboxRealtime.mock.calls.at(-1)![0];

    onOpenConversationInbound("conv-1");
    expect(h.markReadMutate).toHaveBeenCalledTimes(1);
    expect(h.markReadMutate.mock.calls[0][0]).toBe("conv-1");
    h.markReadMutate.mock.calls[0][1].onSuccess();
    expect(h.clearBoardUnreadForContact).toHaveBeenCalledWith(qc, "contact-1");
  });

  it("markAsRead=false não marca nem com mensagem recebida", () => {
    renderHost({ markAsRead: false });
    const { onOpenConversationInbound } = h.useInboxRealtime.mock.calls.at(-1)![0];
    onOpenConversationInbound("conv-1");
    expect(h.markReadMutate).not.toHaveBeenCalled();
  });

  it("monta o realtime para a conversa ativa (e desliga com realtime=false)", () => {
    renderHost();
    expect(h.useInboxRealtime).toHaveBeenCalledWith({
      activeConversationId: "conv-1",
      currentUserId: "user-1",
      enabled: true,
      onOpenConversationInbound: expect.any(Function),
    });

    cleanup();
    h.useInboxRealtime.mockClear();
    renderHost({ realtime: false });
    expect(h.useInboxRealtime.mock.calls[0][0].enabled).toBe(false);
  });
});

describe("ConversationChatHost — envio", () => {
  it("envia texto; canal divergente vira channelId; citação vira replyToId", async () => {
    renderHost();

    await act(async () => {
      await lastComposer().onSend("oi");
    });
    expect(h.sendMutateAsync).toHaveBeenLastCalledWith({ content: "oi" });

    // Canal de envio diferente do canal da conversa → override.
    h.useSelectedOutboundChannel.mockReturnValue({
      selectedChannelId: "ch-2",
      setSelectedChannelId: vi.fn(),
    });
    cleanup();
    renderHost();
    await act(async () => {
      lastChatArea().onReplyMessage({ id: "m1", content: "Oi", type: "incoming", time: "10:00" });
    });
    expect(lastComposer().replyTo).toEqual({ id: "m1", preview: "Oi", senderName: "Maria" });
    await act(async () => {
      await lastComposer().onSend("resposta");
    });
    expect(h.sendMutateAsync).toHaveBeenLastCalledWith({
      content: "resposta",
      replyToId: "m1",
      channelId: "ch-2",
    });
    // Após enviar, a citação é limpa.
    expect(lastComposer().replyTo).toBeNull();
  });

  it("envio numa conversa encerrada reabre: avisa o host de página com o id novo", async () => {
    const onConversationReopened = vi.fn();
    h.sendMutateAsync.mockResolvedValue({ message: { id: "m3" }, reopenedConversationId: "conv-9" });
    renderHost({ onConversationReopened, conversation: { status: "RESOLVED" } });
    expect(lastChatArea().conversationResolved).toBe(true);
    expect(lastComposer().isResolved).toBe(true);
    expect(lastComposer().onReopenNewConversation).toBe(onConversationReopened);

    await act(async () => {
      await lastComposer().onSend("de novo");
    });
    expect(onConversationReopened).toHaveBeenCalledWith("conv-9");
  });

  it("409 de sessão encerrada abre o fluxo de template e repassa o erro", async () => {
    h.sendMutateAsync.mockRejectedValue({ code: "SESSION_CLOSED" });
    renderHost();
    expect(screen.queryByTestId("template-modal")).toBeNull();

    let thrown: unknown = null;
    await act(async () => {
      await lastComposer()
        .onSend("tarde demais")
        .catch((e: unknown) => {
          thrown = e;
        });
    });
    expect(thrown).toEqual({ code: "SESSION_CLOSED" });
    expect(h.toastError).toHaveBeenCalled();
    expect(screen.getByTestId("template-modal")).toBeTruthy();
  });

  it("nota interna usa asNote e limpa o rascunho", () => {
    renderHost();
    lastComposer().onSendNote("interna");
    expect(h.sendMutate).toHaveBeenCalledWith(
      { content: "interna", asNote: true },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("janela de 24h expirada bloqueia o composer e mostra o alerta; canReply=false idem", () => {
    h.isSessionExpired.mockReturnValue(true);
    renderHost();
    expect(lastChatArea().showSessionAlert).toBe(true);
    expect(lastComposer().disabled).toBe(true);
    expect(lastComposer().sessionExpired).toBe(true);

    // "Usar template" do alerta abre o modal.
    act(() => {
      lastChatArea().onUseTemplate();
    });
    expect(screen.getByTestId("template-modal")).toBeTruthy();

    cleanup();
    h.isSessionExpired.mockReturnValue(false);
    h.messagesData = { ...h.messagesData, canReply: false };
    renderHost();
    expect(lastComposer().disabled).toBe(true);
    expect(lastComposer().placeholder).toMatch(/permissão/);
  });
});

describe("ConversationChatHost — ações nas bolhas", () => {
  it("fixar pede a duração; já fixada desafixa direto; cancelar não fixa", async () => {
    renderHost();
    await act(async () => {
      await lastChatArea().onPinMessage({ id: "m2" });
    });
    expect(h.requestPinDuration).toHaveBeenCalledTimes(1);
    expect(h.pinMutate).toHaveBeenCalledWith(
      { messageId: "m2", durationHours: 24 },
      expect.any(Object),
    );

    await act(async () => {
      await lastChatArea().onPinMessage({ id: "m1", isPinnedMessage: true });
    });
    expect(h.unpinMutate).toHaveBeenCalledWith({ messageId: "m1" }, expect.any(Object));

    h.requestPinDuration.mockResolvedValue(null);
    await act(async () => {
      await lastChatArea().onPinMessage({ id: "m2" });
    });
    expect(h.pinMutate).toHaveBeenCalledTimes(1);

    lastChatArea().onUnpinMessage("m1");
    expect(h.unpinMutate).toHaveBeenLastCalledWith({ messageId: "m1" }, expect.any(Object));
  });

  it("reagir ignora null (abrir picker) e envia o emoji; favoritar alterna", () => {
    renderHost();
    lastChatArea().onReactMessage({ id: "m1" }, null);
    expect(h.reactMutate).not.toHaveBeenCalled();
    lastChatArea().onReactMessage({ id: "m1" }, "👍");
    expect(h.reactMutate).toHaveBeenCalledWith({ messageId: "m1", emoji: "👍" }, expect.any(Object));

    lastChatArea().onFavoriteMessage({ id: "m1", isFavorited: true });
    expect(h.favoriteMutate).toHaveBeenCalledWith(
      { messageId: "m1", favorite: false },
      expect.any(Object),
    );
  });

  it("handlers das bolhas são estáveis entre renders (memo do MessageBubble)", async () => {
    const { rerenderWith } = renderHost();
    const first = lastChatArea();
    rerenderWith();
    const second = lastChatArea();
    for (const key of [
      "onReplyMessage",
      "onReactMessage",
      "onPinMessage",
      "onFavoriteMessage",
      "onUnpinMessage",
      "onUseTemplate",
      "contact",
      "messages",
      "pinnedMessages",
    ]) {
      expect(second[key]).toBe(first[key]);
    }

    // Digitar no composer (estado do host) também não recria os handlers.
    act(() => {
      lastComposer().onChange("digitando…");
    });
    const third = lastChatArea();
    expect(third.onReplyMessage).toBe(first.onReplyMessage);
    expect(third.onReactMessage).toBe(first.onReactMessage);
    expect(third.onPinMessage).toBe(first.onPinMessage);
    expect(third.onFavoriteMessage).toBe(first.onFavoriteMessage);
    expect(lastComposer().value).toBe("digitando…");
  });
});

describe("ConversationChatHost — kebab e favoritas", () => {
  it("sem onOpenFavorites abre o próprio painel de favoritas", () => {
    renderHost();
    expect(screen.queryByTestId("favorites-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("kebab-favorites"));
    expect(screen.getByTestId("favorites-panel").getAttribute("data-conversation")).toBe("conv-1");
  });

  it("com onOpenFavorites delega para a página e não monta o painel", () => {
    const onOpenFavorites = vi.fn();
    renderHost({ onOpenFavorites });
    fireEvent.click(screen.getByTestId("kebab-favorites"));
    expect(onOpenFavorites).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("favorites-panel")).toBeNull();
  });

  it("busca: o kebab abre via searchControlRef (do pai ou interno)", () => {
    const open = vi.fn();
    const searchControlRef = { current: { open } };
    renderHost({ searchControlRef });
    expect(lastChatArea().searchControlRef).toBe(searchControlRef);
    lastKebab().onSearchInConversation();
    expect(open).toHaveBeenCalledTimes(1);

    cleanup();
    renderHost();
    const internalRef = lastChatArea().searchControlRef;
    expect(internalRef).toBeTruthy();
    internalRef.current = { open };
    lastKebab().onSearchInConversation();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("onResolved chega ao Composer e ao kebab", () => {
    const onResolved = vi.fn();
    renderHost({ onResolved });
    expect(lastComposer().onResolved).toBe(onResolved);
  });
});

describe("ConversationChatHost — notas internas", () => {
  it("liga fixar/editar/excluir/log do ChatArea aos hooks de nota", async () => {
    renderHost();
    const chat = lastChatArea();

    chat.onPinNote("n1");
    expect(h.pinNoteMutate).toHaveBeenLastCalledWith({ noteId: "n1" }, expect.any(Object));
    chat.onPinNote(null);
    expect(h.pinNoteMutate).toHaveBeenLastCalledWith({ noteId: null }, expect.any(Object));

    await act(async () => {
      await chat.onEditNote("n1", "novo");
    });
    expect(h.updateNoteMutateAsync).toHaveBeenCalledWith({ noteId: "n1", content: "novo" });
    expect(h.toastSuccess).toHaveBeenCalledWith("Nota atualizada");

    // Excluir passa pelo diálogo de confirmação; a mutation só roda na ação.
    chat.onDeleteNote("n1");
    expect(h.deleteNoteMutateAsync).not.toHaveBeenCalled();
    const confirmOpts = h.confirmDialog.mock.calls[0][0];
    expect(confirmOpts.destructive).toBe(true);
    await confirmOpts.action();
    expect(h.deleteNoteMutateAsync).toHaveBeenCalledWith({ noteId: "n1" });
    expect(h.toastSuccess).toHaveBeenCalledWith("Nota excluída");

    chat.onAddToLog("texto da nota");
    expect(h.addToLogMutate).toHaveBeenCalledWith(
      { content: "texto da nota" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("editar nota com falha avisa e repassa o erro", async () => {
    h.updateNoteMutateAsync.mockRejectedValue(new Error("sem permissão"));
    renderHost();
    let thrown: unknown = null;
    await act(async () => {
      await lastChatArea()
        .onEditNote("n1", "x")
        .catch((e: unknown) => {
          thrown = e;
        });
    });
    expect((thrown as Error).message).toBe("sem permissão");
    expect(h.toastError).toHaveBeenCalledWith("sem permissão");
  });

  it("overrides da página substituem os handlers padrão", () => {
    const onPinNote = vi.fn();
    const onEditNote = vi.fn();
    const onDeleteNote = vi.fn();
    const onAddToLog = vi.fn();
    renderHost({ onPinNote, onEditNote, onDeleteNote, onAddToLog, dealId: null });
    const chat = lastChatArea();
    expect(chat.onPinNote).toBe(onPinNote);
    expect(chat.onEditNote).toBe(onEditNote);
    expect(chat.onDeleteNote).toBe(onDeleteNote);
    // Sem dealId o default seria undefined; o override vale mesmo assim.
    expect(chat.onAddToLog).toBe(onAddToLog);
  });

  it("nota fixada é resolvida da thread (pinnedNoteId) para o ChatArea e a aba Notas", () => {
    h.messagesData = {
      ...h.messagesData,
      pinnedNoteId: "n1",
      messages: [
        ...h.messagesData.messages,
        {
          id: "n1",
          content: "Ligar amanhã",
          direction: "out",
          messageType: "note",
          senderName: "Agente",
          createdAt: "2026-09-29T13:05:00.000Z",
        },
      ],
    };
    renderHost();
    const pinned = lastChatArea().pinnedNote;
    expect(pinned).toMatchObject({ id: "n1", content: "Ligar amanhã", senderName: "Agente" });
    expect(typeof pinned.time).toBe("string");
    expect(h.notesTabProps[h.notesTabProps.length - 1].pinnedNote).toBe(pinned);

    // Prop explícita sobrescreve (inclusive `null`).
    cleanup();
    renderHost({ pinnedNote: null });
    expect(lastChatArea().pinnedNote).toBeNull();
  });
});

describe("ConversationChatHost — 24h × provider do canal", () => {
  it("Cloud API com sessão encerrada bloqueia o composer e mostra o alerta", () => {
    h.messagesData = { ...h.messagesData, session: { active: false } };
    renderHost();
    expect(lastChatArea().showSessionAlert).toBe(true);
    expect(lastChatArea().channelProvider).toBe("META_CLOUD");
    expect(lastComposer().disabled).toBe(true);
    expect(lastComposer().sessionExpired).toBe(true);
    // Sessão do canal selecionado é consultada com o provider dele.
    expect(h.useChannelSession).toHaveBeenLastCalledWith("conv-1", "ch-1", true, {
      provider: "META_CLOUD",
    });
  });

  it("Baileys não tem janela de 24h: sem alerta, sem GET de sessão, composer livre", () => {
    h.messagesData = {
      ...h.messagesData,
      channelProvider: "BAILEYS_MD",
      session: { active: false },
    };
    h.useWhatsappChannels.mockReturnValue({
      data: [
        { id: "ch-1", name: "Número da loja", type: "WHATSAPP", provider: "BAILEYS_MD", status: "CONNECTED", phoneNumber: null },
      ],
    });
    renderHost();
    expect(lastChatArea().showSessionAlert).toBe(false);
    expect(lastChatArea().channelProvider).toBe("BAILEYS_MD");
    expect(lastComposer().disabled).toBe(false);
    expect(lastComposer().sessionExpired).toBe(false);
    expect(h.useChannelSession).toHaveBeenLastCalledWith("conv-1", "ch-1", false, {
      provider: "BAILEYS_MD",
    });
    // A regra recebeu os providers para decidir.
    expect(h.isSessionExpired).toHaveBeenLastCalledWith(
      expect.objectContaining({
        applyWhatsappSession: false,
        channelProvider: "BAILEYS_MD",
        selectedChannelProvider: "BAILEYS_MD",
      }),
    );
  });

  it("override para um canal Baileys numa conversa Cloud API também libera", () => {
    h.messagesData = { ...h.messagesData, session: { active: false } };
    h.useWhatsappChannels.mockReturnValue({
      data: [
        { id: "ch-1", name: "WABA", type: "WHATSAPP", provider: "META_CLOUD", status: "CONNECTED", phoneNumber: null },
        { id: "ch-b", name: "Baileys", type: "WHATSAPP", provider: "BAILEYS_MD", status: "CONNECTED", phoneNumber: null },
      ],
    });
    h.useSelectedOutboundChannel.mockReturnValue({
      selectedChannelId: "ch-b",
      setSelectedChannelId: vi.fn(),
    });
    renderHost();
    expect(lastChatArea().showSessionAlert).toBe(false);
    expect(lastComposer().disabled).toBe(false);
    // O ChatArea recebe o provider EFETIVO (canal escolhido), não o da conversa.
    expect(lastChatArea().channelProvider).toBe("BAILEYS_MD");
  });

  it("override para um canal Cloud API numa conversa Baileys aplica a janela do destino", () => {
    h.messagesData = {
      ...h.messagesData,
      channelProvider: "BAILEYS_MD",
      session: { active: true },
    };
    h.useWhatsappChannels.mockReturnValue({
      data: [
        { id: "ch-1", name: "Número da loja", type: "WHATSAPP", provider: "BAILEYS_MD", status: "CONNECTED", phoneNumber: null },
        { id: "ch-c", name: "WABA", type: "WHATSAPP", provider: "META_CLOUD", status: "CONNECTED", phoneNumber: null },
      ],
    });
    h.useSelectedOutboundChannel.mockReturnValue({
      selectedChannelId: "ch-c",
      setSelectedChannelId: vi.fn(),
    });
    h.useChannelSession.mockReturnValue({ data: { active: false }, isFetched: true });
    renderHost();
    expect(h.useChannelSession).toHaveBeenLastCalledWith("conv-1", "ch-c", true, {
      provider: "META_CLOUD",
    });
    expect(lastChatArea().showSessionAlert).toBe(true);
    // Provider efetivo = Cloud API: o ChatArea não pode suprimir o alerta.
    expect(lastChatArea().channelProvider).toBe("META_CLOUD");
    expect(lastComposer().disabled).toBe(true);
  });
});
