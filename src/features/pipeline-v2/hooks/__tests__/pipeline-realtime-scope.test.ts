/**
 * P-12 — `new_message` com escopo do board (`pipelineIds` / `dealIds`).
 *
 * - Evento de outro funil não toca o board aberto (nem patch, nem refetch).
 * - Evento com `dealIds` atualiza só os cards afetados.
 * - Card do escopo fora da página carregada refaz só o funil dele.
 * - Sem os campos (backend antigo) vale o comportamento anterior.
 *
 * Node, sem React: `applyBoardNewMessage` e `createBoardRefreshScheduler`
 * só leem/escrevem no `QueryClient`.
 */
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardDealDto, BoardStageDto } from "@/features/pipeline-v2/api";
import {
  applyBoardNewMessage,
  BOARD_REFRESH_DEBOUNCE_MS,
  createBoardRefreshScheduler,
  patchBoardLastMessage,
} from "@/features/pipeline-v2/hooks/use-pipeline-realtime";

const T_OLD = "2026-10-01T10:00:00.000Z";
const T_NEW = "2026-10-01T12:00:00.000Z";

function deal(id: string, contactId: string): BoardDealDto {
  return {
    id,
    title: id,
    value: 0,
    status: "OPEN",
    position: 0,
    expectedClose: null,
    createdAt: T_OLD,
    updatedAt: T_OLD,
    isRotting: false,
    contact: { id: contactId, name: contactId, email: null },
    owner: null,
    lastMessage: null,
    unreadCount: 0,
    awaitingMessages: [],
  };
}

function stage(id: string, deals: BoardDealDto[]): BoardStageDto {
  return {
    id,
    name: id,
    color: "#000",
    position: 0,
    winProbability: 0,
    rottingDays: 0,
    deals,
  };
}

const pagedKey = (pipelineId: string) => ["pipeline-board", pipelineId, "OPEN"] as const;
const filteredKey = (pipelineId: string) =>
  ["pipeline-board-filtered", pipelineId, "OPEN", "{}", "default", 200] as const;
const searchKey = (pipelineId: string) =>
  ["pipeline-board-search", pipelineId, "OPEN", "ana", "default", 200] as const;

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const p1: BoardStageDto[] = [
    stage("p1-s1", [deal("deal-a1", "contact-a"), deal("deal-b1", "contact-b")]),
    stage("p1-s2", [deal("deal-c1", "contact-c")]),
  ];
  const p2: BoardStageDto[] = [stage("p2-s1", [deal("deal-d2", "contact-d")])];
  qc.setQueryData(pagedKey("p1"), p1);
  qc.setQueryData(pagedKey("p2"), p2);
  return { qc, p1, p2 };
}

function board(qc: QueryClient, pipelineId: string) {
  return qc.getQueryData<BoardStageDto[]>(pagedKey(pipelineId))!;
}

function invalidated(qc: QueryClient, key: readonly unknown[]) {
  return qc.getQueryState(key)?.isInvalidated ?? false;
}

function inbound(extra: Record<string, unknown> = {}) {
  return {
    organizationId: "org-1",
    conversationId: "conv-1",
    contactId: "contact-a",
    direction: "in" as const,
    content: "oi",
    timestamp: T_NEW,
    ...extra,
  };
}

