"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  BoardColumnsError,
  getBoardColumns,
  type BoardSortParam,
  type BoardStageDto,
  type StatusFilter,
} from "../api";
import {
  appendBoardColumnPages,
  boardPagingKey,
  clearBoardColumnLoaded,
  clearBoardPaging,
  disableBoardCursor,
  isBoardCursorDisabled,
  rememberBoardColumnPages,
  setBoardColumnLoaded,
  stageCanLoadByCursor,
} from "../board-column-paging";
import { canonicalFiltersKey } from "@/components/pipeline/kanban-filters/canonical";
import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";

import { BOARD_LOAD_MORE_PAGE_SIZE, boardKey } from "./use-board";

const NO_STAGES: ReadonlySet<string> = new Set();

/** Etapa em que o servidor ainda tem cards (flag ou total > carregados). */
function stageHasMore(stage: BoardStageDto): boolean {
  if (stage.hasMore === true) return true;
  if (stage.hasMore === false) return false;
  return typeof stage.totalCount === "number" && stage.deals.length < stage.totalCount;
}

/**
 * "Carregar mais" das colunas do board (Kanban e fila do Flow).
 *
 * Caminho novo — a etapa veio com `nextCursor`: pede só os próximos
 * `pageSize` cards de cada etapa (uma requisição para todas as pedidas) e
 * anexa ao board em cache com `setQueryData`. Nada é recarregado; os cards
 * já visíveis mantêm a mesma referência. Pedidos feitos no mesmo instante
 * (colunas cuja sentinela entra na tela no mesmo frame) saem numa
 * requisição só.
 *
 * Caminho antigo — backend sem cursor, ou a rota recusou (4xx): soma
 * `pageSize` em `legacyOffsets`, que o host entrega ao `useBoard`
 * (`offsetByStage`), e refaz o board pelo POST com offsets. Exatamente o
 * comportamento anterior.
 *
 * `pipelineId` é o MESMO valor passado ao `useBoard` (a query é localizada
 * pela chave).
 *
 * Board filtrado (POST /board): passe `queryKey` (a chave do
 * `useBoardFiltered`) e os `filters` do board — o cursor só vale com o
 * mesmo recorte que o gerou.
 */
