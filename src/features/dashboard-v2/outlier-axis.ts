/*
 * Eixo recortado para dias atípicos (ex.: importação de conversas).
 *
 * Um dia muito acima dos demais (>10× a mediana dos dias com valor) achata o
 * resto do gráfico: os outros dias ficam entre 0 e 4 e somem ao lado de uma
 * barra de ~1.000. Aqui detectamos esses dias e calculamos um teto "redondo"
 * que cabe todos os outros; o gráfico recorta a barra no teto e escreve o valor
 * real nela. O tooltip continua mostrando o valor real. Puro — testado em
 * outlier-axis.test.ts.
 */

import { formatNumber } from "./format";

/** Quantas vezes acima da mediana um dia precisa estar para ser "atípico". */
export const OUTLIER_FACTOR = 10;
/** Com poucos dias com valor a mediana não diz nada: não há detecção. */
export const OUTLIER_MIN_DAYS = 4;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Teto "redondo" (1, 2, 5 × 10^k) a partir de `value`. */
export function niceCeil(value: number): number {
  if (!(value > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const unit = value / pow;
  const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return step * pow;
}

export type OutlierAnalysis = {
  hasOutlier: boolean;
  /** Mediana dos valores > 0 de todas as séries. */
  median: number;
  /** Acima disto o valor é atípico (`OUTLIER_FACTOR` × mediana). */
  threshold: number;
  /** Teto do eixo recortado (cabe todos os dias típicos). */
  cap: number;
  /** Índices (do dia) em que alguma série passa do limite. */
  outlierIndexes: number[];
};

/**
 * `series`: um array por série, todos com o mesmo tamanho (um valor por dia).
 * Só valores > 0 entram na mediana (dias sem movimento não puxam a mediana a 0).
 */
export function analyzeOutliers(series: number[][]): OutlierAnalysis {
  const positives = series.flat().filter((v) => Number.isFinite(v) && v > 0);
  const none: OutlierAnalysis = {
    hasOutlier: false,
    median: median(positives),
    threshold: Infinity,
    cap: Math.max(1, ...positives),
    outlierIndexes: [],
  };
  if (positives.length < OUTLIER_MIN_DAYS) return none;
  const med = median(positives);
  const threshold = med * OUTLIER_FACTOR;
  const typical = positives.filter((v) => v <= threshold);
  if (typical.length === positives.length || typical.length === 0) return none;

  const days = Math.max(0, ...series.map((s) => s.length));
  const outlierIndexes: number[] = [];
  for (let i = 0; i < days; i++) {
    if (series.some((s) => (s[i] ?? 0) > threshold)) outlierIndexes.push(i);
  }
  // 15% de folga para a barra do maior dia típico não encostar no topo.
  const cap = niceCeil(Math.max(...typical) * 1.15);
  return { hasOutlier: true, median: med, threshold, cap, outlierIndexes };
}

/** "2026-09-15" → "15/09". */
export function dayLabelBR(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return month && day ? `${day}/${month}` : isoDate;
}

/** Nota sob o gráfico: quais dias foram recortados e em quanto. */
export function outlierNote(
  analysis: OutlierAnalysis,
  days: { date: string; values: number[] }[],
): string | null {
  if (!analysis.hasOutlier) return null;
  const parts = analysis.outlierIndexes.map((i) => {
    const day = days[i];
    if (!day) return "";
    const peak = Math.max(...day.values);
    return `${dayLabelBR(day.date)} (${formatNumber(peak)})`;
  });
  const list = parts.filter(Boolean).join(", ");
  return `Dia atípico (ex.: importação): ${list}. Eixo recortado em ${formatNumber(analysis.cap)} para os demais dias aparecerem; o valor real está na barra e no balão.`;
}
