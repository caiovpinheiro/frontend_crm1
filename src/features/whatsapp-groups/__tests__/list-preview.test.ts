import { describe, expect, it } from "vitest";

import { clearGroupUnread, groupListPreview, unreadBadgeLabel } from "../list-preview";
import type { WhatsAppGroupListItem, WhatsAppGroupsListResponse } from "../types";

const g = (over: Partial<WhatsAppGroupListItem> = {}): WhatsAppGroupListItem => ({
  id: "g1",
  jid: "1@g.us",
  name: "Dna X Cacau Lopes",
  description: null,
  ownerJid: null,
  participantCount: 6,
  syncedAt: "2026-11-13T12:00:00.000Z",
  lastMessageAt: "2026-11-13T15:34:00.000Z",
  lastMessagePreview: "Ah tá ótimo, vamos ver se agora eles desenrolam.",
  lastMessageAuthor: "Kleber Raia",
  lastMessageFromMe: false,
  unreadCount: 0,
  ...over,
});

describe("grupos WhatsApp — prévia na lista", () => {
  it("quem mandou + texto", () => {
    expect(groupListPreview(g())).toEqual({
      author: "Kleber Raia",
      text: "Ah tá ótimo, vamos ver se agora eles desenrolam.",
    });
  });

  it("mensagem do próprio número aparece como 'Você'", () => {
    expect(groupListPreview(g({ lastMessageFromMe: true, lastMessageAuthor: null }))?.author).toBe("Você");
  });

  it("sem mensagem no CRM: sem prévia (lista mostra participantes)", () => {
    expect(groupListPreview(g({ lastMessagePreview: null }))).toBeNull();
    expect(groupListPreview(g({ lastMessagePreview: "  " }))).toBeNull();
  });

  it("autor desconhecido: só o texto", () => {
    expect(groupListPreview(g({ lastMessageAuthor: null }))?.author).toBeNull();
  });
});

describe("grupos WhatsApp — não lidas", () => {
  it("bolinha some no zero e trava em 99+", () => {
    expect(unreadBadgeLabel(0)).toBeNull();
    expect(unreadBadgeLabel(3)).toBe("3");
    expect(unreadBadgeLabel(99)).toBe("99");
    expect(unreadBadgeLabel(100)).toBe("99+");
  });

  it("abrir o grupo zera só ele no cache da lista", () => {
    const cache: WhatsAppGroupsListResponse = {
      connected: true,
      channel: null,
      groups: [g({ id: "g1", unreadCount: 2 }), g({ id: "g2", unreadCount: 5 })],
    };
    const next = clearGroupUnread(cache, "g1");
    expect(next?.groups.map((x) => x.unreadCount)).toEqual([0, 5]);
    expect(clearGroupUnread(next, "g1")).toBe(next);
  });
});
