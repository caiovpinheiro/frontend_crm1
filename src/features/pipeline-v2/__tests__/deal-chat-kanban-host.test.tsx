// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Composição do Kanban (a3/a4/a5): `DealChatBindingHost` (auto-ensure) →
 * `ConversationChatHost` real (leaves mockadas) dentro do painel. Cobre o
 * que a página passa ao host e, principalmente, que digitar no Composer
 * ou o auto-ensure assentar NÃO re-renderiza o board nem a página.
 */

const h = vi.hoisted(() => {
  const chatAreaProps: any[] = [];
  const composerProps: any[] = [];
  return {
    chatAreaProps,
    composerProps,
    messagesData: null as any,
    useMessages: vi.fn(),
    useDealDetail: vi.fn(),
    fetch: vi.fn(),
    markReadMutate: vi.fn(),
    useInboxRealtime: vi.fn(),
    useChannelSession: vi.fn(),
    clearBoardUnreadForContact: vi.fn(),
    whatsappChannels: [] as any[],
  };
});

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "user-1", name: "Agente" } }, status: "authenticated" }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ apiUrl: (path: string) => `http://api.test${path}` }));

vi.mock("@/features/pipeline-v2/hooks/use-deal-detail", () => ({
  useDealDetail: h.useDealDetail,
  dealDetailKey: (id: string | null) => ["deal-detail-v2", id ?? "__none__"],
}));

vi.mock("@/features/inbox-v2/hooks", async () => {
  const channels = await vi.importActual<typeof import("@/features/inbox-v2/hooks/use-channels")>(
    "@/features/inbox-v2/hooks/use-channels",
  );
  return {
    useMessages: h.useMessages,
    useSendMessage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useReactMessage: () => ({ mutate: vi.fn() }),
    usePinMessage: () => ({ mutate: vi.fn() }),
    useUnpinMessage: () => ({ mutate: vi.fn() }),
    useFavoriteMessage: () => ({ mutate: vi.fn() }),
    usePinNote: () => ({ mutate: vi.fn() }),
    useUpdateNote: () => ({ mutateAsync: vi.fn() }),
    useDeleteNote: () => ({ mutateAsync: vi.fn() }),
    useAddNoteToLog: () => ({ mutate: vi.fn() }),
    useConversationFeatures: () => ({ features: { agentSignatureEnabled: true, agentSignatureEditable: true } }),
    useInboxRealtime: h.useInboxRealtime,
    useMarkConversationRead: () => ({ mutate: h.markReadMutate }),
    useWhatsappChannels: () => ({ data: h.whatsappChannels }),
    useSelectedOutboundChannel: () => ({ selectedChannelId: "ch-1", setSelectedChannelId: vi.fn() }),
    useChannelSession: h.useChannelSession,
    findLastPublicMessageChannelId: () => "ch-1",
    resolveWhatsappSessionScope: channels.resolveWhatsappSessionScope,
  };
});

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
    }),
    lastInboundAtFromThread: () => null,
  };
});

