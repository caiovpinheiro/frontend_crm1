/** @vitest-environment jsdom */
/**
 * Painel "No site agora" — resumo da jornada: situação (chaves reservadas
 * e último evento importante, com "N× hoje"), estado em chips recolhidos,
 * caminho (ordem, agrupamento, "+N anteriores") e histórico sob demanda.
 * Dados neutros.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  formatSitePathSpan,
  latestSiteActivity,
  siteHighlight,
  sitePath,
  siteStateChips,
  siteStatus,
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
      badge: "Cadastro",
      message: null,
      others: "Origem: rodape",
      occurredAt: events[1]!.occurredAt,
      todayCount: 2,
    });
  });

  it("selo numérico com rótulo; texto longo vira a mensagem e sai dos demais dados", () => {
    const events = [
      ev("pediu_ajuda", { nivel: 6, origem: "travei", mensagem: "Oi! Travei no Módulo 6 da Aula Inaugural." }, 1, true),
    ];
    expect(siteHighlight(events, { nivel: "Nível" }, NOW)).toMatchObject({
      badge: "Nível 6",
      message: "Oi! Travei no Módulo 6 da Aula Inaugural.",
      others: "Origem: travei",
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

describe("siteStatus", () => {
  it("lê selo, frase e progresso; número em texto vale; fora do intervalo, limita", () => {
    expect(
      siteStatus({ situacao: " Estudando ", resumo: "No módulo 4", progresso_atual: "4", progresso_total: 7 }),
    ).toEqual({ status: "Estudando", summary: "No módulo 4", progress: { current: 4, total: 7, label: null } });
    expect(siteStatus({ progresso_atual: 9, progresso_total: 7 }).progress).toEqual({ current: 7, total: 7, label: null });
  });

  it("sem total válido, sem progresso; vazio, tudo null", () => {
    expect(siteStatus({ progresso_atual: 3 }).progress).toBeNull();
    expect(siteStatus({ progresso_atual: 3, progresso_total: 0 }).progress).toBeNull();
    expect(siteStatus({ progresso_atual: "três", progresso_total: 7 }).progress).toBeNull();
    expect(siteStatus({})).toEqual({ status: null, summary: null, progress: null });
  });

  it("chaves reservadas não viram chips", () => {
    const chips = siteStateChips({ situacao: "Estudando", resumo: "x", progresso_atual: 1, tela: "Início" }, {});
    expect(chips.map((c) => c.key)).toEqual(["tela"]);
  });
});

describe("WebchatSitePanelView — resumo da jornada", () => {
  it("situação sem chaves reservadas: título do importante + selo, mensagem entre aspas; o clique abre os demais dados", () => {
    const events = [
      ev(
        "pediu_ajuda",
        { nivel: 6, origem: "rodape", mensagem: "Oi! Travei no Módulo 6 da Aula Inaugural." },
        1,
        true,
      ),
      ev("pediu_ajuda", { nivel: 2 }, 30, true),
    ];
    const { rerender } = render(<WebchatSitePanelView data={panel({ events })} now={NOW} />);
    const title = screen.getByText("Evento importante:").parentElement!;
    expect(title.textContent).toBe("Evento importante: Pediu ajuda");
    expect(within(title.parentElement!).getByText("Nivel 6")).toBeTruthy();
    // Mensagem visível já fechado (duas linhas); demais dados só no clique.
    const quote = screen.getByRole("button", { name: /Oi! Travei no Módulo 6/ });
    expect(quote.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Origem: rodape/)).toBeNull();
    act(() => quote.click());
    expect(quote.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Origem: rodape · 2× hoje")).toBeTruthy();
    act(() => quote.click());
    expect(screen.queryByText(/Origem: rodape/)).toBeNull();
    // Histórico recolhido em "Ver o que fez no site", sem repetir o destaque.
    expect(screen.queryByRole("list", { name: "Últimos eventos no site" })).toBeNull();
    act(() => screen.getByRole("button", { name: "Ver o que fez no site (1)" }).click());
    const history = within(screen.getByRole("list", { name: "Últimos eventos no site" }));
    expect(history.getAllByRole("listitem")).toHaveLength(1);
    expect(history.getByText("há 30 min")).toBeTruthy();

    rerender(<WebchatSitePanelView data={panel({ events: [ev("secao_aberta", null, 1)] })} now={NOW} />);
    expect(screen.queryByText("Evento importante:")).toBeNull();
  });

  it("um importante só hoje: sem N× hoje; sem mensagem nem dados extras, nada a abrir", () => {
    render(<WebchatSitePanelView data={panel({ events: [ev("pediu_ajuda", { assunto: "Senha" }, 1, true)] })} now={NOW} />);
    expect(screen.getByText("Evento importante:")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ver detalhes/ })).toBeNull();
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

  it("caminho (intervalo no tooltip): últimos 4 passos, + N anteriores à esquerda e ×N", () => {
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
    // Só atividade (sem situação nem localização): "Ver o que fez no site" já abre.
    expect(screen.getByRole("button", { name: "Ocultar o que fez no site" })).toBeTruthy();
    expect(screen.getByText("Caminho").getAttribute("title")).toBe("últimos 7 min");
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

  it("histórico aparece direto, sem botão para abrir", () => {
    render(<WebchatSitePanelView data={panel({ events: [ev("secao_aberta", { titulo: "Ajuda" }, 1)] })} now={NOW} />);
    expect(screen.getByText("Histórico")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Últimos eventos no site" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /linha do tempo/ })).toBeNull();
  });

  it("chaves reservadas: selo, frase no lugar do título, barra de progresso; fora dos chips", () => {
    const state = {
      situacao: "Precisa de ajuda",
      resumo: "Travou no Módulo 6 da Aula Inaugural",
      progresso_atual: "6",
      progresso_total: 7,
      progresso_rotulo: "Aula Inaugural",
      tela: "Aula Inaugural",
    };
    const events = [ev("pedido_ajuda", { nivel: 6, mensagem: "Oi! Travei no Módulo 6, pode me ajudar?" }, 1, true)];
    render(<WebchatSitePanelView data={panel({ context: { state, updatedAt: ago(1) }, events })} now={NOW} />);
    expect(screen.getByText("Precisa de ajuda")).toBeTruthy();
    const title = screen.getByText("Evento importante:").parentElement!;
    expect(title.textContent).toBe("Evento importante: Travou no Módulo 6 da Aula Inaugural");
    expect(screen.queryByText("Pedido ajuda")).toBeNull();
    expect(screen.getByRole("button", { name: /Oi! Travei no Módulo 6, pode me ajudar/ })).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Aula Inaugural" });
    expect(bar.getAttribute("aria-valuenow")).toBe("6");
    expect(bar.getAttribute("aria-valuemax")).toBe("7");
    expect(screen.getByText("6 de 7")).toBeTruthy();
    const chips = within(screen.getByRole("list", { name: "Estado atual no site" }));
    expect(chips.getAllByRole("listitem")).toHaveLength(1);
    expect(chips.getByText("Aula Inaugural")).toBeTruthy();
  });

  it("só situação (sem evento importante): cartão neutro com selo e frase", () => {
    const state = { situacao: "Estudando", resumo: "Está no Módulo 4 da Aula Inaugural" };
    render(<WebchatSitePanelView data={panel({ context: { state, updatedAt: ago(1) } })} now={NOW} />);
    expect(screen.getByText("Estudando")).toBeTruthy();
    expect(screen.getByText("Está no Módulo 4 da Aula Inaugural")).toBeTruthy();
    expect(screen.queryByText("Evento importante:")).toBeNull();
    expect(screen.queryByRole("list", { name: "Estado atual no site" })).toBeNull();
  });

  it("blocos sem dados somem; nada do site, sem painel", () => {
    const { container, rerender } = render(
      <WebchatSitePanelView data={panel({ events: [ev("pediu_ajuda", null, 1, true)] })} now={NOW} />,
    );
    expect(screen.queryByText("Última localização")).toBeNull();
    expect(screen.queryByText("Caminho recente")).toBeNull();
    rerender(<WebchatSitePanelView data={panel({ context: { state: { secao: "Inicio" }, updatedAt: ago(1) } })} now={NOW} />);
    expect(screen.getByText("Última localização")).toBeTruthy();
    expect(screen.queryByText("Caminho recente")).toBeNull();
    expect(screen.queryByText("Histórico")).toBeNull();
    rerender(<WebchatSitePanelView data={panel({ context: { state: {}, updatedAt: ago(1) } })} now={NOW} />);
    expect(container.innerHTML).toBe("");
  });
});
