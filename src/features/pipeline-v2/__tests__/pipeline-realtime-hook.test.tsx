/** @vitest-environment jsdom */
/**
 * `usePipelineRealtime` ligado ao SSE (P-12): o hook repassa o evento ao
 * núcleo com escopo e agenda o refetch só do funil afetado.
 *
 * O board aberto é uma query ATIVA (observer com `queryFn` contado): dá
 * para ver se o evento causou GET do board ou não.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => ({
  handler: null as ((event: string, data: unknown) => void) | null,
  events: null as readonly string[] | null,
}));
vi.mock("@/hooks/use-sse", () => ({
  useSSE: (
    _url: string,
    handler: (event: string, data: unknown) => void,
    _enabled: boolean,
    events: readonly string[],
  ) => {
    sse.handler = handler;
    sse.events = events;
  },
}));

import type { BoardDealDto, BoardStageDto } from "@/features/pipeline-v2/api";
import {
  BOARD_REFRESH_DEBOUNCE_MS,
  usePipelineRealtime,
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

const OPEN_KEY = ["pipeline-board", "p1", "OPEN"] as const;

/** Monta o hook com o board do funil p1 aberto (query ativa). */
async function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000, gcTime: 600_000 } },
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
      return useQuery({ queryKey: OPEN_KEY, queryFn: fetchBoard });
    },
    { wrapper },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(fetchBoard).toHaveBeenCalledTimes(1);
  return { qc, fetchBoard, view };
}

async function emit(event: string, data: unknown) {
  await act(async () => {
    sse.handler?.(event, data);
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_DEBOUNCE_MS + 50);
  });
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

beforeEach(() => {
  vi.useFakeTimers();
  sse.handler = null;
  sse.events = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePipelineRealtime", () => {
  it("assina só new_message e message_status", async () => {
    await setup();
    expect(sse.events).toEqual(["new_message", "message_status"]);
  });

  it("evento com pipelineIds de outro funil: não refaz nem altera o board aberto", async () => {
    const { qc, fetchBoard } = await setup();
    const before = qc.getQueryData(OPEN_KEY);

    await emit(
      "new_message",
      message({ contactId: "contact-z", pipelineIds: ["p2"], dealIds: ["deal-z2"] }),
    );

    expect(fetchBoard).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(OPEN_KEY)).toBe(before);
  });

  it("evento com dealIds do funil aberto: patch do card, sem GET do board", async () => {
    const { qc, fetchBoard } = await setup();
    const before = qc.getQueryData<BoardStageDto[]>(OPEN_KEY)!;

    await emit(
      "new_message",
      message({ contactId: "contact-a", pipelineIds: ["p1"], dealIds: ["deal-a1"] }),
    );

    expect(fetchBoard).toHaveBeenCalledTimes(1);
    const after = qc.getQueryData<BoardStageDto[]>(OPEN_KEY)!;
    expect(after[0].deals[0].lastMessage).toMatchObject({ content: "oi", createdAt: T_NEW });
    expect(after[0].deals[1]).toBe(before[0].deals[1]);
  });

  it("card do funil aberto fora da página: um GET do board, debounced", async () => {
    const { fetchBoard } = await setup();

    // Três mensagens na mesma janela de 800 ms.
    await act(async () => {
      for (let i = 0; i < 3; i += 1) {
        sse.handler?.(
          "new_message",
          message({ contactId: "contact-z", pipelineIds: ["p1"], dealIds: ["deal-z1"] }),
        );
      }
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_DEBOUNCE_MS + 50);
    });

    expect(fetchBoard).toHaveBeenCalledTimes(2);
  });

  it("fallback (evento sem pipelineIds/dealIds): contato fora da página refaz o board", async () => {
    const { fetchBoard } = await setup();

    await emit("new_message", message({ contactId: "contact-z" }));

    expect(fetchBoard).toHaveBeenCalledTimes(2);
  });

  it("fallback: contato na página só recebe o patch", async () => {
    const { qc, fetchBoard } = await setup();

    await emit("new_message", message({ contactId: "contact-b" }));

    expect(fetchBoard).toHaveBeenCalledTimes(1);
    const after = qc.getQueryData<BoardStageDto[]>(OPEN_KEY)!;
    expect(after[0].deals[1].lastMessage).toMatchObject({ content: "oi" });
  });

  it("desmontar cancela o refetch pendente", async () => {
    const { fetchBoard, view } = await setup();

    await act(async () => {
      sse.handler?.("new_message", message({ contactId: "contact-z" }));
    });
    view.unmount();
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_DEBOUNCE_MS + 50);

    expect(fetchBoard).toHaveBeenCalledTimes(1);
  });
});
