/** @vitest-environment jsdom */
/**
 * D8/D9 — Negócios fora do desktop: sem grid em pixels (o react-grid-layout
 * media o container e deixava faixa vazia no tablet / duas colunas de ~180 px no
 * celular). Abaixo de 1.024 px os cards entram numa grade CSS fluida.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SortableWidgetGrid } from "@/features/dashboard-v2/components/sortable-widget-grid";
import { defaultNegociosLayout } from "@/features/dashboard-v2/use-negocios-grid";
import {
  FLUID_GRID_CLASS,
  fluidOrder,
  fluidSpanClass,
} from "@/features/dashboard-v2/fluid-grid";

afterEach(cleanup);

function setViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("min-width: 1024px") ? desktop : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

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

afterEach(() => vi.unstubAllGlobals());

describe("helpers da grade fluida", () => {
  it("ordem de leitura: de cima para baixo, esquerda para direita", () => {
    expect(
      fluidOrder([
        { i: "c", x: 0, y: 20, w: 12 },
        { i: "b", x: 6, y: 5, w: 6 },
        { i: "a", x: 0, y: 5, w: 6 },
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  it("colunas no tablet: nunca menos de 4 nem mais de 12", () => {
    expect(fluidSpanClass(12)).toBe("md:col-span-12");
    expect(fluidSpanClass(6)).toBe("md:col-span-6");
    expect(fluidSpanClass(3)).toBe("md:col-span-4");
    expect(fluidSpanClass(40)).toBe("md:col-span-12");
    expect(fluidSpanClass(Number.NaN)).toBe("md:col-span-12");
  });

  it("1 coluna no celular, 12 a partir do tablet", () => {
    expect(FLUID_GRID_CLASS.split(" ")).toEqual(
      expect.arrayContaining(["grid-cols-1", "md:grid-cols-12"]),
    );
  });
});

describe("SortableWidgetGrid fora do desktop", () => {
  const layout = defaultNegociosLayout();
  const ids = ["kpis", "funnel", "usage", "evolution", "sources", "agents", "exceptions"];

  function mount() {
    return render(
      <SortableWidgetGrid
        layout={layout}
        onLayoutChange={() => {}}
        labels={{}}
        render={(id) => <p data-testid={id}>{id}</p>}
      />,
    );
  }

  it("celular/tablet: grade fluida, sem react-grid-layout, todos os cards", () => {
    setViewport(false);
    const { container } = mount();
    const fluid = container.querySelector("[data-fluid-grid]");
    expect(fluid).not.toBeNull();
    expect(container.querySelector(".react-grid-layout")).toBeNull();
    const rendered = [...container.querySelectorAll("[data-widget-id]")].map((el) =>
      el.getAttribute("data-widget-id"),
    );
    expect(rendered.sort()).toEqual([...ids].sort());
    // "Uso do sistema" e "Evolução" dividem a linha só a partir do tablet
    const usage = container.querySelector('[data-widget-id="usage"]')!;
    expect(usage.className).toContain("md:col-span-6");
    expect(usage.className).not.toMatch(/(^|\s)col-span/);
    expect(fluid!.className).toContain("grid-cols-1");
  });

  it("desktop: continua no grid de 12 colunas (sem a grade fluida)", () => {
    setViewport(true);
    const { container } = mount();
    expect(container.querySelector("[data-fluid-grid]")).toBeNull();
  });
});
