"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { isPageMockMode } from "@/lib/page-mock-mode";
import { isPreviewMode } from "@/lib/preview-mode";
import { fetchFilterOptions } from "@/components/pipeline/kanban-filters/api";
import type { FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";

import {
  createCampaign,
  deleteCampaign,
  fetchAudienceOptions,
  fetchAutomations,
  fetchCampaign,
  fetchCampaignStats,
  fetchCampaigns,
  fetchChannels,
  fetchRecipients,
  fetchSegments,
  fetchTemplates,
  previewAudience,
  runCampaignAction,
  type AudienceFilterOptions,
  type FetchCampaignsParams,
  type FetchRecipientsParams,
} from "./api";
import type {
  CampaignAction,
  CampaignFilters,
  CampaignStatus,
  CreateCampaignBody,
} from "./types";

export const CAMPAIGNS_KEY = ["campaigns"] as const;

function resolveEnabled(enabled: boolean | undefined): boolean {
  return isPreviewMode() || isPageMockMode() ? true : (enabled ?? true);
}

/** Status que ainda mudam sozinhos no backend (precisam de polling). */
const ACTIVE_STATUSES: CampaignStatus[] = [
  "SCHEDULED",
  "PROCESSING",
  "SENDING",
];

function hasActiveCampaign(statuses: CampaignStatus[]): boolean {
  return statuses.some((s) => ACTIVE_STATUSES.includes(s));
}

export function useCampaigns(params: FetchCampaignsParams = {}, enabled = true) {
  return useQuery({
    queryKey: [...CAMPAIGNS_KEY, "list", params],
    queryFn: () => fetchCampaigns(params),
    enabled: resolveEnabled(enabled),
    staleTime: 5_000,
    refetchInterval: (query) =>
      query.state.data &&
      hasActiveCampaign(query.state.data.items.map((c) => c.status))
        ? 10_000
        : false,
  });
}

export function useCampaign(id: string, enabled = true) {
  return useQuery({
    queryKey: [...CAMPAIGNS_KEY, "detail", id],
    queryFn: () => fetchCampaign(id),
    enabled: resolveEnabled(enabled) && !!id,
    refetchInterval: (query) =>
      query.state.data && ACTIVE_STATUSES.includes(query.state.data.status)
        ? 5_000
        : false,
  });
}

export function useCampaignStats(
  id: string,
  isActive: boolean,
  enabled = true,
) {
  return useQuery({
    queryKey: [...CAMPAIGNS_KEY, "stats", id],
    queryFn: () => fetchCampaignStats(id),
    enabled: resolveEnabled(enabled) && !!id,
    refetchInterval: isActive ? 10_000 : false,
  });
}

export function useCampaignRecipients(
  id: string,
  params: FetchRecipientsParams,
  enabled = true,
) {
  return useQuery({
    queryKey: [...CAMPAIGNS_KEY, "recipients", id, params],
    queryFn: () => fetchRecipients(id, params),
    enabled: resolveEnabled(enabled) && !!id,
  });
}

export function useCampaignActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: CampaignAction }) =>
      runCampaignAction(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...CAMPAIGNS_KEY, "detail"] });
      qc.invalidateQueries({ queryKey: [...CAMPAIGNS_KEY, "stats"] });
      qc.invalidateQueries({ queryKey: [...CAMPAIGNS_KEY, "recipients"] });
      qc.invalidateQueries({ queryKey: [...CAMPAIGNS_KEY, "list"] });
    },
  });
}

export function useCampaignAction(id: string) {
  const actions = useCampaignActions();
  return {
    ...actions,
    mutate: (action: CampaignAction) => actions.mutate({ id, action }),
    mutateAsync: (action: CampaignAction) => actions.mutateAsync({ id, action }),
  };
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCampaignBody) => createCampaign(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...CAMPAIGNS_KEY, "list"] });
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...CAMPAIGNS_KEY, "list"] });
    },
  });
}

export function usePreviewAudience() {
  return useMutation({
    mutationFn: (filters: CampaignFilters) => previewAudience(filters),
  });
}

// ── Recursos auxiliares (cacheados por mais tempo) ──

export function useChannels(enabled = true) {
  return useQuery({
    queryKey: ["campaigns", "channels"],
    queryFn: fetchChannels,
    enabled: resolveEnabled(enabled),
    staleTime: 60_000,
  });
}

export function useSegments(enabled = true) {
  return useQuery({
    queryKey: ["campaigns", "segments"],
    queryFn: fetchSegments,
    enabled: resolveEnabled(enabled),
    staleTime: 60_000,
  });
}

export function useAutomations(enabled = true) {
  return useQuery({
    queryKey: ["campaigns", "automations"],
    queryFn: fetchAutomations,
    enabled: resolveEnabled(enabled),
    staleTime: 60_000,
  });
}

export function useTemplates(enabled = true, channelId?: string | null) {
  return useQuery({
    queryKey: ["campaigns", "templates", channelId ?? "default"],
    queryFn: () => fetchTemplates(channelId),
    enabled: resolveEnabled(enabled) && (Boolean(channelId?.trim()) || channelId === undefined),
    staleTime: 60_000,
  });
}

/**
 * Opções de audiência (tags/pipelines/responsáveis).
 *
 * P1-6: bate no MESMO `GET /api/kanban/filter-options` (sem params) que o
 * painel de filtros do Kanban/Flow. Passou a consumir a key canônica
 * `["kanban-filter-options"]` com o fetcher canônico e derivar o shape de
 * audiência via `select` — antes a key própria furava o cache e rebaixava o
 * payload inteiro ao abrir /campaigns/new.
 *
 * Em page-mock-mode mantemos uma key própria: o mock cobre só um subconjunto
 * dos campos e não deve contaminar o cache canônico das páginas de pipeline.
 */
export function useAudienceOptions(enabled = true) {
  const mock = isPageMockMode();

  return useQuery<FilterOptionsResponse, Error, AudienceFilterOptions>({
    queryKey: mock ? ["campaigns", "audience-options"] : ["kanban-filter-options"],
    queryFn: mock ? fetchAudienceOptionsAsFilterOptions : fetchFilterOptions,
    select: (data) => ({
      tags: data.tags ?? [],
      pipelines: data.pipelines ?? [],
      users: data.users ?? [],
    }),
    enabled: resolveEnabled(enabled),
    staleTime: 5 * 60_000,
  });
}

/** Adapta o mock de audiência ao shape canônico das filter-options. */
async function fetchAudienceOptionsAsFilterOptions(): Promise<FilterOptionsResponse> {
  const o = await fetchAudienceOptions();
  return {
    tags: o.tags,
    pipelines: o.pipelines.map((p) => ({
      ...p,
      stages: p.stages.map((s, i) => ({ ...s, color: "", position: i })),
    })),
    users: o.users.map((u) => ({ ...u, role: "", type: "" })),
    dealCustomFields: [],
    contactCustomFields: [],
    sources: [],
  };
}
