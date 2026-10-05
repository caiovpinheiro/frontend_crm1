/** @vitest-environment jsdom */
/**
 * KF5 — listagem paginada de negócios (`GET /api/deals`, página + COUNT).
 *
 * Quem chama no frontend: a aba Lista do funil, o diálogo de duplicados e
 * as buscas (barra do Kanban/Flow/Lista e do Inbox). Nenhum tem polling.
 *
 * O que fica travado aqui:
 *  - resposta atual (`total` numérico, sem `hasMore`) e resposta nova
 *    (`hasMore`, `total` só quando pedido/de graça) são aceitas;
 *  - quem não mostra o total (buscas, duplicados) pede `withTotal=0`;
 *  - a aba Lista conta só na 1ª página do recorte; as seguintes reaproveitam
 *    o total e, sem ele, paginam por `hasMore`;
 *  - mexer em 5 filtros seguidos = 1 requisição.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";
import { fetchDealsList, type DealListItemDto } from "@/features/pipeline-v2/api/list";
import {
  resolveDealsPaging,
  useDealsListPage,
} from "@/features/pipeline-v2/hooks/use-deals-list";
import { usePipelineOmnisearch } from "@/features/pipeline-v2/use-pipeline-omnisearch";

type Server = "atual" | "novo";

const TOTAL = 95;
let server: Server = "atual";
const urls: URL[] = [];

/** Backend falso: o "atual" ignora `withTotal`; o "novo" respeita. */
function respond(url: URL) {
  const page = Number(url.searchParams.get("page") ?? 1);
  const perPage = Number(url.searchParams.get("perPage") ?? 20);
  const from = (page - 1) * perPage;
  const count = Math.max(0, Math.min(perPage, TOTAL - from));
  const items = Array.from({ length: count }, (_, i) => ({ id: `d${from + i}` }));
  if (server === "atual") return { items, total: TOTAL, page, perPage };
  const hasMore = from + count < TOTAL;
  const skipCount = url.searchParams.get("withTotal") === "0";
  return {
    items,
    total: skipCount ? (hasMore ? null : from + count) : TOTAL,
    page,
    perPage,
    hasMore,
  };
}

const requests = () => urls.filter((u) => u.pathname === "/api/deals");

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

async function flush(ms = 0) {
  // Passos curtos: o render disparado por um timer só sai no fim do `act`.
  for (let elapsed = 0; elapsed <= ms; elapsed += 50) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(50, Math.max(0, ms - elapsed)));
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  server = "atual";
  urls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://crm.test");
      urls.push(url);
      return new Response(JSON.stringify(respond(url)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchDealsList — resposta atual e nova", () => {
  it("backend atual: `total` numérico; `hasMore` sai do total", async () => {
    const first = await fetchDealsList({ pipelineId: "p1", page: 1, perPage: 30 });
    expect(first).toMatchObject({ total: 95, hasMore: true, page: 1, perPage: 30 });
    expect(first.items.length).toBe(30);
    const last = await fetchDealsList({ pipelineId: "p1", page: 4, perPage: 30 });
    expect(last).toMatchObject({ total: 95, hasMore: false });
    // Sem pedir, a URL não muda (o backend atual não conhece `withTotal`).
    expect(requests().every((u) => !u.searchParams.has("withTotal"))).toBe(true);
  });

  it("backend novo sem contagem: `total` nulo no meio, exato na última página", async () => {
    server = "novo";
    const first = await fetchDealsList({ page: 1, perPage: 30, withTotal: false });
    expect(requests()[0]!.searchParams.get("withTotal")).toBe("0");
    expect(first).toMatchObject({ total: null, hasMore: true });
    const last = await fetchDealsList({ page: 4, perPage: 30, withTotal: false });
    expect(last).toMatchObject({ total: 95, hasMore: false });
  });

  it("backend atual com `withTotal=0`: ignora o parâmetro e segue respondendo o total", async () => {
    const pageData = await fetchDealsList({ page: 2, perPage: 30, withTotal: false });
    expect(pageData).toMatchObject({ total: 95, hasMore: true });
  });
});

