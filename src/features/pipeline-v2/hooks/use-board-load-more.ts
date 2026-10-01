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
  setBoardColumnLoaded,
  stageCanLoadByCursor,
} from "../board-column-paging";
import { BOARD_PAGE_SIZE, boardKey } from "./use-board";

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
 * já visíveis mantêm a mesma referência.
 *
 * Caminho antigo — backend sem cursor, ou a rota recusou (4xx): soma
 * `pageSize` em `legacyOffsets`, que o host entrega ao `useBoard`
 * (`offsetByStage`), e refaz o board pelo POST com offsets. Exatamente o
 * comportamento anterior.
 *
 * `pipelineId` é o MESMO valor passado ao `useBoard` (a query é localizada
 * pela chave).
 */
export function useBoardLoadMore(params: {
  pipelineId: string | null;
  status?: StatusFilter;
  sort?: BoardSortParam;
  pageSize?: number;
}) {
  const qc = useQueryClient();
  const pipelineId = params.pipelineId;
  const status = params.status ?? "OPEN";
  const sortField = params.sort?.field;
  const sortDirection = params.sort?.direction;
  const pageSize = params.pageSize ?? BOARD_PAGE_SIZE;

  const sort = useMemo<BoardSortParam | undefined>(
    () => (sortField && sortDirection ? { field: sortField, direction: sortDirection } : undefined),
    [sortField, sortDirection],
  );
  const queryKey = useMemo(
    () => boardKey(pipelineId ?? "pl-1", status, sort),
    [pipelineId, status, sort],
  );
  const keyHash = boardPagingKey(queryKey);

  const [legacyOffsets, setLegacyOffsets] = useState<Record<string, number>>({});
  const [loadingStageIds, setLoadingStageIds] = useState<ReadonlySet<string>>(NO_STAGES);
  /** Etapas com pedido por cursor em voo — o sentinela de scroll dispara em rajada. */
  const inFlight = useRef(new Set<string>());

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

  const loadMore = useCallback(
    async (stageIds: readonly string[]) => {
      if (!pipelineId) return;
      const board = qc.getQueryData<BoardStageDto[]>(queryKey) ?? [];
      const wanted = new Set(stageIds);
      const targets = board.filter(
        (s) => wanted.has(s.id) && stageHasMore(s) && !inFlight.current.has(s.id),
      );
      if (targets.length === 0) return;

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

      setLoadingStageIds(new Set(targets.map((s) => s.id)));

      if (byCursor.length > 0) {
        for (const id of cursorIds) inFlight.current.add(id);
        try {
          const pages = await getBoardColumns(pipelineId, {
            status,
            sort,
            columns: byCursor.map((s) => ({
              stageId: s.id,
              cursor: s.nextCursor,
              limit: pageSize,
            })),
          });
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
            setLoadingStageIds(NO_STAGES);
            return;
          }
          if (err.routeMissing) disableBoardCursor(qc, keyHash);
          legacy = [...legacy, ...byCursor];
        } finally {
          for (const id of cursorIds) inFlight.current.delete(id);
        }
      }

      if (legacy.length === 0) {
        setLoadingStageIds(NO_STAGES);
        return;
      }
      for (const stage of legacy) clearBoardColumnLoaded(qc, keyHash, stage.id);
      setLegacyOffsets((prev) => {
        const next = { ...prev };
        for (const stage of legacy) {
          // Extras além da 1ª página: o que já está carregado + uma página.
          const extras = Math.max(prev[stage.id] ?? 0, stage.deals.length - pageSize, 0);
          next[stage.id] = extras + pageSize;
        }
        return next;
      });
    },
    [qc, queryKey, keyHash, pipelineId, status, sort, pageSize],
  );

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
