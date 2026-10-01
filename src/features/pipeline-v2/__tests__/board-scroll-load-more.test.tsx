/** @vitest-environment jsdom */
/**
 * Rolagem das colunas do Kanban × requisições (`POST /board/columns`).
 *
 * Regressão: o "carregar mais" passou a ser uma requisição rápida de 10
 * cards, e a sentinela recriava o IntersectionObserver a cada página
 * anexada. Resultado: rolar uma coluna disparava uma requisição a cada ~10
 * cards (rajada + "Carregando..." piscando), a sentinela ainda visível
 * encadeava páginas sozinha, e cada coluna fazia o próprio POST.
 *
 * O que fica travado aqui:
 *  - sentinela visível o tempo todo não encadeia páginas;
 *  - uma rolagem longa na coluna = uma requisição;
 *  - colunas que pedem mais no mesmo instante saem em UMA requisição;
 *  - durante a busca os cards da coluna continuam na tela;
 *  - rajada de eventos SSE = no máximo um refetch do board (1 GET + 1 POST
 *    das colunas expandidas), e evento de card já carregado = nenhum.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
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

import { KanbanColumn } from "@/components/crm/kanban-column";
import type { Deal } from "@/components/crm/deal-card";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BoardStageDto } from "@/features/pipeline-v2/api";
import {
  BOARD_LOAD_MORE_PAGE_SIZE,
  BOARD_PAGE_SIZE,
  boardKey,
  useBoard,
} from "@/features/pipeline-v2/hooks/use-board";
import { useBoardLoadMore } from "@/features/pipeline-v2/hooks/use-board-load-more";
import {
  applyBoardNewMessage,
  createBoardRefreshScheduler,
} from "@/features/pipeline-v2/hooks/use-pipeline-realtime";
import { createFakeBoardServer, type ColumnsRequest } from "@/test-support/fake-board-server";
import {
  bindScroller,
  createFrames,
  installFakeIntersectionObserver,
  sentinelInView,
  sleep,
  type ListLayout,
} from "@/test-support/scroll-harness";

const PIPELINE = "8";
const KEY = boardKey(PIPELINE, "OPEN");
const CARD = 100;

/**
 * Mesma ligação do host do Kanban (`app/(app)/pipeline/_v2-client.tsx`):
 * `useBoard` com a 1ª página, `useBoardLoadMore` e o `loadMore` da coluna.
 */
function Board() {
  const more = useBoardLoadMore({
    pipelineId: PIPELINE,
    status: "OPEN",
    pageSize: BOARD_LOAD_MORE_PAGE_SIZE,
    firstPageSize: BOARD_PAGE_SIZE,
  });
  const board = useBoard({
    pipelineId: PIPELINE,
    status: "OPEN",
    perStage: BOARD_PAGE_SIZE,
    offsetByStage: more.legacyOffsets,
  });
  return (
    <>
      {(board.data ?? []).map((stage) => {
        const remaining = (stage.totalCount ?? 0) - stage.deals.length;
        return (
          <div key={stage.id} data-stage={stage.id}>
            <KanbanColumn
              title={stage.name}
              color="novo"
              count={stage.totalCount ?? 0}
              total=""
              deals={stage.deals as unknown as Deal[]}
              renderDeal={(deal) => (
                <div key={deal.id} data-card={deal.id}>
                  {deal.id}
                </div>
              )}
              loadMore={
                stage.hasMore && remaining > 0
                  ? {
                      remaining,
                      loading: more.loadingStageIds.has(stage.id),
                      onClick: () => void more.loadMore([stage.id]),
                    }
                  : undefined
              }
            />
          </div>
        );
      })}
    </>
  );
}

