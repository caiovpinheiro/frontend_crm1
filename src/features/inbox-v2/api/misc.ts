/*
 * Endpoints auxiliares: tags, atividades, templates, quick replies,
 * canais, pipelines, board, contatos, agentes, status, etc.
 *
 * Cada funcao corresponde a uma linha das tabelas 2.1, 2.4, 2.5, 2.6
 * do contrato Fase 1.
 */

import { apiUrl } from "@/lib/api";
import { fetchTeamUsers } from "@/features/shared/queries/team-users";
import type { OperatorVariableMeta } from "@/lib/meta-whatsapp/operator-template-variables";

// ─────────────────────────────────────────────────────────────────
// Pipelines / Board (usados no dialog "Novo negocio" do /inbox)
// ─────────────────────────────────────────────────────────────────

export interface PipelineListItem {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface BoardStage {
  id: string;
  name: string;
  color?: string | null;
}

/** GET /api/pipelines */
export async function listPipelines(): Promise<PipelineListItem[]> {
  const res = await fetch(apiUrl("/api/pipelines"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar pipelines",
    );
  }
  return Array.isArray(data) ? data : data.pipelines ?? data.items ?? [];
}

/** GET /api/pipelines/:id/board?status=OPEN */
export async function getPipelineBoard(pipelineId: string): Promise<BoardStage[]> {
  const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/board?status=OPEN`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar estagios",
    );
  }
  return Array.isArray(data) ? data : data.stages ?? [];
}

// ─────────────────────────────────────────────────────────────────
// Permissoes / Capacidade / Agentes
// ─────────────────────────────────────────────────────────────────

/** GET /api/settings/permissions */
export async function getPermissions(): Promise<{ scopeGrants?: unknown }> {
  const res = await fetch(apiUrl("/api/settings/permissions"));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar permissoes",
    );
  }
  return data as { scopeGrants?: unknown };
}

export type AgentOnlineStatus = "ONLINE" | "OFFLINE" | "AWAY";

/** GET /api/agents/:userId/status */
export async function getAgentStatus(userId: string): Promise<{ status: AgentOnlineStatus }> {
  const res = await fetch(apiUrl(`/api/agents/${userId}/status`));
  return res.json() as Promise<{ status: AgentOnlineStatus }>;
}

/** POST /api/agents/:id/status */
export async function setAgentStatus(
  userId: string,
  status: AgentOnlineStatus,
): Promise<void> {
  const res = await fetch(apiUrl(`/api/agents/${userId}/status`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Falha ao atualizar status");
}

export interface AgentCapacity {
  activeConversations: number;
  maxConcurrent: number;
  loadPct: number;
  tone: "healthy" | "busy" | "overloaded";
}

/** GET /api/inbox/agent-capacity */
export async function getAgentCapacity(): Promise<AgentCapacity> {
  const res = await fetch(apiUrl("/api/inbox/agent-capacity"));
  if (!res.ok) throw new Error("Erro ao carregar capacidade");
  return res.json() as Promise<AgentCapacity>;
}

// ─────────────────────────────────────────────────────────────────
// Self-assign / Users
// ─────────────────────────────────────────────────────────────────

export interface SelfAssignResponse {
  settings: Record<string, boolean>;
  self: { role: string | null; canSelfAssign: boolean };
}

/** GET /api/settings/self-assign */
export async function getSelfAssignCapability(): Promise<SelfAssignResponse> {
  const res = await fetch(apiUrl("/api/settings/self-assign"));
  if (!res.ok) throw new Error("Erro ao carregar permissoes self-assign");
  return res.json() as Promise<SelfAssignResponse>;
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  /** HUMAN | AI — quando listado com includeAi. */
  type?: string | null;
  /** Foto de perfil (User.avatarUrl) — o backend já retorna em GET /api/users. */
  avatarUrl?: string | null;
  /**
   * Presença de USO do CRM ("aba aberta"). Distinta da disponibilidade
   * da Distribuição (que fica em outro DTO). Usada nos seletores e
   * filtros para indicar quem está com o CRM aberto agora.
   */
  systemOnline?: boolean;
  lastSeenAt?: string | null;
}

/** GET /api/users — delega no fetcher canônico (shape normalizado). */
export async function listUsers(opts?: {
  includeAi?: boolean;
}): Promise<TeamUser[]> {
  return fetchTeamUsers<TeamUser>(opts);
}

// ─────────────────────────────────────────────────────────────────
// Contato (sidebar direito)
// ─────────────────────────────────────────────────────────────────

/** Campo personalizado marcado como "exibir no painel do inbox". */
export interface InboxLeadPanelField {
  fieldId: string;
  name: string;
  label: string;
  type: string;
  options: string[];
  value: string | null;
  /** Regras de formatação condicional (JSON cru do backend). */
  highlightRules?: unknown[] | null;
  /** Highlight já resolvido pelo backend — use este em vez de re-resolver. */
  highlight?: { severity: string; label: string } | null;
}

export interface ContactDetail {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  /** @ do WhatsApp (Contact.whatsappUsername), quando o cliente adotou username. */
  whatsappUsername?: string | null;
  /** Origem do lead (Contact.source). */
  source?: string | null;
  /** Informação rastreada (UTM / click IDs / Meta CTWA). */
  adUtmSource?: string | null;
  adUtmMedium?: string | null;
  adUtmCampaign?: string | null;
  adUtmContent?: string | null;
  adUtmTerm?: string | null;
  utmId?: string | null;
  utmReferrer?: string | null;
  referrer?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  googleClientId?: string | null;
  ttadId?: string | null;
  ttadName?: string | null;
  adCtwaClid?: string | null;
  adSourceId?: string | null;
  adResolvedId?: string | null;
  adResolvedName?: string | null;
  adHeadline?: string | null;
  adResolvedAdsetName?: string | null;
  adResolvedCampaignName?: string | null;
  avatarUrl?: string | null;
  cpf?: string | null;
  rg?: string | null;
  cep?: string | null;
  addressNumber?: string | null;
  birthDate?: string | null;
  createdAt?: string | null;
  tags?: { id: string; name: string; color: string | null }[];
  notes?: string | null;
  deals?: {
    id: string;
    title: string;
    value: number;
    stageId: string;
    stageName?: string | null;
    /** Status do negocio: OPEN | WON | LOST. */
    status?: string | null;
    /** Motivo da perda (tabulacao) — preenchido quando status = LOST. */
    lostReason?: string | null;
    productName?: string | null;
    /** Campos personalizados do negocio: array de pares label → valor */
    customFields?: { fieldId: string; label: string; value: string | null }[];
    /** Numero de estagios no pipeline (para progress bar) */
    stageCount?: number;
    /** Indice 0-based do estagio atual no pipeline */
    stageIndex?: number;
  }[];
  /** Campos personalizados do contato */
  customFields?: { fieldId: string; label: string; value: string | null }[];
  activities?: {
    id: string;
    type: string;
    title: string;
    scheduledAt?: string | null;
    completedAt?: string | null;
  }[];
  /**
   * Campos do CONTATO marcados como "exibir no painel do inbox".
   * Retornados pelo backend em GET /api/contacts/:id.
   */
  inboxLeadPanelFields?: InboxLeadPanelField[];
  /**
   * Campos dos NEGOCIOS ativos marcados como "exibir no painel do inbox".
   * Chave = dealId; valor = array de campos daquele negocio.
   */
  dealInboxPanelFields?: Record<string, InboxLeadPanelField[]>;
}

/** GET /api/contacts/:id — `view=inbox` pula relations pesadas do aside. */
export async function getContact(contactId: string): Promise<ContactDetail> {
  const res = await fetch(apiUrl(`/api/contacts/${contactId}?view=inbox`));
  if (!res.ok) throw new Error("Erro ao carregar contato");
  return res.json() as Promise<ContactDetail>;
}

/** PATCH /api/contacts/:id */
export async function updateContact(
  contactId: string,
  patch: Partial<ContactDetail>,
): Promise<ContactDetail> {
  const res = await fetch(apiUrl(`/api/contacts/${contactId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao atualizar contato",
    );
  }
  return data as ContactDetail;
}

