/** @vitest-environment jsdom */
/**
 * P-14 — "Carregar mais" de uma coluna do board por cursor.
 *
 *  - anexa os cards à coluna em cache: uma requisição (só a página), sem
 *    refazer o board, sem duplicar, preservando a referência dos cards e
 *    das etapas que não mudaram — os cards `memo` já visíveis não
 *    re-renderizam;
 *  - fallback: board sem `nextCursor` (backend antigo) ou rota recusada →
 *    comportamento anterior (POST /board com `offsetByStage`);
 *  - refetch do board (invalidação) recarrega as colunas expandidas pelo
 *    cursor da 1ª página nova;
 *  - evento SSE (`new_message`) com a coluna paginada: patch no card
 *    anexado, cursor intacto, paginação continua.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { memo, useMemo, type ReactNode } from "react";
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

import { toKanbanColumns } from "@/features/pipeline-v2/adapters";
import {
  BoardColumnsError,
  type BoardColumnPageDto,
  type BoardDealDto,
  type BoardStageDto,
} from "@/features/pipeline-v2/api";
import {
  appendBoardColumnPages,
  reloadBoardExpansions,
} from "@/features/pipeline-v2/board-column-paging";
import { boardKey, useBoard } from "@/features/pipeline-v2/hooks/use-board";
import {
  useBoardLoadMore,
  useStableBoardStages,
} from "@/features/pipeline-v2/hooks/use-board-load-more";
import { patchBoardLastMessage } from "@/features/pipeline-v2/hooks/use-pipeline-realtime";

const PIPELINE = "8";
const PAGE = 2;
const KEY = boardKey(PIPELINE, "OPEN");

function deal(id: string, extra: Partial<BoardDealDto> = {}): BoardDealDto {
  return {
    id,
    title: `Negócio ${id}`,
    value: 10,
    status: "OPEN",
    position: 1,
    contact: { id: `ct-${id}`, name: `Contato ${id}` },
    owner: null,
    tags: [],
    unreadCount: 0,
    lastMessage: null,
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
    ...extra,
  } as unknown as BoardDealDto;
}

function stage(
  id: string,
  position: number,
  deals: BoardDealDto[],
  extra: Partial<BoardStageDto> = {},
): BoardStageDto {
  return {
    id,
    name: `Etapa ${id}`,
    color: "#5b6ff5",
    position,
    winProbability: 0,
    rottingDays: 30,
    totalCount: deals.length,
    loadedCount: deals.length,
    hasMore: false,
    deals,
    ...extra,
  };
}

/** Board do backend novo: s1 com mais cards e cursor; s2 completa. */
function cursorBoard(): BoardStageDto[] {
  return [
    stage("s1", 1, [deal("a"), deal("b")], { totalCount: 5, hasMore: true, nextCursor: "CUR-1" }),
    stage("s2", 2, [deal("x")], { nextCursor: null }),
  ];
}

function columnPage(
  stageId: string,
  deals: BoardDealDto[],
  extra: Partial<BoardColumnPageDto> = {},
): BoardColumnPageDto {
  return { stageId, deals, totalCount: 5, hasMore: true, nextCursor: "CUR-2", ...extra };
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function setupHooks(qc = makeClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      const more = useBoardLoadMore({ pipelineId: PIPELINE, status: "OPEN", pageSize: PAGE });
      const board = useBoard({
        pipelineId: PIPELINE,
        status: "OPEN",
        perStage: PAGE,
        offsetByStage: more.legacyOffsets,
      });
      return { more, board };
    },
    { wrapper },
  );
  const cached = () => qc.getQueryData<BoardStageDto[]>(KEY)!;
  return { qc, view, cached };
}

const ids = (s: BoardStageDto | undefined) => (s?.deals ?? []).map((d) => d.id);

beforeEach(() => {
  api.getBoard.mockReset();
  api.getBoardFiltered.mockReset();
  api.getBoardColumns.mockReset();
});
afterEach(() => cleanup());

