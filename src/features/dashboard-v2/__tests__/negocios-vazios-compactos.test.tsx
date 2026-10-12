/** @vitest-environment jsdom */
/**
 * Aba Negócios (QA de produção): "Origem" vazio ocupava 175 px para uma frase.
 * Os vazios da aba usam o estado compacto (`PainelEmptyCard`, uma linha) como
 * os demais: Origem, Ganhos por agente (sem agente no recorte ou todos ocultos
 * por "sem atividade") e Uso do sistema hoje.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import { PainelDealWidget } from "@/components/crm/dashboard/painel-deals";
import { SystemUsageCard } from "@/components/crm/dashboard/system-usage-card";
import type { PainelAgentRow, PainelDealsResult } from "@/features/dashboard-v2/painel-api";

afterEach(cleanup);

function deals(over: Partial<Record<keyof PainelDealsResult, unknown>>): PainelDealsResult {
  return over as unknown as PainelDealsResult;
}

function compact() {
  return document.querySelectorAll("[data-painel-empty-compact]");
}

const INACTIVE: PainelAgentRow = {
  id: "z",
  name: "Zeca",
  wonValue: 0,
  wonCount: 0,
  conversion: null,
  ticket: null,
  openToday: 0,
  zeroActivity: true,
};

describe("vazios compactos na aba Negócios", () => {
  it("Origem sem dados: uma linha, sem o bloco 'Não há dados no período'", () => {
    render(
      <PainelDealWidget
        id="sources"
        data={deals({ sources: { ok: true, data: [] } })}
        search=""
        onRetry={() => {}}
      />,
    );
    expect(compact()).toHaveLength(1);
    expect(screen.getByText("Origem")).toBeTruthy();
    expect(screen.getByText("Nenhum ganho com origem neste recorte.")).toBeTruthy();
    expect(screen.queryByText("Não há dados no período")).toBeNull();
  });

  it("Ganhos por agente sem ninguém no recorte: compacto", () => {
    render(
      <PainelDealWidget
        id="agents"
        data={deals({ agents: { ok: true, data: [] } })}
        search=""
        onRetry={() => {}}
      />,
    );
    expect(compact()).toHaveLength(1);
    expect(screen.queryByText("Não há dados no período")).toBeNull();
  });

  it("Ganhos por agente com todos ocultos: compacto e com o botão de mostrar", () => {
    render(
      <PainelDealWidget
        id="agents"
        data={deals({ agents: { ok: true, data: [INACTIVE] } })}
        search=""
        hideInactiveAgents
        onHideInactiveAgents={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(compact()).toHaveLength(1);
    expect(screen.getByText("Nenhum agente com atividade")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mostrar sem atividade (1)" })).toBeTruthy();
  });

  it("Uso do sistema hoje sem sessões: compacto", () => {
    render(<SystemUsageCard rows={[]} />);
    expect(compact()).toHaveLength(1);
    expect(screen.getByText("Uso do sistema hoje")).toBeTruthy();
  });
});
