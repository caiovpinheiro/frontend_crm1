// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * O Flow (`SalesHubChat`) é só um adaptador de props para o host canônico:
 * aqui garantimos o mapeamento e que os objetos `conversation`/`contact`
 * ficam estáveis entre renders com as mesmas props.
 */

const h = vi.hoisted(() => ({ hostProps: [] as any[] }));

vi.mock("@/features/inbox-v2/extras/conversation-chat-host", () => ({
  ConversationChatHost: (props: any) => {
    h.hostProps.push(props);
    return <div data-testid="chat-host" data-conversation={props.conversationId} />;
  },
}));

import { SalesHubChat } from "../sales-hub-chat";

const last = () => h.hostProps[h.hostProps.length - 1];

beforeEach(() => {
  h.hostProps.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("SalesHubChat → ConversationChatHost", () => {
  it("monta o host com a conversa, o contato e os callbacks do Flow", () => {
    const onConversationReopened = vi.fn();
    const onResolved = vi.fn();
    const searchControlRef = { current: null };
    render(
      <SalesHubChat
        conversationId="conv-1"
        conversationStatus="RESOLVED"
        conversationNumber={7}
        conversationClosedAt="2026-09-28T12:00:00.000Z"
        lastInboundAt="2026-09-27T12:00:00.000Z"
        assignedToId="user-2"
        departmentId="dept-1"
        requireTabulationOnClose
        contactId="contact-1"
        contactName="Maria"
        contactPhone="+5511999990000"
        contactChannel="whatsapp"
        dealId="deal-1"
        pipelineId="pipe-1"
        headerActionsSlot={<span data-testid="page-actions" />}
        searchControlRef={searchControlRef}
        onConversationReopened={onConversationReopened}
        onResolved={onResolved}
      />,
    );

    expect(screen.getByTestId("chat-host").getAttribute("data-conversation")).toBe("conv-1");
    const props = last();
    expect(props.conversation).toEqual({
      status: "RESOLVED",
      number: 7,
      closedAt: "2026-09-28T12:00:00.000Z",
      lastInboundAt: "2026-09-27T12:00:00.000Z",
      assignedToId: "user-2",
    });
    expect(props.contact).toEqual({
      id: "contact-1",
      name: "Maria",
      phone: "+5511999990000",
      channel: "whatsapp",
    });
    expect(props.dealId).toBe("deal-1");
    expect(props.pipelineId).toBe("pipe-1");
    expect(props.departmentId).toBe("dept-1");
    expect(props.requireTabulationOnClose).toBe(true);
    expect(props.searchControlRef).toBe(searchControlRef);
    expect(props.onConversationReopened).toBe(onConversationReopened);
    expect(props.onResolved).toBe(onResolved);
    expect(props.headerActionsSlot).toBeTruthy();
    // O kebab canônico e o FAB de ligação são do host (defaults).
    expect(props.showActionsMenu).toBeUndefined();
    expect(props.floatingCallSlot).toBeUndefined();
  });

  it("normaliza ausências para null e mantém conversation/contact estáveis", () => {
    const { rerender } = render(
      <SalesHubChat conversationId="conv-1" contactId="contact-1" contactName="Maria" dealId="deal-1" />,
    );
    const first = last();
    expect(first.conversation).toEqual({
      status: null,
      number: null,
      closedAt: null,
      lastInboundAt: null,
      assignedToId: null,
    });
    expect(first.contact).toEqual({ id: "contact-1", name: "Maria", phone: null, channel: null });

    rerender(
      <SalesHubChat conversationId="conv-1" contactId="contact-1" contactName="Maria" dealId="deal-1" />,
    );
    const second = last();
    expect(second.conversation).toBe(first.conversation);
    expect(second.contact).toBe(first.contact);
  });
});
