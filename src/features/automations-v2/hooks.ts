"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";

import {
  createAutomation,
  deleteAutomation,
  fetchAutomation,
  fetchAutomationLogs,
  fetchAutomationStats,
  fetchAutomationSummary,
  fetchAutomations,
  replaceAutomation,
  saveAutomationSteps,
  toggleAutomationActive,
  updateAutomation,
  type AutomationDetailDto,
  type AutomationListItemDto,
  type AutomationListPage,
  type AutomationListSummary,
  type AutomationLogsPage,
  type AutomationStepInput,
  type AutomationWriteBody,
} from "./api";

import type { AutomationStats } from "@/lib/automation-stats-types";
import { isPreviewMode } from "@/lib/preview-mode";
import { isPageMockMode } from "@/lib/page-mock-mode";

function resolveEnabled(enabled: boolean | undefined): boolean {
  return isPreviewMode() || isPageMockMode() ? true : (enabled ?? true);
}

export function useAutomations(params: {
  active?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
  enabled?: boolean;
}) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  return useQuery<AutomationListPage>({
    queryKey: [
      "v2-automations",
      params.active === undefined ? "__any__" : params.active,
      params.search ?? "",
      page,
      perPage,
    ],
    queryFn: () =>
      fetchAutomations({
        active: params.active,
        search: params.search,
        page,
        perPage,
      }),
    enabled: resolveEnabled(params.enabled),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useAutomationsSummary(enabled?: boolean) {
  return useQuery<AutomationListSummary>({
    queryKey: ["v2-automations-summary"],
    queryFn: fetchAutomationSummary,
    enabled: resolveEnabled(enabled),
    staleTime: 2 * 60 * 1000,
  });
}

export function useToggleAutomation() {
  const qc = useQueryClient();
  return useMutation<AutomationListItemDto, Error, string>({
    mutationFn: toggleAutomationActive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v2-automations"], exact: false });
      qc.invalidateQueries({ queryKey: ["v2-automations-summary"] });
      qc.invalidateQueries({ queryKey: ["v2-automation"], exact: false });
    },
  });
}

export function useAutomation(id: string | null) {
  return useQuery<AutomationDetailDto>({
    queryKey: ["v2-automation", id ?? "__none__"],
    queryFn: () => fetchAutomation(id as string),
    enabled: isPreviewMode() ? !!id : !!id,
    staleTime: 10_000,
  });
}

/**
 * Contadores reais de execução (sucesso/falha/skip) por passo. O
 * `refetchInterval` espelha o editor legado — o canvas fica aberto por
 * muito tempo e os números precisam acompanhar as execuções.
 */
export function useAutomationStats(id: string | null, enabled?: boolean) {
  const visible = useDocumentVisible();
  return useQuery<AutomationStats>({
    queryKey: ["v2-automation-stats", id ?? "__none__"],
    queryFn: () => fetchAutomationStats(id as string),
    enabled: !!id && (enabled ?? true),
    refetchInterval: visible ? 30_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

/**
 * Logs de um passo (ou do gatilho, via `stepId: "trigger"`). Só dispara
 * com `enabled` — a modal de logs é quem liga a busca ao abrir.
 * `statuses` filtra no servidor (aba Sucessos/Alertas/Erros); sem isso
 * a lista mistura os 50 mais recentes e as abas mentem.
 */
export function useAutomationLogs(
  id: string | null,
  stepId: string | null,
  enabled: boolean,
  statuses?: readonly string[],
) {
  const statusKey = statuses?.length
    ? [...statuses].sort().join(",")
    : "__any__";
  return useInfiniteQuery<AutomationLogsPage>({
    queryKey: [
      "v2-automation-logs",
      id ?? "__none__",
      stepId ?? "__all__",
      statusKey,
    ],
    queryFn: ({ pageParam }) =>
      fetchAutomationLogs(id as string, {
        stepId: stepId ?? undefined,
        page: pageParam as number,
        perPage: 50,
        status: statuses,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const page = last.page ?? 1;
      const perPage = last.perPage ?? 50;
      const loaded = page * perPage;
      return loaded < last.total ? page + 1 : undefined;
    },
    enabled: !!id && enabled,
    staleTime: 10_000,
  });
}

function invalidateAutomations(
  qc: ReturnType<typeof useQueryClient>,
  id?: string,
) {
  qc.invalidateQueries({ queryKey: ["v2-automations"], exact: false });
  qc.invalidateQueries({ queryKey: ["v2-automations-summary"] });
  if (id) qc.invalidateQueries({ queryKey: ["v2-automation", id] });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation<AutomationDetailDto, Error, AutomationWriteBody>({
    mutationFn: createAutomation,
    onSuccess: () => invalidateAutomations(qc),
  });
}

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation<
    AutomationDetailDto,
    Error,
    { id: string; body: AutomationWriteBody }
  >({
    mutationFn: ({ id, body }) => updateAutomation(id, body),
    onSuccess: (_d, vars) => invalidateAutomations(qc, vars.id),
  });
}

/**
 * Substituição completa via PUT (mesmo endpoint do `OldAutomationEditor`).
 * Usado pelo fluxo de importação `.json` para enviar metadados + steps
 * (com `id` original preservado) num único request.
 */
export function useReplaceAutomation() {
  const qc = useQueryClient();
  return useMutation<
    AutomationDetailDto,
    Error,
    { id: string; body: AutomationWriteBody }
  >({
    mutationFn: ({ id, body }) => replaceAutomation(id, body),
    onSuccess: (_d, vars) => invalidateAutomations(qc, vars.id),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: deleteAutomation,
    onSuccess: (_d, id) => invalidateAutomations(qc, id),
  });
}

export function useSaveAutomationSteps() {
  const qc = useQueryClient();
  return useMutation<
    AutomationDetailDto,
    Error,
    { id: string; steps: AutomationStepInput[] }
  >({
    mutationFn: ({ id, steps }) => saveAutomationSteps(id, steps),
    onSuccess: (_d, vars) => invalidateAutomations(qc, vars.id),
  });
}