function mount(
  totals: Record<string, number>,
  layoutInit: Partial<ListLayout> = {},
  /** Troca o servidor falso antes do 1º fetch. */
  configure?: () => void,
) {
  const server = createFakeBoardServer(totals, BOARD_PAGE_SIZE);
  api.getBoard.mockImplementation(server.getBoard);
  api.getBoardColumns.mockImplementation(server.getBoardColumns);
  configure?.();

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let container: HTMLElement | null = null;
  const column = (stageId: string) =>
    container!.querySelector<HTMLElement>(`[data-stage="${stageId}"] .kanban-scroll`)!;
  const layouts = new Map<string, ListLayout>();
  /** Geometria de cada coluna: cards de altura fixa, sentinela no fim. */
  const layoutOf = (stageId: string) => {
    let layout = layouts.get(stageId);
    if (!layout) {
      layout = {
        viewport: 700,
        rowHeight: CARD,
        scrollTop: 0,
        rows: () => column(stageId)?.querySelectorAll("[data-card]").length ?? 0,
        ...layoutInit,
      };
      layouts.set(stageId, layout);
    }
    return layout;
  };
  const io = installFakeIntersectionObserver((target, _root, margin) => {
    const stageId = target.closest("[data-stage]")?.getAttribute("data-stage");
    return stageId ? sentinelInView(layoutOf(stageId), margin) : false;
  });
  const view = render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <Board />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  container = view.container;
  const frames = createFrames(io, act);
  /** O usuário rola a coluna `px` para baixo, 100px por frame. */
  const scrollBy = async (stageId: string, px: number) => {
    const el = column(stageId);
    const layout = layoutOf(stageId);
    bindScroller(el, layout);
    for (let moved = 0; moved < px; moved += 100) {
      const max = Math.max(0, layout.rows() * layout.rowHeight - layout.viewport);
      layout.scrollTop = Math.min(max, layout.scrollTop + 100);
      await act(async () => {
        el.dispatchEvent(new Event("scroll"));
      });
      await frames.frame();
    }
  };
  const cards = (stageId: string) =>
    [...column(stageId).querySelectorAll<HTMLElement>("[data-card]")];
  return { qc, view, column, layoutOf, cards, scrollBy, ...frames };
}

const columnRequests = () =>
  api.getBoardColumns.mock.calls.map((c) => (c[1] as ColumnsRequest).columns);

