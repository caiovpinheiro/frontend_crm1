import type { ActivityListItemDto, ActivityListPage, FetchActivitiesParams } from "./api";

function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const USER = { id: "u-mock-1", name: "Ana Souza", email: "ana@example.com", avatarUrl: null };
const CREATOR = { id: "u-mock-2", name: "Bruno Lima", email: "bruno@example.com", avatarUrl: null };

const MOCK_ITEMS: ActivityListItemDto[] = [
  {
    id: "mock-act-1",
    type: "MEETING",
    title: "Demo técnica — Acme Ltda",
    description: "Apresentar módulo de distribuição e pipeline.",
    completed: false,
    scheduledAt: at(0, 10, 0),
    completedAt: null,
    createdAt: at(-2, 9, 0),
    user: USER,
    createdBy: CREATOR,
    contact: { id: "mock-ct-1", name: "Carlos Mendes", email: "carlos@example.com" },
    deal: { id: "mock-deal-1", title: "Plano Pro — Acme", stageId: "st-1" },
  },
  {
    id: "mock-act-2",
    type: "CALL",
    title: "Retorno pós-proposta",
    description: "Confirmar prazo de implantação.",
    completed: false,
    scheduledAt: at(0, 14, 30),
    completedAt: null,
    createdAt: at(-1, 11, 0),
    user: USER,
    createdBy: CREATOR,
    contact: { id: "mock-ct-2", name: "Marina Costa", email: "marina@example.com" },
    deal: null,
  },
  {
    id: "mock-act-3",
    type: "TASK",
    title: "Enviar contrato revisado",
    description: null,
    completed: false,
    scheduledAt: at(0, 16, 0),
    completedAt: null,
    createdAt: at(0, 8, 0),
    user: USER,
    createdBy: CREATOR,
    contact: null,
    deal: { id: "mock-deal-2", title: "Renovação — Beta Corp", stageId: "st-2" },
  },
  {
    id: "mock-act-4",
    type: "EMAIL",
    title: "Follow-up proposta Q2",
    description: "Incluir case de educação.",
    completed: true,
    scheduledAt: at(-1, 9, 0),
    completedAt: at(-1, 9, 15),
    createdAt: at(-3, 15, 0),
    user: USER,
    createdBy: CREATOR,
    contact: { id: "mock-ct-3", name: "Felipe Rocha", email: "felipe@example.com" },
    deal: null,
  },
  {
    id: "mock-act-5",
    type: "TASK",
    title: "Preparar material onboarding",
    description: "Checklist + vídeo de 3 min.",
    completed: false,
    scheduledAt: at(-1, 11, 0),
    completedAt: null,
    createdAt: at(-4, 10, 0),
    user: USER,
    createdBy: CREATOR,
    contact: null,
    deal: null,
  },
  {
    id: "mock-act-6",
    type: "MEETING",
    title: "Alinhamento com CS",
    description: "Revisar SLAs do cliente enterprise.",
    completed: false,
    scheduledAt: at(1, 9, 30),
    completedAt: null,
    createdAt: at(-1, 17, 0),
    user: USER,
    createdBy: CREATOR,
    contact: null,
    deal: { id: "mock-deal-3", title: "Enterprise — Delta", stageId: "st-3" },
  },
  {
    id: "mock-act-7",
    type: "CALL",
    title: "Qualificação inbound",
    description: "Lead do site — interesse em WhatsApp API.",
    completed: false,
    scheduledAt: at(2, 15, 0),
    completedAt: null,
    createdAt: at(0, 7, 30),
    user: USER,
    createdBy: CREATOR,
    contact: { id: "mock-ct-4", name: "Juliana Prado", email: "ju@example.com" },
    deal: null,
  },
  {
    id: "mock-act-8",
    type: "OTHER",
    title: "Webinar interno — novidades CRM",
    description: "Sala Teams, gravar para onboarding.",
    completed: false,
    scheduledAt: at(3, 11, 0),
    completedAt: null,
    createdAt: at(-2, 14, 0),
    user: USER,
    createdBy: CREATOR,
    contact: null,
    deal: null,
  },
  {
    id: "mock-act-9",
    type: "TASK",
    title: "Atualizar cadastro do lead",
    description: "Campos customizados pendentes.",
    completed: true,
    scheduledAt: at(-5, 10, 0),
    completedAt: at(-5, 10, 45),
    createdAt: at(-6, 9, 0),
    user: USER,
    createdBy: CREATOR,
    contact: { id: "mock-ct-5", name: "Roberto Lima", email: "roberto@example.com" },
    deal: null,
  },
  {
    id: "mock-act-10",
    type: "MEETING",
    title: "Kick-off implantação",
    description: "Participam TI + comercial do cliente.",
    completed: false,
    scheduledAt: at(5, 14, 0),
    completedAt: null,
    createdAt: at(-1, 12, 0),
    user: USER,
    createdBy: CREATOR,
    contact: { id: "mock-ct-1", name: "Carlos Mendes", email: "carlos@example.com" },
    deal: { id: "mock-deal-1", title: "Plano Pro — Acme", stageId: "st-1" },
  },
];

export function mockActivitiesPage(params: FetchActivitiesParams = {}): ActivityListPage {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  let items = [...MOCK_ITEMS];

  if (params.type) items = items.filter((a) => a.type === params.type);
  if (params.completed === true) items = items.filter((a) => a.completed);
  if (params.completed === false) items = items.filter((a) => !a.completed);
  if (params.dealId) items = items.filter((a) => a.deal?.id === params.dealId);
  if (params.contactId) items = items.filter((a) => a.contact?.id === params.contactId);

  const total = items.length;
  const start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    total,
    page,
    perPage,
  };
}

export const MOCK_ACTIVITIES_PAGE = mockActivitiesPage({ perPage: 200 });
