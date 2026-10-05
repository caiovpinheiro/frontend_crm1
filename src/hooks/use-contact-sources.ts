"use client";

import { useQuery } from "@tanstack/react-query";

import type { FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";
import { filterOptionsQuery } from "@/components/pipeline/kanban-filters/use-filter-options";

/**
 * Origens distintas já usadas nos contatos da org (via filter-options).
 *
 * P1-2: mesma query key do painel de filtros do Kanban/Flow — este hook
 * virou um `select` sobre o cache compartilhado. Antes a key própria
 * `["contact-sources"]` furava o cache e baixava os 21KB de novo ao
 * abrir conversa/deal.
 *
 * Passe `enabled` só quando a lista vai ser mostrada (painel de filtros
 * aberto, campo "Origem" em edição): montar o aside de uma conversa não
 * precisa das origens da organização inteira.
 */
export function useContactSources(enabled = true) {
  return useQuery<FilterOptionsResponse, Error, string[]>({
    ...filterOptionsQuery,
    select: (opts) => opts.sources ?? [],
    enabled,
  });
}