describe("appendBoardColumnPages", () => {
  it("anexa só à etapa da página; cards e etapas intocados mantêm a referência", () => {
    const board = cursorBoard();
    const next = appendBoardColumnPages(board, [columnPage("s1", [deal("c"), deal("d")])])!;
    expect(next).not.toBe(board);
    expect(ids(next[0])).toEqual(["a", "b", "c", "d"]);
    expect(next[0]!.deals[0]).toBe(board[0]!.deals[0]);
    expect(next[0]!.deals[1]).toBe(board[0]!.deals[1]);
    expect(next[1]).toBe(board[1]);
    expect(next[0]).toMatchObject({
      hasMore: true,
      nextCursor: "CUR-2",
      loadedCount: 4,
      totalCount: 5,
    });
  });

  it("não duplica: card repetido na página, já na coluna ou já em OUTRA etapa", () => {
    const board = cursorBoard();
    const next = appendBoardColumnPages(board, [
      columnPage("s1", [deal("b"), deal("c"), deal("c"), deal("x")]),
    ])!;
    expect(ids(next[0])).toEqual(["a", "b", "c"]);
    expect(ids(next[1])).toEqual(["x"]);
  });

  it("última página: hasMore=false, sem cursor, e o total passa a ser o carregado", () => {
    const board = cursorBoard();
    const next = appendBoardColumnPages(board, [
      columnPage("s1", [deal("c")], { hasMore: false, nextCursor: null, totalCount: 5 }),
    ])!;
    expect(next[0]).toMatchObject({ hasMore: false, nextCursor: null, totalCount: 3, loadedCount: 3 });
  });

  it("total atual do servidor substitui o do board", () => {
    const next = appendBoardColumnPages(cursorBoard(), [
      columnPage("s1", [deal("c")], { totalCount: 9 }),
    ])!;
    expect(next[0]!.totalCount).toBe(9);
  });

  it("sem páginas (ou sem board) devolve a mesma referência", () => {
    const board = cursorBoard();
    expect(appendBoardColumnPages(board, [])).toBe(board);
    expect(appendBoardColumnPages(undefined, [columnPage("s1", [deal("c")])])).toBeUndefined();
    // página de etapa que não está no board: nada muda
    expect(appendBoardColumnPages(board, [columnPage("zz", [deal("c")])])).toBe(board);
  });
});

