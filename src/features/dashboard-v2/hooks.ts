"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchDashboard,
  fetchDashboardMe,
  fetchServiceOverview,
  type DashboardData,
  type DashboardFiltersState,
  type DashboardMeData,
  type DashboardPeriod,
  type PipelineOption,
  type ServiceOverview,
} from "./api";
import {
  fetchPainelAgora,
  fetchPainelDeals,
  fetchPainelService,
  type PainelAgora,
  type PainelDealsResult,
  type PainelServiceResult,
} from "./painel-api";

import { fetchFilterOptions } from "@/components/pipeline/kanban-filters/api";
import type { FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";
import { fetchSystemUsageSummary } from "@/features/system-usage/api";
import type { SystemUsageSummaryResponse } from "@/features/system-usage/types";
import { useActivityStats } from "@/features/activity-feed/use-activity-stats";
import { isPageMockMode } from "@/lib/page-mock-mode";
import { isPreviewMode } from "@/lib/preview-mode";
import { usePipelinesQuery } from "@/features/shared/queries/pipelines";
import {
  mockEventCard,
  mockFilterOptions,
  mockSystemUsageToday,
} from "./mock-painel";
import type { PainelCustomFieldCard, PainelEventCard } from "./painel-api";
import type { NegociosCustomCard } from "./use-negocios-grid";
import { todayRangeISO } from "./use-dashboard-filters";

export function useServiceOverview(params: {
  period: DashboardPeriod;
  enabled?: boolean;
}) {
  return useQuery<ServiceOverview>({
    queryKey: ["dashboard-v2", "service", params.period],
    queryFn: () => fetchServiceOverview({ period: params.period }),
    enabled: isPreviewMode() ? true : (params.enabled ?? true),
    staleTime: 30_000,
  });
}

export function usePipelineOptions(enabled = true) {
  return usePipelinesQuery<PipelineOption>(enabled);
}

export function useDashboard(
  filters: DashboardFiltersState,
  enabled = true,
) {
  return useQuery<DashboardData>({
    queryKey: ["dashboard-v2", "commercial", filters],
    queryFn: () => fetchDashboard(filters),
    enabled: isPreviewMode() || isPageMockMode() ? true : enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

const DEAL_LIVE_SECTIONS = [
  "kpis",
  "funnel",
  "evolution",
  "agents",
  "sources",
  "exceptions",
] as const;

function emptyDealsResult(): PainelDealsResult {
  return {
    kpis: { ok: false, error: "omitido" },
    funnel: { ok: false, error: "omitido" },
    evolution: { ok: false, error: "omitido" },
    agents: { ok: false, error: "omitido" },
    sources: { ok: false, error: "omitido" },
    exceptions: { ok: false, error: "omitido" },
  };
}

function emptyServiceResult(): PainelServiceResult {
  return {
    agora: { ok: false, error: "omitido" },
    volume: { ok: false, error: "omitido" },
    tempo: { ok: false, error: "omitido" },
    heatmap: { ok: false, error: "omitido" },
    byDepartment: { ok: false, error: "omitido" },
    connections: { ok: false, error: "omitido" },
    attendants: { ok: false, error: "omitido" },
    channels: { ok: false, error: "omitido" },
    exceptions: { ok: false, error: "omitido" },
  };
}

/** Volume alone first so KPIs paint without waiting for heatmap SQL. */
const SERVICE_VOLUME_SECTION = "volume";
const SERVICE_HEAVY_SECTIONS = "tempo,byDepartment,attendants,channels";

export function usePainelDeals(filters: DashboardFiltersState, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = ["painel", "deals", filters] as const;
  const live = isPreviewMode() || isPageMockMode() ? true : enabled;

  useEffect(() => {
    if (live) return;
    void queryClient.cancelQueries({ queryKey: ["painel", "deals"] });
  }, [live, queryClient]);

  const query = useQuery<PainelDealsResult>({
    queryKey,
    queryFn: async ({ signal }) => {
      const acc = emptyDealsResult();
      await Promise.all(
        DEAL_LIVE_SECTIONS.map(async (section) => {
          try {
            const part = await fetchPainelDeals(filters, section, undefined, signal);
            Object.assign(acc, pickDefined(part));
          } catch (e) {
            if (signal.aborted) throw e;
            const error = e instanceof Error ? e.message : "Falha ao carregar este bloco.";
            Object.assign(acc, { [section]: { ok: false, error } });
          }
          queryClient.setQueryData<PainelDealsResult>(queryKey, { ...acc });
        }),
      );
      return acc;
    },
    enabled: live,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  async function retrySection(section: string) {
    try {
      const next = await fetchPainelDeals(filters, section);
      queryClient.setQueryData<PainelDealsResult>(queryKey, (old) =>
        old ? { ...old, ...pickDefined(next) } : next,
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : "Falha ao carregar este bloco.";
      queryClient.setQueryData<PainelDealsResult>(queryKey, (old) =>
        old
          ? { ...old, [section]: { ok: false, error } }
          : { ...emptyDealsResult(), [section]: { ok: false, error } },
      );
    }
  }

  return { ...query, retrySection };
}

export function usePainelAgora(
  clock: "business" | "elapsed",
  enabled = true,
) {
  return useQuery<PainelAgora>({
    queryKey: ["painel", "agora", clock],
    queryFn: ({ signal }) => fetchPainelAgora(clock, signal),
    enabled: isPreviewMode() || isPageMockMode() ? true : enabled,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

function servicePeriodStamp(
  filters: DashboardFiltersState,
  clock: "business" | "elapsed",
) {
  return `${filters.period}|${filters.startDate ?? ""}|${filters.endDate ?? ""}|${clock}`;
}

const SERVICE_REST_SECTIONS = ["heatmap", "connections", "exceptions"] as const;
const REST_ARM_MS = 2_000;
const HEAVY_ARM_MS = 6_000;

function isHeavyServiceSection(section: string) {
  return SERVICE_HEAVY_SECTIONS.split(",").some((key) => section.split(",").includes(key));
}

function isRestServiceSection(section: string) {
  return SERVICE_REST_SECTIONS.some((key) => section.split(",").includes(key));
}

function useArmedAfter(ok: boolean, delayMs: number) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!ok) {
      setArmed(false);
      return;
    }
    const id = window.setTimeout(() => setArmed(true), delayMs);
    return () => window.clearTimeout(id);
  }, [ok, delayMs]);
  return armed;
}

async function fetchServiceWaves(
  filters: DashboardFiltersState,
  clock: "business" | "elapsed",
  waves: string[],
  signal: AbortSignal,
  onPartial: (acc: PainelServiceResult) => void,
): Promise<PainelServiceResult> {
  const acc = emptyServiceResult();
  for (const section of waves) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      Object.assign(acc, pickDefined(await fetchPainelService({ filters, clock, section, signal })));
    } catch (e) {
      if (signal.aborted) throw e;
      const error = e instanceof Error ? e.message : "Falha ao carregar este bloco.";
      for (const key of section.split(",")) {
        Object.assign(acc, { [key]: { ok: false, error } });
      }
    }
    onPartial({ ...acc });
  }
  return acc;
}

export function usePainelService(
  filters: DashboardFiltersState,
  clock: "business" | "elapsed",
  enabled = true,
  mode: "full" | "light" = "full",
) {
  const queryClient = useQueryClient();
  const volumeKey = ["painel", "service", filters, clock, "volume"] as const;
  const restKey = ["painel", "service", filters, clock, "rest"] as const;
  const heavyKey = ["painel", "service", filters, clock, "heavy"] as const;
  const live = isPreviewMode() || isPageMockMode() ? true : enabled;
  const stamp = servicePeriodStamp(filters, clock);
  const wantCharts = mode === "full";
  const wantHeavy = mode === "full";

  useEffect(() => {
    if (!live) return;
    void queryClient.cancelQueries({
      predicate: (q) => {
        const key = q.queryKey;
        if (key[0] !== "painel" || key[1] !== "service") return false;
        const f = key[2] as DashboardFiltersState | undefined;
        const c = key[3] as "business" | "elapsed" | undefined;
        if (!f || !c) return false;
        return servicePeriodStamp(f, c) !== stamp;
      },
    });
  }, [live, stamp, queryClient]);

  useEffect(() => {
    if (live) return;
    void queryClient.cancelQueries({
      predicate: (q) => {
        const key = q.queryKey;
        return (
          key[0] === "painel" &&
          key[1] === "service" &&
          (key[4] === "rest" || key[4] === "heavy")
        );
      },
    });
  }, [live, queryClient]);

  const volume = useQuery<PainelServiceResult>({
    queryKey: volumeKey,
    queryFn: ({ signal }) =>
      fetchServiceWaves(
        filters,
        clock,
        [SERVICE_VOLUME_SECTION],
        signal,
        (acc) => queryClient.setQueryData<PainelServiceResult>(volumeKey, acc),
      ),
    enabled: live,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const volumeOk = volume.data?.volume?.ok === true;
  const restArmed = useArmedAfter(live && wantCharts && volumeOk, REST_ARM_MS);
  const heavyArmed = useArmedAfter(live && wantHeavy && volumeOk, HEAVY_ARM_MS);

  const rest = useQuery<PainelServiceResult>({
    queryKey: restKey,
    queryFn: ({ signal }) =>
      fetchServiceWaves(
        filters,
        clock,
        [...SERVICE_REST_SECTIONS],
        signal,
        (acc) => queryClient.setQueryData<PainelServiceResult>(restKey, acc),
      ),
    enabled: restArmed,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const heavy = useQuery<PainelServiceResult>({
    queryKey: heavyKey,
    queryFn: ({ signal }) =>
      fetchServiceWaves(
        filters,
        clock,
        [SERVICE_HEAVY_SECTIONS],
        signal,
        (acc) => queryClient.setQueryData<PainelServiceResult>(heavyKey, acc),
      ),
    enabled: heavyArmed,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const data = useMemo(() => {
    if (!volume.data && !rest.data && !heavy.data) return undefined;
    return {
      ...emptyServiceResult(),
      ...pickDefined(volume.data ?? emptyServiceResult()),
      ...pickDefined(rest.data ?? emptyServiceResult()),
      ...pickDefined(heavy.data ?? emptyServiceResult()),
    };
  }, [volume.data, rest.data, heavy.data]);

  async function retrySection(section: string) {
    const next = await fetchPainelService({ filters, clock, section });
    const key = isHeavyServiceSection(section)
      ? heavyKey
      : isRestServiceSection(section)
        ? restKey
        : volumeKey;
    queryClient.setQueryData<PainelServiceResult>(key, (old) =>
      old ? { ...old, ...pickDefined(next) } : { ...emptyServiceResult(), ...pickDefined(next) },
    );
  }

  return {
    ...volume,
    data,
    isFetching: volume.isFetching || rest.isFetching || heavy.isFetching,
    refetch: async () => {
      const result = await volume.refetch();
      if (wantCharts) await rest.refetch();
      if (wantHeavy) await heavy.refetch();
      return result;
    },
    retrySection,
  };
}

function pickDefined<T extends Record<string, { ok: boolean; error?: string }>>(
  next: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value && !(value.ok === false && value.error === "omitido")) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function useDashboardMe(enabled = true) {
  return useQuery<DashboardMeData>({
    queryKey: ["dashboard-v2", "me"],
    queryFn: fetchDashboardMe,
    enabled: isPreviewMode() || isPageMockMode() ? true : enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useDashboardFilterOptions(enabled = true) {
  return useQuery<FilterOptionsResponse>({
    queryKey: ["dashboard-filter-options", isPageMockMode() ? "mock" : "live"],
    queryFn: () => (isPageMockMode() ? mockFilterOptions() : fetchFilterOptions()),
    enabled: isPreviewMode() || isPageMockMode() ? true : enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSystemUsageToday(enabled = true) {
  const range = todayRangeISO();
  return useQuery<SystemUsageSummaryResponse>({
    queryKey: ["painel", "system-usage-today"],
    queryFn: () =>
      isPageMockMode()
        ? Promise.resolve(mockSystemUsageToday())
        : fetchSystemUsageSummary(range.from, range.to),
    enabled: isPreviewMode() || isPageMockMode() ? true : enabled,
    staleTime: 30_000,
  });
}

export function usePainelCustomFields(
  filters: DashboardFiltersState,
  fieldIds: string[],
  enabled = true,
) {
  return useQuery<PainelCustomFieldCard[]>({
    queryKey: ["painel", "custom-fields", filters, fieldIds],
    queryFn: async ({ signal }) => {
      const data = await fetchPainelDeals(filters, "customFields", fieldIds, signal);
      if (!data.customFields?.ok) return [];
      return data.customFields.data;
    },
    enabled: (isPreviewMode() || isPageMockMode() ? true : enabled) && fieldIds.length > 0,
    staleTime: 30_000,
  });
}

export function usePainelEventCards(
  filters: DashboardFiltersState,
  cards: NegociosCustomCard[],
  enabled = true,
) {
  const eventCards = cards.filter((c) => c.type === "event");
  const period = {
    dateFrom: undefined as string | undefined,
    dateTo: undefined as string | undefined,
  };
  const stats = useActivityStats(enabled && eventCards.length > 0, period);
  const service = usePainelService(
    filters,
    "business",
    enabled &&
      eventCards.some((c) =>
        ["messages_in", "messages_out", "queue"].includes(c.eventType ?? ""),
      ),
    "light",
  );

  return eventCards.map((card) => {
    const type = card.eventType ?? "";
    if (isPageMockMode()) {
      return { card, data: mockEventCard(type, 1) };
    }
    const built: PainelEventCard = {
      eventType: type,
      title: card.title,
      value: 0,
      unit: type === "avg_response" ? "duration" : "count",
      byUser: [],
      href: type.startsWith("MESSAGE") || type === "messages_in" || type === "messages_out"
        ? `/logs?type=${encodeURIComponent(type === "messages_in" ? "MESSAGE_RECEIVED" : type === "messages_out" ? "MESSAGE_SENT" : type)}`
        : type === "queue" || type === "avg_response"
          ? "/inbox"
          : `/logs?type=${encodeURIComponent(type)}`,
    };
    if (type === "messages_in" && service.data?.volume.ok) {
      built.value = service.data.volume.data.messagesIn;
    } else if (type === "messages_out" && service.data?.volume.ok) {
      built.value = service.data.volume.data.messagesOut;
    } else if (type === "avg_response" && service.data?.tempo.ok) {
      built.value = service.data.tempo.data.firstResponse.medianMs ?? 0;
      built.unit = "duration";
    } else if (type === "queue" && service.data?.volume.ok) {
      built.value = service.data.volume.data.stillOpen.value;
    } else if (stats.data) {
      const hit = stats.data.totals.byType.find((r) => r.type === type);
      built.value = hit?.count ?? 0;
    }
    return { card, data: built };
  });
}
