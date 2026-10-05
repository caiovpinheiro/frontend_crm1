/** @vitest-environment jsdom */
/**
 * Presença (F2, 05/10): chamadas por minuto de UMA aba em uso contínuo
 * (clique a cada 10 s, troca de rota a cada 2 min, alt-tab a cada 60 s) e
 * status do agente por evento SSE, sem GET.
 *
 * Indício de produção: `/me/ping` 143/min, `/me/activity` 31/min,
 * `/agents/:id/status` 31/min. O caso de várias abas está em
 * `src/hooks/presence-ticker.test.ts`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/inbox" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
// Aba isolada (sem coordenação): esta aba é a líder de si mesma.
vi.mock("@/hooks/sse-single-leader", () => ({ isSingleLeaderEnabled: () => false }));

const sse = vi.hoisted(() => ({
  handlers: new Map<string, Set<(data: unknown) => void>>(),
}));
function on(event: string, fn: (data: unknown) => void) {
  if (!sse.handlers.has(event)) sse.handlers.set(event, new Set());
  sse.handlers.get(event)!.add(fn);
  return () => sse.handlers.get(event)?.delete(fn);
}
vi.mock("@/hooks/use-sse", async () => {
  const React = await import("react");
  return {
    subscribeSSE: (
      _url: string,
      events: Iterable<string>,
      handler: (event: string, data: unknown) => void,
    ) => {
      const offs = [...events].map((e) => on(e, (d) => handler(e, d)));
      return () => offs.forEach((off) => off());
    },
    subscribeSSEEvents: (_url: string, handlers: Record<string, (d: unknown) => void>) => {
      const offs = Object.entries(handlers).map(([e, fn]) => on(e, fn));
      return () => offs.forEach((off) => off());
    },
    useSSE: (
      _url: string,
      handler: (event: string, data: unknown) => void,
      enabled = true,
      events?: readonly string[],
    ) => {
      const ref = React.useRef(handler);
      ref.current = handler;
      const key = (events ?? []).join(",");
      React.useEffect(() => {
        if (!enabled) return;
        const offs = key.split(",").map((e) => on(e, (d) => ref.current(e, d)));
        return () => offs.forEach((off) => off());
      }, [enabled, key]);
    },
    useSSEConnected: () => true,
    isSSEConnected: () => true,
  };
});
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u_me" } }, status: "authenticated" }),
}));
vi.mock("@/features/inbox-v2/context/message-toast-context", () => ({
  useMessageToast: () => ({ registerActiveConversation: () => () => {} }),
}));

import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import { useSystemActivity } from "@/features/system-usage/use-system-activity";
import { useAgentStatus } from "@/components/crm/agent-status";
import { useSystemPresenceSync } from "@/hooks/use-system-presence-sync";
import { useInboxRealtime } from "@/features/inbox-v2/hooks/use-realtime";
import { startShellBootstrap } from "@/lib/shell-bootstrap";

type Call = { at: number; method: string; path: string; body: unknown };
let calls: Call[] = [];
let bootstrapStatus: string | null = "ONLINE";

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), "http://localhost");
  const method = init?.method ?? "GET";
  let body: unknown = null;
  try {
    body = init?.body ? JSON.parse(String(init.body)) : null;
  } catch {
    body = null;
  }
  calls.push({ at: Date.now(), method, path: url.pathname, body });
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  if (url.pathname === "/api/me/bootstrap") {
    return json({
      version: 1,
      user: { id: "u_me", organizationId: "org_1" },
      failedBlocks: [],
      agentStatus: bootstrapStatus
        ? { userId: "u_me", status: bootstrapStatus, availableForVoiceCalls: false }
        : null,
    });
  }
  if (url.pathname === "/api/agents/u_me/status" && method === "PUT") {
    return json({ userId: "u_me", status: (body as { status: string }).status });
  }
  if (url.pathname === "/api/agents/u_me/status") {
    return json({ userId: "u_me", status: "ONLINE" });
  }
  return json({ ok: true });
});

function count(method: string, path: string) {
  return calls.filter((c) => c.method === method && c.path === path);
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function emit(event: string, data: unknown) {
  act(() => {
    for (const fn of sse.handlers.get(event) ?? []) fn(data);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(Date.parse("2026-10-05T12:00:00.000Z"));
  calls = [];
  bootstrapStatus = "ONLINE";
  nav.pathname = "/inbox";
  sse.handlers.clear();
  try {
    window.localStorage.clear();
  } catch {
    /* sem storage */
  }
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ping + activity de uma aba em uso contínuo", () => {
  it("10 min: ping no máximo a cada 45 s; activity agregado no mesmo tique", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    const view = renderHook(() => {
      usePresenceHeartbeat();
      useSystemActivity();
    });
    await advance(0);

    const tenMin = 10 * 60_000;
    for (let t = 1_000; t <= tenMin; t += 1_000) {
      await advance(1_000);
      if (t % 10_000 === 0) {
        button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      }
      if (t % 60_000 === 0) {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      }
      if (t % 120_000 === 0) {
        nav.pathname = nav.pathname === "/inbox" ? "/pipeline" : "/inbox";
        view.rerender();
      }
    }

    const pings = count("POST", "/api/agents/me/ping");
    const activity = count("POST", "/api/agents/me/activity");
    // Uma conta de "antes" para o PR (o teste só trava o "depois").
    process.stdout.write(
      `[presence-calls] 10 min, 1 aba: ping=${pings.length} activity=${activity.length}\n`,
    );

    expect(pings.length).toBeLessThanOrEqual(8);
    expect(activity.length).toBeLessThanOrEqual(7);
    // Nenhum par de chamadas do mesmo tipo a menos de 45 s.
    for (const list of [pings, activity]) {
      for (let i = 1; i < list.length; i += 1) {
        expect(list[i].at - list[i - 1].at).toBeGreaterThanOrEqual(45_000);
      }
    }
    // Nada se perde: todos os cliques e trocas de rota chegam ao backend.
    const total = activity.reduce(
      (sum, c) => sum + Number((c.body as { interactionCount?: number }).interactionCount ?? 0),
      0,
    );
    expect(total).toBeGreaterThanOrEqual(60);
    button.remove();
  });
});