describe("reloadBoardExpansions", () => {
  it("pede só o que falta em cada etapa expandida, numa requisição", async () => {
    const base = [
      stage("s1", 1, [deal("a"), deal("b")], { totalCount: 9, hasMore: true, nextCursor: "N1" }),
      stage("s2", 2, [deal("x")], { totalCount: 4, hasMore: true, nextCursor: "N2" }),
      stage("s3", 3, [deal("y")], { nextCursor: null }),
    ];
    const fetchColumns = vi.fn(async () => [
      columnPage("s1", [deal("c"), deal("d"), deal("e"), deal("f")], { nextCursor: "N1b" }),
    ]);
    const out = await reloadBoardExpansions({
      base,
      // s1: usuário tinha 6 carregados; s2: nunca expandiu; s3: sem cursor
      loaded: { s1: 6, s3: 5 },
      fetchColumns,
    });
    expect(fetchColumns).toHaveBeenCalledTimes(1);
    expect(fetchColumns).toHaveBeenCalledWith([{ stageId: "s1", cursor: "N1", limit: 4 }]);
    expect(ids(out[0])).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(out[1]).toBe(base[1]);
  });

  it("nada expandido → nenhuma requisição; falha → 1ª página e avisa", async () => {
    const base = cursorBoard();
    const fetchColumns = vi.fn();
    expect(await reloadBoardExpansions({ base, loaded: {}, fetchColumns })).toBe(base);
    expect(fetchColumns).not.toHaveBeenCalled();

    const onFailure = vi.fn();
    const out = await reloadBoardExpansions({
      base,
      loaded: { s1: 4 },
      fetchColumns: vi.fn(async () => {
        throw new Error("fora do ar");
      }),
      onFailure,
    });
    expect(out).toBe(base);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});

describe("useBoardLoadMore — cursor", () => {
  it("anexa os cards com UMA requisição da página, sem refazer o board nem duplicar", async () => {
    api.getBoard.mockResolvedValue(cursorBoard());
    api.getBoardColumns.mockResolvedValueOnce([
      // `b` repetido (mudou de posição entre as páginas) + 2 novos
      columnPage("s1", [deal("b"), deal("c"), deal("d")]),
    ]);
    const { view, cached } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());
    const before = cached();

    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });

    expect(api.getBoardColumns).toHaveBeenCalledTimes(1);
    expect(api.getBoardColumns).toHaveBeenCalledWith(PIPELINE, {
      status: "OPEN",
      sort: undefined,
      columns: [{ stageId: "s1", cursor: "CUR-1", limit: PAGE }],
    });
    // board não foi buscado de novo, nem pelo POST com offset
    expect(api.getBoard).toHaveBeenCalledTimes(1);
    expect(api.getBoardFiltered).not.toHaveBeenCalled();

    const after = cached();
    expect(ids(after[0])).toEqual(["a", "b", "c", "d"]);
    expect(after[0]!.deals[0]).toBe(before[0]!.deals[0]);
    expect(after[0]!.deals[1]).toBe(before[0]!.deals[1]);
    expect(after[1]).toBe(before[1]);
    expect(after[0]!.nextCursor).toBe("CUR-2");
    await waitFor(() => expect(view.result.current.more.loadingStageIds.size).toBe(0));
    expect(view.result.current.more.legacyOffsets).toEqual({});

    // próxima página continua do cursor novo
    api.getBoardColumns.mockResolvedValueOnce([
      columnPage("s1", [deal("e")], { hasMore: false, nextCursor: null }),
    ]);
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    expect(api.getBoardColumns.mock.calls[1]![1].columns).toEqual([
      { stageId: "s1", cursor: "CUR-2", limit: PAGE },
    ]);
    expect(ids(cached()[0])).toEqual(["a", "b", "c", "d", "e"]);
    expect(cached()[0]).toMatchObject({ hasMore: false, nextCursor: null });

    // acabou: mais um clique não pede nada
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    expect(api.getBoardColumns).toHaveBeenCalledTimes(2);
    expect(api.getBoard).toHaveBeenCalledTimes(1);
  });

  it("várias etapas (fila do Flow): uma requisição para todas", async () => {
    api.getBoard.mockResolvedValue([
      stage("s1", 1, [deal("a")], { totalCount: 3, hasMore: true, nextCursor: "A1" }),
      stage("s2", 2, [deal("x")], { totalCount: 3, hasMore: true, nextCursor: "X1" }),
      stage("s3", 3, [deal("z")], { nextCursor: null }),
    ]);
    api.getBoardColumns.mockResolvedValueOnce([
      columnPage("s1", [deal("b")], { nextCursor: "A2", totalCount: 3 }),
      columnPage("s2", [deal("y")], { nextCursor: "X2", totalCount: 3 }),
    ]);
    const { view, cached } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());
    await act(async () => {
      await view.result.current.more.loadMore(["s1", "s2", "s3"]);
    });
    expect(api.getBoardColumns).toHaveBeenCalledTimes(1);
    expect(api.getBoardColumns.mock.calls[0]![1].columns).toEqual([
      { stageId: "s1", cursor: "A1", limit: PAGE },
      { stageId: "s2", cursor: "X1", limit: PAGE },
    ]);
    expect(cached().map(ids)).toEqual([["a", "b"], ["x", "y"], ["z"]]);
  });

  it("refetch do board recarrega as colunas expandidas pelo cursor da 1ª página NOVA", async () => {
    api.getBoard.mockResolvedValueOnce(cursorBoard());
    api.getBoardColumns.mockResolvedValueOnce([columnPage("s1", [deal("c"), deal("d")])]);
    const { qc, view, cached } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    expect(ids(cached()[0])).toEqual(["a", "b", "c", "d"]);

    // invalidação (mutação/SSE): a 1ª página volta diferente e com outro cursor
    api.getBoard.mockResolvedValueOnce([
      stage("s1", 1, [deal("n"), deal("a")], { totalCount: 6, hasMore: true, nextCursor: "NEW-1" }),
      stage("s2", 2, [deal("x")], { nextCursor: null }),
    ]);
    api.getBoardColumns.mockResolvedValueOnce([
      columnPage("s1", [deal("b"), deal("c")], { nextCursor: "NEW-2", totalCount: 6 }),
    ]);
    await act(async () => {
      await qc.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(ids(cached()[0])).toEqual(["n", "a", "b", "c"]));
    // 4 carregados antes − 2 da 1ª página nova = 2 a recarregar, pelo cursor novo
    expect(api.getBoardColumns.mock.calls[1]![1].columns).toEqual([
      { stageId: "s1", cursor: "NEW-1", limit: 2 },
    ]);
    expect(cached()[0]!.nextCursor).toBe("NEW-2");
    expect(api.getBoardFiltered).not.toHaveBeenCalled();
  });

  it("'carregar mais' que termina com o refetch do board em voo: a página é reaproveitada (1 POST por cursor)", async () => {
    api.getBoard.mockResolvedValueOnce(cursorBoard());
    const { qc, view, cached } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());

    // Refetch do board em voo (voltar ao paginado ao tirar o filtro, intervalo,
    // invalidação)…
    let resolveBoard!: (board: BoardStageDto[]) => void;
    api.getBoard.mockImplementationOnce(
      () =>
        new Promise<BoardStageDto[]>((resolve) => {
          resolveBoard = resolve;
        }),
    );
    const refetch = qc.invalidateQueries({ queryKey: KEY });

    // …e, enquanto isso, a sentinela pede a próxima página pelo cursor da
    // 1ª página em cache.
    api.getBoardColumns.mockResolvedValue([columnPage("s1", [deal("c"), deal("d")])]);
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    expect(ids(cached()[0])).toEqual(["a", "b", "c", "d"]);
    expect(api.getBoardColumns).toHaveBeenCalledTimes(1);

    // O board volta igual (mesma 1ª página, mesmo cursor): a expansão que
    // acabou de chegar vale — nada de pedir o mesmo cursor de novo.
    await act(async () => {
      resolveBoard(cursorBoard());
      await refetch;
    });
    await waitFor(() => expect(ids(cached()[0])).toEqual(["a", "b", "c", "d"]));
    expect(api.getBoardColumns).toHaveBeenCalledTimes(1);
    expect(cached()[0]).toMatchObject({ nextCursor: "CUR-2", hasMore: true, loadedCount: 4 });

    // Refetch posterior (mutação/SSE): a expansão é recarregada de verdade.
    api.getBoard.mockResolvedValueOnce(cursorBoard());
    await act(async () => {
      await qc.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(api.getBoardColumns).toHaveBeenCalledTimes(2));
    expect(api.getBoardColumns.mock.calls[1]![1].columns).toEqual([
      { stageId: "s1", cursor: "CUR-1", limit: 2 },
    ]);
  });

  it("reset (troca de funil/ordenação) esquece as expansões: o refetch volta à 1ª página", async () => {
    api.getBoard.mockResolvedValue(cursorBoard());
    api.getBoardColumns.mockResolvedValueOnce([columnPage("s1", [deal("c"), deal("d")])]);
    const { qc, view, cached } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    act(() => view.result.current.more.reset());
    await act(async () => {
      await qc.invalidateQueries({ queryKey: KEY });
    });
    await waitFor(() => expect(ids(cached()[0])).toEqual(["a", "b"]));
    expect(api.getBoardColumns).toHaveBeenCalledTimes(1);
  });
});

