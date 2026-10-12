/** @vitest-environment jsdom */
/**
 * Estado vazio só com a resposta em mãos. Enquanto a busca está pendente — ou
 * ainda nem saiu (carga por intersecção) — o card mostra esqueleto. Antes,
 * "Principais tabulações" dizia "Sem tabulações no período" enquanto os KPIs
 * ao lado ainda mostravam "…".
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import { renderTabBoardWidget } from "@/app/(app)/dashboard/_v2-client";
import { cardQueryWaiting, queryWaiting } from "@/features/dashboard-v2/query-waiting";
import type {
  TabulationAnalyticsResponse,
  useTabulationAnalytics,
} from "@/features/dashboard-v2/use-tabulation-analytics";

afterEach(cleanup);

type TabQuery = ReturnType<typeof useTabulationAnalytics>;

const EMPTY: TabulationAnalyticsResponse = {
  total: 0,
  page: 1,
  perPage: 25,
  distinctTabulations: 0,
  distinctUsers: 0,
  byTabulation: [],
  byUser: [],
  items: [],
} as unknown as TabulationAnalyticsResponse;

function q(state: Partial<{ data: unknown; error: unknown; isLoading: boolean }>): TabQuery {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    refetch: vi.fn(),
    ...state,
  } as unknown as TabQuery;
}

function show(id: string, query: TabQuery) {
  const node = renderTabBoardWidget(id, query, "", [], [], () => {}, 1, () => {});
  return render(<>{node as ReactNode}</>);
}

const NOT_FIRED = q({});
const PENDING = q({ isLoading: true });
const EMPTY_OK = q({ data: EMPTY });

describe("queryWaiting", () => {
  it("sem dado e sem erro = esperando (pendente ou não disparada)", () => {
    expect(queryWaiting({ data: undefined, error: null })).toBe(true);
    expect(queryWaiting({ data: EMPTY, error: null })).toBe(false);
    expect(queryWaiting({ data: undefined, error: new Error("x") })).toBe(false);
  });

  it("cards de Negócios (uso/insights/campos): esqueleto rodando ou com filtros assentando", () => {
    const pending = { data: undefined, error: null, isEnabled: true };
    const off = { data: undefined, error: null, isEnabled: false };
    // "Uso do sistema" pendente → esqueleto, não "Sem uso hoje"
    expect(cardQueryWaiting(pending, true)).toBe(true);
    // filtros ainda assentando (query desligada até lá) → esqueleto
    expect(cardQueryWaiting(off, false)).toBe(true);
    // desligada de vez com filtros prontos (prévia) → card normal, sem esqueleto eterno
    expect(cardQueryWaiting(off, true)).toBe(false);
    // sucesso vazio → card com o estado vazio
    expect(cardQueryWaiting({ data: { items: [] }, error: null, isEnabled: true }, true)).toBe(false);
  });
});

describe("Principais tabulações", () => {
  for (const [name, query] of [
    ["ainda não disparada (intersecção)", NOT_FIRED],
    ["pendente", PENDING],
  ] as const) {
    it(`${name} → esqueleto, nunca o estado vazio`, () => {
      const { container } = show("top", query);
      expect(container.querySelector(".animate-pulse")).toBeTruthy();
      expect(screen.queryByText("Sem tabulações no período")).toBeNull();
    });
  }

  it("sucesso vazio → estado vazio", () => {
    const { container } = show("top", EMPTY_OK);
    expect(screen.getByText("Sem tabulações no período")).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("erro sem dado → erro com 'tentar de novo', não o estado vazio", () => {
    show("top", q({ error: new Error("falhou") }));
    expect(screen.getByText(/falhou/)).toBeTruthy();
    expect(screen.queryByText("Sem tabulações no período")).toBeNull();
  });
});

describe("Por usuário e log", () => {
  it("pendente/não disparada → esqueleto / carregando", () => {
    for (const query of [NOT_FIRED, PENDING]) {
      const byUser = show("byUser", query);
      expect(byUser.container.querySelector(".animate-pulse")).toBeTruthy();
      expect(screen.queryByText(/Nenhuma tabulação feita/)).toBeNull();
      cleanup();
      show("log", query);
      expect(screen.getByText("Carregando…")).toBeTruthy();
      expect(screen.queryByText("Nenhum registro")).toBeNull();
      cleanup();
    }
  });

  it("sucesso vazio → estados vazios", () => {
    show("byUser", EMPTY_OK);
    expect(screen.getByText("Nenhuma tabulação feita por pessoas no período.")).toBeTruthy();
    cleanup();
    show("log", EMPTY_OK);
    expect(screen.getByText("Nenhum registro")).toBeTruthy();
  });
});

describe("KPIs de tabulações", () => {
  it("não disparada mostra '…' (carregando), não '—'", () => {
    show("kpis", NOT_FIRED);
    expect(screen.getAllByText("…").length).toBeGreaterThan(0);
    expect(screen.queryByText("—")).toBeNull();
  });

  it("sucesso vazio mostra os zeros", () => {
    show("kpis", EMPTY_OK);
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });
});
