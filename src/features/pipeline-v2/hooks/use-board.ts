"use client";

import { useMemo, useRef } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  getBoard,
  getBoardColumns,
  getBoardFiltered,
  type BoardSortParam,
  type BoardStageDto,
  type PipelineListItemDto,
  type StatusFilter,
} from "../api";

import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";
import { hasServerSideFilters } from "@/components/pipeline/kanban-filters/types";
import { canonicalFiltersKey } from "@/components/pipeline/kanban-filters/canonical";

import { isPreviewMode } from "@/lib/preview-mode";
import { usePipelinesQuery } from "@/features/shared/queries/pipelines";
import { normalizeSearchQuery } from "@/lib/search-query";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { mergeBoardKeepingLiveActivity } from "../board-live-activity";
import {
  boardPagingKey,
  clearBoardPaging,
  findReusableBoardColumnPage,
  getBoardColumnsLoaded,
  reloadBoardExpansions,
} from "../board-column-paging";

/** `structuralSharing` do React Query tipa os dois lados como `unknown`. */
function shareLiveBoard(
  oldData: unknown,
  newData: unknown,
  retainOutliers: boolean,
): BoardStageDto[] {
  return mergeBoardKeepingLiveActivity(
    Array.isArray(oldData) ? (oldData as BoardStageDto[]) : undefined,
    (newData as BoardStageDto[]) ?? [],
    { retainOutliers },
  );
}

/** 1ª página de cards por coluna: o board inteiro vem com 10 por etapa. */
export const BOARD_PAGE_SIZE = 10;

/**
 * Cards pedidos a cada "carregar mais" de uma coluna (Kanban e fila do Flow).
 * Maior que a 1ª página de propósito: com 10 por vez, rolar uma coluna
 * disparava uma requisição a cada ~1.000px (rajada de POST /board/columns e
 * o "Carregando..." piscando). 30 cards cobrem uns 3.000px por requisição.
 */
export const BOARD_LOAD_MORE_PAGE_SIZE = 30;

/**
 * 1ª página por coluna do board FILTRADO do Kanban (POST /board). Antes eram
 * 200 por etapa (~4 MB por resposta em funil cheio), sem "carregar mais";
 * agora o resto vem ao rolar a coluna, pelo cursor da etapa.
 */
export const BOARD_FILTERED_PAGE_SIZE = 50;

/** Lista de pipelines (dropdown do header) — key canônica compartilhada. */
export function usePipelines(enabled = true) {
  return usePipelinesQuery<PipelineListItemDto>(enabled);
}

/**
 * `pipelineId` é SEMPRE o CUID do funil — o escopo do SSE (`pipelineIds`),
 * as mutações e o "Mover" localizam o board por ele. O número público
 * (`?pipeline=8`) é resolvido para o CUID antes (`usePipelineUrlSync`).
 *
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

/**
 * Chaves de board em cache — paginado (`pipeline-board`), busca e filtrado.
 * Todas têm o CUID do funil em `[1]`.
 */
export function isBoardCacheKey(key: readonly unknown[]): boolean {
  const root = key[0];
  return (
    root === "pipeline-board" ||
    root === "pipeline-board-search" ||
    root === "pipeline-board-filtered"
  );
}

/**
 * Predicate dos boards de um funil (qualquer variante, status e ordenação).
 * Sem `pipelineId`, casa todos os boards.
 */
export function boardsOfPipeline(pipelineId: string | null | undefined) {
  return (query: { queryKey: readonly unknown[] }) =>
    isBoardCacheKey(query.queryKey) && (!pipelineId || query.queryKey[1] === pipelineId);
}

/**
 * Etapa `stageId` num board em cache do funil — prefere o paginado do
 * `status` pedido, depois qualquer variante/ordenação.
 */