describe("useBoardLoadMore — fallback", () => {
  /** Backend antigo: etapas sem `nextCursor`. */
  function legacyBoard(extra = 0): BoardStageDto[] {
    const all = ["a", "b", "c", "d", "e"].map((id) => deal(id));
    return [
      stage("s1", 1, all.slice(0, PAGE + extra), { totalCount: 5, hasMore: PAGE + extra < 5 }),
      stage("s2", 2, [deal("x")]),
    ];
  }

  it("board sem nextCursor: comportamento anterior (POST /board com offsetByStage), sem chamar a rota nova", async () => {
    api.getBoard.mockResolvedValue(legacyBoard());
    api.getBoardFiltered.mockImplementation(async (_id: string, opts: { offsetByStage: Record<string, number> }) =>
      legacyBoard(opts.offsetByStage.s1 ?? 0),
    );
    const { view, cached } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());

    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    await waitFor(() => expect(ids(cached()[0])).toEqual(["a", "b", "c", "d"]));
    expect(api.getBoardColumns).not.toHaveBeenCalled();
    expect(api.getBoardFiltered).toHaveBeenCalledTimes(1);
    expect(api.getBoardFiltered.mock.calls[0]![1]).toMatchObject({
      status: "OPEN",
      perStage: PAGE,
      offsetByStage: { s1: PAGE },
    });
    expect(view.result.current.more.legacyOffsets).toEqual({ s1: PAGE });
    await waitFor(() => expect(view.result.current.more.loadingStageIds.size).toBe(0));

    // segundo clique: offset cumulativo, como antes
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    await waitFor(() => expect(ids(cached()[0])).toEqual(["a", "b", "c", "d", "e"]));
    expect(api.getBoardFiltered.mock.calls[1]![1].offsetByStage).toEqual({ s1: PAGE * 2 });
  });

  it("rota de colunas inexistente (404): cai no offsetByStage e não tenta a rota de novo", async () => {
    api.getBoard.mockResolvedValue(cursorBoard());
    api.getBoardColumns.mockRejectedValue(new BoardColumnsError("Not found", 404, null));
    api.getBoardFiltered.mockImplementation(async (_id: string, opts: { offsetByStage: Record<string, number> }) => [
      stage(
        "s1",
        1,
        ["a", "b", "c", "d", "e"].slice(0, PAGE + (opts.offsetByStage.s1 ?? 0)).map((id) => deal(id)),
        { totalCount: 5, hasMore: true, nextCursor: "CUR-X" },
      ),
      stage("s2", 2, [deal("x")], { nextCursor: null }),
    ]);
    const { view, cached } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());

    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    await waitFor(() => expect(ids(cached()[0])).toEqual(["a", "b", "c", "d"]));
    expect(api.getBoardColumns).toHaveBeenCalledTimes(1);
    expect(api.getBoardFiltered.mock.calls[0]![1].offsetByStage).toEqual({ s1: PAGE });

    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    await waitFor(() => expect(ids(cached()[0])).toEqual(["a", "b", "c", "d", "e"]));
    expect(api.getBoardColumns).toHaveBeenCalledTimes(1);
    expect(api.getBoardFiltered.mock.calls[1]![1].offsetByStage).toEqual({ s1: PAGE * 2 });
  });

  it("cursor recusado (400) depois de já ter anexado por cursor: offset cobre o que estava carregado + uma página", async () => {
    api.getBoard.mockResolvedValue(cursorBoard());
    api.getBoardColumns
      .mockResolvedValueOnce([columnPage("s1", [deal("c"), deal("d")])])
      .mockRejectedValueOnce(new BoardColumnsError("Cursor inválido.", 400, "invalid_cursor"));
    api.getBoardFiltered.mockResolvedValue(cursorBoard());
    const { view } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    await waitFor(() => expect(api.getBoardFiltered).toHaveBeenCalledTimes(1));
    // 4 carregados (2 da 1ª página + 2 anexados) → extras 2, mais uma página
    expect(api.getBoardFiltered.mock.calls[0]![1].offsetByStage).toEqual({ s1: 4 });
  });

  it("erro de rede/5xx: nada muda e o próximo clique tenta de novo pelo cursor", async () => {
    api.getBoard.mockResolvedValue(cursorBoard());
    api.getBoardColumns
      .mockRejectedValueOnce(new BoardColumnsError("Erro", 500, null))
      .mockResolvedValueOnce([columnPage("s1", [deal("c")])]);
    const { view, cached } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());
    const before = cached();
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    expect(cached()).toBe(before);
    expect(api.getBoardFiltered).not.toHaveBeenCalled();
    expect(view.result.current.more.loadingStageIds.size).toBe(0);
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    expect(ids(cached()[0])).toEqual(["a", "b", "c"]);
  });
});

