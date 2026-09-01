"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getBoard,
  getBoardFiltered,
  type BoardSortParam,
  type BoardStageDto,
  type PipelineListItemDto,
  type StatusFilter,
} from "../api";

import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";
import { hasServerSideFilters } from "@/components/pipeline/kanban-filters/types";

import { isPreviewMode } from "@/lib/preview-mode";
import { usePipelinesQuery } from "@/features/shared/queries/pipelines";
import { normalizeSearchQuery } from "@/lib/search-query";

/** Página de cards por coluna no Kanban (scroll soma +10). */
export const BOARD_PAGE_SIZE = 10;

/** Lista de pipelines (dropdown do header) — key canônica compartilhada. */
export function usePipelines(enabled = true) {
  return usePipelinesQuery<PipelineListItemDto>(enabled);
}

/**
 * Quando `sort` é passado, anexamos o discriminador `field:direction`
 * à query key pra que cada modo tenha cache próprio (Mais recentes
 * ↔ Mais antigos não invalidam um ao outro). Quando OMITIDO, voltamos
 * pra key antiga `["pipeline-board", pid, status]` — preserva 100%
 * a invalidação cruzada feita por mutações já existentes
 * (`use-deal-mutations.ts`, `bulk-actions-bar.tsx`, etc.) que usam
 * essa key exata pra refetch do board após mover/editar deals.
 */
export function boardKey(
  pipelineId: string | null,
  status: StatusFilter,
  sort?: BoardSortParam,
) {
  const base = ["pipeline-board", pipelineId ?? "__none__", status] as const;
  if (!sort) return base;
  return [...base, `${sort.field}:${sort.direction}`] as const;
}

/** Board (stages + deals) do pipeline ativo. */
export function useBoard(params: {
  pipelineId: string | null;
  status?: StatusFilter;
  sort?: BoardSortParam;
  enabled?: boolean;
  /** Cards por coluna (default: 100 do backend). Kanban v2 passa 10. */
  perStage?: number;
  /**
   * Expansões cumulativas por coluna ("Carregar mais"): stageId → extras
   * além de `perStage`. Quando há pelo menos 1 expansão, o board passa a
   * vir do POST /board (única rota que aceita offset) — mesma queryKey,
   * então invalidações de mutações/SSE continuam valendo e a expansão
   * sobrevive aos refetches de 60s.
   */
  offsetByStage?: Record<string, number>;
}) {
  const status = params.status ?? "OPEN";
  const sort = params.sort;
  const perStage = params.perStage;
  const offsetByStage = params.offsetByStage;
  // Refs: o "Carregar mais" refaz a mesma queryKey. Sem isto o queryFn
  // capturado no observer pode ficar com extras/perStage velhos no tick
  // do refetch (CUID vs number na key já foi uma fonte de no-op).
  const offsetByStageRef = useRef(offsetByStage);
  offsetByStageRef.current = offsetByStage;
  const perStageRef = useRef(perStage);
  perStageRef.current = perStage;
  const preview = isPreviewMode();
  return useQuery<BoardStageDto[]>({
    queryKey: boardKey(params.pipelineId ?? "pl-1", status, sort),
    queryFn: () => {
      const offsets = offsetByStageRef.current;
      const limit = perStageRef.current;
      const useOffsets = !!offsets && Object.keys(offsets).length > 0;
      return useOffsets
        ? getBoardFiltered(params.pipelineId ?? "pl-1", {
            status,
            sort,
            perStage: limit,
            offsetByStage: offsets,
          })
        : getBoard(params.pipelineId ?? "pl-1", status, sort, limit);
    },
    enabled: preview ? true : ((params.enabled ?? true) && !!params.pipelineId),
    // Alinhado ao cache Redis do board (45s) + padrão inbox-v2.
    // SSE (`usePipelineRealtime`) patcha lastMessage em new_message;
    // polling fica só como safety-net — evita refetch storm no remount.
    staleTime: 45_000,
    refetchInterval: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // [jul/26] Mantém o quadro anterior VISÍVEL enquanto refaz o fetch
    // (troca de funil/ordenação, refetch de 60s, invalidação pós-move).
    // Evita o "flash" de tela vazia/"Carregando..." — a query mais cara do
    // app leva ~1-2s, então sem isso o board pisca em branco a cada refetch.
    placeholderData: (prev) => prev,
  });
}

