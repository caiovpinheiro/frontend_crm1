/** @vitest-environment jsdom */
/**
 * Painel "No site agora" — apresentação: chave legível e rótulo da config,
 * detalhe principal, agrupamento de eventos repetidos, destaque de
 * importante, grade do estado com "ver tudo" e linha do tempo com
 * "ver mais". Dados neutros.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  humanizeSiteKey,
  siteKeyLabel,
  WEBCHAT_PANEL_STATE_KEYS,
  WEBCHAT_PANEL_TIMELINE_ROWS,
  type WebchatPanelEvent,
  type WebchatSitePanelData,
} from "@/features/inbox-v2/webchat-site-panel/model";
import {
  describeSiteEvent,
  groupSiteEvents,
  otherDetailsText,
  primaryDetailText,
} from "@/features/inbox-v2/webchat-site-panel/timeline";
import { WebchatSitePanelView } from "@/features/inbox-v2/webchat-site-panel";

const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

let seq = 0;
function ev(name: string, data: WebchatPanelEvent["data"], minAgo: number, important = false): WebchatPanelEvent {
  seq += 1;
  return { id: `e${seq}`, name, data, important, occurredAt: iso(minAgo * 60_000) };
}

function panel(over: Partial<WebchatSitePanelData> = {}): WebchatSitePanelData {
  return {
    available: true,
    contactId: "ct-1",
    channelId: "ch-1",
    labels: {},
    context: null,
    events: [],
    ...over,
  };
}

afterEach(() => {
  cleanup();
});

describe("humanizeSiteKey / siteKeyLabel", () => {
  it("snake, kebab e camelCase viram texto com a primeira maiúscula", () => {
    expect(humanizeSiteKey("secao_atual")).toBe("Secao atual");
    expect(humanizeSiteKey("tela-aberta")).toBe("Tela aberta");
    expect(humanizeSiteKey("pageView")).toBe("Page view");
    expect(humanizeSiteKey("pageURL")).toBe("Page URL");
    expect(humanizeSiteKey("passo2_ok")).toBe("Passo2 ok");
    expect(humanizeSiteKey("__x__")).toBe("X");
  });

  it("rótulo da config tem precedência; vazio ou herdado do protótipo não conta", () => {
    expect(siteKeyLabel("etapa", { etapa: "Etapa atual" })).toBe("Etapa atual");
    expect(siteKeyLabel("etapa", { etapa: "   " })).toBe("Etapa");
    expect(siteKeyLabel("toString", {})).toBe("To string");
  });
});

describe("describeSiteEvent", () => {
  it("título legível (ou rótulo), principal = primeiro valor, demais com rótulo e sem texto repetido", () => {
    const view = describeSiteEvent(
      {
        name: "secao_aberta",
        data: { titulo: "Ajuda", caminho: "/ajuda", grupo: "Ajuda", passo: 1, etapa: 1 },
      },
      { caminho: "Endereço" },
    );
    expect(view.title).toBe("Secao aberta");
    expect(view.primary && primaryDetailText(view.primary)).toBe("Ajuda");
    expect(otherDetailsText(view.others)).toBe("Endereço: /ajuda · Passo: 1 · Etapa: 1");
    expect(describeSiteEvent({ name: "x", data: null }, { x: "Evento X" })).toEqual({
      title: "Evento X",
      primary: null,
      others: [],
    });
  });

  it("principal numérico ou booleano leva o rótulo", () => {
    const view = describeSiteEvent({ name: "passo", data: { etapa: 3 } }, {});
    expect(view.primary && primaryDetailText(view.primary)).toBe("Etapa: 3");
    const flag = describeSiteEvent({ name: "passo", data: { ok: true } }, {});
    expect(flag.primary && primaryDetailText(flag.primary)).toBe("Ok: sim");
  });
});

describe("groupSiteEvents", () => {
  it("agrupa só repetidos em sequência com o mesmo nome e principal; horário do mais recente", () => {
    const events = [
      ev("secao_aberta", { titulo: "Ajuda" }, 1),
      ev("secao_aberta", { titulo: "Ajuda" }, 2),
      ev("secao_aberta", { titulo: "Ajuda" }, 3),
      ev("secao_aberta", { titulo: "Inicio" }, 4),
      ev("botao_clicado", null, 5),
      ev("secao_aberta", { titulo: "Ajuda" }, 6),
    ];
    const rows = groupSiteEvents(events, {});
    expect(rows.map((r) => [r.title, r.primary?.value ?? null, r.count])).toEqual([
      ["Secao aberta", "Ajuda", 3],
      ["Secao aberta", "Inicio", 1],
      ["Botao clicado", null, 1],
      ["Secao aberta", "Ajuda", 1],
    ]);
    expect(rows[0]?.id).toBe(events[0]?.id);
    expect(rows[0]?.occurredAt).toBe(events[0]?.occurredAt);
  });

  it("grupo é importante se algum evento dele for", () => {
    const rows = groupSiteEvents([ev("alerta", null, 1), ev("alerta", null, 2, true)], {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ count: 2, important: true });
  });
});

describe("WebchatSitePanelView — cartão Agora", () => {
  it("grade rótulo → valor com valor cortado e title; ver tudo depois de 6 chaves", () => {
    const state = Object.fromEntries(
      Array.from({ length: WEBCHAT_PANEL_STATE_KEYS + 2 }, (_, i) => [`campo_${i}`, `valor ${i}`]),
    );
    state.campo_0 = "um valor de texto bem longo que não cabe na coluna";
    render(
      <WebchatSitePanelView
        data={panel({ labels: { campo_1: "Rótulo um" }, context: { state, updatedAt: iso(120_000) } })}
        now={NOW}
      />,
    );
    expect(screen.getByText("· atualizado há 2 min")).toBeTruthy();
    const grid = screen.getByLabelText("Estado atual no site");
    expect(grid.tagName).toBe("DL");
    expect(within(grid).getByText("Campo 0")).toBeTruthy();
    expect(within(grid).getByText("Rótulo um")).toBeTruthy();
    const long = within(grid).getByText("um valor de texto bem longo que não cabe na coluna");
    expect(long.getAttribute("title")).toBe("um valor de texto bem longo que não cabe na coluna");
    expect(long.className).toContain("truncate");
    expect(within(grid).getAllByRole("term")).toHaveLength(WEBCHAT_PANEL_STATE_KEYS);
    expect(within(grid).queryByText("Campo 7")).toBeNull();

    const more = screen.getByRole("button", { name: "ver tudo (+2)" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    act(() => more.click());
    expect(within(grid).getAllByRole("term")).toHaveLength(WEBCHAT_PANEL_STATE_KEYS + 2);
    expect(within(grid).getByText("Campo 7")).toBeTruthy();
    act(() => screen.getByRole("button", { name: "ver menos" }).click());
    expect(within(grid).getAllByRole("term")).toHaveLength(WEBCHAT_PANEL_STATE_KEYS);
  });

  it("sem estado: não há cartão nem 'atualizado', só a linha do tempo", () => {
    render(<WebchatSitePanelView data={panel({ events: [ev("botao_clicado", null, 1)] })} now={NOW} />);
    expect(screen.queryByLabelText("Estado atual no site")).toBeNull();
    expect(screen.queryByText(/atualizado/)).toBeNull();
    expect(screen.getByText("Botao clicado")).toBeTruthy();
  });

  it("até 6 chaves: sem botão ver tudo", () => {
    render(
      <WebchatSitePanelView
        data={panel({ context: { state: { etapa: 1, secao: "Inicio" }, updatedAt: iso(0) } })}
        now={NOW}
      />,
    );
    expect(screen.queryByRole("button", { name: /ver tudo/ })).toBeNull();
    expect(screen.getByText("· atualizado agora")).toBeTruthy();
  });
});

describe("WebchatSitePanelView — linha do tempo", () => {
  it("agrupa com ×N, destaca importante e mostra principal + demais dados", () => {
    const events = [
      ev("pediu_ajuda", { assunto: "Cadastro", origem: "rodape" }, 1, true),
      ev("secao_aberta", { titulo: "Ajuda", caminho: "/ajuda" }, 2),
      ev("secao_aberta", { titulo: "Ajuda", caminho: "/ajuda" }, 3),
      ev("secao_aberta", { titulo: "Ajuda", caminho: "/ajuda" }, 4),
    ];
    render(<WebchatSitePanelView data={panel({ events })} now={NOW} />);
    const list = screen.getByRole("list", { name: "Últimos eventos no site" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    const important = items[0]!;
    expect(within(important).getByText("Pediu ajuda")).toBeTruthy();
    expect(within(important).getByText("importante")).toBeTruthy();
    expect(within(important).getByText("Cadastro")).toBeTruthy();
    expect(within(important).getByText("Origem: rodape")).toBeTruthy();
    expect(within(important).getByText("há 1 min")).toBeTruthy();
    expect(important.querySelector(".bg-warning-soft")).not.toBeNull();
    expect(important.querySelector("svg")).not.toBeNull();

    const grouped = items[1]!;
    expect(within(grouped).getByText("Secao aberta")).toBeTruthy();
    expect(within(grouped).getByText("×3")).toBeTruthy();
    expect(within(grouped).getByText(", 3 vezes")).toBeTruthy();
    expect(within(grouped).getByText("há 2 min")).toBeTruthy();
    expect(within(grouped).getByText("Caminho: /ajuda")).toBeTruthy();
    expect(within(grouped).queryByText("importante")).toBeNull();
    expect(grouped.querySelector(".bg-warning-soft")).toBeNull();
  });

  it("mostra 5 linhas e 'ver mais' até as 10 recebidas", () => {
    const events = Array.from({ length: 10 }, (_, i) => ev(`evento_${i}`, null, i + 1));
    render(<WebchatSitePanelView data={panel({ events })} now={NOW} />);
    const list = screen.getByRole("list", { name: "Últimos eventos no site" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(WEBCHAT_PANEL_TIMELINE_ROWS);
    const more = screen.getByRole("button", { name: "ver mais (+5)" });
    act(() => more.click());
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(within(list).getByText("Evento 9")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ver menos" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("até 5 linhas depois de agrupar: sem 'ver mais'", () => {
    const events = Array.from({ length: 8 }, (_, i) => ev("secao_aberta", { titulo: "Ajuda" }, i + 1));
    render(<WebchatSitePanelView data={panel({ events })} now={NOW} />);
    expect(screen.getByText("×8")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ver mais/ })).toBeNull();
  });
});