describe("cards memo não re-renderizam ao anexar", () => {
  const renders = new Map<string, number>();
  type CardProps = {
    deal: { id: string };
    raw: BoardDealDto | undefined;
    stages: BoardStageDto[];
  };
  const Card = memo(function Card({ deal: d }: CardProps) {
    renders.set(d.id, (renders.get(d.id) ?? 0) + 1);
    return <li data-testid={`card-${d.id}`}>{d.id}</li>;
  });

  /** Mesma derivação de props do Kanban: `toDealCard`, `dealById`, `stages`. */
  function Harness({ expose }: { expose: (more: ReturnType<typeof useBoardLoadMore>) => void }) {
    const more = useBoardLoadMore({ pipelineId: PIPELINE, status: "OPEN", pageSize: PAGE });
    const query = useBoard({
      pipelineId: PIPELINE,
      status: "OPEN",
      perStage: PAGE,
      offsetByStage: more.legacyOffsets,
    });
    const board = useMemo(() => query.data ?? [], [query.data]);
    const stages = useStableBoardStages(board);
    const columns = useMemo(() => toKanbanColumns(board), [board]);
    const dealById = useMemo(() => {
      const map = new Map<string, BoardDealDto>();
      for (const s of board) for (const d of s.deals) map.set(d.id, d);
      return map;
    }, [board]);
    expose(more);
    return (
      <ul>
        {columns.flatMap((col) =>
          col.deals.map((d) => (
            <Card key={d.id} deal={d} raw={dealById.get(d.id)} stages={stages} />
          )),
        )}
      </ul>
    );
  }

  beforeEach(() => renders.clear());

  it("anexar cards (e um patch SSE em outro card) não re-renderiza os já visíveis", async () => {
    api.getBoard.mockResolvedValue(cursorBoard());
    api.getBoardColumns.mockResolvedValueOnce([columnPage("s1", [deal("c"), deal("d")])]);
    const qc = makeClient();
    let more!: ReturnType<typeof useBoardLoadMore>;
    const view = render(
      <QueryClientProvider client={qc}>
        <Harness expose={(m) => (more = m)} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(view.getByTestId("card-a")).toBeTruthy());
    const baseline = new Map(renders);
    expect([...baseline.keys()].sort()).toEqual(["a", "b", "x"]);

    await act(async () => {
      await more.loadMore(["s1"]);
    });
    await waitFor(() => expect(view.getByTestId("card-d")).toBeTruthy());

    for (const id of ["a", "b", "x"]) {
      expect(renders.get(id), `card ${id} re-renderizou`).toBe(baseline.get(id));
    }
    expect(renders.get("c")).toBe(1);
    expect(renders.get("d")).toBe(1);

    // SSE: mensagem nova no contato do card `c` (anexado) — só ele renderiza
    const beforeSse = new Map(renders);
    act(() => {
      patchBoardLastMessage(qc, {
        contactId: "ct-c",
        direction: "in",
        content: "oi",
        timestamp: "2026-09-30T13:00:00.000Z",
      });
    });
    await waitFor(() => expect(renders.get("c")).toBe((beforeSse.get("c") ?? 0) + 1));
    for (const id of ["a", "b", "d", "x"]) {
      expect(renders.get(id), `card ${id} re-renderizou no SSE`).toBe(beforeSse.get(id));
    }
  });
});

