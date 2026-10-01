/**
 * Gate dos efeitos colaterais do negócio aberto por deep-link.
 *
 * `?deal=103` entra no estado como "103" (número por org); depois do
 * `GET /deals/103` o estado vira o CUID real e `useDealDetail` remonta com
 * outra queryKey. Sem gate, `useEntityViewers` (join/leave/join de presença)
 * e `markConversationRead` (POST /read) rodavam duas vezes por abertura.
 * Presença e leitura só devem ligar quando o id já é o CUID estável.
 */

export function isNumericDealRef(ref: string | null | undefined): boolean {
  return !!ref && /^\d+$/.test(ref);
}

/** CUID estável do negócio aberto, ou null enquanto ainda é o número da URL. */
export function stableDealIdForEffects(activeDealId: string | null | undefined): string | null {
  if (!activeDealId) return null;
  return isNumericDealRef(activeDealId) ? null : activeDealId;
}
