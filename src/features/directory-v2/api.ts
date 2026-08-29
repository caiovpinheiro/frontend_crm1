/*
 * Camada de API da Fase 2 — diretórios (contatos, empresas) e
 * atividades para o segmento `/v2/*`.
 *
 * Os endpoints batidos aqui já existiam:
 *   GET /api/contacts?search&page&perPage&sortBy&sortOrder
 *   GET /api/companies?search&page&perPage
 *   GET /api/activities?type&completed&page&perPage
 *
 * Toda chamada usa `getJson` para diferenciar "sessão expirada"
 * (corpo vazio do redirect /login) de "erro real do backend".
 */

import { apiUrl } from "@/lib/api";
import { isDirectoryMock, mockCompaniesPage, mockContactsPage } from "./mock";

/** Erro HTTP tipado da camada directory-v2 (expõe `status`). */
export class DirectoryApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DirectoryApiError";
    this.status = status;
  }
}

function throwHttpError(text: string, status: number, errLabel: string): never {
  let message = errLabel;
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    if (typeof parsed?.message === "string") message = parsed.message;
  } catch {
    /* corpo não-JSON */
  }
  throw new DirectoryApiError(message, status);
}

async function getJson<T>(path: string, errLabel: string): Promise<T> {
  const res = await fetch(apiUrl(path));
  const text = await res.text();
  if (!res.ok) {
    throwHttpError(text, res.status, errLabel);
  }
  if (!text.trim()) {
    throw new DirectoryApiError(
      "Sessão expirada ou backend indisponível. Recarregue e faça login.",
      401,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DirectoryApiError(
      "Sessão não reconhecida pelo backend. Recarregue e faça login.",
      401,
    );
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
    throwHttpError(text, res.status, errLabel);
  }
  if (!text.trim()) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as unknown as T;
  }
}

// ─────────────────────────────────────────────────────────────────
// Contatos
// ─────────────────────────────────────────────────────────────────

export interface ContactListItemDto {
  id: string;
  number?: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  leadScore: number | null;
  lifecycleStage: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: { id: string; name: string; avatarUrl: string | null } | null;
  company: { id: string; name: string; domain: string | null } | null;
  // O backend (getContacts) ja achata as tags: `tags: c.tags.map((t) => t.tag)`,
  // entao a resposta vem como [{ id, name, color }], NAO [{ tag: {...} }].
  tags: { id: string; name: string; color: string | null }[];
  // Valores de campos customizados achatados por id: { [customFieldId]: value }.
  customFields: Record<string, string>;
}

// Definição de um campo customizado de contato (para o configurador de colunas).
export interface ContactFieldDefDto {
  id: string;
  name: string;
  label: string;
  type: string;
  options: string[];
}

export function fetchContactFieldDefs(): Promise<ContactFieldDefDto[]> {
  return getJson<ContactFieldDefDto[]>(
    "/api/custom-fields?entity=contact",
    "Erro ao carregar campos personalizados.",
  );
}

export interface ContactListPage {
  items: ContactListItemDto[];
  total: number;
  page: number;
  perPage: number;
}

export interface FetchContactsParams {
  search?: string;
  page?: number;
  perPage?: number;
  /** Estágio do ciclo de vida (LEAD, CUSTOMER…). */
  lifecycleStage?: string;
  /** Filtra por tags (OR entre elas). */
  tagIds?: string[];
  /** Somente contatos sem responsável atribuído. */
  unassigned?: boolean;
  /** Intervalo de criação (YYYY-MM-DD). */
  createdFrom?: string;
  createdTo?: string;
  /** Intervalo de modificação (YYYY-MM-DD). */
  updatedFrom?: string;
  updatedTo?: string;
  /** Campo de ordenação. */
  sortBy?: "name" | "email" | "createdAt" | "updatedAt" | "leadScore" | "lifecycleStage";
  /** Direção da ordenação. */
  sortOrder?: "asc" | "desc";
}

