/** @vitest-environment jsdom */
/**
 * D5 — consumo do Dashboard: abrir → trocar aba → voltar → trocar período não
 * refaz layout, departamentos, usuários, e as tabulações saem 1× por período.
 *
 * Tudo passa pelo `fetch` global (stub), então conta as chamadas reais.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/page-mock-mode", () => ({ isPageMockMode: () => false }));
vi.mock("@/lib/preview-mode", () => ({ isPreviewMode: () => false }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import type { DashboardFiltersState } from "@/features/dashboard-v2/api";
import {
  loadRemoteDashboard,
  patchRemoteDashboardMeta,
  resetDashboardRemoteForTests,
} from "@/features/dashboard-v2/dashboard-persist";
import { useDashboardReferenceData } from "@/features/dashboard-v2/hooks";
import { periodToRangeISO } from "@/features/dashboard-v2/use-dashboard-filters";
import { useTabulationAnalytics } from "@/features/dashboard-v2/use-tabulation-analytics";

const calls: { method: string; url: string }[] = [];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function count(match: string, method = "GET") {
  return calls.filter((c) => c.method === method && c.url.includes(match)).length;
}

beforeEach(() => {
  calls.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T13:00:00.000Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? "GET", url });
      if (url.includes("/api/dashboard/layout")) {
        return jsonResponse({
          data: { meta: { v: 2, ui: { tab: "service", clock: "business" } } },
        });
      }
      if (url.includes("/api/settings/departments")) return jsonResponse([{ id: "d1", name: "Suporte" }]);
      if (url.includes("/api/users")) return jsonResponse([{ id: "u1", name: "Ana" }]);
      if (url.includes("/api/analytics/tabulations")) {
        return jsonResponse({
          total: 0,
          page: 1,
          perPage: 25,
          distinctTabulations: 0,
          distinctUsers: 0,
          byTabulation: [],
          byUser: [],
          items: [],
        });
      }
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  cleanup();
  resetDashboardRemoteForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function makeClient() {
  // Mesmos padrões do app (providers.tsx): validade de 2 min, sem refetch ao focar.
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 2 * 60 * 1000, refetchOnWindowFocus: false, retry: false },
    },
  });
}

const FILTERS: DashboardFiltersState = {
  period: "last_30",
  pipelineId: "p1",
  pipelineIds: ["p1"],
  userIds: [],
  stageIds: [],
  tagIds: [],
  ownerIds: [],
  sources: [],
};

describe("layout salvo (/api/dashboard/layout)", () => {
  it("os 4 consumidores da abertura e as releituras compartilham 1 GET", async () => {
    await Promise.all([
      loadRemoteDashboard(),
      loadRemoteDashboard(),
      loadRemoteDashboard(),
      loadRemoteDashboard(),
    ]);
    // trocar aba / voltar / trocar período não relê
    await loadRemoteDashboard();
    await loadRemoteDashboard();
    expect(count("/api/dashboard/layout")).toBe(1);
  });

  it("gravar o que o backend já tem não gera PATCH; mudar gera 1", async () => {
    await loadRemoteDashboard();
    // ex.: filtros/aba iguais aos salvos (URL do mesmo período)
    expect(await patchRemoteDashboardMeta({ ui: { tab: "service", clock: "business" } })).toBe(true);
    expect(count("/api/dashboard/layout", "PATCH")).toBe(0);

    expect(await patchRemoteDashboardMeta({ ui: { tab: "deals", clock: "business" } })).toBe(true);
    expect(count("/api/dashboard/layout", "PATCH")).toBe(1);
    // voltar para o que acabou de gravar também não repete
    expect(await patchRemoteDashboardMeta({ ui: { tab: "deals", clock: "business" } })).toBe(true);
    expect(count("/api/dashboard/layout", "PATCH")).toBe(1);
  });
});

describe("departamentos e usuários", () => {
  it("voltar para Atendimentos depois de minutos não refaz as duas chamadas", async () => {
    const qc = makeClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const view = renderHook(({ on }) => useDashboardReferenceData(on), {
      wrapper,
      initialProps: { on: true },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(count("/api/settings/departments")).toBe(1);
    expect(count("/api/users")).toBe(1);

    // troca para Negócios (enabled desliga) e volta 3 min depois
    view.rerender({ on: false });
    vi.setSystemTime(new Date("2026-10-07T13:03:00.000Z"));
    view.rerender({ on: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(count("/api/settings/departments")).toBe(1);
    expect(count("/api/users")).toBe(1);
    expect(view.result.current.departments.data).toHaveLength(1);
    expect(view.result.current.users.data).toHaveLength(1);
  });
});

describe("tabulações por período", () => {
  it("o fim do período não muda a cada clique (fim do dia)", () => {
    for (const period of ["last_7", "last_30", "this_month"] as const) {
      const a = periodToRangeISO({ ...FILTERS, period });
      vi.setSystemTime(new Date("2026-10-07T13:01:30.000Z"));
      const b = periodToRangeISO({ ...FILTERS, period });
      vi.setSystemTime(new Date("2026-10-07T13:00:00.000Z"));
      expect(b.to, period).toBe(a.to);
      expect(b.from, period).toBe(a.from);
      expect(new Date(a.to).getHours()).toBe(23);
    }
  });

  it("trocar de período e voltar: 1 chamada por período, mesmo com 'agora' diferente", async () => {
    const qc = makeClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    // A cada render o dashboard recalcula o intervalo a partir de filtros "novos".
    const view = renderHook(
      ({ period }: { period: DashboardFiltersState["period"] }) => {
        const range = periodToRangeISO({ ...FILTERS, period });
        return useTabulationAnalytics({
          fromIso: range.from,
          toIso: range.to,
          actorUserIds: [],
          departmentIds: [],
          page: 1,
        });
      },
      { wrapper, initialProps: { period: "last_30" as DashboardFiltersState["period"] } },
    );
    const settle = () =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
    await settle();
    expect(count("/api/analytics/tabulations")).toBe(1);

    // mesma tela, relógio andou 2 s: não pede de novo
    vi.setSystemTime(new Date("2026-10-07T13:00:02.000Z"));
    view.rerender({ period: "last_30" });
    await settle();
    expect(count("/api/analytics/tabulations")).toBe(1);

    // outro período: +1
    vi.setSystemTime(new Date("2026-10-07T13:00:05.000Z"));
    view.rerender({ period: "last_7" });
    await settle();
    expect(count("/api/analytics/tabulations")).toBe(2);

    // volta ao primeiro (relógio andou de novo): reaproveita a chave
    vi.setSystemTime(new Date("2026-10-07T13:00:09.000Z"));
    view.rerender({ period: "last_30" });
    await settle();
    expect(count("/api/analytics/tabulations")).toBe(2);
  });
});
