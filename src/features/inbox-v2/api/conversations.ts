/*
 * Endpoints REST de conversas usados pelo /inbox-v2.
 *
 * Cada funcao aqui espelha exatamente uma linha das tabelas 2.1-2.2
 * do contrato Fase 1 (`frontend/docs/inbox-api-contract.md`). NAO
 * mudar URL, metodo, query params ou body shape sem antes mudar o
 * backend correspondente.
 */

import { apiUrl } from "@/lib/api";

import type {
  ConversationListResponse,
  ConversationListRow,
  InboxFilters,
  InboxTab,
  TabCounts,
} from "./types";

export interface ListConversationsParams extends InboxFilters {
  tab: InboxTab;
  search?: string;
  perPage?: number;
  page?: number;
}

/** Anexa os filtros do funil (responsável, canal, estágio, tags, origem) —
 *  compartilhado entre a listagem e a contagem para que os badges reflitam
 *  exatamente o mesmo recorte da lista. */
function appendInboxServerFilters(
  q: URLSearchParams,
  p: Partial<InboxFilters>,
): void {
  if (p.withoutOwner) q.set("withoutOwner", "1");
  else if (p.ownerIds?.length) q.set("ownerIds", p.ownerIds.join(","));
  else if (p.ownerId) q.set("ownerId", p.ownerId);
  if (p.channelIds?.length) q.set("channelIds", p.channelIds.join(","));
  else if (p.channel) q.set("channel", p.channel);
  if (p.stageIds?.length) q.set("stageIds", p.stageIds.join(","));
  else if (p.stageId) q.set("stageId", p.stageId);
  if (p.tagIds?.length) q.set("tagIds", p.tagIds.join(","));
  if (p.sources?.length) q.set("sources", p.sources.join(","));
  if (p.sessionExpiresWithinHours != null) {
    q.set("sessionExpiresWithinHours", String(p.sessionExpiresWithinHours));
  }
  if (p.windowState === "open" || p.windowState === "closed") {
    q.set("windowState", p.windowState);
  }
  if (p.painelException) q.set("painel", p.painelException);
}

function buildConversationsUrl(p: ListConversationsParams): string {
  const q = new URLSearchParams({
    perPage: String(p.perPage ?? 60),
    tab: p.tab,
  });
  if (p.page && p.page > 1) q.set("page", String(p.page));
  appendInboxServerFilters(q, p);
  if (p.sortBy) q.set("sortBy", p.sortBy);
  if (p.sortOrder) q.set("sortOrder", p.sortOrder);
  const s = p.search?.trim();
  if (s) q.set("search", s);
  return `/api/conversations?${q.toString()}`;
}

/** GET /api/conversations?perPage&tab&ownerId&channel&stageId&tagIds&sortBy&sortOrder&search */
export async function listConversations(
  params: ListConversationsParams,
): Promise<ConversationListResponse> {
  const res = await fetch(apiUrl(buildConversationsUrl(params)));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar conversas",
    );
  }
  return data as ConversationListResponse;
}

/** GET /api/conversations?counts=1 (com filtros do funil + busca, para os
 *  badges refletirem o recorte ativo da lista). */
export async function fetchTabCounts(
  filters?: InboxFilters | null,
  search?: string | null,
): Promise<TabCounts> {
  const q = new URLSearchParams({ counts: "1" });
  if (filters) appendInboxServerFilters(q, filters);
  const s = search?.trim();
  if (s) q.set("search", s);
  const res = await fetch(apiUrl(`/api/conversations?${q.toString()}`));
  if (!res.ok) {
    // Não gravar zeros no cache — um GET abortado/401 na navegação
    // zerava os badges com a lista ainda visível (keepPreviousData).
    throw new Error("Falha ao carregar contagem das abas.");
  }
  return res.json() as Promise<TabCounts>;
}

