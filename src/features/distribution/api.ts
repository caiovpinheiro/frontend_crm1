/*
 * Camada de API da Distribuição Inteligente (frontend).
 *
 * Endpoints (backend, todos gateados por widget `smart_distribution`):
 *   GET   /api/distribution/responsibles            -> { responsibles }
 *   PATCH /api/distribution/responsibles/[userId]   -> { responsible }
 *   POST  /api/distribution/simulate                -> DistributionResult
 *   POST  /api/distribution/execute                 -> DistributionResult
 *   POST  /api/agents/[userId]/status               -> presença online/offline
 */

import { apiUrl } from "@/lib/api";
import { isPageMockMode } from "@/lib/page-mock-mode";

import type {
  AgentOnlineStatus,
  DistributionResult,
  PendingResponse,
  RedistributeInput,
  RedistributeResult,
  ResponsiblesResponse,
  RetryResult,
  UpdateResponsibleInput,
} from "./types";
import {
  MOCK_DISTRIBUTION_PENDING,
  MOCK_DISTRIBUTION_RESPONSIBLES,
} from "./mock";

async function getJson<T>(path: string, errLabel: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  const text = await res.text();
  if (!res.ok) {
    let message = errLabel;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed?.message === "string") message = parsed.message;
    } catch {
      /* corpo nao-JSON */
    }
    throw new Error(message);
  }
  if (!text.trim()) {
    throw new Error("Sessão expirada ou backend indisponível. Recarregue e faça login.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Sessão não reconhecida pelo backend. Recarregue e faça login.");
  }
}

async function sendJson<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
  errLabel: string,
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = errLabel;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed?.message === "string") message = parsed.message;
    } catch {
      /* corpo nao-JSON */
    }
    throw new Error(message);
  }
  if (!text.trim()) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as unknown as T;
  }
}

export function fetchResponsibles(): Promise<ResponsiblesResponse> {
  if (isPageMockMode()) {
    return Promise.resolve(MOCK_DISTRIBUTION_RESPONSIBLES);
  }
  return getJson<ResponsiblesResponse>(
    "/api/distribution/responsibles",
    "Erro ao carregar responsáveis.",
  );
}

export function updateResponsible(
  userId: string,
  input: UpdateResponsibleInput,
): Promise<{ responsible: unknown }> {
  return sendJson(
    `/api/distribution/responsibles/${userId}`,
    "PATCH",
    input,
    "Erro ao atualizar responsável.",
  );
}

export function redistributeResponsible(
  userId: string,
  input: RedistributeInput,
): Promise<{ result: RedistributeResult }> {
  return sendJson(
    `/api/distribution/responsibles/${userId}/redistribute`,
    "POST",
    input,
    "Erro ao redistribuir fila.",
  );
}

export function simulateDistribution(): Promise<DistributionResult> {
  return sendJson<DistributionResult>(
    "/api/distribution/simulate",
    "POST",
    {},
    "Erro ao simular distribuição.",
  );
}

export type ExecuteDistributionInput = {
  dealId?: string;
  contactId?: string;
  conversationId?: string;
  distributionType?: string | null;
  departmentId?: string;
  departmentIds?: string[];
  /** Redistribui mesmo com responsável atual (handoff manual). */
  reassign?: boolean;
};

export function executeDistribution(
  input: ExecuteDistributionInput,
): Promise<DistributionResult> {
  return sendJson<DistributionResult>(
    "/api/distribution/execute",
    "POST",
    input,
    "Erro ao executar distribuição.",
  );
}

export async function setAgentStatus(
  userId: string,
  status: AgentOnlineStatus,
): Promise<void> {
  const res = await fetch(apiUrl(`/api/agents/${userId}/status`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = "Erro ao alterar status.";
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed?.message === "string") message = parsed.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (text.trim()) {
    try {
      const body = JSON.parse(text) as { _migrationPending?: boolean };
      if (body._migrationPending) {
        throw new Error(
          "Não foi possível gravar o status. Tente novamente ou recarregue a página.",
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("Não foi possível")) throw e;
    }
  }
}

export const PENDING_PAGE_SIZE = 50;

export function fetchPending(opts?: {
  cursor?: string | null;
  limit?: number;
}): Promise<PendingResponse> {
  if (isPageMockMode()) {
    return Promise.resolve(MOCK_DISTRIBUTION_PENDING);
  }
  const sp = new URLSearchParams();
  sp.set("limit", String(opts?.limit ?? PENDING_PAGE_SIZE));
  if (opts?.cursor) sp.set("cursor", opts.cursor);
  return getJson<PendingResponse>(
    `/api/distribution/pending?${sp.toString()}`,
    "Erro ao carregar a fila de espera.",
  );
}

export function retryPending(): Promise<RetryResult> {
  return sendJson<RetryResult>(
    "/api/distribution/pending/retry",
    "POST",
    {},
    "Erro ao reprocessar a fila de espera.",
  );
}

export interface DistributionSettings {
  respectDepartment: boolean;
  autoOnInbound: boolean;
}

export function fetchDistributionSettings(): Promise<DistributionSettings> {
  return getJson<DistributionSettings>(
    "/api/distribution/settings",
    "Erro ao carregar configurações de distribuição.",
  );
}

/** Atualização parcial: envie só as chaves que quer alterar. */
export function updateDistributionSettings(
  input: Partial<DistributionSettings>,
): Promise<DistributionSettings> {
  return sendJson<DistributionSettings>(
    "/api/distribution/settings",
    "PUT",
    input,
    "Erro ao salvar configurações de distribuição.",
  );
}

export interface DistributionLog {
  id: string;
  createdAt: string;
  success: boolean;
  reason: string;
  triggerSource: string;
  selectedUserId: string | null;
  selectedUserName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  conversationId: string | null;
  conversationNumber?: number | null;
  departmentId: string | null;
  departmentName: string | null;
}

export interface DistributionLogsPage {
  items: DistributionLog[];
  nextCursor: string | null;
}

export interface DepartmentDistributionStat {
  departmentId: string | null;
  departmentName: string;
  distributed: number;
  distributedByAi: number;
  pending: number;
}

export interface DepartmentDistributionStatsResponse {
  departments: DepartmentDistributionStat[];
}

export function fetchDistributionLogs(
  cursor?: string | null,
  limit = 40,
): Promise<DistributionLogsPage> {
  const sp = new URLSearchParams();
  if (cursor) sp.set("cursor", cursor);
  sp.set("limit", String(limit));
  return getJson<DistributionLogsPage>(
    `/api/distribution/logs?${sp.toString()}`,
    "Erro ao carregar o histórico de distribuições.",
  );
}

export function fetchDistributionDepartmentStats(): Promise<DepartmentDistributionStatsResponse> {
  return getJson<DepartmentDistributionStatsResponse>(
    "/api/distribution/department-stats",
    "Erro ao carregar estatísticas por departamento.",
  );
}