export function fetchContacts(params: FetchContactsParams = {}): Promise<ContactListPage> {
  if (isDirectoryMock()) return Promise.resolve(mockContactsPage(params));
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.page) sp.set("page", String(params.page));
  if (params.perPage) sp.set("perPage", String(params.perPage));
  if (params.lifecycleStage) sp.set("lifecycleStage", params.lifecycleStage);
  if (params.tagIds && params.tagIds.length > 0) sp.set("tagIds", params.tagIds.join(","));
  if (params.unassigned) sp.set("unassigned", "1");
  if (params.createdFrom) sp.set("createdFrom", params.createdFrom);
  if (params.createdTo) sp.set("createdTo", params.createdTo);
  if (params.updatedFrom) sp.set("updatedFrom", params.updatedFrom);
  if (params.updatedTo) sp.set("updatedTo", params.updatedTo);
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortOrder) sp.set("sortOrder", params.sortOrder);
  const qs = sp.toString();
  return getJson<ContactListPage>(
    `/api/contacts${qs ? `?${qs}` : ""}`,
    "Erro ao carregar contatos.",
  );
}

// Contagens agregadas por segmento (stat cards do diretório).
export interface ContactStatsDto {
  total: number;
  unassigned: number;
  byStage: Record<string, number>;
}

export function fetchContactStats(): Promise<ContactStatsDto> {
  return getJson<ContactStatsDto>(
    "/api/contacts/stats",
    "Erro ao carregar estatísticas de contatos.",
  );
}

// Tags da organização com contagem de uso (chips de filtro).
export interface TagWithCountDto {
  id: string;
  name: string;
  color: string | null;
  dealCount: number;
  contactCount: number;
}

export function fetchTagsWithCounts(): Promise<TagWithCountDto[]> {
  return getJson<TagWithCountDto[]>(
    "/api/tags?counts=1",
    "Erro ao carregar tags.",
  );
}

// ─────────────────────────────────────────────────────────────────
// Duplicatas de contatos
// ─────────────────────────────────────────────────────────────────

export interface DuplicateContactSnap {
  id: string;
  number?: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  company: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
}

export interface DuplicateGroup {
  key: string;
  field: "phone" | "email";
  contacts: DuplicateContactSnap[];
}

export interface DuplicatesResponseDto {
  groups: DuplicateGroup[];
}

export function fetchDuplicates(): Promise<DuplicatesResponseDto> {
  return getJson<DuplicatesResponseDto>(
    "/api/contacts/duplicates",
    "Erro ao localizar duplicatas.",
  );
}

export function mergeContacts(keepId: string, removeId: string): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(
    "/api/contacts/merge",
    "POST",
    { keepId, removeId },
    "Erro ao mesclar contatos.",
  );
}

// ─────────────────────────────────────────────────────────────────
// Contato — detalhe + mutations
// ─────────────────────────────────────────────────────────────────

export interface ContactNoteDto {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string };
}

export interface ContactDealDto {
  id: string;
  title: string;
  value: number | string | null;
  status: string;
  stage: { id: string; name: string; color: string | null };
}

export interface ContactDetailDto {
  id: string;
  number?: number;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  leadScore: number | null;
  lifecycleStage: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  company: { id: string; number?: number; name: string; domain: string | null } | null;
  assignedTo: { id: string; name: string; email: string | null } | null;
  tags: { tag: { id: string; name: string; color: string | null } }[];
  deals: ContactDealDto[];
  notes: ContactNoteDto[];
  conversations: { id: string }[];
}

export function fetchContact(id: string): Promise<ContactDetailDto> {
  return getJson<ContactDetailDto>(
    `/api/contacts/${id}`,
    "Erro ao carregar contato.",
  );
}

export interface ContactWriteBody {
  name?: string;
  email?: string | null;
  phone?: string | null;
  lifecycleStage?: string | null;
  source?: string | null;
  companyId?: string | null;
  assignedToId?: string | null;
}

export function createContact(body: ContactWriteBody): Promise<ContactDetailDto> {
  return sendJson<ContactDetailDto>(
    "/api/contacts",
    "POST",
    body,
    "Erro ao criar contato.",
  );
}

export function updateContact(
  id: string,
  body: ContactWriteBody,
): Promise<ContactDetailDto> {
  return sendJson<ContactDetailDto>(
    `/api/contacts/${id}`,
    "PUT",
    body,
    "Erro ao atualizar contato.",
  );
}

export function deleteContact(id: string): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(
    `/api/contacts/${id}`,
    "DELETE",
    undefined,
    "Erro ao excluir contato.",
  );
}

export function addContactNote(id: string, content: string): Promise<ContactNoteDto> {
  return sendJson<ContactNoteDto>(
    `/api/contacts/${id}/notes`,
    "POST",
    { content },
    "Erro ao adicionar nota.",
  );
}

