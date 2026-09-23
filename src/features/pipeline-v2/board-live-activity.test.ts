import { describe, expect, it } from "vitest";

import {
  compareMessageActivity,
  messageActivityTimestamp,
} from "@/lib/message-activity-sort";
import type { BoardDealDto, BoardStageDto } from "./api";
import {
  foldActivityOntoDeal,
  mergeBoardKeepingLiveActivity,
  setBoardPinnedDealIds,
} from "./board-live-activity";

function deal(
  partial: Partial<BoardDealDto> & { id: string; contactId: string },
): BoardDealDto {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    value: 0,
    status: "OPEN",
    position: partial.position ?? 0,
    expectedClose: null,
    createdAt: partial.createdAt ?? "2020-01-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? partial.createdAt ?? "2020-01-01T00:00:00.000Z",
    isRotting: false,
    contact: {
      id: partial.contactId,
      name: partial.contactId,
      email: null,
    },
    owner: null,
    lastMessage: partial.lastMessage ?? null,
    unreadCount: partial.unreadCount ?? 0,
    awaitingMessages: partial.awaitingMessages ?? [],
  };
}

function stage(deals: BoardDealDto[]): BoardStageDto[] {
  return [
    {
      id: "stage-1",
      name: "Entrada",
      color: "#000",
      position: 0,
      winProbability: 0,
      rottingDays: 0,
      deals,
    },
  ];
}

function idsByMessage(deals: BoardDealDto[], order: "asc" | "desc"): string[] {
  return [...deals]
    .sort((a, b) =>
      compareMessageActivity(
        messageActivityTimestamp(a.lastMessage?.createdAt),
        messageActivityTimestamp(b.lastMessage?.createdAt),
        order,
      ),
    )
    .map((d) => d.id);
}

describe("ordenação do Flow pela última mensagem", () => {
  const olderLead = deal({
    id: "lead-old",
    contactId: "c-old",
    createdAt: "2024-01-01T00:00:00.000Z",
    lastMessage: {
      content: "oi",
      createdAt: "2026-09-23T10:00:00.000Z",
      direction: "in",
    },
  });
  const newerLead = deal({
    id: "lead-new",
    contactId: "c-new",
    createdAt: "2026-09-01T00:00:00.000Z",
    lastMessage: {
      content: "olá",
      createdAt: "2026-09-23T12:00:00.000Z",
      direction: "out",
    },
  });

  it("mais recentes primeiro ignora a data de criação do lead", () => {
    expect(idsByMessage([olderLead, newerLead], "desc")).toEqual([
      "lead-new",
      "lead-old",
    ]);
  });

  it("mais antigas primeiro inverte pela última mensagem", () => {
    expect(idsByMessage([newerLead, olderLead], "asc")).toEqual([
      "lead-old",
      "lead-new",
    ]);
  });

  it("resposta enviada reposiciona o card aberto e o eco não duplica", () => {
    const open = deal({
      id: "open",
      contactId: "c-open",
      createdAt: "2020-01-01T00:00:00.000Z",
      lastMessage: {
        content: "esperando",
        createdAt: "2026-09-23T09:00:00.000Z",
        direction: "in",
      },
    });
    const sent = foldActivityOntoDeal(open, {
      contactId: "c-open",
      direction: "out",
      content: "respondi",
      timestamp: "2026-09-23T15:00:00.000Z",
    });
    const echo = foldActivityOntoDeal(sent.deal, {
      contactId: "c-open",
      direction: "out",
      content: "respondi",
      timestamp: "2026-09-23T15:00:00.000Z",
    });
    expect(sent.changed).toBe(true);
    expect(echo.changed).toBe(false);
    expect(idsByMessage([newerLead, sent.deal], "desc")[0]).toBe("open");
    expect(idsByMessage([newerLead, sent.deal], "asc").at(-1)).toBe("open");
  });

  it("mensagem recebida sobe o card e um evento atrasado não volta a posição", () => {
    const base = deal({
      id: "open",
      contactId: "c-open",
      unreadCount: 0,
      lastMessage: {
        content: "antes",
        createdAt: "2026-09-23T11:00:00.000Z",
        direction: "out",
      },
    });
    const inbound = foldActivityOntoDeal(base, {
      contactId: "c-open",
      direction: "in",
      content: "chegou",
      timestamp: "2026-09-23T16:00:00.000Z",
    });
    const late = foldActivityOntoDeal(inbound.deal, {
      contactId: "c-open",
      direction: "in",
      content: "atrasada",
      timestamp: "2026-09-23T08:00:00.000Z",
    });
    expect(inbound.deal.unreadCount).toBe(1);
    expect(inbound.deal.lastMessage?.content).toBe("chegou");
    expect(late.changed).toBe(false);
    expect(late.deal.lastMessage?.createdAt).toBe("2026-09-23T16:00:00.000Z");
    expect(idsByMessage([olderLead, inbound.deal], "desc")[0]).toBe("open");
  });

  it("refetch velho não desfaz a mensagem ao vivo nem tira a conversa aberta", () => {
    const live = deal({
      id: "open",
      contactId: "c-open",
      lastMessage: {
        content: "agora",
        createdAt: "2026-09-23T16:00:00.000Z",
        direction: "out",
      },
    });
    const stale = deal({
      id: "open",
      contactId: "c-open",
      lastMessage: {
        content: "antes",
        createdAt: "2026-09-23T09:00:00.000Z",
        direction: "in",
      },
    });
    const other = deal({
      id: "other",
      contactId: "c-other",
      lastMessage: {
        content: "x",
        createdAt: "2026-09-20T00:00:00.000Z",
        direction: "in",
      },
    });
    const merged = mergeBoardKeepingLiveActivity(
      stage([live, other]),
      stage([stale]),
      { retainOutliers: true, now: Date.parse("2026-09-23T16:05:00.000Z") },
    );
    const open = merged[0]?.deals.find((d) => d.id === "open");
    expect(open?.lastMessage?.content).toBe("agora");
    expect(open?.lastMessage?.createdAt).toBe("2026-09-23T16:00:00.000Z");

    setBoardPinnedDealIds(["open"]);
    const dropped = mergeBoardKeepingLiveActivity(
      stage([live]),
      stage([other]),
      { retainOutliers: true, now: Date.parse("2026-09-23T18:00:00.000Z") },
    );
    expect(dropped[0]?.deals.map((d) => d.id)).toContain("open");
    setBoardPinnedDealIds([]);
  });
});

