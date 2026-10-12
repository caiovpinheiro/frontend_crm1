/*
 * Negócios no desktop: a grade salva pode deixar colunas vazias ao lado de um
 * card (ex.: "Evolução diária" w6 sozinha na linha = metade da largura vazia;
 * cards w4 em x7 deixam a coluna 11 vazia). Só NA EXIBIÇÃO (fora do modo
 * "Organizar") cada card cresce para os lados até encostar em outro card que
 * divida alguma linha com ele, ou na borda. O layout salvo não muda: ao
 * organizar, a grade volta às larguras reais.
 * Puro — testado em grid-fill.test.ts.
 */

type Cell = { i: string; x: number; y: number; w: number; h: number };

function sharesRows(a: Cell, b: Cell): boolean {
  return a.y < b.y + b.h && b.y < a.y + a.h;
}

export function fillRowGaps<T extends Cell>(layout: readonly T[], cols: number): T[] {
  const out = layout.map((item) => ({ ...item }));
  const order = [...out].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const item of order) {
    const others = out.filter((o) => o !== item && sharesRows(o, item));
    // Borda esquerda: fim do vizinho mais próximo à esquerda (ou 0).
    const left = others
      .filter((o) => o.x + o.w <= item.x)
      .reduce((edge, o) => Math.max(edge, o.x + o.w), 0);
    // Borda direita: início do vizinho mais próximo à direita (ou `cols`).
    const right = others
      .filter((o) => o.x >= item.x + item.w)
      .reduce((edge, o) => Math.min(edge, o.x), cols);
    if (left < item.x || right > item.x + item.w) {
      item.w = right - left;
      item.x = left;
    }
  }
  return out;
}
