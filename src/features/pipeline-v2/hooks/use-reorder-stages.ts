"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { reorderPipelineStages, type BoardStageDto } from "../api";
import { PIPELINES_QUERY_KEY } from "@/features/shared/queries/pipelines";

const BOARD_KEY_PREFIXES = [
  "pipeline-board",
  "pipeline-board-filtered",
  "pipeline-board-search",
] as const;

function isBoardCacheKey(k: readonly unknown[]): boolean {
  return (
    typeof k[0] === "string" &&
    (BOARD_KEY_PREFIXES as readonly string[]).includes(k[0] as string)
  );
}

function applyOrder(stages: BoardStageDto[], orderedIds: string[]): BoardStageDto[] {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const next: BoardStageDto[] = [];
  orderedIds.forEach((id, position) => {
    const stage = byId.get(id);
    if (!stage) return;
    next.push({ ...stage, position });
    byId.delete(id);
  });
  for (const leftover of byId.values()) {
    next.push({ ...leftover, position: next.length });
  }
  return next;
}

export function useReorderPipelineStages(pipelineId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (stageIds: string[]) => {
      if (!pipelineId) throw new Error("Funil indisponível.");
      return reorderPipelineStages(pipelineId, stageIds);
    },
    onMutate: async (stageIds) => {
      await qc.cancelQueries({ predicate: (q) => isBoardCacheKey(q.queryKey) });
      const snapshots = qc.getQueriesData<BoardStageDto[]>({
        predicate: (q) => isBoardCacheKey(q.queryKey),
      });
      qc.setQueriesData<BoardStageDto[]>(
        { predicate: (q) => isBoardCacheKey(q.queryKey) },
        (prev) => (Array.isArray(prev) ? applyOrder(prev, stageIds) : prev),
      );
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
      toast.error(err instanceof Error ? err.message : "Não foi possível reordenar as etapas.");
    },
    onSuccess: () => {
      toast.success("Ordem das etapas atualizada.");
    },
    onSettled: () => {
      void qc.invalidateQueries({ predicate: (q) => isBoardCacheKey(q.queryKey) });
      void qc.invalidateQueries({ queryKey: PIPELINES_QUERY_KEY });
    },
  });
}
