/** @vitest-environment jsdom */
/**
 * Alturas dos cards de Negócios:
 *  - carregar o layout salvo (cards de evento w4 h6) não grava nada e não
 *    muda o `h` — só o mínimo do tipo cai (evento: 4 linhas), para a pessoa
 *    poder diminuir o card ao redimensionar;
 *  - "Ajustar alturas ao conteúdo" vira UMA gravação (1 PATCH) com os `h`
 *    calculados.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "u1", organizationId: "o1" } },
  }),
}));

import { resetDashboardRemoteForTests } from "@/features/dashboard-v2/dashboard-persist";
import { fitLayoutToContent } from "@/features/dashboard-v2/grid-fit";
import {
  CUSTOM_MIN_H,
  useNegociosGrid,
  type NegociosGridStore,
} from "@/features/dashboard-v2/use-negocios-grid";

const SAVED: NegociosGridStore = {
  version: 2,
  foldedAutoStages: true,
  hiddenWidgetIds: [],
  cards: [
    { id: "in", type: "event", eventType: "messages_in", title: "Mensagens recebidas" },
    { id: "out", type: "event", eventType: "messages_out", title: "Mensagens respondidas" },
    { id: "t", type: "tasks", title: "Tarefas" },
  ],
  layout: [
    { i: "kpis", x: 0, y: 0, w: 12, h: 3 },
    { i: "funnel", x: 0, y: 3, w: 12, h: 8 },
    { i: "usage", x: 0, y: 11, w: 7, h: 12 },
    { i: "card:in", x: 7, y: 11, w: 4, h: 6, minH: 6 },
    { i: "card:out", x: 7, y: 17, w: 4, h: 6, minH: 6 },
    { i: "evolution", x: 0, y: 23, w: 6, h: 14 },
    { i: "sources", x: 6, y: 23, w: 6, h: 8 },
    { i: "card:t", x: 6, y: 31, w: 6, h: 8 },
    { i: "agents", x: 0, y: 39, w: 12, h: 10 },
    { i: "exceptions", x: 0, y: 49, w: 12, h: 7 },
  ],
};

const calls: { method: string; url: string; body?: string }[] = [];

function count(method: string) {
  return calls.filter((c) => c.method === method && c.url.includes("/api/dashboard/layout"))
    .length;
}

beforeEach(() => {
  calls.length = 0;
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url: String(input), body: init?.body as string | undefined });
      const body =
        method === "GET" ? { data: { meta: { v: 2, negocios: SAVED } } } : { ok: true };
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

describe("alturas dos cards de Negócios", () => {
  it("carregar o layout salvo: 0 PATCH, h mantido, mínimo por tipo", async () => {
    const view = renderHook(() => useNegociosGrid());
    await settle();
    expect(view.result.current.hydrated).toBe(true);
    expect(count("GET")).toBe(1);
    expect(count("PATCH")).toBe(0);
    const byId = Object.fromEntries(view.result.current.layout.map((item) => [item.i, item]));
    expect(byId["card:in"]).toMatchObject({ w: 4, h: 6, minH: CUSTOM_MIN_H.event });
    expect(byId["card:out"]).toMatchObject({ w: 4, h: 6, minH: 4 });
    // Tarefas listam itens: mínimo continua 6. Gráficos mantêm os deles.
    expect(byId["card:t"]).toMatchObject({ h: 8, minH: 6 });
    expect(byId.evolution.minH).toBe(8);
    expect(byId.usage.minH).toBe(6);
  });

  it("ajustar alturas ao conteúdo: 1 PATCH com os h calculados", async () => {
    const view = renderHook(() => useNegociosGrid());
    await settle();
    expect(count("PATCH")).toBe(0);

    const fitted = fitLayoutToContent(
      view.result.current.layout,
      new Map([
        ["card:in", 82],
        ["card:out", 82],
      ]),
    );
    act(() => {
      view.result.current.setLayout(fitted, "user");
    });
    await settle();

    expect(count("PATCH")).toBe(1);
    const patch = calls.find((c) => c.method === "PATCH")!;
    const body = JSON.parse(patch.body!) as {
      layout: Record<string, { h: number }>;
      meta: { negocios: NegociosGridStore };
    };
    expect(body.layout["card:in"].h).toBe(4);
    expect(body.layout["card:out"].h).toBe(4);
    const stored = Object.fromEntries(body.meta.negocios.layout.map((item) => [item.i, item.h]));
    expect(stored["card:in"]).toBe(4);
    expect(stored["card:out"]).toBe(4);
    expect(stored.usage).toBe(12);
  });
});