export function addContactTag(
  id: string,
  tagId: string,
): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(
    `/api/contacts/${id}/tags`,
    "POST",
    { tagId },
    "Erro ao adicionar tag.",
  );
}

export function removeContactTag(
  id: string,
  tagId: string,
): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(
    `/api/contacts/${id}/tags`,
    "DELETE",
    { tagId },
    "Erro ao remover tag.",
  );
}

// ─────────────────────────────────────────────────────────────────
// Empresas
// ─────────────────────────────────────────────────────────────────

export interface CompanyListItemDto {
  id: string;
  number?: number;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  address: string | null;
  cep: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
  _count: { contacts: number };
}

export interface CompanyListPage {
  items: CompanyListItemDto[];
  total: number;
  page: number;
  perPage: number;
}

export type CompanySegment = "todos" | "com-contatos" | "sem-email" | "sem-telefone";

export type CompanySortField = "name" | "createdAt" | "updatedAt";

export interface FetchCompaniesParams {
  search?: string;
  page?: number;
  perPage?: number;
  segment?: CompanySegment;
  city?: string;
  state?: string;
  industry?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: CompanySortField;
  sortOrder?: "asc" | "desc";
}

export interface CompanyFacetsDto {
  states: string[];
  cities: string[];
  industries: string[];
}

export function fetchCompanyFacets(): Promise<CompanyFacetsDto> {
  if (isDirectoryMock()) {
    return Promise.resolve({ states: [], cities: [], industries: [] });
  }
  return getJson<CompanyFacetsDto>(
    "/api/companies/facets",
    "Erro ao carregar filtros de empresas.",
  );
}

export interface CompanyStatsDto {
  total: number;
  withContacts: number;
  withoutEmail: number;
  withoutPhone: number;
}

export function fetchCompanyStats(): Promise<CompanyStatsDto> {
  if (isDirectoryMock()) {
    return Promise.resolve({
      total: 24,
      withContacts: 20,
      withoutEmail: 4,
      withoutPhone: 6,
    });
  }
  return getJson<CompanyStatsDto>(
    "/api/companies/stats",
    "Erro ao carregar estatísticas de empresas.",
  );
}

export function fetchCompanies(params: FetchCompaniesParams = {}): Promise<CompanyListPage> {
  if (isDirectoryMock()) return Promise.resolve(mockCompaniesPage(params));
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.page) sp.set("page", String(params.page));
  if (params.perPage) sp.set("perPage", String(params.perPage));
  if (params.segment && params.segment !== "todos") sp.set("segment", params.segment);
  if (params.city) sp.set("city", params.city);
  if (params.state) sp.set("state", params.state);
  if (params.industry) sp.set("industry", params.industry);
  if (params.createdFrom) sp.set("createdFrom", params.createdFrom);
  if (params.createdTo) sp.set("createdTo", params.createdTo);
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortOrder) sp.set("sortOrder", params.sortOrder);
  const qs = sp.toString();
  return getJson<CompanyListPage>(
    `/api/companies${qs ? `?${qs}` : ""}`,
    "Erro ao carregar empresas.",
  );
}

// ─────────────────────────────────────────────────────────────────
// Empresa — detalhe + mutations
// ─────────────────────────────────────────────────────────────────

export interface CompanyContactDto {
  id: string;
  number?: number;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface CompanyDetailDto {
  id: string;
  number?: number;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  address: string | null;
  cep: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
  updatedAt: string;
  contacts: CompanyContactDto[];
  _count?: { contacts: number };
}

export function fetchCompany(id: string): Promise<CompanyDetailDto> {
  return getJson<CompanyDetailDto>(
    `/api/companies/${id}`,
    "Erro ao carregar empresa.",
  );
}

export interface CompanyWriteBody {
  name?: string;
  domain?: string | null;
  industry?: string | null;
  size?: string | null;
  phone?: string | null;
  address?: string | null;
  cep?: string | null;
  city?: string | null;
  state?: string | null;
}

export function createCompany(body: CompanyWriteBody): Promise<CompanyDetailDto> {
  return sendJson<CompanyDetailDto>(
    "/api/companies",
    "POST",
    body,
    "Erro ao criar empresa.",
  );
}

export function updateCompany(
  id: string,
  body: CompanyWriteBody,
): Promise<CompanyDetailDto> {
  return sendJson<CompanyDetailDto>(
    `/api/companies/${id}`,
    "PUT",
    body,
    "Erro ao atualizar empresa.",
  );
}

export function deleteCompany(id: string): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(
    `/api/companies/${id}`,
    "DELETE",
    undefined,
    "Erro ao excluir empresa.",
  );
}

