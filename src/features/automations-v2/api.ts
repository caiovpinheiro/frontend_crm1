/*
 * Fetchers e tipos da Fase 3 — Automações.
 *
 * Endpoints cabeados:
 *   GET /api/automations?active&search&page&perPage&triggerType
 *   GET /api/automations/:id
 *
 * O builder do ZIP é gráfico (ramificação x/y); o backend é LINEAR
 * (AutomationStep.position). Aqui o "builder" mostra os steps em
 * cadeia (visualização linear). Ramificação fica fora de escopo
 * até o schema evoluir.
 */

import { apiUrl } from "@/lib/api";
import type { AutomationStats } from "@/lib/automation-stats-types";
import { isPageMockMode } from "@/lib/page-mock-mode";
import { mockAutomationSummary, mockAutomationsPage } from "./mock-automations";

async function getJson<T>(
  path: string,
  errLabel: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), init);
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

export interface AutomationListItemDto {
  id: string;
  number?: number;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: unknown;
  active: boolean;
  /** Habilita disparo manual pelo agente (picker do composer). */
  allowManualRun?: boolean;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
  /** Tipos dos passos na ordem (vocabulário backend, ex.: "send_email"). */
  stepTypes?: string[];
  /**
   * Métricas da janela de hoje (buildAutomationListStats). Opcionais
   * porque o detalhe (GET /api/automations/:id) não as retorna.
   */
  runs?: number;
  runsToday?: number;
  successRate?: number;
  lastRunAt?: string | null;
}

export interface AutomationListPage {
  items: AutomationListItemDto[];
  total: number;
  page: number;
  perPage: number;
}

export interface AutomationStepDto {
  id: string;
  automationId: string;
  type: string;
  config: Record<string, unknown> | null;
  position: number;
}

export interface AutomationDetailDto extends AutomationListItemDto {
  steps: AutomationStepDto[];
}

export interface AutomationListSummary {
  total: number;
  active: number;
  paused: number;
  runsToday: number;
  avgSuccess: number;
}

export interface FetchAutomationsParams {
  active?: boolean;
  search?: string;
  page?: number;
  perPage?: number;
}

export function fetchAutomations(
  params: FetchAutomationsParams = {},
): Promise<AutomationListPage> {
  if (isPageMockMode()) {
    return Promise.resolve(mockAutomationsPage(params));
  }
  const sp = new URLSearchParams();
  if (params.active !== undefined) sp.set("active", String(params.active));
  if (params.search) sp.set("search", params.search);
  if (params.page) sp.set("page", String(params.page));
  if (params.perPage) sp.set("perPage", String(params.perPage));
  const qs = sp.toString();
  return getJson<AutomationListPage>(
    `/api/automations${qs ? `?${qs}` : ""}`,
    "Erro ao carregar automações.",
  );
}

export function fetchAutomationSummary(): Promise<AutomationListSummary> {
  if (isPageMockMode()) {
    return Promise.resolve(mockAutomationSummary());
  }
  return getJson<AutomationListSummary>(
    "/api/automations/summary",
    "Erro ao carregar resumo de automações.",
  );
}

export function fetchAutomation(id: string): Promise<AutomationDetailDto> {
  return getJson<AutomationDetailDto>(
    `/api/automations/${id}`,
    "Erro ao carregar automação.",
  );
}

// ── Telemetria: contadores e logs de execução ────────────────────

/**
 * `GET /api/automations/:id/stats` — mesmos contadores que o editor
 * legado consome. `trigger` vem por status cru (`COMPLETED`, `SKIPPED`,
 * `FAILED`…; `STARTED` é eco e o card não soma); `steps` já vem
 * agregado por passo.
 */
export function fetchAutomationStats(id: string): Promise<AutomationStats> {
  return getJson<AutomationStats>(
    `/api/automations/${id}/stats`,
    "Erro ao carregar estatísticas da automação.",
  );
}

export interface AutomationLogWebhookDto {
  id: string;
  receivedAt: string;
  eventType: string;
  objectType?: string | null;
  phoneNumberId?: string | null;
  waMessageId?: string | null;
  fromPhone?: string | null;
  signatureValid?: boolean;
  processed?: boolean;
  processingError?: string | null;
}

export interface AutomationLogRowDto {
  id: string;
  status: string;
  message: string | null;
  contactId: string | null;
  dealId: string | null;
  conversationId?: string | null;
  conversationNumber?: number | string | null;
  stepId: string | null;
  stepType: string | null;
  executedAt: string;
  payload?: Record<string, unknown> | null;
  contactName?: string | null;
  contactPhone?: string | null;
  dealName?: string | null;
  dealNumber?: number | null;
  metaWebhookEvent?: AutomationLogWebhookDto | null;
}

/**
 * A rota responde `{ items, total }`, mas o editor legado lê
 * `logs ?? items` — mantemos a mesma leitura defensiva para não
 * quebrar caso o backend passe a nomear a chave de outro jeito.
 */
export interface AutomationLogsPage {
  logs?: AutomationLogRowDto[];
  items?: AutomationLogRowDto[];
  total: number;
  page?: number;
  perPage?: number;
}

