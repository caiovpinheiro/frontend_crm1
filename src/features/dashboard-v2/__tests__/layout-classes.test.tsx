/** @vitest-environment jsdom */
/**
 * D7 — cortes de texto. jsdom não mede CSS: conferimos os tokens das grades por
 * largura de container, o `title`/`line-clamp` dos textos truncados e os wrappers
 * `@container`. A conferência visual (375/768/1.099/1.280) está descrita no PR.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import { KpiCard } from "@/components/crm/kpi-card";
import { PainelAgoraWidget, PainelServiceWidget } from "@/components/crm/dashboard/painel-service";
import { TabulationKpiWidget } from "@/app/(app)/settings/tabulations/tabulations-dashboard";
import {
  AGORA_GRID_CLASS,
  AGORA_WAIT_CLASS,
  DEAL_KPI_GRID_CLASS,
  EXCEPTIONS_GRID_CLASS,
  KPI_CONTAINER_CLASS,
  PERIOD_KPI_GRID_CLASS,
  TABULATION_KPI_GRID_CLASS,
} from "@/features/dashboard-v2/layout-classes";
import type { PainelAgora, PainelServiceResult } from "@/features/dashboard-v2/painel-api";
import type { TabulationAnalyticsResponse } from "@/features/dashboard-v2/use-tabulation-analytics";
import { cn } from "@/lib/utils";

afterEach(cleanup);

const tokens = (cls: string) => cls.split(/\s+/);

describe("grades por largura do container", () => {
  it("o wrapper é um container", () => {
    expect(tokens(KPI_CONTAINER_CLASS)).toContain("@container");
  });

  it("'Agora': 3 cards na linha (1 / 2 / 3 colunas) e a espera embaixo, largura toda", () => {
    const t = tokens(AGORA_GRID_CLASS);
    expect(t).toContain("grid-cols-1");
    expect(t).toContain("@[440px]:grid-cols-2");
    expect(t).toContain("@[700px]:grid-cols-3");
    expect(t.some((c) => c.includes("grid-cols-6"))).toBe(false);
    expect(tokens(AGORA_WAIT_CLASS)).toEqual(["col-span-full"]);
  });

  it("'Agora': ordem aguardando → em atendimento → atendentes → maior espera", () => {
    const agora: PainelAgora = {
      asOf: "2026-10-07T13:00:00.000Z",
      awaitingReply: 1,
      inService: 2,
      longestWait: {
        ms: 0,
        contactName: null,
        agentName: null,
        conversationId: null,
        overSla: false,
        slaMinutes: 60,
      },
      agents: { online: 3, total: 18 },
    };
    const { container } = render(
      <PainelAgoraWidget data={agora} error={null} clock="business" onRetry={() => {}} />,
    );
    const grid = container.querySelector(`.${CSS.escape("@[700px]:grid-cols-3")}`)!;
    const cells = [...grid.children].map((el) => el.textContent ?? "");
    expect(cells).toHaveLength(4);
    expect(cells[0]).toContain("Aguardando resposta");
    expect(cells[1]).toContain("Em atendimento");
    expect(cells[2]).toContain("Atendentes disponíveis");
    expect(cells[3]).toContain("Maior espera atual");
    expect((grid.children[3] as HTMLElement).className).toContain("col-span-full");
  });

  it("cards de período e de tabulações: 2×2 no celular, 4 com folga", () => {
    for (const cls of [PERIOD_KPI_GRID_CLASS, TABULATION_KPI_GRID_CLASS]) {
      const t = tokens(cls);
      expect(t).toContain("grid-cols-2");
      expect(t).not.toContain("grid-cols-1");
      expect(t).toContain("@[1000px]:grid-cols-4");
    }
  });

  it("indicadores de Negócios (5 cards): 2 colunas no celular, 3+2 e depois 5", () => {
    const t = tokens(DEAL_KPI_GRID_CLASS);
    expect(t).toEqual(
      expect.arrayContaining([
        "grid-cols-2",
        "@[600px]:grid-cols-3",
        "@[1360px]:grid-cols-5",
      ]),
    );
    expect(t).not.toContain("grid-cols-1");
  });

  it("exceções e tabulações quebram por container, não por janela", () => {
    for (const cls of [EXCEPTIONS_GRID_CLASS, TABULATION_KPI_GRID_CLASS]) {
      expect(cls).toContain("@[1000px]:grid-cols-4");
      expect(cls).not.toMatch(/(^|\s)(sm|md|lg|xl):/);
    }
  });

  it("'Agora' e o Volume renderizam dentro de um container", () => {
    const agora: PainelAgora = {
      asOf: "2026-10-07T13:00:00.000Z",
      awaitingReply: 0,
      inService: 0,
      longestWait: {
        ms: 0,
        contactName: "Fulano de Tal com um nome bem longo",
        agentName: "Atendente",
        conversationId: null,
        overSla: false,
        slaMinutes: 60,
      },
      agents: { online: 3, total: 18 },
    };
    const { container } = render(
      <PainelAgoraWidget data={agora} error={null} clock="business" onRetry={() => {}} />,
    );
    const grid = container.querySelector(`.${CSS.escape("@[700px]:grid-cols-3")}`);
    expect(grid?.parentElement?.className).toContain("@container");
    // texto truncado com nome completo no title
    expect(
      screen.getByTitle("Fulano de Tal com um nome bem longo · Atendente"),
    ).toBeTruthy();
  });

  it("os 4 cards do Volume ficam em grade de container", () => {
    const delta = { value: 0, hidden: true };
    const data = {
      volume: {
        ok: true,
        data: {
          started: { value: 1, delta },
          finished: { value: 1, delta },
          stillOpen: { value: 1, delta },
          openStarted: { value: 1, delta },
          openWaiting: { value: 1, delta },
          messagesIn: 0,
          messagesOut: 0,
          byDay: [],
          empty: false,
        },
      },
    } as unknown as PainelServiceResult;
    const { container } = render(
      <PainelServiceWidget id="volume" data={data} search="" clock="business" onRetry={() => {}} />,
    );
    const grid = container.querySelector(`.${CSS.escape("@[1000px]:grid-cols-4")}`);
    expect(grid?.parentElement?.className).toContain("@container");
  });
});

describe("textos truncados", () => {
  it("KpiCard: rótulo em até 2 linhas e valor com title", () => {
    render(
      <KpiCard
        icon={<span />}
        label="Fechamento previsto vencido"
        value="1.234"
        compact
      />,
    );
    const label = screen.getByText("Fechamento previsto vencido");
    expect(label.className).toContain("line-clamp-2");
    expect(label.getAttribute("title")).toBe("Fechamento previsto vencido");
    expect(screen.getByTitle("1.234")).toBeTruthy();
  });

  it("KpiCard com wrapValue: nome completo em até 2 linhas e hint embaixo", () => {
    render(
      <KpiCard
        icon={<span />}
        label="Top motivo"
        wrapValue
        value="apenas um teste qualquer de motivo muito longo"
        hint="3× · Suporte"
      />,
    );
    const value = screen.getByText("apenas um teste qualquer de motivo muito longo");
    expect(value.className).toContain("line-clamp-2");
    expect(value.getAttribute("title")).toBe("apenas um teste qualquer de motivo muito longo");
    expect(screen.getByText("3× · Suporte").className).toContain("block");
  });

  it("'Top motivo' das tabulações usa o nome completo em 2 linhas", () => {
    const data = {
      total: 1,
      page: 1,
      perPage: 25,
      distinctTabulations: 1,
      distinctUsers: 1,
      byTabulation: [
        {
          tabulationId: "t1",
          name: "apenas um teste qualquer de motivo muito longo",
          path: "Suporte › teste",
          departmentId: "d1",
          departmentName: "Suporte",
          count: 3,
        },
      ],
      byUser: [],
      items: [],
    } as unknown as TabulationAnalyticsResponse;
    render(<TabulationKpiWidget data={data} loadingValue="…" />);
    const values = screen.getAllByTitle("apenas um teste qualquer de motivo muito longo");
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]!.className).toContain("line-clamp-2");
  });
});

/**
 * Sem card órfão: simula o auto-placement da grade (linha a linha) com as
 * regras de `col-span` ativas em cada largura de container. jsdom não aplica
 * container queries, então a faixa vem do prefixo `@[min]:@max-[max]:` e o
 * seletor da regra é conferido com `Element.matches`.
 */
