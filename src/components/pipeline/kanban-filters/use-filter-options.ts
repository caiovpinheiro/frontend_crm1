"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchFilterOptions } from "./api";
import type { AdvancedDealFilters, FilterOptionsResponse } from "./types";

/** Chave única das opções de filtro (Kanban, Flow, Lista, origens, campanhas). */
export const FILTER_OPTIONS_QUERY_KEY = ["kanban-filter-options"] as const;

/**
 * As opções (funis, usuários, tags, campos, origens) mudam pouco e a rota é
 * cara: lista as origens distintas de todos os contatos da organização.
 * 10 min de validade; quem edita uma origem invalida a chave.
 */
export const FILTER_OPTIONS_STALE_MS = 10 * 60_000;

/**
 * Opções comuns a todo consumidor da chave — o mesmo cache serve a todas as
 * telas, sem refetch por foco, reconexão ou remontagem dentro da validade.
 */
export const filterOptionsQuery = {
  queryKey: FILTER_OPTIONS_QUERY_KEY,
  queryFn: fetchFilterOptions,
  staleTime: FILTER_OPTIONS_STALE_MS,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

/**
 * Com o painel de filtros FECHADO, as opções só servem para dar nome aos
 * chips de campo personalizado (os demais chips mostram contagem). Sem esse
 * tipo de filtro ativo, não há por que buscar na montagem da tela.
 */
export function filtersNeedOptions(
  filters: AdvancedDealFilters | null | undefined,
): boolean {
  return (
    (filters?.dealCustomFields?.length ?? 0) > 0 ||
    (filters?.contactCustomFields?.length ?? 0) > 0
  );
}

/**
 * Opções do painel de filtros. `enabled` deve ser "painel aberto" (ou
 * `filtersNeedOptions`): a busca acontece ao abrir o painel, não ao montar
 * o Kanban/Flow/Lista.
 */
export function useFilterOptions(enabled: boolean) {
  return useQuery<FilterOptionsResponse>({ ...filterOptionsQuery, enabled });
}
