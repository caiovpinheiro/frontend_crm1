import type { QueryClient } from "@tanstack/react-query";

import type { ConversationListRow } from "./api";

/**
 * Escopo de visibilidade de quem está logado, para o cache da lista decidir
 * SOZINHO (sem refetch) se uma conversa que mudou de responsável continua
 * visível. Espelha `getVisibilityFilter` do backend no modo "own": o usuário
 * só lista conversas atribuídas a ele (mais as sem responsável e as do Agente
 * IA, que têm fila própria) — conversa atribuída a OUTRO humano some.
 *
 * `ownOnly: null` = não sabemos (permissões/configuração ainda não chegaram,
 * ou o backend não respondeu). Nesse caso nada é removido por escopo e o
 * comportamento anterior (refetch controlado) continua valendo.
 */
export type InboxViewerScope = {
  userId: string | null;
  ownOnly: boolean | null;
};

const scopeByClient = new WeakMap<QueryClient, InboxViewerScope>();

/** Registra o escopo do usuário para os appliers de cache deste client. */
export function setInboxViewerScope(
  qc: QueryClient,
  scope: InboxViewerScope,
): void {
  scopeByClient.set(qc, scope);
}

export function getInboxViewerScope(qc: QueryClient): InboxViewerScope | null {
  return scopeByClient.get(qc) ?? null;
}

/**
 * O negócio é de OUTRO responsável e o usuário só vê os próprios? Sem
 * `ownerId` no evento (backend antigo) ou sem dono (pool livre) → não decide.
 */
export function dealHiddenFromViewer(
  ownerId: string | null | undefined,
  scope: InboxViewerScope | null | undefined,
): boolean {
  if (!scope || scope.ownOnly !== true || !scope.userId) return false;
  if (typeof ownerId !== "string" || !ownerId) return false;
  return ownerId !== scope.userId;
}

/**
 * A conversa está atribuída a outro HUMANO e o usuário só vê as próprias?
 * `assignedTo.type` ausente conta como humano; responsável IA nunca esconde
 * (a fila "Agente IA" é visível por permissão de aba, não por dono).
 */
export function rowHiddenFromViewer(
  row: Pick<ConversationListRow, "assignedToId" | "assignedTo">,
  scope: InboxViewerScope | null | undefined,
): boolean {
  if (!scope || scope.ownOnly !== true || !scope.userId) return false;
  if (!row.assignedToId) return false;
  if (row.assignedToId === scope.userId) return false;
  const type = (row.assignedTo?.type ?? "HUMAN").toUpperCase();
  return type !== "AI";
}