const RULE = /^(?:@\[(\d+)px\]:)?(?:@max-\[(\d+)px\]:)?\[&>(.+)\]:col-span-(\d+)$/;
const COLS = /^(?:@\[(\d+)px\]:)?grid-cols-(\d+)$/;

function columnsAt(cls: string, width: number): number {
  let best = { min: -1, cols: 1 };
  for (const t of tokens(cls)) {
    const m = COLS.exec(t);
    if (!m) continue;
    const min = m[1] ? Number(m[1]) : 0;
    if (width >= min && min > best.min) best = { min, cols: Number(m[2]) };
  }
  return best.cols;
}

/** Linhas da grade: soma dos spans de cada linha. */
function rowsAt(cls: string, width: number, count: number, ownSpan: Record<number, "full"> = {}) {
  const cols = columnsAt(cls, width);
  const parent = document.createElement("div");
  for (let i = 0; i < count; i++) parent.appendChild(document.createElement("div"));
  const rules = tokens(cls).flatMap((t) => {
    const m = RULE.exec(t);
    if (!m) return [];
    const min = m[1] ? Number(m[1]) : 0;
    const max = m[2] ? Number(m[2]) : Infinity;
    return width >= min && width < max ? [{ selector: m[3]!, span: Number(m[4]) }] : [];
  });
  const rows: number[] = [];
  let used = cols; // força a 1ª linha
  [...parent.children].forEach((child, i) => {
    const rule = rules.find((r) => child.matches(r.selector));
    const span = Math.min(cols, ownSpan[i] === "full" ? cols : (rule?.span ?? 1));
    if (used + span > cols) {
      rows.push(0);
      used = 0;
    }
    rows[rows.length - 1]! += span;
    used += span;
  });
  return { cols, rows };
}