describe("applyBoardNewMessage — evento com escopo do board", () => {
  it("pipelineIds de outro funil: o board aberto não é tocado nem refeito", () => {
    const { qc, p1 } = setup();
    const setSpy = vi.spyOn(qc, "setQueryData");

    // Contato sem card em nenhum board carregado; negócio dele é do funil p9.
    const request = applyBoardNewMessage(
      qc,
      inbound({ contactId: "contact-z", pipelineIds: ["p9"], dealIds: ["deal-z9"] }),
    );

    // p9 não está em cache: o pedido de refetch não casa com query nenhuma.
    expect(request).toEqual(["p9"]);
    expect(setSpy).not.toHaveBeenCalled();
    expect(board(qc, "p1")).toBe(p1);

    vi.useFakeTimers();
    try {
      createBoardRefreshScheduler(qc).schedule(request);
      vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    expect(invalidated(qc, pagedKey("p1"))).toBe(false);
    expect(invalidated(qc, pagedKey("p2"))).toBe(false);
    expect(board(qc, "p1")).toBe(p1);
  });

  it("contato sem negócio (pipelineIds vazio): nada a refazer", () => {
    const { qc, p1, p2 } = setup();

    const request = applyBoardNewMessage(
      qc,
      inbound({ contactId: "contact-z", pipelineIds: [], dealIds: [] }),
    );

    expect(request).toBeNull();
    expect(board(qc, "p1")).toBe(p1);
    expect(board(qc, "p2")).toBe(p2);
  });

  it("dealIds: atualiza só os cards do evento; os outros ficam com a mesma referência", () => {
    const { qc, p1, p2 } = setup();

    const request = applyBoardNewMessage(
      qc,
      inbound({ pipelineIds: ["p1"], dealIds: ["deal-a1"] }),
    );

    expect(request).toBeNull();
    const next = board(qc, "p1");
    const [s1, s2] = next;
    // Card afetado.
    expect(s1.deals[0].id).toBe("deal-a1");
    expect(s1.deals[0].lastMessage).toMatchObject({
      content: "oi",
      createdAt: T_NEW,
      direction: "in",
    });
    expect(s1.deals[0].unreadCount).toBe(1);
    // Vizinho na mesma coluna, a outra coluna e o outro funil: intactos.
    expect(s1.deals[1]).toBe(p1[0].deals[1]);
    expect(s2).toBe(p1[1]);
    expect(board(qc, "p2")).toBe(p2);
  });

  it("dealIds sem contactId no evento: casa o card pelo id do negócio", () => {
    const { qc, p1 } = setup();

    const request = applyBoardNewMessage(
      qc,
      inbound({ contactId: undefined, pipelineIds: ["p1"], dealIds: ["deal-c1"] }),
    );

    expect(request).toBeNull();
    const next = board(qc, "p1");
    expect(next[0]).toBe(p1[0]);
    expect(next[1].deals[0].lastMessage).toMatchObject({ content: "oi" });
  });

  it("negócio criado há pouco (fora dos dealIds do servidor): o card ainda casa pelo contato", () => {
    const { qc } = setup();

    // Cache do servidor (60 s) ainda não conhece o deal-a1 do contact-a.
    const request = applyBoardNewMessage(
      qc,
      inbound({ pipelineIds: [], dealIds: [] }),
    );

    expect(request).toBeNull();
    expect(board(qc, "p1")[0].deals[0].lastMessage).toMatchObject({ content: "oi" });
  });

  it("card do escopo fora da página carregada: refaz só o board paginado daquele funil", () => {
    const { qc, p1, p2 } = setup();
    qc.setQueryData(filteredKey("p2"), p2);
    qc.setQueryData(searchKey("p2"), p2);

    const request = applyBoardNewMessage(
      qc,
      inbound({ contactId: "contact-z", pipelineIds: ["p2"], dealIds: ["deal-z2"] }),
    );
    expect(request).toEqual(["p2"]);
    expect(board(qc, "p1")).toBe(p1);

    vi.useFakeTimers();
    try {
      const scheduler = createBoardRefreshScheduler(qc);
      scheduler.schedule(request);
      vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS - 1);
      expect(invalidated(qc, pagedKey("p2"))).toBe(false);
      vi.advanceTimersByTime(1);
    } finally {
      vi.useRealTimers();
    }

    expect(invalidated(qc, pagedKey("p2"))).toBe(true);
    expect(invalidated(qc, pagedKey("p1"))).toBe(false);
    // Filtro/busca não são refeitos por mensagem de quem está fora deles.
    expect(invalidated(qc, filteredKey("p2"))).toBe(false);
    expect(invalidated(qc, searchKey("p2"))).toBe(false);
  });

  it("contato com negócio em dois funis: patch no que está na página, refetch só no outro", () => {
    const { qc } = setup();

    const request = applyBoardNewMessage(
      qc,
      inbound({ pipelineIds: ["p1", "p2"], dealIds: ["deal-a1", "deal-a2"] }),
    );

    expect(request).toEqual(["p2"]);
    expect(board(qc, "p1")[0].deals[0].lastMessage).toMatchObject({ content: "oi" });
  });

  it("nota interna / rascunho da IA não mexem no board, com ou sem escopo", () => {
    const { qc, p1 } = setup();

    expect(
      applyBoardNewMessage(qc, inbound({ messageType: "note", pipelineIds: ["p1"] })),
    ).toBeNull();
    expect(applyBoardNewMessage(qc, inbound({ messageType: "ai_draft" }))).toBeNull();
    expect(board(qc, "p1")).toBe(p1);
  });
});

