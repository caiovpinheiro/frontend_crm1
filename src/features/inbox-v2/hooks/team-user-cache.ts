import type { QueryClient } from "@tanstack/react-query";

import {
  teamUsersKey,
  type CanonicalTeamUser,
} from "@/features/shared/queries/team-users";

/**
 * Usuário da equipe pelo id, lido do cache de `GET /api/users` (sem rede).
 * Serve para dar NOME ao responsável de um card quando o evento/resposta só
 * traz o id — a lista de equipe já está em cache quando o diálogo
 * "Transferir conversa" foi aberto.
 */
export function findTeamUserById(
  qc: QueryClient,
  userId: string | null | undefined,
): CanonicalTeamUser | null {
  if (!userId) return null;
  for (const includeAi of [false, true]) {
    const list = qc.getQueryData<CanonicalTeamUser[]>(teamUsersKey(includeAi));
    const hit = Array.isArray(list) ? list.find((u) => u?.id === userId) : undefined;
    if (hit) return hit;
  }
  return null;
}
