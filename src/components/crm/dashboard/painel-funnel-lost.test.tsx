/** @vitest-environment jsdom */
/**
 * Salsicha ("Funil e progresso"): coluna "Perdidos" lê o estoque da etapa
 * Perdido (`funnel.lostStage`) e os envios do período. Sem o campo
 * (backend antigo) continua mostrando 0.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import { PainelDealWidget } from "@/components/crm/dashboard/painel-deals";
import type {
  PainelDealsResult,
  PainelFunnel,
  PainelFunnelStage,
} from "@/features/dashboard-v2/painel-api";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stage = (id: string, name: string, lost = 0): PainelFunnelStage => ({
  id,
  name,
  color: "#3b82f6",
  count: 10,
  value: 1000,
  passThrough: null,
  entered: 2,
  lost,
  todayDelta: 0,
  byUser: [],
});

function data(funnel: Partial<PainelFunnel>): PainelDealsResult {
  return {
    kpis: { ok: false, error: "x" },
    funnel: {
      ok: true,
      data: {
        definition: "cohort",
        tooltip: "",
        stages: [stage("s1", "Qualificação", 3), stage("s2", "Proposta", 1)],
        empty: false,
        novos: { count: 0, value: 0 },
        ...funnel,
      },
    },
  } as unknown as PainelDealsResult;
}

function renderFunnel(funnel: Partial<PainelFunnel>, pipelineId?: string) {
  return render(
    <PainelDealWidget
      id="funnel"
      data={data(funnel)}
      search=""
      pipelineId={pipelineId}
      onRetry={() => {}}
    />,
  );
}

function lostLink() {
  return screen.getByText("Perdidos").closest("a");
}

describe("salsicha: coluna Perdidos", () => {
  it("com lostStage mostra estoque, valor, 'na etapa hoje' e '+N enviados'", () => {
    renderFunnel({ lostStage: { count: 1805, value: 2_500_000, sentInPeriod: 23 } });
    const col = lostLink()!;
    expect(col.textContent).toContain("1.805");
    expect(col.textContent).toMatch(/R\$\s*2,5\s*mi/);
    expect(col.textContent).toContain("na etapa hoje");
    expect(col.textContent).toContain("+23 enviados no período");
    expect(screen.getByText("Perdidos").getAttribute("title")).toContain(
      "inclusive os já encerrados que o Kanban esconde por padrão",
    );
  });

  it("singular: '+1 enviado no período'", () => {
    renderFunnel({ lostStage: { count: 5, value: 0, sentInPeriod: 1 } });
    expect(lostLink()!.textContent).toContain("+1 enviado no período");
  });

  it("sem envios no período não mostra a linha '+N'", () => {
    renderFunnel({ lostStage: { count: 5, value: 0, sentInPeriod: 0 } });
    const text = lostLink()!.textContent ?? "";
    expect(text).toContain("na etapa hoje");
    expect(text).not.toContain("enviado");
  });

  it("sem lostStage (backend atual) mostra 0 como antes", () => {
    renderFunnel({});
    const text = lostLink()!.textContent ?? "";
    expect(text).toContain("Perdidos0");
    expect(text).not.toContain("na etapa hoje");
    expect(screen.getByText("Perdidos").getAttribute("title")).toBeNull();
  });

  it("não mexe nas 'N perdas' por etapa", () => {
    renderFunnel({ lostStage: { count: 1805, value: 0, sentInPeriod: 4 } });
    expect(screen.getByText("3 perdas")).toBeTruthy();
    expect(screen.getByText("1 perda")).toBeTruthy();
  });

  it("link aponta para a etapa Perdido quando ela vem no payload", () => {
    renderFunnel(
      {
        stages: [stage("s1", "Qualificação"), stage("lost1", "Perdido")],
        lostStage: { count: 7, value: 0, sentInPeriod: 0 },
      },
      "p1",
    );
    expect(lostLink()!.getAttribute("href")).toBe("/pipeline?pipeline=p1&stage=lost1");
  });

  it("sem a etapa Perdido no payload mantém o link do funil", () => {
    renderFunnel({ lostStage: { count: 7, value: 0, sentInPeriod: 0 } }, "p1");
    expect(lostLink()!.getAttribute("href")).toBe("/pipeline?pipeline=p1");
  });
});
