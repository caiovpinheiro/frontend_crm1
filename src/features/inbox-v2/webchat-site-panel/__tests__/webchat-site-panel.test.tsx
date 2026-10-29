/** @vitest-environment jsdom */
/**
 * Painel "No site agora": renderização (rótulos, valores, eventos e tempo
 * relativo) e atualização ao vivo: os sinais SSE não trazem valores do site,
 * o painel refaz o GET (com checagem de acesso) quando o sinal é do seu
 * contato/canal e ignora os demais. Dados neutros.
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
  formatSiteRelativeTime,
  isWebchatPanelSignal,
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
  it("rótulo da config ou a chave legível; booleano em texto; tempo relativo", () => {
    expect(siteKeyLabel("etapa", { etapa: "Etapa atual" })).toBe("Etapa atual");
    expect(siteKeyLabel("secao", {})).toBe("Secao");
    expect(formatSiteValue(true)).toBe("sim");
    expect(formatSiteValue(3)).toBe("3");
    expect(formatSiteRelativeTime(iso(10_000), NOW)).toBe("agora");
    expect(formatSiteRelativeTime(iso(5 * 60_000), NOW)).toBe("há 5 min");
    expect(formatSiteRelativeTime(iso(3 * 3_600_000), NOW)).toBe("há 3 h");
    expect(formatSiteRelativeTime(iso(24 * 3_600_000), NOW)).toBe("há 1 dia");
    expect(formatSiteRelativeTime(iso(72 * 3_600_000), NOW)).toBe("há 3 dias");
  });

  it("sinal só vale para o contato/canal do painel disponível", () => {
    const p = panel();
    expect(isWebchatPanelSignal(p, { contactId: "ct-1", channelId: "ch-1" })).toBe(true);
    expect(isWebchatPanelSignal(p, { contactId: "ct-2", channelId: "ch-1" })).toBe(false);
    expect(isWebchatPanelSignal(p, { contactId: "ct-1", channelId: "ch-2" })).toBe(false);
    expect(isWebchatPanelSignal(panel({ available: false }), { contactId: "ct-1", channelId: "ch-1" })).toBe(false);
    expect(isWebchatPanelSignal(undefined, { contactId: "ct-1", channelId: "ch-1" })).toBe(false);
    expect(isWebchatPanelSignal(p, null)).toBe(false);
  });
});

describe("WebchatSitePanelView", () => {
  it("resumo: destaque do importante, estado em chips, caminho e linha do tempo sob demanda", () => {
    render(<WebchatSitePanelView data={panel()} now={NOW} />);
    expect(screen.getByText("No site agora")).toBeTruthy();
    expect(screen.getByText("· agora")).toBeTruthy();
    expect(screen.getByText(/Passo concluido · Etapa atual: 2/)).toBeTruthy();
    const chips = screen.getByRole("list", { name: "Estado atual no site" });
    expect(within(chips).getByText("Etapa atual: 2")).toBeTruthy();
    expect(within(chips).getByText("Progresso: 40")).toBeTruthy();
    expect(within(chips).getByText("Concluido: não")).toBeTruthy();
    const path = screen.getByRole("list", { name: "Caminho recente no site" });
    expect(within(path).getByText("Abriu pagina")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Últimos eventos no site" })).toBeNull();
    act(() => screen.getByRole("button", { name: /Ver linha do tempo completa/ }).click());
    const items = within(screen.getByRole("list", { name: "Últimos eventos no site" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("importante")).toBeTruthy();
    expect(within(items[1]!).getByText("há 2 h")).toBeTruthy();
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
    expect(screen.queryByText("Etapa atual: 2")).toBeNull();
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

  it("sinal do mesmo contato/canal refaz o GET (sem usar valores do SSE); outro contato é ignorado", async () => {
    wrap(<WebchatSitePanel conversationId="conv-1" />);
    await waitFor(() => expect(screen.getByText("Etapa atual: 2")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/conversations/conv-1/webchat-context");

    // Próximo GET devolve o estado novo (o SSE só avisa).
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify(
            panel({
              context: { state: { etapa: "5", secao: "b" }, updatedAt: iso(0) },
              events: [{ id: "e9", name: "pediu_ajuda", data: null, important: false, occurredAt: iso(0) }],
            }),
          ),
          { status: 200 },
        ),
    );

    // Outro contato: nenhum GET.
    act(() =>
      sse.emit("webchat_context", { organizationId: "org-1", contactId: "ct-2", channelId: "ch-1", updatedAt: iso(0) }),
    );
    await new Promise((r) => setTimeout(r, 600));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Rajada de sinais do contato do painel: um GET só.
    act(() => {
      sse.emit("webchat_context", { organizationId: "org-1", contactId: "ct-1", channelId: "ch-1", updatedAt: iso(0) });
      sse.emit("webchat_event", {
        organizationId: "org-1",
        contactId: "ct-1",
        channelId: "ch-1",
        count: 2,
        latestOccurredAt: iso(0),
      });
    });
    await waitFor(() => expect(screen.getByText("Pediu ajuda")).toBeTruthy());
    expect(screen.getByText("Etapa atual: 5")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