export function findCachedBoardStage(
  qc: QueryClient,
  pipelineId: string | null,
  status: StatusFilter,
  stageId: string,
): BoardStageDto | undefined {
  const boards = qc.getQueriesData<BoardStageDto[]>({ predicate: boardsOfPipeline(pipelineId) });
  const ranked = [...boards].sort(([a], [b]) => rank(a) - rank(b));
  for (const [, data] of ranked) {
    const hit = Array.isArray(data) ? data.find((s) => s.id === stageId) : undefined;
    if (hit) return hit;
  }
  return undefined;

  function rank(key: readonly unknown[]): number {
    return (key[0] === "pipeline-board" ? 0 : 2) + (key[2] === status ? 0 : 1);
  }
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
   * Modo ANTIGO do "Carregar mais" (backend sem `nextCursor` na etapa):
   * stageId → extras além de `perStage`. Com pelo menos 1 expansão o board
   * passa a vir do POST /board (única rota que aceita offset) — mesma
   * queryKey, então invalidações de mutações/SSE continuam valendo e a
   * expansão sobrevive aos refetches.
   *
   * Com cursor (`useBoardLoadMore`) os cards são anexados ao cache e este
   * campo fica vazio; no refetch o `queryFn` recarrega as colunas
   * expandidas pelo cursor da 1ª página nova.
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
  const visible = useDocumentVisible();
  const qc = useQueryClient();
  const queryKey = boardKey(params.pipelineId ?? "pl-1", status, sort);
  const pagingKey = boardPagingKey(queryKey);
  return useQuery<BoardStageDto[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const pid = params.pipelineId ?? "pl-1";
      const offsets = offsetByStageRef.current;
      const limit = perStageRef.current;
      const useOffsets = !!offsets && Object.keys(offsets).length > 0;
      const startedAt = Date.now();
      const base = await (useOffsets
        ? getBoardFiltered(pid, {
            status,
            sort,
            perStage: limit,
            offsetByStage: offsets,
            signal,
          })
        : getBoard(pid, status, sort, limit, signal));
      // Colunas expandidas por cursor: a 1ª página acabou de voltar sem
      // elas. Lido DEPOIS do board para pegar um "carregar mais" que tenha
      // terminado durante o fetch — e esse, se foi pelo mesmo cursor da 1ª
      // página nova, é reaproveitado em vez de pedido de novo.
      return reloadBoardExpansions({
        base,
        loaded: getBoardColumnsLoaded(qc, pagingKey),
        reusable: (stageId, cursor) =>
          findReusableBoardColumnPage(qc, pagingKey, stageId, cursor, startedAt),
        fetchColumns: (columns) => getBoardColumns(pid, { status, sort, columns, signal }),
        // Refetch cancelado não é falha: as colunas expandidas continuam.
        onFailure: () => {
          if (!signal.aborted) clearBoardPaging(qc, pagingKey);
        },
      });
    },
    enabled: preview ? true : ((params.enabled ?? true) && !!params.pipelineId),
    // Alinhado ao cache Redis do board (45s) + padrão inbox-v2.
    // SSE (`usePipelineRealtime`) patcha lastMessage em new_message;
    // polling fica só como safety-net — evita refetch storm no remount.
    staleTime: 45_000,
    refetchInterval: visible ? 120_000 : false,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // [jul/26] Mantém o quadro anterior VISÍVEL enquanto refaz o fetch
    // (troca de funil/ordenação, refetch de 60s, invalidação pós-move).
    // Evita o "flash" de tela vazia/"Carregando..." — a query mais cara do
    // app leva ~1-2s, então sem isso o board pisca em branco a cada refetch.
    placeholderData: (prev) => prev,
    // SSE grava lastMessage na hora. Um refetch com cache de 45s não pode
    // voltar o card para a mensagem anterior (a fila do Flow pularia).
    structuralSharing: (oldData, newData) =>
      shareLiveBoard(oldData, newData, sort?.field === "lastInteraction"),
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
    structuralSharing: (oldData, newData) =>
      shareLiveBoard(
        oldData,
        newData,
        params.sort?.field === "lastInteraction",
      ),
  });
}

/**
 * Chave do board filtrado. `filters` entra na forma canônica: o mesmo
 * recorte (ids em outra ordem, campos vazios ou padrão sobrando) cai na
 * mesma entrada do cache em vez de pedir outro POST.
 */
export function boardFilteredKey(
  pipelineId: string | null,
  status: StatusFilter,
  filters: AdvancedDealFilters | null | undefined,
  sort: BoardSortParam | undefined,
  perStage: number,
) {
  return [
    "pipeline-board-filtered",
    pipelineId ?? "__none__",
    status,
    canonicalFiltersKey(filters),
    sort ? `${sort.field}:${sort.direction}` : "default",
    perStage,
  ] as const;
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
  /**
   * Modo antigo do "Carregar mais" (etapa sem `nextCursor`): stageId →
   * extras além de `perStage`. Mesma queryKey — ver `useBoard`.
   */
  offsetByStage?: Record<string, number>;
}) {
  const perStage = params.perStage ?? 200;
  // Key estável (string canônica) — objeto `filters` novo a cada render NÃO
  // deve criar query nova nem disparar outro POST caro (~10–15s em prod).
  const filtersKey = canonicalFiltersKey(params.filters);
  // O corpo do POST também vai na forma canônica (ajuda o cache do servidor,
  // cuja chave inclui os filtros como chegam).
  const filters = useMemo(
    () => JSON.parse(filtersKey) as AdvancedDealFilters,
    [filtersKey],
  );
  const active = hasServerSideFilters(filters);
  const offsetByStageRef = useRef(params.offsetByStage);
  offsetByStageRef.current = params.offsetByStage;
  const qc = useQueryClient();
  const queryKey = boardFilteredKey(
    params.pipelineId,
    params.status,
    filters,
    params.sort,
    perStage,
  );
  const pagingKey = boardPagingKey(queryKey);
  return useQuery<BoardStageDto[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const pid = params.pipelineId ?? "pl-1";
      const offsets = offsetByStageRef.current;
      const startedAt = Date.now();
      const base = await getBoardFiltered(pid, {
        status: params.status,
        filters,
        sort: params.sort,
        perStage,
        offsetByStage: offsets && Object.keys(offsets).length > 0 ? offsets : undefined,
        signal,
      });
      // Colunas expandidas por cursor ("carregar mais"): a 1ª página voltou
      // sem elas — recarrega só o que faltava, com os mesmos filtros (página
      // que chegou durante este fetch, pelo mesmo cursor, é reaproveitada).
      return reloadBoardExpansions({
        base,
        loaded: getBoardColumnsLoaded(qc, pagingKey),
        reusable: (stageId, cursor) =>
          findReusableBoardColumnPage(qc, pagingKey, stageId, cursor, startedAt),
        fetchColumns: (columns) =>
          getBoardColumns(pid, {
            status: params.status,
            filters,
            sort: params.sort,
            columns,
            signal,
          }),
        onFailure: () => {
          if (!signal.aborted) clearBoardPaging(qc, pagingKey);
        },
      });
    },
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
    structuralSharing: (oldData, newData) =>
      shareLiveBoard(
        oldData,
        newData,
        params.sort?.field === "lastInteraction",
      ),
  });
}
