import type { FetchCampaignsParams, FetchRecipientsParams } from "./api";
import type {
  CampaignAction,
  CampaignDetail,
  CampaignListItem,
  CampaignStats,
  CampaignStatus,
  CampaignsListResponse,
  ChannelRow,
  PreviewResponse,
  RecipientStatus,
  RecipientsResponse,
  SegmentRow,
  TemplateRow,
} from "./types";

const mockListeners = new Set<() => void>();

export function subscribeMockCampaigns(listener: () => void): () => void {
  mockListeners.add(listener);
  return () => {
    mockListeners.delete(listener);
  };
}

function bumpMockCampaigns() {
  mockListeners.forEach((listener) => listener());
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

const CHANNEL = {
  id: "ch-wa-main",
  name: "WhatsApp Principal",
  provider: "meta",
} as const;

const CREATOR = { id: "user-demo", name: "Marcelo Silva" };

const MOCK_ITEMS: CampaignListItem[] = [
  {
    id: "camp-1",
    name: "Black Friday 2025",
    type: "TEMPLATE",
    status: "COMPLETED",
    totalRecipients: 1240,
    sentCount: 1240,
    deliveredCount: 1198,
    failedCount: 42,
    readCount: 876,
    repliedCount: 214,
    scheduledAt: null,
    startedAt: daysAgo(45),
    completedAt: daysAgo(44),
    createdAt: daysAgo(46),
    channel: CHANNEL,
    segment: { id: "seg-1", name: "Clientes ativos" },
    createdBy: CREATOR,
  },
  {
    id: "camp-2",
    name: "Promoção Junho — 20% OFF",
    type: "TEMPLATE",
    status: "SENDING",
    totalRecipients: 580,
    sentCount: 312,
    deliveredCount: 305,
    failedCount: 7,
    readCount: 120,
    repliedCount: 22,
    scheduledAt: null,
    startedAt: "2026-08-24T13:20:08.000Z",
    completedAt: null,
    createdAt: "2026-08-24T13:20:00.000Z",
    channel: CHANNEL,
    segment: { id: "seg-2", name: "Leads quentes" },
    createdBy: CREATOR,
  },
  {
    id: "camp-3",
    name: "Lembrete de pagamento",
    type: "TEXT",
    status: "SCHEDULED",
    totalRecipients: 89,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    readCount: 0,
    repliedCount: 0,
    scheduledAt: hoursFromNow(18),
    startedAt: null,
    completedAt: null,
    createdAt: daysAgo(1),
    channel: CHANNEL,
    segment: { id: "seg-3", name: "Inadimplentes" },
    createdBy: CREATOR,
  },
  {
    id: "camp-4",
    name: "Reengajamento inativos",
    type: "TEXT",
    status: "DRAFT",
    totalRecipients: 0,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    readCount: 0,
    repliedCount: 0,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: daysAgo(2),
    channel: CHANNEL,
    segment: { id: "seg-4", name: "Sem interação 90d" },
    createdBy: CREATOR,
  },
  {
    id: "camp-5",
    name: "Oferta exclusiva VIP",
    type: "TEMPLATE",
    status: "PAUSED",
    totalRecipients: 320,
    sentCount: 145,
    deliveredCount: 140,
    failedCount: 5,
    readCount: 92,
    repliedCount: 18,
    scheduledAt: null,
    startedAt: daysAgo(5),
    completedAt: null,
    createdAt: daysAgo(6),
    channel: CHANNEL,
    segment: { id: "seg-5", name: "Lista VIP" },
    createdBy: CREATOR,
  },
  {
    id: "camp-6",
    name: "Disparo teste API",
    type: "TEMPLATE",
    status: "FAILED",
    totalRecipients: 50,
    sentCount: 12,
    deliveredCount: 0,
    failedCount: 12,
    readCount: 0,
    repliedCount: 0,
    scheduledAt: null,
    startedAt: daysAgo(8),
    completedAt: daysAgo(8),
    createdAt: daysAgo(9),
    channel: CHANNEL,
    segment: null,
    createdBy: CREATOR,
  },
  {
    id: "camp-7",
    name: "Pesquisa NPS — Q1 2026",
    type: "TEMPLATE",
    status: "COMPLETED",
    totalRecipients: 410,
    sentCount: 410,
    deliveredCount: 402,
    failedCount: 8,
    readCount: 356,
    repliedCount: 198,
    scheduledAt: null,
    startedAt: daysAgo(20),
    completedAt: daysAgo(19),
    createdAt: daysAgo(21),
    channel: CHANNEL,
    segment: { id: "seg-6", name: "Clientes pós-venda" },
    createdBy: CREATOR,
  },
  {
    id: "camp-8",
    name: "Boas-vindas novos leads",
    type: "AUTOMATION",
    status: "PROCESSING",
    totalRecipients: 156,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    readCount: 0,
    repliedCount: 0,
    scheduledAt: null,
    startedAt: hoursAgo(0.5),
    completedAt: null,
    createdAt: daysAgo(0),
    channel: CHANNEL,
    segment: { id: "seg-7", name: "Novos contatos" },
    createdBy: CREATOR,
  },
];

const MOCK_DETAILS: Record<string, CampaignDetail> = Object.fromEntries(
  MOCK_ITEMS.map((item) => [
    item.id,
    {
      ...item,
      templateName:
        item.type === "TEMPLATE"
          ? item.id === "camp-1"
            ? "black_friday_2025"
            : item.id === "camp-7"
              ? "nps_survey_q1"
              : "promo_junho_20"
          : null,
      templateLanguage: item.type === "TEMPLATE" ? "pt_BR" : null,
      textContent:
        item.type === "TEXT"
          ? "Olá {{nome}}, seu boleto vence amanhã. Responda SIM para receber o link de pagamento."
          : null,
      sendRate: item.id === "camp-2" ? 15 : item.status === "SENDING" ? 30 : 50,
      automation:
        item.type === "AUTOMATION"
          ? { id: "auto-2", name: "Agente IA" }
          : null,
      audienceTags:
        item.id === "camp-2"
          ? [{ id: "tag-promo", name: "promo_junho" }]
          : undefined,
    },
  ]),
);

const RECIPIENT_NAMES = [
  { name: "Ana Paula Costa", phone: "+5511987654321" },
  { name: "Bruno Mendes", phone: "+5511976543210" },
  { name: "Carla Oliveira", phone: "+5511965432109" },
  { name: "Diego Ferreira", phone: "+5511954321098" },
  { name: "Elena Santos", phone: "+5511943210987" },
  { name: "Felipe Rocha", phone: "+5511932109876" },
  { name: "Gabriela Lima", phone: "+5511921098765" },
  { name: "Henrique Alves", phone: "+5511910987654" },
  { name: "Isabela Nunes", phone: "+5511909876543" },
  { name: "João Pedro Silva", phone: "+5511998765432" },
];

function buildStats(item: CampaignListItem): CampaignStats {
  const pending = Math.max(0, item.totalRecipients - item.sentCount);
  const deliveryRate =
    item.sentCount > 0
      ? Math.round((item.deliveredCount / item.sentCount) * 1000) / 10
      : 0;
  const readRate =
    item.deliveredCount > 0
      ? Math.round((item.readCount / item.deliveredCount) * 1000) / 10
      : 0;
  const replyRate =
    item.readCount > 0
      ? Math.round(((item.repliedCount ?? 0) / item.readCount) * 1000) / 10
      : 0;

  const failureReasons =
    item.failedCount > 0
      ? [
          { reason: "Número inválido ou inexistente", count: Math.ceil(item.failedCount * 0.55) },
          { reason: "Usuário bloqueou o negócio", count: Math.ceil(item.failedCount * 0.3) },
          { reason: "Limite de taxa da Meta", count: Math.max(1, item.failedCount - Math.ceil(item.failedCount * 0.85)) },
        ].filter((r) => r.count > 0)
      : [];

  return {
    totalRecipients: item.totalRecipients,
    sentCount: item.sentCount,
    deliveredCount: item.deliveredCount,
    failedCount: item.failedCount,
    readCount: item.readCount,
    repliedCount: item.repliedCount ?? 0,
    pendingCount: pending,
    deliveryRate,
    readRate,
    replyRate,
    status: item.status,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    failureReasons,
  };
}

function recipientStatusForIndex(
  index: number,
  campaign: CampaignListItem,
): RecipientStatus {
  if (campaign.status === "DRAFT" || campaign.status === "SCHEDULED") return "PENDING";
  const statuses = ["DELIVERED", "READ", "SENT", "FAILED", "PENDING"] as const;
  const weights = [0.35, 0.25, 0.2, 0.1, 0.1];
  const r = (index * 17 + campaign.sentCount) % 100;
  let acc = 0;
  for (let i = 0; i < statuses.length; i++) {
    acc += weights[i]! * 100;
    if (r < acc) return statuses[i]!;
  }
  return "DELIVERED";
}

export function mockCampaignsPage(
  params: FetchCampaignsParams = {},
): CampaignsListResponse {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  let items = [...MOCK_ITEMS];

  if (params.status) items = items.filter((c) => c.status === params.status);
  if (params.type) items = items.filter((c) => c.type === params.type);

  const q = params.search?.trim().toLowerCase();
  if (q) {
    items = items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.segment?.name ?? "").toLowerCase().includes(q),
    );
  }

  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;

  return {
    items: items.slice(start, start + perPage),
    total,
    page,
    perPage,
    totalPages,
  };
}

