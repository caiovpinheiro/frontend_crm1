/*
 * Regras puras do card "Uso do sistema hoje": totais, média e diferença de
 * cada pessoa para a média. Testado em usage-stats.test.ts.
 */

export type UsageRowInput = { id: string; name: string; seconds: number };

/** Abaixo disso a linha ganha o alerta de uso baixo. */
export const LOW_USAGE_SECONDS = 3600;

/** Diferenças menores que isto contam como "na média". */
export const ON_AVERAGE_SECONDS = 300;

export type UsageSummary = {
  total: number;
  average: number;
  active: number;
  /** Na média ou acima dela. */
  atOrAbove: number;
};

export function usageSummary(rows: readonly UsageRowInput[]): UsageSummary {
  const total = rows.reduce((sum, row) => sum + row.seconds, 0);
  const average = rows.length ? Math.round(total / rows.length) : 0;
  return {
    total,
    average,
    active: rows.length,
    atOrAbove: rows.filter((row) => row.seconds >= average).length,
  };
}

export type UsageDelta = { kind: "on" } | { kind: "above" | "below"; seconds: number };

export function usageDelta(seconds: number, average: number): UsageDelta {
  const diff = seconds - average;
  if (Math.abs(diff) < ON_AVERAGE_SECONDS) return { kind: "on" };
  return diff < 0 ? { kind: "below", seconds: -diff } : { kind: "above", seconds: diff };
}

export type UsageSort = "time" | "name";

export function sortUsage<T extends UsageRowInput>(rows: readonly T[], mode: UsageSort): T[] {
  const copy = [...rows];
  if (mode === "name") copy.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  else copy.sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name, "pt-BR"));
  return copy;
}
