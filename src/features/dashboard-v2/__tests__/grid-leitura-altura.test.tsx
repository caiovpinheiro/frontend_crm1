/** @vitest-environment jsdom */
/**
 * Modo leitura do Dashboard de Negócios (QA de produção): com o layout salvo
 * antigo, "Uso do sistema hoje" media 1.001 px com ~200 px de conteúdo e a
 * célula dos KPIs deixava 63 px vazios antes do Funil. Agora:
 *  - a altura EXIBIDA de cada card = linhas do conteúdo medido, nunca acima do
 *    `h` salvo; a grade recompacta (os cards sobem);
 *  - cards lado a lado terminam alinhados (o mais baixo estica até o mais alto
 *    da faixa);
 *  - nada é gravado (nenhuma chamada de `onLayoutChange` → nenhum PATCH);
 *  - no modo Organizar a grade continua com as alturas salvas.
 */
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gridProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));

vi.mock("react-grid-layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-grid-layout")>();
  return {
    ...actual,
    // jsdom não mede: grade falsa que expõe o layout recebido.
    default: (props: { layout: unknown; children: ReactNode }) => {
      gridProps.last = props as unknown as Record<string, unknown>;
      return (
        <div data-testid="grid" data-layout={JSON.stringify(props.layout)}>
          {props.children}
        </div>
      );
    },
    useContainerWidth: () => ({ width: 1028, containerRef: { current: null }, mounted: true }),
  };
});

import {
  AUTO_SIZE_DEBOUNCE_MS,
  SortableWidgetGrid,
} from "@/features/dashboard-v2/components/sortable-widget-grid";
import { contentRowsForPx, displayLayoutForContent } from "@/features/dashboard-v2/grid-fit";
import { gridCellHeightPx, type Layout } from "@/features/dashboard-v2/use-negocios-grid";

const COLS = 12;

// Layout salvo da evidência: "Uso do sistema" w6 com h enorme ao lado da
// "Evolução diária", KPIs com célula maior que o conteúdo.
const SAVED: Layout = [
  { i: "kpis", x: 0, y: 0, w: 12, h: 6, minH: 3 },
  { i: "funnel", x: 0, y: 6, w: 12, h: 8, minH: 5 },
  { i: "usage", x: 0, y: 14, w: 6, h: 42, minH: 6 },
  { i: "evolution", x: 6, y: 14, w: 6, h: 14, minH: 8 },
  { i: "sources", x: 0, y: 56, w: 6, h: 8, minH: 4 },
  { i: "agents", x: 0, y: 64, w: 12, h: 10, minH: 5 },
];

/** Alturas naturais simuladas (px) do conteúdo de cada card. */
const NATURAL: Record<string, number> = {
  kpis: 76,
  funnel: 180,
  usage: 200,
  // Card inteiro da Evolução (cabeçalho + gráfico de 280 px + padding).
  evolution: 332,
  sources: 56,
  agents: 230,
};

/** Alturas trocadas por um teste (limpas no afterEach). */
const override: Record<string, number> = {};

function byId(layout: Layout) {
  return Object.fromEntries(layout.map((item) => [item.i, item]));
}

beforeEach(() => {
  gridProps.last = null;
  vi.useFakeTimers();
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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const id = this.dataset.gridMeasure;
    const height = id ? (override[id] ?? NATURAL[id] ?? 0) : 0;
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height } as DOMRect;
  });
});