// ─────────────────────────────────────────────────────────────────
// Atividades
// ─────────────────────────────────────────────────────────────────

export type ActivityTypeDto = "CALL" | "MEETING" | "EMAIL" | "TASK" | "OTHER";

export interface ActivityListItemDto {
  id: string;
  type: ActivityTypeDto;
  title: string;
  description: string | null;
  completed: boolean;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string | null; avatarUrl: string | null } | null;
  department?: { id: string; name: string; color: string | null; icon: string | null } | null;
  contact: { id: string; name: string; email: string | null } | null;
  deal: { id: string; title: string; stageId: string } | null;
  /** Quem criou a tarefa (pode diferir do responsável `user`). */
  createdBy?: { id: string; name: string; email: string; avatarUrl: string | null } | null;
}

export interface ActivityListPage {
  items: ActivityListItemDto[];
  total: number;
  page: number;
  perPage: number;
}

export type ActivityScope = "mine" | "department" | "all";

export interface FetchActivitiesParams {
  type?: ActivityTypeDto;
  completed?: boolean;
  page?: number;
  perPage?: number;
  scope?: ActivityScope;
  /** Filtra atividades vinculadas a um negócio. */
  dealId?: string;
  /** Filtra atividades vinculadas a um contato. */
  contactId?: string;
}

export function fetchActivities(
  params: FetchActivitiesParams = {},
): Promise<ActivityListPage> {
  const sp = new URLSearchParams();
  if (params.type) sp.set("type", params.type);
  if (params.completed !== undefined) sp.set("completed", String(params.completed));
  if (params.page) sp.set("page", String(params.page));
  if (params.perPage) sp.set("perPage", String(params.perPage));
  if (params.scope) sp.set("scope", params.scope);
  if (params.dealId) sp.set("dealId", params.dealId);
  if (params.contactId) sp.set("contactId", params.contactId);
  const qs = sp.toString();
  return getJson<ActivityListPage>(
    `/api/activities${qs ? `?${qs}` : ""}`,
    "Erro ao carregar atividades.",
  );
}

/** Todas as páginas — calendário e KPIs de Tarefas (backend cap = 100/página). */
export async function fetchAllActivities(
  params: Omit<FetchActivitiesParams, "page" | "perPage"> = {},
): Promise<ActivityListPage> {
  const first = await fetchActivities({ ...params, page: 1, perPage: 100 });
  const totalPages = Math.max(1, Math.ceil(first.total / first.perPage) || 1);
  if (totalPages <= 1) return first;
  const rest = await Promise.all(
    Array.from({ length: Math.min(totalPages - 1, 50) }, (_, i) =>
      fetchActivities({ ...params, page: i + 2, perPage: first.perPage }),
    ),
  );
  const items = first.items.concat(...rest.map((p) => p.items));
  return { items, total: first.total, page: 1, perPage: items.length };
}

// ─────────────────────────────────────────────────────────────────
// Atividades — mutations (criar, atualizar, excluir)
// ─────────────────────────────────────────────────────────────────

export interface CreateActivityPayload {
  type: ActivityTypeDto;
  title: string;
  description?: string | null;
  completed?: boolean;
  scheduledAt?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  /** Responsável usuário (opcional se atribuída a departamento). */
  userId?: string | null;
  /** Responsável departamento (tarefa compartilhada). */
  departmentId?: string | null;
}

export function createActivity(payload: CreateActivityPayload): Promise<ActivityListItemDto> {
  return sendJson<ActivityListItemDto>(
    "/api/activities",
    "POST",
    payload,
    "Erro ao criar atividade.",
  );
}

export interface UpdateActivityPayload {
  type?: ActivityTypeDto;
  title?: string;
  description?: string | null;
  completed?: boolean;
  scheduledAt?: string | null;
  completedAt?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  userId?: string | null;
  departmentId?: string | null;
}

export function updateActivity(
  id: string,
  payload: UpdateActivityPayload,
): Promise<ActivityListItemDto> {
  return sendJson<ActivityListItemDto>(
    `/api/activities/${id}`,
    "PUT",
    payload,
    "Erro ao atualizar atividade.",
  );
}

