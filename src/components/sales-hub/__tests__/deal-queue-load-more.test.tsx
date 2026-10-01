/** @vitest-environment jsdom */
/**
 * Rolagem da fila do Flow × requisições (`POST /board/columns`).
 *
 * Regressão: o "carregar mais" da fila virou uma requisição rápida de 10
 * cards por etapa; o efeito da sentinela era refeito a cada página anexada
 * (observer novo + checagem por frame), então a sentinela ainda visível
 * pedia a página seguinte sozinha, e uma rolagem contínua disparava uma
 * requisição a cada ~10 cards, com o botão piscando "Carregando…".
 *
 * O que fica travado aqui:
 *  - sentinela visível o tempo todo não encadeia páginas;
 *  - uma rolagem longa numa etapa = uma requisição;
 *  - "Todos": um gesto = UMA requisição com todas as etapas que têm mais;
 *  - durante a busca os cards da fila continuam na tela;
 *  - a página que chega da rede entra inteira na fila (como na coluna do
 *    kanban), mesmo passando da janela local de 60 cards;
 *  - o negócio aberto no fim da fila não puxa a rolagem a cada página.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
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
// O card real (popovers, avatar, mídia) não importa para a rolagem.
vi.mock("@/components/crm/deal-card", () => ({
  DealCard: ({ deal }: { deal: { id: string } }) => <div data-card={deal.id}>{deal.id}</div>,
}));
vi.mock("@/components/sales-hub/deal-actions", () => ({
  DealMoveStageButton: () => null,
}));
vi.mock("@/features/pipeline-v2/extras", () => ({
  AssigneePopover: ({ trigger }: { trigger?: ReactNode }) => <>{trigger}</>,
  DealCardTagsTrigger: () => null,
  TagsPopover: ({ trigger }: { trigger?: ReactNode }) => <>{trigger}</>,
}));

import { DealQueue } from "@/components/sales-hub/deal-queue";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { BoardStageDto } from "@/features/pipeline-v2/api";
import {
  BOARD_LOAD_MORE_PAGE_SIZE,
  BOARD_PAGE_SIZE,
  useBoard,
} from "@/features/pipeline-v2/hooks/use-board";
import { useBoardLoadMore } from "@/features/pipeline-v2/hooks/use-board-load-more";
import {
  createFakeBoardServer,
  fakeDeal,
  type ColumnsRequest,
} from "@/test-support/fake-board-server";
import {
  bindScroller,
  createFrames,
  installFakeIntersectionObserver,
  sentinelInView,
  type ListLayout,
} from "@/test-support/scroll-harness";

const PIPELINE = "8";
const CARD = 80;

type QueueProps = Parameters<typeof DealQueue>[0];

function stageHasMoreServer(s: BoardStageDto): boolean {
  if (s.hasMore === true) return true;
  return typeof s.totalCount === "number" && s.deals.length < s.totalCount;
}

/**
 * Mesma ligação do Flow (`sales-hub-host.tsx` + `sales-hub-view.tsx`): o
 * "carregar mais" expande a etapa focada, ou todas as que têm mais em Todos.
 */
function Queue({
  stageId,
  activeDealId = null,
}: {
  stageId: string | null;
  /** Negócio aberto e já respondido: a ordenação do Flow o manda para o fim. */
  activeDealId?: string | null;
}) {
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
  const stages = board.data ?? [];
  const shown = stageId ? stages.filter((s) => s.id === stageId) : stages;
  const flat = shown.flatMap((s) => s.deals.map((d) => ({ ...d, stageId: s.id })));
  const deals = activeDealId
    ? [
        ...flat.filter((d) => d.id !== activeDealId),
        ...flat.filter((d) => d.id === activeDealId),
      ]
    : flat;
  const remaining = shown.reduce(
    (sum, s) => sum + Math.max(0, (s.totalCount ?? s.deals.length) - s.deals.length),
    0,
  );
  const handleLoadMore = () => {
    const targets = shown.filter(stageHasMoreServer);
    if (targets.length === 0) return;
    void more.loadMore(targets.map((s) => s.id));
  };
  return (
    <DealQueue
      deals={deals as unknown as QueueProps["deals"]}
      stages={stages as unknown as QueueProps["stages"]}
      activeDealId={activeDealId}
      onSelectDeal={() => {}}
      hasMoreServer={stages.some(stageHasMoreServer) && remaining > 0}
      remainingCount={remaining}
      loadingMore={more.loadingStageIds.size > 0}
      onLoadMore={handleLoadMore}
      selectedStageId={stageId}
      pipelineId={PIPELINE}
    />
  );
}