/**
 * GET /api/conversations/:id — só CUID. Ticket `#332843` / `?c=332843`
 * resolve na lista do client (`matchesConversationUrlRef`); não bate na
 * API com ID numérico (404 em produção).
 */
export async function getConversation(
  conversationId: string,
): Promise<ConversationListRow> {
  if (/^\d+$/.test(conversationId.trim())) {
    throw new Error("Conversa não encontrada ou sem permissão");
  }
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Conversa não encontrada ou sem permissão",
    );
  }
  return data as ConversationListRow;
}

/** GET /api/conversations?perPage=80&sortBy=updatedAt&sortOrder=desc — picker do Forward */
export async function listConversationsForForwardPicker(): Promise<ConversationListResponse> {
  const res = await fetch(
    apiUrl("/api/conversations?perPage=80&sortBy=updatedAt&sortOrder=desc"),
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar lista",
    );
  }
  return data as ConversationListResponse;
}

export type ConversationActionPayload =
  | {
      action: "resolve";
      tabulationId?: string | null;
      /** Só o backend aceita se o user for ADMIN. Agentes: ignorado. */
      skipAutomations?: boolean;
    }
  | { action: "reopen" }
  | { action: "assign"; assignedToId: string | null }
  | {
      action: "transfer";
      assignedToId?: string | null;
      departmentId?: string | null;
    };

/** Resultado da Distribuição Inteligente acionada por uma transferência para departamento. */
export interface TransferDistributionResult {
  success: boolean;
  reason: string;
  selectedUserId: string | null;
  selectedUserName: string | null;
}

export type TabulationNode = {
  id: string;
  /** ID amigável sequencial por organização (não o CUID). */
  number?: number;
  parentId: string | null;
  name: string;
  color: string | null;
  position: number;
  active: boolean;
  children: TabulationNode[];
};

export interface TabulationsResponse {
  departmentId: string;
  requireTabulationOnClose: boolean;
  tree: TabulationNode[];
}

/** GET /api/tabulations?departmentId=xxx — leitura para agentes */
export async function getTabulations(
  departmentId: string,
): Promise<TabulationsResponse> {
  const res = await fetch(
    apiUrl(`/api/tabulations?departmentId=${encodeURIComponent(departmentId)}`),
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar tabulacoes",
    );
  }
  return data as TabulationsResponse;
}

/**
 * Retorno de POST /api/conversations/:id/actions.
 * - `resolve`: `conversation` traz o estado atualizado (status=RESOLVED).
 * - `reopen`: modelo de ticket — o backend cria uma NOVA conversa vinculada
 *   ao mesmo contato/canal e retorna o novo id em `conversation.id`; o id
 *   antigo vem em `previousConversationId` para logs/navegacao.
 * - `assign`: `conversation` traz o novo assignedTo.
 */
export interface ConversationActionResponse {
  conversation: ConversationListRow;
  /** Presente apenas em `reopen` (modelo de ticket). */
  previousConversationId?: string;
  /** Presente em `transfer` quando um departamento foi definido (distribuição). */
  distribution?: TransferDistributionResult | null;
}

/** Erro tipado de ação de conversa (ex.: TABULATION_REQUIRED). */
export class ConversationActionError extends Error {
  code?: string;
  departmentId?: string | null;

  constructor(
    message: string,
    opts?: { code?: string; departmentId?: string | null },
  ) {
    super(message);
    this.name = "ConversationActionError";
    this.code = opts?.code;
    this.departmentId = opts?.departmentId ?? null;
  }
}

/** POST /api/conversations/:id/actions */
export async function postConversationAction(
  conversationId: string,
  payload: ConversationActionPayload,
): Promise<ConversationActionResponse> {
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/actions`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ConversationActionError(
      typeof data?.message === "string" ? data.message : "Erro ao executar acao",
      {
        code: typeof data?.code === "string" ? data.code : undefined,
        departmentId:
          typeof data?.departmentId === "string" ? data.departmentId : null,
      },
    );
  }
  return data as ConversationActionResponse;
}

/** POST /api/conversations/:id/read */
export async function markConversationRead(conversationId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/read`), {
    method: "POST",
  });
  if (!res.ok) throw new Error("Falha ao marcar como lida");
}