// ─────────────────────────────────────────────────────────────────
// Tags
// ─────────────────────────────────��───────────────────────────────

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

/** GET /api/tags */
export async function listTags(): Promise<Tag[]> {
  const res = await fetch(apiUrl("/api/tags"));
  if (!res.ok) throw new Error("Erro ao carregar tags");
  const data = await res.json();
  return Array.isArray(data) ? data : data.tags ?? [];
}

/** POST /api/tags */
export async function createTag(payload: {
  name: string;
  color?: string;
}): Promise<Tag> {
  const res = await fetch(apiUrl("/api/tags"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao criar tag",
    );
  }
  return data as Tag;
}

/**
 * Resposta do endpoint de tags da conversa. O backend aplica a tag nas
 * DUAS pontas (contato + deal OPEN do contato), então o retorno informa
 * onde a tag foi aplicada — útil para invalidar as queries do Kanban.
 */
export interface ConversationTagResult {
  ok: true;
  action: "add" | "remove";
  appliedToContact: boolean;
  appliedToDeal: string | null;
}

/**
 * POST /api/conversations/:id/tags — adiciona UMA tag à conversa.
 *
 * O contrato do backend é por tag (`{ tagId, action }`), não um array.
 * Como não existe `TagOnConversation`, o backend grava em `TagOnContact`
 * e replica no `TagOnDeal` do deal OPEN — por isso a tag aparece tanto
 * no inbox quanto no Kanban (sincronização nativa).
 */
