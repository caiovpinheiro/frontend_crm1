/*
 * Camada de API das Campanhas v2 (frontend). Bate nas rotas já existentes:
 *   GET   /api/campaigns?status&type&search&page&perPage
 *   GET   /api/campaigns/[id]
 *   GET   /api/campaigns/[id]/stats
 *   GET   /api/campaigns/[id]/recipients?status&page&perPage
 *   POST  /api/campaigns                          -> cria rascunho
 *   POST  /api/campaigns/[id]/{launch|pause|resume|cancel}
 *   POST  /api/campaigns/preview                  -> contagem + amostra
 *   GET   /api/channels | /api/segments | /api/meta/whatsapp/message-templates
 *   GET   /api/kanban/filter-options              -> tags/pipelines/responsáveis
 */

import { apiUrl } from "@/lib/api";
import { isPageMockMode } from "@/lib/page-mock-mode";

import {
  mockCampaignDetail,
  mockCampaignRecipients,
  mockCampaignStats,
  mockCampaignsPage,
  mockRunCampaignAction,
  MOCK_AUDIENCE_OPTIONS,
  MOCK_AUDIENCE_PREVIEW,
  MOCK_CHANNELS,
  MOCK_SEGMENTS,
  MOCK_TEMPLATES,
} from "./mock-campaigns";

import type {
  AutomationRow,
  CampaignAction,
  CampaignDetail,
  CampaignFilters,
  CampaignStats,
  CampaignsListResponse,
  ChannelRow,
  CreateCampaignBody,
  PreviewResponse,
  RecipientsResponse,
  SegmentRow,
  TemplateRow,
} from "./types";

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
      /* corpo não-JSON */
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

// ── Campanhas ──────────────────────────────────────────

export interface FetchCampaignsParams {
  status?: string;
  type?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

export function fetchCampaigns(
  params: FetchCampaignsParams = {},
): Promise<CampaignsListResponse> {
  if (isPageMockMode()) {
    return Promise.resolve(mockCampaignsPage(params));
  }
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.type) sp.set("type", params.type);
  if (params.search) sp.set("search", params.search);
  if (params.page) sp.set("page", String(params.page));
  if (params.perPage) sp.set("perPage", String(params.perPage));
  const qs = sp.toString();
  return getJson<CampaignsListResponse>(
    `/api/campaigns${qs ? `?${qs}` : ""}`,
    "Erro ao carregar campanhas.",
  );
}

export function fetchCampaign(id: string): Promise<CampaignDetail> {
  const mock = mockCampaignDetail(id);
  if (mock && (isPageMockMode() || id.startsWith("camp-"))) {
    return Promise.resolve(mock);
  }
  return getJson<{ campaign: CampaignDetail }>(
    `/api/campaigns/${id}`,
    "Campanha não encontrada.",
  ).then((d) => d.campaign);
}

export function fetchCampaignStats(id: string): Promise<CampaignStats> {
  const mock = mockCampaignStats(id);
  if (mock && (isPageMockMode() || id.startsWith("camp-"))) {
    return Promise.resolve(mock);
  }
  return getJson<CampaignStats>(
    `/api/campaigns/${id}/stats`,
    "Erro ao carregar estatísticas.",
  );
}

export interface FetchRecipientsParams {
  status?: string;
  page?: number;
  perPage?: number;
}

export function fetchRecipients(
  id: string,
  params: FetchRecipientsParams = {},
): Promise<RecipientsResponse> {
  if (isPageMockMode() || id.startsWith("camp-")) {
    const page = mockCampaignRecipients(id, params);
    if (page) return Promise.resolve(page);
  }
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.page) sp.set("page", String(params.page));
  sp.set("perPage", String(params.perPage ?? 20));
  return getJson<RecipientsResponse>(
    `/api/campaigns/${id}/recipients?${sp.toString()}`,
    "Erro ao carregar destinatários.",
  );
}

export function createCampaign(
  body: CreateCampaignBody,
): Promise<{ campaign: { id: string; number?: number } }> {
  return sendJson<{ campaign: { id: string; number?: number } }>(
    "/api/campaigns",
    "POST",
    body,
    "Erro ao criar campanha.",
  );
}