vi.mock("@/components/crm/chat-area", () => ({
  ChatArea: (props: any) => {
    h.chatAreaProps.push(props);
    return (
      <div data-testid="chat-area" data-conversation={props.conversationId}>
        <div data-testid="header-actions">{props.headerActionsSlot}</div>
        <div data-testid="composer-slot">{props.composerSlot}</div>
        <div data-testid="fab-slot">{props.floatingCallSlot}</div>
      </div>
    );
  },
}));
vi.mock("@/features/inbox-v2/extras/composer", () => ({
  Composer: (props: any) => {
    h.composerProps.push(props);
    return (
      <div data-testid="composer" data-value={props.value}>
        {props.viewersSlot}
      </div>
    );
  },
}));
vi.mock("@/features/inbox-v2/extras/conversation-actions-menu", () => ({
  ConversationActionsMenu: () => <button type="button" data-testid="kebab" />,
}));
vi.mock("@/features/inbox-v2/extras/conversation-timeline-tab", () => ({
  ConversationTimelineTab: () => <div data-testid="timeline-tab" />,
}));
vi.mock("@/features/inbox-v2/extras/template-picker-popover", () => ({
  WhatsappTemplatePickerModal: (props: any) => (props.open ? <div data-testid="template-modal" /> : null),
}));
vi.mock("@/features/inbox-v2/extras/template-compose-panel", () => ({
  whatsappTemplateToPending: (tpl: unknown) => tpl,
}));
vi.mock("@/features/inbox-v2/extras/channel-switch-confirm", () => ({
  SESSION_CLOSED_TOAST: "Sessão de 24h encerrada.",
  isSessionClosedError: () => false,
}));
vi.mock("@/components/crm/favorites-panel", () => ({ FavoritesPanel: () => null }));
vi.mock("@/components/crm/pin-duration-dialog", () => ({
  usePinDurationDialog: () => ({ requestDuration: vi.fn(), dialog: null }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => ({ confirm: vi.fn(), dialog: null }),
}));
vi.mock("@/components/inbox/channel-type-icon", () => ({
  usesWhatsapp24hWindow: (type?: string | null) => type === "WHATSAPP",
}));
vi.mock("@/components/pipeline/deal-workspace/panels/activities", () => ({
  ActivitiesPanel: () => <div data-testid="activities-tab" />,
}));
vi.mock("@/features/keeps/keep-peek-panel", () => ({ KeepPeekPanel: () => <div data-testid="keeps-tab" /> }));
vi.mock("@/features/pipeline-v2/extras/deal-notes-tab", () => ({
  DealNotesTab: () => <div data-testid="notes-tab" />,
}));
vi.mock("@/features/pipeline-v2/hooks/use-pipeline-realtime", () => ({
  clearBoardUnreadForContact: h.clearBoardUnreadForContact,
}));
vi.mock("@/features/softphone/components/call-history-list", () => ({
  CallHistoryList: () => <div data-testid="calls-tab" />,
}));
vi.mock("@/features/softphone/components/deal-call-button", () => ({
  DealCallButton: (props: any) => <div data-testid="call-fab" data-deal={props.dealId} data-fab={String(props.fab)} />,
}));

import { ConversationChatHost } from "@/features/inbox-v2/extras/conversation-chat-host";
import { ConversationThreadSkeleton } from "@/components/crm/conversation-skeleton";
import { DealChatBindingHost, DealChatEmptyState } from "../extras/deal-chat-binding";

const renders = { board: 0, page: 0 };

function BoardSpy() {
  renders.board += 1;
  return <div data-testid="board" />;
}

/** Mesma composição do _v2-client: board + binding → host no chatSlot. */
function KanbanPage({
  conversationId,
  contactId,
  viewers,
}: {
  conversationId: string | null;
  contactId: string | null;
  viewers?: React.ReactNode;
}) {
  renders.page += 1;
  return (
    <>
      <BoardSpy />
      <DealChatBindingHost conversationId={conversationId} contactId={contactId} dealId="deal-1">
        {({ effectiveConversationId, ensuring, pinnedNote }) =>
          ensuring ? (
            <ConversationThreadSkeleton />
          ) : effectiveConversationId && contactId ? (
            <ConversationChatHost
              key={effectiveConversationId}
              conversationId={effectiveConversationId}
              conversation={conversationId === effectiveConversationId ? { status: "OPEN", number: 7 } : { status: "OPEN" }}
              contact={{ id: contactId, name: "Maria", phone: "+5511999990000", channel: "whatsapp" }}
              dealId="deal-1"
              pipelineId="pipe-1"
              viewersSlot={viewers}
              showTabs={false}
              pinnedNote={pinnedNote}
            />
          ) : (
            <DealChatEmptyState />
          )
        }
      </DealChatBindingHost>
    </>
  );
}

function renderPage(props: React.ComponentProps<typeof KanbanPage>) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <KanbanPage {...props} />
    </QueryClientProvider>,
  );
}

