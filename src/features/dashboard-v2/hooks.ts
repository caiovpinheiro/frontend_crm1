"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchDashboardMe,
  type DashboardFiltersState,
  type DashboardMeData,
} from "./api";
import {
  fetchPainelAgora,
  fetchPainelDeals,
  fetchPainelInsights,
  fetchPainelService,
  fetchPainelTeam,
  requestFilters,
  type PainelAgora,
  type PainelDealsResult,
  type PainelInsights,
  type PainelRequestFilters,
  type PainelServiceResult,
  type PainelTeamResult,
  type PainelTeamScope,
  type PainelTeamSection,
} from "./painel-api";

import type { FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";
import { filterOptionsQuery } from "@/components/pipeline/kanban-filters/use-filter-options";
import { fetchSystemUsageSummary } from "@/features/system-usage/api";
import type { SystemUsageSummaryResponse } from "@/features/system-usage/types";
import { useActivityStats } from "@/features/activity-feed/use-activity-stats";
import { isPageMockMode } from "@/lib/page-mock-mode";
import { isPreviewMode } from "@/lib/preview-mode";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import {
  usePipelinesQuery,
  type PipelineListItemDto,
} from "@/features/shared/queries/pipelines";
import {
  mockEventCard,
  mockFilterOptions,
  mockSystemUsageToday,
} from "./mock-painel";
import type { PainelCustomFieldCard, PainelEventCard } from "./painel-api";
import type { NegociosCustomCard } from "./use-negocios-grid";
import { todayRangeISO, type DashboardPipelineOption } from "./use-dashboard-filters";
import {
  isBlockPending,
  isBlockUnavailable,
  isSectionKnownUnavailable,
  normalizeRequestedBlocks,
  rememberUnavailableSections,
  unavailableBlock,
  useUnavailableSections,
} from "./service-availability";
import {
  SERVICE_HEAVY_SECTIONS,
  SERVICE_REST_SECTIONS,
  growSections,
  splitServiceWaves,
  type ServiceSection,
} from "./visible-sections";

/**
 * Lista de funis (com etapas) — a query compartilhada do shell
 * (`GET /api/pipelines`). É daqui que o `?pipeline=7` da URL vira CUID e
 * que o painel de filtros lista funis/etapas; não depende das opções de
 * filtro (`useDashboardFilterOptions`), que só são buscadas ao abrir o painel.
 */
export function usePipelineOptions(enabled = true) {
  return usePipelinesQuery<PipelineListItemDto & DashboardPipelineOption>(enabled);
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

/**
 * Lista que só cresce enquanto o componente vive: esconder um widget não troca a
 * chave da query (não refaz o GET); mostrar um novo acrescenta o bloco dele.
 */
function useGrowingList<T extends string>(next: readonly T[] | undefined): T[] | undefined {
  const [seen, setSeen] = useState<T[]>([]);
  const grown = next ? growSections(seen, next) : undefined;
  // Atualização durante o render (padrão do React para estado derivado de props).
  if (grown && grown !== seen) setSeen(grown);
  return grown;
}

export function usePainelDeals(filters: DashboardFiltersState, enabled = true) {
  const queryClient = useQueryClient();
  // Chave só com o que vai na URL: o filtro de usuário é aplicado no cliente.
  const reqFilters = useMemo(() => requestFilters(filters), [filters]);
  const queryKey = ["painel", "deals", reqFilters] as const;
  const live = isPreviewMode() || isPageMockMode() ? true : enabled;

  useEffect(() => {
    if (live) return;
    void queryClient.cancelQueries({ queryKey: ["painel", "deals"] });
  }, [live, queryClient]);

  const query = useQuery<PainelDealsResult>({
    queryKey,
    // Uma chamada com todas as seções: o backend aceita CSV em `section`
    // (`parseDealSections`) e roda os blocos em paralelo, devolvendo
    // `ok:false` por bloco em caso de erro. Antes eram 6 GETs simultâneos
    // que, pelo proxy do Next, se serializavam e refaziam auth/escopo/
    // período seis vezes.
    queryFn: async ({ signal }) => {
      const part = await fetchPainelDeals(
        filters,
        DEAL_LIVE_SECTIONS.join(","),
        undefined,
        signal,
      );
      return { ...emptyDealsResult(), ...pickDefined(part) };
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
  const visible = useDocumentVisible();
  return useQuery<PainelAgora>({
    queryKey: ["painel", "agora", clock],
    queryFn: ({ signal }) => fetchPainelAgora(clock, signal),
    enabled: isPreviewMode() || isPageMockMode() ? true : enabled,
    staleTime: 30_000,
    refetchInterval: visible ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}

function servicePeriodStamp(
  filters: Pick<DashboardFiltersState, "period" | "startDate" | "endDate">,
  clock: "business" | "elapsed",
) {
  return `${filters.period}|${filters.startDate ?? ""}|${filters.endDate ?? ""}|${clock}`;
}

const REST_ARM_MS = 2_000;
const HEAVY_ARM_MS = 6_000;

function isHeavyServiceSection(section: string) {
  return SERVICE_HEAVY_SECTIONS.some((key) => section.split(",").includes(key));
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
    const keys = section
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    // Seção que já voltou sem réplica nesta sessão não é pedida de novo.
    const live = keys.filter((key) => !isSectionKnownUnavailable(key));
    for (const key of keys) {
      if (!live.includes(key)) Object.assign(acc, { [key]: unavailableBlock() });
    }
    if (live.length === 0) {
      onPartial({ ...acc });
      continue;
    }
    try {
      const response = await fetchPainelService({
        filters,
        clock,
        section: live.join(","),
        signal,
      });
      const { blocks, unavailable } = normalizeRequestedBlocks(live, response);
      if (unavailable.length) rememberUnavailableSections(unavailable);
      Object.assign(acc, pickDefined(response), blocks);
    } catch (e) {
      if (signal.aborted) throw e;
      const error = e instanceof Error ? e.message : "Falha ao carregar este bloco.";
      for (const key of live) {
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
  /**
   * Seções que os widgets visíveis leem (ver `serviceSectionsFor`). Sem isto
   * (cards da aba Negócios) vale o modo: `full` = tudo, `light` = só o volume.
   */
  sections?: readonly ServiceSection[],
) {
  const queryClient = useQueryClient();
  const reqFilters = useMemo(() => requestFilters(filters), [filters]);
  const grown = useGrowingList(sections);
  const waves = useMemo(
    () => splitServiceWaves(grown ?? ["volume", ...SERVICE_REST_SECTIONS, ...SERVICE_HEAVY_SECTIONS]),
    [grown],
  );
  const wantVolume = waves.volume.length > 0;
  const restSections = mode === "full" ? waves.rest : [];
  const heavySections = mode === "full" ? waves.heavy : [];
  const restCsv = restSections.join(",");
  const heavyCsv = heavySections.join(",");
  const volumeKey = ["painel", "service", reqFilters, clock, "volume"] as const;
  const restKey = ["painel", "service", reqFilters, clock, "rest", restCsv] as const;
  const heavyKey = ["painel", "service", reqFilters, clock, "heavy", heavyCsv] as const;
  const live = isPreviewMode() || isPageMockMode() ? true : enabled;
  const stamp = servicePeriodStamp(reqFilters, clock);

  useEffect(() => {
    if (!live) return;
    void queryClient.cancelQueries({
      predicate: (q) => {
        const key = q.queryKey;
        if (key[0] !== "painel" || key[1] !== "service") return false;
        const f = key[2] as PainelRequestFilters | undefined;
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
      fetchServiceWaves(filters, clock, ["volume"], signal, (acc) =>
        queryClient.setQueryData<PainelServiceResult>(volumeKey, acc),
      ),
    enabled: live && wantVolume,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // Sem o widget de volume na tela, as ondas seguintes não esperam por ele.
  const volumeOk =
    !wantVolume ||
    volume.data?.volume?.ok === true ||
    // Volume indisponível não pode travar as ondas seguintes.
    isBlockUnavailable(volume.data?.volume);
  const restArmed = useArmedAfter(live && restSections.length > 0 && volumeOk, REST_ARM_MS);
  const heavyArmed = useArmedAfter(live && heavySections.length > 0 && volumeOk, HEAVY_ARM_MS);

  // Cada onda é um único GET com as seções visíveis dela em CSV (o backend roda
  // os blocos em paralelo e responde `ok:false` por bloco em caso de erro).
  const rest = useQuery<PainelServiceResult>({
    queryKey: restKey,
    queryFn: ({ signal }) =>
      fetchServiceWaves(filters, clock, [restCsv], signal, (acc) =>
        queryClient.setQueryData<PainelServiceResult>(restKey, acc),
      ),
    enabled: restArmed && restSections.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const heavy = useQuery<PainelServiceResult>({
    queryKey: heavyKey,
    queryFn: ({ signal }) =>
      fetchServiceWaves(filters, clock, [heavyCsv], signal, (acc) =>
        queryClient.setQueryData<PainelServiceResult>(heavyKey, acc),
      ),
    enabled: heavyArmed && heavySections.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const unavailableKeys = useUnavailableSections();
  const data = useMemo(() => {
    if (!volume.data && !rest.data && !heavy.data) return undefined;
    const merged: PainelServiceResult = {
      ...emptyServiceResult(),
      ...pickDefined(volume.data ?? emptyServiceResult()),
      ...pickDefined(rest.data ?? emptyServiceResult()),
      ...pickDefined(heavy.data ?? emptyServiceResult()),
    };
    // Seção já conhecida como indisponível, ainda sem resposta nesta chave
    // (ex.: trocou o período): aparece como indisponível, não como esqueleto.
    for (const key of unavailableKeys) {
      const block = merged[key as keyof PainelServiceResult];
      if (block && isBlockPending(block)) {
        Object.assign(merged, { [key]: unavailableBlock() });
      }
    }
    return merged;
  }, [volume.data, rest.data, heavy.data, unavailableKeys]);

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
    /** Volume pedido e já respondido com sucesso (âncora para escalonar outras buscas). */
    volumeReady: volumeOk,
    isFetching: volume.isFetching || rest.isFetching || heavy.isFetching,
    refetch: async () => {
      const result = await volume.refetch();
      if (restSections.length) await rest.refetch();
      if (heavySections.length) await heavy.refetch();
      return result;
    },
    retrySection,
  };
}

/**
 * Equipe da aba Atendimentos (departamento × hora, rankings e transferências).
 * `sections` = blocos dos widgets visíveis; vira `section=` do GET. A chave só
 * leva período/escopo e, se o ranking estiver visível, o relógio: trocar funil
 * ou etapa não refaz o GET, e esconder um widget também não.
 */
export function usePainelTeam(
  filters: Pick<DashboardFiltersState, "period" | "startDate" | "endDate">,
  clock: "business" | "elapsed",
  scope: PainelTeamScope,
  enabled = true,
  sections: readonly PainelTeamSection[] = ["deptHour", "ranking", "transfers"],
) {
  const grown = useGrowingList(sections) ?? [];
  const period = `${filters.period}|${filters.startDate ?? ""}|${filters.endDate ?? ""}`;
  const deptKey = [...scope.departmentIds].sort().join(",");
  const userKey = [...scope.userIds].sort().join(",");
  const wantsRanking = grown.includes("ranking");
  const live = isPreviewMode() || isPageMockMode() ? true : enabled;
  return useQuery<PainelTeamResult>({
    queryKey: [
      "painel",
      "team",
      period,
      wantsRanking ? clock : "-",
      deptKey,
      userKey,
      grown.join(","),
    ],
    queryFn: ({ signal }) =>
      fetchPainelTeam({ filters, clock, scope, sections: grown, signal }),
    enabled: live && grown.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
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
  const visible = useDocumentVisible();
  return useQuery<DashboardMeData>({
    queryKey: ["dashboard-v2", "me"],
    queryFn: fetchDashboardMe,
    enabled: isPreviewMode() || isPageMockMode() ? true : enabled,
    staleTime: 0,
    refetchInterval: visible ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}

/**
 * Opções do painel de filtros (tags, usuários, origens, campos). Mesma
 * chave e validade (10 min) do Kanban/Flow/Lista — a rota é cara e só
 * serve dentro do painel: `enabled` deve ser "painel aberto" (ou o diálogo
 * que precisa dos campos personalizados), nunca a montagem da página.
 */
export function useDashboardFilterOptions(enabled = true) {
  const mock = isPageMockMode();
  return useQuery<FilterOptionsResponse>(
    mock
      ? {
          queryKey: ["dashboard-filter-options", "mock"],
          queryFn: () => mockFilterOptions(),
          enabled: true,
          staleTime: 5 * 60_000,
        }
      : { ...filterOptionsQuery, enabled: isPreviewMode() ? true : enabled },
  );
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
  const reqFilters = useMemo(() => requestFilters(filters), [filters]);
  return useQuery<PainelCustomFieldCard[]>({
    queryKey: ["painel", "custom-fields", reqFilters, fieldIds],
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

export function usePainelInsights(
  filters: DashboardFiltersState,
  cards: NegociosCustomCard[],
  enabled = true,
) {
  const inboundOwners = cards.some((c) => c.type === "inboundOwners");
  const stageIds = [
    ...new Set(
      cards
        .filter((c) => c.type === "inboundStage" && c.stageId)
        .map((c) => c.stageId as string),
    ),
  ];
  const taskGroups = [
    ...new Set(
      cards
        .filter((c) => c.type === "tasks")
        .map((c) => c.taskGroup ?? "user"),
    ),
  ];
  const active = inboundOwners || stageIds.length > 0 || taskGroups.length > 0;
  const reqFilters = useMemo(() => requestFilters(filters), [filters]);
  return useQuery<PainelInsights>({
    queryKey: ["painel", "insights", reqFilters, inboundOwners, stageIds, taskGroups],
    queryFn: ({ signal }) =>
      fetchPainelInsights(filters, { inboundOwners, stageIds, taskGroups }, signal),
    enabled: (isPreviewMode() || isPageMockMode() ? false : enabled) && active,
    staleTime: 30_000,
  });
}
