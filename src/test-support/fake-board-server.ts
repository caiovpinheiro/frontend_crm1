/**
 * Apoio de teste: board paginado por cursor, como o backend novo.
 * `getBoard` devolve a 1ª página de cada etapa; `getBoardColumns` devolve os
 * próximos `limit` cards de cada etapa pedida, a partir do cursor.
 */
import type {
  BoardColumnPageDto,
  BoardDealDto,
  BoardStageDto,
} from "@/features/pipeline-v2/api";

import { FAKE_LATENCY_MS, sleep } from "./scroll-harness";

export function fakeDeal(id: string, extra: Partial<BoardDealDto> = {}): BoardDealDto {
  return {
    id,
    title: `Negócio ${id}`,
    value: 10,
    status: "OPEN",
    position: 1,
    contact: { id: `ct-${id}`, name: `Contato ${id}` },
    owner: null,
    tags: [],
    unreadCount: 0,
    lastMessage: null,
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
    ...extra,
  } as unknown as BoardDealDto;
}

export type ColumnsRequest = {
  columns: { stageId: string; cursor: string; limit: number }[];
};

/** `totals`: stageId → quantos cards a etapa tem no servidor. */
export function createFakeBoardServer(totals: Record<string, number>, firstPage = 10) {
  const stageIds = Object.keys(totals);
  const slice = (stageId: string, from: number, limit: number) => {
    const total = totals[stageId] ?? 0;
    const to = Math.min(total, from + limit);
    const deals = Array.from({ length: Math.max(0, to - from) }, (_, i) =>
      fakeDeal(`${stageId}-d${from + i}`),
    );
    const hasMore = to < total;
    return { deals, total, hasMore, nextCursor: hasMore ? `${stageId}@${to}` : null };
  };

  const board = (perStage: number, offsets: Record<string, number> = {}): BoardStageDto[] =>
    stageIds.map((id, index) => {
        const page = slice(id, 0, perStage + (offsets[id] ?? 0));
        return {
          id,
          name: `Etapa ${id}`,
          color: "#5b6ff5",
          position: index + 1,
          winProbability: 0,
          rottingDays: 30,
          totalCount: page.total,
          loadedCount: page.deals.length,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          deals: page.deals,
        } as BoardStageDto;
      });

  return {
    async getBoard(): Promise<BoardStageDto[]> {
      await sleep(FAKE_LATENCY_MS);
      return board(firstPage);
    },
    /** POST /board: a 1ª página tem o `perStage` pedido (+ `offsetByStage`). */
    async getBoardFiltered(
      _pipelineId: string,
      opts: { perStage?: number; offsetByStage?: Record<string, number> },
    ): Promise<BoardStageDto[]> {
      await sleep(FAKE_LATENCY_MS);
      return board(opts.perStage ?? firstPage, opts.offsetByStage);
    },
    async getBoardColumns(
      _pipelineId: string,
      opts: ColumnsRequest,
    ): Promise<BoardColumnPageDto[]> {
      await sleep(FAKE_LATENCY_MS);
      return opts.columns.map(({ stageId, cursor, limit }) => {
        const page = slice(stageId, Number(cursor.split("@")[1]), limit);
        return {
          stageId,
          deals: page.deals,
          totalCount: page.total,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
        };
      });
    },
  };
}
