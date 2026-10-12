/*
 * "Ajustar alturas ao conteúdo" (modo Organizar do Dashboard de Negócios).
 *
 * Cada card da grade estica até a célula (`h-full`), então a altura que ele
 * ocupa na tela não diz quanto o conteúdo precisa. `measureNaturalHeights`
 * solta o card da célula por um instante (estilo inline, sem pintar entre a
 * troca e a leitura), lê a altura natural e devolve o estilo. Com as alturas
 * em pixels, `fitLayoutToContent` recalcula o `h` de cada card em linhas da
 * grade, sem descer do mínimo do tipo (gráficos e tabelas têm mínimos
 * maiores). Puro — testado em grid-fit.test.ts.
 */

import { gridRowsForPx, type Layout } from "@/features/dashboard-v2/use-negocios-grid";

/** Teto de linhas por card (o mesmo do auto-size da exibição). */
export const FIT_MAX_ROWS = 120;

/** Cards cuja altura não acompanha o conteúdo (gráfico com altura própria). */
const FIXED_HEIGHT_IDS = new Set(["evolution"]);

export function canFitToContent(id: string): boolean {
  return !FIXED_HEIGHT_IDS.has(id);
}

/**
 * Novo layout com `h` = linhas necessárias para a altura medida (px). Cards
 * sem medida (ou com medida 0, ainda sem conteúdo) mantêm o `h`. Nunca abaixo
 * do `minH` do card; nunca acima de `FIT_MAX_ROWS`. Não altera a entrada.
 */
export function fitLayoutToContent(
  layout: Layout,
  heightsPx: ReadonlyMap<string, number>,
): Layout {
  return layout.map((item) => {
    const px = heightsPx.get(item.i);
    if (px == null || !Number.isFinite(px) || px <= 0 || !canFitToContent(item.i)) {
      return { ...item };
    }
    const rows = Math.min(FIT_MAX_ROWS, gridRowsForPx(px, item.minH ?? 2));
    return { ...item, h: rows };
  });
}

/**
 * Altura natural (px) de cada `[data-grid-measure]` dentro de `root`: o
 * contêiner do card deixa de ser flex-1 por um instante e passa a ter a altura
 * do próprio conteúdo. Leitura síncrona — o navegador não pinta o estado
 * intermediário.
 */
export function measureNaturalHeights(root: HTMLElement | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!root) return out;
  const nodes = root.querySelectorAll<HTMLElement>("[data-grid-measure]");
  nodes.forEach((el) => {
    const id = el.dataset.gridMeasure;
    if (!id || !canFitToContent(id)) return;
    const previous = el.style.cssText;
    el.style.flex = "none";
    el.style.height = "auto";
    el.style.display = "block";
    const height = el.getBoundingClientRect().height;
    el.style.cssText = previous;
    out.set(id, height);
  });
  return out;
}
