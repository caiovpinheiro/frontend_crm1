"use client";

import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";
import { hasServerSideFilters } from "@/components/pipeline/kanban-filters/types";

import type { BoardSortParam, StatusFilter } from "../api";
import {
  BOARD_FILTERED_PAGE_SIZE,
  BOARD_LOAD_MORE_PAGE_SIZE,
  BOARD_PAGE_SIZE,
  boardFilteredKey,
  useBoard,
  useBoardFiltered,
} from "./use-board";
import { useBoardLoadMore } from "./use-board-load-more";
import { useDebouncedFilters } from "./use-debounced-filters";

/**
 * Queries do board do Kanban: "carregar mais" por coluna, board paginado
 * (GET) e board filtrado (POST, quando há critério de servidor).
 *
 * A chave é o CUID do funil (`pipelineId`), como no Flow, nas mutações e
 * no escopo do SSE. Antes o Kanban usava o número público (`?pipeline=8`)
 * para não esperar a lista de funis: o refresh por escopo do SSE não
 * casava, criar/excluir/ganhar/perder não invalidava o board e o "Mover"
 * calculava posição 0. O número → CUID é resolvido uma vez, antes do
 * paint, em `usePipelineUrlSync` (a lista de funis é a query
 * compartilhada do shell).
 *
 * `filters` é o que a tela mostra agora; o board só pede ao servidor o
 * recorte depois do debounce e na forma canônica (`appliedFilters`).
 * Seleção em massa e totais devem usar `appliedFilters` — é o recorte do
 * quadro que está na tela.
 */
export function useKanbanBoard(params: {
  pipelineId: string | null;
  status: StatusFilter;
  sort: BoardSortParam | undefined;
  filters: AdvancedDealFilters;
  enabled: boolean;
}) {
  const { pipelineId, status, sort, enabled } = params;

  const debounced = useDebouncedFilters(params.filters);
  const filters = debounced.filters;
  const hasServerBoard = hasServerSideFilters(filters);

  // Um "carregar mais" só, apontado para o board que está na tela: o
  // paginado (GET, 10 por etapa) ou o filtrado (POST, 50 por etapa). Com
  // filtro, o cursor leva os mesmos filtros e os cards entram no cache do
  // board filtrado.
  const boardLoadMore = useBoardLoadMore({
    pipelineId,
    status,
    sort,
    pageSize: BOARD_LOAD_MORE_PAGE_SIZE,
    firstPageSize: hasServerBoard ? BOARD_FILTERED_PAGE_SIZE : BOARD_PAGE_SIZE,
    queryKey: hasServerBoard
      ? boardFilteredKey(pipelineId, status, filters, sort, BOARD_FILTERED_PAGE_SIZE)
      : undefined,
    filters: hasServerBoard ? filters : undefined,
  });

  const boardNormal = useBoard({
    pipelineId,
    status,
    sort,
    enabled: enabled && !hasServerBoard,
    perStage: BOARD_PAGE_SIZE,
    offsetByStage: hasServerBoard ? undefined : boardLoadMore.legacyOffsets,
  });
  const boardFiltered = useBoardFiltered({
    pipelineId,
    status,
    filters,
    sort,
    enabled: enabled && hasServerBoard,
    perStage: BOARD_FILTERED_PAGE_SIZE,
    offsetByStage: hasServerBoard ? boardLoadMore.legacyOffsets : undefined,
  });

  return {
    /** Recorte pedido ao servidor (canônico, depois do debounce). */
    appliedFilters: filters,
    /** Há alteração de filtro esperando o debounce. */
    filtersPending: debounced.pending,
    hasServerBoard,
    boardLoadMore,
    boardNormal,
    boardFiltered,
  };
}
