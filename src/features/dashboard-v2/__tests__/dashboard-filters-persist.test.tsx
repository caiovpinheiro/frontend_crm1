/** @vitest-environment jsdom */
/**
 * Abrir o Dashboard não grava o layout: normalizar a URL (funil padrão) e
 * aplicar os filtros que vieram do backend não geram PATCH. Só a mudança de
 * filtro feita pelo usuário grava (1 PATCH, com debounce).
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => {
  let qs = "";
  const listeners = new Set<() => void>();
  const replaces: string[] = [];
  const set = (next: string) => {
    qs = next;
    for (const l of listeners) l();
  };
  return {
    get: () => qs,
    set,
    replaces,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    router: {
      replace(url: string) {
        replaces.push(url);
        set(url.split("?")[1] ?? "");
      },
    },
  };
});

vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => "/dashboard",
    useRouter: () => nav.router,
    useSearchParams: () => {
      const qs = React.useSyncExternalStore(nav.subscribe, nav.get, nav.get);
      return React.useMemo(() => new URLSearchParams(qs), [qs]);
    },
  };
});

const SESSION = {
  status: "authenticated",
  data: { user: { id: "u1", organizationId: "o1" } },
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));

import { resetDashboardRemoteForTests } from "@/features/dashboard-v2/dashboard-persist";
import {
  useDashboardFilters,
  type DashboardPipelineOption,
} from "@/features/dashboard-v2/use-dashboard-filters";

const P1 = "cpipelineum0000000000000a";
const P2 = "cpipelinedois000000000000b";
const PIPELINES: DashboardPipelineOption[] = [
  { id: P1, number: 1, stages: [] },
  { id: P2, number: 2, stages: [] },
];

const calls: { method: string; url: string }[] = [];
let remoteMeta: Record<string, unknown> = { v: 2 };
let holdLayout: Promise<void> | null = null;

function count(method: string) {
  return calls.filter((c) => c.method === method && c.url.includes("/api/dashboard/layout"))
    .length;
}

beforeEach(() => {
  calls.length = 0;
  nav.replaces.length = 0;
  nav.set("");
  remoteMeta = { v: 2 };
  holdLayout = null;
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (method === "GET" && holdLayout) await holdLayout;
      const body = method === "GET" ? { data: { meta: remoteMeta } } : { ok: true };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  resetDashboardRemoteForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle(ms = 2_000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function open(pipelines: DashboardPipelineOption[] | undefined) {
  return renderHook(({ list }) => useDashboardFilters(list), {
    initialProps: { list: pipelines },
  });
}

describe("abrir o Dashboard não grava o layout", () => {
  it("/dashboard sem query: 1 GET, põe o funil padrão na URL e 0 PATCH", async () => {
    const view = open(PIPELINES);
    await settle();
    expect(count("GET")).toBe(1);
    expect(count("PATCH")).toBe(0);
    expect(nav.get()).toBe("pipeline=1");
    expect(view.result.current.filters.pipelineIds).toEqual([P1]);
    expect(view.result.current.settled).toBe(true);
  });

  it("/dashboard sem query, funis chegam depois do layout: normaliza a URL e 0 PATCH", async () => {
    const view = open(undefined);
    await settle();
    expect(count("GET")).toBe(1);
    view.rerender({ list: PIPELINES });
    await settle();
    expect(nav.get()).toBe("pipeline=1");
    expect(view.result.current.settled).toBe(true);
    expect(count("GET")).toBe(1);
    expect(count("PATCH")).toBe(0);
  });

  it("filtros salvos no backend (chaves noutra ordem, sem pipelineId): aplica e 0 PATCH", async () => {
    remoteMeta = {
      v: 2,
      filters: {
        tagIds: [],
        period: "last_7",
        sources: [],
        userIds: [],
        ownerIds: [],
        stageIds: [],
        pipelineIds: [P2],
      },
    };
    const view = open(PIPELINES);
    await settle();
    expect(count("PATCH")).toBe(0);
    expect(view.result.current.filters.period).toBe("last_7");
    expect(view.result.current.filters.pipelineIds).toEqual([P2]);
    expect(nav.get()).toBe("period=last_7&pipeline=2");
  });

  it("lista de funis antes do backend: não troca a URL antes do restore nem perde o salvo", async () => {
    remoteMeta = {
      v: 2,
      filters: { period: "last_30", pipelineIds: [P1], userIds: [], stageIds: [], tagIds: [], ownerIds: [], sources: [] },
    };
    let release!: () => void;
    holdLayout = new Promise<void>((resolve) => {
      release = resolve;
    });
    const view = open(PIPELINES);
    await settle(100);
    // Funis já carregados, backend ainda não respondeu: URL intacta.
    expect(nav.replaces).toEqual([]);
    expect(view.result.current.settled).toBe(false);
    release();
    await settle();
    expect(view.result.current.filters.period).toBe("last_30");
    expect(nav.get()).toBe("period=last_30&pipeline=1");
    expect(count("PATCH")).toBe(0);
  });

  it("com ?pipeline=1 na URL: 0 PATCH", async () => {
    nav.set("pipeline=1");
    const view = open(PIPELINES);
    await settle();
    expect(count("PATCH")).toBe(0);
    expect(view.result.current.filters.pipelineIds).toEqual([P1]);
    expect(view.result.current.settled).toBe(true);
  });

  it("mudar o funil grava: 1 PATCH com o novo funil", async () => {
    const view = open(PIPELINES);
    await settle();
    expect(count("PATCH")).toBe(0);

    act(() => {
      view.result.current.patch({ pipelineIds: [P2] });
    });
    await settle();
    expect(count("PATCH")).toBe(1);
    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
    const body = JSON.parse(String((patchCall?.[1] as RequestInit).body)) as {
      meta: { filters: { pipelineIds: string[] } };
    };
    expect(body.meta.filters.pipelineIds).toEqual([P2]);
    expect(nav.get()).toBe("pipeline=2");
  });
});