afterEach(() => {
  for (const key of Object.keys(override)) delete override[key];
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(
  organizing: boolean,
  onLayoutChange = vi.fn(),
  { layout = SAVED, persistEnabled = true }: { layout?: Layout; persistEnabled?: boolean } = {},
) {
  const view = render(
    <SortableWidgetGrid
      layout={layout}
      persistEnabled={persistEnabled}
      onLayoutChange={onLayoutChange}
      labels={{}}
      organizing={organizing}
      onRemove={() => {}}
      render={(id) => <article data-card={id}>{id}</article>}
    />,
  );
  return { view, onLayoutChange };
}

function shown(view: ReturnType<typeof render>): Layout {
  return JSON.parse(view.getByTestId("grid").dataset.layout!) as Layout;
}

describe("modo leitura: altura exibida pelo conteúdo", () => {
  it("layout salvo com h enorme → exibe o h do conteúdo, recompacta e não grava nada", async () => {
    const { view, onLayoutChange } = mount(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SIZE_DEBOUNCE_MS + 10);
    });
    const h = byId(shown(view));
    // KPIs: 76 px → 4 linhas (92 px), não mais 6 (140 px).
    expect(h.kpis!.h).toBe(contentRowsForPx(76));
    expect(h.kpis!.h).toBe(4);
    expect(h.funnel!.y).toBe(4);
    // "Uso do sistema": 200 px pediriam 9 linhas, mas a "Evolução diária" ao
    // lado mede 332 px (14 linhas) → os dois terminam juntos em 14, não 42.
    expect(h.usage!.h).toBe(14);
    expect(h.evolution!.h).toBe(14);
    expect(h.usage!.y).toBe(h.evolution!.y);
    expect(gridCellHeightPx(h.usage!.h)).toBeLessThan(400);
    // Cards de baixo sobem (sem os ~640 px vazios).
    expect(h.sources!.y).toBe(h.usage!.y + 14);
    expect(h.agents!.y).toBe(h.sources!.y + h.sources!.h);
    // Nada vai para o servidor nem para o layout salvo.
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it("Evolução maior que o h salvo (357 px × 309 px): aparece inteira, sem gravar", async () => {
    // Conferência na DEV: h 13 (308 px) salvo, card de 357 px → eixo X cortado.
    override.evolution = 357;
    const layout = SAVED.map((item) => (item.i === "evolution" ? { ...item, h: 13 } : item));
    const { view, onLayoutChange } = mount(false, vi.fn(), { layout, persistEnabled: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SIZE_DEBOUNCE_MS + 10);
    });
    const h = byId(shown(view));
    expect(gridCellHeightPx(h.evolution!.h)).toBeGreaterThanOrEqual(357);
    // Alinhado com o vizinho e quem está embaixo desce (sem sobrepor).
    expect(h.usage!.h).toBe(h.evolution!.h);
    expect(h.sources!.y).toBeGreaterThanOrEqual(h.evolution!.y + h.evolution!.h);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it("Evolução com o aviso 'Série em formação': o aviso entra na medida", async () => {
    // Mesmo card + a linha do aviso (mt-2 + 16 px de texto).
    override.evolution = 357 + 24;
    const layout = SAVED.map((item) => (item.i === "evolution" ? { ...item, h: 13 } : item));
    const { view } = mount(false, vi.fn(), { layout, persistEnabled: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SIZE_DEBOUNCE_MS + 10);
    });
    const h = byId(shown(view));
    expect(gridCellHeightPx(h.evolution!.h)).toBeGreaterThanOrEqual(381);
  });

  it("com o salvo habilitado, o crescimento da Evolução só vai ao localStorage (auto)", async () => {
    override.evolution = 357;
    const layout = SAVED.map((item) => (item.i === "evolution" ? { ...item, h: 13 } : item));
    const { onLayoutChange } = mount(false, vi.fn(), { layout });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SIZE_DEBOUNCE_MS + 10);
    });
    for (const call of onLayoutChange.mock.calls) expect(call[1]).toBe("auto");
  });

  it("modo Organizar: alturas salvas intactas", async () => {
    const { view, onLayoutChange } = mount(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_SIZE_DEBOUNCE_MS + 10);
    });
    const h = byId(shown(view));
    for (const item of SAVED) expect(h[item.i]).toMatchObject({ y: item.y, h: item.h });
    expect(onLayoutChange).not.toHaveBeenCalled();
  });
});

describe("displayLayoutForContent", () => {
  it("dois cards na mesma linha terminam alinhados pela maior altura de conteúdo", () => {
    const layout: Layout = [
      { i: "a", x: 0, y: 0, w: 6, h: 20 },
      { i: "b", x: 6, y: 0, w: 6, h: 10 },
      { i: "c", x: 0, y: 20, w: 12, h: 6 },
    ];
    const out = byId(
      displayLayoutForContent(
        layout,
        new Map([
          ["a", 5],
          ["b", 8],
          ["c", 3],
        ]),
        COLS,
      ),
    );
    expect(out.a).toMatchObject({ y: 0, h: 8 });
    expect(out.b).toMatchObject({ y: 0, h: 8 });
    expect(out.c).toMatchObject({ y: 8, h: 3 });
  });

  it("conteúdo maior que o salvo aparece inteiro (piso = conteúdo); sem medida mantém o salvo", () => {
    const layout: Layout = [
      { i: "a", x: 0, y: 0, w: 12, h: 4 },
      { i: "b", x: 0, y: 4, w: 12, h: 6 },
    ];
    const out = byId(displayLayoutForContent(layout, new Map([["a", 30]]), COLS));
    expect(out.a).toMatchObject({ y: 0, h: 30 });
    expect(out.b).toMatchObject({ y: 30, h: 6 });
  });

  it("coluna empilhada ao lado de um card alto: o fim da faixa alinha", () => {
    const layout: Layout = [
      { i: "usage", x: 0, y: 0, w: 7, h: 12 },
      { i: "in", x: 7, y: 0, w: 5, h: 6 },
      { i: "out", x: 7, y: 6, w: 5, h: 6 },
    ];
    const out = byId(
      displayLayoutForContent(
        layout,
        new Map([
          ["usage", 9],
          ["in", 4],
          ["out", 4],
        ]),
        COLS,
      ),
    );
    // Pilha 4 + 4 = 8 < 9: "out" estica até o fim do "usage".
    expect(out.in).toMatchObject({ y: 0, h: 4 });
    expect(out.out).toMatchObject({ y: 4, h: 5 });
    expect(out.usage).toMatchObject({ y: 0, h: 9 });
  });

  it("não altera a entrada", () => {
    const snapshot = JSON.stringify(SAVED);
    displayLayoutForContent(SAVED, new Map([["usage", 3]]), COLS);
    expect(JSON.stringify(SAVED)).toBe(snapshot);
  });
});
