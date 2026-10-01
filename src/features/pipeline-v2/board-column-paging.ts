/**
 * "Carregar mais" de uma coluna do board por cursor (P-14).
 *
 * O board (GET/POST /board) traz `nextCursor` em cada etapa. Com ele o
 * cliente pede só os próximos cards daquela etapa
 * (POST /board/columns) e os ANEXA à coluna em cache — sem recarregar a
 * coluna nem o board, e preservando a identidade dos cards e das etapas que
 * não mudaram (é o que deixa o `memo` dos cards pular o render).
 *
 * Backend sem `nextCursor` (ou sem a rota): o chamador volta ao modo antigo
 * (`offsetByStage` no POST /board, que recarrega o board).
 *
 * Refetch do board (invalidação por mutação/SSE, intervalo): a 1ª página
 * volta do servidor sem as expansões, então o `queryFn` do board recarrega
 * as colunas expandidas pelo cursor da 1ª página nova
 * (`reloadBoardExpansions`). Para isso este módulo guarda, por query do
 * board, quantos cards o usuário já tem carregados em cada etapa.
 */
import type { QueryClient } from "@tanstack/react-query";

import type { BoardColumnPageDto, BoardStageDto } from "./api";

/** Etapa que o backend sabe paginar por cursor e ainda tem cards. */
export function stageCanLoadByCursor(
  stage: Pick<BoardStageDto, "hasMore" | "nextCursor">,
): stage is Pick<BoardStageDto, "hasMore"> & { nextCursor: string } {
  return (
    stage.hasMore !== false &&
    typeof stage.nextCursor === "string" &&
    stage.nextCursor.length > 0
  );
}

/**
 * Anexa as páginas às colunas. Só as etapas que receberam página ganham
 * objeto novo; os cards já carregados e as demais etapas mantêm a mesma
 * referência. Card que já está no board (em qualquer etapa) não é
 * duplicado. Sem nada a mudar, devolve o MESMO array.
 */
export function appendBoardColumnPages(
  board: BoardStageDto[] | undefined,
  pages: readonly BoardColumnPageDto[],
): BoardStageDto[] | undefined {
  if (!board || pages.length === 0) return board;
  const pageByStage = new Map(pages.map((p) => [p.stageId, p]));
  const seen = new Set<string>();
  for (const stage of board) {
    for (const deal of stage.deals) seen.add(deal.id);
  }

  let touched = false;
  const next = board.map((stage) => {
    const page = pageByStage.get(stage.id);
    if (!page) return stage;
    const fresh = (page.deals ?? []).filter((deal) => {
      if (!deal?.id || seen.has(deal.id)) return false;
      seen.add(deal.id);
      return true;
    });
    const deals = fresh.length > 0 ? [...stage.deals, ...fresh] : stage.deals;
    const hasMore = page.hasMore === true && Boolean(page.nextCursor);
    let totalCount =
      typeof page.totalCount === "number" ? page.totalCount : stage.totalCount;
    // O servidor disse que acabou: o que está carregado é o total (um card
    // que mudou de lugar entre as páginas volta no próximo refetch do board).
    if (!hasMore && typeof totalCount === "number" && totalCount > deals.length) {
      totalCount = deals.length;
    }
    touched = true;
    return {
      ...stage,
      deals,
      totalCount,
      loadedCount: deals.length,
      hasMore,
      nextCursor: hasMore ? page.nextCursor : null,
    };
  });
  return touched ? next : board;
}

// ---------------------------------------------------------------------------
// Expansões por query do board
// ---------------------------------------------------------------------------

type BoardPagingState = {
  /** stageId → quantos cards o usuário tem carregados (alvo do refetch). */
  loaded: Record<string, number>;
  /** O backend recusou a rota de colunas (404): não tentar de novo. */
  cursorDisabled: boolean;
};

const states = new WeakMap<QueryClient, Map<string, BoardPagingState>>();

function stateFor(qc: QueryClient, keyHash: string): BoardPagingState {
  let byKey = states.get(qc);
  if (!byKey) {
    byKey = new Map();
    states.set(qc, byKey);
  }
  let state = byKey.get(keyHash);
  if (!state) {
    state = { loaded: {}, cursorDisabled: false };
    byKey.set(keyHash, state);
  }
  return state;
}

export function boardPagingKey(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey);
}

/** Registra quantos cards a etapa tem carregados depois de um "carregar mais". */
export function setBoardColumnLoaded(
  qc: QueryClient,
  keyHash: string,
  stageId: string,
  loaded: number,
): void {
  stateFor(qc, keyHash).loaded[stageId] = loaded;
}

export function clearBoardColumnLoaded(
  qc: QueryClient,
  keyHash: string,
  stageId: string,
): void {
  delete stateFor(qc, keyHash).loaded[stageId];
}

export function getBoardColumnsLoaded(
  qc: QueryClient,
  keyHash: string,
): Readonly<Record<string, number>> {
  return states.get(qc)?.get(keyHash)?.loaded ?? {};
}

export function isBoardCursorDisabled(qc: QueryClient, keyHash: string): boolean {
  return states.get(qc)?.get(keyHash)?.cursorDisabled ?? false;
}

export function disableBoardCursor(qc: QueryClient, keyHash: string): void {
  stateFor(qc, keyHash).cursorDisabled = true;
}

/** Colunas voltam ao tamanho da 1ª página no próximo refetch. */
export function clearBoardPaging(qc: QueryClient, keyHash: string): void {
  states.get(qc)?.delete(keyHash);
}

/**
 * Depois do refetch da 1ª página: recarrega, pelo cursor novo de cada etapa,
 * os cards que o usuário já tinha expandido. Uma requisição para todas as
 * etapas expandidas. Falhou → devolve só a 1ª página (colunas encolhem) e
 * esquece as expansões.
 */
export async function reloadBoardExpansions(args: {
  base: BoardStageDto[];
  loaded: Readonly<Record<string, number>>;
  fetchColumns: (
    columns: { stageId: string; cursor: string; limit: number }[],
  ) => Promise<BoardColumnPageDto[]>;
  onFailure?: () => void;
}): Promise<BoardStageDto[]> {
  const columns = args.base.flatMap((stage) => {
    const missing = (args.loaded[stage.id] ?? 0) - stage.deals.length;
    if (missing <= 0 || !stageCanLoadByCursor(stage)) return [];
    return [{ stageId: stage.id, cursor: stage.nextCursor, limit: missing }];
  });
  if (columns.length === 0) return args.base;
  try {
    const pages = await args.fetchColumns(columns);
    return appendBoardColumnPages(args.base, pages) ?? args.base;
  } catch {
    args.onFailure?.();
    return args.base;
  }
}