export const MOCK_CAMPAIGNS_PAGE = mockCampaignsPage({ perPage: 200 });

const CANCELLABLE: CampaignStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "PROCESSING",
  "SENDING",
  "PAUSED",
];

export function mockRunCampaignAction(
  id: string,
  action: CampaignAction,
): { message: string; status: string } {
  const item = MOCK_ITEMS.find((c) => c.id === id);
  if (!item) throw new Error("Campanha não encontrada.");
  const detail = MOCK_DETAILS[id];

  const apply = (status: CampaignStatus) => {
    item.status = status;
    if (detail) detail.status = status;
    bumpMockCampaigns();
  };

  switch (action) {
    case "pause":
      if (item.status !== "SENDING" && item.status !== "PROCESSING") {
        throw new Error("Apenas campanhas em envio podem ser pausadas.");
      }
      apply("PAUSED");
      return { message: "Campanha pausada.", status: "PAUSED" };
    case "resume":
      if (item.status !== "PAUSED") {
        throw new Error("Apenas campanhas pausadas podem ser retomadas.");
      }
      apply("SENDING");
      return { message: "Campanha retomada.", status: "SENDING" };
    case "cancel":
      if (!CANCELLABLE.includes(item.status)) {
        throw new Error("Esta campanha não pode ser encerrada.");
      }
      apply("FAILED");
      return { message: "Campanha encerrada.", status: "CANCELLED" };
    case "launch":
      if (item.status !== "DRAFT") {
        throw new Error("Apenas campanhas em rascunho podem ser lançadas.");
      }
      apply(item.scheduledAt ? "SCHEDULED" : "PROCESSING");
      return {
        message: "Campanha lançada.",
        status: item.scheduledAt ? "SCHEDULED" : "PROCESSING",
      };
    default:
      throw new Error("Ação inválida.");
  }
}

