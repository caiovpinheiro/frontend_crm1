/** @vitest-environment jsdom */
/**
 * KF2 — mexer nos filtros do Kanban × POST /api/pipelines/:id/board.
 *
 * Antes: cada alteração de filtro trocava a chave da query e saía um POST
 * (200 cards por etapa). Cinco alterações seguidas = cinco POSTs; o mesmo
 * filtro montado em outra ordem (chip × modal × URL) gerava chave diferente
 * e mais um POST.
 *
 * O que fica travado aqui:
 *  - 5 alterações em sequência = 1 POST, com o filtro final;
 *  - filtro trocado com o POST anterior em voo: o anterior é cancelado
 *    (AbortSignal) e o quadro anterior continua na tela;
 *  - o mesmo filtro em outra ordem / com campos vazios reaproveita o cache.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getBoard: vi.fn(),
  getBoardFiltered: vi.fn(),
  getBoardColumns: vi.fn(),
}));
vi.mock("@/features/pipeline-v2/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pipeline-v2/api")>()),
  getBoard: api.getBoard,
  getBoardFiltered: api.getBoardFiltered,
  getBoardColumns: api.getBoardColumns,
}));

import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";
import type { BoardStageDto } from "@/features/pipeline-v2/api";
import { useKanbanBoard } from "@/features/pipeline-v2/hooks/use-kanban-board";

const PIPELINE = "p1";
const LATENCY = 1_000;

type FilteredOpts = {
  filters?: AdvancedDealFilters;
  perStage?: number;
  signal?: AbortSignal;
};

function boardFor(label: string): BoardStageDto[] {
  return [
    {
      id: "s1",
      name: label,
      color: "#000",
      position: 0,
      winProbability: 0,
      rottingDays: 0,
      totalCount: 0,
      hasMore: false,
      nextCursor: null,
      deals: [],
    } as unknown as BoardStageDto,
  ];
}

const signals: AbortSignal[] = [];
const posts = () => api.getBoardFiltered.mock.calls.map((c) => c[1] as FilteredOpts);

function mount(initial: AdvancedDealFilters = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ filters }: { filters: AdvancedDealFilters }) =>
      useKanbanBoard({
        pipelineId: PIPELINE,
        status: "OPEN",
        sort: undefined,
        filters,
        enabled: true,
      }),
    { wrapper, initialProps: { filters: initial } },
  );
  const apply = async (filters: AdvancedDealFilters, waitMs: number) => {
    act(() => view.rerender({ filters }));
    // Passos curtos, um `act` por passo: o render disparado por um timer
    // (debounce) só acontece na saída do `act`.
    for (let elapsed = 0; elapsed < waitMs; elapsed += 50) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    }
  };
  return { qc, view, apply };
}

beforeEach(() => {
  vi.useFakeTimers();
  signals.length = 0;
  api.getBoard.mockReset();
  api.getBoardFiltered.mockReset();
  api.getBoardColumns.mockReset();
  api.getBoard.mockResolvedValue(boardFor("sem filtro"));
  api.getBoardFiltered.mockImplementation(
    (_pid: string, opts: FilteredOpts) =>
      new Promise<BoardStageDto[]>((resolve, reject) => {
        if (opts.signal) {
          signals.push(opts.signal);
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }
        setTimeout(() => resolve(boardFor(JSON.stringify(opts.filters ?? {}))), LATENCY);
      }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Kanban — filtros × POST do board", () => {
  it("5 alterações de filtro em sequência = 1 POST, com o filtro final", async () => {
    const t = mount();
    await t.apply({}, 50);
    expect(posts().length).toBe(0);

    // Usuário marca 5 critérios, um a cada 100 ms.
    await t.apply({ tagIds: ["t1"] }, 100);
    await t.apply({ tagIds: ["t1", "t2"] }, 100);
    await t.apply({ tagIds: ["t1", "t2"], ownerIds: ["u1"] }, 100);
    await t.apply({ tagIds: ["t1", "t2"], ownerIds: ["u1"], sources: ["Site"] }, 100);
    await t.apply(
      { tagIds: ["t1", "t2"], ownerIds: ["u1"], sources: ["Site"], withoutContact: true },
      100,
    );
    await t.apply(
      { tagIds: ["t1", "t2"], ownerIds: ["u1"], sources: ["Site"], withoutContact: true },
      2_000,
    );

    expect(posts().length).toBe(1);
    expect(posts()[0]!.filters).toEqual({
      ownerIds: ["u1"],
      sources: ["Site"],
      tagIds: ["t1", "t2"],
      withoutContact: true,
    });
    expect(t.view.result.current.boardFiltered.data?.[0]?.name).toContain("withoutContact");
  });

  it("filtro trocado com o POST anterior em voo: cancela o anterior e mantém o quadro na tela", async () => {
    const t = mount({ tagIds: ["t1"] });
    await t.apply({ tagIds: ["t1"] }, 2_000);
    expect(posts().length).toBe(1);
    const first = t.view.result.current.boardFiltered.data;
    expect(first?.[0]?.name).toContain("t1");

    // Novo filtro: passa o debounce e o POST sai, mas ainda não respondeu.
    await t.apply({ tagIds: ["t2"] }, 500);
    expect(posts().length).toBe(2);
    expect(signals[1]!.aborted).toBe(false);
    // keepPreviousData: o quadro anterior segue visível.
    expect(t.view.result.current.boardFiltered.data).toBe(first);

    // Outro filtro antes da resposta: o POST de "t2" é cancelado.
    await t.apply({ tagIds: ["t3"] }, 500);
    expect(signals[1]!.aborted).toBe(true);
    await t.apply({ tagIds: ["t3"] }, 2_000);
    expect(posts().length).toBe(3);
    expect(t.view.result.current.boardFiltered.data?.[0]?.name).toContain("t3");
  });

  it("mesmo filtro em outra ordem ou com campos vazios reaproveita o cache (sem POST novo)", async () => {
    const t = mount({ tagIds: ["t2", "t1"], ownerIds: ["u2", "u1"] });
    await t.apply({ tagIds: ["t2", "t1"], ownerIds: ["u2", "u1"] }, 2_000);
    expect(posts().length).toBe(1);

    await t.apply({ sources: ["Site"] }, 2_000);
    expect(posts().length).toBe(2);

    // Volta ao 1º filtro por outro caminho: chaves e ids em outra ordem,
    // campos vazios e padrões que não mudam o resultado.
    await t.apply(
      {
        ownerIds: ["u1", "u2"],
        search: "",
        stageIds: [],
        withoutOwner: false,
        tagMode: "any",
        tagIds: ["t1", "t2"],
        createdAt: { from: null, to: null },
      },
      2_000,
    );
    expect(posts().length).toBe(2);
    expect(t.view.result.current.boardFiltered.data?.[0]?.name).toContain("t1");
  });

  it("limpar os filtros volta ao board paginado na hora, sem POST", async () => {
    const t = mount({ tagIds: ["t1"] });
    await t.apply({ tagIds: ["t1"] }, 2_000);
    expect(posts().length).toBe(1);

    await t.apply({}, 50);
    expect(t.view.result.current.hasServerBoard).toBe(false);
    await t.apply({}, 2_000);
    expect(posts().length).toBe(1);
    expect(api.getBoard).toHaveBeenCalledTimes(1);
  });
});
