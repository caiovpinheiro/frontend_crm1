/*
 * Cliente do Painel (GET /api/painel/deals e /api/painel/service).
 */

import { apiFetch, parseApiResponse } from "@/lib/api";
import { isPageMockMode } from "@/lib/page-mock-mode";

import type { DashboardFiltersState } from "./api";
import {
  mockPainelAgora,
  mockPainelDeals,
  mockPainelService,
} from "./mock-painel";

export type PainelDelta = { value: number; hidden: boolean };

export type PainelBlock<T> = { ok: true; data: T } | { ok: false; error: string };

export type PainelKpi = {
  key: string;
  value: number | null;
  prevRecords: number;
  delta: PainelDelta;
  asOf?: "hoje";
};

export type PainelDealsKpis = {
  receitaGanha: PainelKpi;
  negociosGanhos: PainelKpi;
  ticketMedio: PainelKpi;
  taxaConversao: PainelKpi;
  valorEmAberto: PainelKpi;
  hasClosedInPeriod: boolean;
};

export type PainelFunnelUserRow = {
  id: string;
  name: string;
  count: number;
  value: number;
  todayDelta: number;
};

export type PainelFunnelStage = {
  id: string;
  name: string;
  color: string;
  count: number;
  value: number;
  passThrough: number | null;
  entered: number;
  lost: number;
  todayDelta: number;
  byUser: PainelFunnelUserRow[];
};

export type PainelFunnel = {
  definition: "cohort";
  tooltip: string;
  stages: PainelFunnelStage[];
  empty: boolean;
  novos: { count: number; value: number };
};

export type PainelCustomFieldCard = {
  fieldId: string;
  label: string;
  type: string;
  count: number;
  sum: number | null;
  byUser: { id: string; name: string; count: number; sum: number | null }[];
};

export type PainelEventCard = {
  eventType: string;
  title: string;
  value: number;
  unit: "count" | "money" | "duration";
  byUser: { id: string; name: string; value: number }[];
  href?: string;
};

export type PainelEvolution = {
  available: boolean;
  reason?: "building" | "beyond_retention";
  retentionDays: number;
  retainedFrom: string | null;
  incompleteLast: boolean;
  useBars: boolean;
  stages: { id: string; name: string; color: string }[];
  points: { date: string; incomplete: boolean; byStage: Record<string, number> }[];
};

export type PainelAgentRow = {
  id: string;
  name: string;
  wonValue: number;
  wonCount: number;
  conversion: number | null;
  ticket: number | null;
  openToday: number;
  zeroActivity: boolean;
};

export type PainelSourceRow = {
  key: string;
  label: string;
  wonCount: number;
  wonValue: number;
};

export type PainelDealException = {
  key: "no_task" | "stalled" | "overdue" | "empty_value";
  count: number;
  href: string;
  stalledDays?: number;
};

export type PainelDealsResult = {
  kpis: PainelBlock<PainelDealsKpis>;
  funnel: PainelBlock<PainelFunnel>;
  evolution: PainelBlock<PainelEvolution>;
  agents: PainelBlock<PainelAgentRow[]>;
  sources: PainelBlock<PainelSourceRow[]>;
  exceptions: PainelBlock<PainelDealException[]>;
  customFields?: PainelBlock<PainelCustomFieldCard[]>;
};

export type PainelTimeStat = {
  medianMs: number | null;
  meanMs: number | null;
  sample: number;
};

export type PainelAgora = {
  asOf: string;
  awaitingReply: number;
  inService: number;
  longestWait: {
    ms: number;
    contactName: string | null;
    agentName: string | null;
    conversationId: string | null;
    overSla: boolean;
    slaMinutes: number;
  };
  agents: { online: number; total: number };
};

export type PainelVolume = {
  started: { value: number; delta: PainelDelta };
  finished: { value: number; delta: PainelDelta };
  stillOpen: { value: number; delta: PainelDelta };
  openStarted: { value: number; delta: PainelDelta };
  openWaiting: { value: number; delta: PainelDelta };
  messagesIn: number;
  messagesOut: number;
  byDay: { date: string; started: number; finished: number; incomplete: boolean }[];
  empty: boolean;
};

export type PainelDayMs = {
  date: string;
  ms: number | null;
  incomplete: boolean;
};

export type PainelTempo = {
  clock: "business" | "elapsed";
  firstResponse: PainelTimeStat;
  subsequent: PainelTimeStat;
  untilClose: PainelTimeStat;
  timeToStart: PainelTimeStat;
  responseByDay: PainelDayMs[];
  startByDay: PainelDayMs[];
  empty: boolean;
};

export type PainelSeriesMeta = { key: string; label: string; color: string };

export type PainelHeatmap = {
  cells: { x: number; y: number; value: number }[];
  series: {
    key: string;
    label: string;
    color: string;
    cells: { x: number; y: number; value: number }[];
  }[];
  xLabels: string[];
  yLabels: string[];
  empty: boolean;
};

export type PainelAttendantRow = {
  id: string;
  name: string;
  attended: number;
  finished: number;
  firstResponseMedianMs: number | null;
  closeMedianMs: number | null;
  stillOpen: number;
  responseMeanMs: number | null;
  startMeanMs: number | null;
  serviceMeanMs: number | null;
};