export function mockCampaignDetail(id: string): CampaignDetail | null {
  return MOCK_DETAILS[id] ?? null;
}

export function mockCampaignStats(id: string): CampaignStats | null {
  const item = MOCK_ITEMS.find((c) => c.id === id);
  return item ? buildStats(item) : null;
}

export function mockCampaignRecipients(
  id: string,
  params: FetchRecipientsParams = {},
): RecipientsResponse | null {
  const campaign = MOCK_ITEMS.find((c) => c.id === id);
  if (!campaign || campaign.totalRecipients === 0) {
    return { items: [], total: 0, page: 1, perPage: 20, totalPages: 0 };
  }

  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  const total = Math.min(campaign.totalRecipients, 48);

  let items = Array.from({ length: total }, (_, i) => {
    const person = RECIPIENT_NAMES[i % RECIPIENT_NAMES.length]!;
    const status = recipientStatusForIndex(i, campaign);
    const sentAt = campaign.sentCount > 0 ? hoursAgo(24 - (i % 20)) : null;
    return {
      id: `rec-${id}-${i + 1}`,
      status,
      errorMessage: status === "FAILED" ? "Número inválido ou inexistente" : null,
      sentAt,
      deliveredAt: ["DELIVERED", "READ"].includes(status) ? sentAt : null,
      readAt: status === "READ" ? hoursAgo(12 - (i % 8)) : null,
      repliedAt: status === "READ" && i % 3 === 0 ? hoursAgo(6) : null,
      contact: {
        id: `contact-${i + 1}`,
        name: person.name,
        phone: person.phone,
      },
    };
  });

  if (params.status) items = items.filter((r) => r.status === params.status);

  const filteredTotal = items.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / perPage));
  const start = (page - 1) * perPage;

  return {
    items: items.slice(start, start + perPage),
    total: filteredTotal,
    page,
    perPage,
    totalPages,
  };
}

