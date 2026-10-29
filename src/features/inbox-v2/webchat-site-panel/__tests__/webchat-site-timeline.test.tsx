/** @vitest-environment jsdom */
/**
 * Painel "No site agora" — apresentação: chave legível e rótulo da config,
 * detalhe principal, agrupamento de eventos repetidos, destaque de
 * importante e linha do tempo completa com "ver mais". Dados neutros.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  humanizeSiteKey,
  siteKeyLabel,
  WEBCHAT_PANEL_TIMELINE_ROWS,
  type WebchatPanelEvent,
} from "@/features/inbox-v2/webchat-site-panel/model";
import {
  describeSiteEvent,
  groupSiteEvents,
  otherDetailsText,
  primaryDetailText,
} from "@/features/inbox-v2/webchat-site-panel/timeline";
import { SiteTimeline } from "@/features/inbox-v2/webchat-site-panel/site-timeline";

const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

let seq = 0;
function ev(name: string, data: WebchatPanelEvent["data"], minAgo: number, important = false): WebchatPanelEvent {
  seq += 1;
  return { id: `e${seq}`, name, data, important, occurredAt: iso(minAgo * 60_000) };
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

describe("SiteTimeline (linha do tempo completa)", () => {
  it("agrupa com ×N, destaca importante e mostra principal + demais dados", () => {
    const events = [
      ev("pediu_ajuda", { assunto: "Cadastro", origem: "rodape" }, 1, true),
      ev("secao_aberta", { titulo: "Ajuda", caminho: "/ajuda" }, 2),
      ev("secao_aberta", { titulo: "Ajuda", caminho: "/ajuda" }, 3),
      ev("secao_aberta", { titulo: "Ajuda", caminho: "/ajuda" }, 4),
    ];
    render(<SiteTimeline events={events} labels={{}} now={NOW} />);
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
    render(<SiteTimeline events={events} labels={{}} now={NOW} />);
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
    render(<SiteTimeline events={events} labels={{}} now={NOW} />);
    expect(screen.getByText("×8")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ver mais/ })).toBeNull();
  });
});
