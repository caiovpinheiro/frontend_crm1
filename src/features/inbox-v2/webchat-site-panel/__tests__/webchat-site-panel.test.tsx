/** @vitest-environment jsdom */
/**
 * Painel "No site agora": renderização (rótulos, valores, eventos e tempo
 * relativo), atualização ao vivo pelo SSE e o que é ignorado (outro
 * contato/canal, evento repetido ou atrasado). Dados neutros.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => {
  const subs = new Set<Record<string, (data: unknown) => void>>();
  return {
    subs,
    subscribeSSEEvents: vi.fn((_url: string, handlers: Record<string, (data: unknown) => void>) => {
      subs.add(handlers);
      return () => {
        subs.delete(handlers);
      };
    }),
    emit(event: string, data: unknown) {
      for (const handlers of [...subs]) handlers[event]?.(data);
    },
  };
});
vi.mock("@/hooks/use-sse", () => ({ subscribeSSEEvents: sse.subscribeSSEEvents }));

import {
  applyWebchatContextEvent,
  applyWebchatSiteEvent,
  formatSiteRelativeTime,
  formatSiteValue,
  siteKeyLabel,
  type WebchatSitePanelData,
} from "@/features/inbox-v2/webchat-site-panel/model";
import { WebchatSitePanel, WebchatSitePanelView } from "@/features/inbox-v2/webchat-site-panel";

const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function panel(over: Partial<WebchatSitePanelData> = {}): WebchatSitePanelData {
  return {
    available: true,
    contactId: "ct-1",
    channelId: "ch-1",
    labels: { etapa: "Etapa atual" },
    context: { state: { etapa: "2", progresso: 40, concluido: false }, updatedAt: iso(3 * 60_000) },
    events: [
      { id: "e2", name: "passo_concluido", data: { etapa: 2 }, important: true, occurredAt: iso(30_000) },
      { id: "e1", name: "abriu_pagina", data: null, important: false, occurredAt: iso(2 * 3_600_000) },
    ],
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("model", () => {
  it("rótulo da config ou a chave; booleano em texto; tempo relativo", () => {
    expect(siteKeyLabel("etapa", { etapa: "Etapa atual" })).toBe("Etapa atual");
    expect(siteKeyLabel("secao", {})).toBe("secao");
    expect(formatSiteValue(true)).toBe("sim");
    expect(formatSiteValue(3)).toBe("3");
    expect(formatSiteRelativeTime(iso(10_000), NOW)).toBe("agora");
    expect(formatSiteRelativeTime(iso(5 * 60_000), NOW)).toBe("há 5 min");
    expect(formatSiteRelativeTime(iso(3 * 3_600_000), NOW)).toBe("há 3 h");
    expect(formatSiteRelativeTime(iso(24 * 3_600_000), NOW)).toBe("há 1 dia");
    expect(formatSiteRelativeTime(iso(72 * 3_600_000), NOW)).toBe("há 3 dias");
  });

  it("webchat_context troca o estado; outro contato/canal ou evento atrasado não", () => {
    const p = panel();
    const next = applyWebchatContextEvent(p, {
      contactId: "ct-1",
      channelId: "ch-1",
      state: { etapa: "3" },
      updatedAt: iso(0),
    });
    expect(next.context).toEqual({ state: { etapa: "3" }, updatedAt: iso(0) });
    expect(applyWebchatContextEvent(p, { contactId: "ct-2", channelId: "ch-1", state: {}, updatedAt: iso(0) })).toBe(p);
    expect(applyWebchatContextEvent(p, { contactId: "ct-1", channelId: "ch-2", state: {}, updatedAt: iso(0) })).toBe(p);
    expect(
      applyWebchatContextEvent(p, { contactId: "ct-1", channelId: "ch-1", state: {}, updatedAt: iso(3_600_000) }),
    ).toBe(p);
  });

  it("webchat_event entra no topo, sem repetir, com teto de 10", () => {
    const ev = (id: string, msAgo: number) => ({
      contactId: "ct-1",
      channelId: "ch-1",
      event: { id, name: "x", data: null, important: false, occurredAt: iso(msAgo) },
    });
    const p = applyWebchatSiteEvent(panel(), ev("e3", 0));
    expect(p.events.map((e) => e.id)).toEqual(["e3", "e2", "e1"]);
    expect(applyWebchatSiteEvent(p, ev("e3", 0))).toBe(p);
    let many = panel({ events: [] });
    for (let i = 0; i < 12; i++) many = applyWebchatSiteEvent(many, ev(`n${i}`, 1000 * (12 - i)));
    expect(many.events).toHaveLength(10);
    expect(many.events[0]?.id).toBe("n11");
  });
});

describe("WebchatSitePanelView", () => {
  it("estado com rótulo (ou chave) e valores; eventos com tempo relativo e marca de importante", () => {
    render(<WebchatSitePanelView data={panel()} now={NOW} />);
    expect(screen.getByText("No site agora")).toBeTruthy();
    expect(screen.getByText("há 3 min")).toBeTruthy();
    expect(screen.getByText("Etapa atual")).toBeTruthy();
    expect(screen.getByText("progresso")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("não")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Últimos eventos no site" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("passo_concluido")).toBeTruthy();
    expect(within(items[0]!).getByText("importante")).toBeTruthy();
    expect(within(items[0]!).getByText("agora")).toBeTruthy();
    expect(within(items[0]!).getByText("Etapa atual: 2")).toBeTruthy();
    expect(within(items[1]!).getByText("há 2 h")).toBeTruthy();
    expect(within(items[1]!).queryByText("importante")).toBeNull();
  });

  it("não aparece fora do webchat nem sem nada enviado pelo site", () => {
    const { container, rerender } = render(<WebchatSitePanelView data={panel({ available: false })} now={NOW} />);
    expect(container.innerHTML).toBe("");
    rerender(<WebchatSitePanelView data={panel({ context: null, events: [] })} now={NOW} />);
    expect(container.innerHTML).toBe("");
    rerender(<WebchatSitePanelView data={undefined} now={NOW} />);
    expect(container.innerHTML).toBe("");
  });

  it("recolhe e expande", () => {
    render(<WebchatSitePanelView data={panel()} now={NOW} />);
    const toggle = screen.getByRole("button", { name: /No site agora/ });
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Etapa atual")).toBeNull();
  });
});

describe("WebchatSitePanel (GET + SSE)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sse.subs.clear();
    fetchMock = vi.fn(async () => new Response(JSON.stringify(panel()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  const wrap = (node: ReactNode) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  };

  it("lê o último estado e atualiza ao vivo pelo SSE do mesmo contato/canal", async () => {
    wrap(<WebchatSitePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByText("Etapa atual")).toBeTruthy());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/conversations/conv-1/webchat-context");

    act(() =>
      sse.emit("webchat_context", {
        organizationId: "org-1",
        contactId: "ct-1",
        channelId: "ch-1",
        state: { etapa: "5", secao: "b" },
        updatedAt: iso(0),
      }),
    );
    // O react-query notifica fora do act (notifyManager agenda).
    await waitFor(() => expect(screen.getByText("5")).toBeTruthy());
    expect(screen.getByText("secao")).toBeTruthy();
    expect(screen.queryByText("progresso")).toBeNull();

    act(() =>
      sse.emit("webchat_event", {
        organizationId: "org-1",
        contactId: "ct-1",
        channelId: "ch-1",
        event: { id: "e9", name: "pediu_ajuda", data: null, important: false, occurredAt: iso(0) },
      }),
    );
    await waitFor(() => expect(screen.getByText("pediu_ajuda")).toBeTruthy());

    // Outro contato: ignorado.
    act(() =>
      sse.emit("webchat_event", {
        organizationId: "org-1",
        contactId: "ct-2",
        channelId: "ch-1",
        event: { id: "e10", name: "de_outro", data: null, important: false, occurredAt: iso(0) },
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("de_outro")).toBeNull();
  });
});