export function useBoardLoadMore(params: {
  pipelineId: string | null;
  status?: StatusFilter;
  sort?: BoardSortParam;
  /** Cards pedidos a cada "carregar mais" (padrão: `BOARD_LOAD_MORE_PAGE_SIZE`). */
  pageSize?: number;
  /** `perStage` da 1ª página do board, para o modo antigo. Padrão: `pageSize`. */
  firstPageSize?: number;
  /** Chave da query do board quando não é o paginado (`boardKey`). */
  queryKey?: readonly unknown[];
  /** Filtros do board que deu o cursor (board filtrado). */
  filters?: AdvancedDealFilters;
}) {
  const qc = useQueryClient();
  const pipelineId = params.pipelineId;
  const status = params.status ?? "OPEN";
  const sortField = params.sort?.field;
  const sortDirection = params.sort?.direction;
  const pageSize = params.pageSize ?? BOARD_LOAD_MORE_PAGE_SIZE;
  const firstPageSize = params.firstPageSize ?? pageSize;

  const sort = useMemo<BoardSortParam | undefined>(
    () => (sortField && sortDirection ? { field: sortField, direction: sortDirection } : undefined),
    [sortField, sortDirection],
  );
  // A chave chega como array novo a cada render: a identidade estável sai
  // do hash (só strings/números — ida e volta por JSON preserva).
  const keyHash = boardPagingKey(
    params.queryKey ?? boardKey(pipelineId ?? "pl-1", status, sort),
  );
  const queryKey = useMemo(() => JSON.parse(keyHash) as readonly unknown[], [keyHash]);
  const filtersKey = params.filters ? canonicalFiltersKey(params.filters) : "";
  const filters = useMemo(
    () =>
      filtersKey && filtersKey !== "{}"
        ? (JSON.parse(filtersKey) as AdvancedDealFilters)
        : undefined,
    [filtersKey],
  );

  const [legacyOffsets, setLegacyOffsets] = useState<Record<string, number>>({});
  const [loadingStageIds, setLoadingStageIds] = useState<ReadonlySet<string>>(NO_STAGES);
  /** Etapas com pedido por cursor em voo: não entram em outro pedido. */
  const inFlight = useRef(new Set<string>());
  /** Pedidos do mesmo instante, à espera de sair numa requisição só. */
  const batch = useRef<{
    ids: Set<string>;
    timer: ReturnType<typeof setTimeout>;
    done: Promise<void>;
  } | null>(null);
  useEffect(
    () => () => {
      if (batch.current) clearTimeout(batch.current.timer);
      batch.current = null;
    },
    [],
  );

  /** Marca/desmarca só as etapas dadas (colunas carregam em paralelo). */
  const markLoading = useCallback((ids: readonly string[], loading: boolean) => {
    if (ids.length === 0) return;
    setLoadingStageIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (loading) next.add(id);
        else next.delete(id);
      }
      return next.size === 0 ? NO_STAGES : next;
    });
  }, []);

  // Modo antigo: cada mudança nos offsets refaz o board (POST com
  // `offsetByStage` — o `useBoard` já enxerga o valor novo neste render).
  const offsetsKey = JSON.stringify(legacyOffsets);
  useEffect(() => {
    if (offsetsKey === "{}") return;
    let alive = true;
    void qc.refetchQueries({ queryKey, exact: true }).finally(() => {
      if (alive) setLoadingStageIds(NO_STAGES);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsetsKey]);

  // Trocar de board (funil/status/ordenação) ou sair da tela: as colunas
  // expandidas desta chave voltam ao tamanho da 1ª página no próximo refetch.
  useEffect(() => () => clearBoardPaging(qc, keyHash), [qc, keyHash]);

  const reset = useCallback(() => {
    setLegacyOffsets((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    setLoadingStageIds(NO_STAGES);
    clearBoardPaging(qc, keyHash);
  }, [qc, keyHash]);

  const runLoadMore = useCallback(
    async (stageIds: readonly string[]) => {
      if (!pipelineId) return;
      const board = qc.getQueryData<BoardStageDto[]>(queryKey) ?? [];
      const wanted = new Set(stageIds);
      const targets = board.filter(
        (s) => wanted.has(s.id) && stageHasMore(s) && !inFlight.current.has(s.id),
      );
      if (targets.length === 0) return;
      const targetIds = targets.map((s) => s.id);

      const cursorOff = isBoardCursorDisabled(qc, keyHash);
      const byCursor = cursorOff
        ? []
        : targets.filter((s): s is BoardStageDto & { nextCursor: string } =>
            stageCanLoadByCursor(s),
          );
      const cursorIds = new Set(byCursor.map((s) => s.id));
      // Sem cursor: backend antigo (campo ausente) ou ordenação que o
      // servidor não pagina por cursor (`hasMore` com `nextCursor: null`).
      let legacy = targets.filter((s) => !cursorIds.has(s.id));

      markLoading(targetIds, true);

      if (byCursor.length > 0) {
        for (const id of cursorIds) inFlight.current.add(id);
        try {
          const columns = byCursor.map((s) => ({
            stageId: s.id,
            cursor: s.nextCursor,
            limit: pageSize,
          }));
          const requestedAt = Date.now();
          const pages = await getBoardColumns(pipelineId, {
            status,
            filters,
            sort,
            columns,
          });
          // Um refetch do board já em voo reaproveita esta página em vez de
          // pedir o mesmo cursor de novo (`reloadBoardExpansions`).
          rememberBoardColumnPages(qc, keyHash, columns, pages, requestedAt);
          const next = qc.setQueryData<BoardStageDto[]>(queryKey, (old) =>
            appendBoardColumnPages(old, pages),
          );
          for (const stage of next ?? []) {
            if (cursorIds.has(stage.id)) {
              setBoardColumnLoaded(qc, keyHash, stage.id, stage.deals.length);
            }
          }
        } catch (err) {
          if (!(err instanceof BoardColumnsError) || !err.fallback) {
            // Rede/5xx: nada mudou; o próximo clique tenta de novo.
            markLoading(targetIds, false);
            return;
          }
          if (err.routeMissing) disableBoardCursor(qc, keyHash);
          legacy = [...legacy, ...byCursor];
        } finally {
          for (const id of cursorIds) inFlight.current.delete(id);
        }
      }

      // As etapas do modo antigo seguem "carregando" até o refetch do board.
      const legacyIds = new Set(legacy.map((s) => s.id));
      markLoading(
        targetIds.filter((id) => !legacyIds.has(id)),
        false,
      );
      if (legacy.length === 0) return;
      for (const stage of legacy) clearBoardColumnLoaded(qc, keyHash, stage.id);
      setLegacyOffsets((prev) => {
        const next = { ...prev };
        for (const stage of legacy) {
          // Extras além da 1ª página: o que já está carregado + uma página.
          const extras = Math.max(
            prev[stage.id] ?? 0,
            stage.deals.length - firstPageSize,
            0,
          );
          next[stage.id] = extras + pageSize;
        }
        return next;
      });
    },
    [
      qc,
      queryKey,
      keyHash,
      pipelineId,
      status,
      sort,
      filters,
      pageSize,
      firstPageSize,
      markLoading,
    ],
  );

  // Junta os pedidos do mesmo instante. Macrotask (não microtask): as
  // sentinelas de colunas diferentes avisam em callbacks separados do
  // mesmo frame.
  const runLoadMoreRef = useRef(runLoadMore);
  useEffect(() => {
    runLoadMoreRef.current = runLoadMore;
  }, [runLoadMore]);
  const loadMore = useCallback((stageIds: readonly string[]): Promise<void> => {
    const pending = batch.current;
    if (pending) {
      for (const id of stageIds) pending.ids.add(id);
      return pending.done;
    }
    const ids = new Set(stageIds);
    let timer!: ReturnType<typeof setTimeout>;
    const done = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        batch.current = null;
        resolve(runLoadMoreRef.current([...ids]));
      }, 0);
    });
    batch.current = { ids, timer, done };
    return done;
  }, []);

  return {
    /** Entregar ao `useBoard` como `offsetByStage` (modo antigo). */
    legacyOffsets,
    loadingStageIds,
    loadMore,
    reset,
  };
}

