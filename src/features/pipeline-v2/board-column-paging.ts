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
 * "Carregar mais" da coluna: quantos cards ainda estão no servidor, ou
 * `null` quando a coluna já está inteira. O restante sai do total que o
 * servidor informou (`totalCount`), não do tamanho da lista carregada.
 */
export function boardColumnLoadMore(
  stage: Pick<BoardStageDto, "hasMore" | "totalCount" | "deals"> | undefined,
): { remaining: number } | null {
  if (!stage?.hasMore) return null;
  const remaining = Math.max(0, (stage.totalCount ?? 0) - stage.deals.length);
  return remaining > 0 ? { remaining } : null;
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
  /**
   * Páginas que um "carregar mais" trouxe, pelo cursor pedido e com o
   * instante em que o pedido saiu. Um refetch do board que já estava em
   * voo quando a página chegou reaproveita-a (`reloadBoardExpansions`)
   * em vez de pedir o mesmo cursor de novo.
   */
  pages: BoardColumnPageFetched[];
};

type BoardColumnPageFetched = {
  stageId: string;
  cursor: string;
  /** `Date.now()` de quando o pedido saiu. */
  at: number;
  page: BoardColumnPageDto;
};

/** Páginas lembradas por query do board (as mais antigas saem). */
const MAX_REMEMBERED_PAGES = 40;

const states = new WeakMap<QueryClient, Map<string, BoardPagingState>>();

function stateFor(qc: QueryClient, keyHash: string): BoardPagingState {
  let byKey = states.get(qc);
  if (!byKey) {
    byKey = new Map();
    states.set(qc, byKey);
  }
  let state = byKey.get(keyHash);
  if (!state) {
    state = { loaded: {}, cursorDisabled: false, pages: [] };
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

/**
 * Guarda as páginas que um "carregar mais" trouxe (`columns` = o que foi
 * pedido; `pages` = o que voltou, por etapa), com o instante do pedido.
 */
export function rememberBoardColumnPages(
  qc: QueryClient,
  keyHash: string,
  columns: readonly { stageId: string; cursor: string }[],
  pages: readonly BoardColumnPageDto[],
  at: number,
): void {
  const state = stateFor(qc, keyHash);
  const byStage = new Map(pages.map((p) => [p.stageId, p]));
  for (const { stageId, cursor } of columns) {
    const page = byStage.get(stageId);
    if (!page) continue;
    state.pages = state.pages.filter(
      (p) => !(p.stageId === stageId && p.cursor === cursor),
    );
    state.pages.push({ stageId, cursor, at, page });
  }
  if (state.pages.length > MAX_REMEMBERED_PAGES) {
    state.pages.splice(0, state.pages.length - MAX_REMEMBERED_PAGES);
  }
}

/**
 * Página já carregada para `cursor` da etapa, pedida em `since` ou depois
 * — ou seja, pelo menos tão nova quanto um board cujo fetch começou em
 * `since`. Páginas anteriores não valem: o refetch existe justamente para
 * renovar o que o usuário expandiu.
 */
export function findReusableBoardColumnPage(
  qc: QueryClient,
  keyHash: string,
  stageId: string,
  cursor: string,
  since: number,
): BoardColumnPageDto | undefined {
  const pages = states.get(qc)?.get(keyHash)?.pages;
  if (!pages) return undefined;
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    const p = pages[i]!;
    if (p.stageId === stageId && p.cursor === cursor && p.at >= since) return p.page;
  }
  return undefined;
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

/** Teto de páginas reaproveitadas em sequência numa etapa (cursor que não anda). */
const MAX_REUSED_PAGES_PER_STAGE = 50;

/**
 * Depois do refetch da 1ª página: recarrega, pelo cursor novo de cada etapa,
 * os cards que o usuário já tinha expandido. Uma requisição para todas as
 * etapas expandidas. Falhou → devolve só a 1ª página (colunas encolhem) e
 * esquece as expansões.
 *
 * `reusable(stageId, cursor)`: página que um "carregar mais" trouxe para
 * esse cursor ENQUANTO este board estava sendo pedido (tão nova quanto a 1ª
 * página). Com ela, o cursor não é pedido de novo — era o 2º
 * `POST /board/columns` idêntico ao tirar o filtro com a coluna rolada.
 */
export async function reloadBoardExpansions(args: {
  base: BoardStageDto[];
  loaded: Readonly<Record<string, number>>;
  fetchColumns: (
    columns: { stageId: string; cursor: string; limit: number }[],
  ) => Promise<BoardColumnPageDto[]>;
  reusable?: (stageId: string, cursor: string) => BoardColumnPageDto | undefined;
  onFailure?: () => void;
}): Promise<BoardStageDto[]> {
  let base = args.base;
  if (args.reusable) {
    for (const first of args.base) {
      let stage = first;
      for (let n = 0; n < MAX_REUSED_PAGES_PER_STAGE; n += 1) {
        const missing = (args.loaded[stage.id] ?? 0) - stage.deals.length;
        if (missing <= 0 || !stageCanLoadByCursor(stage)) break;
        const page = args.reusable(stage.id, stage.nextCursor);
        if (!page) break;
        const next = appendBoardColumnPages(base, [page]);
        if (!next || next === base) break;
        base = next;
        stage = base.find((s) => s.id === stage.id) ?? stage;
      }
    }
  }
  const columns = base.flatMap((stage) => {
    const missing = (args.loaded[stage.id] ?? 0) - stage.deals.length;
    if (missing <= 0 || !stageCanLoadByCursor(stage)) return [];
    return [{ stageId: stage.id, cursor: stage.nextCursor, limit: missing }];
  });
  if (columns.length === 0) return base;
  try {
    const pages = await args.fetchColumns(columns);
    return appendBoardColumnPages(base, pages) ?? base;
  } catch {
    args.onFailure?.();
    return base;
  }
}