/** `stepId: "trigger"` é a convenção do backend para os logs sem passo. */
export function fetchAutomationLogs(
  id: string,
  params: {
    stepId?: string;
    page?: number;
    perPage?: number;
    status?: readonly string[];
  } = {},
): Promise<AutomationLogsPage> {
  const sp = new URLSearchParams();
  sp.set("page", String(params.page ?? 1));
  sp.set("perPage", String(params.perPage ?? 50));
  if (params.stepId) sp.set("stepId", params.stepId);
  if (params.status?.length) {
    // `status` CSV: o que 381fcdb lê. `logStatus` repetido: não depende
    // de split por vírgula nem de um único get("status").
    sp.set("status", params.status.join(","));
    for (const s of params.status) sp.append("logStatus", s);
  }
  return getJson<AutomationLogsPage>(
    `/api/automations/${id}/logs?${sp.toString()}`,
    "Erro ao carregar logs da automação.",
    { cache: "no-store" },
  );
}

// ── Picker do agente (composer) ──────────────────────────────────
export interface AgentAutomationItem {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
  category: string;
  categoryLabel: string;
  messagePreview: string | null;
}

export function fetchAgentAutomations(): Promise<{
  items: AgentAutomationItem[];
  total: number;
}> {
  return getJson<{ items: AgentAutomationItem[]; total: number }>(
    "/api/automations/agent-runnable",
    "Erro ao carregar automações.",
  );
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

export function toggleAutomationActive(id: string): Promise<AutomationListItemDto> {
  return sendJson<AutomationListItemDto>(
    `/api/automations/${id}/toggle`,
    "POST",
    undefined,
    "Erro ao alternar automação.",
  );
}

// ─────────────────────────────────────────────────────────────────
// CRUD + persistência de steps
// ─────────────────────────────────────────────────────────────────

/**
 * Step embutido no PUT /api/automations/:id (formato legacy preservado pelo
 * `OldAutomationEditor`). O `id` é OPCIONAL no envio mas, quando enviado,
 * o backend mantém a chave — essencial para preservar as referências
 * internas (`nextStepId`, `gotoStepId`, etc.) entre steps importados.
 */
export interface AutomationWriteStepPayload {
  id?: string;
  type: string;
  config: unknown;
}

export interface AutomationWriteBody {
  name?: string;
  description?: string | null;
  triggerType?: string;
  triggerConfig?: unknown;
  active?: boolean;
  allowManualRun?: boolean;
  /**
   * Steps como sub-objeto do payload do PUT (rota legacy). Usado por
   * `replaceAutomation` / `useReplaceAutomation`. O `createAutomation`
   * (POST) e o `updateAutomation` (PATCH) NÃO consomem este campo.
   */
  steps?: AutomationWriteStepPayload[];
}

export interface AutomationStepInput {
  type: string;
  config?: Record<string, unknown> | null;
  position?: number;
}

export function createAutomation(body: AutomationWriteBody): Promise<AutomationDetailDto> {
  return sendJson<AutomationDetailDto>(
    "/api/automations",
    "POST",
    body,
    "Erro ao criar automação.",
  );
}

export function updateAutomation(
  id: string,
  body: AutomationWriteBody,
): Promise<AutomationDetailDto> {
  return sendJson<AutomationDetailDto>(
    `/api/automations/${id}`,
    "PATCH",
    body,
    "Erro ao atualizar automação.",
  );
}

/**
 * Substituição completa via `PUT /api/automations/:id` — mesmo endpoint
 * usado pelo `OldAutomationEditor` para persistir o canvas (incluindo
 * steps). Diferente do `saveAutomationSteps` (`PUT .../steps`), este
 * caminho está confirmado em produção.
 *
 * Use-cases: importação de fluxo `.json` (preserva IDs originais dos
 * steps para manter `nextStepId` / `gotoStepId` válidos) e qualquer
 * outro fluxo que precise enviar steps + metadados num único PUT.
 */
export function replaceAutomation(
  id: string,
  body: AutomationWriteBody,
): Promise<AutomationDetailDto> {
  return sendJson<AutomationDetailDto>(
    `/api/automations/${id}`,
    "PUT",
    body,
    "Erro ao atualizar automação.",
  );
}

export function deleteAutomation(id: string): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(
    `/api/automations/${id}`,
    "DELETE",
    undefined,
    "Erro ao excluir automação.",
  );
}

/**
 * Substitui a lista de steps de uma automação (ordem por `position`).
 * O backend é responsável por aceitar PUT /api/automations/:id/steps
 * com payload `{ steps: AutomationStepInput[] }`. Se o endpoint
 * ainda não existir, o erro será exibido via toast no client.
 */
export function saveAutomationSteps(
  id: string,
  steps: AutomationStepInput[],
): Promise<AutomationDetailDto> {
  const normalized = steps.map((s, i) => ({
    type: s.type,
    config: s.config ?? null,
    position: s.position ?? i,
  }));
  return sendJson<AutomationDetailDto>(
    `/api/automations/${id}/steps`,
    "PUT",
    { steps: normalized },
    "Erro ao salvar etapas.",
  );
}
