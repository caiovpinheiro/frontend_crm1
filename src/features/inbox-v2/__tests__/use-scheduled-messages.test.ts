import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listScheduledMessages: vi.fn(),
}));
vi.mock("@/features/inbox-v2/api", () => api);
vi.mock("@/hooks/use-document-visible", () => ({
  useDocumentVisible: () => true,
}));

import {
  SCHEDULED_MESSAGES_POLL_MS,
  scheduledMessagesKey,
  scheduledMessagesQueryOptions,
} from "@/features/inbox-v2/hooks/use-scheduled-messages";

describe("scheduledMessagesQueryOptions", () => {
  it("usa a mesma chave do ChatWindow legado", () => {
    expect(scheduledMessagesKey("c1")).toEqual(["scheduled-messages", "c1"]);
    expect(scheduledMessagesQueryOptions("c1", true).queryKey).toEqual([
      "scheduled-messages",
      "c1",
    ]);
  });

  it("faz poll de 60 s só com conversa aberta e aba visível", () => {
    expect(SCHEDULED_MESSAGES_POLL_MS).toBe(60_000);
    const visible = scheduledMessagesQueryOptions("c1", true);
    expect(visible.enabled).toBe(true);
    expect(visible.refetchInterval).toBe(60_000);
    expect(visible.refetchIntervalInBackground).toBe(false);
    expect(visible.staleTime).toBe(15_000);

    const hidden = scheduledMessagesQueryOptions("c1", false);
    expect(hidden.enabled).toBe(true);
    expect(hidden.refetchInterval).toBe(false);

    const closed = scheduledMessagesQueryOptions(null, true);
    expect(closed.enabled).toBe(false);
    expect(closed.refetchInterval).toBe(false);
  });

  it("queryFn lista pela conversa", async () => {
    api.listScheduledMessages.mockResolvedValue({ items: [{ id: "s1" }] });
    const res = await scheduledMessagesQueryOptions("c1", true).queryFn();
    expect(api.listScheduledMessages).toHaveBeenCalledWith("c1");
    expect(res.items).toHaveLength(1);
  });
});
