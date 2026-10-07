/*
 * Regras puras dos gráficos de Equipe (aba Atendimentos).
 */

import type { PainelDeptHourRow, PainelTeamRankRow } from "./painel-api";

/** Mínimo de conversas encerradas para entrar no ranking de tempo. */
export const MIN_SERVICE_SAMPLE = 3;

export function rankByAttended(rows: PainelTeamRankRow[]): PainelTeamRankRow[] {
  return rows
    .filter((r) => r.attended > 0)
    .sort(
      (a, b) =>
        b.attended - a.attended ||
        b.finished - a.finished ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
}

/** Mais rápido primeiro (ou mais lento, com `slowestFirst`). */
export function rankByServiceTime(
  rows: PainelTeamRankRow[],
  slowestFirst = false,
  minSample = MIN_SERVICE_SAMPLE,
): PainelTeamRankRow[] {
  const mul = slowestFirst ? -1 : 1;
  return rows
    .filter((r) => r.serviceMeanMs != null && r.serviceSample >= minSample)
    .sort(
      (a, b) =>
        ((a.serviceMeanMs as number) - (b.serviceMeanMs as number)) * mul ||
        b.serviceSample - a.serviceSample ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
}

/** Média da equipe ponderada pelo número de conversas de cada atendente. */
export function teamMeanMs(rows: PainelTeamRankRow[]): number | null {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    if (r.serviceMeanMs == null || r.serviceSample <= 0) continue;
    sum += r.serviceMeanMs * r.serviceSample;
    n += r.serviceSample;
  }
  return n ? sum / n : null;
}

/** 0–1 de intensidade; escala geral (todas as células) ou por linha. */
export function heatIntensity(
  value: number,
  row: PainelDeptHourRow,
  globalMax: number,
  perRow: boolean,
): number {
  if (value <= 0) return 0;
  const max = perRow ? Math.max(0, ...row.hours) : globalMax;
  return max > 0 ? Math.min(1, value / max) : 0;
}

/** Hora mais movimentada do departamento (ou null sem dados). */
export function peakHour(hours: number[]): number | null {
  let best = -1;
  let bestVal = 0;
  hours.forEach((v, h) => {
    if (v > bestVal) {
      bestVal = v;
      best = h;
    }
  });
  return best >= 0 ? best : null;
}

export function hourRangeLabel(h: number): string {
  return `${String(h).padStart(2, "0")}h–${String((h + 1) % 24).padStart(2, "0")}h`;
}

export const HEAT_BINS = 5;

/** Faixa 0 (vazio) ou 1..HEAT_BINS a partir da intensidade 0–1. */
export function heatBin(intensity: number): number {
  if (!(intensity > 0)) return 0;
  return Math.min(HEAT_BINS, Math.max(1, Math.ceil(intensity * HEAT_BINS)));
}

/** Limites numéricos de cada faixa (legenda), coerentes com `heatBin`. */
export function heatBinRanges(
  max: number,
): { bin: number; from: number; to: number }[] {
  if (!(max > 0)) return [];
  const top = Math.round(max);
  const out: { bin: number; from: number; to: number }[] = [];
  for (let b = 1; b <= HEAT_BINS; b++) {
    // menor inteiro v com ceil(v/max*BINS) === b  →  v > max*(b-1)/BINS
    const from = Math.max(1, Math.floor((top * (b - 1)) / HEAT_BINS) + 1);
    const to = Math.floor((top * b) / HEAT_BINS);
    if (to >= from) out.push({ bin: b, from, to });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ranking de atendimento: barra com a parte encerrada dentro do total.

export type AttendedParts = {
  total: number;
  /** Encerradas, limitadas ao total (a base de "encerradas" é outra: ver nota do card). */
  closed: number;
  open: number;
  /** 0–100, arredondado a 1 casa; 0 sem atendimentos. */
  closedPct: number;
};

export function attendedParts(attended: number, finished: number): AttendedParts {
  const total = Math.max(0, attended);
  const closed = Math.min(total, Math.max(0, finished));
  const closedPct = total > 0 ? Math.round((closed / total) * 1000) / 10 : 0;
  return { total, closed, open: total - closed, closedPct };
}

// ---------------------------------------------------------------------------
// Ranking de TMA: eixo, diferença para a média da equipe, estados.

/** Diferenças menores que isto contam como "na média". */
export const ON_AVERAGE_MS = 30_000;

export type MeanDelta =
  | { kind: "none" }
  | { kind: "on" }
  | { kind: "faster" | "slower"; ms: number };

export function deltaFromTeam(ms: number | null, teamMean: number | null): MeanDelta {
  if (ms == null || teamMean == null) return { kind: "none" };
  const diff = ms - teamMean;
  if (Math.abs(diff) < ON_AVERAGE_MS) return { kind: "on" };
  return diff < 0 ? { kind: "faster", ms: -diff } : { kind: "slower", ms: diff };
}

const AXIS_STEPS_MIN = [1, 2, 5, 10, 15, 20, 30, 60, 120, 240, 480, 720, 1440, 2880, 5760];
const AXIS_MAX_INTERVALS = 4;

/** Eixo do ranking de TMA: topo "redondo" (até 4 intervalos) e os rótulos em ms. */
export function durationAxis(maxMs: number): { maxMs: number; ticks: number[] } {
  const maxMin = Math.max(1, Math.ceil((Number.isFinite(maxMs) ? maxMs : 0) / 60_000));
  const step =
    AXIS_STEPS_MIN.find((s) => Math.ceil(maxMin / s) <= AXIS_MAX_INTERVALS) ??
    AXIS_STEPS_MIN[AXIS_STEPS_MIN.length - 1]!;
  const top = Math.ceil(maxMin / step) * step;
  const ticks: number[] = [];
  for (let m = 0; m <= top; m += step) ticks.push(m * 60_000);
  return { maxMs: top * 60_000, ticks };
}

/** Maior valor que entra no eixo (média, mediana e a média da equipe). */
export function axisMaxMs(rows: PainelTeamRankRow[], teamMean: number | null): number {
  let max = teamMean ?? 0;
  for (const r of rows) {
    max = Math.max(max, r.serviceMeanMs ?? 0, r.serviceMedianMs ?? 0);
  }
  return max;
}

export type RankingState = "empty" | "few" | "ok";

/**
 * Estado do ranking de tempo: sem ninguém com amostra suficiente → `empty`;
 * `few` = há gente fora por amostra mínima (o card avisa quantos).
 */
export function serviceRankingState(
  all: PainelTeamRankRow[],
  minSample = MIN_SERVICE_SAMPLE,
): { state: RankingState; left: number } {
  const ranked = all.filter((r) => r.serviceMeanMs != null && r.serviceSample >= minSample);
  const left = all.filter((r) => r.serviceSample > 0 && r.serviceSample < minSample).length;
  if (ranked.length === 0) return { state: "empty", left };
  return { state: left > 0 ? "few" : "ok", left };
}

// ---------------------------------------------------------------------------
// Aviso de período cortado (backend limita a 90 dias).

export function rangeClampedNotice(
  clamped: boolean | undefined,
  effectiveFrom: string | undefined,
): string | null {
  if (!clamped) return null;
  const date = effectiveFrom ? new Date(effectiveFrom) : null;
  const since =
    date && !Number.isNaN(date.getTime())
      ? ` (desde ${date.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          timeZone: "America/Sao_Paulo",
        })})`
      : "";
  return `período limitado a 90 dias${since}`;
}

// ---------------------------------------------------------------------------
// Mapa de calor: totais da margem.

/** Pico por hora (índice e valor) da linha "total por hora". */
export function peakOfTotals(totals: number[]): { hour: number; value: number } | null {
  const hour = peakHour(totals);
  return hour == null ? null : { hour, value: totals[hour]! };
}

// ---------------------------------------------------------------------------
// Textos compartilhados dos cards de equipe.

/** "12,3%" (0 quando não há base). */
export function shareLabel(part: number, whole: number): string {
  if (!(whole > 0)) return "0%";
  return `${((part / whole) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Subtítulo do card + escopo dos filtros da aba + aviso de período cortado. */
export function teamSubtitle(
  base: string,
  opts: { filtered?: boolean; notice?: string | null },
): string {
  return `${base}${opts.filtered ? " · com os filtros da aba" : ""}${opts.notice ? ` · ${opts.notice}` : ""}`;
}

/** Rótulo curto do eixo de duração: `0`, `20min`, `1h`, `1h30`, `2d`. */
export function axisDurationLabel(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min <= 0) return "0";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 48) return `${Math.round(h / 24)}d`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
