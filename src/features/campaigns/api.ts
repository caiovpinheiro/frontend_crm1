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

import type {
  AutomationRow,
  CampaignAction,
  CampaignDetail,
  CampaignFilters,
  CampaignListItem,
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

/** Todas as páginas — KPIs e contagens de status (backend cap = 100/página). */
export async function fetchAllCampaigns(
  params: Omit<FetchCampaignsParams, "page" | "perPage"> = {},
): Promise<CampaignListItem[]> {
  const first = await fetchCampaigns({ ...params, page: 1, perPage: 100 });
  const totalPages = Math.max(
    1,
    first.totalPages || Math.ceil(first.total / first.perPage) || 1,
  );
  if (totalPages <= 1) return first.items;
  const rest = await Promise.all(
    Array.from({ length: Math.min(totalPages - 1, 50) }, (_, i) =>
      fetchCampaigns({ ...params, page: i + 2, perPage: 100 }),
    ),
  );
  return first.items.concat(...rest.map((p) => p.items));
}

export function fetchCampaign(id: string): Promise<CampaignDetail> {
  return getJson<{ campaign: CampaignDetail }>(
    `/api/campaigns/${id}`,
    "Campanha não encontrada.",
  ).then((d) => d.campaign);
}

export function fetchCampaignStats(id: string): Promise<CampaignStats> {
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
  return sendJson<PreviewResponse>(
    "/api/campaigns/preview",
    "POST",
    { filters },
    "Erro ao pré-visualizar audiência.",
  );
}

// ── Recursos auxiliares (canais, segmentos, templates, opções) ──

export function fetchChannels(): Promise<ChannelRow[]> {
  return getJson<{ channels?: ChannelRow[] }>(
    "/api/channels",
    "Erro ao carregar canais.",
  ).then((d) => d.channels ?? []);
}

export function fetchSegments(): Promise<SegmentRow[]> {
  return getJson<{ segments?: SegmentRow[] }>(
    "/api/segments",
    "Erro ao carregar segmentos.",
  ).then((d) => d.segments ?? []);
}

function sortAutomationsNewestFirst<T extends { createdAt?: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

export function fetchAutomations(): Promise<AutomationRow[]> {
  return getJson<{ items?: AutomationRow[]; automations?: AutomationRow[] }>(
    "/api/automations?perPage=100",
    "Erro ao carregar automações.",
  ).then((d) => sortAutomationsNewestFirst(d.items ?? d.automations ?? []));
}

/**
 * Templates APROVADOS da WABA do canal — mesmo endpoint das automações.
 * Inclui `bodyPreview`, `headerFormat` e `operatorVariables` para o
 * mapeamento de variáveis no disparador (só aparece quando há header
 * IMAGE/VIDEO/DOCUMENT ou placeholders no corpo).
 */
export async function fetchTemplates(channelId?: string | null): Promise<TemplateRow[]> {
  const qs = channelId?.trim()
    ? `?channelId=${encodeURIComponent(channelId.trim())}`
    : "";
  const rows = await getJson<
    Array<{
      metaTemplateId?: string;
      metaTemplateName?: string;
      label?: string;
      language?: string;
      category?: string | null;
      bodyPreview?: string | null;
      headerPreview?: string | null;
      headerFormat?: string | null;
      operatorVariables?: TemplateRow["operatorVariables"];
      status?: string;
    }>
  >(`/api/whatsapp-template-configs/approved${qs}`, "Erro ao carregar templates.");

  if (!Array.isArray(rows)) return [];

  const out: TemplateRow[] = [];
  for (const r of rows) {
    const name = typeof r.metaTemplateName === "string" ? r.metaTemplateName : "";
    if (!name) continue;
    out.push({
      id: typeof r.metaTemplateId === "string" ? r.metaTemplateId : undefined,
      name,
      language: typeof r.language === "string" ? r.language : "pt_BR",
      category: typeof r.category === "string" ? r.category : undefined,
      status: "APPROVED",
      bodyPreview: r.bodyPreview ?? null,
      headerPreview: r.headerPreview ?? null,
      headerFormat: r.headerFormat ?? null,
      operatorVariables: Array.isArray(r.operatorVariables)
        ? r.operatorVariables
        : null,
    });
  }
  return out;
}

export interface AudienceFilterOptions {
  tags: { id: string; name: string; color: string }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  users: { id: string; name: string }[];
}

export function fetchAudienceOptions(): Promise<AudienceFilterOptions> {
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
