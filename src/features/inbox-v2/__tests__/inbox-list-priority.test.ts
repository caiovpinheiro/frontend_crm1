import { describe, expect, it } from "vitest";

import type { ConversationListRow } from "../api";
import { toConversationCard } from "../adapters";
import { isPriorityInboxRow, sortInboxListRows } from "../inbox-list-order";
import { sortQueueItems, type QueueItem } from "@/lib/distribution-data";

const row = (id: string, minute: number, over: Partial<ConversationListRow> = {}) =>
  ({
    id,
    status: "OPEN",
    hasHumanReply: false,
    lastInboundAt: null,
    lastMessageAt: `2026-11-02T10:${String(minute).padStart(2, "0")}:00.000Z`,
    contact: { id: `ct-${id}`, name: id },
    ...over,
  }) as unknown as ConversationListRow;

describe("prioritárias na lista do inbox", () => {
  it("vêm antes das demais, da mais antiga para a mais nova", () => {
    const rows = [
      row("nova", 50),
      row("prio-b", 10, { priorityAt: "2026-11-02T09:30:00.000Z" }),
      row("prio-a", 5, { priorityAt: "2026-11-02T09:00:00.000Z" }),
      row("velha", 1),
    ];
    expect(sortInboxListRows(rows).map((r) => r.id)).toEqual(["prio-a", "prio-b", "nova", "velha"]);
  });

  it("sem prioritária, a ordem é a de sempre", () => {
    const rows = [row("a", 1), row("c", 30), row("b", 20)];
    expect(sortInboxListRows(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("ordem pedida pelo usuário não sobe prioritária", () => {
    const rows = [row("a", 1, { priorityAt: "2026-11-02T09:00:00.000Z" }), row("b", 30)];
    expect(sortInboxListRows(rows, { order: "asc" }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(sortInboxListRows(rows, { by: "unreadCount" }).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("primeira resposta humana ou encerramento tira a prioridade na hora", () => {
    const at = { priorityAt: "2026-11-02T09:00:00.000Z" };
    expect(isPriorityInboxRow(row("a", 1, at))).toBe(true);
    expect(isPriorityInboxRow(row("a", 1, { ...at, hasHumanReply: true }))).toBe(false);
    expect(isPriorityInboxRow(row("a", 1, { ...at, status: "RESOLVED" } as never))).toBe(false);
    const rows = [row("a", 1, { ...at, hasHumanReply: true }), row("b", 30)];
    expect(sortInboxListRows(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("card mostra o indicador só enquanto vale", () => {
    const at = { priorityAt: "2026-11-02T09:00:00.000Z" };
    expect(toConversationCard(row("a", 1, at)).priority).toBe(true);
    expect(toConversationCard(row("a", 1, { ...at, hasHumanReply: true })).priority).toBe(false);
    expect(toConversationCard(row("a", 1)).priority).toBe(false);
  });
});

it("fila de espera: prioritária fica na frente em qualquer ordenação", () => {
  const item = (id: string, waitingMin: number, priority?: boolean) =>
    ({ id, contact: id, phone: "", department: "D", waitingMin, enteredAt: "", enteredLabel: "", reason: "", priority }) as QueueItem;
  const rows = [item("a", 50), item("p", 1, true), item("b", 99)];
  expect(sortQueueItems(rows, "waitingMin", "desc").map((r) => r.id)).toEqual(["p", "b", "a"]);
  expect(sortQueueItems(rows, "waitingMin", "asc").map((r) => r.id)).toEqual(["p", "a", "b"]);
});
