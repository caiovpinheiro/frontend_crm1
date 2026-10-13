/** @vitest-environment jsdom */
/**
 * L1 — Negócios no desktop, layout salvo da auditoria (funil w12 h15, uso w7
 * h12, evolução w6 h10, dois cards w4 h6 em x7 y15/y21):
 *  - os cards esticam até a altura da célula (antes: 76 px de card numa célula
 *    de ~130 px, buraco de 58 px entre eles);
 *  - colunas vazias da linha são ocupadas só na exibição (evolução sozinha
 *    deixava ~480 px vazios; os cards, a coluna 11). O layout salvo não muda.
 */
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-grid-layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-grid-layout")>();
  return {
    ...actual,
    // jsdom não mede: grade falsa que expõe o layout recebido.
    default: ({ layout, children }: { layout: unknown; children: ReactNode }) => (
      <div data-testid="grid" data-layout={JSON.stringify(layout)}>
        {children}
      </div>
    ),
    useContainerWidth: () => ({ width: 1000, containerRef: { current: null }, mounted: true }),
  };
});

import { SortableWidgetGrid } from "@/features/dashboard-v2/components/sortable-widget-grid";
import { fillRowGaps } from "@/features/dashboard-v2/grid-fill";
import type { Layout } from "@/features/dashboard-v2/use-negocios-grid";

const SAVED: Layout = [
  { i: "funnel", x: 0, y: 0, w: 12, h: 15 },
  { i: "usage", x: 0, y: 15, w: 7, h: 12 },
  { i: "card:in", x: 7, y: 15, w: 4, h: 6 },
  { i: "card:out", x: 7, y: 21, w: 4, h: 6 },
  { i: "evolution", x: 0, y: 27, w: 6, h: 10 },
];

function byId(layout: { i: string; x: number; w: number }[]) {
  return Object.fromEntries(layout.map((item) => [item.i, { x: item.x, w: item.w }]));
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("min-width: 1024px"),
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
  vi.unstubAllGlobals();
});

describe("fillRowGaps", () => {
  it("layout da auditoria: evolução ocupa a linha, cards encostam na borda", () => {
    const out = byId(fillRowGaps(SAVED, 12));
    expect(out.evolution).toEqual({ x: 0, w: 12 });
    expect(out["card:in"]).toEqual({ x: 7, w: 5 });
    expect(out["card:out"]).toEqual({ x: 7, w: 5 });
    expect(out.usage).toEqual({ x: 0, w: 7 });
    expect(out.funnel).toEqual({ x: 0, w: 12 });
  });

  it("não sobrepõe vizinhos e não altera o layout de entrada", () => {
    const input: Layout = [
      { i: "a", x: 0, y: 0, w: 4, h: 4 },
      { i: "b", x: 8, y: 0, w: 2, h: 4 },
      { i: "c", x: 4, y: 2, w: 2, h: 6 },
    ];
    const snapshot = JSON.stringify(input);
    const out = byId(fillRowGaps(input, 12));
    // Em ordem de leitura: a para em c; b (mesma linha) cresce até a borda e
    // para trás até c; c já não tem coluna livre.
    expect(out.a).toEqual({ x: 0, w: 4 });
    expect(out.b).toEqual({ x: 6, w: 6 });
    expect(out.c).toEqual({ x: 4, w: 2 });
    // nenhuma sobreposição entre quem divide linhas
    expect(out.b.x).toBeGreaterThanOrEqual(out.c.x + out.c.w);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("SortableWidgetGrid (desktop)", () => {
  function mount(organizing: boolean) {
    return render(
      <SortableWidgetGrid
        layout={SAVED}
        onLayoutChange={() => {}}
        labels={{}}
        organizing={organizing}
        render={(id) => <article data-card={id}>{id}</article>}
      />,
    );
  }

  it("exibição: larguras preenchidas e o card estica até a célula", () => {
    const view = mount(false);
    const grid = view.getByTestId("grid");
    const shown = byId(JSON.parse(grid.dataset.layout!));
    expect(shown.evolution).toEqual({ x: 0, w: 12 });
    expect(shown["card:in"]).toEqual({ x: 7, w: 5 });

    const card = view.container.querySelector('[data-card="card:in"]')!;
    const fill = card.parentElement!;
    expect(fill.hasAttribute("data-grid-fill")).toBe(true);
    expect(fill.dataset.gridMeasure).toBe("card:in");
    expect(fill.className).toContain("[&>*]:flex-1");
    expect(fill.className).toContain("flex-1");
    expect(fill.className).not.toContain("h-fit");
    const cell = fill.parentElement!;
    expect(cell.dataset.gridCell).toBe("card:in");
    expect(cell.className).toContain("h-full");
    // Fora do modo Organizar: sem barra de edição.
    expect(cell.querySelector("[data-grid-toolbar]")).toBeNull();
  });

  it("organizando: a grade mostra as larguras salvas (o arraste grava o real)", () => {
    const view = mount(true);
    const shown = byId(JSON.parse(view.getByTestId("grid").dataset.layout!));
    expect(shown.evolution).toEqual({ x: 0, w: 6 });
    expect(shown["card:in"]).toEqual({ x: 7, w: 4 });
  });
});
