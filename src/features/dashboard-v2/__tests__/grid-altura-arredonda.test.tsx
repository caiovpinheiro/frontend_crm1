/** @vitest-environment jsdom */
/**
 * Conferência na DEV (fe #198): no modo leitura o item da grade ficava menor
 * que o card ("Uso do sistema" invadia "Ganhos por agente" em ~13 px). A
 * medida vinha de `getBoundingClientRect`, que sofre o `scale` de um ancestral
 * (viewport reduzido para caber): ~7% a menos → linhas a menos.
 *
 *  - px → linhas = ceil((px + marginY) / (rowHeight + marginY)) (o
 *    react-grid-layout desenha rowHeight·h + marginY·(h − 1)): o item exibido
 *    é ≥ altura do card e < altura do card + 1 linha;
 *  - a medida fica em px de layout mesmo com o ancestral em escala;
 *  - nenhum par de itens exibidos se sobrepõe (posições do próprio RGL).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { calcGridItemPosition } from "react-grid-layout/core";

import {
  contentRowsForPx,
  displayLayoutForContent,
  layoutHeightPx,
  measureNaturalHeights,
} from "@/features/dashboard-v2/grid-fit";
import {
  DASHBOARD_GRID_COLS,
  DASHBOARD_GRID_MARGIN,
  DASHBOARD_GRID_ROW_HEIGHT,
  gridCellHeightPx,
  type Layout,
} from "@/features/dashboard-v2/use-negocios-grid";

const UNIT = DASHBOARD_GRID_ROW_HEIGHT + DASHBOARD_GRID_MARGIN[1];
const POSITION = {
  margin: DASHBOARD_GRID_MARGIN,
  containerPadding: [0, 0] as const,
  containerWidth: 1308,
  cols: DASHBOARD_GRID_COLS,
  rowHeight: DASHBOARD_GRID_ROW_HEIGHT,
  maxRows: Number.POSITIVE_INFINITY,
};

/** Gerador determinístico (LCG) para os casos "arbitrários". */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("px → linhas arredonda para cima", () => {
  it("valores do QA: o item cobre o card inteiro", () => {
    // Alturas reais dos cards da conferência (px de layout).
    for (const px of [164, 273, 284, 92, 450, 332, 164.4, 259.6]) {
      const cell = gridCellHeightPx(contentRowsForPx(px));
      expect(cell).toBeGreaterThanOrEqual(px);
      expect(cell).toBeLessThan(px + UNIT);
    }
  });

  it("alturas arbitrárias: card ≤ item < card + 1 linha, e bate com o RGL", () => {
    const next = rng(198);
    for (let i = 0; i < 2_000; i++) {
      const px = 44 + next() * 2_000;
      const rows = contentRowsForPx(px);
      const cell = gridCellHeightPx(rows);
      expect(cell).toBeGreaterThanOrEqual(px);
      expect(cell).toBeLessThan(px + UNIT);
      expect(calcGridItemPosition(POSITION, 0, 0, 12, rows).height).toBe(cell);
    }
  });
});

describe("medida em px de layout", () => {
  function fakeEl(layoutPx: number, scale: number, scrollPx = 0): HTMLElement {
    const el = document.createElement("div");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 600 * scale,
      bottom: layoutPx * scale,
      width: 600 * scale,
      height: layoutPx * scale,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(el, "offsetWidth", { value: 600 });
    Object.defineProperty(el, "offsetHeight", { value: Math.round(layoutPx) });
    Object.defineProperty(el, "scrollHeight", { value: scrollPx });
    return el;
  }

  it("ancestral em escala (0,932): desfaz a escala em vez de medir 7% a menos", () => {
    const el = fakeEl(273, 0.932);
    expect(layoutHeightPx(el)).toBeCloseTo(273, 5);
    // Antes: 273 × 0,932 = 254 px → 11 linhas (260 px) < 273 → transbordava.
    expect(gridCellHeightPx(contentRowsForPx(layoutHeightPx(el)))).toBeGreaterThanOrEqual(273);
  });

  it("nunca abaixo de scrollHeight (conteúdo que passa da caixa)", () => {
    expect(layoutHeightPx(fakeEl(200, 1, 230))).toBe(230);
  });

  it("measureNaturalHeights usa a medida de layout e devolve o estilo", () => {
    const root = document.createElement("div");
    const el = fakeEl(450, 0.932);
    el.dataset.gridMeasure = "agents";
    root.appendChild(el);
    const heights = measureNaturalHeights(root);
    expect(heights.get("agents")).toBeCloseTo(450, 5);
    expect(el.style.cssText).toBe("");
  });
});

describe("exibição sem sobreposição", () => {
  function overlaps(a: DOMRectLike, b: DOMRectLike) {
    return (
      a.left < b.left + b.width &&
      b.left < a.left + a.width &&
      a.top < b.top + b.height &&
      b.top < a.top + a.height
    );
  }
  type DOMRectLike = { left: number; top: number; width: number; height: number };

  it("layouts e alturas arbitrários: cada item ≥ card e nenhum par sobreposto", () => {
    const next = rng(1308);
    for (let round = 0; round < 200; round++) {
      // Linhas com 1–3 cards; h salvo ora maior, ora menor que o conteúdo
      // (piso = conteúdo: quem cresce empurra os de baixo).
      const layout: Layout = [];
      const content = new Map<string, number>();
      let y = 0;
      for (let row = 0; row < 5; row++) {
        const count = 1 + Math.floor(next() * 3);
        const w = DASHBOARD_GRID_COLS / count;
        let rowH = 0;
        for (let c = 0; c < count; c++) {
          const id = `r${row}c${c}`;
          const px = 44 + next() * 600;
          const h = Math.max(1, contentRowsForPx(px) + Math.floor(next() * 40) - 12);
          content.set(id, px);
          layout.push({ i: id, x: c * w, y, w, h });
          rowH = Math.max(rowH, h);
        }
        y += rowH;
      }
      const rows = new Map([...content].map(([id, px]) => [id, contentRowsForPx(px)]));
      const shown = displayLayoutForContent(layout, rows, DASHBOARD_GRID_COLS);
      const rects = shown.map((item) => ({
        id: item.i,
        ...calcGridItemPosition(POSITION, item.x, item.y, item.w, item.h),
      }));
      for (const rect of rects) {
        expect(rect.height).toBeGreaterThanOrEqual(content.get(rect.id)!);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
        }
      }
    }
  });
});
