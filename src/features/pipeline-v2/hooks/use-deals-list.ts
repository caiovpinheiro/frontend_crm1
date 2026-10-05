"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { canonicalFiltersKey } from "@/components/pipeline/kanban-filters/canonical";
import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";
import { isPreviewMode } from "@/lib/preview-mode";

import {
  fetchDealsList,
  type DealListItemDto,
  type DealListPage,
  type DealListStatusDto,
} from "../api/list";
import { BOARD_FILTERS_DEBOUNCE_MS } from "./use-debounced-filters";
import { useDebouncedValue } from "./use-debounced-value";

export function dealsListKey(params: {
  pipelineId?: string;
  status?: DealListStatusDto;
  ownerId?: string;
  search?: string;
  page: number;
  perPage: number;
  filtersKey?: string;
}) {
  return [
    "deals-list",
    params.pipelineId ?? "__all__",
    params.status ?? "__any__",
    params.ownerId ?? "__any__",
    params.search ?? "",
    params.filtersKey ?? "",
    params.page,
    params.perPage,
  ] as const;
}

type DealsListParams = {
  pipelineId?: string;
  status?: DealListStatusDto;
  ownerId?: string;
  search?: string;
  page?: number;
  perPage?: number;
  filters?: Record<string, unknown>;
  enabled?: boolean;
};

/**
 * Chave dos filtros: forma canônica, para o mesmo recorte (ids em outra
 * ordem, campos vazios) cair na mesma entrada do cache. Vazio = `""`.
 */
function listFiltersKey(filters: Record<string, unknown> | undefined): string {
  const key = canonicalFiltersKey(filters as AdvancedDealFilters | undefined);
  return key === "{}" ? "" : key;
}

/**
 * Lista paginada de negócios — feed da aba "Lista" do /v2/pipeline.
 *
 * O backend (`/api/deals`) já filtra por pipeline/stage/status/ownerId
 * e devolve `contact`/`stage`/`owner` selecionados (ver `listInclude`
 * em backend/src/services/deals.ts), então o cliente só monta os
 * params de query e paga apenas uma chamada por página.
 *
 * `withTotal: false` para quem não mostra o total (diálogo de duplicados):
 * o backend novo responde sem o `COUNT(*)`.
 */
export function useDealsList(params: DealsListParams & { withTotal?: boolean }) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  const filtersKey = listFiltersKey(params.filters);
  const filters = useMemo(
    () => (filtersKey ? (JSON.parse(filtersKey) as Record<string, unknown>) : undefined),
    [filtersKey],
  );
  const withTotal = params.withTotal;
  return useQuery<DealListPage>({
    queryKey: dealsListKey({
      pipelineId: params.pipelineId,
      status: params.status,
      ownerId: params.ownerId,
      search: params.search,
      filtersKey,
      page,
      perPage,
    }),
    queryFn: ({ signal }) =>
      fetchDealsList({
        pipelineId: params.pipelineId,
        status: params.status,
        ownerId: params.ownerId,
        search: params.search,
        filters,
        page,
        perPage,
        withTotal,
        signal,
      }),
    enabled: isPreviewMode() ? true : (params.enabled ?? true),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

/** Total já conhecido do recorte: o da 1ª página, se estiver em dia. */
function freshFirstPageTotal(
  qc: QueryClient,
  firstPageKey: readonly unknown[],
): number | null {
  const state = qc.getQueryState<DealListPage>(firstPageKey);
  if (!state || state.isInvalidated) return null;
  const total = state.data?.total;
  return typeof total === "number" ? total : null;
}

/**
 * Total, última página e "tem próxima" a partir da página atual e do total
 * conhecido do recorte. Sem total (servidor não contou): pagina por
 * `hasMore` e o total exibido é o que já se sabe que existe.
 */
export function resolveDealsPaging(args: {
  page: number;
  perPage: number;
  data: DealListPage | undefined;
  knownTotal: number | null;
}): { total: number; totalKnown: boolean; lastPage: number; canNext: boolean } {
  const { page, perPage, data } = args;
  const exact = typeof data?.total === "number" ? data.total : args.knownTotal;
  if (exact !== null) {
    const lastPage = Math.max(1, Math.ceil(exact / perPage));
    return { total: exact, totalKnown: true, lastPage, canNext: page < lastPage };
  }
  const hasMore = data?.hasMore ?? false;
  const seen = data ? (page - 1) * perPage + data.items.length : 0;
  return {
    total: seen,
    totalKnown: false,
    lastPage: hasMore ? page + 1 : page,
    canNext: hasMore,
  };
}

/**
 * Aba Lista: a página + o que a paginação precisa.
 *
 * - O `COUNT(*)` do recorte custa quase o mesmo que a página. Ele é pedido
 *   na 1ª página; nas seguintes a lista reaproveita esse total e pede a
 *   página com `withTotal=0`. Depois de uma invalidação (ação em massa,
 *   importação) ou sem total em cache, a página atual volta a contar.
 * - Filtros avançados entram na forma canônica e com debounce: marcar
 *   vários critérios seguidos é uma requisição, não uma por clique.
 * - Compatível com o backend atual (ignora `withTotal`, manda `total`) e
 *   com o novo (`hasMore`, `total` nulo quando não contou).
 */
export function useDealsListPage(params: DealsListParams) {
  const qc = useQueryClient();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  const liveFiltersKey = listFiltersKey(params.filters);
  const filtersKey = useDebouncedValue(liveFiltersKey, BOARD_FILTERS_DEBOUNCE_MS, {
    immediate: (next) => next === "",
  });
  const filters = useMemo(
    () => (filtersKey ? (JSON.parse(filtersKey) as Record<string, unknown>) : undefined),
    [filtersKey],
  );
  const keyOf = (pageNumber: number) =>
    dealsListKey({
      pipelineId: params.pipelineId,
      status: params.status,
      ownerId: params.ownerId,
      search: params.search,
      filtersKey,
      page: pageNumber,
      perPage,
    });
  const firstPageKey = keyOf(1);

  const query = useQuery<DealListPage>({
    queryKey: keyOf(page),
    queryFn: ({ signal }) =>
      fetchDealsList({
        pipelineId: params.pipelineId,
        status: params.status,
        ownerId: params.ownerId,
        search: params.search,
        filters,
        page,
        perPage,
        // Decidido na hora do fetch: a 1ª página sempre conta; as outras só
        // quando o total do recorte não está em cache (ou foi invalidado).
        withTotal:
          page === 1 || freshFirstPageTotal(qc, firstPageKey) === null
            ? undefined
            : false,
        signal,
      }),
    enabled: isPreviewMode() ? true : (params.enabled ?? true),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const data = query.data;
  const items: DealListItemDto[] = data?.items ?? [];
  const knownTotal =
    page === 1 ? null : (qc.getQueryData<DealListPage>(firstPageKey)?.total ?? null);
  const paging = resolveDealsPaging({ page, perPage, data, knownTotal });
  return {
    query,
    items,
    /** Filtros que a lista de fato pediu (canônicos, depois do debounce). */
    appliedFilters: filters,
    ...paging,
  };
}
