/** @vitest-environment jsdom */
/**
 * `scheduled_message_updated` (SSE) invalida `["scheduled-messages", id]`
 * — o banner refaz o GET na hora, sem esperar o poll de 60 s. Só para
 * conversa com query ATIVA (aberta nesta página). Reconexão do SSE também
 * invalida a da conversa aberta (o evento pode ter se perdido no gap).
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => {
  const state = {
    handlers: null as Record<string, (data: unknown) => void> | null,
    onReconnect: null as (() => void) | null,
  };
  return {
    state,
    subscribeSSEEvents: vi.fn(
      (
        _url: string,
        handlers: Record<string, (data: unknown) => void>,
        onReconnect?: () => void,
      ) => {
        state.handlers = handlers;
        state.onReconnect = onReconnect ?? null;
        return () => {
          state.handlers = null;
          state.onReconnect = null;
        };
      },
    ),
  };
});
vi.mock("@/hooks/use-sse", () => ({
  subscribeSSEEvents: sse.subscribeSSEEvents,
  useSSEConnected: () => true,
}));
vi.mock("@/features/inbox-v2/context/message-toast-context", () => ({
  useMessageToast: () => ({ registerActiveConversation: () => () => {} }),
}));

import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";
import { scheduledMessagesKey } from "@/features/inbox-v2/hooks/use-scheduled-messages";

function setup(openId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchC1 = vi.fn(async () => ({ items: [] }));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      useInboxRealtime({ activeConversationId: openId, currentUserId: "u_me" });
      // O banner da conversa aberta (query ativa).
      return useQuery({ queryKey: scheduledMessagesKey("c1"), queryFn: fetchC1 });
    },
    { wrapper },
  );
  return { qc, fetchC1, view };
}

describe("useInboxRealtime — scheduled_message_updated", () => {
  beforeEach(() => {
    sse.state.handlers = null;
    sse.state.onReconnect = null;
  });
  afterEach(() => cleanup());

  it("assina o evento e refaz o GET dos agendados da conversa do evento", async () => {
    const { fetchC1 } = setup("c1");
    await waitFor(() => expect(fetchC1).toHaveBeenCalledTimes(1));
    expect(sse.state.handlers).toHaveProperty("scheduled_message_updated");

    sse.state.handlers!.scheduled_message_updated({
      organizationId: "org_1",
      conversationId: "c1",
      scheduledMessageId: "sm_1",
      status: "PENDING",
    });
    await waitFor(() => expect(fetchC1).toHaveBeenCalledTimes(2));
  });

  it("evento de outra conversa (sem banner aberto) não busca nada", async () => {
    const { fetchC1, qc } = setup("c1");
    await waitFor(() => expect(fetchC1).toHaveBeenCalledTimes(1));
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    sse.state.handlers!.scheduled_message_updated({ conversationId: "c2", status: "SENT" });
    sse.state.handlers!.scheduled_message_updated(undefined);
    await new Promise((r) => setTimeout(r, 20));

    expect(fetchC1).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["scheduled-messages", "c2"],
      refetchType: "active",
    });
  });

  it("reconexão do SSE invalida os agendados da conversa aberta", async () => {
    const { fetchC1 } = setup("c1");
    await waitFor(() => expect(fetchC1).toHaveBeenCalledTimes(1));
    expect(sse.state.onReconnect).toBeTypeOf("function");

    sse.state.onReconnect!();
    await waitFor(() => expect(fetchC1).toHaveBeenCalledTimes(2));
  });
});