describe("status do agente por evento SSE", () => {
  function mountStatus() {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 2 * 60_000 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    // O `<ShellBootstrap />` do layout dispara a tentativa no render.
    void startShellBootstrap(qc, { userId: "u_me", organizationId: "org_1" });
    const view = renderHook(
      () => {
        useSystemPresenceSync(true);
        useInboxRealtime({ activeConversationId: null, currentUserId: "u_me" });
        return useAgentStatus();
      },
      { wrapper },
    );
    return { qc, view };
  }

  it("carga: status vem do bootstrap, sem GET /agents/:id/status", async () => {
    const { view } = mountStatus();
    await advance(100);
    expect(view.result.current.isLoaded).toBe(true);
    expect(view.result.current.status).toBe("ONLINE");
    expect(count("GET", "/api/agents/u_me/status")).toHaveLength(0);
  });

  it("presence_update do próprio usuário atualiza o status sem GET", async () => {
    const { view } = mountStatus();
    await advance(100);
    const before = count("GET", "/api/agents/u_me/status").length;
    emit("presence_update", { organizationId: "org_1", userId: "u_me", status: "AWAY" });
    await advance(1_000);
    expect(view.result.current.status).toBe("AWAY");
    // Evento de outro agente também não busca nada.
    emit("presence_update", { organizationId: "org_1", userId: "u_bia", status: "ONLINE" });
    await advance(1_000);
    expect(count("GET", "/api/agents/u_me/status").length).toBe(before);
  });

  it("trocar o próprio status: PUT e nenhum GET depois (a resposta já é o status)", async () => {
    const { view } = mountStatus();
    await advance(100);
    const before = count("GET", "/api/agents/u_me/status").length;
    act(() => view.result.current.setStatus("AWAY"));
    await advance(1_000);
    expect(count("PUT", "/api/agents/u_me/status")).toHaveLength(1);
    expect(view.result.current.status).toBe("AWAY");
    expect(count("GET", "/api/agents/u_me/status").length).toBe(before);
  });

  it("sem bloco no bootstrap (backend antigo/erro): 1 GET individual", async () => {
    bootstrapStatus = null;
    const { view } = mountStatus();
    await advance(100);
    expect(view.result.current.isLoaded).toBe(true);
    expect(count("GET", "/api/agents/u_me/status")).toHaveLength(1);
  });
});
