/** @vitest-environment jsdom */
/**
 * Painel "No site agora" — resumo da jornada: destaque do último evento
 * importante (com "N× hoje"), estado em chips recolhidos, caminho recente
 * (ordem, agrupamento, "+N anteriores") e a linha do tempo completa sob
 * demanda. Dados neutros.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  formatSitePathSpan,
  latestSiteActivity,
  siteHighlight,
  sitePath,
  siteStateChips,
  WEBCHAT_PANEL_PATH_STEPS,
  WEBCHAT_PANEL_STATE_CHIPS,
} from "@/features/inbox-v2/webchat-site-panel/journey";
import type { WebchatPanelEvent, WebchatSitePanelData } from "@/features/inbox-v2/webchat-site-panel/model";
import { WebchatSitePanelView } from "@/features/inbox-v2/webchat-site-panel";

// Meio-dia no fuso local: "hoje" não depende do fuso de quem roda o teste.
const NOW = new Date(2026, 9, 28, 12, 0, 0).getTime();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

let seq = 0;
function ev(name: string, data: WebchatPanelEvent["data"], minAgo: number, important = false): WebchatPanelEvent {
  seq += 1;
  return { id: `e${seq}`, name, data, important, occurredAt: ago(minAgo) };
}

function panel(over: Partial<WebchatSitePanelData> = {}): WebchatSitePanelData {
  return { available: true, contactId: "ct-1", channelId: "ch-1", labels: {}, context: null, events: [], ...over };
}

afterEach(() => {
  cleanup();
});

describe("siteHighlight", () => {
  it("último importante com título, principal, demais dados e N× hoje (mesmo nome, mesmo dia)", () => {
    const events = [
      ev("secao_aberta", { titulo: "Ajuda" }, 1),
      ev("pediu_ajuda", { assunto: "Cadastro", origem: "rodape" }, 2, true),
      ev("pediu_ajuda", { assunto: "Senha" }, 60, true),
      ev("outro_alerta", null, 70, true),
      ev("pediu_ajuda", { assunto: "Cadastro" }, 26 * 60, true), // ontem
    ];
    expect(siteHighlight(events, { pediu_ajuda: "Pedido de ajuda" }, NOW)).toEqual({
      id: events[1]!.id,
      title: "Pedido de ajuda",
      primary: "Cadastro",
      others: "Origem: rodape",
      occurredAt: events[1]!.occurredAt,
      todayCount: 2,
    });
  });

  it("sem evento importante, sem destaque", () => {
    expect(siteHighlight([ev("secao_aberta", null, 1)], {}, NOW)).toBeNull();
    expect(siteHighlight([], {}, NOW)).toBeNull();
  });
});

describe("siteStateChips", () => {
  it("texto sozinho; número/booleano com rótulo; tooltip sempre rótulo: valor; texto repetido uma vez", () => {
    const chips = siteStateChips(
      { etapa: 1, etapa_titulo: "Primeiro passo", parte_titulo: "Primeiro passo", logado: true },
      { etapa: "Etapa atual" },
    );
    expect(chips.map((c) => [c.text, c.title])).toEqual([
      ["Etapa atual: 1", "Etapa atual: 1"],
      ["Primeiro passo", "Etapa titulo: Primeiro passo"],
      ["Logado: sim", "Logado: sim"],
    ]);
  });
});

describe("sitePath", () => {
  it("só não importantes, do mais antigo ao mais novo, repetidos em sequência agrupados", () => {
    const events = [
      ev("secao_aberta", { titulo: "Planos" }, 1),
      ev("pediu_ajuda", { assunto: "Cadastro" }, 2, true),
      ev("secao_aberta", { titulo: "Ajuda" }, 3),
      ev("secao_aberta", { titulo: "Ajuda" }, 4),
      ev("botao_clicado", null, 5),
      ev("secao_aberta", { titulo: "Inicio" }, 6),
    ];
    const path = sitePath(events, {});
    expect(path.steps.map((s) => [s.text, s.count])).toEqual([
      ["Inicio", 1],
      ["Botao clicado", 1],
      ["Ajuda", 2],
      ["Planos", 1],
    ]);
    expect(path.steps[2]?.title).toBe("Secao aberta · Ajuda");
    expect(path.since).toBe(events[5]!.occurredAt);
    expect(formatSitePathSpan(path.since!, NOW)).toBe("últimos 6 min");
  });

  it("intervalo do caminho em texto curto", () => {
    expect(formatSitePathSpan(ago(0.5), NOW)).toBe("último minuto");
    expect(formatSitePathSpan(ago(90), NOW)).toBe("últimas 2 h");
    expect(formatSitePathSpan(ago(3 * 24 * 60), NOW)).toBe("últimos 3 dias");
  });

  it("atividade mais recente entre estado e eventos", () => {
    expect(latestSiteActivity(ago(5), [ev("a", null, 2)])).toBe(ago(2));
    expect(latestSiteActivity(ago(1), [ev("a", null, 2)])).toBe(ago(1));
    expect(latestSiteActivity(null, [])).toBeNull();
  });
});

describe("WebchatSitePanelView — resumo da jornada", () => {
  it("destaque aparece com N× hoje; sem importante, não aparece", () => {
    const events = [
      ev("pediu_ajuda", { assunto: "Cadastro", origem: "rodape" }, 1, true),
      ev("pediu_ajuda", { assunto: "Senha" }, 30, true),
    ];
    const { rerender } = render(<WebchatSitePanelView data={panel({ events })} now={NOW} />);
    expect(screen.getByText("Evento importante:")).toBeTruthy();
    expect(screen.getByText(/Pediu ajuda · Cadastro/)).toBeTruthy();
    expect(screen.getByText("Origem: rodape · há 1 min · 2× hoje")).toBeTruthy();

    rerender(<WebchatSitePanelView data={panel({ events: [ev("secao_aberta", null, 1)] })} now={NOW} />);
    expect(screen.queryByText("Evento importante:")).toBeNull();
  });

  it("um importante só hoje: sem N× hoje", () => {
    render(<WebchatSitePanelView data={panel({ events: [ev("pediu_ajuda", null, 1, true)] })} now={NOW} />);
    expect(screen.getByText("há 1 min")).toBeTruthy();
    expect(screen.queryByText(/× hoje/)).toBeNull();
  });

  it("chips do estado recolhidos em uma linha + N; expande e recolhe", () => {
    const state = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`campo_${i}`, `valor ${i}`]));
    render(<WebchatSitePanelView data={panel({ context: { state, updatedAt: ago(2) } })} now={NOW} />);
    expect(screen.getByText("· há 2 min")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Estado atual no site" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(WEBCHAT_PANEL_STATE_CHIPS);
    expect(within(list).getByText("valor 0").closest("li")?.getAttribute("title")).toBe("Campo 0: valor 0");
    const more = screen.getByRole("button", { name: "Mostrar mais 2 dados do site" });
    expect(more.textContent).toBe("+2");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    act(() => more.click());
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    const less = screen.getByRole("button", { name: "Mostrar menos dados do site" });
    expect(less.textContent).toBe("menos");
    expect(less.getAttribute("aria-expanded")).toBe("true");
    act(() => less.click());
    expect(within(list).getAllByRole("listitem")).toHaveLength(WEBCHAT_PANEL_STATE_CHIPS);
  });

  it("caminho: últimos 4 passos, + N anteriores à esquerda, ×N e intervalo", () => {
    const events = [
      ev("secao_aberta", { titulo: "Passo F" }, 1),
      ev("secao_aberta", { titulo: "Passo E" }, 2),
      ev("secao_aberta", { titulo: "Passo E" }, 3),
      ev("secao_aberta", { titulo: "Passo D" }, 4),
      ev("secao_aberta", { titulo: "Passo C" }, 5),
      ev("secao_aberta", { titulo: "Passo B" }, 6),
      ev("secao_aberta", { titulo: "Passo A" }, 7),
    ];
    render(<WebchatSitePanelView data={panel({ events })} now={NOW} />);
    expect(screen.getByText("· últimos 7 min")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Caminho recente no site" });
    const texts = () => within(list).getAllByRole("listitem").map((li) => li.textContent?.replace("›", ""));
    expect(texts()).toHaveLength(WEBCHAT_PANEL_PATH_STEPS);
    expect(texts()).toEqual(["Passo C", "Passo D", "Passo E×2, 2 vezes", "Passo F"]);
    const earlier = screen.getByRole("button", { name: "+2 anteriores" });
    expect(earlier.getAttribute("aria-expanded")).toBe("false");
    act(() => earlier.click());
    expect(texts()).toEqual(["Passo A", "Passo B", "Passo C", "Passo D", "Passo E×2, 2 vezes", "Passo F"]);
    expect(screen.getByRole("button", { name: "menos" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("linha do tempo completa recolhida por padrão; o botão abre e fecha", () => {
    render(<WebchatSitePanelView data={panel({ events: [ev("secao_aberta", { titulo: "Ajuda" }, 1)] })} now={NOW} />);
    expect(screen.queryByRole("list", { name: "Últimos eventos no site" })).toBeNull();
    const toggle = screen.getByRole("button", { name: /Ver linha do tempo completa/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: "Últimos eventos no site" })).toBeTruthy();
    act(() => screen.getByRole("button", { name: /Ocultar linha do tempo/ }).click());
    expect(screen.queryByRole("list", { name: "Últimos eventos no site" })).toBeNull();
  });

  it("blocos sem dados somem; nada do site, sem painel", () => {
    const { container, rerender } = render(
      <WebchatSitePanelView data={panel({ events: [ev("pediu_ajuda", null, 1, true)] })} now={NOW} />,
    );
    expect(screen.queryByText("Onde está")).toBeNull();
    expect(screen.queryByText("Caminho")).toBeNull();
    rerender(<WebchatSitePanelView data={panel({ context: { state: { secao: "Inicio" }, updatedAt: ago(1) } })} now={NOW} />);
    expect(screen.getByText("Onde está")).toBeTruthy();
    expect(screen.queryByText("Caminho")).toBeNull();
    expect(screen.queryByRole("button", { name: /linha do tempo/ })).toBeNull();
    rerender(<WebchatSitePanelView data={panel({ context: { state: {}, updatedAt: ago(1) } })} now={NOW} />);
    expect(container.innerHTML).toBe("");
  });
});
