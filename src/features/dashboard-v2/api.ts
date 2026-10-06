/*
 * API client do Dashboard: filtros do painel e fila do operador (GET /api/dashboard/me).
 */

import { apiUrl } from "@/lib/api";

// ── Fetchers ───────────────────────────────────────────────────────

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

export interface DashboardMeItem {
  id: string;
  number: number | null;
  title: string;
  subtitle: string | null;
  href: string;
  meta: string | null;
}

export interface DashboardMeInboundDeal {
  id: string;
  number: number;
  title: string;
  stageId: string;
  stageName: string;
  pipelineName: string;
  count: number;
  waitingSince: string;
}

export interface DashboardMeData {
  conversations: { total: number; items: DashboardMeItem[] };
  activities: { overdue: number; today: number; items: DashboardMeItem[] };
  stalled: { total: number; items: DashboardMeItem[] };
  inboundDeals?: DashboardMeInboundDeal[];
}

export async function fetchDashboardMe(): Promise<DashboardMeData> {
  return getJson<DashboardMeData>("/api/dashboard/me", "Erro ao carregar sua fila");
}