beforeEach(() => {
  api.getBoard.mockReset();
  api.getBoardFiltered.mockReset();
  api.getBoardColumns.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Kanban — rolagem da coluna × requisições", { timeout: 30_000 }, () => {
  it("sentinela visível o tempo todo não encadeia páginas", async () => {
    // Cards sem altura: a sentinela nunca sai da área de disparo.
    const t = mount({ s1: 400 }, { rowHeight: 0 });
    await t.settle();
    // No máximo UM preenchimento automático depois da 1ª página.
    expect(columnRequests().length).toBeLessThanOrEqual(1);
    const afterMount = columnRequests().length;
    await t.settle();
    expect(columnRequests().length).toBe(afterMount);
    expect(api.getBoard).toHaveBeenCalledTimes(1);
  });

  it("uma rolagem longa na coluna (2.500px) faz uma requisição só", async () => {
    const t = mount({ s1: 400 });
    await t.settle();
    expect(t.cards("s1").length).toBe(BOARD_PAGE_SIZE);
    expect(columnRequests().length).toBe(0);

    await t.scrollBy("s1", 2500);
    await t.settle(3);
    expect(columnRequests().length).toBe(1);
    expect(columnRequests()[0]).toEqual([
      { stageId: "s1", cursor: "s1@10", limit: BOARD_LOAD_MORE_PAGE_SIZE },
    ]);
    // O board não é refeito.
    expect(api.getBoard).toHaveBeenCalledTimes(1);
  });

  it("colunas que pedem mais no mesmo instante saem em uma requisição", async () => {
    // Tela alta: a 1ª página (10 cards) não enche nenhuma das 6 colunas.
    const totals = { s1: 90, s2: 90, s3: 90, s4: 90, s5: 90, s6: 90 };
    const t = mount(totals, { viewport: 1200 });
    await t.settle();
    expect(columnRequests().length).toBe(1);
    expect(columnRequests()[0]!.map((c) => c.stageId).sort()).toEqual(Object.keys(totals));
    for (const id of Object.keys(totals)) {
      expect(t.cards(id).length).toBe(BOARD_PAGE_SIZE + BOARD_LOAD_MORE_PAGE_SIZE);
    }
  });

  it("durante a busca os cards da coluna continuam na tela; só o botão do fim muda", async () => {
    const t = mount({ s1: 400 });
    await t.settle();
    const before = t.cards("s1");
    let release: (() => void) | null = null;
    const serve = api.getBoardColumns.getMockImplementation()!;
    api.getBoardColumns.mockImplementation(async (...args: unknown[]) => {
      await new Promise<void>((r) => (release = r));
      return serve(...args);
    });

    await t.scrollBy("s1", 300);
    expect(release).not.toBeNull();
    const during = t.cards("s1");
    expect(during.length).toBe(before.length);
    expect(during.every((el, i) => el === before[i])).toBe(true);
    expect(t.column("s1").textContent).toContain("Carregando...");

    await act(async () => release!());
    await t.settle(3);
    const after = t.cards("s1");
    expect(after.length).toBe(BOARD_PAGE_SIZE + BOARD_LOAD_MORE_PAGE_SIZE);
    expect(before.every((el, i) => el === after[i])).toBe(true);
    expect(t.column("s1").textContent).not.toContain("Carregando...");
    expect(columnRequests().length).toBe(1);
  });

  it("SSE: card já carregado não gera requisição; rajada de cards de fora = um refetch (1 GET + 1 POST)", async () => {
    const t = mount({ s1: 400 });
    await t.settle();
    await t.scrollBy("s1", 300);
    await t.settle(3);
    expect(columnRequests().length).toBe(1);
    const loaded = t.qc.getQueryData<BoardStageDto[]>(KEY)![0]!.deals.length;

    const scheduler = createBoardRefreshScheduler(t.qc, 20);
    // Mensagem de um contato cujo card está na página anexada: só patch.
    await act(async () => {
      scheduler.schedule(
        applyBoardNewMessage(t.qc, {
          contactId: "ct-s1-d15",
          direction: "in",
          content: "oi",
          timestamp: "2026-10-01T10:00:00.000Z",
        } as Parameters<typeof applyBoardNewMessage>[1]),
      );
      await sleep(60);
    });
    expect(api.getBoard).toHaveBeenCalledTimes(1);
    expect(columnRequests().length).toBe(1);

    // Cinco mensagens de contatos fora da página, na mesma janela.
    await act(async () => {
      for (let i = 0; i < 5; i += 1) {
        scheduler.schedule(
          applyBoardNewMessage(t.qc, {
            contactId: `ct-fora-${i}`,
            direction: "in",
            content: "oi",
            timestamp: "2026-10-01T10:00:01.000Z",
          } as Parameters<typeof applyBoardNewMessage>[1]),
        );
      }
      await sleep(120);
    });
    await t.settle(2);
    expect(api.getBoard).toHaveBeenCalledTimes(2);
    expect(columnRequests().length).toBe(2);
    // As colunas expandidas voltam numa requisição, só com o que faltava.
    expect(columnRequests()[1]).toEqual([
      { stageId: "s1", cursor: "s1@10", limit: loaded - BOARD_PAGE_SIZE },
    ]);
    expect(t.cards("s1").length).toBe(loaded);
    scheduler.cancel();
  });

  it("backend sem cursor: cada pedido soma uma página de 30 ao offset (1ª página segue com 10)", async () => {
    const board = async (extra: number) => {
      const stages = await createFakeBoardServer({ s1: 400 }, BOARD_PAGE_SIZE + extra).getBoard();
      // Backend antigo: etapa sem `nextCursor`.
      return stages.map((s) => ({ ...s, nextCursor: undefined }));
    };
    const t = mount({ s1: 400 }, {}, () => {
      api.getBoard.mockImplementation(() => board(0));
      api.getBoardFiltered.mockImplementation(
        (_id: string, opts: { offsetByStage: Record<string, number> }) =>
          board(opts.offsetByStage.s1 ?? 0),
      );
    });
    await t.settle();
    expect(t.cards("s1").length).toBe(BOARD_PAGE_SIZE);

    await t.scrollBy("s1", 300);
    await t.settle(3);
    expect(api.getBoardColumns).not.toHaveBeenCalled();
    expect(api.getBoardFiltered).toHaveBeenCalledTimes(1);
    expect(api.getBoardFiltered.mock.calls[0]![1]).toMatchObject({
      perStage: BOARD_PAGE_SIZE,
      offsetByStage: { s1: BOARD_LOAD_MORE_PAGE_SIZE },
    });
    expect(t.cards("s1").length).toBe(BOARD_PAGE_SIZE + BOARD_LOAD_MORE_PAGE_SIZE);

    await t.scrollBy("s1", 3200);
    await t.settle(3);
    expect(api.getBoardFiltered).toHaveBeenCalledTimes(2);
    expect(api.getBoardFiltered.mock.calls[1]![1].offsetByStage).toEqual({
      s1: 2 * BOARD_LOAD_MORE_PAGE_SIZE,
    });
  });
});
