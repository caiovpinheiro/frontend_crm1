/** @vitest-environment jsdom */
/**
 * Dashboard × `GET /api/kanban/filter-options`.
 *
 * O #161 tirou essa busca da montagem do Kanban/Flow/Lista (só ao abrir o
 * painel de filtros), mas o Dashboard ainda a pedia ao abrir a página: as
 * opções (tags, usuários, origens, campos) só aparecem dentro do painel.
 *
 *  - montar a barra de filtros: nenhuma requisição;
 *  - abrir o painel: 1 requisição, pela MESMA chave/validade (10 min) das
 *    outras telas — fechar e reabrir não pede de novo;
 *  - o funil da URL/painel vem da lista de funis (`GET /api/pipelines`, já
 *    carregada pelo shell), não das opções de filtro.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchFilterOptions: vi.fn() }));
vi.mock("@/components/pipeline/kanban-filters/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/pipeline/kanban-filters/api")>()),
  fetchFilterOptions: api.fetchFilterOptions,
}));
vi.mock("@/lib/page-mock-mode", () => ({ isPageMockMode: () => false }));
vi.mock("@/lib/preview-mode", () => ({ isPreviewMode: () => false }));

import {
  FILTER_OPTIONS_QUERY_KEY,
  FILTER_OPTIONS_STALE_MS,
} from "@/components/pipeline/kanban-filters/use-filter-options";
import type { FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";
import type { DashboardFiltersState } from "@/features/dashboard-v2/api";
import { DashboardSearchFilterBar } from "@/features/dashboard-v2/components/dashboard-filters";

const OPTIONS: FilterOptionsResponse = {
  pipelines: [],
  users: [{ id: "u1", name: "Ana", role: "AGENT", type: "USER" }],
  tags: [{ id: "t1", name: "VIP", color: "#f00" }],
  dealCustomFields: [],
  contactCustomFields: [],
  sources: ["Site"],
};

const FILTERS: DashboardFiltersState = {
  period: "today",
  pipelineId: "p1",
  pipelineIds: ["p1"],
  userIds: [],
  stageIds: [],
  tagIds: [],
  ownerIds: [],
  sources: [],
};

const PIPELINES = [
  {
    id: "p1",
    name: "Vendas",
    number: 7,
    stages: [{ id: "s1", name: "Novo", color: "#00f", position: 0 }],
  },
];

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(
    <DashboardSearchFilterBar
      search=""
      onSearch={() => {}}
      filters={FILTERS}
      onPatch={() => {}}
      pipelines={PIPELINES}
      canFetch
      effectivePipelineId="p1"
      variant="deals"
    />,
    { wrapper },
  );
  return { qc };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  api.fetchFilterOptions.mockReset();
  api.fetchFilterOptions.mockResolvedValue(OPTIONS);
});

afterEach(() => cleanup());

describe("Dashboard — opções de filtro", () => {
  it("montar a barra não busca as opções; abrir o painel busca 1 vez; reabrir reaproveita", async () => {
    const { qc } = mount();
    await flush();
    expect(api.fetchFilterOptions).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    await flush();
    expect(api.fetchFilterOptions).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Filtros do dashboard" })).toBeTruthy();

    // Mesma chave e validade das outras telas (Kanban/Flow/Lista).
    const query = qc.getQueryCache().find({ queryKey: FILTER_OPTIONS_QUERY_KEY });
    expect(query).toBeDefined();
    expect((query!.options as { staleTime?: number }).staleTime).toBe(FILTER_OPTIONS_STALE_MS);
    expect(qc.getQueryCache().findAll({ queryKey: ["dashboard-filter-options"] })).toEqual([]);

    // Fecha (Esc) e reabre: nada de novo.
    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    await flush();
    expect(api.fetchFilterOptions).toHaveBeenCalledTimes(1);
  });

  it("os funis do painel vêm da lista de funis, sem depender das opções de filtro", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    await flush();
    expect(screen.getByRole("dialog").textContent).toContain("Vendas");
  });
});