export function deleteActivity(id: string): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(
    `/api/activities/${id}`,
    "DELETE",
    undefined,
    "Erro ao excluir atividade.",
  );
}

export function fetchActivity(id: string): Promise<ActivityListItemDto> {
  return getJson<ActivityListItemDto>(
    `/api/activities/${id}`,
    "Erro ao carregar atividade.",
  );
}

// ─────────────────────────────────────────────────────────────────
// Atividades — comentários / notas
// ─────────────────────────────────────────────────────────────────

export const ACTIVITY_COMMENT_CONTENT_MAX = 10_000;

export type ActivityCommentRevisionAction = "CREATED" | "UPDATED" | "DELETED";

export interface ActivityCommentDto {
  id: string;
  activityId: string;
  organizationId: string;
  authorId: string;
  author: { id: string; name: string; avatarUrl: string | null };
  content: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityCommentRevisionDto {
  id: string;
  commentId: string;
  organizationId: string;
  actorId: string;
  actor: { id: string; name: string; avatarUrl: string | null };
  action: ActivityCommentRevisionAction;
  beforeContent: string | null;
  afterContent: string | null;
  createdAt: string;
}

export function fetchActivityComments(
  activityId: string,
): Promise<{ items: ActivityCommentDto[] }> {
  return getJson<{ items: ActivityCommentDto[] }>(
    `/api/activities/${activityId}/comments`,
    "Erro ao carregar notas.",
  );
}

export function fetchActivityCommentHistory(
  activityId: string,
): Promise<{ items: ActivityCommentRevisionDto[] }> {
  return getJson<{ items: ActivityCommentRevisionDto[] }>(
    `/api/activities/${activityId}/comments?history=1`,
    "Erro ao carregar histórico de notas.",
  );
}

export function createActivityComment(
  activityId: string,
  content: string,
): Promise<ActivityCommentDto> {
  return sendJson<ActivityCommentDto>(
    `/api/activities/${activityId}/comments`,
    "POST",
    { content },
    "Erro ao adicionar nota.",
  );
}

export function updateActivityComment(
  activityId: string,
  commentId: string,
  content: string,
): Promise<ActivityCommentDto> {
  return sendJson<ActivityCommentDto>(
    `/api/activities/${activityId}/comments/${commentId}`,
    "PUT",
    { content },
    "Erro ao editar nota.",
  );
}

export function deleteActivityComment(
  activityId: string,
  commentId: string,
): Promise<ActivityCommentDto> {
  return sendJson<ActivityCommentDto>(
    `/api/activities/${activityId}/comments/${commentId}`,
    "DELETE",
    undefined,
    "Erro ao excluir nota.",
  );
}

// ─────────────────────────────────────────────────────────────────
// Atividades — alertas (polling consumptivo)
// ─────────────────────────────────────────────────────────────────

export type ActivityAlertKind = "PRE_DUE" | "DUE";

export interface ActivityAlertDto {
  id: string;
  kind: ActivityAlertKind;
  title: string;
  type: string;
  scheduledAt: string;
  contact?: { id: string; name: string } | null;
  deal?: { id: string; title: string } | null;
  department?: { id: string; name: string } | null;
}

export interface ActivityAlertResponse {
  alert: ActivityAlertDto | null;
}

export type ActivityAlertActionBody =
  | { action: "dismiss" }
  | { action: "snooze"; kind: ActivityAlertKind };

export function fetchActivityAlert(): Promise<ActivityAlertResponse> {
  return getJson<ActivityAlertResponse>(
    "/api/activities/alerts",
    "Erro ao carregar alerta de tarefa.",
  );
}

export function postActivityAlertAction(
  activityId: string,
  body: ActivityAlertActionBody,
): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(
    `/api/activities/alerts/${activityId}`,
    "POST",
    body,
    "Erro ao atualizar alerta de tarefa.",
  );
}

/**
 * Conflito/stale: limpar card no client.
 * 404/409 tipados; 400 cobre mensagens conhecidas do contrato atual.
 */
export function isStaleActivityAlertError(err: unknown): boolean {
  if (!(err instanceof DirectoryApiError)) return false;
  if (err.status === 404 || err.status === 409) return true;
  if (err.status !== 400) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("dispensado") ||
    m.includes("desatualizado") ||
    m.includes("não encontrado") ||
    m.includes("nao encontrado") ||
    m.includes("sem alerta elegível") ||
    m.includes("sem alerta elegivel")
  );
}