const lastChatArea = () => h.chatAreaProps[h.chatAreaProps.length - 1];
const lastComposer = () => h.composerProps[h.composerProps.length - 1];
const detailFor = (contactId: string, conversations: { id: string }[] = []) => ({
  data: { id: "deal-1", contact: { id: contactId, conversations } },
  isSuccess: true,
  isError: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  renders.board = 0;
  renders.page = 0;
  h.chatAreaProps.length = 0;
  h.composerProps.length = 0;
  vi.stubGlobal("fetch", h.fetch);
  h.messagesData = {
    messages: [
      { id: "m1", content: "Oi", direction: "in", createdAt: "2026-09-29T10:00:00.000Z" },
      { id: "n1", content: "Ligar amanhã", direction: "out", messageType: "note", senderName: "Agente", createdAt: "2026-09-29T10:05:00.000Z" },
    ],
    pinnedNoteId: "n1",
    pinnedMessageIds: ["m1"],
    channelProvider: "META_CLOUD",
    channel: { id: "ch-1", name: "WABA", type: "WHATSAPP" },
    channels: {},
    canReply: true,
    session: { active: true },
    hasMore: true,
  };
  h.useMessages.mockImplementation((id: string | null) => ({
    data: id ? h.messagesData : undefined,
    fetchOlder: vi.fn(),
    hasOlder: true,
    hasOlderTickets: true,
    isFetchingOlder: false,
    isPending: false,
    isError: false,
  }));
  h.useChannelSession.mockReturnValue({ data: { active: true }, isFetched: true });
  h.useDealDetail.mockReturnValue(detailFor("contact-1", [{ id: "conv-1" }]));
  h.whatsappChannels = [
    { id: "ch-1", name: "WABA", type: "WHATSAPP", provider: "META_CLOUD", status: "CONNECTED", phoneNumber: null },
  ];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Kanban — host canônico no painel do negócio", () => {
  it("abre a thread do ticket do contato com o wiring do Kanban", () => {
    renderPage({ conversationId: "conv-1", contactId: "contact-1", viewers: <span data-testid="viewers" /> });

    expect(screen.getByTestId("chat-area").getAttribute("data-conversation")).toBe("conv-1");
    const chat = lastChatArea();
    // Paginação / tickets anteriores / fixadas / nota fixada vêm do useMessages.
    expect(chat.hasOlder).toBe(true);
    expect(chat.hasOlderTickets).toBe(true);
    expect(typeof chat.onLoadOlder).toBe("function");
    expect(chat.pinnedMessages).toEqual([{ id: "m1", content: "Oi", senderName: "Maria" }]);
    expect(chat.pinnedNote).toMatchObject({ id: "n1", content: "Ligar amanhã" });
    expect(chat.conversationNumber).toBe(7);
    expect(chat.showSessionAlert).toBe(false);
    expect(chat.channelProvider).toBe("META_CLOUD");
    // Sem abas do ChatArea (a TabsBar do painel cuida das abas do negócio).
    expect(chat.notesSlot).toBeUndefined();
    expect(chat.timelineSlot).toBeUndefined();
    // Kebab canônico, viewers no Composer, FAB de ligação do negócio.
    expect(screen.getByTestId("kebab")).toBeTruthy();
    expect(screen.getByTestId("composer").querySelector('[data-testid="viewers"]')).toBeTruthy();
    expect(screen.getByTestId("call-fab").getAttribute("data-deal")).toBe("deal-1");
    expect(screen.getByTestId("call-fab").getAttribute("data-fab")).toBe("true");
    // Marca como lida ao abrir e zera o card do contato no board.
    expect(h.markReadMutate).toHaveBeenCalledWith("conv-1", expect.any(Object));
    h.markReadMutate.mock.calls[0][1].onSuccess();
    expect(h.clearBoardUnreadForContact).toHaveBeenCalledWith(expect.anything(), "contact-1");
    // Realtime montado uma vez, para a conversa ativa.
    expect(h.useInboxRealtime).toHaveBeenCalledWith(
      expect.objectContaining({ activeConversationId: "conv-1", enabled: true }),
    );
  });

  it("digitar no Composer não re-renderiza o board nem a página", () => {
    renderPage({ conversationId: "conv-1", contactId: "contact-1" });
    expect(renders.board).toBe(1);
    expect(renders.page).toBe(1);

    act(() => {
      lastComposer().onChange("digitando…");
    });
    expect(lastComposer().value).toBe("digitando…");
    expect(screen.getByTestId("composer").getAttribute("data-value")).toBe("digitando…");
    expect(renders.board).toBe(1);
    expect(renders.page).toBe(1);

    act(() => {
      lastChatArea().onReplyMessage({ id: "m1", content: "Oi", type: "incoming", time: "10:00" });
    });
    expect(lastComposer().replyTo?.id).toBe("m1");
    expect(renders.board).toBe(1);
    expect(renders.page).toBe(1);
  });

  it("auto-ensure: skeleton até o ticket existir e o board não re-renderiza quando assenta", async () => {
    let resolveCreate!: (r: unknown) => void;
    h.fetch.mockReturnValueOnce(new Promise((res) => (resolveCreate = res)));
    h.useDealDetail.mockReturnValue(detailFor("contact-1", []));
    renderPage({ conversationId: null, contactId: "contact-1" });
    await act(async () => {});

    expect(screen.queryByTestId("chat-area")).toBeNull();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(renders.page).toBe(1);

    await act(async () => {
      resolveCreate({ ok: true, json: () => Promise.resolve({ conversation: { id: "conv-new" } }) });
    });
    expect(screen.getByTestId("chat-area").getAttribute("data-conversation")).toBe("conv-new");
    expect(lastChatArea().conversationNumber).toBeNull();
    expect(h.markReadMutate).toHaveBeenCalledWith("conv-new", expect.any(Object));
    expect(renders.board).toBe(1);
    expect(renders.page).toBe(1);
  });

  it("negócio sem contato mostra o estado vazio, sem host nem POST", async () => {
    renderPage({ conversationId: null, contactId: null });
    await act(async () => {});
    expect(screen.queryByTestId("chat-area")).toBeNull();
    expect(screen.getByText("Sem conversa vinculada")).toBeTruthy();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.markReadMutate).not.toHaveBeenCalled();
  });

  it("24h: Cloud API encerrada bloqueia; Baileys não mostra alerta", () => {
    h.messagesData = { ...h.messagesData, session: { active: false } };
    renderPage({ conversationId: "conv-1", contactId: "contact-1" });
    expect(lastChatArea().showSessionAlert).toBe(true);
    expect(lastComposer().disabled).toBe(true);

    cleanup();
    h.chatAreaProps.length = 0;
    h.composerProps.length = 0;
    h.messagesData = { ...h.messagesData, channelProvider: "BAILEYS_MD", session: { active: false } };
    h.whatsappChannels = [
      { id: "ch-1", name: "Número da loja", type: "WHATSAPP", provider: "BAILEYS_MD", status: "CONNECTED", phoneNumber: null },
    ];
    h.useChannelSession.mockReturnValue({ data: undefined, isFetched: false });
    renderPage({ conversationId: "conv-1", contactId: "contact-1" });
    expect(lastChatArea().showSessionAlert).toBe(false);
    expect(lastChatArea().channelProvider).toBe("BAILEYS_MD");
    expect(lastComposer().disabled).toBe(false);
    expect(h.useChannelSession).toHaveBeenLastCalledWith("conv-1", "ch-1", false, { provider: "BAILEYS_MD" });
  });
});
