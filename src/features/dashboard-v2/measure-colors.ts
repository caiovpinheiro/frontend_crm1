/*
 * Cor pelo que se mede, nos gráficos do dashboard.
 *
 *   tempo          → violeta   (Uso do sistema, Ranking de TMA)
 *   conversas      → azul da marca (Mapa de calor, Ranking de atendimento)
 *   transferências → turquesa
 *   departamento   → 3 categóricas (Tabulações)
 *
 * Os valores (claro/escuro) vivem em `styles/ds-tokens.css`. Aqui só ficam as
 * referências e as misturas, que partem sempre da superfície do card.
 */

export type Measure = "time" | "conversations" | "transfers";

export const MEASURE_COLOR: Record<Measure, string> = {
  time: "var(--measure-time)",
  conversations: "var(--measure-conversations)",
  transfers: "var(--measure-transfers)",
};

export const DEPT_COLORS = ["var(--dept-1)", "var(--dept-2)", "var(--dept-3)"] as const;

/** Mistura `color` com a superfície do card: `amount`% de cor. */
export function tint(color: string, amount: number): string {
  return `color-mix(in oklch, ${color} ${amount}%, var(--card))`;
}

/** Tom da barra de "total em aberto" (parte ainda não encerrada). */
export function openTone(color: string): string {
  return tint(color, 34);
}

/** Tom mais claro para quem está abaixo da média. */
export function belowAverageTone(color: string): string {
  return tint(color, 50);
}

/** Porcentagem de cor de cada faixa do mapa de calor (0 = vazio). */
export const HEAT_STEPS = [0, 16, 34, 54, 76, 100] as const;

export function heatFill(color: string, bin: number): string | undefined {
  if (bin <= 0) return undefined;
  const step = HEAT_STEPS[Math.min(bin, HEAT_STEPS.length - 1)]!;
  return tint(color, step);
}

export function isBelowAverage(value: number, average: number): boolean {
  return value < average;
}

export type DeptTotal = { id: string; name: string; count: number };

/**
 * Uma cor por departamento, sem repetir: só os 3 de maior volume ganham cor
 * (empate decide pelo nome). Os demais ficam sem cor (`null`) e o gráfico os
 * desenha em tom neutro — a legenda os agrupa em "Outros".
 */
export function assignDeptColors(depts: DeptTotal[]): Map<string, string | null> {
  const ranked = [...depts].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"),
  );
  const out = new Map<string, string | null>();
  ranked.forEach((d, i) => out.set(d.id, DEPT_COLORS[i] ?? null));
  return out;
}
