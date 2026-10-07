/*
 * "Ganhos por agente" (aba Negócios): ordem e agentes sem atividade.
 * Puro — testado em agents-view.test.ts.
 */

import type { PainelAgentRow } from "./painel-api";

/**
 * Agente sem atividade: o backend marca `zeroActivity` (sem ganho, perda nem negócio
 * em aberto) ou todos os números da linha estão zerados/vazios (R$ 0 · 0 · — · — · 0).
 */
export function isInactiveAgent(row: PainelAgentRow): boolean {
  if (row.zeroActivity) return true;
  return (
    row.wonValue === 0 &&
    row.wonCount === 0 &&
    row.openToday === 0 &&
    !row.conversion &&
    !row.ticket
  );
}

/**
 * Receita ganha (maior primeiro); em empate — sobretudo os zeros — "Ativos hoje"
 * (maior primeiro), depois ganhos e nome. Não muta a lista recebida.
 */
export function sortAgents(rows: readonly PainelAgentRow[]): PainelAgentRow[] {
  return [...rows].sort(
    (a, b) =>
      b.wonValue - a.wonValue ||
      b.openToday - a.openToday ||
      b.wonCount - a.wonCount ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
}

/** Lista ordenada, sem os agentes sem atividade quando `hideInactive`. */
export function visibleAgents(
  rows: readonly PainelAgentRow[],
  hideInactive: boolean,
): PainelAgentRow[] {
  const sorted = sortAgents(rows);
  return hideInactive ? sorted.filter((row) => !isInactiveAgent(row)) : sorted;
}