export function runCampaignAction(
  id: string,
  action: CampaignAction,
): Promise<{ message?: string; status?: string }> {
  if (isPageMockMode() || id.startsWith("camp-")) {
    try {
      return Promise.resolve(mockRunCampaignAction(id, action));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return sendJson(
    `/api/campaigns/${id}/${action}`,
    "POST",
    {},
    "Erro ao executar ação na campanha.",
  );
}

export function deleteCampaign(id: string): Promise<{ ok: boolean }> {
  return sendJson<{ ok: boolean }>(
    `/api/campaigns/${id}`,
    "DELETE",
    undefined,
    "Erro ao excluir campanha.",
  );
}

export function previewAudience(
  filters: CampaignFilters,
): Promise<PreviewResponse> {
  if (isPageMockMode()) {
    return Promise.resolve(MOCK_AUDIENCE_PREVIEW);
  }
  return sendJson<PreviewResponse>(
    "/api/campaigns/preview",
    "POST",
    { filters },
    "Erro ao pré-visualizar audiência.",
  );
}

// ── Recursos auxiliares (canais, segmentos, templates, opções) ──

export function fetchChannels(): Promise<ChannelRow[]> {
  if (isPageMockMode()) {
    return Promise.resolve(MOCK_CHANNELS);
  }
  return getJson<{ channels?: ChannelRow[] }>(
    "/api/channels",
    "Erro ao carregar canais.",
  ).then((d) => d.channels ?? []);
}

export function fetchSegments(): Promise<SegmentRow[]> {
  if (isPageMockMode()) {
    return Promise.resolve(MOCK_SEGMENTS);
  }
  return getJson<{ segments?: SegmentRow[] }>(
    "/api/segments",
    "Erro ao carregar segmentos.",
  ).then((d) => d.segments ?? []);
}

export function fetchAutomations(): Promise<AutomationRow[]> {
  if (isPageMockMode()) {
    return Promise.resolve([]);
  }
  return getJson<{ items?: AutomationRow[]; automations?: AutomationRow[] }>(
    "/api/automations?perPage=100",
    "Erro ao carregar automações.",
  ).then((d) => d.items ?? d.automations ?? []);
}

export async function fetchTemplates(channelId?: string | null): Promise<TemplateRow[]> {
  if (isPageMockMode()) {
    return Promise.resolve(MOCK_TEMPLATES);
  }
  // Templates aprovados vem direto da WABA via Graph (message_templates).
  // A resposta da Meta tem o formato { data: [...], paging: { cursors: { after } } }.
  // Percorremos TODAS as páginas de cursor — sem isso a lista ficava presa na
  // primeira página (até 100) e campanhas não viam o total real da conta.
  // Com channelId, lista a WABA do canal da campanha (não misturar números).
  const all: TemplateRow[] = [];
  let after: string | undefined;
  for (let guard = 0; guard < 200; guard++) {
    const q = new URLSearchParams();
    q.set("limit", "500");
    if (after) q.set("after", after);
    if (channelId?.trim()) q.set("channelId", channelId.trim());
    const page = await getJson<{
      templates?: TemplateRow[];
      data?: TemplateRow[];
      paging?: { cursors?: { after?: string } };
    }>(`/api/meta/whatsapp/message-templates?${q.toString()}`, "Erro ao carregar templates.");
    all.push(...(page.templates ?? page.data ?? []));
    const next = page.paging?.cursors?.after;
    if (!next || next === after) break;
    after = next;
  }
  return all;
}

export interface AudienceFilterOptions {
  tags: { id: string; name: string; color: string }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  users: { id: string; name: string }[];
}

export function fetchAudienceOptions(): Promise<AudienceFilterOptions> {
  if (isPageMockMode()) {
    return Promise.resolve(MOCK_AUDIENCE_OPTIONS);
  }
  return getJson<{
    tags?: AudienceFilterOptions["tags"];
    pipelines?: AudienceFilterOptions["pipelines"];
    users?: AudienceFilterOptions["users"];
  }>("/api/kanban/filter-options", "Erro ao carregar opções de filtro.").then(
    (d) => ({
      tags: d.tags ?? [],
      pipelines: d.pipelines ?? [],
      users: d.users ?? [],
    }),
  );
}
