/** @vitest-environment jsdom */
/**
 * Requisições por aba ao abrir o Dashboard (página inteira, `fetch` global
 * contado), com o layout salvo da auditoria de 12/10:
 *
 *  - Negócios: funil, uso do sistema, evolução e 2 cards de evento
 *    (mensagens recebidas/respondidas) — kpis, agentes, origem e exceções
 *    ocultos.
 *  - Atendimentos: heatmap, tempo, connections, attendants, channels e
 *    summaries ocultos.
 *
 * Contrato: cada aba pede só as seções dos widgets visíveis, o layout salvo é
 * lido 1× (e nada é regravado ao abrir), `activity-feed/stats` não sai sem um
 * card que precise dele, e nada espera um temporizador fixo.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { appendFileSync } from "node:fs";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/page-mock-mode", () => ({
  isPageMockMode: () => false,
  shouldAutoDemoEmpty: () => false,
}));
vi.mock("@/lib/preview-mode", () => ({ isPreviewMode: () => false }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "u1", organizationId: "o1", role: "ADMIN" } },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined, prefetch: () => undefined }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import DashboardV2ClientPage from "@/app/(app)/dashboard/_v2-client";
import { resetDashboardRemoteForTests } from "@/features/dashboard-v2/dashboard-persist";
import { resetServiceAvailabilityForTests } from "@/features/dashboard-v2/service-availability";

type Call = { method: string; url: string; at: number };
const calls: Call[] = [];
let t0 = 0;

const PIPELINES = [
  {
    id: "p1",
    name: "Vendas",
    number: 7,
    stages: [{ id: "s1", name: "Novo", color: "#00f", position: 0 }],
  },
];

const FILTERS = {
  period: "today",
  pipelineId: "p1",
  pipelineIds: ["p1"],
  userIds: [],
  stageIds: [],
  tagIds: [],
  ownerIds: [],
  sources: [],
};

/** Layout salvo da auditoria (Negócios e Atendimentos). */
function savedMeta(tab: "deals" | "service") {
  return {
    v: 2,
    ui: { tab, clock: "business" },
    filters: FILTERS,
    negocios: {
      version: 2,
      foldedAutoStages: true,
      cards: [
        { id: "in", type: "event", eventType: "messages_in", title: "Mensagens recebidas" },
        { id: "out", type: "event", eventType: "messages_out", title: "Mensagens respondidas" },
        ...extraCards,
      ],
      hiddenWidgetIds: ["kpis", "agents", "sources", "exceptions"],
      layout: [
        { i: "funnel", x: 0, y: 0, w: 12, h: 15 },
        { i: "usage", x: 0, y: 15, w: 7, h: 12 },
        { i: "card:in", x: 7, y: 15, w: 4, h: 6 },
        { i: "card:out", x: 7, y: 21, w: 4, h: 6 },
        { i: "evolution", x: 0, y: 27, w: 6, h: 10 },
        ...extraCards.map((c, n) => ({ i: `card:${c.id}`, x: 6, y: 27 + n * 6, w: 4, h: 6 })),
      ],
    },
    service: {
      order: [
        "agora",
        "volume",
        "exceptions",
        "deptHour",
        "teamRankings",
        "transfers",
        "kpis",
        "top",
        "byUser",
        "log",
      ],
      hidden: ["heatmap", "tempo", "connections", "attendants", "channels", "summaries"],
    },
  };
}

let openTab: "deals" | "service" = "deals";
/** Cards de evento além dos de mensagens (contam eventos do log). */
let extraCards: { id: string; type: "event"; eventType: string; title: string }[] = [];

