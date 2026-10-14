/** @vitest-environment jsdom */
/**
 * Funil e progresso: entradas, saídas e perdas por etapa. "+14 entraram"
 * contra "NOVOS +5" confundia — a maioria veio movida de outra etapa e os
 * novos são os criados no período (não é etapa). Com `exited`/`inflow`/
 * `outflow` do backend: entraram, saíram e perdas para Perdido, detalhe de
 * origens e destinos, e "Criados" no espaço da lista de funis. Sem os
 * campos (backend antigo), card como antes.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import { PainelDealWidget } from "@/components/crm/dashboard/painel-deals";
import { FunnelPipelinePicker } from "@/features/dashboard-v2/components/funnel-pipeline-picker";
import {
  funnelStageLookup,
  inflowRows,
  outflowRows,
  type FunnelFlowPipeline,
} from "@/features/dashboard-v2/funnel-flow";
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

const base = (id: string, name: string, extra: Partial<PainelFunnelStage> = {}): PainelFunnelStage => ({
  id,
  name,
  color: "#3b82f6",
  count: 10,
  value: 1000,
  passThrough: null,
  entered: 6,
  lost: 2,
  todayDelta: 0,
  byUser: [],
  ...extra,
});

const PIPELINES: FunnelFlowPipeline[] = [
  {
    id: "p1",
    name: "Vendas",
    stages: [
      { id: "s1", name: "Qualificação" },
      { id: "s2", name: "Proposta" },
      { id: "lost", name: "Perdido" },
    ],
  },
  { id: "p2", name: "Pós-venda", stages: [{ id: "x1", name: "Onboarding" }] },
];

/** Payload novo: Proposta recebeu 14 e saíram 9. `lost` é o que a etapa mostra como perdas. */
const FLOW_STAGES: PainelFunnelStage[] = [
  base("s1", "Qualificação", {
    entered: 6,
    exited: 8,
    inflow: [{ fromStageId: null, count: 6 }],
    outflow: [
      { toStageId: "s2", count: 7 },
      { toStageId: "lost", toStageName: "Perdido", count: 1 },
    ],
  }),
  base("s2", "Proposta", {
    entered: 14,
    exited: 9,
    inflow: [
      { fromStageId: "s1", count: 7 },
      { fromStageId: null, count: 3 },
      { fromStageId: "x1", count: 2 },
      { fromStageId: "gone", count: 1 },
      { fromStageId: "other", count: 1 },
    ],
    outflow: [
      { toStageId: "lost", count: 6 },
      { toStageId: "x1", toPipelineId: "p2", count: 2 },
      { toStageId: "other", count: 1 },
    ],
  }),
];

function data(funnel: Partial<PainelFunnel>): PainelDealsResult {
  return {
    kpis: { ok: false, error: "x" },
    funnel: {
      ok: true,
      data: {
        definition: "cohort",
        tooltip: "",
        stages: [base("s1", "Qualificação", { lost: 3 }), base("s2", "Proposta", { lost: 1 })],
        empty: false,
        novos: { count: 5, value: 0 },
        ...funnel,
      },
    },
  } as unknown as PainelDealsResult;
}

function renderFunnel(
  funnel: Partial<PainelFunnel>,
  period?: { from: string; to: string; label?: string },
  withPicker = false,
) {
  return render(
    <PainelDealWidget
      id="funnel"
      data={data(funnel)}
      search=""
      period={period}
      pipelineId="p1"
      pipelines={PIPELINES}
      funnelPicker={
        withPicker ? (
          <FunnelPipelinePicker
            pipelines={PIPELINES.map((p) => ({ id: p.id, name: p.name ?? p.id }))}
            selectedId="p1"
            onSelect={() => {}}
          />
        ) : undefined
      }
      onRetry={() => {}}
    />,
  );
}

function flowButton(stageId: string) {
  return document.querySelector<HTMLButtonElement>(`[data-funnel-flow="${stageId}"]`)!;
}

