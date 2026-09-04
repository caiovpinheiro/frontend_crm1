import { describe, expect, it } from "vitest";

import type { ConversationListRow } from "../api";
import {
  inboxQueueSectionFor,
  inboxQueueTabFor,
  rowBelongsToInboxTab,
} from "../inbox-queue-tab";

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
          hasHumanReply: true,
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
          hasHumanReply: true,
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
          hasHumanReply: true,
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

  it("assignee humano sem reply contável fica em Entrada mesmo com inbound", () => {
    expect(
      inboxQueueTabFor(
        row({
          hasHumanReply: false,
          hasAgentReply: false,
          lastMessageDirection: "in",
        }),
      ),
    ).toBe("entrada");
  });
});

describe("inboxQueueSectionFor", () => {
  it("respeita queueTab do fetch por aba", () => {
    expect(
      inboxQueueSectionFor(
        row({
          queueTab: "entrada",
          hasHumanReply: false,
          lastMessageDirection: "in",
        }),
        ["entrada", "esperando", "ligar"],
      ),
    ).toBe("entrada");
  });

  it("ligar selecionada tem prioridade sobre Aguardando", () => {
    expect(
      inboxQueueSectionFor(
        row({
          hasHumanReply: true,
          lastMessageDirection: "in",
          whatsappCallConsentStatus: "GRANTED",
        }),
        ["entrada", "esperando", "ligar"],
      ),
    ).toBe("ligar");
  });

  it("não coloca Entrada sem reply em Aguardando", () => {
    expect(
      rowBelongsToInboxTab(
        row({
          hasHumanReply: false,
          hasAgentReply: false,
          lastMessageDirection: "in",
        }),
        "esperando",
      ),
    ).toBe(false);
    expect(
      inboxQueueSectionFor(
        row({
          hasHumanReply: false,
          hasAgentReply: false,
          lastMessageDirection: "in",
        }),
        ["entrada", "esperando"],
      ),
    ).toBe("entrada");
  });
});
