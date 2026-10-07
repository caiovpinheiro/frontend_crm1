"use client";

import { useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import type { BoardStageDto, StatusFilter } from "./api";
import { boardsOfPipeline } from "./hooks/use-board";

/** Soma dos `totalCount` das etapas (cai nos cards carregados sem o total). */
export function sumBoardTotal(stages: readonly BoardStageDto[]): number {
  return stages.reduce((acc, s) => acc + (s.totalCount ?? s.deals.length), 0);
}

/**
 * Total do funil que o React Query já tem em cache (board paginado sem
 * filtro), ou `null`. Serve ao chip do cabeçalho enquanto o board da vez
 * ainda não chegou — remontar a tela ou trocar de recorte não deve voltar a
 * "Contando…" quando já existe um número para mostrar.
 */
export function cachedBoardTotal(
  qc: QueryClient,
  pipelineId: string | null,
  status: StatusFilter,
): number | null {
  const hits = qc.getQueriesData<BoardStageDto[]>({
    predicate: (query) =>
      query.queryKey[0] === "pipeline-board" &&
      query.queryKey[2] === status &&
      boardsOfPipeline(pipelineId)(query),
  });
  for (const [, data] of hits) {
    if (Array.isArray(data) && data.length > 0) return sumBoardTotal(data);
  }
  return null;
}

export type BoardTotalChip = {
  /** Número a mostrar; `null` só quando de fato não há nenhum. */
  value: number | null;
  /** "Contando…": pedido em andamento E nenhum total conhecido. */
  counting: boolean;
};

/**
 * Decide o chip "N negócios" / "Contando…".
 *
 * "Contando…" só aparece quando não há total nenhum (nem o último mostrado
 * nesta tela, nem um board em cache). Com cache, o total anterior fica
 * visível e o novo entra em silêncio quando o pedido termina.
 */
export function resolveBoardTotalChip(input: {
  pending: boolean;
  total: number;
  lastKnown: number | null;
  cachedTotal: number | null;
}): BoardTotalChip {
  if (!input.pending) return { value: input.total, counting: false };
  const value = input.lastKnown ?? input.cachedTotal;
  return { value, counting: value == null };
}

export function useBoardTotalChip(input: {
  pending: boolean;
  total: number;
  pipelineId: string | null;
  status: StatusFilter;
}): BoardTotalChip {
  const qc = useQueryClient();
  const lastKnownRef = useRef<number | null>(null);
  const chip = resolveBoardTotalChip({
    pending: input.pending,
    total: input.total,
    lastKnown: lastKnownRef.current,
    cachedTotal: input.pending
      ? cachedBoardTotal(qc, input.pipelineId, input.status)
      : null,
  });
  if (!input.pending) lastKnownRef.current = input.total;
  return chip;
}