describe("evento SSE com a coluna paginada", () => {
  it("new_message atualiza o card anexado sem mexer no cursor; a paginação e o refetch continuam coerentes", async () => {
    api.getBoard.mockResolvedValueOnce(cursorBoard());
    api.getBoardColumns.mockResolvedValueOnce([columnPage("s1", [deal("c"), deal("d")])]);
    const { qc, view, cached } = setupHooks();
    await waitFor(() => expect(view.result.current.board.data).toBeDefined());
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    const before = cached();

    let found = false;
    act(() => {
      found = patchBoardLastMessage(qc, {
        contactId: "ct-d",
        direction: "in",
        content: "chegou",
        timestamp: "2026-09-30T13:00:00.000Z",
      });
    });
    expect(found).toBe(true);
    const after = cached();
    const d = after[0]!.deals.find((x) => x.id === "d")!;
    expect(d.lastMessage?.content).toBe("chegou");
    expect(d.unreadCount).toBe(1);
    // os outros cards são os mesmos objetos; o cursor e os totais ficam
    for (const id of ["a", "b", "c"]) {
      expect(after[0]!.deals.find((x) => x.id === id)).toBe(before[0]!.deals.find((x) => x.id === id));
    }
    expect(after[0]).toMatchObject({ nextCursor: "CUR-2", hasMore: true, totalCount: 5 });
    expect(ids(after[0])).toEqual(["a", "b", "c", "d"]);
    expect(api.getBoard).toHaveBeenCalledTimes(1);

    // carregar mais depois do evento usa o cursor certo
    api.getBoardColumns.mockResolvedValueOnce([
      columnPage("s1", [deal("e")], { hasMore: false, nextCursor: null }),
    ]);
    await act(async () => {
      await view.result.current.more.loadMore(["s1"]);
    });
    expect(api.getBoardColumns.mock.calls[1]![1].columns).toEqual([
      { stageId: "s1", cursor: "CUR-2", limit: PAGE },
    ]);
    expect(ids(cached()[0])).toEqual(["a", "b", "c", "d", "e"]);
    // e a mensagem do SSE continua no card
    expect(cached()[0]!.deals.find((x) => x.id === "d")!.lastMessage?.content).toBe("chegou");
  });
});

describe("useStableBoardStages", () => {
  it("mesma referência enquanto só os cards mudam; nova quando a etapa muda", () => {
    const first = cursorBoard();
    const view = renderHook(({ board }) => useStableBoardStages(board), {
      initialProps: { board: first },
    });
    expect(view.result.current).toBe(first);

    const appended = appendBoardColumnPages(first, [columnPage("s1", [deal("c")])])!;
    view.rerender({ board: appended });
    expect(view.result.current).toBe(first);

    const renamed = appended.map((s) => (s.id === "s2" ? { ...s, name: "Outro nome" } : s));
    view.rerender({ board: renamed });
    expect(view.result.current).toBe(renamed);

    const extraStage = [...renamed, stage("s3", 3, [])];
    view.rerender({ board: extraStage });
    expect(view.result.current).toBe(extraStage);
  });
});
