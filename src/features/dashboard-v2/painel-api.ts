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
  mockPainelTeam,
} from "./mock-painel";

export type PainelDelta = { value: number; hidden: boolean };

export type PainelBlock<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      /**
       * Aditivo do backend: `no_replica` = bloco pulado por falta de réplica de
       * leitura (seção pedida, mas indisponível neste ambiente).
       */
      reason?: "no_replica" | (string & {});
    };

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
  /**
   * Etapas "Perdido" do funil. `count`/`value`: negócios hoje nessas etapas,
   * qualquer status (inclui os encerrados que o Kanban esconde por padrão).
   * `sentInPeriod`: negócios distintos movidos para Perdido no período.
   * Opcional: backends antigos não devolvem.
   */
  lostStage?: { count: number; value: number; sentInPeriod: number };
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

/**
 * Filtros como o backend os recebe (o que `filterQuery` envia). É a chave das
 * queries do painel: o filtro de usuário do Negócios (`userIds`) é aplicado
 * no cliente e não vai na URL, então trocá-lo não pode refazer o GET.
 */
export type PainelRequestFilters = Pick<
  DashboardFiltersState,
  "period" | "startDate" | "endDate" | "pipelineIds" | "stageIds" | "tagIds" | "ownerIds" | "sources"
>;

export function requestFilters(filters: DashboardFiltersState): PainelRequestFilters {
  const stored = asIdList(filters.pipelineIds);
  const period = filters.period ?? "today";
  const custom = period === "custom" && filters.startDate && filters.endDate;
  return {
    period,
    ...(custom ? { startDate: filters.startDate, endDate: filters.endDate } : {}),
    pipelineIds: stored.length ? stored : filters.pipelineId ? [filters.pipelineId] : [],
    stageIds: asIdList(filters.stageIds),
    tagIds: asIdList(filters.tagIds),
    ownerIds: asIdList(filters.ownerIds),
    sources: asIdList(filters.sources),
  };
}

function filterQuery(filters: DashboardFiltersState, fieldIds?: string[]): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("period", filters.period ?? "today");
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
  const heavyKeys = new Set(["tempo", "byDepartment", "attendants", "channels"]);
  const light = !params.section
    ?.split(",")
    .some((key) => heavyKeys.has(key.trim()));
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

export type InsightUserRow = { id: string; name: string; value: number };

export type PainelInsights = {
  inboundOwners: { total: number; byUser: InsightUserRow[] } | null;
  stages: { stageId: string; total: number; byUser: InsightUserRow[] }[];
  tasks: {
    group: "user" | "department";
    total: number;
    groups: {
      id: string;
      name: string;
      count: number;
      items: { id: string; title: string; dueAt: string | null }[];
    }[];
  }[];
};

export async function fetchPainelInsights(
  filters: DashboardFiltersState,
  opts: { inboundOwners: boolean; stageIds: string[]; taskGroups: ("user" | "department")[] },
  signal?: AbortSignal,
): Promise<PainelInsights> {
  const sp = filterQuery(filters);
  if (opts.inboundOwners) sp.set("inboundOwners", "1");
  if (opts.stageIds.length) sp.set("stageIds", opts.stageIds.join(","));
  if (opts.taskGroups.length) sp.set("taskGroups", opts.taskGroups.join(","));
  return getJson<PainelInsights>(
    `/api/painel/insights?${sp.toString()}`,
    "Erro ao carregar os cards",
    20_000,
    signal,
  );
}

// ---------------------------------------------------------------------------
// Equipe (GET /api/painel/team): respeita período + departamentos + atendentes.
// Só ADMIN/MANAGER (403 para os demais).

export type PainelDeptHourRow = {
  key: string;
  label: string;
  total: number;
  /** 24 posições (0h–23h). */
  hours: number[];
};

export type PainelDeptHour = {
  rows: PainelDeptHourRow[];
  /** Soma por hora de todos os departamentos. */
  totals: number[];
  max: number;
  total: number;
  empty: boolean;
};

export type PainelTeamRankRow = {
  id: string;
  name: string;
  /** Conversas iniciadas no período que passaram pelo atendente. */
  attended: number;
  /** Conversas encerradas no período com o atendente responsável. */
  finished: number;
  serviceMeanMs: number | null;
  serviceMedianMs: number | null;
  serviceSample: number;
};

export type PainelTransferNode = { id: string; name: string };

export type PainelTransferFlow = {
  from: PainelTransferNode;
  to: PainelTransferNode;
  count: number;
  conversations: number;
};

export type PainelTransferSet = {
  flows: PainelTransferFlow[];
  total: number;
  conversations: number;
  empty: boolean;
};

export type PainelTransfers = {
  people: PainelTransferSet;
  departments: PainelTransferSet;
};

export type PainelTeamRanking = { rows: PainelTeamRankRow[]; capped: boolean };

export type PainelTeamResult = {
  deptHour: PainelBlock<PainelDeptHour>;
  ranking: PainelBlock<PainelTeamRanking>;
  transfers: PainelBlock<PainelTransfers>;
  /** O período pedido passava de 90 dias e foi cortado pelo início. */
  rangeClamped?: boolean;
  /** Início efetivo (ISO) do período usado nas consultas. */
  effectiveFrom?: string;
};

export type PainelTeamSection = "deptHour" | "ranking" | "transfers";

export type PainelTeamScope = {
  departmentIds: string[];
  userIds: string[];
};

export async function fetchPainelTeam(params: {
  filters: Pick<DashboardFiltersState, "period" | "startDate" | "endDate">;
  clock: "business" | "elapsed";
  scope: PainelTeamScope;
  /** Só estes blocos (CSV em `section`); vazio = todos. */
  sections?: readonly PainelTeamSection[];
  signal?: AbortSignal;
}): Promise<PainelTeamResult> {
  if (isPageMockMode()) {
    return Promise.resolve(
      mockPainelTeam(params.filters, params.clock, params.scope, params.sections),
    );
  }
  const sp = new URLSearchParams();
  sp.set("period", params.filters.period ?? "today");
  if (params.filters.period === "custom" && params.filters.startDate && params.filters.endDate) {
    sp.set("startDate", params.filters.startDate);
    sp.set("endDate", params.filters.endDate);
  }
  sp.set("clock", params.clock);
  if (params.scope.departmentIds.length) {
    sp.set("departmentIds", params.scope.departmentIds.join(","));
  }
  if (params.scope.userIds.length) sp.set("userIds", params.scope.userIds.join(","));
  if (params.sections?.length) sp.set("section", params.sections.join(","));
  return getJson<PainelTeamResult>(
    `/api/painel/team?${sp.toString()}`,
    "Erro ao carregar a equipe",
    SERVICE_HEAVY_TIMEOUT_MS,
    params.signal,
  );
}
