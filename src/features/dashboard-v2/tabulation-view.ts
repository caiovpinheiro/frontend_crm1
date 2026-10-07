/*
 * Regras puras do card "Principais tabulações": cor = departamento (3 categóricas,
 * sem repetir), participação por departamento e a linha de cada motivo.
 * Testado em tabulation-view.test.ts.
 */

import { DEPT_COLORS, assignDeptColors } from "./measure-colors";

export const PATH_SEPARATOR = " › ";
export const NO_DEPARTMENT_ID = "__none__";
export const NO_DEPARTMENT_NAME = "Sem departamento";

/**
 * Quem fez a tabulação (campo ADITIVO de /api/analytics/tabulations; o backend
 * atual não manda): usuário humano, automação, agente de IA ou sistema.
 */
export type TabulationActor = {
  kind: "user" | "automation" | "ai_agent" | "system";
  id: string | null;
  name: string | null;
};

/**
 * Texto da coluna "Agente" do log de tabulações.
 *  - sem `actor` (backend atual): como sempre, `actorName` ou "—";
 *  - humano: o nome;
 *  - automação: "Automação"; IA: "IA · <nome>" (só "IA" sem nome); sistema: "Sistema".
 */
export function tabulationActorLabel(item: {
  actorName: string | null;
  actor?: TabulationActor | null;
}): string {
  const actor = item.actor;
  if (!actor) return item.actorName ?? "—";
  switch (actor.kind) {
    case "automation":
      return "Automação";
    case "ai_agent": {
      const name = (actor.name ?? item.actorName ?? "").trim();
      return name ? `IA · ${name}` : "IA";
    }
    case "system":
      return "Sistema";
    case "user":
    default:
      return actor.name ?? item.actorName ?? "—";
  }
}

export type TabulationRowInput = {
  tabulationId: string;
  name: string;
  number?: number | null;
  path: string;
  departmentId: string | null;
  departmentName: string | null;
  count: number;
};

export type DeptShare = {
  id: string;
  name: string;
  count: number;
  /** Cor categórica (só os 3 maiores); `null` = cinza neutro. */
  color: string | null;
};

export type TabulationSummary = {
  total: number;
  /** Todos os departamentos, do maior para o menor. */
  depts: DeptShare[];
  /** Os que ganham cor (até 3). */
  colored: DeptShare[];
  /** Os demais, agrupados no chip "Outros". */
  others: { count: number; total: number };
  colorByDept: Map<string, string | null>;
};

export function deptKey(row: Pick<TabulationRowInput, "departmentId">): string {
  return row.departmentId ?? NO_DEPARTMENT_ID;
}

export function summarizeTabulations(rows: readonly TabulationRowInput[]): TabulationSummary {
  const byDept = new Map<string, { id: string; name: string; count: number }>();
  let total = 0;
  for (const row of rows) {
    total += row.count;
    const id = deptKey(row);
    const cur = byDept.get(id) ?? { id, name: row.departmentName ?? NO_DEPARTMENT_NAME, count: 0 };
    cur.count += row.count;
    byDept.set(id, cur);
  }
  const colorByDept = assignDeptColors([...byDept.values()]);
  const depts: DeptShare[] = [...byDept.values()]
    .map((d) => ({ ...d, color: colorByDept.get(d.id) ?? null }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
  const colored = depts.filter((d) => d.color != null).slice(0, DEPT_COLORS.length);
  const rest = depts.filter((d) => d.color == null);
  return {
    total,
    depts,
    colored,
    others: { count: rest.length, total: rest.reduce((sum, d) => sum + d.count, 0) },
    colorByDept,
  };
}

export function splitTabulationPath(row: Pick<TabulationRowInput, "path" | "number">): {
  leaf: string;
  prefix: string;
} {
  const parts = row.path.split(PATH_SEPARATOR).filter(Boolean);
  const leaf = parts.length ? parts[parts.length - 1]! : row.path;
  return {
    leaf: row.number != null ? `${leaf} (#${row.number})` : leaf,
    prefix: parts.slice(0, -1).join(PATH_SEPARATOR),
  };
}

/**
 * Segunda linha do motivo: o caminho. Sem caminho, ou sem cor de departamento
 * (cinza não diz de qual departamento é), entra o nome do departamento.
 */
export function tabulationDetail(
  row: Pick<TabulationRowInput, "path" | "number" | "departmentName">,
  color: string | null,
): string {
  const { prefix } = splitTabulationPath(row);
  const dept = row.departmentName ?? "";
  if (!prefix) return dept;
  return color == null && dept ? `${prefix} · ${dept}` : prefix;
}