export type PainelDeptTableRow = {
  key: string;
  label: string;
  started: number;
  finished: number;
  stillOpen: number;
  responseMeanMs: number | null;
  startMeanMs: number | null;
  serviceMeanMs: number | null;
};

export type PainelByDepartment = {
  series: PainelSeriesMeta[];
  points: { date: string; incomplete: boolean; values: Record<string, number> }[];
  summaries: { key: string; label: string; color: string; started: number }[];
  table: PainelDeptTableRow[];
  empty: boolean;
  useBars: boolean;
};

export type PainelConnectionBlock = {
  series: PainelSeriesMeta[];
  points: { date: string; incomplete: boolean; values: Record<string, number> }[];
  empty: boolean;
};

export type PainelConnections = {
  connections: PainelConnectionBlock;
  platforms: PainelConnectionBlock;
};

export type PainelChannelRow = {
  key: string;
  label: string;
  count: number;
  firstResponseMedianMs: number | null;
};

export type PainelServiceException = {
  key: "no_reply" | "open_24h" | "unassigned" | "send_failure";
  count: number;
  href: string;
};

export type PainelServiceResult = {
  agora: PainelBlock<PainelAgora>;
  volume: PainelBlock<PainelVolume>;
  tempo: PainelBlock<PainelTempo>;
  heatmap: PainelBlock<PainelHeatmap>;
  byDepartment: PainelBlock<PainelByDepartment>;
  connections: PainelBlock<PainelConnections>;
  attendants: PainelBlock<{ rows: PainelAttendantRow[]; attribution: string }>;
  channels: PainelBlock<{
    channels: PainelChannelRow[];
    motivos: PainelChannelRow[];
  }>;
  exceptions: PainelBlock<PainelServiceException[]>;
};

async function getJson<T>(
  path: string,
  errLabel: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<T> {
  const res = await apiFetch(
    path,
    { credentials: "include", cache: "no-store", signal },
    timeoutMs,
  );
  return parseApiResponse<T>(res, errLabel);
}

function asIdList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
}

function filterQuery(filters: DashboardFiltersState, fieldIds?: string[]): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("period", filters.period ?? "last_30");
  if (filters.period === "custom" && filters.startDate && filters.endDate) {
    sp.set("startDate", filters.startDate);
    sp.set("endDate", filters.endDate);
  }
  const storedPipelineIds = asIdList(filters.pipelineIds);
  const pipelineIds = storedPipelineIds.length
    ? storedPipelineIds
    : filters.pipelineId
      ? [filters.pipelineId]
      : [];
  if (pipelineIds.length) sp.set("pipelineIds", pipelineIds.join(","));
  const stageIds = asIdList(filters.stageIds);
  const tagIds = asIdList(filters.tagIds);
  const ownerIds = asIdList(filters.ownerIds);
  const sources = asIdList(filters.sources);
  if (stageIds.length) sp.set("stages", stageIds.join(","));
  if (tagIds.length) sp.set("tags", tagIds.join(","));
  if (ownerIds.length) sp.set("owners", ownerIds.join(","));
  if (sources.length) sp.set("sources", sources.join(","));
  if (fieldIds?.length) sp.set("fieldIds", fieldIds.join(","));
  return sp;
}

export async function fetchPainelDeals(
  filters: DashboardFiltersState,
  section?: string,
  fieldIds?: string[],
  signal?: AbortSignal,
): Promise<PainelDealsResult> {
  if (isPageMockMode()) return Promise.resolve(mockPainelDeals(filters, fieldIds));
  const sp = filterQuery(filters, fieldIds);
  if (section) sp.set("section", section);
  return getJson<PainelDealsResult>(
    `/api/painel/deals?${sp.toString()}`,
    "Erro ao carregar negócios",
    20_000,
    signal,
  );
}

const SERVICE_LIGHT_TIMEOUT_MS = 15_000;
const SERVICE_HEAVY_TIMEOUT_MS = 30_000;

export async function fetchPainelService(params: {
  filters: DashboardFiltersState;
  clock: "business" | "elapsed";
  section?: string;
  signal?: AbortSignal;
}): Promise<PainelServiceResult> {
  if (isPageMockMode()) {
    return Promise.resolve(mockPainelService(params.filters, params.clock));
  }
  const sp = filterQuery(params.filters);
  sp.set("clock", params.clock);
  if (params.section) sp.set("section", params.section);
  const light =
    params.section === "volume,heatmap,connections,exceptions" ||
    params.section === "agora";
  return getJson<PainelServiceResult>(
    `/api/painel/service?${sp.toString()}`,
    "Erro ao carregar atendimentos",
    light ? SERVICE_LIGHT_TIMEOUT_MS : SERVICE_HEAVY_TIMEOUT_MS,
    params.signal,
  );
}

export async function fetchPainelAgora(
  clock: "business" | "elapsed",
  signal?: AbortSignal,
): Promise<PainelAgora> {
  if (isPageMockMode()) return Promise.resolve(mockPainelAgora(clock));
  const sp = new URLSearchParams({ section: "agora", clock });
  const data = await getJson<PainelServiceResult>(
    `/api/painel/service?${sp.toString()}`,
    "Erro ao carregar Agora",
    12_000,
    signal,
  );
  if (!data.agora.ok) throw new Error(data.agora.error);
  return data.agora.data;
}
