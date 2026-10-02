import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { ConversationListRow } from "@/features/inbox-v2/api";

import {
  applyAssigneeOptimistic,
  resolveAssignee,
  rollbackAssignee,
  syncAssigneeEverywhere,
} from "../assignee-sync";
import { teamUsersKey } from "../team-users";

function row(over: Partial<ConversationListRow> = {}): ConversationListRow {
  return {
    id: "cuid_1",
    number: 1,
    channel: "whatsapp",
    status: "OPEN",
    assignedToId: "u1",
    assignedTo: { id: "u1", name: "Ana", type: "HUMAN" },
    contact: { id: "ct1", name: "Aluno", phone: "+5511" },
    lastInboundAt: "2026-09-02T12:00:00.000Z",
    lastMessageDirection: "in",
    lastMessagePreview: {
      content: "oi",
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

function seed(qc: QueryClient, conv: ConversationListRow) {
  qc.setQueryData(["inbox-conversations", "todos", {}, ""], {
    pages: [{ items: [conv], total: 1 }],
    pageParams: [1],
  });
  qc.setQueryData(teamUsersKey(true), [
    { id: "u2", name: "Bruno", email: "b@x.com", type: "HUMAN" },
  ]);
}

function cachedRow(qc: QueryClient): ConversationListRow {
  const data = qc.getQueryData<InboxListCache>([
    "inbox-conversations",
    "todos",
    {},
    "",
  ]);
  return data!.pages[0]!.items[0]!;
}

describe("resolveAssignee", () => {
  it("devolve null para remover responsável", () => {
    expect(resolveAssignee(new QueryClient(), null)).toBeNull();
  });

  it("prefere o responsável devolvido pelo servidor", () => {
    const qc = new QueryClient();
    seed(qc, row());
    const out = resolveAssignee(qc, "u2", { id: "u2", name: "Bruno Silva", type: "HUMAN" });
    expect(out?.name).toBe("Bruno Silva");
  });

  it("usa o nome da equipe em cache quando o servidor não devolveu", () => {
    const qc = new QueryClient();
    seed(qc, row());
    expect(resolveAssignee(qc, "u2")?.name).toBe("Bruno");
  });

  it("cai para o id quando o usuário não está em cache", () => {
    const out = resolveAssignee(new QueryClient(), "u9");
    expect(out).toEqual({ id: "u9", name: "", type: "HUMAN" });
  });
});

describe("applyAssigneeOptimistic / rollbackAssignee", () => {
  it("troca o responsável com nome real e desfaz no rollback", () => {
    const qc = new QueryClient();
    seed(qc, row());

    const previous = applyAssigneeOptimistic(qc, "cuid_1", "u2");
    expect(previous?.assignedToId).toBe("u1");
    expect(cachedRow(qc).assignedToId).toBe("u2");
    expect(cachedRow(qc).assignedTo?.name).toBe("Bruno");

    rollbackAssignee(qc, "cuid_1", previous);
    expect(cachedRow(qc).assignedToId).toBe("u1");
    expect(cachedRow(qc).assignedTo?.name).toBe("Ana");
  });

  it("remove o responsável (null)", () => {
    const qc = new QueryClient();
    seed(qc, row());
    applyAssigneeOptimistic(qc, "cuid_1", null);
    expect(cachedRow(qc).assignedToId).toBeNull();
    expect(cachedRow(qc).assignedTo).toBeNull();
  });

  it("é no-op quando a conversa não está em cache", () => {
    const qc = new QueryClient();
    expect(applyAssigneeOptimistic(qc, "inexistente", "u2")).toBeNull();
    expect(() => rollbackAssignee(qc, "inexistente", null)).not.toThrow();
  });
});

describe("syncAssigneeEverywhere", () => {
  it("marca como stale negócio, timelines, conversas do Flow e boards", () => {
    const qc = new QueryClient();
    const keys = [
      ["deal-detail-v2", "d1"],
      ["deal-timeline-v2", "d1"],
      ["saleshub-contact-conversations", "ct1"],
      ["conversation-timeline", "cuid_1"],
      ["pipeline-board", "p1"],
      ["pipeline-board-filtered", "p1"],
    ] as const;
    for (const k of keys) qc.setQueryData(k, { ok: true });

    syncAssigneeEverywhere(qc, { conversationId: "cuid_1" });

    for (const k of keys) {
      expect(qc.getQueryState(k)?.isInvalidated, k.join("/")).toBe(true);
    }
  });

  it("não invalida o que não depende do responsável", () => {
    const qc = new QueryClient();
    qc.setQueryData(["contacts", "list"], { ok: true });
    syncAssigneeEverywhere(qc);
    expect(qc.getQueryState(["contacts", "list"])?.isInvalidated).toBe(false);
  });
});
