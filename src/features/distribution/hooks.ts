"use client";

import { useEffect, useRef } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { subscribeSSEEvents } from "@/hooks/use-sse";

import {
  executeDistribution,
  fetchDistributionDepartmentStats,
  fetchDistributionLogs,
  fetchDistributionSettings,
  fetchPending,
  fetchResponsibles,
  redistributeResponsible,
  retryPending,
  setAgentStatus,
  simulateDistribution,
  updateDistributionSettings,
  updateResponsible,
  type DepartmentDistributionStatsResponse,
  type DistributionLogsPage,
  type DistributionSettings,
  type ExecuteDistributionInput,
} from "./api";
import type {
  AgentOnlineStatus,
  DistributionResult,
  PendingResponse,
  RedistributeInput,
  RedistributeResult,
  ResponsiblesResponse,
  RetryResult,
  UpdateResponsibleInput,
} from "./types";

export const DISTRIBUTION_RESPONSIBLES_KEY = ["distribution-responsibles"] as const;
export const DISTRIBUTION_PENDING_KEY = ["distribution-pending"] as const;
export const DISTRIBUTION_SETTINGS_KEY = ["distribution-settings"] as const;
export const DISTRIBUTION_LOGS_KEY = ["distribution-logs"] as const;
export const DISTRIBUTION_DEPT_STATS_KEY = [
  "distribution-department-stats",
] as const;

/** Poll de segurança da Fila (SSE cobre o instante; isto cobre gap/reconnect). */
const QUEUE_POLL_MS = 3_000;
const QUEUE_SSE_DEBOUNCE_MS = 400;