describe("foldActivityOntoDeal — prévia do cliente", () => {
  const base = () =>
    deal({
      id: "d1",
      contactId: "ct1",
      lastMessage: {
        content: "olá",
        createdAt: "2026-09-23T13:16:00.000Z",
        direction: "in",
      } as BoardDealDto["lastMessage"],
    });

  it("mensagem do cliente vira lastInboundMessage", () => {
    const out = foldActivityOntoDeal(base(), {
      contactId: "ct1",
      direction: "in",
      content: "eizes",
      timestamp: "2026-09-23T13:16:01.000Z",
    });
    expect(out.deal.lastInboundMessage).toEqual({
      content: "eizes",
      createdAt: "2026-09-23T13:16:01.000Z",
    });
    expect(out.deal.unreadCount).toBe(1);
  });

  it("resposta do agente não troca a prévia do cliente", () => {
    const withIn = { ...base(), lastInboundMessage: { content: "olá", createdAt: "2026-09-23T13:16:00.000Z" } };
    const out = foldActivityOntoDeal(withIn, {
      contactId: "ct1",
      direction: "out",
      content: "Oi, tudo bem?",
      timestamp: "2026-09-23T13:17:00.000Z",
    });
    expect(out.deal.lastInboundMessage?.content).toBe("olá");
    expect(out.deal.lastMessage?.direction).toBe("out");
  });

  it("evento sem texto (redigido) mantém a prévia e conta a não lida", () => {
    const out = foldActivityOntoDeal(base(), {
      contactId: "ct1",
      direction: "in",
      content: null,
      timestamp: "2026-09-23T13:18:00.000Z",
    });
    expect(out.deal.lastMessage?.content).toBe("olá");
    expect(out.deal.lastInboundMessage).toBeUndefined();
    expect(out.deal.unreadCount).toBe(1);
  });
});
