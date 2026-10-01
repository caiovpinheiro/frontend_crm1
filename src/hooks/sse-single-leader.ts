/**
 * Chave de desligar da "SSE única por navegador" (líder entre abas).
 *
 * - `NEXT_PUBLIC_SSE_SINGLE_LEADER` (build): ligado por padrão; `"0"`
 *   desliga para todo mundo.
 * - `localStorage["bwipo:sse-single-leader"]` = `"0"` / `"1"`: override
 *   por navegador, para diagnóstico em campo sem rebuild. Vence a env nos
 *   dois sentidos. Lido UMA vez, na criação da conexão — depois de mudar,
 *   recarregue TODAS as abas (abas em modos diferentes não se coordenam:
 *   a desligada abre a própria conexão).
 *
 * Desligado = comportamento anterior: uma conexão SSE por aba e heartbeat
 * de presença por aba (caminho legado em `use-entity-viewers.ts`).
 */

export const SSE_SINGLE_LEADER_STORAGE_KEY = "bwipo:sse-single-leader";

export function resolveSingleLeader(
  envValue: string | null | undefined,
  storageValue: string | null | undefined,
): boolean {
  const stored = storageValue?.trim();
  if (stored === "0") return false;
  if (stored === "1") return true;
  return envValue?.trim() !== "0";
}

let cached: boolean | null = null;

export function isSingleLeaderEnabled(): boolean {
  if (cached !== null) return cached;
  const envValue = process.env.NEXT_PUBLIC_SSE_SINGLE_LEADER;
  if (typeof window === "undefined") return resolveSingleLeader(envValue, null);
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(SSE_SINGLE_LEADER_STORAGE_KEY);
  } catch {
    /* storage bloqueado: vale a env */
  }
  cached = resolveSingleLeader(envValue, stored);
  return cached;
}

/** Só para testes: esquece o valor lido. */
export function __resetSingleLeaderForTests(): void {
  cached = null;
}
