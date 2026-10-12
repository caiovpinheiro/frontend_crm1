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

/** `byUser` de /api/analytics/tabulations vem truncado no top 20 do backend. */
export const TABULATION_BY_USER_LIMIT = 20;

const AUTOMATED_ACTOR_LABEL: Record<Exclude<TabulationActor["kind"], "user">, string> = {
  ai_agent: "IA",
  automation: "Automação",
  system: "Sistema",
};

/**
 * KPI "Quem tabulou": pessoas (`distinctUsers` conta só quem tem usuário) e,
 * separadas, as tabulações sem pessoa (IA, automação, sistema). Antes o card
 * dizia "Agentes que tabularam 0" quando as 16 tabulações eram da IA.
 *
 *  - `automated`: total − soma de `byUser` (mesma base no backend: a tabulação
 *    mais recente de cada conversa). `null` quando `byUser` pode estar truncado.
 *  - `kinds`: quais atores automáticos aparecem no log (página atual) — o
 *    payload não traz a contagem por tipo de ator.
 */
export function tabulationWhoSummary(data: {
  total: number;
  distinctUsers: number;
  byUser: { count: number }[];
  items: { actor?: TabulationActor | null }[];
}): { people: number; automated: number | null; kinds: string[] } {
  const humanSum = data.byUser.reduce((acc, row) => acc + row.count, 0);
  const automated =
    data.byUser.length < TABULATION_BY_USER_LIMIT ? Math.max(0, data.total - humanSum) : null;
  const kinds: string[] = [];
  for (const kind of ["ai_agent", "automation", "system"] as const) {
    if (data.items.some((item) => item.actor?.kind === kind)) {
      kinds.push(AUTOMATED_ACTOR_LABEL[kind]);
    }
  }
  return { people: data.distinctUsers, automated, kinds };
}

/** Texto do KPI: "0 pessoas" + "+ 16 pela IA" / "+ 16 automáticas" / "+ IA". */
export function tabulationWhoText(summary: {
  people: number;
  automated: number | null;
  kinds: string[];
}): { value: string; hint?: string } {
  const value = `${summary.people} ${summary.people === 1 ? "pessoa" : "pessoas"}`;
  const who = summary.kinds.join(" / ");
  if (summary.automated != null && summary.automated > 0) {
    return { value, hint: who ? `+ ${summary.automated} por ${who}` : `+ ${summary.automated} automáticas` };
  }
  if (summary.automated == null && who) return { value, hint: `+ ${who}` };
  return { value };
}