function mount(
  totals: Record<string, number>,
  stageId: string | null,
  layoutInit: Partial<ListLayout> = {},
  activeDealId: string | null = null,
) {
  const server = createFakeBoardServer(totals, BOARD_PAGE_SIZE);
  api.getBoard.mockImplementation(server.getBoard);
  api.getBoardColumns.mockImplementation(server.getBoardColumns);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let container: HTMLElement | null = null;
  const cards = () => [...(container?.querySelectorAll<HTMLElement>("[data-card]") ?? [])];
  const layout: ListLayout = {
    viewport: 700,
    rowHeight: CARD,
    scrollTop: 0,
    rows: () => cards().length,
    ...layoutInit,
  };
  const io = installFakeIntersectionObserver((_target, _root, margin) =>
    sentinelInView(layout, margin),
  );
  // A fila usa requestAnimationFrame para conferir se a lista enche o scroller.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

  const view = render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <Queue stageId={stageId} activeDealId={activeDealId} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  container = view.container;
  const scroller = () => view.container.querySelector<HTMLElement>(".overflow-y-auto")!;
  bindScroller(scroller(), layout);
  const frames = createFrames(io, act);
  /** O usuário rola a fila `px` para baixo, 100px por frame. */
  const scrollBy = async (px: number) => {
    for (let moved = 0; moved < px; moved += 100) {
      const max = Math.max(0, layout.rows() * layout.rowHeight - layout.viewport);
      layout.scrollTop = Math.min(max, layout.scrollTop + 100);
      await act(async () => {
        scroller().dispatchEvent(new Event("scroll"));
      });
      await frames.frame();
    }
  };
  /**
   * O usuário rola `px` com a roda do mouse, 100px por frame — é a roda (não
   * o evento `scroll`) que libera o próximo pedido. Não depende de o observer
   * ver a sentinela sair e voltar, que sob carga o modelo falso pode perder.
   */
  const wheelBy = async (px: number) => {
    for (let moved = 0; moved < px; moved += 100) {
      const max = Math.max(0, layout.rows() * layout.rowHeight - layout.viewport);
      layout.scrollTop = Math.min(max, layout.scrollTop + 100);
      await act(async () => {
        scroller().dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
        scroller().dispatchEvent(new Event("scroll"));
      });
      await frames.frame();
    }
  };
  /** Espera por condição (frames), sem depender de tempo fixo. */
  const until = async (done: () => boolean, maxFrames = 80) => {
    for (let i = 0; i < maxFrames && !done(); i += 1) await frames.frame();
  };
  return { qc, view, layout, cards, scroller, scrollBy, wheelBy, until, ...frames };
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
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

/** jsdom não tem `scrollIntoView`: registra quem a fila mandou rolar. */
function spyScrollIntoView() {
  const spy = vi.fn();
  Element.prototype.scrollIntoView = spy;
  /** Chamadas que levam a fila para o FIM (card preso abaixo da janela). */
  const toEnd = () =>
    spy.mock.calls.filter(
      (c) => (c[0] as ScrollIntoViewOptions | undefined)?.block === "end",
    );
  return { spy, toEnd };
}

describe("Flow — rolagem da fila × requisições", { timeout: 30_000 }, () => {
  it("sentinela visível o tempo todo não encadeia páginas", async () => {
    // Cards sem altura: a fila nunca passa do scroller.
    const t = mount({ s1: 400 }, "s1", { rowHeight: 0 });
    await t.settle();
    // No máximo UM preenchimento automático depois da 1ª página.
    expect(columnRequests().length).toBeLessThanOrEqual(1);
    const afterMount = columnRequests().length;
    await t.settle();
    expect(columnRequests().length).toBe(afterMount);
    expect(api.getBoard).toHaveBeenCalledTimes(1);
  });

  it("uma rolagem longa numa etapa (2.000px) faz uma requisição só", async () => {
    const t = mount({ s1: 400 }, "s1", { viewport: 300 });
    await t.settle();
    expect(t.cards().length).toBe(BOARD_PAGE_SIZE);
    expect(columnRequests().length).toBe(0);

    await t.scrollBy(2000);
    await t.settle(3);
    expect(columnRequests().length).toBe(1);
    expect(columnRequests()[0]).toEqual([
      { stageId: "s1", cursor: "s1@10", limit: BOARD_LOAD_MORE_PAGE_SIZE },
    ]);
    expect(api.getBoard).toHaveBeenCalledTimes(1);
  });

  it("Todos: um gesto = uma requisição com todas as etapas que ainda têm cards", async () => {
    // s3 cabe na 1ª página; as outras continuam no servidor.
    const t = mount({ s1: 200, s2: 200, s3: 4, s4: 200 }, null);
    await t.settle();
    expect(t.cards().length).toBe(34);
    expect(columnRequests().length).toBe(0);

    await t.scrollBy(2200);
    await t.settle(3);
    expect(columnRequests().length).toBe(1);
    expect(columnRequests()[0]!.map((c) => c.stageId).sort()).toEqual(["s1", "s2", "s4"]);
  });

  it("durante a busca os cards da fila continuam na tela; só o botão do fim muda", async () => {
    const t = mount({ s1: 400 }, "s1", { viewport: 300 });
    await t.settle();
    const before = t.cards();
    let release: (() => void) | null = null;
    const serve = api.getBoardColumns.getMockImplementation()!;
    api.getBoardColumns.mockImplementation(async (...args: unknown[]) => {
      await new Promise<void>((r) => (release = r));
      return serve(...args);
    });

    await t.scrollBy(300);
    expect(release).not.toBeNull();
    const during = t.cards();
    expect(during.length).toBe(before.length);
    expect(during.every((el, i) => el === before[i])).toBe(true);
    expect(t.view.container.textContent).toContain("Carregando…");
    expect(t.view.container.querySelector("[data-app-loading-state]")).toBeNull();

    await act(async () => release!());
    await t.settle(3);
    const after = t.cards();
    expect(after.length).toBe(BOARD_PAGE_SIZE + BOARD_LOAD_MORE_PAGE_SIZE);
    expect(before.every((el, i) => el === after[i])).toBe(true);
    expect(t.view.container.textContent).not.toContain("Carregando…");
    expect(columnRequests().length).toBe(1);
  });

  it("a página que chega da rede entra inteira na fila, mesmo passando de 60 cards", async () => {
    const t = mount({ s1: 400 }, "s1", { viewport: 300 });
    await t.settle();
    await t.wheelBy(300);
    await t.until(() => t.cards().length > BOARD_PAGE_SIZE);
    expect(t.cards().length).toBe(BOARD_PAGE_SIZE + BOARD_LOAD_MORE_PAGE_SIZE);

    // 2ª página: 70 cards carregados > janela local de 60.
    await t.wheelBy(3000);
    await t.until(
      () => t.cards().length > BOARD_PAGE_SIZE + BOARD_LOAD_MORE_PAGE_SIZE,
    );
    await t.settle(3);
    expect(columnRequests().length).toBe(2);
    expect(t.cards().length).toBe(BOARD_PAGE_SIZE + 2 * BOARD_LOAD_MORE_PAGE_SIZE);
    // O botão do fim continua lá (antes virava um espaço vazio até outro gesto).
    expect(t.view.container.textContent).toContain("Carregar mais (330)");
  });

  it("negócio aberto no fim da fila: página nova não puxa a rolagem para o fim", async () => {
    const scroll = spyScrollIntoView();
    const t = mount({ s1: 400 }, "s1", { viewport: 300 }, "s1-d0");
    await t.settle();
    await t.wheelBy(300);
    await t.until(() => t.cards().length > BOARD_PAGE_SIZE);
    await t.wheelBy(3000);
    await t.until(
      () => t.cards().length > BOARD_PAGE_SIZE + BOARD_LOAD_MORE_PAGE_SIZE,
    );
    await t.settle(3);
    expect(columnRequests().length).toBe(2);

    const cards = t.cards();
    expect(cards.length).toBe(BOARD_PAGE_SIZE + 2 * BOARD_LOAD_MORE_PAGE_SIZE);
    // O negócio aberto segue no fim, na ordem natural — sem card preso fora
    // da janela nem rolagem automática até ele.
    expect(cards[cards.length - 1]!.dataset.card).toBe("s1-d0");
    expect(scroll.toEnd().length).toBe(0);
  });

  it("card aberto que cai abaixo da janela: a fila rola até ele uma vez só", async () => {
    const scroll = spyScrollIntoView();
    const qc = new QueryClient();
    const make = (ids: string[]) =>
      ids.map((id) => ({ ...fakeDeal(id), stageId: "s1" })) as unknown as QueueProps["deals"];
    const base = Array.from({ length: 100 }, (_, i) => `d${i}`);
    const ui = (ids: string[]) => (
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <DealQueue
            deals={make(ids)}
            stages={[] as unknown as QueueProps["stages"]}
            activeDealId="d5"
            onSelectDeal={() => {}}
            selectedStageId="s1"
            pipelineId={PIPELINE}
          />
        </TooltipProvider>
      </QueryClientProvider>
    );
    const view = render(ui(base));
    expect(scroll.toEnd().length).toBe(0);

    // Respondido: o card aberto desce para o fim (índice 99 > janela de 60).
    const sunk = [...base.filter((id) => id !== "d5"), "d5"];
    await act(async () => view.rerender(ui(sunk)));
    expect(scroll.toEnd().length).toBe(1);

    // Entra um negócio novo no topo: o card aberto muda de posição, mas a
    // fila NÃO rola de novo até ele.
    await act(async () => view.rerender(ui(["novo", ...sunk])));
    expect(scroll.toEnd().length).toBe(1);
  });
});
