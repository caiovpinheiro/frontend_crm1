/** @vitest-environment jsdom */
/**
 * Auditoria de 12/10 — layout e rótulos do Dashboard (jsdom não mede CSS: os
 * testes conferem estrutura, classes e textos; a conferência visual fica no PR).
 *
 *  L4 rankings lado a lado com a mesma altura · L5 estados vazios compactos ·
 *  L7 abas no celular e alvo de toque · R1 finalizados com a quebra ·
 *  R2 "Quem tabulou" com IA · R3 "Por usuário" sem filtro · R4 plural.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { finishedCarryoverText, PainelServiceWidget } from "@/components/crm/dashboard/painel-service";
import { TeamRankingsWidget } from "@/components/crm/dashboard/painel-team";
import { TransfersWidget } from "@/components/crm/dashboard/painel-transfers";
import { SystemUsageBars } from "@/components/crm/dashboard/system-usage-bars";
import {
  TabulationByUserWidget,
  TabulationKpiWidget,
  tabulationByUserEmptyText,
} from "@/app/(app)/settings/tabulations/tabulations-dashboard";
import { formatUsageHours } from "@/features/dashboard-v2/format";
import { DASHBOARD_TOUCH_TARGET_CLASS } from "@/features/dashboard-v2/layout-classes";
import type {
  PainelServiceResult,
  PainelTeamRankRow,
  PainelTransfers,
} from "@/features/dashboard-v2/painel-api";
import {
  tabulationWhoSummary,
  tabulationWhoText,
} from "@/features/dashboard-v2/tabulation-view";
import type { TabulationAnalyticsResponse } from "@/features/dashboard-v2/use-tabulation-analytics";

afterEach(cleanup);

const rankRow = (id: string, attended: number, sample = 0): PainelTeamRankRow => ({
  id,
  name: id,
  attended,
  finished: attended,
  serviceMeanMs: sample ? 60_000 : null,
  serviceMedianMs: sample ? 60_000 : null,
  serviceSample: sample,
});

describe("L4/L5 — rankings", () => {
  it("vazios: duas linhas compactas, lado a lado e esticadas", () => {
    const { container } = render(
      <TeamRankingsWidget
        block={{ ok: true, data: { rows: [], capped: false } }}
        search=""
        filtered={false}
        clock="business"
        onRetry={() => {}}
      />,
    );
    const grid = container.querySelector("[data-team-rankings]")!;
    expect(grid.className).toContain("items-stretch");
    expect(grid.className).not.toContain("items-start");
    const compact = grid.querySelectorAll("[data-painel-empty-compact]");
    expect(compact).toHaveLength(2);
    for (const card of compact) {
      expect(card.className).toContain("min-h-14");
      expect(card.className).toContain("h-full");
      // uma linha: título + frase, sem bloco de estado vazio com padding grande
      expect(card.querySelector(".py-5")).toBeNull();
    }
    expect(screen.getByText("Ranking de atendimentos")).toBeTruthy();
    expect(screen.getByText("Ranking de tempo médio de atendimento")).toBeTruthy();
  });

  it("com dados num lado e vazio no outro: os dois esticam até a altura da linha", () => {
    const { container } = render(
      <TeamRankingsWidget
        block={{ ok: true, data: { rows: [rankRow("Ana", 3)], capped: false } }}
        search=""
        filtered={false}
        clock="business"
        onRetry={() => {}}
      />,
    );
    const cards = container.querySelector("[data-team-rankings]")!.children;
    expect(cards).toHaveLength(2);
    for (const card of cards) expect((card as HTMLElement).className).toContain("h-full");
  });
});

describe("L5 — transferências vazias", () => {
  const empty = { flows: [], total: 0, conversations: 0, empty: true };
  it("uma linha, mantendo o 'Ver por'", () => {
    const data: PainelTransfers = { people: empty, departments: empty } as PainelTransfers;
    const { container } = render(
      <TransfersWidget block={{ ok: true, data }} search="" filtered={false} onRetry={() => {}} />,
    );
    const card = container.querySelector("[data-painel-empty-compact]")!;
    expect(card.textContent).toContain("Transferências de conversas");
    expect(card.textContent).toContain("Nenhuma conversa mudou de atendente no período.");
    expect(screen.getByRole("button", { name: "Departamentos" })).toBeTruthy();
  });
});

describe("R3/L5 — Por usuário", () => {
  it("sem filtro: não fala de filtro; com filtro: a frase de antes", () => {
    expect(tabulationByUserEmptyText(false)).toBe(
      "Nenhuma tabulação feita por pessoas no período.",
    );
    expect(tabulationByUserEmptyText(true)).toContain("Nenhum usuário no filtro");
    render(<TabulationByUserWidget rows={[]} />);
    const msg = screen.getByText("Nenhuma tabulação feita por pessoas no período.");
    expect(msg.getAttribute("title")).toBe("Nenhuma tabulação feita por pessoas no período.");
    expect(msg.parentElement!.className).toContain("min-h-14");
    expect(screen.queryByText(/filtro/)).toBeNull();
  });
});

const TAB_DATA = {
  total: 16,
  page: 1,
  perPage: 25,
  distinctTabulations: 3,
  distinctUsers: 0,
  byTabulation: [],
  byUser: [],
  items: [
    {
      id: "e1",
      occurredAt: "2026-10-12T12:00:00.000Z",
      conversationId: "c1",
      contactName: null,
      actorName: null,
      actor: { kind: "ai_agent", id: "a1", name: "Bia" },
      tabulationPath: null,
      departmentName: null,
    },
  ],
} as TabulationAnalyticsResponse;

describe("R2 — Quem tabulou", () => {
  it("16 tabulações da IA e nenhuma pessoa: '0 pessoas' + '16 por IA'", () => {
    const who = tabulationWhoSummary(TAB_DATA);
    expect(who).toEqual({ people: 0, automated: 16, kinds: ["IA"] });
    expect(tabulationWhoText(who)).toEqual({ value: "0 pessoas", hint: "+ 16 por IA" });
  });

  it("pessoas e automáticas juntas; singular; ranking truncado não inventa conta", () => {
    const mixed = tabulationWhoSummary({
      total: 5,
      distinctUsers: 1,
      byUser: [{ count: 3 }],
      items: [],
    });
    expect(tabulationWhoText(mixed)).toEqual({ value: "1 pessoa", hint: "+ 2 automáticas" });
    const truncated = tabulationWhoSummary({
      total: 500,
      distinctUsers: 25,
      byUser: Array.from({ length: 20 }, () => ({ count: 10 })),
      items: [{ actor: { kind: "system", id: null, name: null } }],
    });
    expect(truncated.automated).toBeNull();
    expect(tabulationWhoText(truncated)).toEqual({ value: "25 pessoas", hint: "+ Sistema" });
    expect(tabulationWhoText({ people: 2, automated: 0, kinds: [] })).toEqual({
      value: "2 pessoas",
    });
  });

  it("o KPI troca 'Agentes que tabularam' por 'Quem tabulou' e fica em grade 2×2", () => {
    const { container } = render(<TabulationKpiWidget data={TAB_DATA} loadingValue="…" />);
    expect(screen.queryByText("Agentes que tabularam")).toBeNull();
    expect(screen.getByText("Quem tabulou")).toBeTruthy();
    expect(screen.getByText("0 pessoas")).toBeTruthy();
    expect(screen.getByText("+ 16 por IA")).toBeTruthy();
    // sem carrossel (antes o KpiStrip duplicava os cards numa faixa lateral)
    expect(container.querySelector(".toolbar-hscroll")).toBeNull();
    expect(screen.getAllByText("Quem tabulou")).toHaveLength(1);
  });
});

describe("R1 — finalizados × em aberto", () => {
  const delta = { value: 0, hidden: true };
  const volume = (carryover: number) =>
    ({
      volume: {
        ok: true,
        data: {
          started: { value: 14, delta },
          finished: { value: 6, delta },
          stillOpen: { value: 10, delta },
          openStarted: { value: 0, delta },
          openWaiting: { value: 10, delta },
          partition: {
            resolved: 4,
            open: 10,
            other: 0,
            finishedFromStarted: 6 - carryover,
            finishedCarryover: carryover,
          },
          messagesIn: 0,
          messagesOut: 0,
          byDay: [],
          empty: false,
        },
      },
    }) as unknown as PainelServiceResult;

  it("mostra quantos finalizados foram abertos antes do período, com tooltip", () => {
    const { container } = render(
      <PainelServiceWidget id="volume" data={volume(2)} search="" clock="business" onRetry={() => {}} />,
    );
    expect(screen.getByText("· 2 abertos antes do período")).toBeTruthy();
    const card = container.querySelector("[data-finished-carryover]")!;
    expect(card.getAttribute("title")).toContain("4 iniciados no período e 2 abertos antes dele");
  });

  it("sem carryover (ou backend sem partition), só o número", () => {
    expect(finishedCarryoverText(undefined)).toBeNull();
    const { container } = render(
      <PainelServiceWidget id="volume" data={volume(0)} search="" clock="business" onRetry={() => {}} />,
    );
    expect(container.querySelector("[data-finished-carryover]")).toBeNull();
    expect(finishedCarryoverText({ resolved: 0, open: 0, other: 0, finishedFromStarted: 0, finishedCarryover: 1 })?.short).toBe(
      "1 aberto antes do período",
    );
  });
});

describe("R4 — plural do uso do sistema", () => {
  it("1 usuário / 2 usuários", () => {
    const one = [{ id: "a", name: "Ana", seconds: 3600 }];
    const view = render(<SystemUsageBars rows={one} average={3600} formatValue={formatUsageHours} />);
    expect(screen.getByText("1 usuário com sessão hoje")).toBeTruthy();
    view.unmount();
    render(
      <SystemUsageBars
        rows={[...one, { id: "b", name: "Bia", seconds: 60 }]}
        average={1800}
        formatValue={formatUsageHours}
      />,
    );
    expect(screen.getByText("2 usuários com sessão hoje")).toBeTruthy();
  });
});

describe("L7 — celular", () => {
  it("alvo de toque de 40 px nos botões só em ponteiro grosso ou abaixo de md", () => {
    const t = DASHBOARD_TOUCH_TARGET_CLASS.split(/\s+/);
    expect(t).toEqual(
      expect.arrayContaining([
        "max-md:[&_button]:min-h-10",
        "pointer-coarse:[&_button]:min-h-10",
      ]),
    );
    expect(t.every((c) => c.startsWith("max-md:") || c.startsWith("pointer-coarse:"))).toBe(true);
    const page = readFileSync(join(process.cwd(), "src/app/(app)/dashboard/_v2-client.tsx"), "utf8");
    expect(page).toContain("DASHBOARD_TOUCH_TARGET_CLASS)");
  });
});