describe("funil: rótulos de origem e destino", () => {
  const lookup = funnelStageLookup([{ id: "s9", name: "Só no payload" }], PIPELINES);

  it("origem: nome do payload, do cache, 'criados aqui', agregado e 'outro funil'", () => {
    const rows = inflowRows(
      [
        { fromStageId: "s1", fromStageName: "Qualif. (payload)", count: 4 },
        { fromStageId: "s2", count: 3 },
        { fromStageId: "s9", count: 3 },
        { fromStageId: null, count: 2 },
        { fromStageId: "x1", count: 2 },
        { fromStageId: "gone", count: 1 },
        { fromStageId: "other", count: 1 },
        { fromStageId: "s1", count: 0 },
      ],
      lookup,
      ["p1"],
    );
    expect(rows.map((r) => [r.label, r.count])).toEqual([
      ["de Qualif. (payload)", 4],
      ["de Proposta", 3],
      ["de Só no payload", 3],
      ["criados aqui", 2],
      ["de Onboarding (outro funil)", 2],
      ["outro funil", 1],
      ["outras", 1],
    ]);
  });

  it("origem de outro funil pelo fromPipelineId (nome do funil não vem)", () => {
    const rows = inflowRows(
      [
        { fromStageId: "y9", fromStageName: "Triagem", fromPipelineId: "p3", count: 2 },
        { fromStageId: "y8", fromPipelineId: "p3", count: 1 },
      ],
      lookup,
      ["p1"],
    );
    expect(rows.map((r) => r.label)).toEqual(["de Triagem (outro funil)", "outro funil"]);
    // Sem funil atual conhecido (vários funis), o fromPipelineId ainda marca.
    expect(
      inflowRows([{ fromStageId: "y9", fromStageName: "Triagem", fromPipelineId: "p3", count: 1 }], lookup)[0]!
        .label,
    ).toBe("de Triagem (outro funil)");
  });

  it("destino: Perdido, outro funil pelo toPipelineId e agregado", () => {
    const rows = outflowRows(
      [
        { toStageId: "lost", count: 6 },
        { toStageId: "zz", toStageName: "Ganho", toPipelineId: "p1", count: 2 },
        { toStageId: "x1", toPipelineId: "p2", count: 2 },
        { toStageId: "gone", count: 1 },
        { toStageId: "other", count: 1 },
      ],
      lookup,
      ["p1"],
    );
    expect(rows.map((r) => r.label)).toEqual([
      "para Perdido",
      "para Ganho",
      "para Onboarding (outro funil)",
      "para outro funil",
      "outras",
    ]);
  });
});