describe("aba Lista — contagem só na 1ª página do recorte", () => {
  function mount(initial: { page: number; filters?: AdvancedDealFilters }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(
      (props: { page: number; filters?: AdvancedDealFilters }) =>
        useDealsListPage({
          pipelineId: "p1",
          page: props.page,
          perPage: 30,
          filters: props.filters,
        }),
      { wrapper: wrapper(qc), initialProps: initial },
    );
    return { qc, view };
  }

  it.each<Server>(["atual", "novo"])(
    "backend %s: página 1 conta; 2 e 3 não pedem COUNT e mantêm total e última página",
    async (which) => {
      server = which;
      const { view } = mount({ page: 1 });
      await flush();
      expect(requests().length).toBe(1);
      expect(requests()[0]!.searchParams.has("withTotal")).toBe(false);
      expect(view.result.current).toMatchObject({ total: 95, lastPage: 4, canNext: true });

      act(() => view.rerender({ page: 2 }));
      await flush();
      act(() => view.rerender({ page: 3 }));
      await flush();
      expect(requests().length).toBe(3);
      expect(requests()[1]!.searchParams.get("withTotal")).toBe("0");
      expect(requests()[2]!.searchParams.get("withTotal")).toBe("0");
      expect(view.result.current.items.length).toBe(30);
      expect(view.result.current).toMatchObject({ total: 95, lastPage: 4, canNext: true });

      act(() => view.rerender({ page: 4 }));
      await flush();
      expect(view.result.current.items.length).toBe(5);
      expect(view.result.current).toMatchObject({ total: 95, lastPage: 4, canNext: false });
    },
  );

  it("total da 1ª página fora do cache: a página atual volta a contar", async () => {
    server = "novo";
    const { qc, view } = mount({ page: 1 });
    await flush();
    act(() => view.rerender({ page: 2 }));
    await flush();
    qc.removeQueries({
      predicate: (q) => q.queryKey[0] === "deals-list" && q.queryKey[6] === 1,
    });
    act(() => view.rerender({ page: 3 }));
    await flush();

    expect(requests()[2]!.searchParams.has("withTotal")).toBe(false);
    expect(view.result.current).toMatchObject({ total: 95, canNext: true });
  });

  it("servidor não contou e não há total conhecido: pagina por `hasMore`", () => {
    const item = { id: "d" } as DealListItemDto;
    const middle = resolveDealsPaging({
      page: 2,
      perPage: 30,
      data: { items: Array(30).fill(item), total: null, page: 2, perPage: 30, hasMore: true },
      knownTotal: null,
    });
    expect(middle).toEqual({ total: 60, totalKnown: false, lastPage: 3, canNext: true });
    const last = resolveDealsPaging({
      page: 4,
      perPage: 30,
      data: { items: Array(5).fill(item), total: null, page: 4, perPage: 30, hasMore: false },
      knownTotal: null,
    });
    expect(last).toEqual({ total: 95, totalKnown: false, lastPage: 4, canNext: false });
    // Total conhecido da 1ª página vale para as seguintes.
    expect(
      resolveDealsPaging({
        page: 2,
        perPage: 30,
        data: { items: Array(30).fill(item), total: null, page: 2, perPage: 30, hasMore: true },
        knownTotal: 95,
      }),
    ).toEqual({ total: 95, totalKnown: true, lastPage: 4, canNext: true });
  });

  it("depois de uma invalidação (ação em massa) a página atual volta a contar", async () => {
    server = "novo";
    const { qc, view } = mount({ page: 1 });
    await flush();
    act(() => view.rerender({ page: 2 }));
    await flush();
    expect(requests()[1]!.searchParams.get("withTotal")).toBe("0");

    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["deals-list"] });
    });
    await flush();
    expect(requests().length).toBe(3);
    expect(requests()[2]!.searchParams.get("page")).toBe("2");
    expect(requests()[2]!.searchParams.has("withTotal")).toBe(false);
    expect(view.result.current.total).toBe(95);
  });

  it("5 alterações de filtro em sequência = 1 requisição, com o filtro final", async () => {
    const { view } = mount({ page: 1 });
    await flush();
    expect(requests().length).toBe(1);

    const steps: AdvancedDealFilters[] = [
      { tagIds: ["t1"] },
      { tagIds: ["t1", "t2"] },
      { tagIds: ["t1", "t2"], ownerIds: ["u1"] },
      { tagIds: ["t1", "t2"], ownerIds: ["u1"], sources: ["Site"] },
      { tagIds: ["t2", "t1"], ownerIds: ["u1"], sources: ["Site"], withoutContact: true },
    ];
    for (const filters of steps) {
      act(() => view.rerender({ page: 1, filters }));
      await flush(100);
    }
    await flush(2_000);

    expect(requests().length).toBe(2);
    expect(JSON.parse(requests()[1]!.searchParams.get("filters")!)).toEqual({
      ownerIds: ["u1"],
      sources: ["Site"],
      tagIds: ["t1", "t2"],
      withoutContact: true,
    });
  });
});

describe("busca da barra do funil", () => {
  it("pede a página sem COUNT (`withTotal=0`)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(() => usePipelineOmnisearch("maria", true), {
      wrapper: wrapper(qc),
    });
    await flush(1_000);

    expect(requests().length).toBe(1);
    expect(requests()[0]!.searchParams.get("search")).toBe("maria");
    expect(requests()[0]!.searchParams.get("withTotal")).toBe("0");
    expect(view.result.current.items.length).toBe(8);
  });
});
