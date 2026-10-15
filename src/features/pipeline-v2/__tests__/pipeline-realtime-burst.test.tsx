/** @vitest-environment jsdom */
/**
 * KF3 / gate C — eventos de mensagem × refetch do board.
 *
 * `new_message` NUNCA recarrega o board (gate C, 15/10): o card em cache
 * recebe o patch (prévia, não lidas, posição no Flow) e o resto converge na
 * revalidação seguinte (foco/volta à aba, poll de 120 s, abrir a tela), que
 * custa 304 quando o quadro não mudou. Vale com ou sem escopo
 * (`pipelineIds`), com a aba visível ou oculta e no board "mais recentes".
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => ({
  handler: null as ((event: string, data: unknown) => void) | null,
}));
vi.mock("@/hooks/use-sse", () => ({
  useSSE: (_url: string, handler: (event: string, data: unknown) => void) => {
    sse.handler = handler;
  },
}));

import type { BoardDealDto, BoardStageDto } from "@/features/pipeline-v2/api";
import { usePipelineRealtime } from "@/features/pipeline-v2/hooks/use-pipeline-realtime";

/** Janela bem maior que qualquer debounce/piso antigo (800 ms / 30 s). */
const LONG_WAIT_MS = 120_000;

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

function boardOf(deals: BoardDealDto[]): BoardStageDto[] {
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

const P1_KEY = ["pipeline-board", "p1", "OPEN"] as const;
const P2_KEY = ["pipeline-board", "p2", "OPEN"] as const;

let visibility: "visible" | "hidden" = "visible";
function setVisibility(next: "visible" | "hidden") {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Board do funil p1 aberto (query ativa, `queryFn` contado = GETs). */
async function setup(boardKey: readonly unknown[] = P1_KEY) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 600_000, gcTime: 600_000 } },
  });
  const fetchBoard = vi.fn(async () =>
    boardOf([deal("deal-a1", "contact-a"), deal("deal-b1", "contact-b")]),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      usePipelineRealtime(true);
      return useQuery({ queryKey: boardKey, queryFn: fetchBoard });
    },
    { wrapper },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(fetchBoard).toHaveBeenCalledTimes(1);
  return { qc, fetchBoard, view };
}

function message(extra: Record<string, unknown>) {
  return {
    organizationId: "org-1",
    conversationId: "conv-1",
    direction: "in",
    content: "oi",
    timestamp: T_NEW,
    ...extra,
  };
}

