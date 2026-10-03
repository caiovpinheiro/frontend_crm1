/** @vitest-environment jsdom */
/**
 * FE-1 — digitar no Composer do Inbox não re-renderiza a página nem a
 * lista; e um re-render da página (envio, evento) não re-renderiza os
 * cards que não mudaram (props estáveis: seleção, slots por card).
 *
 * Página real (`app/(app)/inbox/_v2-client.tsx`) e coluna real
 * (`ConversationColumn` + `ConversationRow` memo); hooks de dados, shell e
 * folhas mockados. `InboxShell` conta os renders da página e
 * `ConversationCard` os dos cards.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const fn = () => () => undefined;
  const rows = ["c1", "c2", "c3"].map((id, i) => ({
    id,
    number: 100 + i,
    status: "OPEN",
    channel: "whatsapp",
    channelId: "ch_1",
    contactId: `ct-${id}`,
    contact: { id: `ct-${id}`, name: `Contato ${id}` },
    assignedToId: "u1",
    assignedTo: { id: "u1", name: "Agente", type: "USER" },
    unreadCount: 0,
    hasHumanReply: true,
    lastMessageDirection: "in",
    lastMessageAt: `2026-10-03T12:0${i}:00.000Z`,
    lastInboundAt: `2026-10-03T12:0${i}:00.000Z`,
    updatedAt: `2026-10-03T12:0${i}:00.000Z`,
    createdAt: "2026-10-01T12:00:00.000Z",
    closedAt: null,
    tags: [],
  }));
  return {
    rows,
    tab: ["todos"],
    filters: {},
    renders: { shell: 0, cards: 0, composer: 0 },
    sendMutateAsync: vi.fn(async (_vars: unknown) => ({})),
    noteMutateAsync: vi.fn(async (_vars: unknown) => ({})),
    stable: {
      fn: fn(),
      setter: vi.fn(),
    },
  };
});

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Agente", role: "ADMIN" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/dynamic", () => ({
  // ChatArea (dinâmico) só precisa montar o slot do composer.
  default: () =>
    function Dynamic(props: { composerSlot?: ReactNode }) {
      return <>{props.composerSlot ?? null}</>;
    },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/auth/require-permission", () => ({
  RequirePermission: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/use-my-permissions", () => ({
  useCan: () => true,
  useMyPermissions: () => ({ data: undefined }),
}));
vi.mock("@/hooks/use-user-role", () => ({ useUserRole: () => ({ isSuperAdmin: false }) }));
vi.mock("@/hooks/use-media-query", () => ({ useIsDesktop: () => true }));
vi.mock("@/components/crm/nav-rail", () => ({ NavRail: () => null }));
vi.mock("@/features/keeps/keep-peek-panel", () => ({ KeepPeekPanel: () => null }));
vi.mock("@/features/inbox-v2/extras/inbox-period-calendar", () => ({
  InboxPeriodCalendar: () => null,
}));
vi.mock("@/components/crm/column-resizer", () => ({
  ColumnResizer: () => null,
  usePersistentWidth: () => [300, h.stable.setter],
}));
vi.mock("@/features/inbox-v2/extras/filter-panel", () => ({ InboxSearchFilterBar: () => null }));
vi.mock("@/features/product-tour", () => ({ PageTourButton: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => ({ confirm: h.stable.fn, dialog: null }),
}));
vi.mock("@/features/softphone/components/call-history-list", () => ({ CallHistoryList: () => null }));
vi.mock("@/features/softphone/components/deal-call-button", () => ({ DealCallButton: () => null }));
vi.mock("@/components/inbox/whatsapp-call-chip", () => ({
  WhatsappCallChip: () => null,
  conversationHasCallingHint: () => false,
}));
vi.mock("@/components/pipeline/deal-workspace/panels/activities", () => ({
  ActivitiesPanel: () => null,
}));
vi.mock("@/features/pipeline-v2/extras", () => ({ DealNotesTab: () => null }));
vi.mock("@/features/inbox-v2/extras/channel-switch-confirm", () => ({
  isSessionClosedError: () => false,
  SESSION_CLOSED_TOAST: "sessão",
}));
vi.mock("@/features/inbox-v2/extras", () => ({
  AssigneePopover: () => null,
  ConversationActionsMenu: () => null,
  ConversationTimelineTab: () => null,
  InboxFilterButton: () => null,
  TransferPopover: () => null,
  WhatsappTemplatePickerModal: () => null,
  whatsappTemplateToPending: (t: unknown) => t,
  Composer: (props: {
    value: string;
    onChange: (v: string) => void;
    onSend: (v: string) => void | Promise<void>;
    onSendNote?: (v: string) => void;
  }) => {
    h.renders.composer += 1;
    return (
      <div>
        <textarea
          data-testid="composer"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
        <button type="button" onClick={() => void props.onSend(props.value)}>
          enviar
        </button>
        <button type="button" onClick={() => props.onSendNote?.(props.value)}>
          nota
        </button>
      </div>
    );
  },
}));
vi.mock("@/components/crm/conversation-card", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/crm/conversation-card")>();
  const { memo } = await import("react");
  return {
    ...actual,
    ConversationCard: memo(function CountingCard(props: { conversation: { id: string } }) {
      h.renders.cards += 1;
      return <div data-testid={`card-${props.conversation.id}`} />;
    }),
  };
});

vi.mock("@/features/inbox-v2/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/inbox-v2/adapters")>();
  const contact = { name: "Contato c1", phone: "5511999999999" };
  return { ...actual, toChatContact: () => contact, toContactAside: () => null };
});
vi.mock("@/features/inbox-v2/hooks", () => {
  const features = { features: { agentSignatureEnabled: true, agentSignatureEditable: true } };
  const messages = { data: undefined, fetchOlder: () => {}, hasOlder: false };
  return {
    useConversationFeatures: () => features,
    useContactSidebar: () => ({ data: undefined }),
    useInboxRealtime: () => {},
    useInboxSafetyPoll: () => {},
    useMessages: () => messages,
    useInboxSoundMuted: () => [false, h.stable.setter],
  };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-filters-url-sync", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/inbox-v2/hooks/use-inbox-filters-url-sync")
  >();
  const state = {
    tab: h.tab,
    setTab: h.stable.setter,
    replaceTab: h.stable.setter,
    tabHydrated: true,
    filters: h.filters,
    setFilters: h.stable.setter,
    filtersHydrated: true,
    search: "",
    setSearch: h.stable.setter,
  };
  return { ...actual, useInboxFilterUrlState: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-visible-tabs", () => {
  const tabs = [{ id: "todos", label: "Todas" }];
  return { useInboxVisibleTabs: () => tabs };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-header-collapse", () => {
  const state = { headerCollapsed: false, setHeaderCollapsed: h.stable.setter, headerHydrated: true };
  return { useInboxHeaderCollapse: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-mobile-pane", () => {
  const state = ["chat", h.stable.setter];
  return { useInboxMobilePane: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-conversation-list", () => {
  const state = {
    serverFilters: {},
    listData: { items: h.rows },
    hasNextPage: false,
    isFetchingNextPage: false,
    isPlaceholderData: false,
    handleLoadMore: h.stable.fn,
    listBootstrapping: false,
    rows: h.rows,
    tabCounts: { todos: 3 },
    filterTotal: 3,
  };
  return { useInboxConversationList: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-active-conversation", () => {
  const state = {
    stickyRow: null,
    setStickyRow: h.stable.setter,
    pinnedFromSearch: null,
    setPinnedFromSearch: h.stable.setter,
    displayRows: h.rows,
    foundActiveRow: h.rows[0],
    conversationApiId: "c1",
    activeRow: h.rows[0],
    closeActiveConversation: h.stable.fn,
  };
  return { useInboxActiveConversation: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-active-conversation-sync", () => ({
  useInboxActiveConversationSync: () => {},
}));
vi.mock("@/features/inbox-v2/hooks/use-inbox-conversation-reopen", () => ({
  useInboxConversationReopen: () => h.stable.fn,
}));
vi.mock("@/features/inbox-v2/hooks/use-inbox-first-deal", () => {
  const state = {
    firstDeal: null,
    firstDealId: null,
    firstDealDetail: undefined,
    firstDealPipelineId: null,
    firstDealPipelineName: null,
    firstDealStageName: null,
  };
  return { useInboxFirstDeal: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-message-actions", () => {
  const state = {
    sendMessage: {
      mutateAsync: (vars: { asNote?: boolean }) =>
        vars.asNote ? h.noteMutateAsync(vars) : h.sendMutateAsync(vars),
      mutate: (vars: unknown, opts?: { onSuccess?: () => void }) => {
        void h.noteMutateAsync(vars).then(() => opts?.onSuccess?.());
      },
      isPending: false,
    },
    markRead: { mutate: h.stable.fn },
    bulkAction: { isPending: false },
    pinDurationDialog: null,
    favoritesOpen: false,
    setFavoritesOpen: h.stable.setter,
    replyTo: null,
    setReplyTo: h.stable.setter,
    handleReactMessage: h.stable.fn,
    handlePinMessage: h.stable.fn,
    handleUnpinMessage: h.stable.fn,
    handleFavoriteMessage: h.stable.fn,
    handleReplyMessage: h.stable.fn,
  };
  return { useInboxMessageActions: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-message-bubbles", () => {
  const state = { messageBubbles: [], pinnedMessagesPreview: [] };
  return { useInboxMessageBubbles: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-outbound-channel", () => {
  const state = {
    whatsappChannels: [],
    conversationChannelId: "ch_1",
    lastMessageChannelId: "ch_1",
    selectedChannelId: "ch_1",
    setSelectedChannelId: h.stable.setter,
    effectiveProvider: "meta",
    sessionExpiredEffective: false,
    composerDisabled: false,
    composerPlaceholder: "Mensagem",
  };
  return { useInboxOutboundChannel: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-queue-refresh", () => {
  const state = { inboxRefreshing: false, refreshInboxQueue: h.stable.fn };
  return { useInboxQueueRefresh: () => state };
});
vi.mock("@/features/inbox-v2/hooks/use-inbox-bulk-actions", () => {
  const state = {
    bulkTabulationOpen: false,
    bulkTabulationDeptId: null,
    bulkTabulationUserId: null,
    bulkConfirmOpen: false,
    executeBulkResolve: h.stable.fn,
    handleBulkAction: h.stable.fn,
    handleBulkTabulationOpenChange: h.stable.fn,
    handleBulkConfirmOpenChange: h.stable.fn,
    handleBulkReassignQueued: h.stable.fn,
    handleBulkReassignPersisted: h.stable.fn,
  };
  return { useInboxBulkActions: () => state };
});
vi.mock("@/app/(app)/inbox/_components/inbox-contact-aside", () => ({
  InboxContactAside: () => null,
}));
vi.mock("@/app/(app)/inbox/_components/inbox-list-controls", () => ({
  InboxBulkActionsBar: () => null,
  InboxBulkResolveDialogs: () => null,
  InboxColumnMoreMenu: () => null,
}));
vi.mock("@/app/(app)/inbox/_components/inbox-placeholders", () => ({
  EmptyAside: () => null,
  EmptyChatArea: () => null,
  NoDealTab: () => null,
}));
vi.mock("@/app/(app)/inbox/_components/inbox-shell", () => ({
  InboxShell: (props: { conversationColumn: ReactNode; chat: ReactNode }) => {
    h.renders.shell += 1;
    return (
      <div>
        {props.conversationColumn}
        {props.chat}
      </div>
    );
  },
}));

import InboxV2ClientPage from "@/app/(app)/inbox/_v2-client";
import { TooltipProvider } from "@/components/ui/tooltip";

function Page() {
  return (
    <TooltipProvider>
      <InboxV2ClientPage />
    </TooltipProvider>
  );
}

function snapshot() {
  return { ...h.renders };
}

beforeEach(() => {
  h.renders.shell = 0;
  h.renders.cards = 0;
  h.renders.composer = 0;
  h.sendMutateAsync.mockClear();
  h.noteMutateAsync.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("Inbox: digitar não re-renderiza a página nem a lista (FE-1)", () => {
  it("5 teclas: só o composer re-renderiza", async () => {
    render(<Page />);
    await act(async () => {});
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(3);
    const before = snapshot();

    const box = screen.getByTestId("composer") as HTMLTextAreaElement;
    for (const text of ["o", "ol", "olá", "olá ", "olá!"]) {
      fireEvent.change(box, { target: { value: text } });
    }
    expect(box.value).toBe("olá!");

    const after = snapshot();
    expect(after.shell - before.shell).toBe(0);
    expect(after.cards - before.cards).toBe(0);
    expect(after.composer - before.composer).toBe(5);
  });

  it("enviar limpa o rascunho (mensagem e nota)", async () => {
    render(<Page />);
    await act(async () => {});
    const box = screen.getByTestId("composer") as HTMLTextAreaElement;

    fireEvent.change(box, { target: { value: "oi" } });
    await act(async () => {
      fireEvent.click(screen.getByText("enviar"));
    });
    expect(h.sendMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ content: "oi" }));
    expect(box.value).toBe("");

    fireEvent.change(box, { target: { value: "anotação" } });
    await act(async () => {
      fireEvent.click(screen.getByText("nota"));
    });
    expect(h.noteMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ content: "anotação", asNote: true }),
    );
    expect(box.value).toBe("");
  });

  it("re-render da página com os mesmos dados não re-renderiza os cards", async () => {
    const view = render(<Page />);
    await act(async () => {});
    const before = snapshot();
    view.rerender(<Page />);
    await act(async () => {});
    const after = snapshot();
    expect(after.shell - before.shell).toBe(1);
    expect(after.cards - before.cards).toBe(0);
  });
});
