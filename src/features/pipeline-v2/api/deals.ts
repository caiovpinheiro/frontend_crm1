/*
 * Endpoints REST de deals usados pelo /pipeline/kanban-v2.
 * Mantém URLs idênticas à tela legada do CRM.
 */

import { apiUrl } from "@/lib/api";

import type { BoardDealDto } from "./types";

/** POST /api/deals/:id/move — move o deal entre estágios.
 *  `lostReason` acompanha moves para o estágio Perdido (tabulação). */
export async function moveDeal(
  dealId: string,
  payload: { stageId: string; position?: number; lostReason?: string },
): Promise<{ deal: BoardDealDto }> {
  const res = await fetch(apiUrl(`/api/deals/${dealId}/move`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao mover deal",
    );
  }
  return data as { deal: BoardDealDto };
}

export interface DealContactConversation {
  id: string;
  externalId?: string | null;
  channel?: string | null;
  status?: string | null;
  inboxName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DealContactWithConversations {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  conversations?: DealContactConversation[];
  /** Origem nativa do contato (Contact.source). Selecionada no backend
   *  detailInclude desde 2026-06-30; usada no cabecalho do deal detail
   *  (DD5) via InlineNativeEditor. */
  source?: string | null;
  /** Tags do contato (Contact.tags), achatadas pelo backend para
   *  `[{ id, name, color }]`. Usadas no `contactTagsSlot` do deal
   *  detail (DD9) — distintas de `deal.tags` (tags do negocio). */
  tags?: { id: string; name: string; color: string | null }[];
}

export type DealPanelField = {
  fieldId: string;
  name: string;
  label: string;
  type: string;
  options: string[];
  value: string | null;
  highlightRules: unknown[];
  highlight: { severity: string; label: string } | null;
};

/** GET /api/deals/:id — detail panel */
export async function getDeal(dealId: string): Promise<BoardDealDto & {
  notes?: string | null;
  source?: string | null;
  address?: string | null;
  website?: string | null;
  tags?: { id: string; name: string; color: string | null }[];
  expectedCloseAt?: string | null;
  customFields?: Record<string, unknown> | null;
  contact?: DealContactWithConversations | null;
  /** Campos de negócio marcados para exibição no painel Deal Detail (showInDealPanel). */
  dealPanelFields?: DealPanelField[];
}> {
  const res = await fetch(apiUrl(`/api/deals/${dealId}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar deal",
    );
  }
  return data;
}

/**
 * PUT /api/deals/:id — atualiza qualquer campo escalar do deal.
 *
 * Backend aceita campos parcialmente (PATCH-like): title, value,
 * ownerId, contactId, source, expectedCloseAt, customFields, etc.
 */
export interface UpdateDealPayload {
  title?: string;
  value?: number | null;
  ownerId?: string | null;
  /** `false` = muda só o negócio, sem herdar o responsável no chat. */
  propagateToChat?: boolean;
  contactId?: string | null;
  source?: string | null;
  expectedCloseAt?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown> | null;
  /** Só o texto do motivo — não altera status/estágio. */
  lostReason?: string | null;
}

export async function updateDeal(
  dealId: string,
  payload: UpdateDealPayload,
): Promise<{ deal: BoardDealDto }> {
  const res = await fetch(apiUrl(`/api/deals/${dealId}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao atualizar negocio",
    );
  }
  return data as { deal: BoardDealDto };
}

/**
 * POST /api/deals — cria um novo deal. Mantemos a forma minima
 * (title + stageId obrigatorios) e expomos o que o backend ja
 * aceita opcionalmente.
 */
export interface CreateDealPayload {
  /** Opcional: sem título o backend gera "Negócio - #<number>". */
  title?: string;
  stageId: string;
  value?: number;
  ownerId?: string | null;
  contactId?: string | null;
  expectedClose?: string | null;
}

export async function createDeal(
  payload: CreateDealPayload,
): Promise<{ deal: BoardDealDto }> {
  const res = await fetch(apiUrl(`/api/deals`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao criar negocio",
    );
  }
  return data as { deal: BoardDealDto };
}

export interface DealTimelineEvent {
  id: string;
  type: string;
  createdAt: string;
  user?: { id?: string; name?: string | null; avatarUrl?: string | null } | null;
  meta?: Record<string, unknown> | null;
}

/** GET /api/deals/:id/timeline — eventos historicos do deal. */
export async function getDealTimeline(
  dealId: string,
): Promise<DealTimelineEvent[]> {
  const res = await fetch(apiUrl(`/api/deals/${dealId}/timeline`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar timeline",
    );
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

/** DELETE /api/deals/:id — remove o deal permanentemente. */
export async function deleteDeal(dealId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/deals/${dealId}`), {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao excluir negocio",
    );
  }
}

/** PUT /api/deals/:id/status — marcar WON / LOST / reabrir OPEN. */
export type DealStatus = "WON" | "LOST" | "OPEN";

export async function setDealStatus(
  dealId: string,
  payload: { status: DealStatus; lostReason?: string },
): Promise<{ deal: BoardDealDto }> {
  const res = await fetch(apiUrl(`/api/deals/${dealId}/status`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao atualizar status",
    );
  }
  return data as { deal: BoardDealDto };
}
