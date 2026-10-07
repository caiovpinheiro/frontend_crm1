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

afterEach(cleanup);

const tokens = (cls: string) => cls.split(/\s+/);

describe("grades por largura do container", () => {
  it("o wrapper é um container", () => {
    expect(tokens(KPI_CONTAINER_CLASS)).toContain("@container");
  });

  it("'Agora': 1 coluna no celular, 2, 3 (3+1 larga) e 6 só com folga", () => {
    const t = tokens(AGORA_GRID_CLASS);
    expect(t).toContain("grid-cols-1");
    expect(t).toContain("@[440px]:grid-cols-2");
    expect(t).toContain("@[700px]:grid-cols-3");
    expect(t).toContain("@[1360px]:grid-cols-6");
    // o card largo ocupa a linha toda até caber ao lado dos outros
    expect(tokens(AGORA_WAIT_CLASS)).toEqual(["@[440px]:col-span-full", "@[1360px]:col-span-3"]);
  });

  it("cards de período: uma coluna abaixo de 420 px", () => {
    const t = tokens(PERIOD_KPI_GRID_CLASS);
    expect(t).toContain("grid-cols-1");
    expect(t).toContain("@[420px]:grid-cols-2");
    expect(t).not.toContain("grid-cols-2");
  });

  it("indicadores de Negócios (5 cards): 2 colunas, 3+2 e depois 5", () => {
    const t = tokens(DEAL_KPI_GRID_CLASS);
    expect(t).toEqual(
      expect.arrayContaining([
        "grid-cols-1",
        "@[420px]:grid-cols-2",
        "@[900px]:grid-cols-3",
        "@[1360px]:grid-cols-5",
      ]),
    );
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
    const grid = container.querySelector(`.${CSS.escape("@[420px]:grid-cols-2")}`);
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
    // o KpiStrip renderiza as duas variações (mobile e grade): ambas com o title
    const values = screen.getAllByTitle("apenas um teste qualquer de motivo muito longo");
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]!.className).toContain("line-clamp-2");
  });
});
