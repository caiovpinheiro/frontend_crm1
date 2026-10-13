/** @vitest-environment jsdom */
/**
 * Modo "Organizar" do Dashboard de Negócios (desktop, grade em pixels):
 *  - o card ocupa a célula inteira (o placeholder do arraste tem o tamanho do
 *    card) e as alças (⋮⋮ e ⋮) ficam DENTRO do card, no canto superior direito
 *    — antes eram uma coluna ao lado do card que encostava no vizinho;
 *  - "Ajustar alturas ao conteúdo" recalcula o `h` pela altura medida e grava
 *    uma vez (`user`);
 *  - compactação vertical ligada, sem limiar no arraste, `fillRowGaps` só fora
 *    da edição; guias das colunas visíveis.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gridProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));

vi.mock("react-grid-layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-grid-layout")>();
  return {
    ...actual,
    // jsdom não mede: grade falsa que expõe o layout e a config recebidos.
    default: (props: { layout: unknown; children: ReactNode }) => {
      gridProps.last = props as unknown as Record<string, unknown>;
      return (
        <div data-testid="grid" data-layout={JSON.stringify(props.layout)}>
          {props.children}
        </div>
      );
    },
    useContainerWidth: () => ({ width: 1192, containerRef: { current: null }, mounted: true }),
  };
});

import { verticalCompactor } from "react-grid-layout";
import {
  DASHBOARD_GRID_COMPACTOR,
  DASHBOARD_GRID_DRAG_THRESHOLD,
  SortableWidgetGrid,
} from "@/features/dashboard-v2/components/sortable-widget-grid";
import { fitLayoutToContent } from "@/features/dashboard-v2/grid-fit";
import { gridCellHeightPx, type Layout } from "@/features/dashboard-v2/use-negocios-grid";

// Layout salvo da evidência (produção): cards de evento w4 h6.
const SAVED: Layout = [
  { i: "usage", x: 0, y: 0, w: 7, h: 12, minH: 6 },
  { i: "card:in", x: 7, y: 0, w: 4, h: 6, minH: 4 },
  { i: "card:out", x: 7, y: 6, w: 4, h: 6, minH: 4 },
  { i: "evolution", x: 0, y: 12, w: 6, h: 14, minH: 8 },
];

beforeEach(() => {
  gridProps.last = null;
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("min-width: 1024px") || query.includes("pointer: fine"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  );
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(organizing: boolean, onLayoutChange = vi.fn()) {
  const view = render(
    <SortableWidgetGrid
      layout={SAVED}
      onLayoutChange={onLayoutChange}
      labels={{ "card:in": "Mensagens recebidas", "card:out": "Mensagens respondidas" }}
      organizing={organizing}
      onRemove={() => {}}
      render={(id) => <article data-card={id}>{id}</article>}
    />,
  );
  return { view, onLayoutChange };
}

describe("organizar: card = célula, alças dentro do card", () => {
  it("o card estica até a célula (largura e altura) também no modo Organizar", () => {
    const { view } = mount(true);
    const card = view.container.querySelector('[data-card="card:out"]')!;
    const fill = card.parentElement!;
    expect(fill.hasAttribute("data-grid-fill")).toBe(true);
    expect(fill.className).toContain("flex-1");
    expect(fill.className).toContain("[&>*]:flex-1");
    const cell = fill.parentElement!;
    expect(cell.dataset.gridCell).toBe("card:out");
    expect(cell.className).toContain("h-full");
    expect(cell.className).toContain("w-full");
    // Nada em fluxo ao lado do card: o único filho em fluxo é o card.
    const inFlow = [...cell.children].filter(
      (el) => !el.className.toString().includes("absolute"),
    );
    expect(inFlow).toEqual([fill]);
  });

  it("⋮⋮ e ⋮ ficam dentro do card, no canto superior direito, com alvo de 32/40 px", () => {
    const { view } = mount(true);
    const cell = view.container.querySelector('[data-grid-cell="card:out"]')!;
    const toolbar = cell.querySelector<HTMLElement>("[data-grid-toolbar]")!;
    expect(toolbar).not.toBeNull();
    expect(toolbar.className).toContain("absolute");
    expect(toolbar.className).toContain("right-1.5");
    expect(toolbar.className).toContain("top-1.5");
    const grip = view.getByRole("button", { name: "Mover Mensagens respondidas" });
    const menu = view.getByRole("button", { name: "Mais opções de Mensagens respondidas" });
    for (const button of [grip, menu]) {
      expect(toolbar.contains(button)).toBe(true);
      expect(button.className).toContain("size-8");
      expect(button.className).toContain("pointer-coarse:size-10");
    }
    // Com mouse, o card inteiro também arrasta (a alça continua).
    expect(cell.className).toContain("dashboard-grid-drag-surface");
    expect(grip.className).toContain("dashboard-grid-drag-surface");
  });

  it("fora do modo Organizar: sem alças nem área de arraste", () => {
    const { view } = mount(false);
    const cell = view.container.querySelector('[data-grid-cell="card:out"]')!;
    expect(cell.querySelector("[data-grid-toolbar]")).toBeNull();
    expect(cell.className).not.toContain("dashboard-grid-drag-surface");
    expect(view.queryByRole("button", { name: /Ajustar alturas/ })).toBeNull();
  });
});

describe("organizar: config da grade", () => {
  it("compactação vertical ligada, arraste sem limiar, redimensionar pelo canto", () => {
    mount(true);
    const props = gridProps.last!;
    expect(DASHBOARD_GRID_COMPACTOR).toBe(verticalCompactor);
    expect(props.compactor).toBe(verticalCompactor);
    expect(DASHBOARD_GRID_DRAG_THRESHOLD).toBe(0);
    expect(props.dragConfig).toMatchObject({ enabled: true, threshold: 0 });
    expect(props.resizeConfig).toMatchObject({ enabled: true, handles: ["se"] });
  });

  it("larguras reais na edição (sem fillRowGaps) e guias das colunas visíveis", () => {
    const { view } = mount(true);
    const shown = JSON.parse(view.getByTestId("grid").dataset.layout!) as Layout;
    expect(shown.find((item) => item.i === "evolution")).toMatchObject({ x: 0, w: 6 });
    const guides = view.container.querySelector<HTMLElement>("[data-grid-guides]")!;
    expect(guides).not.toBeNull();
    // (1192 - 11 × 4) / 12 = 95,67 px por coluna, 4 px de vão.
    expect(guides.style.backgroundImage).toContain("repeating-linear-gradient");
    expect(guides.style.backgroundImage).toContain("95.66");
  });

  it("fora da edição: sem guias e com as colunas vazias preenchidas", () => {
    const { view } = mount(false);
    expect(view.container.querySelector("[data-grid-guides]")).toBeNull();
    const shown = JSON.parse(view.getByTestId("grid").dataset.layout!) as Layout;
    expect(shown.find((item) => item.i === "evolution")).toMatchObject({ x: 0, w: 12 });
  });
});

describe("Ajustar alturas ao conteúdo", () => {
  it("h pelas alturas medidas (mínimo do tipo; evolução inclusa) e 1 gravação `user`", () => {
    // Alturas naturais simuladas (px): card de evento = título + número.
    const natural: Record<string, number> = {
      usage: 236,
      "card:in": 82,
      "card:out": 150,
      // Card inteiro da Evolução, com o gráfico de 280 px.
      evolution: 357,
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const id = this.dataset.gridMeasure;
      const height = id ? (natural[id] ?? 0) : 0;
      return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height } as DOMRect;
    });
    const { view, onLayoutChange } = mount(true);
    fireEvent.click(view.getByRole("button", { name: "Ajustar alturas ao conteúdo" }));

    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    const [next, source] = onLayoutChange.mock.calls[0] as [Layout, string];
    expect(source).toBe("user");
    const h = Object.fromEntries(next.map((item) => [item.i, item.h]));
    // 82 px → 4 linhas (92 px); 150 px → 7 linhas (164 px); 236 px → 10 linhas.
    expect(h["card:in"]).toBe(4);
    expect(gridCellHeightPx(4)).toBeGreaterThanOrEqual(82);
    expect(h["card:out"]).toBe(7);
    expect(gridCellHeightPx(7)).toBeGreaterThanOrEqual(150);
    expect(h.usage).toBe(10);
    // Evolução também segue o card inteiro: 357 px → 16 linhas (380 px).
    expect(h.evolution).toBe(16);
    expect(gridCellHeightPx(16)).toBeGreaterThanOrEqual(357);
    // Medida restaurada: o card volta a esticar até a célula.
    const fill = view.container.querySelector<HTMLElement>('[data-grid-measure="card:in"]')!;
    expect(fill.style.cssText).toBe("");
  });
});

describe("fitLayoutToContent", () => {
  it("não desce do minH, ignora medida vazia e não altera a entrada", () => {
    const snapshot = JSON.stringify(SAVED);
    const out = fitLayoutToContent(
      SAVED,
      new Map([
        ["card:in", 10],
        ["card:out", 0],
        ["usage", Number.NaN],
      ]),
    );
    const h = Object.fromEntries(out.map((item) => [item.i, item.h]));
    expect(h["card:in"]).toBe(4);
    expect(h["card:out"]).toBe(6);
    expect(h.usage).toBe(12);
    expect(JSON.stringify(SAVED)).toBe(snapshot);
  });
});