export function useDistributionLogs(enabled = true) {
  return useInfiniteQuery<DistributionLogsPage>({
    queryKey: DISTRIBUTION_LOGS_KEY,
    queryFn: ({ pageParam }) =>
      fetchDistributionLogs((pageParam as string | null) ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime: 10_000,
  });
}

export function useDistributionDepartmentStats(enabled = true) {
  return useQuery<DepartmentDistributionStatsResponse>({
    queryKey: DISTRIBUTION_DEPT_STATS_KEY,
    queryFn: fetchDistributionDepartmentStats,
    enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useDistributionSettings(enabled = true) {
  return useQuery<DistributionSettings>({
    queryKey: DISTRIBUTION_SETTINGS_KEY,
    queryFn: fetchDistributionSettings,
    enabled,
    staleTime: 30_000,
  });
}

export function useUpdateDistributionSettings() {
  const qc = useQueryClient();
  return useMutation<DistributionSettings, Error, Partial<DistributionSettings>>({
    mutationFn: (input) => updateDistributionSettings(input),
    onSuccess: (data) => {
      qc.setQueryData(DISTRIBUTION_SETTINGS_KEY, data);
      qc.invalidateQueries({ queryKey: DISTRIBUTION_PENDING_KEY });
    },
  });
}

export function useDistributionResponsibles(enabled = true) {
  return useQuery<ResponsiblesResponse>({
    queryKey: DISTRIBUTION_RESPONSIBLES_KEY,
    queryFn: fetchResponsibles,
    enabled,
    staleTime: 1_000,
    refetchInterval: enabled ? QUEUE_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** Invalida Fila geral + por consultor quando o inbox muda (msg / atribuição). */
export function useDistributionQueueRealtime(enabled = true) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const bump = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void qc.invalidateQueries({
          queryKey: DISTRIBUTION_RESPONSIBLES_KEY,
          refetchType: "active",
        });
        void qc.invalidateQueries({
          queryKey: DISTRIBUTION_PENDING_KEY,
          refetchType: "active",
        });
      }, QUEUE_SSE_DEBOUNCE_MS);
    };

    const unsubscribe = subscribeSSEEvents("/api/sse/messages", {
      new_message: bump,
      conversation_updated: bump,
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, qc]);
}

export function useUpdateResponsible() {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { userId: string; input: UpdateResponsibleInput },
    { prev: ResponsiblesResponse | undefined }
  >({
    mutationFn: ({ userId, input }) => updateResponsible(userId, input),
    onMutate: async ({ userId, input }) => {
      await qc.cancelQueries({ queryKey: DISTRIBUTION_RESPONSIBLES_KEY });
      const prev = qc.getQueryData<ResponsiblesResponse>(
        DISTRIBUTION_RESPONSIBLES_KEY,
      );
      if (prev?.responsibles) {
        qc.setQueryData<ResponsiblesResponse>(DISTRIBUTION_RESPONSIBLES_KEY, {
          ...prev,
          responsibles: prev.responsibles.map((r) => {
            if (r.userId !== userId) return r;
            return {
              ...r,
              ...(input.participates !== undefined
                ? { participates: input.participates }
                : {}),
              ...(input.paused !== undefined ? { paused: input.paused } : {}),
              ...(input.queueLimit !== undefined
                ? { queueLimit: input.queueLimit }
                : {}),
              ...(input.type !== undefined ? { type: input.type } : {}),
              ...(input.preLunchStopMinutes !== undefined
                ? { preLunchStopMinutes: input.preLunchStopMinutes }
                : {}),
              ...(input.schedule
                ? {
                    schedule: {
                      startTime:
                        input.schedule.startTime ??
                        r.schedule?.startTime ??
                        "08:00",
                      lunchStart:
                        input.schedule.lunchStart ??
                        r.schedule?.lunchStart ??
                        "12:00",
                      lunchEnd:
                        input.schedule.lunchEnd ??
                        r.schedule?.lunchEnd ??
                        "13:00",
                      endTime:
                        input.schedule.endTime ??
                        r.schedule?.endTime ??
                        "18:00",
                      timezone:
                        input.schedule.timezone ??
                        r.schedule?.timezone ??
                        "America/Sao_Paulo",
                      weekdays:
                        input.schedule.weekdays ??
                        r.schedule?.weekdays ?? [1, 2, 3, 4, 5],
                    },
                    hasSchedule: true,
                  }
                : {}),
            };
          }),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(DISTRIBUTION_RESPONSIBLES_KEY, ctx.prev);
    },
    onSettled: () =>
      qc.invalidateQueries({
        queryKey: DISTRIBUTION_RESPONSIBLES_KEY,
        refetchType: "active",
      }),
  });
}

export function useRedistributeResponsible() {
  const qc = useQueryClient();
  return useMutation<
    { result: RedistributeResult },
    Error,
    { userId: string; input: RedistributeInput }
  >({
    mutationFn: ({ userId, input }) => redistributeResponsible(userId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DISTRIBUTION_RESPONSIBLES_KEY });
      void qc.invalidateQueries({ queryKey: DISTRIBUTION_PENDING_KEY });
    },
  });
}

export function useSetAgentStatus() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { userId: string; status: AgentOnlineStatus },
    { prev: ResponsiblesResponse | undefined }
  >({
    mutationFn: ({ userId, status }) => setAgentStatus(userId, status),
    onMutate: async ({ userId, status }) => {
      await qc.cancelQueries({ queryKey: DISTRIBUTION_RESPONSIBLES_KEY });
      const prev = qc.getQueryData<ResponsiblesResponse>(
        DISTRIBUTION_RESPONSIBLES_KEY,
      );
      if (prev?.responsibles) {
        qc.setQueryData<ResponsiblesResponse>(DISTRIBUTION_RESPONSIBLES_KEY, {
          ...prev,
          responsibles: prev.responsibles.map((r) =>
            r.userId === userId ? { ...r, status } : r,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(DISTRIBUTION_RESPONSIBLES_KEY, ctx.prev);
    },
    onSettled: () => {
      // Ficar ONLINE drena a fila de espera no backend — atualiza ambos.
      void qc.invalidateQueries({
        queryKey: DISTRIBUTION_RESPONSIBLES_KEY,
        refetchType: "active",
      });
      void qc.invalidateQueries({
        queryKey: DISTRIBUTION_PENDING_KEY,
        refetchType: "active",
      });
    },
  });
}

export function useSimulateDistribution() {
  return useMutation<DistributionResult, Error, void>({
    mutationFn: () => simulateDistribution(),
  });
}

export function useExecuteDistribution() {
  const qc = useQueryClient();
  return useMutation<DistributionResult, Error, ExecuteDistributionInput>({
    mutationFn: (input) => executeDistribution(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DISTRIBUTION_RESPONSIBLES_KEY });
      void qc.invalidateQueries({ queryKey: DISTRIBUTION_PENDING_KEY });
      void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
    },
  });
}

export function usePendingDistributions(enabled = true) {
  return useQuery<PendingResponse>({
    queryKey: DISTRIBUTION_PENDING_KEY,
    queryFn: fetchPending,
    enabled,
    staleTime: 1_000,
    refetchInterval: enabled ? QUEUE_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useRetryPending() {
  const qc = useQueryClient();
  return useMutation<RetryResult, Error, void>({
    mutationFn: () => retryPending(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DISTRIBUTION_PENDING_KEY });
      qc.invalidateQueries({ queryKey: DISTRIBUTION_RESPONSIBLES_KEY });
    },
  });
}