export const MOCK_CHANNELS: ChannelRow[] = [
  {
    id: CHANNEL.id,
    name: CHANNEL.name,
    type: "whatsapp",
    provider: "meta",
    status: "CONNECTED",
  },
  {
    id: "ch-wa-vendas",
    name: "WhatsApp Vendas",
    type: "whatsapp",
    provider: "meta",
    status: "CONNECTED",
  },
];

export const MOCK_SEGMENTS: SegmentRow[] = [
  { id: "seg-1", name: "Clientes ativos", filters: { lifecycleStage: "CUSTOMER" } },
  { id: "seg-2", name: "Leads quentes", filters: { dealStatus: "OPEN" } },
  { id: "seg-3", name: "Inadimplentes", filters: { tagIds: ["tag-inadimplente"] } },
  { id: "seg-4", name: "Sem interação 90d", filters: { createdAfter: daysAgo(90) } },
  { id: "seg-5", name: "Lista VIP", filters: { tagIds: ["tag-vip"] } },
];

export const MOCK_TEMPLATES: TemplateRow[] = [
  { name: "black_friday_2025", language: "pt_BR", category: "MARKETING", status: "APPROVED" },
  { name: "promo_junho_20", language: "pt_BR", category: "MARKETING", status: "APPROVED" },
  { name: "nps_survey_q1", language: "pt_BR", category: "UTILITY", status: "APPROVED" },
  { name: "payment_reminder", language: "pt_BR", category: "UTILITY", status: "APPROVED" },
];

export const MOCK_AUDIENCE_PREVIEW: PreviewResponse = {
  count: 1247,
  sample: RECIPIENT_NAMES.slice(0, 5).map((p, i) => ({
    id: `contact-preview-${i + 1}`,
    name: p.name,
    phone: p.phone,
  })),
};

export const MOCK_AUDIENCE_OPTIONS = {
  tags: [
    { id: "tag-vip", name: "VIP", color: "#f59e0b" },
    { id: "tag-inadimplente", name: "Inadimplente", color: "#ef4444" },
    { id: "tag-novo", name: "Novo lead", color: "#22c55e" },
  ],
  pipelines: [
    {
      id: "pipe-1",
      name: "Vendas",
      stages: [
        { id: "st-1", name: "Novo" },
        { id: "st-2", name: "Qualificação" },
        { id: "st-3", name: "Proposta" },
      ],
    },
  ],
  users: [
    { id: "user-demo", name: "Marcelo Silva" },
    { id: "user-2", name: "Ana Costa" },
  ],
};