export async function addConversationTag(
  conversationId: string,
  tagId: string,
): Promise<ConversationTagResult> {
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/tags`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagId, action: "add" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao adicionar tag",
    );
  }
  return data as ConversationTagResult;
}

/** DELETE /api/conversations/:id/tags — remove UMA tag (contato + deal). */
export async function removeConversationTag(
  conversationId: string,
  tagId: string,
): Promise<ConversationTagResult> {
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/tags`), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao remover tag",
    );
  }
  return data as ConversationTagResult;
}

// ─────────────────────────────────────────────────────────────────
// Quick replies / Templates / Channels
// ─────────────────────────────────────────────────────────────────

export interface QuickReply {
  id: string;
  shortcut: string;
  content: string;
}

/** GET /api/quick-replies */
export async function listQuickReplies(): Promise<QuickReply[]> {
  const res = await fetch(apiUrl("/api/quick-replies"));
  if (!res.ok) throw new Error("Erro ao carregar respostas rapidas");
  const data = await res.json();
  return Array.isArray(data) ? data : data.items ?? [];
}

export interface WhatsappTemplate {
  id: string;
  /** Nome de exibição (label > metaTemplateName), análogo ao slash-menu. */
  name: string;
  category?: string;
  body?: string;
  language?: string;
  /** Identificador na Graph (Cloud API) — necessário pra `sendTemplate`. */
  metaTemplateId?: string;
  /** Nome canônico WABA (vai para `templateName` no POST). */
  metaTemplateName?: string;
  hasButtons?: boolean;
  hasVariables?: boolean;
  /** Metadados das variáveis do corpo (rótulos/exemplos) para validação no envio. */
  operatorVariables?: OperatorVariableMeta[] | null;
}

/**
 * Shape bruto retornado pelo backend `/api/whatsapp-template-configs/agent-enabled`.
 * Mantemos privado pra que o frontend trabalhe sempre com `WhatsappTemplate`
 * normalizado — evita o bug histórico em que componentes consumiam `tpl.name`
 * (undefined) e renderizavam itens em branco.
 */
interface AgentEnabledTemplateRaw {
  id: string;
  metaTemplateId?: string;
  metaTemplateName?: string;
  label?: string;
  language?: string;
  category?: string | null;
  bodyPreview?: string;
  hasButtons?: boolean;
  hasVariables?: boolean;
  operatorVariables?: OperatorVariableMeta[] | null;
}

/** GET /api/whatsapp-template-configs/agent-enabled — opcional `channelId` (WABA do canal). */
export async function listAgentEnabledTemplates(
  channelId?: string | null,
): Promise<WhatsappTemplate[]> {
  const qs = channelId?.trim()
    ? `?channelId=${encodeURIComponent(channelId.trim())}`
    : "";
  const res = await fetch(apiUrl(`/api/whatsapp-template-configs/agent-enabled${qs}`));
  if (!res.ok) throw new Error("Erro ao carregar templates");
  const data = await res.json();
  const rows: AgentEnabledTemplateRaw[] = Array.isArray(data)
    ? data
    : (Array.isArray(data?.items) ? data.items : []);
  return rows.map((row) => ({
    id: row.id,
    name: (row.label && row.label.trim()) || row.metaTemplateName || "(sem nome)",
    metaTemplateId: row.metaTemplateId,
    metaTemplateName: row.metaTemplateName,
    body: row.bodyPreview ?? "",
    category: row.category ?? undefined,
    language: row.language,
    hasButtons: row.hasButtons,
    hasVariables: row.hasVariables,
    operatorVariables: Array.isArray(row.operatorVariables) ? row.operatorVariables : null,
  }));
}

export interface ChannelConfig {
  id: string;
  name: string;
  kind: string;
}

export interface InboxFilterChannel {
  id: string;
  name: string;
  type: string;
  status: string;
  phoneNumber: string | null;
  deleted: boolean;
}

/** GET /api/channels */
export async function listChannels(): Promise<ChannelConfig[]> {
  const res = await fetch(apiUrl("/api/channels"));
  if (!res.ok) throw new Error("Erro ao carregar canais");
  const data = await res.json();
  return Array.isArray(data) ? data : data.items ?? [];
}

/** GET /api/channels/inbox-filter — instâncias (inclui inativos e excluídos). */
export async function listInboxFilterChannels(): Promise<InboxFilterChannel[]> {
  const res = await fetch(apiUrl("/api/channels/inbox-filter"));
  if (!res.ok) throw new Error("Erro ao carregar canais");
  const data = (await res.json().catch(() => ({}))) as {
    channels?: InboxFilterChannel[];
  };
  return Array.isArray(data.channels) ? data.channels : [];
}

// ─────────────────────────────────────────────────────────────────
// Inbox stats
// ─────────────────────────────────────────────────────────────────

/** GET /api/inbox/daily-stats */
export async function getDailyStats(): Promise<{
  resolved: number;
  responded: number;
  pending: number;
  total: number;
}> {
  const res = await fetch(apiUrl("/api/inbox/daily-stats"));
  if (!res.ok) {
    return { resolved: 0, responded: 0, pending: 0, total: 0 };
  }
  return res.json();
}