const ZERO = { value: 0, delta: { value: 0, hidden: true } };
const EMPTY_VOLUME = {
  started: ZERO,
  finished: ZERO,
  stillOpen: ZERO,
  openStarted: ZERO,
  openWaiting: ZERO,
  messagesIn: 0,
  messagesOut: 0,
  byDay: [],
  empty: true,
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sectionsOf(url: string): string[] {
  const raw = new URL(url, "http://x").searchParams.get("section");
  return raw ? raw.split(",") : [];
}

function respond(url: string, method: string): Response {
  if (url.includes("/api/dashboard/layout")) {
    if (method !== "GET") return json({ ok: true });
    return json({ data: { meta: savedMeta(openTab) } });
  }
  if (url.includes("/api/pipelines")) return json(PIPELINES);
  if (url.includes("/api/painel/service")) {
    const out: Record<string, unknown> = {};
    for (const s of sectionsOf(url)) {
      out[s] =
        s === "agora"
          ? {
              ok: true,
              data: {
                asOf: "2026-10-12T12:00:00.000Z",
                awaitingReply: 1,
                inService: 2,
                longestWait: {
                  ms: 0,
                  contactName: null,
                  agentName: null,
                  conversationId: null,
                  overSla: false,
                  slaMinutes: 15,
                },
                agents: { online: 1, total: 2 },
              },
            }
          : s === "volume"
            ? { ok: true, data: EMPTY_VOLUME }
            : { ok: false, error: "teste" };
    }
    return json(out);
  }
  if (url.includes("/api/painel/deals") || url.includes("/api/painel/team")) {
    const out: Record<string, unknown> = {};
    for (const s of sectionsOf(url)) out[s] = { ok: false, error: "teste" };
    return json(out);
  }
  if (url.includes("/api/analytics/tabulations")) {
    return json({
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
  if (url.includes("/api/settings/departments")) return json([]);
  if (url.includes("/api/users")) return json([]);
  if (url.includes("/api/activity-feed/stats")) {
    return json({
      window: { from: "", to: "" },
      totals: { total: 0, byActorType: {}, byEntityType: {}, byType: [] },
      timeline: [],
    });
  }
  if (url.includes("/api/system-usage")) return json({ items: [] });
  return json({});
}

function path(url: string) {
  return new URL(url, "http://x").pathname;
}

function count(match: string, method = "GET") {
  return calls.filter((c) => c.method === method && path(c.url) === match).length;
}

function sectionsRequested(match: string): string[][] {
  return calls
    .filter((c) => c.method === "GET" && path(c.url) === match)
    .map((c) => sectionsOf(c.url))
    .filter((s) => !s.includes("agora"));
}

beforeEach(() => {
  calls.length = 0;
  extraCards = [];
  vi.useFakeTimers();
  t0 = Date.now();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/dashboard?pipeline=7");
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: query.includes("min-width: 1024px"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, at: Date.now() - t0 });
      return respond(url, method);
    }),
  );
});

afterEach(() => {
  cleanup();
  resetDashboardRemoteForTests();
  resetServiceAvailabilityForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 2 * 60 * 1000, refetchOnWindowFocus: false, retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<DashboardV2ClientPage navRail={<div />} />, { wrapper });
}

async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
  }
}

/** `DASHBOARD_REQUEST_LOG=<arquivo>` grava a linha do tempo (para o PR). */
function dump(label: string) {
  const out = process.env.DASHBOARD_REQUEST_LOG;
  if (!out) return;
  const lines = calls.map(
    (c) => `${c.at}ms ${c.method} ${path(c.url)} ${sectionsOf(c.url).join(",")}`,
  );
  appendFileSync(out, `${label}\n${lines.join("\n")}\n`);
}