describe("applyBoardNewMessage — sem escopo (backend antigo): comportamento anterior", () => {
  it("contato na página: patch pelo contactId, sem refetch", () => {
    const { qc, p1 } = setup();

    const request = applyBoardNewMessage(qc, inbound());

    expect(request).toBeNull();
    const next = board(qc, "p1");
    expect(next[0].deals[0].lastMessage).toMatchObject({ content: "oi", createdAt: T_NEW });
    expect(next[0].deals[1]).toBe(p1[0].deals[1]);
    expect(next[1]).toBe(p1[1]);
  });

  it("contato fora da página: refaz todo board paginado em cache", () => {
    const { qc, p1, p2 } = setup();
    qc.setQueryData(filteredKey("p1"), p1);

    const request = applyBoardNewMessage(qc, inbound({ contactId: "contact-z" }));
    expect(request).toBe("all");
    expect(board(qc, "p1")).toBe(p1);
    expect(board(qc, "p2")).toBe(p2);

    vi.useFakeTimers();
    try {
      const scheduler = createBoardRefreshScheduler(qc);
      scheduler.schedule(request);
      vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS);
    } finally {
      vi.useRealTimers();
    }
    expect(invalidated(qc, pagedKey("p1"))).toBe(true);
    expect(invalidated(qc, pagedKey("p2"))).toBe(true);
    expect(invalidated(qc, filteredKey("p1"))).toBe(false);
  });

  it("evento sem contactId: refaz todo board paginado", () => {
    const { qc } = setup();

    expect(applyBoardNewMessage(qc, inbound({ contactId: undefined }))).toBe("all");
  });

  it("patchBoardLastMessage (envio local) continua devolvendo se achou o contato", () => {
    const { qc } = setup();

    expect(
      patchBoardLastMessage(qc, {
        contactId: "contact-a",
        direction: "out",
        content: "resposta",
        timestamp: T_NEW,
      }),
    ).toBe(true);
    expect(patchBoardLastMessage(qc, { contactId: "contact-z", timestamp: T_NEW })).toBe(
      false,
    );
    expect(patchBoardLastMessage(qc, { direction: "out", timestamp: T_NEW })).toBe(false);
  });
});

describe("createBoardRefreshScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("junta os funis pedidos na janela em uma invalidação", () => {
    const { qc } = setup();
    qc.setQueryData(pagedKey("p3"), []);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const scheduler = createBoardRefreshScheduler(qc);

    scheduler.schedule(["p1"]);
    scheduler.schedule(null);
    scheduler.schedule(["p2"]);
    vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidated(qc, pagedKey("p1"))).toBe(true);
    expect(invalidated(qc, pagedKey("p2"))).toBe(true);
    expect(invalidated(qc, pagedKey("p3"))).toBe(false);
  });

  it("um pedido sem escopo na janela vence: refaz todos", () => {
    const { qc } = setup();
    const scheduler = createBoardRefreshScheduler(qc);

    scheduler.schedule(["p1"]);
    scheduler.schedule("all");
    scheduler.schedule(["p1"]);
    vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS);

    expect(invalidated(qc, pagedKey("p1"))).toBe(true);
    expect(invalidated(qc, pagedKey("p2"))).toBe(true);
  });

  it("sem pedido não agenda nada; cancel descarta o que estava pendente", () => {
    const { qc } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const scheduler = createBoardRefreshScheduler(qc);

    scheduler.schedule(null);
    vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS);
    expect(invalidate).not.toHaveBeenCalled();

    scheduler.schedule(["p1"]);
    scheduler.cancel();
    vi.advanceTimersByTime(BOARD_REFRESH_DEBOUNCE_MS);
    expect(invalidate).not.toHaveBeenCalled();
    expect(invalidated(qc, pagedKey("p1"))).toBe(false);
  });
});
