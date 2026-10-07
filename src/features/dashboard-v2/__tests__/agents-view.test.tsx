/** @vitest-environment jsdom */
/**
 * D11 — "Ganhos por agente": ordem por receita (empate pelos ativos hoje),
 * agentes sem atividade em cinza e opção de ocultá-los (preferência persistida).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import { PainelDealWidget } from "@/components/crm/dashboard/painel-deals";
import {
  isInactiveAgent,
  sortAgents,
  visibleAgents,
} from "@/features/dashboard-v2/agents-view";
import { readHideInactiveAgents } from "@/features/dashboard-v2/dashboard-persist";
import type { PainelAgentRow, PainelDealsResult } from "@/features/dashboard-v2/painel-api";

afterEach(cleanup);

const agent = (over: Partial<PainelAgentRow> & { id: string; name: string }): PainelAgentRow => ({
  wonValue: 0,
  wonCount: 0,
  conversion: null,
  ticket: null,
  openToday: 0,
  zeroActivity: true,
  ...over,
});

const ROWS: PainelAgentRow[] = [
  agent({ id: "z1", name: "Zeca" }),
  agent({ id: "a1", name: "Ana", openToday: 2, zeroActivity: false }),
  agent({ id: "r1", name: "Rita", wonValue: 5000, wonCount: 2, conversion: 50, ticket: 2500, openToday: 1, zeroActivity: false }),
  agent({ id: "b1", name: "Breno", openToday: 7, zeroActivity: false }),
  agent({ id: "c1", name: "Caio" }),
];

describe("ordem e inatividade", () => {
  it("receita primeiro; em empate (zeros), ativos hoje; depois nome", () => {
    expect(sortAgents(ROWS).map((r) => r.name)).toEqual(["Rita", "Breno", "Ana", "Caio", "Zeca"]);
  });

  it("não muta a lista recebida", () => {
    const copy = [...ROWS];
    sortAgents(ROWS);
    expect(ROWS).toEqual(copy);
  });

  it("sem atividade = zeroActivity do backend ou tudo zerado", () => {
    expect(isInactiveAgent(ROWS[0]!)).toBe(true);
    expect(isInactiveAgent(ROWS[1]!)).toBe(false);
    expect(isInactiveAgent(agent({ id: "x", name: "X", zeroActivity: false, conversion: 0 }))).toBe(
      true,
    );
    expect(
      isInactiveAgent(agent({ id: "y", name: "Y", zeroActivity: false, wonCount: 1 })),
    ).toBe(false);
  });

  it("ocultar tira só quem está sem atividade", () => {
    expect(visibleAgents(ROWS, true).map((r) => r.name)).toEqual(["Rita", "Breno", "Ana"]);
    expect(visibleAgents(ROWS, false)).toHaveLength(5);
  });
});

function dealsData(rows: PainelAgentRow[]): PainelDealsResult {
  return { agents: { ok: true, data: rows } } as unknown as PainelDealsResult;
}

function Harness({ rows, initial = false }: { rows: PainelAgentRow[]; initial?: boolean }) {
  const [hide, setHide] = useState(initial);
  return (
    <PainelDealWidget
      id="agents"
      data={dealsData(rows)}
      search=""
      hideInactiveAgents={hide}
      onHideInactiveAgents={setHide}
      onRetry={() => {}}
    />
  );
}

function names() {
  return [...document.querySelectorAll("li")].map((li) => li.querySelector("span")?.textContent);
}

describe("card Ganhos por agente", () => {
  it("lista na ordem nova e deixa os sem atividade em cinza", () => {
    render(<Harness rows={ROWS} />);
    expect(names()).toEqual(["Rita", "Breno", "Ana", "Caio", "Zeca"]);
    const gray = [...document.querySelectorAll("li[data-agent-inactive]")].map(
      (li) => li.querySelector("span")?.textContent,
    );
    expect(gray).toEqual(["Caio", "Zeca"]);
    expect(
      document.querySelector("li[data-agent-inactive]")!.className,
    ).toContain("text-muted-foreground");
  });

  it("'Ocultar sem atividade' esconde e volta a mostrar", () => {
    render(<Harness rows={ROWS} />);
    fireEvent.click(screen.getByRole("button", { name: "Ocultar sem atividade (2)" }));
    expect(names()).toEqual(["Rita", "Breno", "Ana"]);
    const show = screen.getByRole("button", { name: "Mostrar sem atividade (2)" });
    expect(show.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(show);
    expect(names()).toHaveLength(5);
  });

  it("todos sem atividade e ocultos: diz isso e deixa mostrar de novo", () => {
    render(<Harness rows={[ROWS[0]!, ROWS[4]!]} initial />);
    expect(screen.getByText("Nenhum agente com atividade")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mostrar sem atividade (2)" })).toBeTruthy();
  });

  it("sem ninguém inativo não mostra o botão", () => {
    render(<Harness rows={[ROWS[2]!]} />);
    expect(screen.queryByRole("button", { name: /sem atividade/ })).toBeNull();
  });
});

describe("preferência persistida", () => {
  it("lê do estado salvo do dashboard (padrão: mostrar todos)", () => {
    expect(readHideInactiveAgents({ tab: "deals", hideInactiveAgents: true })).toBe(true);
    expect(readHideInactiveAgents({ tab: "deals", hideInactiveAgents: false })).toBe(false);
    expect(readHideInactiveAgents({ tab: "deals" })).toBe(false);
  });
});