describe("sem card órfão na última linha", () => {
  const WIDTHS = [320, 343, 420, 500, 600, 700, 899, 900, 1000, 1100, 1359, 1360, 1500];

  it("indicadores de Negócios (5): toda linha fecha em qualquer largura", () => {
    for (const width of WIDTHS) {
      const { cols, rows } = rowsAt(DEAL_KPI_GRID_CLASS, width, 5);
      expect(rows.every((r) => r === cols), `${width}px → ${rows.join("+")} de ${cols}`).toBe(true);
    }
    // 1.075 px de janela (container < 900): era 2+2+1 com meia linha vazia.
    expect(rowsAt(DEAL_KPI_GRID_CLASS, 500, 5)).toEqual({ cols: 2, rows: [2, 2, 2] });
    expect(rowsAt(DEAL_KPI_GRID_CLASS, 800, 5)).toEqual({ cols: 3, rows: [3, 3] });
    expect(rowsAt(DEAL_KPI_GRID_CLASS, 1400, 5)).toEqual({ cols: 5, rows: [5] });
  });

  it("qualquer quantidade de cards (1–9) fecha as linhas nas grades de KPIs", () => {
    for (const cls of [DEAL_KPI_GRID_CLASS, EXCEPTIONS_GRID_CLASS]) {
      for (const width of WIDTHS) {
        for (let count = 1; count <= 9; count++) {
          const { cols, rows } = rowsAt(cls, width, count);
          expect(
            rows.every((r) => r === cols),
            `${width}px, ${count} cards → ${rows.join("+")} de ${cols}`,
          ).toBe(true);
        }
      }
    }
  });

  it("'Agora' em 2 colunas: 'Atendentes' ocupa a linha toda em vez de ficar sozinho", () => {
    for (const width of [320, 440, 600, 699, 700, 1000]) {
      const { cols, rows } = rowsAt(AGORA_GRID_CLASS, width, 4, { 3: "full" });
      expect(rows.every((r) => r === cols), `${width}px → ${rows.join("+")}`).toBe(true);
    }
    expect(rowsAt(AGORA_GRID_CLASS, 500, 4, { 3: "full" }).rows).toEqual([2, 2, 2]);
    expect(rowsAt(AGORA_GRID_CLASS, 800, 4, { 3: "full" }).rows).toEqual([3, 3]);
  });

  it("cn(...) (tailwind-merge) não descarta as regras de preenchimento", () => {
    const merged = tokens(cn(EXCEPTIONS_GRID_CLASS, "gap-3"));
    for (const t of tokens(EXCEPTIONS_GRID_CLASS).filter((x) => RULE.test(x))) {
      expect(merged).toContain(t);
    }
    expect(merged).toContain("gap-3");
    expect(merged).not.toContain("gap-1.5");
  });
});
