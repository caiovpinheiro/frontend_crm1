"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  bulkAddLeadsParticipants,
  createLeadsDepartmentRule,
  deleteLeadsDepartmentRule,
  endLeadsEligibilityOverride,
  fetchLeadsDepartmentRulesSummary,
  fetchLeadsHistory,
  fetchLeadsParticipants,
  fetchLeadsSettings,
  fetchLeadsStats,
  setLeadsEligibilityOverride,
  updateLeadsDepartmentRule,
  updateLeadsParticipant,
  updateLeadsSettings,
} from "./leads-api";
import type {
  BulkAddLeadsParticipantsInput,
  LeadsDepartmentRuleInput,
  LeadsDepartmentRulesSummary,
  LeadsEligibilityOverrideInput,
  LeadsHistoryFilters,
  LeadsHistoryResponse,
  LeadsParticipantsResponse,
  LeadsSettingsResponse,
  LeadsStatsResponse,
  UpdateLeadsParticipantInput,
  UpdateLeadsSettingsInput,
} from "./leads-types";

export const LEADS_PARTICIPANTS_KEY = ["distribution-leads-participants"] as const;
export const LEADS_STATS_KEY = ["distribution-leads-stats"] as const;
export const LEADS_HISTORY_KEY = ["distribution-leads-history"] as const;
export const LEADS_SETTINGS_KEY = ["distribution-leads-settings"] as const;
export const LEADS_DEPARTMENT_RULES_KEY = ["distribution-leads-department-rules"] as const;

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
    mutationFn: (input: UpdateLeadsSettingsInput) => updateLeadsSettings(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_SETTINGS_KEY });
      void qc.invalidateQueries({ queryKey: LEADS_DEPARTMENT_RULES_KEY });
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
    // A coluna "Elegível" muda com o relógio (horário do departamento,
    // fim da liberação/pausa) — atualiza sem recarregar a página.
    refetchInterval: 60_000,
  });
}

/** Liberar/pausar até HH:MM, ou encerrar agora (`input` null). */
export function useLeadsEligibilityOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      input,
    }: {
      userId: string;
      input: LeadsEligibilityOverrideInput | null;
    }): Promise<unknown> =>
      input ? setLeadsEligibilityOverride(userId, input) : endLeadsEligibilityOverride(userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_PARTICIPANTS_KEY });
      void qc.invalidateQueries({ queryKey: LEADS_DEPARTMENT_RULES_KEY });
    },
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
      // Status/peso mudam "Ativos" e "Elegíveis" dos cards de departamento.
      void qc.invalidateQueries({ queryKey: LEADS_DEPARTMENT_RULES_KEY });
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

/**
 * Resumo por departamento (membros, elegíveis, disponível agora, próxima
 * mudança). Repete a cada minuto: a janela de horário muda sozinha, sem
 * recarregar a página.
 */
export function useLeadsDepartmentRulesSummary(enabled = true) {
  return useQuery<LeadsDepartmentRulesSummary>({
    queryKey: LEADS_DEPARTMENT_RULES_KEY,
    queryFn: fetchLeadsDepartmentRulesSummary,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useSaveLeadsDepartmentRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id?: string; input: LeadsDepartmentRuleInput }) =>
      args.id
        ? updateLeadsDepartmentRule(args.id, args.input)
        : createLeadsDepartmentRule(args.input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_DEPARTMENT_RULES_KEY });
    },
  });
}

export function useToggleLeadsDepartmentRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; enabled: boolean }) =>
      updateLeadsDepartmentRule(args.id, { enabled: args.enabled }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_DEPARTMENT_RULES_KEY });
    },
  });
}

export function useDeleteLeadsDepartmentRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLeadsDepartmentRule(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEADS_DEPARTMENT_RULES_KEY });
    },
  });
}