/** `count` mensagens, uma por segundo, cada uma montada por `build(i)`. */
async function burst(count: number, build: (i: number) => Record<string, unknown>) {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      sse.handler?.("new_message", message(build(i)));
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sse.handler = null;
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("board sob rajada de mensagens (20 eventos, 1 por segundo)", () => {
  it("cards na página carregada: só patch, nenhum GET do board", async () => {
    const { qc, fetchBoard } = await setup();

    await burst(20, (i) => ({
      contactId: i % 2 === 0 ? "contact-a" : "contact-b",
      pipelineIds: ["p1"],
      dealIds: [i % 2 === 0 ? "deal-a1" : "deal-b1"],
      content: `msg ${i}`,
    }));
    await advance(LONG_WAIT_MS * 2);

    expect(fetchBoard).toHaveBeenCalledTimes(1);
    const board = qc.getQueryData<BoardStageDto[]>(P1_KEY)!;
    expect(board[0]!.deals[0]!.lastMessage).toMatchObject({ content: "msg 18" });
    expect(board[0]!.deals[1]!.lastMessage).toMatchObject({ content: "msg 19" });
  });

  it("cards fora da página (evento com escopo): 20 eventos = 0 GETs", async () => {
    const { fetchBoard } = await setup();

    await burst(20, (i) => ({
      contactId: `contact-fora-${i}`,
      pipelineIds: ["p1"],
      dealIds: [`deal-fora-${i}`],
    }));
    await advance(LONG_WAIT_MS * 2);

    // Card além da página, fora do filtro ou negócio fechado: só o patch do
    // que está em cache, nunca recarga.
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it("backend antigo (evento sem escopo) e card fora da página: 0 GETs", async () => {
    const { fetchBoard } = await setup();

    await burst(20, (i) => ({ contactId: `contact-fora-${i}` }));
    await advance(LONG_WAIT_MS * 2);

    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it("aba oculta e de volta: nenhum GET por mensagem", async () => {
    const { fetchBoard } = await setup();

    act(() => setVisibility("hidden"));
    await burst(20, (i) => ({ contactId: `contact-fora-${i}` }));
    await advance(LONG_WAIT_MS);
    act(() => setVisibility("visible"));
    await advance(LONG_WAIT_MS);
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it("evento isolado sem contactId (legado): nenhum GET", async () => {
    const { fetchBoard } = await setup();

    await act(async () => {
      sse.handler?.("new_message", message({ contactId: undefined }));
      await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);
    });

    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  it("message_status (ticks): nenhum GET", async () => {
    const { fetchBoard } = await setup();

    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        sse.handler?.("message_status", {
          organizationId: "org-1",
          conversationId: "conv-1",
          messageId: `wamid-${i}`,
          status: "delivered",
        });
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }
    await advance(LONG_WAIT_MS);
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });
});

/**
 * Teste sintético do volume medido em produção (10/10): organização
 * movimentada, uma mensagem a cada 3 s durante 1 min, de contatos cujo card
 * não está no board em cache (negócio fechado no escopo, card além da
 * página). Conta as cargas do board por minuto com a aba visível.
 */
describe("cargas do board por minuto (20 mensagens em 1 min)", () => {
  async function perMinute(build: (i: number) => Record<string, unknown>) {
    const { fetchBoard } = await setup();
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        sse.handler?.("new_message", message(build(i)));
        await vi.advanceTimersByTimeAsync(3_000);
      });
    }
    return fetchBoard.mock.calls.length - 1;
  }

  it("evento com escopo: 0 cargas", async () => {
    const loads = await perMinute((i) => ({
      contactId: `contact-fechado-${i}`,
      pipelineIds: ["p1"],
      dealIds: [`deal-fechado-${i}`],
    }));
    expect(loads).toBe(0);
  });

  it("evento sem escopo (backend antigo): 0 cargas", async () => {
    const loads = await perMinute((i) => ({ contactId: `contact-fora-${i}` }));
    expect(loads).toBe(0);
  });

  it("aba oculta: 0 cargas, com ou sem escopo", async () => {
    act(() => setVisibility("hidden"));
    const loads = await perMinute((i) =>
      i % 2 === 0
        ? { contactId: `contact-fora-${i}` }
        : { contactId: `contact-fora-${i}`, pipelineIds: ["p1"], dealIds: [`d-${i}`] },
    );
    expect(loads).toBe(0);
  });
});

/**
 * Flow (status ALL, `lastInteraction:desc`, 10 por etapa) e Kanban "mais
 * recentes": quem responde e está além da página carregada sobe para o topo
 * no servidor, mas a mensagem não recarrega o board — o lead entra na
 * revalidação seguinte (o ETag desse board acompanha a atividade do funil).
 */
describe("board 'mais recentes': mensagem de lead fora da página", () => {
  const FLOW_KEY = ["pipeline-board", "p1", "ALL", "lastInteraction:desc"] as const;

  async function perMinute(
    key: readonly unknown[],
    build: (i: number) => Record<string, unknown>,
  ) {
    const { fetchBoard } = await setup(key);
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        sse.handler?.("new_message", message(build(i)));
        await vi.advanceTimersByTimeAsync(3_000);
      });
    }
    return fetchBoard.mock.calls.length - 1;
  }

  const fora = (i: number) => ({
    contactId: `contact-fora-${i}`,
    pipelineIds: ["p1"],
    dealIds: [`deal-fora-${i}`],
  });

  it("20 mensagens em 1 min de leads fora da página: 0 cargas", async () => {
    expect(await perMinute(FLOW_KEY, fora)).toBe(0);
  });

  it("card já em cache: só patch, 0 recargas", async () => {
    expect(
      await perMinute(FLOW_KEY, (i) => ({
        contactId: i % 2 === 0 ? "contact-a" : "contact-b",
        pipelineIds: ["p1"],
        dealIds: [i % 2 === 0 ? "deal-a1" : "deal-b1"],
      })),
    ).toBe(0);
  });

  it("evento de outro funil: 0 recargas", async () => {
    expect(
      await perMinute(FLOW_KEY, (i) => ({ ...fora(i), pipelineIds: ["p2"] })),
    ).toBe(0);
  });

  it("ordenação por criação, mais antigas ou manual: 0 recargas", async () => {
    for (const sort of ["createdAt:desc", "lastInteraction:asc", undefined]) {
      cleanup();
      const key = sort ? ["pipeline-board", "p1", "ALL", sort] : ["pipeline-board", "p1", "ALL"];
      expect(await perMinute(key, fora)).toBe(0);
    }
  });

  it("aba oculta: 0 recargas", async () => {
    act(() => setVisibility("hidden"));
    expect(await perMinute(FLOW_KEY, fora)).toBe(0);
  });
});

describe("negócio criado (deal_moved sem origem) no board aberto", () => {
  const created = (extra: Record<string, unknown> = {}) => ({
    organizationId: "org-1",
    dealId: "deal-novo",
    toPipelineId: "p1",
    toStageId: "stage-1",
    position: 0.5,
    updatedAt: T_NEW,
    ownerId: null,
    card: {
      id: "deal-novo",
      title: "Lead novo",
      status: "OPEN",
      contact: { id: "contact-novo", name: "Ana" },
    },
    ...extra,
  });

  it("fromStageId null: o card aparece na etapa, sem GET; a mensagem seguinte só faz patch", async () => {
    const { qc, fetchBoard } = await setup();

    await act(async () => {
      sse.handler?.("deal_moved", created({ fromStageId: null, fromPipelineId: null }));
      await vi.advanceTimersByTimeAsync(LONG_WAIT_MS * 2);
    });

    const board = qc.getQueryData<BoardStageDto[]>(P1_KEY)!;
    expect(board[0]!.deals.map((d) => d.id)).toContain("deal-novo");

    await act(async () => {
      sse.handler?.(
        "new_message",
        message({ contactId: "contact-novo", pipelineIds: ["p1"], dealIds: ["deal-novo"] }),
      );
      await vi.advanceTimersByTimeAsync(LONG_WAIT_MS * 2);
    });
    const after = qc.getQueryData<BoardStageDto[]>(P1_KEY)!;
    expect(after[0]!.deals.find((d) => d.id === "deal-novo")!.lastMessage).toMatchObject({
      content: "oi",
    });
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });

  /** Board filtrado aberto (query ativa, `queryFn` contado = POSTs). */
  async function filteredSetup(filters: Record<string, unknown>) {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 600_000, gcTime: 600_000 } },
    });
    const filteredKey = [
      "pipeline-board-filtered",
      "p1",
      "OPEN",
      JSON.stringify(filters),
      "default",
      50,
    ];
    const fetchFiltered = vi.fn(async () => boardOf([deal("deal-a1", "contact-a")]));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(
      () => {
        usePipelineRealtime(true);
        return useQuery({ queryKey: filteredKey, queryFn: fetchFiltered });
      },
      { wrapper },
    );
    await advance(0);
    expect(fetchFiltered).toHaveBeenCalledTimes(1);
    const ids = () => qc.getQueryData<BoardStageDto[]>(filteredKey)![0]!.deals.map((d) => d.id);
    return { fetchFiltered, ids };
  }

  /** Três leads novos em 3 s, cada um montado por `build`. */
  async function threeCreated(build: (id: string) => Record<string, unknown>) {
    for (const id of ["n1", "n2", "n3"]) {
      await act(async () => {
        sse.handler?.("deal_moved", created({ dealId: id, fromStageId: null, ...build(id) }));
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }
    await advance(LONG_WAIT_MS * 3);
  }

  it("busca 'maria' + criação de 'João': o card não entra e nenhum POST", async () => {
    const { fetchFiltered, ids } = await filteredSetup({ search: "maria" });

    await threeCreated((id) => ({ card: { id, title: "João", status: "OPEN" } }));

    expect(ids()).toEqual(["deal-a1"]);
    expect(fetchFiltered).toHaveBeenCalledTimes(1);
  });

  it("filtro por responsável X + negócios criados do X: entram na hora, nenhum POST", async () => {
    const { fetchFiltered, ids } = await filteredSetup({ ownerIds: ["u-x"] });

    await threeCreated((id) => ({
      ownerId: "u-x",
      card: { id, title: id, status: "OPEN", owner: { id: "u-x", name: "X" } },
    }));

    expect(ids()).toEqual(expect.arrayContaining(["deal-a1", "n1", "n2", "n3"]));
    expect(fetchFiltered).toHaveBeenCalledTimes(1);
  });

  it("filtro por responsável X + negócio criado do Y: não entra, nenhum POST", async () => {
    const { fetchFiltered, ids } = await filteredSetup({ ownerIds: ["u-x"] });

    await threeCreated((id) => ({
      ownerId: "u-y",
      card: { id, title: id, status: "OPEN", owner: { id: "u-y", name: "Y" } },
    }));

    expect(ids()).toEqual(["deal-a1"]);
    expect(fetchFiltered).toHaveBeenCalledTimes(1);
  });

  it("filtro por campo personalizado: não entra, nenhum POST", async () => {
    const { fetchFiltered, ids } = await filteredSetup({
      dealCustomFields: [{ name: "cidade", operator: "eq", value: "SP" }],
    });

    await threeCreated((id) => ({ card: { id, title: id, status: "OPEN" } }));

    expect(ids()).toEqual(["deal-a1"]);
    expect(fetchFiltered).toHaveBeenCalledTimes(1);
  });

  it("forma alternativa (fromStageId ausente + created: true): mesmo resultado", async () => {
    const { qc, fetchBoard } = await setup();

    await act(async () => {
      sse.handler?.("deal_moved", created({ created: true }));
      await vi.advanceTimersByTimeAsync(LONG_WAIT_MS * 2);
    });

    const board = qc.getQueryData<BoardStageDto[]>(P1_KEY)!;
    expect(board[0]!.deals.filter((d) => d.id === "deal-novo")).toHaveLength(1);
    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });
});
