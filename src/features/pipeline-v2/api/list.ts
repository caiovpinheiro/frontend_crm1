/*
 * Fetcher da visão "Lista" do pipeline V2.
 *
 * Bate em `GET /api/deals` com paginação. O endpoint já devolve
 * `contact`, `stage` (com color/name) e `owner` selecionados via
 * `listInclude` em `backend/src/services/deals.ts`, então não
 * precisamos de N+1 nem de joins extras no cliente.
 */

import { apiUrl } from "@/lib/api";

export type DealListStatusDto = "OPEN" | "WON" | "LOST";

export interface DealListItemDto {
  id: string;
  number?: number;
  title: string;
  value: number | string;
  status: DealListStatusDto;
  position: number;
  stageId: string;
  ownerId: string | null;
  contactId: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
  } | null;
  stage: {
    id: string;
    name: string;
    position: number;
    color: string;
    pipelineId: string;
  };
  owner: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    type?: string | null;
  } | null;
}

export interface DealListPage {
  items: DealListItemDto[];
  total: number;
  page: number;
  perPage: number;
}

interface FetchDealsListParams {
  pipelineId?: string;
  stageId?: string;
  status?: DealListStatusDto;
  ownerId?: string;
  search?: string;
  page?: number;
  perPage?: number;
  /** Filtros avançados (mesmo shape do kanban) — enviados como JSON em `filters`. */
  filters?: Record<string, unknown>;
}

function buildQuery(params: FetchDealsListParams): string {
  const sp = new URLSearchParams();
  if (params.pipelineId) sp.set("pipelineId", params.pipelineId);
  if (params.stageId) sp.set("stageId", params.stageId);
  if (params.status) sp.set("status", params.status);
  if (params.ownerId) sp.set("ownerId", params.ownerId);
  if (params.search) sp.set("search", params.search);
  if (params.page) sp.set("page", String(params.page));
  if (params.perPage) sp.set("perPage", String(params.perPage));
  if (params.filters && Object.keys(params.filters).length > 0) {
    sp.set("filters", JSON.stringify(params.filters));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * GET /api/deals?pipelineId&stageId&status&search&page&perPage
 *
 * Trata corpo vazio (sessão não reconhecida) como erro legível em
 * vez de devolver objeto vazio que estouraria nos componentes.
 */
export async function fetchDealsList(params: FetchDealsListParams = {}): Promise<DealListPage> {
  const res = await fetch(apiUrl(`/api/deals${buildQuery(params)}`));
  const text = await res.text();
  if (!res.ok) {
    let message = "Erro ao carregar negócios";
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed?.message === "string") message = parsed.message;
    } catch {
      /* corpo não-JSON (HTML de login) */
    }
    throw new Error(message);
  }
  if (!text.trim()) {
    throw new Error("Sessão expirada ou backend indisponível. Recarregue e faça login.");
  }
  try {
    return JSON.parse(text) as DealListPage;
  } catch {
    throw new Error("Sessão não reconhecida pelo backend. Recarregue e faça login.");
  }
}
