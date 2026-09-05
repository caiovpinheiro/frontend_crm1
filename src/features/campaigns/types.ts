/*
 * Tipos da área de Campanhas v2 (frontend). Espelham as respostas das rotas
 * /api/campaigns/* já existentes no backend. Mantidos copiados de propósito —
 * não compartilhamos types entre repositórios.
 */

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PROCESSING"
  | "SENDING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type CampaignType = "TEMPLATE" | "TEXT" | "AUTOMATION";

export type RecipientStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

export interface CampaignListItem {
  id: string;
  number?: number;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  readCount: number;
  repliedCount?: number;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  useLastConversationChannel?: boolean;
  channel?: { id: string; name: string; provider: string } | null;
  segment?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string };
}

export interface CampaignsListResponse {
  items: CampaignListItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface CampaignDetail extends CampaignListItem {
  templateName?: string | null;
  templateLanguage?: string | null;
  textContent?: string | null;
  sendRate: number;
  automation?: { id: string; name: string } | null;
  /** Filtros ad-hoc gravados na criação (inclui tagIds do disparo). */
  filters?: CampaignFilters | null;
  /** Tags resolvidas no backend (quando o GET já enriquece). */
  audienceTags?: { id: string; name: string }[];
}

export interface CampaignStats {
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  readCount: number;
  repliedCount: number;
  pendingCount: number;
  deliveryRate: number;
  readRate: number;
  replyRate: number;
  status: CampaignStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  failureReasons: {
    reason: string;
    count: number;
    code?: number | null;
    action?: string | null;
    kind?: "eligibility" | "operational";
  }[];
  /** Bloqueio da Meta (lista, opt-out, marketing) — não é falha do disparo. */
  eligibilityFailedCount?: number;
  /** Token, template, rate-limit, pagamento, etc. */
  operationalFailedCount?: number;
}

export interface CampaignRecipient {
  id: string;
  status: RecipientStatus;
  errorMessage?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  repliedAt?: string | null;
  contact: { id: string; name: string; phone: string | null };
}

export interface RecipientsResponse {
  items: CampaignRecipient[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/** Filtros de audiência aceitos por /api/campaigns/preview e createCampaign. */
export interface CampaignFilters {
  search?: string;
  lifecycleStage?: string;
  tagIds?: string[];
  assignedToId?: string;
  dealOwnerId?: string;
  pipelineId?: string;
  stageIds?: string[];
  dealStatus?: "OPEN" | "WON" | "LOST";
  createdAfter?: string;
  hasPhone?: boolean;
}

export interface PreviewResponse {
  count: number;
  sample: { id: string; name: string; phone: string }[];
}

export interface ChannelRow {
  id: string;
  name: string;
  type: string;
  provider: string;
  status: string;
}

export interface SegmentRow {
  id: string;
  name: string;
  filters: Record<string, unknown>;
}

export interface AutomationRow {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TemplateRow {
  id?: string;
  name: string;
  language: string;
  category?: string;
  status: string;
  /** Corpo aprovado na Meta (com `{{1}}` etc.). */
  bodyPreview?: string | null;
  /** Cabeçalho TEXT com placeholders, se houver. */
  headerPreview?: string | null;
  /** NONE | TEXT | IMAGE | VIDEO | DOCUMENT */
  headerFormat?: string | null;
  /** Mapeamento padrão variável → campo CRM (criação do template). */
  operatorVariables?: {
    key: string;
    label?: string;
    example?: string;
    crmField?: string;
  }[] | null;
}

/**
 * Payload gravado em `Campaign.templateComponents` (v1).
 * Tokens `{{dealCustomFields.x}}` são resolvidos por destinatário no worker.
 */
export interface CampaignTemplateComponentsPayload {
  version: 1;
  components?: unknown[];
  headerMediaUrl?: string | null;
  /** image | video | document — espelha headerFormat do template. */
  headerMediaType?: "image" | "video" | "document" | null;
}

export interface CreateCampaignBody {
  name: string;
  type: CampaignType;
  channelId?: string;
  useLastConversationChannel?: boolean;
  segmentId?: string;
  filters?: CampaignFilters;
  templateName?: string;
  templateLanguage?: string;
  /** Body/header com tokens CRM + opcional URL de mídia do header. */
  templateComponents?: CampaignTemplateComponentsPayload;
  textContent?: string;
  automationId?: string;
  sendRate?: number;
  scheduledAt?: string;
}

export type CampaignAction = "launch" | "pause" | "resume" | "cancel";
