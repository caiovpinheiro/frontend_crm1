"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addDemandStage,
  commentDemandItem,
  createDemandBoard,
  createDemandItem,
  deleteDemandBoard,
  deleteDemandItem,
  getDemandBoard,
  getDemandItem,
  listDemandBoards,
  moveDemandItem,
  patchDemandItem,
  voteDemandItem,
} from "./api";
import type { DemandBoardLite, DemandItemKind, DemandPriority } from "./types";

export const DEMAND_BOARDS_KEY = ["demand-boards"] as const;
export const demandBoardKey = (id: string) => ["demand-board", id] as const;
export const demandItemKey = (id: string) => ["demand-item", id] as const;

export function useDemandBoards(enabled = true) {
  return useQuery({
    queryKey: DEMAND_BOARDS_KEY,
    queryFn: listDemandBoards,
    enabled,
    staleTime: 15_000,
  });
}

export function useDemandBoard(id: string | null) {
  return useQuery({
    queryKey: demandBoardKey(id ?? ""),
    queryFn: () => getDemandBoard(id!),
    enabled: !!id,
    staleTime: 8_000,
  });
}

export function useDemandItem(id: string | null) {
  return useQuery({
    queryKey: demandItemKey(id ?? ""),
    queryFn: () => getDemandItem(id!),
    enabled: !!id,
  });
}

export function useDemandMutations() {
  const qc = useQueryClient();
  const invalidateBoard = (boardId?: string) => {
    void qc.invalidateQueries({ queryKey: DEMAND_BOARDS_KEY });
    if (boardId) void qc.invalidateQueries({ queryKey: demandBoardKey(boardId) });
  };

  const createBoard = useMutation({
    mutationFn: createDemandBoard,
    onSuccess: () => invalidateBoard(),
  });

  const addStage = useMutation({
    mutationFn: (input: { boardId: string; name: string }) =>
      addDemandStage(input.boardId, { name: input.name }),
    onSuccess: (_d, vars) => invalidateBoard(vars.boardId),
  });

  const createItem = useMutation({
    mutationFn: createDemandItem,
    onSuccess: (item) => {
      invalidateBoard(item.boardId);
    },
  });

  const patchItem = useMutation({
    mutationFn: (input: {
      id: string;
      boardId: string;
      patch: Parameters<typeof patchDemandItem>[1];
    }) => patchDemandItem(input.id, input.patch),
    onSuccess: (item) => {
      invalidateBoard(item.boardId);
      void qc.invalidateQueries({ queryKey: demandItemKey(item.id) });
    },
  });

  const moveItem = useMutation({
    mutationFn: (input: {
      id: string;
      boardId: string;
      stageId: string;
      beforeId?: string | null;
      afterId?: string | null;
    }) =>
      moveDemandItem(input.id, {
        stageId: input.stageId,
        beforeId: input.beforeId,
        afterId: input.afterId,
      }),
    onSuccess: (item) => invalidateBoard(item.boardId),
  });

  const comment = useMutation({
    mutationFn: (input: { id: string; content: string }) =>
      commentDemandItem(input.id, input.content),
    onSuccess: (_c, vars) => {
      void qc.invalidateQueries({ queryKey: demandItemKey(vars.id) });
    },
  });

  const vote = useMutation({
    mutationFn: (input: { id: string; boardId: string }) => voteDemandItem(input.id),
    onSuccess: (res, vars) => {
      invalidateBoard(vars.boardId);
      void qc.invalidateQueries({ queryKey: demandItemKey(vars.id) });
      return res;
    },
  });

  const deleteBoard = useMutation({
    mutationFn: deleteDemandBoard,
    onSuccess: (_d, id) => {
      qc.setQueryData<{ boards: DemandBoardLite[] }>(DEMAND_BOARDS_KEY, (prev) =>
        prev ? { boards: prev.boards.filter((b) => b.id !== id) } : prev,
      );
      void qc.invalidateQueries({ queryKey: DEMAND_BOARDS_KEY });
      void qc.removeQueries({ queryKey: demandBoardKey(id) });
    },
  });

  const deleteItem = useMutation({
    mutationFn: (input: { id: string; boardId: string }) => deleteDemandItem(input.id),
    onSuccess: (_d, vars) => {
      invalidateBoard(vars.boardId);
      void qc.removeQueries({ queryKey: demandItemKey(vars.id) });
    },
  });

  return {
    createBoard,
    addStage,
    createItem,
    patchItem,
    moveItem,
    comment,
    vote,
    deleteBoard,
    deleteItem,
  };
}

export function kindOptions(): { value: DemandItemKind; label: string }[] {
  return [
    { value: "REQUEST", label: "Solicitação" },
    { value: "FEATURE", label: "Feature" },
    { value: "IMPROVEMENT", label: "Melhoria" },
    { value: "BUG", label: "Bug" },
    { value: "TASK", label: "Tarefa" },
  ];
}

export function priorityOptions(): { value: DemandPriority; label: string }[] {
  return [
    { value: "NONE", label: "Sem prioridade" },
    { value: "LOW", label: "Baixa" },
    { value: "MEDIUM", label: "Média" },
    { value: "HIGH", label: "Alta" },
    { value: "URGENT", label: "Urgente" },
  ];
}
