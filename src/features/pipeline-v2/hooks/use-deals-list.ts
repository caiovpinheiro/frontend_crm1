"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchDealsList, type DealListPage, type DealListStatusDto } from "../api/list";
import { isPreviewMode } from "@/lib/preview-mode";

export function dealsListKey(params: {
  pipelineId?: string;
  status?: DealListStatusDto;
  ownerId?: string;
  search?: string;
  page: number;
  perPage: number;
  filtersKey?: string;
  sort?: string;
}) {
  return [
    "deals-list",
    params.pipelineId ?? "__all__",
    params.status ?? "__any__",
    params.ownerId ?? "__any__",
    params.search ?? "",
    params.filtersKey ?? "",
    params.sort ?? "",
    params.page,
    params.perPage,
  ] as const;
}

/**
 * Lista paginada de negócios — feed da aba "Lista" do /v2/pipeline.
 *
 * O backend (`/api/deals`) já filtra por pipeline/stage/status/ownerId
 * e devolve `contact`/`stage`/`owner` selecionados (ver `listInclude`
 * em backend/src/services/deals.ts), então o cliente só monta os
 * params de query e paga apenas uma chamada por página.
 */
export function useDealsList(params: {
  pipelineId?: string;
  status?: DealListStatusDto;
  ownerId?: string;
  search?: string;
  page?: number;
  perPage?: number;
  filters?: Record<string, unknown>;
  enabled?: boolean;
  sort?: { field: "lastInteraction"; direction: "asc" | "desc" };
}) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  const filtersKey =
    params.filters && Object.keys(params.filters).length > 0
      ? JSON.stringify(params.filters)
      : "";
  const sortKey =
    params.sort?.field === "lastInteraction" ? `lastInteraction:${params.sort.direction}` : "";
  return useQuery<DealListPage>({
    queryKey: dealsListKey({
      pipelineId: params.pipelineId,
      status: params.status,
      ownerId: params.ownerId,
      search: params.search,
      filtersKey,
      sort: sortKey,
      page,
      perPage,
    }),
    queryFn: () =>
      fetchDealsList({
        pipelineId: params.pipelineId,
        status: params.status,
        ownerId: params.ownerId,
        search: params.search,
        filters: params.filters,
        page,
        perPage,
        sort: params.sort?.field === "lastInteraction" ? "lastInteraction" : undefined,
        direction: params.sort?.direction,
      }),
    enabled: isPreviewMode() ? true : (params.enabled ?? true),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}
