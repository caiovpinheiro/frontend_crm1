/*
 * "Ajustar alturas ao conteúdo" (modo Organizar do Dashboard de Negócios).
 *
 * Cada card da grade estica até a célula (`h-full`), então a altura que ele
 * ocupa na tela não diz quanto o conteúdo precisa. `measureNaturalHeights`
 * solta o card da célula por um instante (estilo inline, sem pintar entre a
 * troca e a leitura), lê a altura natural e devolve o estilo. Com as alturas
 * em pixels, `fitLayoutToContent` recalcula o `h` de cada card em linhas da
 * grade, sem descer do mínimo do tipo (gráficos e tabelas têm mínimos
 * maiores). `displayLayoutForContent` usa as mesmas medidas no modo leitura,
 * só na exibição. Puro — testado em grid-organizar.test.tsx e
 * grid-leitura-altura.test.tsx.
 */

import { verticalCompactor } from "react-grid-layout";

import {
  gridRowsForPx,
  type Layout,
  type LayoutItem,
} from "@/features/dashboard-v2/use-negocios-grid";

/** Teto de linhas por card (o mesmo do auto-size da exibição). */
export const FIT_MAX_ROWS = 120;

/** Linhas da grade para uma altura de conteúdo (px), com piso e teto. */
export function contentRowsForPx(px: number, minRows = 2): number {
  return Math.min(FIT_MAX_ROWS, gridRowsForPx(px, minRows));
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
    if (px == null || !Number.isFinite(px) || px <= 0) {
      return { ...item };
    }
    return { ...item, h: contentRowsForPx(px, item.minH ?? 2) };
  });
}

/**
 * Altura do elemento em px de LAYOUT (os mesmos da grade). O
 * `getBoundingClientRect` vem depois de transforms: com um ancestral em
 * `scale` (ex.: viewport emulado e reduzido para caber, zoom por transform)
 * ele devolve ~7% a menos, a conversão em linhas ficava curta e o card
 * transbordava a célula, invadindo o de baixo. Desfaz a escala pela largura
 * (rect.width / offsetWidth) e nunca fica abaixo de `scrollHeight` /
 * `offsetHeight`, que não sofrem transform.
 */
export function layoutHeightPx(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const scale = el.offsetWidth > 0 && rect.width > 0 ? rect.width / el.offsetWidth : 1;
  const fromRect = rect.height / scale;
  return Math.max(fromRect, el.scrollHeight, el.offsetHeight);
}

/**
 * Altura natural (px de layout) de cada `[data-grid-measure]` dentro de
 * `root`: o contêiner do card deixa de ser flex-1 por um instante e passa a
 * ter a altura do card inteiro (borda e padding inclusos; `flow-root` segura
 * margens dos filhos, que de outro modo vazariam para fora da medida).
 * Leitura síncrona — o navegador não pinta o estado intermediário.
 */
export function measureNaturalHeights(root: HTMLElement | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!root) return out;
  const nodes = root.querySelectorAll<HTMLElement>("[data-grid-measure]");
  nodes.forEach((el) => {
    const id = el.dataset.gridMeasure;
    if (!id) return;
    const previous = el.style.cssText;
    el.style.flex = "none";
    el.style.height = "auto";
    el.style.display = "flow-root";
    const height = layoutHeightPx(el);
    el.style.cssText = previous;
    out.set(id, height);
  });
  return out;
}

/*
 * Modo leitura (fora do "Organizar"): a altura EXIBIDA acompanha o conteúdo.
 *
 * O card estica até a célula (`h-full`); com um layout salvo antigo (ex.: "Uso
 * do sistema" com h enorme) isso virava um bloco branco de 1.000 px com 200 px
 * de conteúdo. Aqui só a exibição muda — o layout salvo não é tocado:
 *  - altura de cada card = linhas do card inteiro medido (inclusive "Evolução
 *    diária", com o aviso "Série em formação"). O conteúdo é o piso: card
 *    maior que o `h` salvo também aparece inteiro — antes o `h` salvo era o
 *    teto e o card (overflow hidden) cortava a base do gráfico;
 *  - sem medida ainda, o card fica com o `h` salvo;
 *  - a grade é dividida em faixas (linhas horizontais que nenhum card cruza no
 *    layout salvo). Em cada faixa os cards sobem (compactação vertical) e os
 *    que terminam a faixa — sem card abaixo na mesma coluna — esticam até o fim
 *    do mais alto dela: cards lado a lado terminam alinhados, sem vão embaixo
 *    do mais baixo. Se um card cresce, os de baixo descem (sem sobrepor);
 *  - as faixas são empilhadas sem buracos.
 */
export function displayLayoutForContent(
  layout: Layout,
  contentRows: ReadonlyMap<string, number>,
  cols: number,
): Layout {
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const bands: Layout[] = [];
  let bandBottom = -1;
  for (const item of sorted) {
    if (bands.length === 0 || item.y >= bandBottom) {
      bands.push([item]);
      bandBottom = item.y + item.h;
    } else {
      bands[bands.length - 1]!.push(item);
      bandBottom = Math.max(bandBottom, item.y + item.h);
    }
  }

  const out = new Map<string, LayoutItem>();
  let offset = 0;
  for (const band of bands) {
    const top = Math.min(...band.map((item) => item.y));
    const shrunk = band.map((item) => {
      const rows = contentRows.get(item.i);
      const fits = rows != null && Number.isFinite(rows) && rows > 0;
      return { ...item, y: item.y - top, h: fits ? rows : item.h };
    });
    const compacted = verticalCompactor.compact(shrunk, cols) as Layout;
    const bandHeight = Math.max(...compacted.map((item) => item.y + item.h));
    for (const item of compacted) {
      const hasBelow = compacted.some(
        (other) =>
          other !== item &&
          other.y >= item.y + item.h &&
          other.x < item.x + item.w &&
          item.x < other.x + other.w,
      );
      const h = hasBelow ? item.h : bandHeight - item.y;
      out.set(item.i, { ...item, y: item.y + offset, h });
    }
    offset += bandHeight;
  }
  return layout.map((item) => out.get(item.i) ?? { ...item });
}