/** POST /api/conversations/:id/typing — fire-and-forget */
export function postTyping(conversationId: string): void {
  void fetch(apiUrl(`/api/conversations/${conversationId}/typing`), {
    method: "POST",
  }).catch(() => {});
}

/** POST /api/conversations/:id/pin-note */
export async function pinConversationNote(
  conversationId: string,
  messageId: string | null,
): Promise<void> {
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/pin-note`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  });
  if (!res.ok) throw new Error("Falha ao fixar nota");
}

export type BulkAction = "resolve" | "reopen" | "delete" | "assign";

export interface BulkActionResult {
  updated?: number;
  /** IDs pulados por regra do backend (ex.: dept exige tabulacao). */
  skipped?: string[];
  /**
   * Presente quando a acao roda de forma ASSINCRONA no leads-worker
   * (encerramento em massa). O frontend pollar `/api/bulk-operations/[id]`.
   */
  operationId?: string;
  /** Total de conversas que serao processadas pelo worker (modo async). */
  total?: number;
}

/** POST /api/conversations/bulk */
export async function postBulkAction(
  ids: string[],
  action: BulkAction,
  extra?: Record<string, unknown>,
): Promise<BulkActionResult> {
  const res = await fetch(apiUrl("/api/conversations/bulk"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Falha em acao em lote",
    );
  }
  return (data ?? {}) as BulkActionResult;
}

export type ActiveAutomationDto = {
  contextId: string;
  automationId: string;
  name: string;
  status: "RUNNING" | "PAUSED";
  stepLabel: string | null;
  timeoutAt: string | null;
  updatedAt: string;
};

/** GET /api/conversations/:id/active-automations — chip "robô em execução" */
export async function getActiveAutomations(
  conversationId: string,
): Promise<{ items: ActiveAutomationDto[] }> {
  const res = await fetch(
    apiUrl(`/api/conversations/${conversationId}/active-automations`),
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar automações ativas",
    );
  }
  return data as { items: ActiveAutomationDto[] };
}

/** GET /api/contacts/:id/active-automations — botão "Robôs ativos" (inbox/deal) */
export async function getContactActiveAutomations(
  contactId: string,
): Promise<{ items: ActiveAutomationDto[] }> {
  const res = await fetch(
    apiUrl(`/api/contacts/${contactId}/active-automations`),
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar automações ativas",
    );
  }
  return data as { items: ActiveAutomationDto[] };
}

export type AutomationHistoryDto = {
  contextId: string;
  automationId: string;
  name: string;
  status: "COMPLETED" | "TIMED_OUT";
  startedAt: string;
  finishedAt: string;
};

/** GET /api/contacts/:id/automation-history — histórico de execuções encerradas */
export async function getContactAutomationHistory(
  contactId: string,
): Promise<{ items: AutomationHistoryDto[] }> {
  const res = await fetch(
    apiUrl(`/api/contacts/${contactId}/automation-history`),
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar histórico",
    );
  }
  return data as { items: AutomationHistoryDto[] };
}

/** DELETE /api/contacts/:id/active-automations/:contextId — interromper automação */
export async function cancelContactAutomation(
  contactId: string,
  contextId: string,
): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/contacts/${contactId}/active-automations/${contextId}`),
    { method: "DELETE" },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao interromper o robô",
    );
  }
}

/** POST /api/conversations/create */
export async function createConversation(payload: {
  contactId?: string;
  phone?: string;
  channelId: string;
  message?: string;
}): Promise<{ conversation: { id: string } }> {
  const res = await fetch(apiUrl("/api/conversations/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao criar conversa",
    );
  }
  return data as { conversation: { id: string } };
}
