"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
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
  PENDING_PAGE_SIZE,
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

/** Poll da Fila SEM assinatura SSE ativa (tela sem realtime montado). */
export const QUEUE_POLL_MS = 20_000;
/** Carga por consultor (`getQueueCounts`) — um pouco mais lenta que a fila. */
export const COUNTS_POLL_MS = 30_000;
/**
 * Com o realtime da distribuição assinado, o SSE cobre o instante e o poll
 * vira só rede de segurança (gap silencioso da stream).
 */
export const QUEUE_SAFETY_POLL_MS = 120_000;
/**
 * Debounce (trailing) da invalidação disparada por `new_message` /
 * `conversation_updated`. Cada mensagem da org bate aqui; 2 s com inbox
 * quente ainda era GET de equipe+fila a cada 2 s. Os contadores são
 * agregados — 6 s de atraso não muda a leitura do widget.
 */
export const QUEUE_SSE_DEBOUNCE_MS = 6_000;

/**
 * Intervalo efetivo do poll de uma query do widget: desligado quando a
 * query está inativa ou o poll foi desligado; poll de segurança (120 s)
 * enquanto `useDistributionQueueRealtime` está assinado; senão `baseMs`.
 */
export function distributionPollInterval(opts: {
  enabled: boolean;
  poll: boolean;
  sseActive: boolean;
  baseMs: number;
}): number | false {
  if (!opts.enabled || !opts.poll) return false;
  return opts.sseActive ? QUEUE_SAFETY_POLL_MS : opts.baseMs;
}

// ── Assinatura SSE ativa (contador de montagens de useDistributionQueueRealtime) ──
// Store externo mínimo: as queries de fila/equipe leem daqui para reduzir o
// poll enquanto o realtime está no ar, sem que a página precise encadear props.
let sseSubscribers = 0;
const sseListeners = new Set<() => void>();
function markSseActive(delta: 1 | -1) {
  sseSubscribers = Math.max(0, sseSubscribers + delta);
  for (const fn of sseListeners) fn();
}
function subscribeSseActive(fn: () => void) {
  sseListeners.add(fn);
  return () => {
    sseListeners.delete(fn);
  };
}
const getSseActive = () => sseSubscribers > 0;
const getSseActiveServer = () => false;

/** `true` enquanto houver `useDistributionQueueRealtime` montado e ativo. */
export function useDistributionSseActive(): boolean {
  return useSyncExternalStore(subscribeSseActive, getSseActive, getSseActiveServer);
}

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
    refetchOnWindowFocus: false,
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
      void qc.invalidateQueries({ queryKey: ["distribution-leads-settings"] });
    },
  });
}

export function useDistributionResponsibles(
  enabled = true,
  opts?: { poll?: boolean },
) {
  const poll = opts?.poll !== false;
  const sseActive = useDistributionSseActive();
  return useQuery<ResponsiblesResponse>({
    queryKey: DISTRIBUTION_RESPONSIBLES_KEY,
    queryFn: fetchResponsibles,
    enabled,
    staleTime: 30_000,
    refetchInterval: distributionPollInterval({
      enabled,
      poll,
      sseActive,
      baseMs: COUNTS_POLL_MS,
    }),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Invalida Fila geral + por consultor quando o inbox muda (msg / atribuição).
 * Enquanto montado, as queries do widget caem para o poll de segurança
 * (`useDistributionSseActive`); a reconexão da stream invalida na hora.
 */
export function useDistributionQueueRealtime(
  enabled = true,
  opts?: { pending?: boolean },
) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = opts?.pending === true;

  useEffect(() => {
    if (!enabled) return;

    const invalidate = () => {
      void qc.invalidateQueries({
        queryKey: DISTRIBUTION_RESPONSIBLES_KEY,
        refetchType: "active",
      });
      void qc.invalidateQueries({
        queryKey: DISTRIBUTION_PENDING_KEY,
        refetchType: pending ? "active" : "none",
      });
    };

    const bump = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        invalidate();
      }, QUEUE_SSE_DEBOUNCE_MS);
    };

    markSseActive(1);
    const unsubscribe = subscribeSSEEvents(
      "/api/sse/messages",
      {
        new_message: bump,
        conversation_updated: bump,
      },
      // Gap na stream: o que chegou nesse meio tempo foi perdido — recarrega.
      invalidate,
    );

    return () => {
      unsubscribe();
      markSseActive(-1);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, pending, qc]);
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
              ...(input.volume !== undefined ? { volume: input.volume } : {}),
              ...(input.preLunchStopMinutes !== undefined
                ? { preLunchStopMinutes: input.preLunchStopMinutes }
                : {}),
              ...(input.departmentIds
                ? {
                    departments: r.departments?.filter((d) =>
                      input.departmentIds!.includes(d.id),
                    ),
                  }
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
                      saturdayEnabled:
                        input.schedule.saturdayEnabled ??
                        r.schedule?.saturdayEnabled,
                      saturdayStart:
                        input.schedule.saturdayStart ??
                        r.schedule?.saturdayStart,
                      saturdayEnd:
                        input.schedule.saturdayEnd ??
                        r.schedule?.saturdayEnd,
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

export { PENDING_PAGE_SIZE };

export function usePendingDistributions(
  enabled = true,
  cursor: string | null = null,
  opts?: { poll?: boolean },
) {
  const poll = opts?.poll === true;
  const sseActive = useDistributionSseActive();
  return useQuery<PendingResponse>({
    queryKey: cursor
      ? ([...DISTRIBUTION_PENDING_KEY, cursor] as const)
      : DISTRIBUTION_PENDING_KEY,
    queryFn: () => fetchPending({ cursor, limit: PENDING_PAGE_SIZE }),
    enabled,
    staleTime: 30_000,
    refetchInterval: distributionPollInterval({
      enabled,
      poll: poll && !cursor,
      sseActive,
      baseMs: QUEUE_POLL_MS,
    }),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
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
