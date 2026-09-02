import { describe, expect, it } from "vitest";

import type { ConversationListRow } from "../api";
import { inboxQueueTabFor } from "../inbox-queue-tab";

function row(over: Partial<ConversationListRow> = {}): ConversationListRow {
  return {
    id: "cuid_1",
    number: 340458,
    channel: "whatsapp",
    status: "OPEN",
    assignedToId: "u1",
    assignedTo: { id: "u1", name: "Ana", type: "HUMAN" },
    contact: { id: "ct1", name: "Aluno", phone: "+5511" },
    lastInboundAt: "2026-09-02T12:00:00.000Z",
    ...over,
  };
}

describe("inboxQueueTabFor", () => {
  it("coluna lastMessageDirection=in prevalece sobre preview outbound", () => {
    expect(
      inboxQueueTabFor(
        row({
          lastMessageDirection: "in",
          lastMessagePreview: {
            content: "mensagem pronta",
            messageType: "text",
            mediaUrl: null,
            direction: "out",
          },
        }),
      ),
    ).toBe("esperando");
  });

  it("coluna lastMessageDirection=out tira de Aguardando", () => {
    expect(
      inboxQueueTabFor(
        row({
          lastMessageDirection: "out",
          lastMessagePreview: {
            content: "oi",
            messageType: "text",
            mediaUrl: null,
            direction: "in",
          },
        }),
      ),
    ).toBe("respondidas");
  });

  it("sem coluna, preview outbound classifica como Respondidas", () => {
    expect(
      inboxQueueTabFor(
        row({
          lastMessagePreview: {
            content: "mensagem pronta",
            messageType: "template",
            mediaUrl: null,
            direction: "out",
          },
        }),
      ),
    ).toBe("respondidas");
  });

  it("sem responsável cai em Entrada", () => {
    expect(
      inboxQueueTabFor(
        row({
          assignedToId: null,
          assignedTo: null,
          lastMessageDirection: "in",
        }),
      ),
    ).toBe("entrada");
  });
});