/**
 * Board com busca server-side via POST /api/pipelines/:id/board.
 *
 * Roda em paralelo com `useBoard` — ativado SOMENTE quando há termo de
 * busca (≥3 chars, já debounced pelo caller). Tem queryKey própria pra
 * NÃO invalidar o cache do board normal: ao limpar a busca, o paginado
 * volta sem flicker.
 *
 * `perStage` default 200 cobre o "matches por coluna" tipico de buscas
 * por nome/telefone/número. Se atingir o limite numa coluna, dá pra
 * sinalizar "refine a busca" (não implementado por enquanto).
 */
export function useBoardSearch(params: {
  pipelineId: string | null;
  status: StatusFilter;
  search: string;
  sort?: BoardSortParam;
  enabled?: boolean;
  perStage?: number;
}) {
  const term = normalizeSearchQuery(params.search);
  const sortKey = params.sort
    ? `${params.sort.field}:${params.sort.direction}`
    : "default";
  const perStage = params.perStage ?? 200;
  return useQuery<BoardStageDto[]>({
    queryKey: [
      "pipeline-board-search",
      params.pipelineId ?? "__none__",
      params.status,
      term,
      sortKey,
      perStage,
    ],
    queryFn: ({ signal }) =>
      getBoardFiltered(params.pipelineId ?? "pl-1", {
        status: params.status,
        filters: { search: term },
        sort: params.sort,
        perStage,
        signal,
      }),
    enabled:
      (params.enabled ?? true) && !!params.pipelineId && term.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    // [jul/26] Preserva os resultados anteriores enquanto o novo termo é
    // buscado — sem piscar em branco entre teclas (já debounced no caller).
    placeholderData: (prev) => prev,
  });
}

/**
 * Board com filtros avançados server-side via POST /api/pipelines/:id/board.
 *
 * Ativado quando há qualquer critério em `filters` (origem, tags, datas,
 * responsável, etc.). O GET pagina 100 deals/coluna e não aplica esses
 * filtros — sem este hook, origem e demais critérios parecem "não funcionar".
 */
export function useBoardFiltered(params: {
  pipelineId: string | null;
  status: StatusFilter;
  filters: AdvancedDealFilters;
  sort?: BoardSortParam;
  enabled?: boolean;
  perStage?: number;
}) {
  const sortKey = params.sort
    ? `${params.sort.field}:${params.sort.direction}`
    : "default";
  const perStage = params.perStage ?? 200;
  const active = hasServerSideFilters(params.filters);
  // Key estável (string) — objeto `filters` novo a cada render NÃO deve
  // criar query nova nem disparar outro POST caro (~10–15s em prod).
  const filtersKey = JSON.stringify(params.filters ?? {});
  return useQuery<BoardStageDto[]>({
    queryKey: [
      "pipeline-board-filtered",
      params.pipelineId ?? "__none__",
      params.status,
      filtersKey,
      sortKey,
      perStage,
    ],
    queryFn: ({ signal }) =>
      getBoardFiltered(params.pipelineId ?? "pl-1", {
        status: params.status,
        filters: params.filters,
        sort: params.sort,
        perStage,
        signal,
      }),
    enabled: (params.enabled ?? true) && !!params.pipelineId && active,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    // Troca rápida de critério cancela o POST anterior (signal no queryFn).
    // [jul/26] Mantém o quadro filtrado anterior enquanto reaplica filtros
    // (evita flash de vazio ao mexer em tags/datas/origem). Hosts (Flow/
    // kanban) ainda fazem fallback pro GET em cache no 1º POST.
    placeholderData: (previousData) => previousData,
  });
}