describe("Dashboard — requisições por aba (layout da auditoria)", () => {
  it("Negócios: layout 1×, painel/deals só com as seções visíveis, sem activity-feed/stats", async () => {
    openTab = "deals";
    mount();
    await advance(10_000);
    dump("Negócios");

    expect(count("/api/dashboard/layout")).toBe(1);
    expect(count("/api/dashboard/layout", "PATCH") + count("/api/dashboard/layout", "PUT")).toBe(0);
    const deals = sectionsRequested("/api/painel/deals").filter((s) => !s.includes("customFields"));
    expect(deals).toHaveLength(1);
    expect([...deals[0]!].sort()).toEqual(["evolution", "funnel", "kpis"]);
    expect(count("/api/activity-feed/stats")).toBe(0);
    // Atendimentos não sai na aba Negócios (só o volume dos 2 cards de mensagens).
    expect(sectionsRequested("/api/painel/service")).toEqual([["volume"]]);
    expect(count("/api/painel/team")).toBe(0);
    expect(count("/api/analytics/tabulations")).toBe(0);
  });

  it("Negócios com card de evento do log: activity-feed/stats 1× com o período do filtro", async () => {
    openTab = "deals";
    extraCards = [{ id: "deal", type: "event", eventType: "DEAL_CREATED", title: "Negócios criados" }];
    mount();
    await advance(3_000);
    const stats = calls.filter((c) => path(c.url) === "/api/activity-feed/stats");
    expect(stats).toHaveLength(1);
    const sp = new URL(stats[0]!.url, "http://x").searchParams;
    expect(sp.get("period")).toBe("today");
    expect(sp.has("dateFrom")).toBe(false);
  });

  it("Atendimentos: só as seções visíveis, tudo na abertura (sem ondas de 2–6 s)", async () => {
    openTab = "service";
    mount();
    await advance(10_000);
    dump("Atendimentos");

    expect(count("/api/dashboard/layout")).toBe(1);
    const service = sectionsRequested("/api/painel/service").flat().sort();
    expect(service).toEqual(["exceptions", "volume"]);
    for (const hidden of ["heatmap", "tempo", "connections", "attendants", "channels", "byDepartment"]) {
      expect(service).not.toContain(hidden);
    }
    expect(count("/api/painel/team")).toBe(1);
    expect(count("/api/analytics/tabulations")).toBe(1);
    // Nenhuma requisição de dados espera temporizador: tudo sai no 1º segundo.
    const late = calls.filter(
      (c) => c.at > 1_000 && /\/api\/(painel|analytics)\//.test(path(c.url)),
    );
    expect(late.map((c) => `${c.at}ms ${path(c.url)}`)).toEqual([]);
  });

  it("Atendimentos com intersecção: a 1ª dobra sai na abertura, o resto ao chegar perto", async () => {
    type Entry = { isIntersecting: boolean; target: Element };
    const observers: { cb: (e: Entry[]) => void; els: HTMLElement[]; dead: boolean }[] = [];
    const firstFold = new Set(["agora", "volume"]);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        private o: (typeof observers)[number];
        constructor(cb: (e: Entry[]) => void) {
          this.o = { cb, els: [], dead: false };
          observers.push(this.o);
        }
        observe(el: HTMLElement) {
          this.o.els.push(el);
          if (firstFold.has(el.dataset.seenId ?? "")) {
            queueMicrotask(() => {
              if (!this.o.dead) this.o.cb([{ isIntersecting: true, target: el }]);
            });
          }
        }
        unobserve() {}
        disconnect() {
          this.o.dead = true;
        }
      },
    );
    const scrollTo = (ids: string[]) =>
      act(() => {
        for (const o of observers) {
          if (o.dead) continue;
          const hits = o.els.filter((el) => ids.includes(el.dataset.seenId ?? ""));
          if (hits.length) o.cb(hits.map((target) => ({ isIntersecting: true, target })));
        }
      });

    openTab = "service";
    mount();
    await advance(5_000);
    expect(sectionsRequested("/api/painel/service")).toEqual([["volume"]]);
    expect(count("/api/painel/team")).toBe(0);
    expect(count("/api/analytics/tabulations")).toBe(0);

    scrollTo(["exceptions", "deptHour"]);
    await advance(100);
    expect(sectionsRequested("/api/painel/service")).toEqual([["volume"], ["exceptions"]]);
    expect(count("/api/painel/team")).toBe(1);
    expect(count("/api/analytics/tabulations")).toBe(0);

    scrollTo(["teamRankings", "transfers", "kpis"]);
    await advance(100);
    // Equipe já saiu com os 3 blocos visíveis; tabulações saem agora.
    expect(count("/api/painel/team")).toBe(1);
    expect(count("/api/analytics/tabulations")).toBe(1);
  });

  it("trocar de aba e voltar não relê o layout", async () => {
    openTab = "deals";
    mount();
    await advance(3_000);
    fireEvent.click(screen.getByRole("button", { name: "Atendimentos" }));
    await advance(3_000);
    fireEvent.click(screen.getByRole("button", { name: "Negócios" }));
    await advance(3_000);
    expect(count("/api/dashboard/layout")).toBe(1);
  });
});
