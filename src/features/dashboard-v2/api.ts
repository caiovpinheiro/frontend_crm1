/*
 * API client do Dashboard: negócios (GET /api/dashboard), atendimento
 * (GET /api/analytics/service-overview) e fila do operador (GET /api/dashboard/me).
 */

import { apiUrl } from "@/lib/api";

// ── Período ────────────────────────────────────────────────────────

export interface DashboardPeriod {
  from: string; // ISO
  to: string; // ISO
}

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

export interface ServiceOverview {
  summary: {
    total: { value: string; delta: number };
    firstResponse: { value: string; delta: number };
    resolutionTime: { value: string; delta: number };
    resolutionRate: { value: string; delta: number };
  };
  volumeByDay: { day: string; recebidas: number; enviadas: number }[];
  responseTimeSeries: { hour: string; resposta: number; primeira: number }[];
  byConnection: DonutDatum[];
  byAttendant: DonutDatum[];
  byPlatform: {
    rows: Record<string, number | string>[];
    platforms: { key: string; label: string; color: string }[];
  };
  heatmap: {
    cells: { x: number; y: number; value: number }[];
    xLabels: string[];
    yLabels: string[];
  };
  attendantRanking: {
    id: string;
    name: string;
    attended: number;
    avgResponse: string;
    resolution: number;
  }[];
}

export interface PipelineOption {
  id: string;
  name: string;
  number?: number;
  slug?: string;
  isDefault?: boolean;
}

// ── Fetchers ───────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * Faz o GET e devolve o JSON. Trata o caso (comum neste backend) de
 * resposta 200 com corpo VAZIO quando a sessão não chega — converte num
 * erro legível em vez de devolver `{}` (que estouraria nos componentes).
 */
async function getJson<T>(path: string, errLabel: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  const text = await res.text();
  if (!res.ok) {
    let message = errLabel;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed?.message === "string") message = parsed.message;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(message);
  }
  if (!text.trim()) {
    throw new Error("Sessão expirada ou backend indisponível. Recarregue e faça login novamente.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // Resposta não-JSON (ex.: HTML da página de login após redirect do
    // middleware quando a sessão não é reconhecida pelo backend).
    throw new Error("Sessão não reconhecida pelo backend. Recarregue e faça login novamente.");
  }
}

export async function fetchServiceOverview(params: {
  period: DashboardPeriod;
}): Promise<ServiceOverview> {
  const qs = buildQuery({ from: params.period.from, to: params.period.to });
  return getJson<ServiceOverview>(`/api/analytics/service-overview${qs}`, "Erro ao carregar atendimento");
}

export async function fetchPipelines(): Promise<PipelineOption[]> {
  const res = await fetch(apiUrl("/api/pipelines"));
  const data = await res.json().catch(() => []);
  if (!res.ok) return [];
  const list = Array.isArray(data) ? data : data.pipelines ?? data.items ?? [];
  return list as PipelineOption[];
}

// ── Dashboard comercial (Fase 1) ───────────────────────────────────

/** Sentinela do filtro de origem para "Sem origem" (espelha o backend). */
export const SOURCE_NONE = "__none__";

export type PeriodKey =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "custom";

export interface DashboardFiltersState {
  period: PeriodKey;
  /** yyyy-mm-dd, usado quando period = "custom". */
  startDate?: string;
  endDate?: string;
  /** Primeiro funil selecionado (legado / Atendimentos). */
  pipelineId?: string;
  /** Funis selecionados. Vazio = todos (soma). */
  pipelineIds: string[];
  /** Filtro de usuário do painel Negócios (`?user=`). */
  userIds: string[];
  stageIds: string[];
  tagIds: string[];
  ownerIds: string[];
  /** Pode incluir `SOURCE_NONE` para "Sem origem". */
  sources: string[];
}

export interface DashboardSummary {
  totalValue: number;
  openDeals: number;
  winRate: number;
  avgTicket: number;
  newContacts: number;
  wonCount: number;
  lostCount: number;
  wonValue: number;
  lostValue: number;
  leadsWithoutOwner: number;
  avgTimeToWinDays: number;
  deltas: {
    winRate: number;
    avgTicket: number;
    wonCount: number;
    wonValue: number;
  };
}

/** Coorte de negócios criados no período e onde estão agora. */
export interface DashboardNewDeals {
  count: number;
  value: number;
  open: number;
  won: number;
  lost: number;
  wonValue: number;
  lostValue: number;
}

export interface DashboardFunnelStage {
  id: string;
  name: string;
  color: string;
  count: number;
  value: number;
  won: number;
  lost: number;
  conversion: number;
  entered: number;
  exited: number;
}

export interface DashboardTagRow {
  id: string;
  name: string;
  color: string;
  count: number;
  won: number;
  lost: number;
  conversion: number;
  wonValue: number;
}

export interface DashboardLossReason {
  reason: string;
  count: number;
  value: number;
}

export interface DashboardDailyPoint {
  date: string;
  novos: number;
  ganhos: number;
  perdidos: number;
}

export interface DashboardStalledStage {
  id: string;
  name: string;
  color: string;
  count: number;
  value: number;
  rottingDays: number;
}

export interface DashboardSourceRow {
  key: string;
  label: string;
  count: number;
  won: number;
  lost: number;
  conversion: number;
  wonValue: number;
}

export interface DashboardOwnerRow {
  id: string;
  name: string;
  leads: number;
  open: number;
  won: number;
  lost: number;
  conversion: number;
  wonValue: number;
}

export interface DashboardData {
  pipelineId: string;
  summary: DashboardSummary;
  newDeals: DashboardNewDeals;
  funnel: DashboardFunnelStage[];
  bySource: DashboardSourceRow[];
  byOwner: DashboardOwnerRow[];
  byTag: DashboardTagRow[];
  lossReasons: DashboardLossReason[];
  dailyEvolution: DashboardDailyPoint[];
  stalled: DashboardStalledStage[];
}

export async function fetchDashboard(
  filters: DashboardFiltersState,
): Promise<DashboardData> {
  const sp = new URLSearchParams();
  sp.set("period", filters.period);
  if (filters.period === "custom" && filters.startDate && filters.endDate) {
    sp.set("startDate", filters.startDate);
    sp.set("endDate", filters.endDate);
  }
  if (filters.pipelineIds.length) {
    sp.set("pipelineIds", filters.pipelineIds.join(","));
    if (filters.pipelineIds[0]) sp.set("pipelineId", filters.pipelineIds[0]);
  } else if (filters.pipelineId) {
    sp.set("pipelineId", filters.pipelineId);
  }
  if (filters.stageIds.length) sp.set("stages", filters.stageIds.join(","));
  if (filters.tagIds.length) sp.set("tags", filters.tagIds.join(","));
  if (filters.ownerIds.length) sp.set("owners", filters.ownerIds.join(","));
  if (filters.sources.length) sp.set("sources", filters.sources.join(","));
  return getJson<DashboardData>(
    `/api/dashboard?${sp.toString()}`,
    "Erro ao carregar o dashboard",
  );
}

export interface DashboardMeItem {
  id: string;
  number: number | null;
  title: string;
  subtitle: string | null;
  href: string;
  meta: string | null;
}

export interface DashboardMeData {
  conversations: { total: number; items: DashboardMeItem[] };
  activities: { overdue: number; today: number; items: DashboardMeItem[] };
  stalled: { total: number; items: DashboardMeItem[] };
}

export async function fetchDashboardMe(): Promise<DashboardMeData> {
  return getJson<DashboardMeData>("/api/dashboard/me", "Erro ao carregar sua fila");
}
