/** @vitest-environment jsdom */
/**
 * D2 — relógio comercial/corrido global: o controle sai de dentro do card de
 * ranking e fica no cabeçalho; os cards que dependem dele mostram o rótulo.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClockToggle } from "@/components/crm/dashboard/clock-toggle";
import { PainelAgoraWidget, PainelServiceWidget } from "@/components/crm/dashboard/painel-service";
import { TeamRankingsWidget } from "@/components/crm/dashboard/painel-team";
import { clockLabel, type DashboardClock } from "@/features/dashboard-v2/clock-label";
import type {
  PainelAgora,
  PainelServiceResult,
  PainelTeamRanking,
} from "@/features/dashboard-v2/painel-api";

afterEach(cleanup);

const AGORA: PainelAgora = {
  asOf: "2026-10-07T13:00:00.000Z",
  awaitingReply: 4,
  inService: 2,
  longestWait: {
    ms: 3_600_000,
    contactName: "Cliente",
    agentName: null,
    conversationId: null,
    overSla: false,
    slaMinutes: 60,
  },
  agents: { online: 3, total: 18 },
};

const OMITTED = { ok: false, error: "omitido" } as const;

const SERVICE = {
  agora: OMITTED,
  volume: OMITTED,
  heatmap: OMITTED,
  connections: OMITTED,
  exceptions: OMITTED,
  tempo: {
    ok: true,
    data: {
      clock: "business",
      firstResponse: { medianMs: 60_000, meanMs: 90_000, sample: 5 },
      subsequent: { medianMs: 60_000, meanMs: 90_000, sample: 5 },
      untilClose: { medianMs: 60_000, meanMs: 90_000, sample: 5 },
      timeToStart: { medianMs: 60_000, meanMs: 90_000, sample: 5 },
      responseByDay: [],
      startByDay: [],
      empty: false,
    },
  },
  byDepartment: {
    ok: true,
    data: {
      series: [],
      points: [],
      summaries: [],
      table: [
        {
          key: "d1",
          label: "Suporte",
          started: 3,
          finished: 2,
          stillOpen: 1,
          responseMeanMs: 1000,
          startMeanMs: 1000,
          serviceMeanMs: 1000,
        },
      ],
      empty: false,
      useBars: false,
    },
  },
  attendants: {
    ok: true,
    data: {
      attribution: "Atribuição pelo responsável",
      rows: [
        {
          id: "u1",
          name: "Ana",
          attended: 3,
          finished: 2,
          firstResponseMedianMs: 1,
          closeMedianMs: 1,
          stillOpen: 1,
          responseMeanMs: 1000,
          startMeanMs: 1000,
          serviceMeanMs: 1000,
        },
      ],
    },
  },
  channels: {
    ok: true,
    data: {
      channels: [{ key: "wa", label: "WhatsApp", count: 3, firstResponseMedianMs: 1000 }],
      motivos: [],
    },
  },
} as unknown as PainelServiceResult;

const RANKING: PainelTeamRanking = {
  capped: false,
  rows: [
    {
      id: "u1",
      name: "Ana",
      attended: 10,
      finished: 8,
      serviceMeanMs: 60_000,
      serviceMedianMs: 50_000,
      serviceSample: 8,
    },
  ],
};

function allCards(clock: DashboardClock) {
  return render(
    <div>
      <PainelAgoraWidget data={AGORA} error={null} clock={clock} onRetry={() => {}} />
      {(["tempo", "attendants", "channels"] as const).map((id) => (
        <PainelServiceWidget
          key={id}
          id={id}
          data={SERVICE}
          search=""
          clock={clock}
          onRetry={() => {}}
        />
      ))}
      <TeamRankingsWidget
        block={{ ok: true, data: RANKING }}
        search=""
        filtered={false}
        clock={clock}
        onRetry={() => {}}
      />
    </div>,
  );
}

describe("relógio global", () => {
  it("os rótulos dos cards afetados acompanham o relógio", () => {
    const view = allCards("business");
    // Agora, Tempo de resposta, Departamentos, Atendentes, Por canal, Ranking de TMA.
    expect(screen.getAllByText(/relógio comercial/)).toHaveLength(7);
    expect(screen.queryAllByText(/relógio corrido/)).toHaveLength(0);

    view.rerender(<div />);
    cleanup();
    allCards("elapsed");
    expect(screen.getAllByText(/relógio corrido/)).toHaveLength(7);
    expect(screen.queryAllByText(/relógio comercial/)).toHaveLength(0);
  });

  it("o card 'Agora' indica o relógio", () => {
    render(<PainelAgoraWidget data={AGORA} error={null} clock="elapsed" onRetry={() => {}} />);
    expect(screen.getByText(/atualizado às .* · relógio corrido/)).toBeTruthy();
  });

  it("não há mais seletor de relógio dentro dos cards", () => {
    allCards("business");
    expect(screen.queryByRole("button", { name: "Corrido" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Comercial" })).toBeNull();
    // A ordem do ranking (Rápidos/Lentos) continua no card.
    expect(screen.getByRole("button", { name: "Rápidos" })).toBeTruthy();
  });

  it("o seletor global troca o relógio", () => {
    const onChange = vi.fn();
    render(<ClockToggle value="business" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Comercial" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Corrido" }));
    expect(onChange).toHaveBeenCalledWith("elapsed");
  });

  it("rótulos", () => {
    expect(clockLabel("business")).toBe("relógio comercial");
    expect(clockLabel("elapsed")).toBe("relógio corrido");
  });
});
