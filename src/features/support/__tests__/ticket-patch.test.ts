import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applySupportTicketPatch,
  createLeadingTrailingThrottle,
  readSupportTicketPatch,
  SUPPORT_INVALIDATE_THROTTLE_MS,
} from "../ticket-patch";
import type { SupportTicket } from "../types";

function ticket(over: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: "t1",
    number: 10,
    category: "bug",
    description: "x",
    status: "PENDING",
    requesterId: "u1",
    assignedToId: null,
    departmentId: null,
    lastMessageAt: "2026-09-30T10:00:00.000Z",
    requesterUnread: 0,
    agentUnread: 0,
    createdAt: "2026-09-30T09:00:00.000Z",
    resolvedAt: null,
    requester: { id: "u1", name: "Ana", avatarUrl: null },
    assignedTo: null,
    ...over,
  };
}

describe("readSupportTicketPatch", () => {
  it("lê o payload de support_ticket_updated", () => {
    expect(
      readSupportTicketPatch({
        organizationId: "o1",
        ticketId: "t1",
        requesterId: "u1",
        assignedToId: "a1",
        status: "OPEN",
        number: 10,
      }),
    ).toEqual({ ticketId: "t1", assignedToId: "a1", status: "OPEN", number: 10 });
  });

  it("lê lastMessageAt de support_message e ignora status inválido", () => {
    expect(
      readSupportTicketPatch({
        ticketId: "t1",
        status: "WEIRD",
        message: { id: "m1", createdAt: "2026-09-30T11:00:00.000Z" },
      }),
    ).toEqual({ ticketId: "t1", lastMessageAt: "2026-09-30T11:00:00.000Z" });
  });

  it("sem ticketId (ou payload inválido) não há patch", () => {
    expect(readSupportTicketPatch(undefined)).toBeNull();
    expect(readSupportTicketPatch("x")).toBeNull();
    expect(readSupportTicketPatch({ status: "OPEN" })).toBeNull();
  });
});

describe("applySupportTicketPatch", () => {
  it("patcheia status/responsável só no ticket do id, preservando os demais", () => {
    const other = ticket({ id: "t2" });
    const list = [ticket(), other];
    const out = applySupportTicketPatch(list, {
      ticketId: "t1",
      status: "OPEN",
      assignedToId: "a1",
    });
    expect(out).not.toBe(list);
    expect(out![0]).toMatchObject({ id: "t1", status: "OPEN", assignedToId: "a1" });
    expect(out![1]).toBe(other);
  });

  it("devolve a mesma referência quando o ticket não está na lista ou nada mudou", () => {
    const list = [ticket()];
    expect(applySupportTicketPatch(list, { ticketId: "zz", status: "OPEN" })).toBe(list);
    expect(applySupportTicketPatch(list, { ticketId: "t1", status: "PENDING" })).toBe(list);
    expect(applySupportTicketPatch(undefined, { ticketId: "t1" })).toBeUndefined();
  });

  it("resolver marca resolvedAt; reabrir limpa; tirar o responsável zera assignedTo", () => {
    const assigned = ticket({
      assignedToId: "a1",
      assignedTo: { id: "a1", name: "Bia", avatarUrl: null },
    });
    const resolved = applySupportTicketPatch([assigned], { ticketId: "t1", status: "RESOLVED" })![0];
    expect(resolved.resolvedAt).toBeTruthy();
    const reopened = applySupportTicketPatch([resolved], { ticketId: "t1", status: "OPEN" })![0];
    expect(reopened.resolvedAt).toBeNull();
    const unassigned = applySupportTicketPatch([reopened], { ticketId: "t1", assignedToId: null })![0];
    expect(unassigned.assignedToId).toBeNull();
    expect(unassigned.assignedTo).toBeNull();
  });

  it("lastMessageAt só avança (evento atrasado não regride)", () => {
    const list = [ticket({ lastMessageAt: "2026-09-30T12:00:00.000Z" })];
    expect(
      applySupportTicketPatch(list, { ticketId: "t1", lastMessageAt: "2026-09-30T11:00:00.000Z" }),
    ).toBe(list);
    expect(
      applySupportTicketPatch(list, { ticketId: "t1", lastMessageAt: "2026-09-30T13:00:00.000Z" })![0]
        .lastMessageAt,
    ).toBe("2026-09-30T13:00:00.000Z");
  });
});

describe("createLeadingTrailingThrottle (invalidação de tickets, 2 s)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("1ª chamada roda na hora; rajada vira uma execução ao fim da janela", () => {
    const fn = vi.fn();
    const t = createLeadingTrailingThrottle(fn, SUPPORT_INVALIDATE_THROTTLE_MS);
    t.call();
    expect(fn).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(100);
      t.call();
    }
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SUPPORT_INVALIDATE_THROTTLE_MS);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("depois de 2 s parado, volta a rodar na hora; cancel descarta o pendente", () => {
    const fn = vi.fn();
    const t = createLeadingTrailingThrottle(fn, 2_000);
    t.call();
    vi.advanceTimersByTime(2_000);
    t.call();
    expect(fn).toHaveBeenCalledTimes(2);
    t.call();
    t.cancel();
    vi.advanceTimersByTime(5_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
