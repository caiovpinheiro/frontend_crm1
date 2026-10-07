/** @vitest-environment jsdom */
/**
 * D3 — estado vazio coerente do "Ranking de atendimentos" (há atendimentos no
 * período, mas nenhum com atendente).
 * D4 — o que o número "sem encerramento" quer dizer.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TeamRankingsWidget } from "@/components/crm/dashboard/painel-team";
import type { PainelTeamRanking, PainelTeamRankRow } from "@/features/dashboard-v2/painel-api";
import {
  attendedEmptyTitle,
  attendedParts,
  attendedRowText,
  unassignedCount,
} from "@/features/dashboard-v2/team-rankings";

afterEach(cleanup);

const row = (id: string, name: string, attended: number, finished: number): PainelTeamRankRow => ({
  id,
  name,
  attended,
  finished,
  serviceMeanMs: null,
  serviceMedianMs: null,
  serviceSample: 0,
});

function mount(
  rows: PainelTeamRankRow[],
  opts: { periodTotal?: number | null; filtered?: boolean } = {},
) {
  const data: PainelTeamRanking = { rows, capped: false };
  return render(
    <TeamRankingsWidget
      block={{ ok: true, data }}
      search=""
      filtered={opts.filtered ?? false}
      clock="business"
      periodTotal={opts.periodTotal}
      onRetry={() => {}}
    />,
  );
}

describe("D3 — ranking de atendimentos vazio", () => {
  it("com atendimentos no período e nenhum com atendente, diz quantos estão sem atendente", () => {
    mount([row("a", "Ana", 0, 0)], { periodTotal: 3 });
    expect(
      screen.getByText("Nenhum atendimento com atendente no período (3 sem atendente)"),
    ).toBeTruthy();
    expect(screen.queryByText("Não há atendimentos no período")).toBeNull();
  });

  it("sem linhas de atendente também", () => {
    mount([], { periodTotal: 12 });
    expect(
      screen.getByText("Nenhum atendimento com atendente no período (12 sem atendente)"),
    ).toBeTruthy();
  });

  it("sem total do período (volume ainda não carregou ou oculto) mantém o texto antigo", () => {
    mount([], { periodTotal: null });
    expect(screen.getByText("Não há atendimentos no período")).toBeTruthy();
  });

  it("com filtro de departamento/usuário o total não é comparável: sem a contagem", () => {
    mount([], { periodTotal: 3, filtered: true });
    expect(screen.getByText("Não há atendimentos no período")).toBeTruthy();
  });

  it("período realmente vazio mantém o texto antigo", () => {
    mount([], { periodTotal: 0 });
    expect(screen.getByText("Não há atendimentos no período")).toBeTruthy();
  });

  it("N = total do período − soma atribuída (nunca negativo)", () => {
    expect(unassignedCount(10, 7)).toBe(3);
    // transferidas contam para dois atendentes: a soma pode passar do total
    expect(unassignedCount(10, 14)).toBe(0);
    expect(unassignedCount(null, 0)).toBe(0);
    expect(attendedEmptyTitle({ total: 1, attributed: 0, filtered: false })).toBe(
      "Nenhum atendimento com atendente no período (1 sem atendente)",
    );
  });
});

describe("D4 — 'em aberto' do ranking de atendimentos", () => {
  it("não chama de 'em aberto' o que é attended − encerradas no período", () => {
    mount([row("b", "Breno", 227, 5)], { periodTotal: 300 });
    // 227 atendimentos, 5 encerradas no período, 222 sem encerramento no período
    expect(screen.getAllByText(/222 sem encerr\./).length).toBeGreaterThan(0);
    expect(screen.getByText(/2,2% encerradas no período/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/em aberto/i);
    expect(document.body.textContent).toContain("Encerradas no período");
    expect(document.body.textContent).toContain("Total (sem encerramento no período)");
  });

  it("o balão explica as duas partes", () => {
    const text = attendedRowText(attendedParts(227, 5));
    expect(text.tipLines).toEqual([
      "5 encerradas no período",
      "222 sem encerramento no período",
    ]);
  });
});