describe("funil com fluxo do backend", () => {
  it("cada etapa mostra entraram, saíram e perdas; some o saldo", () => {
    renderFunnel({ stages: FLOW_STAGES });
    const proposta = flowButton("s2");
    expect(proposta.textContent).toContain("+14");
    expect(proposta.textContent).toContain("entraram");
    expect(proposta.textContent).toContain("−9");
    expect(proposta.textContent).toContain("saíram");
    expect(proposta.querySelector("[data-funnel-lost]")!.textContent).toBe("2 perdas");
    expect(proposta.querySelector("[data-funnel-lost]")!.className).toContain(
      "--pipeline-danger",
    );
    const qualif = flowButton("s1");
    expect(qualif.querySelector("[data-funnel-lost]")!.textContent).toBe("2 perdas");
    expect(proposta.textContent).not.toContain("saldo");
    expect(qualif.textContent).not.toContain("saldo");
    expect(screen.getByText("Estoque aberto, entradas e saídas por etapa")).toBeTruthy();
  });

  it("'entraram' explica que inclui os movidos de outra etapa", () => {
    renderFunnel({ stages: FLOW_STAGES });
    const label = within(flowButton("s2")).getByText("entraram");
    expect(label.getAttribute("title")).toBe(
      "Negócios que chegaram a esta etapa no período — criados nela ou movidos de outra.",
    );
  });

  it("passar o mouse mostra origens e destinos com os nomes resolvidos", () => {
    renderFunnel({ stages: FLOW_STAGES });
    const btn = flowButton("s2");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const dialog = screen.getByRole("dialog", { name: "Entradas e saídas: Proposta" });
    const text = dialog.textContent ?? "";
    expect(text).toContain("Entraram (14)");
    expect(text).toContain("de Qualificação7");
    expect(text).toContain("criados aqui3");
    expect(text).toContain("de Onboarding (outro funil)2");
    expect(text).toContain("outro funil1");
    expect(text).toContain("outras1");
    expect(text).toContain("Saíram (9)");
    expect(text).toContain("para Perdido6");
    expect(text).toContain("para Onboarding (outro funil)2");
    expect(text).toContain("Saíram (9)para Perdido6para Onboarding (outro funil)2outras1");
    // Hover não rouba o foco.
    expect(document.activeElement).not.toBe(dialog);
    fireEvent.pointerLeave(btn, { pointerType: "mouse" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toque abre e fixa o detalhe; tocar fora fecha", () => {
    renderFunnel({ stages: FLOW_STAGES });
    const btn = flowButton("s1");
    fireEvent.pointerEnter(btn, { pointerType: "touch" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByRole("dialog").textContent).toContain("criados aqui6");
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("teclado: Enter abre com foco no popover, Esc fecha e devolve o foco", () => {
    renderFunnel({ stages: FLOW_STAGES });
    const btn = flowButton("s2");
    btn.focus();
    fireEvent.keyDown(btn, { key: "Enter" });
    const dialog = screen.getByRole("dialog");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.getAttribute("aria-controls")).toBe(dialog.id);
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn);
  });

  it("Enter de novo no botão fecha", () => {
    renderFunnel({ stages: FLOW_STAGES });
    const btn = flowButton("s2");
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    btn.focus();
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("'Criados no período' fica na lista de funis, fora das colunas", () => {
    const view = renderFunnel(
      { stages: FLOW_STAGES },
      { from: "2026-10-01T00:00:00.000Z", to: "2026-10-07T23:59:59.000Z", label: "Últimos 7 dias" },
      true,
    );
    const chip = view.container.querySelector("[data-funnel-created]")!;
    expect(chip.textContent).toContain("+5");
    expect(chip.textContent).toContain("Criados no período");
    expect(chip.getAttribute("title")).toBe(
      "Criados no período. Negócios criados no período, em qualquer etapa.",
    );
    expect(chip.closest("nav")?.getAttribute("aria-label")).toBe("Funil de vendas");
    expect(chip.closest("header")).toBeNull();
    expect(chip.closest(".pipeline-progress-track")).toBeNull();
    // Nenhuma coluna "Novos" no trilho, nem o selo "Novo" ao lado da barra.
    const track = view.container.querySelector(".pipeline-progress-track")!;
    expect(within(track as HTMLElement).queryByText("Novos")).toBeNull();
    expect(screen.queryByText("Novo")).toBeNull();
    const headings = within(track as HTMLElement)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Qualificação", "Proposta"]);
  });

  it("'Criados hoje' quando o período é hoje", () => {
    const view = renderFunnel(
      { stages: FLOW_STAGES },
      { from: "2026-10-12T00:00:00.000Z", to: "2026-10-12T23:59:59.000Z", label: "Hoje" },
      true,
    );
    expect(view.container.querySelector("[data-funnel-created]")!.textContent).toContain(
      "Criados hoje",
    );
    expect(view.container.querySelector("[data-funnel-created]")!.getAttribute("title")).toContain(
      "Criados hoje",
    );
  });
});

describe("funil sem o fluxo (backend antigo)", () => {
  it("mantém o card atual: coluna Novos, '+N entraram', 'N perdas' e selo 'Novo'", () => {
    const view = renderFunnel({});
    expect(view.container.querySelector("[data-funnel-flow]")).toBeNull();
    expect(view.container.querySelector("[data-funnel-created]")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Estoque aberto, entradas e perdas por etapa")).toBeTruthy();
    const track = view.container.querySelector(".pipeline-progress-track") as HTMLElement;
    const cols = Array.from(track.querySelectorAll(":scope > article"));
    // Novos + 2 etapas + Ganhos/Perdidos.
    expect(cols).toHaveLength(4);
    expect(cols[0]!.querySelector("h3")!.textContent).toBe("Novos");
    expect(cols[0]!.textContent).toContain("+5");
    expect(cols[1]!.textContent).toContain("+6entraram");
    expect(cols[1]!.textContent).toContain("3 perdas");
    expect(cols[2]!.textContent).toContain("1 perda");
    expect(screen.getByText("Novo")).toBeTruthy();
    expect(track.querySelectorAll("button")).toHaveLength(0);
  });
});
