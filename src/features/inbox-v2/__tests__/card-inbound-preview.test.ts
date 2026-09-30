import { describe, expect, it } from "vitest";

import type { ConversationListRow } from "../api";
import { toConversationCard } from "../adapters";

function row(over: Partial<ConversationListRow> = {}): ConversationListRow {
  return {
    id: "c1",
    number: 1,
    channel: "whatsapp",
    status: "OPEN",
    assignedToId: null,
    assignedTo: null,
    contact: { id: "ct1", name: "Marcelo", phone: "+55" },
    lastInboundAt: "2026-09-23T13:16:00.000Z",
    lastMessageAt: "2026-09-23T13:20:00.000Z",
    lastMessagePreview: {
      content: "Oi, tudo bem?",
      messageType: "text",
      mediaUrl: null,
      direction: "out",
    },
    ...over,
  } as ConversationListRow;
}

describe("toConversationCard — prévia só do cliente sem resposta", () => {
  it("some depois que o agente respondeu", () => {
    const card = toConversationCard(
      row({
        lastInboundPreview: {
          content: "eizes",
          messageType: "text",
          createdAt: "2026-09-23T13:16:00.000Z",
        },
      }),
    );
    expect(card.preview).toBe("");
    expect(card.previewIsOurs).toBe(false);
    expect(card.time).not.toBe("");
  });

  it("mostra a mensagem do cliente enquanto ninguém respondeu", () => {
    const card = toConversationCard(
      row({
        lastMessagePreview: {
          content: "eizes",
          messageType: "text",
          mediaUrl: null,
          direction: "in",
        },
        lastInboundPreview: {
          content: "eizes",
          messageType: "text",
          createdAt: "2026-09-23T13:16:00.000Z",
        },
      }),
    );
    expect(card.preview).toBe("eizes");
    expect(card.previewIsOurs).toBe(false);
    expect(card.lastMessageDirection).toBe("in");
  });

  it("sem mensagem do cliente: a nossa, apagada", () => {
    const card = toConversationCard(row({ lastInboundPreview: null }));
    expect(card.preview).toBe("Oi, tudo bem?");
    expect(card.previewIsOurs).toBe(true);
  });

  it("backend antigo (sem o campo): comportamento anterior", () => {
    const card = toConversationCard(row());
    expect(card.preview).toBe("Oi, tudo bem?");
    expect(card.previewIsOurs).toBe(false);
  });
});
