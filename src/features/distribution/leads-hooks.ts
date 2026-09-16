"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  bulkAddLeadsParticipants,
  fetchLeadsHistory,
  fetchLeadsParticipants,
  fetchLeadsSettings,
  fetchLeadsStats,
  updateLeadsParticipant,
  updateLeadsSettings,
} from "./leads-api";
import type {
  BulkAddLeadsParticipantsInput,
  LeadsHistoryFilters,
  LeadsHistoryResponse,
  LeadsParticipantsResponse,
  LeadsSettingsResponse,
  LeadsStatsResponse,
  UpdateLeadsParticipantInput,
} from "./leads-types";

export const LEADS_PARTICIPANTS_KEY = ["distribution-leads-participants"] as const;
export const LEADS_STATS_KEY = ["distribution-leads-stats"] as const;
export const LEADS_HISTORY_KEY = ["distribution-leads-history"] as const;
export const LEADS_SETTINGS_KEY = ["distribution-leads-settings"] as const;

export function useLeadsSettings(enabled = true) {
  return useQuery<LeadsSettingsResponse>({
    queryKey: LEADS_SETTINGS_KEY,
    queryFn: fetchLeadsSettings,
    enabled,
    staleTime: 10_000,
  });
}

export function useUpdateLeadsSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { enabled: boolean }) => updateLeadsSettings(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_SETTINGS_KEY });
    },
  });
}

export function useLeadsParticipants(enabled = true) {
  return useQuery<LeadsParticipantsResponse>({
    queryKey: LEADS_PARTICIPANTS_KEY,
    queryFn: fetchLeadsParticipants,
    enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateLeadsParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      input,
    }: {
      userId: string;
      input: UpdateLeadsParticipantInput;
    }) => updateLeadsParticipant(userId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_PARTICIPANTS_KEY });
      void qc.invalidateQueries({ queryKey: LEADS_STATS_KEY });
    },
  });
}

export function useBulkAddLeadsParticipants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkAddLeadsParticipantsInput) =>
      bulkAddLeadsParticipants(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_PARTICIPANTS_KEY });
      void qc.invalidateQueries({ queryKey: LEADS_STATS_KEY });
    },
  });
}

export function useLeadsStats(filters: LeadsHistoryFilters, enabled = true) {
  return useQuery<LeadsStatsResponse>({
    queryKey: [...LEADS_STATS_KEY, filters],
    queryFn: () => fetchLeadsStats(filters),
    enabled,
    staleTime: 10_000,
  });
}

export function useLeadsHistory(filters: LeadsHistoryFilters, enabled = true) {
  return useInfiniteQuery<LeadsHistoryResponse>({
    queryKey: [...LEADS_HISTORY_KEY, filters],
    queryFn: ({ pageParam }) =>
      fetchLeadsHistory(filters, (pageParam as string | null) ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime: 10_000,
  });
}
