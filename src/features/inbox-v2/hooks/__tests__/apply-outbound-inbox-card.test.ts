import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { ConversationListRow } from "../../api";
import { applyOutboundPreviewToInboxCaches } from "../apply-outbound-inbox-card";
import { inboxConversationApiId } from "../use-inbox-url-sync";

function row(over: Partial<ConversationListRow> = {}): ConversationListRow {
  return {
    id: "cuid_340458",
    number: 340458,
    channel: "whatsapp",
    status: "OPEN",
    assignedToId: "u1",
    assignedTo: { id: "u1", name: "Ana", type: "HUMAN" },
    contact: { id: "ct1", name: "Aluno", phone: "+5511" },
    lastInboundAt: "2026-09-02T12:00:00.000Z",
    lastMessageDirection: "in",
    lastMessagePreview: {
      content: "cliente respondeu",
      messageType: "text",
      mediaUrl: null,
      direction: "in",
    },
    ...over,
  };
}

type InboxListCache = {
  pages: Array<{ items: ConversationListRow[]; total?: number }>;
};

describe("applyOutboundPreviewToInboxCaches", () => {
  it("tira o card de Aguardando e coloca em Respondidas (por número público)", () => {
    const qc = new QueryClient();
    const conv = row();
    qc.setQueryData(["inbox-conversations", "esperando", {}, ""], {
      pages: [{ items: [conv], total: 1 }],
      pageParams: [1],
    });
    qc.setQueryData(["inbox-conversations", "respondidas", {}, ""], {
      pages: [{ items: [], total: 0 }],
      pageParams: [1],
    });

    applyOutboundPreviewToInboxCaches(qc, "340458", {
      content: "Seu polo cadastrado está como Sapopemba?",
      messageType: "text",
    });

    const waiting = qc.getQueryData<InboxListCache>([
      "inbox-conversations",
      "esperando",
      {},
      "",
    ]);
    const answered = qc.getQueryData<InboxListCache>([
      "inbox-conversations",
      "respondidas",
      {},
      "",
    ]);

    expect(waiting?.pages[0]?.items).toEqual([]);
    expect(answered?.pages[0]?.items[0]?.id).toBe("cuid_340458");
    expect(answered?.pages[0]?.items[0]?.lastMessageDirection).toBe("out");
  });

  it("sai de Entrada (hasHumanReply=false) para Respondidas ao enviar", () => {
    const qc = new QueryClient();
    const conv = row({
      hasHumanReply: false,
      hasAgentReply: false,
      queueTab: "entrada",
    });
    qc.setQueryData(["inbox-conversations", "entrada", {}, ""], {
      pages: [{ items: [conv], total: 1 }],
      pageParams: [1],
    });
    qc.setQueryData(["inbox-conversations", "respondidas", {}, ""], {
      pages: [{ items: [], total: 0 }],
      pageParams: [1],
    });

    applyOutboundPreviewToInboxCaches(qc, "cuid_340458", {
      content: "Olá",
      messageType: "text",
    });

    const entrada = qc.getQueryData<InboxListCache>([
      "inbox-conversations",
      "entrada",
      {},
      "",
    ]);
    const answered = qc.getQueryData<InboxListCache>([
      "inbox-conversations",
      "respondidas",
      {},
      "",
    ]);

    expect(entrada?.pages[0]?.items).toEqual([]);
    expect(answered?.pages[0]?.items[0]?.hasHumanReply).toBe(true);
    expect(answered?.pages[0]?.items[0]?.lastMessageDirection).toBe("out");
  });
});

describe("inboxConversationApiId", () => {
  it("prefere o CUID da row mesmo com ?c= numérico", () => {
    expect(inboxConversationApiId("340458", { id: "cuid_340458" })).toBe(
      "cuid_340458",
    );
  });

  it("não usa o sequencial da URL sem row hidratada", () => {
    expect(inboxConversationApiId("340458", null)).toBeNull();
  });
});
