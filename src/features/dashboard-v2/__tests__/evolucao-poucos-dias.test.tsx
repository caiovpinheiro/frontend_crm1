/** @vitest-environment jsdom */
/**
 * "Evolução diária" com 1 dia gravado (QA de produção): a barra ocupava ~60%
 * da largura do card. Agora a barra tem largura máxima e, com menos de 3 dias,
 * aparece o aviso "Série em formação — N dia(s) gravado(s)".
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const charts = vi.hoisted(() => ({ bar: [] as Record<string, unknown>[], area: 0 }));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const Empty = () => null;
  return {
    ...actual,
    // jsdom não mede: só registra as props do gráfico.
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    BarChart: (props: Record<string, unknown>) => {
      charts.bar.push(props);
      return <div data-chart="bar" />;
    },
    AreaChart: () => {
      charts.area += 1;
      return <div data-chart="area" />;
    },
    Bar: Empty,
    Area: Empty,
    Cell: Empty,
    CartesianGrid: Empty,
    XAxis: Empty,
    YAxis: Empty,
    Tooltip: Empty,
  };
});

import {
  EVOLUTION_MAX_BAR_SIZE,
  PainelDealWidget,
  evolutionFormingText,
} from "@/components/crm/dashboard/painel-deals";
import type { PainelDealsResult, PainelEvolution } from "@/features/dashboard-v2/painel-api";

const MONTH = { from: "2026-10-01T03:00:00.000Z", to: "2026-11-01T02:59:59.999Z" };
const TODAY = { from: "2026-10-12T03:00:00.000Z", to: "2026-10-13T02:59:59.999Z" };

function evolution(days: number, useBars: boolean): PainelEvolution {
  return {
    available: true,
    retentionDays: 90,
    retainedFrom: null,
    incompleteLast: false,
    useBars,
    stages: [{ id: "s1", name: "Novo", color: "#2563eb" }],
    points: Array.from({ length: days }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      incomplete: false,
      byStage: { s1: 10 + i },
    })),
  };
}

function mount(evo: PainelEvolution, period = MONTH) {
  const data = { evolution: { ok: true, data: evo } } as unknown as PainelDealsResult;
  return render(
    <PainelDealWidget id="evolution" data={data} search="" period={period} onRetry={() => {}} />,
  );
}

beforeEach(() => {
  charts.bar.length = 0;
  charts.area = 0;
});
afterEach(cleanup);

describe("Evolução diária com poucos dias", () => {
  it("1 dia num período de mês: barra com largura máxima e aviso de série em formação", () => {
    mount(evolution(1, false));
    // Mesmo com o período longo (área), 1 ponto vira barra — área com 1 ponto some.
    expect(charts.area).toBe(0);
    expect(charts.bar).toHaveLength(1);
    expect(charts.bar[0]).toMatchObject({ maxBarSize: EVOLUTION_MAX_BAR_SIZE });
    expect(EVOLUTION_MAX_BAR_SIZE).toBeLessThanOrEqual(48);
    expect(screen.getByText("Série em formação — 1 dia gravado")).toBeTruthy();
  });

  it("2 dias: aviso no plural", () => {
    mount(evolution(2, true));
    expect(screen.getByText("Série em formação — 2 dias gravados")).toBeTruthy();
  });

  it("3 dias ou mais: sem aviso; série longa segue em área", () => {
    mount(evolution(3, true));
    expect(document.querySelector("[data-evolution-forming]")).toBeNull();
    cleanup();
    mount(evolution(20, false));
    expect(charts.area).toBe(1);
    expect(document.querySelector("[data-evolution-forming]")).toBeNull();
  });

  it("no período 'Hoje', 1 dia é a série inteira: sem aviso", () => {
    mount(evolution(1, true), TODAY);
    expect(document.querySelector("[data-evolution-forming]")).toBeNull();
    expect(charts.bar[0]).toMatchObject({ maxBarSize: EVOLUTION_MAX_BAR_SIZE });
  });
});

describe("evolutionFormingText", () => {
  it("só com 1–2 dias gravados e período maior que isso", () => {
    expect(evolutionFormingText(0, MONTH)).toBeNull();
    expect(evolutionFormingText(1, MONTH)).toBe("Série em formação — 1 dia gravado");
    expect(evolutionFormingText(2)).toBe("Série em formação — 2 dias gravados");
    expect(evolutionFormingText(3, MONTH)).toBeNull();
    expect(evolutionFormingText(1, TODAY)).toBeNull();
  });
});
