/*
 * Camada de API da Distribuição por Leads (modo "leads").
 * Mesmo padrão de `api.ts` do modo smart. Sem fila de espera — o modo leads
 * não tem pending.
 */

import { apiUrl } from "@/lib/api";
import { isPageMockMode } from "@/lib/page-mock-mode";

import {
  MOCK_LEADS_HISTORY,
  MOCK_LEADS_PARTICIPANTS,
  MOCK_LEADS_SETTINGS,
  MOCK_LEADS_STATS,
} from "./leads-mock";
import type {
  LeadsHistoryFilters,
  LeadsHistoryResponse,
  LeadsParticipantsResponse,
  LeadsSettingsResponse,
  LeadsStatsResponse,
  UpdateLeadsParticipantInput,
} from "./leads-types";

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

export function fetchLeadsSettings(): Promise<LeadsSettingsResponse> {
  if (isPageMockMode()) return Promise.resolve({ ...MOCK_LEADS_SETTINGS });
  return getJson<LeadsSettingsResponse>(
    "/api/distribution/leads/settings",
    "Erro ao carregar a configuração.",
  );
}

export function updateLeadsSettings(input: {
  enabled: boolean;
}): Promise<LeadsSettingsResponse> {
  if (isPageMockMode()) {
    Object.assign(MOCK_LEADS_SETTINGS, input);
    return Promise.resolve({ ...MOCK_LEADS_SETTINGS });
  }
  return sendJson<LeadsSettingsResponse>(
    "/api/distribution/leads/settings",
    "PUT",
    input,
    "Erro ao salvar a configuração.",
  );
}

export function fetchLeadsParticipants(): Promise<LeadsParticipantsResponse> {
  if (isPageMockMode()) return Promise.resolve(MOCK_LEADS_PARTICIPANTS);
  return getJson<LeadsParticipantsResponse>(
    "/api/distribution/leads/participants",
    "Erro ao carregar participantes.",
  );
}

export function updateLeadsParticipant(
  userId: string,
  input: UpdateLeadsParticipantInput,
): Promise<{ participant: unknown }> {
  // Modo mock: grava em memória (sem backend) — os botões de peso/status da
  // página respondem em demo/dev local.
  if (isPageMockMode()) {
    const p = MOCK_LEADS_PARTICIPANTS.participants.find(
      (x) => x.userId === userId,
    );
    if (p) {
      if (input.status !== undefined) p.status = input.status;
      if (input.weight !== undefined) p.weight = input.weight;
      p.slots = p.slots.map((s) => ({
        ...s,
        active: p.status === "ACTIVE" && s.slotIndex < p.weight,
      }));
      p.updatedAt = new Date().toISOString();
    }
    return Promise.resolve({ participant: p });
  }
  return sendJson(
    `/api/distribution/leads/participants/${userId}`,
    "PUT",
    input,
    "Erro ao salvar participante.",
  );
}

function historySearchParams(
  filters: LeadsHistoryFilters,
  cursor?: string | null,
  limit?: number,
): string {
  const sp = new URLSearchParams();
  if (filters.from) sp.set("from", filters.from);
  if (filters.to) sp.set("to", filters.to);
  if (filters.userId) sp.set("userId", filters.userId);
  if (cursor) sp.set("cursor", cursor);
  sp.set("limit", String(limit ?? 50));
  return sp.toString();
}

export function fetchLeadsStats(
  filters: LeadsHistoryFilters,
): Promise<LeadsStatsResponse> {
  if (isPageMockMode()) return Promise.resolve(MOCK_LEADS_STATS);
  const qs = historySearchParams(filters, null);
  return getJson<LeadsStatsResponse>(
    `/api/distribution/leads/stats${qs ? `?${qs}` : ""}`,
    "Erro ao carregar indicadores.",
  );
}

export function fetchLeadsHistory(
  filters: LeadsHistoryFilters,
  cursor?: string | null,
  limit?: number,
): Promise<LeadsHistoryResponse> {
  if (isPageMockMode()) return Promise.resolve(MOCK_LEADS_HISTORY);
  const qs = historySearchParams(filters, cursor, limit);
  return getJson<LeadsHistoryResponse>(
    `/api/distribution/leads/history?${qs}`,
    "Erro ao carregar o histórico.",
  );
}
