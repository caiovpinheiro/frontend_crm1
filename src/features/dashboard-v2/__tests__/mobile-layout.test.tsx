/** @vitest-environment jsdom */
/**
 * D9 — celular: Sankey com os rótulos do lado "PARA" visíveis, e a lista de
 * funis da aba Negócios vira select. (jsdom não mede CSS: ver o PR para a
 * conferência visual a 375 px.)
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TransfersWidget } from "@/components/crm/dashboard/painel-transfers";
import { FunnelPipelinePicker } from "@/features/dashboard-v2/components/funnel-pipeline-picker";
import type { PainelTransfers } from "@/features/dashboard-v2/painel-api";
import { SANKEY_COMPACT_BELOW, sankeyGeometry } from "@/features/dashboard-v2/transfer-flow";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sankeyGeometry", () => {
  it("no celular reserva coluna para os rótulos dos dois lados e as faixas cabem entre elas", () => {
    const g = sankeyGeometry(340);
    expect(g.compact).toBe(true);
    expect(g.width).toBe(340);
    expect(g.labelW).toBeGreaterThanOrEqual(76);
    // o rótulo do lado PARA começa em x1 + barra + 8 e cabe até a borda direita
    const toLabelX = g.x1 + g.barW + 8;
    expect(toLabelX + g.labelW).toBeLessThanOrEqual(g.width);
    // faixas com espaço útil
    expect(g.x1 - g.x0).toBeGreaterThanOrEqual(80);
    // nome mais curto, mas ainda cabe na coluna
    expect(g.nameChars * 6.6).toBeLessThanOrEqual(g.labelW + 1);
  });

  it("largura mínima e limite do modo largo", () => {
    expect(sankeyGeometry(200).width).toBe(280);
    expect(sankeyGeometry(200).x1).toBeGreaterThan(sankeyGeometry(200).x0);
    const wide = sankeyGeometry(SANKEY_COMPACT_BELOW);
    expect(wide.compact).toBe(false);
    expect(wide.labelW).toBe(170);
    expect(wide.nameChars).toBe(24);
    expect(sankeyGeometry(1400).width).toBe(960);
  });
});

const TRANSFERS: PainelTransfers = {
  people: { flows: [], total: 0, conversations: 0, empty: true },
  departments: {
    flows: [
      {
        from: { id: "d1", name: "Comercial" },
        to: { id: "d2", name: "Suporte técnico" },
        count: 2,
        conversations: 2,
      },
    ],
    total: 2,
    conversations: 2,
    empty: false,
  },
};

function mountSankey() {
  const view = render(
    <TransfersWidget
      block={{ ok: true, data: TRANSFERS }}
      search=""
      filtered={false}
      onRetry={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Departamentos" }));
  return view;
}

describe("TransfersWidget a 340 px", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(340);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("usa o modo compacto e desenha os nomes dos dois lados dentro do viewBox", () => {
    const { container } = mountSankey();
    const svg = container.querySelector("svg[data-sankey]")!;
    expect(svg.getAttribute("data-sankey")).toBe("compact");
    const [, , w] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(w).toBe(340);

    const texts = [...svg.querySelectorAll("text")];
    const toName = texts.find((t) => t.textContent === "Suporte técnico");
    const fromName = texts.find((t) => t.textContent === "Comercial");
    expect(toName).toBeTruthy();
    expect(fromName).toBeTruthy();
    // lado PARA: ancorado no início, dentro da largura
    expect(toName!.getAttribute("text-anchor")).toBe("start");
    expect(Number(toName!.getAttribute("x"))).toBeLessThan(w!);
    // contagem em linha própria (empilhada sob o nome), não na mesma linha
    expect(texts.some((t) => /^2 · 100%$/.test(t.textContent ?? ""))).toBe(true);
  });
});

describe("FunnelPipelinePicker no celular", () => {
  const pipelines = [
    { id: "p1", name: "Vendas" },
    { id: "p2", name: "Pós-venda" },
  ];

  it("oferece um select com o funil atual selecionado", () => {
    const onSelect = vi.fn();
    render(<FunnelPipelinePicker pipelines={pipelines} selectedId="p2" onSelect={onSelect} />);
    const select = screen.getByRole("combobox", { name: "Funil de vendas" }) as HTMLSelectElement;
    expect(select.value).toBe("p2");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Vendas", "Pós-venda"]);
    fireEvent.change(select, { target: { value: "p1" } });
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("a lista de botões fica só para telas md+ e o select some a partir dele", () => {
    const { container } = render(
      <FunnelPipelinePicker pipelines={pipelines} selectedId="p1" onSelect={() => {}} />,
    );
    expect(container.querySelector("ul")!.className).toContain("max-md:hidden");
    expect(container.querySelector("select")!.parentElement!.className).toContain("md:hidden");
  });

  it("sem funis mostra 'Nenhum funil'", () => {
    render(<FunnelPipelinePicker pipelines={[]} onSelect={() => {}} />);
    expect(screen.getAllByText("Nenhum funil").length).toBeGreaterThan(0);
  });
});