const STAGE_META_KEYS = [
  "id",
  "name",
  "color",
  "position",
  "number",
  "slug",
  "pipelineId",
  "isIncoming",
  "isWon",
  "isLost",
  "winProbability",
  "rottingDays",
] as const satisfies readonly (keyof BoardStageDto)[];

function sameStageMeta(a: BoardStageDto[], b: BoardStageDto[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    if (x === y) continue;
    for (const key of STAGE_META_KEYS) {
      if (x[key] !== y[key]) return false;
    }
  }
  return true;
}

/**
 * Lista de etapas com identidade estável enquanto só os CARDS mudam.
 *
 * Quem recebe `stages` só para listar as etapas (menu "mover para") não
 * precisa re-renderizar quando um card é anexado/atualizado em alguma
 * coluna. Devolve a mesma referência até que nome/cor/ordem/flags de
 * alguma etapa mudem. Não usar para ler `deals`/contagens (ficam os do
 * primeiro snapshot).
 */
export function useStableBoardStages(board: BoardStageDto[]): BoardStageDto[] {
  const [stable, setStable] = useState(board);
  if (stable === board) return stable;
  if (sameStageMeta(stable, board)) return stable;
  // Ajuste de estado durante o render (padrão "guardar valor do render
  // anterior"): o React refaz este render com o valor novo.
  setStable(board);
  return board;
}
