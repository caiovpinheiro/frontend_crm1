/*
 * Negócios fora do desktop: o `react-grid-layout` posiciona cada card em pixels
 * absolutos sobre 12 colunas medidas no container. Isso funciona no desktop, mas
 * abaixo de 1.024 px as colunas ficam estreitas demais (no celular, "Uso do
 * sistema" e "Evolução" dividiam a tela em duas colunas de ~180 px) e a largura
 * medida não acompanha a do <main> (tablet com faixa vazia à direita).
 *
 * Abaixo de `FLUID_GRID_BREAKPOINT` os cards entram numa grade CSS fluida: 1
 * coluna no celular e, no tablet, a mesma proporção de colunas do layout salvo.
 * Puro — testado em fluid-grid.test.ts.
 */

/** Largura de janela (px) a partir da qual vale o grid de 12 colunas em pixels. */
export const FLUID_GRID_BREAKPOINT = 1024;

type PositionedItem = { i: string; x: number; y: number; w: number };

/** Ordem de leitura do layout salvo: de cima para baixo, da esquerda para a direita. */
export function fluidOrder(layout: readonly PositionedItem[]): string[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x).map((item) => item.i);
}

// Classes literais para o Tailwind enxergar cada uma.
const SPAN_CLASS: Record<number, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  5: "md:col-span-5",
  6: "md:col-span-6",
  7: "md:col-span-7",
  8: "md:col-span-8",
  9: "md:col-span-9",
  10: "md:col-span-10",
  11: "md:col-span-11",
  12: "md:col-span-12",
};

/**
 * Colunas que o card ocupa no tablet (md+). No celular é sempre 1 coluna. Card
 * com menos de 4 colunas no layout sobe para 4 (senão fica ilegível no tablet).
 */
export function fluidSpanClass(w: number): string {
  const span = Math.min(12, Math.max(4, Math.round(Number.isFinite(w) ? w : 12)));
  return SPAN_CLASS[span]!;
}

/** Contêiner da grade fluida: 1 coluna no celular, 12 no tablet. */
export const FLUID_GRID_CLASS = "grid grid-cols-1 items-start gap-1.5 md:grid-cols-12";
