import { describe, expect, it } from "vitest";

import {
  patchMessageStatus,
  shouldRefetchMessagesOnStatus,
} from "../message-status-patch";

const cache = () => ({
  pinnedNoteId: null,
  messages: [
    { id: "wamid.1", status: "SENT" },
    { id: "uuid-2", status: "SENT" },
  ],
});

describe("patchMessageStatus", () => {
  it("atualiza status e sendStatus da bolha pelo messageId", () => {
    const next = patchMessageStatus(cache(), {
      conversationId: "c1",
      messageId: "wamid.1",
      status: "delivered",
    });
    expect(next.messages[0]).toEqual({
      id: "wamid.1",
      status: "DELIVERED",
      sendStatus: "delivered",
    });
    expect(next.messages[1]).toEqual({ id: "uuid-2", status: "SENT" });
    expect(next.pinnedNoteId).toBeNull();
  });

  it("cai no internalId quando o messageId não bate", () => {
    const next = patchMessageStatus(cache(), {
      messageId: "wamid.zzz",
      internalId: "uuid-2",
      status: "READ",
    });
    expect(next.messages[1].status).toBe("READ");
  });

  it("devolve o mesmo objeto quando não há o que patchar", () => {
    const old = cache();
    expect(patchMessageStatus(old, { messageId: "nope", status: "read" })).toBe(old);
    expect(patchMessageStatus(old, { messageId: "wamid.1", status: "weird" })).toBe(old);
    expect(patchMessageStatus(old, { status: "read" })).toBe(old);
    expect(patchMessageStatus(undefined, { messageId: "wamid.1", status: "read" })).toBe(
      undefined,
    );
  });
});

describe("shouldRefetchMessagesOnStatus", () => {
  it("só refaz GET /messages em failed", () => {
    expect(shouldRefetchMessagesOnStatus("failed")).toBe(true);
    expect(shouldRefetchMessagesOnStatus("FAILED")).toBe(true);
    expect(shouldRefetchMessagesOnStatus("delivered")).toBe(false);
    expect(shouldRefetchMessagesOnStatus("read")).toBe(false);
    expect(shouldRefetchMessagesOnStatus(undefined)).toBe(false);
  });
});
