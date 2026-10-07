/*
 * Seções de /api/painel/service que o ambiente não consegue servir.
 *
 * O backend só roda tempo/heatmap/byDepartment/connections/attendants/channels
 * com réplica de leitura. Sem ela, a seção PEDIDA volta `{ ok:false,
 * error:"omitido" }` (backend atual) ou `{ ok:false, reason:"no_replica" }`
 * (backend novo). Em ambos os casos o card não tem o que mostrar: some do grid
 * e um aviso único conta quantos gráficos ficaram de fora.
 *
 * Também guardamos, em memória do módulo (vale até o reload da página), quais
 * seções vieram indisponíveis para não pedi-las de novo a cada troca de filtro.
 */

import { useSyncExternalStore } from "react";

import type { PainelBlock } from "./painel-api";

export const NO_REPLICA_MESSAGE = "Indisponível sem réplica de leitura";

/** Bloco sintético para uma seção pedida e indisponível. */
export function unavailableBlock(): PainelBlock<never> {
  return { ok: false, error: NO_REPLICA_MESSAGE, reason: "no_replica" };
}

/** `true` para bloco já marcado como indisponível (`reason: "no_replica"`). */
export function isBlockUnavailable(block: PainelBlock<unknown> | undefined): boolean {
  return block?.ok === false && block.reason === "no_replica";
}

/** Bloco ainda não chegou (ou não foi pedido nesta chamada). */
export function isBlockPending(block: PainelBlock<unknown> | undefined): boolean {
  return !block || (block.ok === false && block.error === "omitido" && !block.reason);
}

/**
 * Seção pedida que voltou sem dado: ausente, `reason:"no_replica"` ou
 * `"omitido"` (o backend atual não distingue "não pedida" de "sem réplica", mas
 * aqui só olhamos as pedidas).
 */
function requestedButSkipped(block: PainelBlock<unknown> | undefined): boolean {
  if (!block) return true;
  if (block.ok) return false;
  return block.reason === "no_replica" || block.error === "omitido";
}

/**
 * Troca, na resposta, as seções pedidas e puladas por `unavailableBlock()`.
 * Devolve só as chaves normalizadas (`unavailable` lista as puladas).
 */
export function normalizeRequestedBlocks(
  requested: readonly string[],
  response: Partial<Record<string, PainelBlock<unknown>>>,
): { blocks: Record<string, PainelBlock<unknown>>; unavailable: string[] } {
  const blocks: Record<string, PainelBlock<unknown>> = {};
  const unavailable: string[] = [];
  for (const key of requested) {
    const block = response[key];
    if (requestedButSkipped(block)) {
      blocks[key] = unavailableBlock();
      unavailable.push(key);
    } else if (block) {
      blocks[key] = block;
    }
  }
  return { blocks, unavailable };
}

/** Aviso único do topo da aba. */
export function unavailableNoticeText(count: number): string {
  return `${count} ${count === 1 ? "gráfico indisponível" : "gráficos indisponíveis"} neste ambiente (sem réplica de leitura)`;
}

// ---------------------------------------------------------------------------
// Memória da sessão (módulo): reset só no reload.

const known = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: readonly string[] = [];

function emit() {
  snapshot = [...known].sort();
  for (const listener of listeners) listener();
}

export function rememberUnavailableSections(keys: readonly string[]): void {
  let changed = false;
  for (const key of keys) {
    if (!known.has(key)) {
      known.add(key);
      changed = true;
    }
  }
  if (changed) emit();
}

export function isSectionKnownUnavailable(key: string): boolean {
  return known.has(key);
}

export function knownUnavailableSections(): readonly string[] {
  return snapshot;
}

export function resetServiceAvailabilityForTests(): void {
  known.clear();
  snapshot = [];
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Seções indisponíveis conhecidas (reativo). */
export function useUnavailableSections(): readonly string[] {
  return useSyncExternalStore(subscribe, knownUnavailableSections, knownUnavailableSections);
}
