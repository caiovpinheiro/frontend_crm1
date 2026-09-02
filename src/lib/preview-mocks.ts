/**
 * PREVIEW MOCKS — catálogo de respostas fake para sandbox do v0.dev.
 *
 * Usado pelo `PreviewMocksInstaller` que faz monkey patch em `window.fetch`
 * quando `NEXT_PUBLIC_PREVIEW_MODE=true`. Cada handler retorna o shape
 * exato esperado pelos `features/*-v2/api/*`.
 *
 * Cobertura completa:
 *  - /api/auth/session, /api/users/me, /api/users, /api/organizations
 *  - /api/conversations  (lista + counts + mensagens c/ todos os messageType)
 *  - /api/contacts, /api/companies, /api/activities
 *  - /api/pipelines, /api/stages, /api/deals, /api/board
 *  - /api/automations, /api/automations/:id
 *  - /api/analytics/deals-overview, /api/analytics/service-overview
 *  - /api/tags, /api/channels, /api/quick-replies, /api/whatsapp-template-configs
 *  - /api/inbox/agent-capacity, /api/inbox/daily-stats
 *  - /api/settings/self-assign, /api/settings/permissions, /api/settings/departments
 *  - /api/demands/boards, /api/demands/items (inclui DELETE)
 *  - /api/agents/:id/status
 *  - Fallback GET → { items: [], total: 0 }; Fallback mutation → { ok: true }
 */

type MockHandler = (url: URL, init?: RequestInit) => unknown;

/* ═══════════════════════════════════════════════════════════════════
   FIXTURES COMPARTILHADOS
══════════════════════════════════════════════════════════════════ */

const USER = {
  id: "u-marcelo",
  name: "Marcelo Santos",
  email: "marcelo@eduit.com.br",
  image: null,
  role: "OWNER" as const,
  organizationId: "preview-org",
  isSuperAdmin: false,
};

const AGENTS = [
  { id: "u-marcelo",  name: "Marcelo Santos",  email: "marcelo@eduit.com.br",  avatarUrl: null, role: "OWNER",  status: "ONLINE" },
  { id: "u-juliana",  name: "Juliana Costa",   email: "juliana@eduit.com.br",  avatarUrl: null, role: "AGENT",  status: "ONLINE" },
  { id: "u-rafael",   name: "Rafael Almeida",  email: "rafael@eduit.com.br",   avatarUrl: null, role: "AGENT",  status: "AWAY"   },
  { id: "u-camila",   name: "Camila Souza",    email: "camila@eduit.com.br",   avatarUrl: null, role: "AGENT",  status: "OFFLINE" },
];

const ORG = {
  id: "preview-org",
  name: "Bwipo",
  slug: "eduit",
  plan: "PRO",
  logoUrl: null,
};

/* ── Tags ── */
const TAGS = [
  { id: "tag-1", name: "Quente",     color: "#ef4444" },
  { id: "tag-2", name: "VIP",        color: "#a855f7" },
  { id: "tag-3", name: "Novo lead",  color: "#3b82f6" },
  { id: "tag-4", name: "Reativar",   color: "#f59e0b" },
  { id: "tag-5", name: "Suporte",    color: "#06b6d4" },
  { id: "tag-6", name: "Parceiro",   color: "#10b981" },
];

/* ── Empresas ── */
const COMPANIES = [
  { id: "co-1", name: "Acme Tech",           domain: "acme.com",          industry: "Software",     size: "51-200",  phone: "+5511999990001", email: "contato@acme.com",          address: "Av. Paulista, 1000 — São Paulo, SP",         cnpj: "12.345.678/0001-90", website: "https://acme.com",          createdAt: "2026-04-12T10:00:00Z", _count: { contacts: 14 } },
  { id: "co-2", name: "Globex Logistics",    domain: "globex.com.br",     industry: "Logística",    size: "201-500", phone: "+5511999990002", email: "comercial@globex.com.br",   address: "Rod. Anhanguera, km 23 — Campinas, SP",     cnpj: "98.765.432/0001-10", website: "https://globex.com.br",     createdAt: "2026-03-28T10:00:00Z", _count: { contacts: 8  } },
  { id: "co-3", name: "Initech Consultoria", domain: "initech.com",       industry: "Consultoria",  size: "11-50",   phone: "+5511999990003", email: "hello@initech.com",         address: "R. Augusta, 500 — São Paulo, SP",           cnpj: "11.222.333/0001-44", website: "https://initech.com",       createdAt: "2026-05-05T10:00:00Z", _count: { contacts: 5  } },
  { id: "co-4", name: "Umbrella Saúde",      domain: "umbrella.health",   industry: "Saúde",        size: "1000+",   phone: "+5521999990004", email: "parceiros@umbrella.health", address: "Av. Atlântica, 200 — Rio de Janeiro, RJ",   cnpj: "55.666.777/0001-88", website: "https://umbrella.health",   createdAt: "2026-02-14T10:00:00Z", _count: { contacts: 22 } },
  { id: "co-5", name: "Pied Piper",          domain: "piedpiper.com",     industry: "Software",     size: "1-10",    phone: "+5511999990005", email: "hi@piedpiper.com",          address: "R. da Consolação, 1500 — São Paulo, SP",   cnpj: "22.333.444/0001-55", website: "https://piedpiper.com",     createdAt: "2026-05-20T10:00:00Z", _count: { contacts: 3  } },
  { id: "co-6", name: "Stellar Educação",    domain: "stellar.edu.br",    industry: "Educação",     size: "51-200",  phone: "+5531999990006", email: "contato@stellar.edu.br",    address: "R. dos Inconfidentes, 800 — Belo Horizonte, MG", cnpj: "33.444.555/0001-66", website: "https://stellar.edu.br",   createdAt: "2026-01-10T10:00:00Z", _count: { contacts: 17 } },
];

/* ── Contatos ── */
const CONTACTS = [
  {
    id: "ct-1", name: "Ana Beatriz Costa",  email: "ana@acme.com",          phone: "+5511988880001", avatarUrl: null,
    leadScore: 87, lifecycleStage: "QUALIFIED", cpf: "123.456.789-00", rg: "12.345.678-9", cep: "01310-100", addressNumber: "1000",
    birthDate: "1991-03-15", notes: "Tomadora de decisão. Quer demo técnica com o time de TI antes de fechar.",
    createdAt: "2026-05-25T14:00:00Z",
    company: { id: "co-1", name: "Acme Tech", domain: "acme.com" },
    tags: [TAGS[0], TAGS[1]],
    deals: [{ id: "dl-1", title: "Implantação CRM Acme", value: 48000, stageId: "st-3", stageName: "Proposta", productName: "CRM Pro" }],
    activities: [{ id: "ac-1", type: "CALL", title: "Follow-up Acme", scheduledAt: "2026-06-02T15:00:00Z", completedAt: null }],
  },
  {
    id: "ct-2", name: "Bruno Lima",         email: "bruno@globex.com.br",   phone: "+5511988880002", avatarUrl: null,
    leadScore: 65, lifecycleStage: "LEAD", cpf: "234.567.890-11", rg: null, cep: "13010-050", addressNumber: "23",
    birthDate: "1986-07-22", notes: "Responsável por compras. Quer reduzir custo de frete.",
    createdAt: "2026-05-22T11:30:00Z",
    company: { id: "co-2", name: "Globex Logistics", domain: "globex.com.br" },
    tags: [TAGS[2]],
    deals: [{ id: "dl-2", title: "Renovação anual Globex", value: 120000, stageId: "st-4", stageName: "Negociação", productName: "ERP Lite" }],
    activities: [{ id: "ac-2", type: "MEETING", title: "Reunião kickoff Globex", scheduledAt: "2026-06-03T10:00:00Z", completedAt: null }],
  },
  {
    id: "ct-3", name: "Camila Rodrigues",   email: "camila@initech.com",    phone: "+5511988880003", avatarUrl: null,
    leadScore: 42, lifecycleStage: "LEAD", cpf: null, rg: null, cep: "01305-000", addressNumber: "500",
    birthDate: "1994-11-30", notes: null,
    createdAt: "2026-05-18T09:15:00Z",
    company: { id: "co-3", name: "Initech Consultoria", domain: "initech.com" },
    tags: [TAGS[3]],
    deals: [{ id: "dl-3", title: "Consultoria Initech Q3", value: 32000, stageId: "st-2", stageName: "Qualificado", productName: "Consultoria" }],
    activities: [{ id: "ac-3", type: "TASK", title: "Preparar proposta Initech", scheduledAt: "2026-06-01T18:00:00Z", completedAt: null }],
  },
  {
    id: "ct-4", name: "Diego Almeida",      email: "diego@umbrella.health", phone: "+5521988880004", avatarUrl: null,
    leadScore: 91, lifecycleStage: "CUSTOMER", cpf: "456.789.012-33", rg: "34.567.890-1", cep: "22010-000", addressNumber: "200",
    birthDate: "1980-02-10", notes: "Cliente desde 2024. Alto potencial de upsell para plano Enterprise.",
    createdAt: "2026-04-30T16:45:00Z",
    company: { id: "co-4", name: "Umbrella Saúde", domain: "umbrella.health" },
    tags: [TAGS[1]],
    deals: [{ id: "dl-4", title: "Upsell Umbrella Premium", value: 95000, stageId: "st-4", stageName: "Negociação", productName: "Enterprise" }],
    activities: [{ id: "ac-4", type: "EMAIL", title: "Enviar contrato Umbrella", scheduledAt: "2026-05-30T14:00:00Z", completedAt: "2026-05-30T14:30:00Z" }],
  },
  {
    id: "ct-5", name: "Eduarda Silva",      email: "eduarda@piedpiper.com", phone: "+5511988880005", avatarUrl: null,
    leadScore: 73, lifecycleStage: "QUALIFIED", cpf: null, rg: null, cep: "01308-200", addressNumber: "1500",
    birthDate: "1998-05-05", notes: "Startup em estágio inicial. Interesse em plano de entrada.",
    createdAt: "2026-05-28T08:00:00Z",
    company: { id: "co-5", name: "Pied Piper", domain: "piedpiper.com" },
    tags: [TAGS[0]],
    deals: [{ id: "dl-5", title: "Trial Pied Piper", value: 12000, stageId: "st-1", stageName: "Novo lead", productName: "Starter" }],
    activities: [],
  },
  {
    id: "ct-6", name: "Felipe Martins",     email: "felipe@acme.com",       phone: "+5511988880006", avatarUrl: null,
    leadScore: 58, lifecycleStage: "LEAD", cpf: null, rg: null, cep: "01310-100", addressNumber: "1000",
    birthDate: "1992-09-18", notes: null,
    createdAt: "2026-05-15T13:20:00Z",
    company: { id: "co-1", name: "Acme Tech", domain: "acme.com" },
    tags: [],
    deals: [{ id: "dl-6", title: "Acme — módulo extra", value: 18500, stageId: "st-5", stageName: "Ganho", productName: "Add-on" }],
    activities: [],
  },
  {
    id: "ct-7", name: "Gabriela Sousa",     email: "gabi@globex.com.br",    phone: "+5511988880007", avatarUrl: null,
    leadScore: 80, lifecycleStage: "CUSTOMER", cpf: "678.901.234-55", rg: null, cep: "13015-000", addressNumber: "89",
    birthDate: "1989-12-03", notes: "Renovou o contrato no mês passado. Satisfação alta.",
    createdAt: "2026-04-10T10:00:00Z",
    company: { id: "co-2", name: "Globex Logistics", domain: "globex.com.br" },
    tags: [TAGS[1], TAGS[3]],
    deals: [{ id: "dl-7", title: "Renovação Globex 2026", value: 85000, stageId: "st-5", stageName: "Ganho", productName: "ERP Lite" }],
    activities: [],
  },
  {
    id: "ct-8", name: "Henrique Pereira",   email: null,                    phone: "+5511988880008", avatarUrl: null,
    leadScore: null, lifecycleStage: null, cpf: null, rg: null, cep: null, addressNumber: null,
    birthDate: null, notes: null,
    createdAt: "2026-05-30T17:00:00Z",
    company: null,
    tags: [],
    deals: [],
    activities: [],
  },
  {
    id: "ct-9", name: "Isabela Ferreira",   email: "isabela@stellar.edu.br", phone: "+5531988880009", avatarUrl: null,
    leadScore: 68, lifecycleStage: "QUALIFIED", cpf: "789.012.345-66", rg: null, cep: "30140-010", addressNumber: "800",
    birthDate: "1995-04-20", notes: "Responsável pela área pedagógica. Interesse em módulo de LMS.",
    createdAt: "2026-05-10T08:30:00Z",
    company: { id: "co-6", name: "Stellar Educação", domain: "stellar.edu.br" },
    tags: [TAGS[2], TAGS[5]],
    deals: [{ id: "dl-8", title: "LMS Stellar Educação", value: 67000, stageId: "st-3", stageName: "Proposta", productName: "LMS Pro" }],
    activities: [{ id: "ac-5", type: "MEETING", title: "Demo LMS Stellar", scheduledAt: "2026-06-04T14:00:00Z", completedAt: null }],
  },
  {
    id: "ct-10", name: "João Victor Nunes",  email: "joao@acme.com",          phone: "+5511988880010", avatarUrl: null,
    leadScore: 52, lifecycleStage: "LEAD", cpf: null, rg: null, cep: "01310-100", addressNumber: "1000",
    birthDate: "1997-08-12", notes: null,
    createdAt: "2026-05-31T10:00:00Z",
    company: { id: "co-1", name: "Acme Tech", domain: "acme.com" },
    tags: [TAGS[3]],
    deals: [],
    activities: [],
  },
];

/* ── Canais ── */
const CHANNELS = [
  { id: "ch-1", name: "WhatsApp Vendas",    provider: "WHATSAPP_META", kind: "whatsapp",  isActive: true,  phone: "+5511900000001" },
  { id: "ch-2", name: "WhatsApp Suporte",   provider: "WHATSAPP_META", kind: "whatsapp",  isActive: true,  phone: "+5511900000002" },
  { id: "ch-3", name: "Instagram DMs",      provider: "INSTAGRAM",     kind: "instagram", isActive: true,  phone: null             },
  { id: "ch-4", name: "Chat do Site",       provider: "WEBCHAT",       kind: "webchat",   isActive: false, phone: null             },
];

/* ── Stages / Pipelines ── */
const STAGES = [
  { id: "st-1", name: "Novo lead",   color: "#3b82f6", order: 1 },
  { id: "st-2", name: "Qualificado", color: "#8b5cf6", order: 2 },
  { id: "st-3", name: "Proposta",    color: "#f59e0b", order: 3 },
  { id: "st-4", name: "Negociação",  color: "#10b981", order: 4 },
  { id: "st-5", name: "Ganho",       color: "#22c55e", order: 5 },
  { id: "st-6", name: "Perdido",     color: "#ef4444", order: 6 },
];

const PIPELINES = [
  { id: "pl-1", name: "Pipeline Padrão", isDefault: true },
  { id: "pl-2", name: "Renovações",      isDefault: false },
];

/* ── Deals ── */
const DEALS = [
  { id: "dl-1", title: "Implantação CRM Acme",      value: 48000,  stageId: "st-3", ownerId: "u-marcelo",  contactId: "ct-1",  companyId: "co-1", probability: 60,  expectedClose: "2026-06-15", tags: [TAGS[0]], updatedAt: "2026-05-30T10:00:00Z", lostReason: null },
  { id: "dl-2", title: "Renovação anual Globex",    value: 120000, stageId: "st-4", ownerId: "u-juliana",  contactId: "ct-2",  companyId: "co-2", probability: 85,  expectedClose: "2026-06-08", tags: [TAGS[1]], updatedAt: "2026-05-31T09:00:00Z", lostReason: null },
  { id: "dl-3", title: "Consultoria Initech Q3",    value: 32000,  stageId: "st-2", ownerId: "u-marcelo",  contactId: "ct-3",  companyId: "co-3", probability: 40,  expectedClose: "2026-07-20", tags: [TAGS[2]], updatedAt: "2026-05-28T14:00:00Z", lostReason: null },
  { id: "dl-4", title: "Upsell Umbrella Premium",   value: 95000,  stageId: "st-4", ownerId: "u-rafael",   contactId: "ct-4",  companyId: "co-4", probability: 75,  expectedClose: "2026-06-30", tags: [TAGS[1]], updatedAt: "2026-05-29T16:00:00Z", lostReason: null },
  { id: "dl-5", title: "Trial Pied Piper",          value: 12000,  stageId: "st-1", ownerId: "u-camila",   contactId: "ct-5",  companyId: "co-5", probability: 20,  expectedClose: "2026-08-10", tags: [TAGS[2]], updatedAt: "2026-05-25T11:00:00Z", lostReason: null },
  { id: "dl-6", title: "Acme — módulo extra",       value: 18500,  stageId: "st-5", ownerId: "u-marcelo",  contactId: "ct-6",  companyId: "co-1", probability: 100, expectedClose: "2026-05-15", tags: [], updatedAt: "2026-05-15T17:00:00Z", lostReason: null },
  { id: "dl-7", title: "Renovação Globex 2026",     value: 85000,  stageId: "st-5", ownerId: "u-juliana",  contactId: "ct-7",  companyId: "co-2", probability: 100, expectedClose: "2026-05-01", tags: [TAGS[1]], updatedAt: "2026-05-01T12:00:00Z", lostReason: null },
  { id: "dl-8", title: "LMS Stellar Educação",      value: 67000,  stageId: "st-3", ownerId: "u-rafael",   contactId: "ct-9",  companyId: "co-6", probability: 55,  expectedClose: "2026-07-05", tags: [TAGS[5]], updatedAt: "2026-05-27T09:00:00Z", lostReason: null },
  { id: "dl-9", title: "CRM Initech (perdido)",     value: 25000,  stageId: "st-6", ownerId: "u-marcelo",  contactId: "ct-3",  companyId: "co-3", probability: 0,   expectedClose: "2026-05-20", tags: [], updatedAt: "2026-05-20T11:00:00Z", lostReason: "Preço acima do orçamento" },
];

/* ── Atividades ── */
const ACTIVITIES = [
  { id: "ac-1", type: "CALL",    title: "Follow-up Acme",            description: "Ligar pra Ana Beatriz após envio da proposta", completed: false, scheduledAt: "2026-06-02T15:00:00Z", completedAt: null,                   createdAt: "2026-05-31T10:00:00Z", user: { id: "u-marcelo", name: "Marcelo Santos", email: "marcelo@eduit.com.br", avatarUrl: null }, contact: { id: "ct-1", name: "Ana Beatriz Costa",  email: "ana@acme.com"         }, deal: { id: "dl-1", title: "Implantação CRM Acme",     stageId: "st-3" } },
  { id: "ac-2", type: "MEETING", title: "Reunião kickoff Globex",    description: "Apresentação do time + cronograma",            completed: false, scheduledAt: "2026-06-03T10:00:00Z", completedAt: null,                   createdAt: "2026-05-30T12:00:00Z", user: { id: "u-juliana", name: "Juliana Costa",   email: "juliana@eduit.com.br", avatarUrl: null }, contact: { id: "ct-2", name: "Bruno Lima",           email: "bruno@globex.com.br"  }, deal: { id: "dl-2", title: "Renovação anual Globex",   stageId: "st-4" } },
  { id: "ac-3", type: "TASK",    title: "Preparar proposta Initech", description: null,                                           completed: false, scheduledAt: "2026-06-01T18:00:00Z", completedAt: null,                   createdAt: "2026-05-29T09:00:00Z", user: { id: "u-marcelo", name: "Marcelo Santos", email: "marcelo@eduit.com.br", avatarUrl: null }, contact: { id: "ct-3", name: "Camila Rodrigues",     email: "camila@initech.com"   }, deal: { id: "dl-3", title: "Consultoria Initech Q3",   stageId: "st-2" } },
  { id: "ac-4", type: "EMAIL",   title: "Enviar contrato Umbrella",  description: "Anexar contrato + termo aditivo",              completed: true,  scheduledAt: "2026-05-30T14:00:00Z", completedAt: "2026-05-30T14:30:00Z", createdAt: "2026-05-29T10:00:00Z", user: { id: "u-rafael",  name: "Rafael Almeida",  email: "rafael@eduit.com.br",  avatarUrl: null }, contact: { id: "ct-4", name: "Diego Almeida",        email: "diego@umbrella.health" }, deal: { id: "dl-4", title: "Upsell Umbrella Premium",  stageId: "st-4" } },
  { id: "ac-5", type: "MEETING", title: "Demo LMS Stellar",         description: "Demo do módulo LMS para equipe pedagógica",    completed: false, scheduledAt: "2026-06-04T14:00:00Z", completedAt: null,                   createdAt: "2026-05-28T08:00:00Z", user: { id: "u-camila",  name: "Camila Souza",    email: "camila@eduit.com.br",  avatarUrl: null }, contact: { id: "ct-9", name: "Isabela Ferreira",      email: "isabela@stellar.edu.br" }, deal: { id: "dl-8", title: "LMS Stellar Educação",     stageId: "st-3" } },
  { id: "ac-6", type: "CALL",    title: "Qualificar Pied Piper",     description: "Confirmar budget e prazo de decisão",          completed: true,  scheduledAt: "2026-05-27T11:00:00Z", completedAt: "2026-05-27T11:22:00Z", createdAt: "2026-05-26T14:00:00Z", user: { id: "u-marcelo", name: "Marcelo Santos", email: "marcelo@eduit.com.br", avatarUrl: null }, contact: { id: "ct-5", name: "Eduarda Silva",         email: "eduarda@piedpiper.com" }, deal: { id: "dl-5", title: "Trial Pied Piper",           stageId: "st-1" } },
  { id: "ac-7", type: "TASK",    title: "Onboarding João Victor",    description: null,                                           completed: false, scheduledAt: "2026-06-05T09:00:00Z", completedAt: null,                   createdAt: "2026-05-31T10:00:00Z", user: { id: "u-juliana", name: "Juliana Costa",   email: "juliana@eduit.com.br", avatarUrl: null }, contact: { id: "ct-10", name: "João Victor Nunes",   email: "joao@acme.com"        }, deal: null },
];

/* ── Conversas ── */
const CONVERSATIONS = [
  // OPEN — com mensagens não lidas — aba "entrada"
  {
    id: "cv-1", channel: "whatsapp", status: "OPEN",
    contact: { id: "ct-1", name: "Ana Beatriz Costa",  phone: "+5511988880001", email: "ana@acme.com",          avatarUrl: null },
    assignedToId: "u-marcelo", assignedTo: { id: "u-marcelo", name: "Marcelo Santos", email: "marcelo@eduit.com.br" },
    lastInboundAt: "2026-05-31T15:45:00Z", lastMessageAt: "2026-05-31T15:45:00Z",
    lastMessage: { preview: "Top! Manda a proposta por favor 🙏", direction: "in", status: "DELIVERED" },
    lastMessagePreview: { content: "Top! Manda a proposta por favor 🙏", messageType: "text", mediaUrl: null, direction: "in" },
    unreadCount: 2, tags: [TAGS[0], TAGS[1]], hasError: false, pinnedNoteId: null,
  },
  {
    id: "cv-2", channel: "whatsapp", status: "OPEN",
    contact: { id: "ct-2", name: "Bruno Lima",          phone: "+5511988880002", email: "bruno@globex.com.br",   avatarUrl: null },
    assignedToId: "u-juliana", assignedTo: { id: "u-juliana", name: "Juliana Costa", email: "juliana@eduit.com.br" },
    lastInboundAt: "2026-05-31T14:20:00Z", lastMessageAt: "2026-05-31T14:20:00Z",
    lastMessage: { preview: "Beleza, vou avaliar com o time e te retorno", direction: "out", status: "READ" },
    lastMessagePreview: { content: "Beleza, vou avaliar com o time e te retorno", messageType: "text", mediaUrl: null, direction: "out" },
    unreadCount: 0, tags: [TAGS[1]], hasError: false, pinnedNoteId: null,
  },
  // OPEN — sem atribuição — aba "entrada"
  {
    id: "cv-3", channel: "whatsapp", status: "OPEN",
    contact: { id: "ct-3", name: "Camila Rodrigues",    phone: "+5511988880003", email: "camila@initech.com",    avatarUrl: null },
    assignedToId: null, assignedTo: null,
    lastInboundAt: "2026-05-31T09:10:00Z", lastMessageAt: "2026-05-31T09:10:00Z",
    lastMessage: { preview: "Bom dia, gostaria de saber mais sobre o produto", direction: "in", status: "DELIVERED" },
    lastMessagePreview: { content: "Bom dia, gostaria de saber mais sobre o produto", messageType: "text", mediaUrl: null, direction: "in" },
    unreadCount: 1, tags: [TAGS[2]], hasError: false, pinnedNoteId: null,
  },
  // PENDING — aba "esperando"
  {
    id: "cv-4", channel: "instagram", status: "PENDING",
    contact: { id: "ct-9", name: "Isabela Ferreira",    phone: "+5531988880009", email: "isabela@stellar.edu.br", avatarUrl: null },
    assignedToId: "u-camila", assignedTo: { id: "u-camila", name: "Camila Souza", email: "camila@eduit.com.br" },
    lastInboundAt: "2026-05-31T12:00:00Z", lastMessageAt: "2026-05-31T12:00:00Z",
    lastMessage: { preview: "Aguardando retorno do financeiro sobre o orçamento", direction: "in", status: "DELIVERED" },
    lastMessagePreview: { content: "Aguardando retorno do financeiro sobre o orçamento", messageType: "text", mediaUrl: null, direction: "in" },
    unreadCount: 3, tags: [TAGS[4]], hasError: false, pinnedNoteId: null,
  },
  // OPEN — com mensagens não lidas
  {
    id: "cv-5", channel: "whatsapp", status: "OPEN",
    contact: { id: "ct-5", name: "Eduarda Silva",       phone: "+5511988880005", email: "eduarda@piedpiper.com", avatarUrl: null },
    assignedToId: "u-marcelo", assignedTo: { id: "u-marcelo", name: "Marcelo Santos", email: "marcelo@eduit.com.br" },
    lastInboundAt: "2026-05-30T11:00:00Z", lastMessageAt: "2026-05-30T11:00:00Z",
    lastMessage: { preview: "Estamos avaliando outras opções no momento", direction: "in", status: "DELIVERED" },
    lastMessagePreview: { content: "Estamos avaliando outras opções no momento", messageType: "text", mediaUrl: null, direction: "in" },
    unreadCount: 0, tags: [], hasError: false, pinnedNoteId: null,
  },
  // OPEN — respondida
  {
    id: "cv-6", channel: "whatsapp", status: "OPEN",
    contact: { id: "ct-6", name: "Felipe Martins",      phone: "+5511988880006", email: "felipe@acme.com",       avatarUrl: null },
    assignedToId: "u-rafael", assignedTo: { id: "u-rafael", name: "Rafael Almeida", email: "rafael@eduit.com.br" },
    lastInboundAt: "2026-05-29T15:00:00Z", lastMessageAt: "2026-05-29T16:45:00Z",
    lastMessage: { preview: "Vou conferir e te aviso até sexta", direction: "out", status: "READ" },
    lastMessagePreview: { content: "Vou conferir e te aviso até sexta", messageType: "text", mediaUrl: null, direction: "out" },
    unreadCount: 0, tags: [TAGS[3]], hasError: false, pinnedNoteId: null,
  },
  // RESOLVED — aba "finalizados"
  {
    id: "cv-7", channel: "whatsapp", status: "RESOLVED",
    contact: { id: "ct-7", name: "Gabriela Sousa",      phone: "+5511988880007", email: "gabi@globex.com.br",    avatarUrl: null },
    assignedToId: "u-juliana", assignedTo: { id: "u-juliana", name: "Juliana Costa", email: "juliana@eduit.com.br" },
    lastInboundAt: "2026-05-28T10:15:00Z", lastMessageAt: "2026-05-28T10:15:00Z",
    lastMessage: { preview: "Renovamos sim, obrigada!", direction: "in", status: "DELIVERED" },
    lastMessagePreview: { content: "Renovamos sim, obrigada!", messageType: "text", mediaUrl: null, direction: "in" },
    unreadCount: 0, tags: [TAGS[1]], hasError: false, pinnedNoteId: null,
  },
  // OPEN — sem leitura — lead novo
  {
    id: "cv-8", channel: "whatsapp", status: "OPEN",
    contact: { id: "ct-8", name: "Henrique Pereira",    phone: "+5511988880008", email: null,                    avatarUrl: null },
    assignedToId: null, assignedTo: null,
    lastInboundAt: "2026-05-31T17:00:00Z", lastMessageAt: "2026-05-31T17:00:00Z",
    lastMessage: { preview: "Olá! Quero saber mais sobre o CRM", direction: "in", status: "DELIVERED" },
    lastMessagePreview: { content: "Olá! Quero saber mais sobre o CRM", messageType: "text", mediaUrl: null, direction: "in" },
    unreadCount: 1, tags: [], hasError: false, pinnedNoteId: null,
  },
  // RESOLVED — aba "finalizados"
  {
    id: "cv-9", channel: "whatsapp", status: "RESOLVED",
    contact: { id: "ct-4", name: "Diego Almeida",       phone: "+5521988880004", email: "diego@umbrella.health", avatarUrl: null },
    assignedToId: "u-marcelo", assignedTo: { id: "u-marcelo", name: "Marcelo Santos", email: "marcelo@eduit.com.br" },
    lastInboundAt: "2026-05-30T18:30:00Z", lastMessageAt: "2026-05-30T18:30:00Z",
    lastMessage: { preview: "Perfeito, agendado pra amanhã 14h", direction: "out", status: "READ" },
    lastMessagePreview: { content: "Perfeito, agendado pra amanhã 14h", messageType: "text", mediaUrl: null, direction: "out" },
    unreadCount: 0, tags: [TAGS[1]], hasError: false, pinnedNoteId: null,
  },
  // OPEN — com erro de entrega — aba "erro"
  {
    id: "cv-10", channel: "whatsapp", status: "OPEN",
    contact: { id: "ct-10", name: "João Victor Nunes",  phone: "+5511988880010", email: "joao@acme.com",          avatarUrl: null },
    assignedToId: "u-marcelo", assignedTo: { id: "u-marcelo", name: "Marcelo Santos", email: "marcelo@eduit.com.br" },
    lastInboundAt: "2026-05-31T10:00:00Z", lastMessageAt: "2026-05-31T10:05:00Z",
    lastMessage: { preview: "Tentei ligar mas não atendeu", direction: "out", status: "FAILED" },
    lastMessagePreview: { content: "Tentei ligar mas não atendeu", messageType: "text", mediaUrl: null, direction: "out" },
    unreadCount: 0, tags: [TAGS[3]], hasError: true, pinnedNoteId: null,
  },
  // PENDING — instagram
  {
    id: "cv-11", channel: "instagram", status: "OPEN",
    contact: { id: "ct-9", name: "Isabela Ferreira",    phone: null,             email: "isabela@stellar.edu.br", avatarUrl: null },
    assignedToId: "u-camila", assignedTo: { id: "u-camila", name: "Camila Souza", email: "camila@eduit.com.br" },
    lastInboundAt: "2026-05-30T16:00:00Z", lastMessageAt: "2026-05-30T16:10:00Z",
    lastMessage: { preview: "Vi o post e quero mais info!", direction: "in", status: "DELIVERED" },
    lastMessagePreview: { content: "Vi o post e quero mais info!", messageType: "text", mediaUrl: null, direction: "in" },
    unreadCount: 2, tags: [TAGS[4]], hasError: false, pinnedNoteId: null,
  },
  // SNOOZED
  {
    id: "cv-12", channel: "whatsapp", status: "SNOOZED",
    contact: { id: "ct-2", name: "Bruno Lima",          phone: "+5511988880002", email: "bruno@globex.com.br",   avatarUrl: null },
    assignedToId: "u-juliana", assignedTo: { id: "u-juliana", name: "Juliana Costa", email: "juliana@eduit.com.br" },
    lastInboundAt: "2026-05-29T08:00:00Z", lastMessageAt: "2026-05-29T08:00:00Z",
    lastMessage: { preview: "Podemos falar segunda-feira?", direction: "in", status: "DELIVERED" },
    lastMessagePreview: { content: "Podemos falar segunda-feira?", messageType: "text", mediaUrl: null, direction: "in" },
    unreadCount: 0, tags: [TAGS[1]], hasError: false, pinnedNoteId: null,
  },
];

/* ── Mensagens por conversa ── */
function makeMessages(conversationId: string) {
  const conv = CONVERSATIONS.find((c) => c.id === conversationId) ?? CONVERSATIONS[0];
  const agentSender = { id: USER.id, name: USER.name, kind: "AGENT" as const };
  const contactSender = { id: conv.contact.id, name: conv.contact.name, kind: "CONTACT" as const };

  const base = [
    {
      id: `${conv.id}-m1`,
      conversationId: conv.id,
      direction: "in" as const,
      content: "Olá! Vi o material de vocês no LinkedIn e queria entender melhor a solução de CRM.",
      messageType: "text",
      private: false,
      status: "READ",
      createdAt: "2026-05-31T09:00:00Z",
      readAt: "2026-05-31T09:01:00Z",
      replyToId: null,
      reactions: [],
      media: null,
      sender: contactSender,
      metaError: null,
    },
    {
      id: `${conv.id}-m2`,
      conversationId: conv.id,
      direction: "out" as const,
      content: "Oi! Obrigado pelo contato 😊 Trabalhamos com CRM completo para times comerciais. Você quer agendar 15 minutos essa semana para uma conversa rápida?",
      messageType: "text",
      private: false,
      status: "READ",
      createdAt: "2026-05-31T09:05:00Z",
      readAt: "2026-05-31T09:06:00Z",
      replyToId: null,
      reactions: [{ emoji: "👍", count: 1, byMe: false, users: [{ id: conv.contact.id, name: conv.contact.name }] }],
      media: null,
      sender: agentSender,
      metaError: null,
    },
    {
      id: `${conv.id}-m3`,
      conversationId: conv.id,
      direction: "in" as const,
      content: "Perfeito! Pode mandar uns horários?",
      messageType: "text",
      private: false,
      status: "READ",
      createdAt: "2026-05-31T09:10:00Z",
      readAt: "2026-05-31T09:11:00Z",
      replyToId: null,
      reactions: [],
      media: null,
      sender: contactSender,
      metaError: null,
    },
    {
      id: `${conv.id}-m4`,
      conversationId: conv.id,
      direction: "out" as const,
      content: "Claro! Tenho disponibilidade quinta às 14h, sexta às 10h ou 16h. Qual te atende melhor?",
      messageType: "text",
      private: false,
      status: "READ",
      createdAt: "2026-05-31T09:12:00Z",
      readAt: "2026-05-31T09:13:00Z",
      replyToId: null,
      reactions: [],
      media: null,
      sender: agentSender,
      metaError: null,
    },
    // Nota interna
    {
      id: `${conv.id}-m5`,
      conversationId: conv.id,
      direction: "out" as const,
      content: "Lembrar de enviar deck de produto antes da reunião. Cliente tem perfil técnico.",
      messageType: "note",
      private: true,
      status: "SENT",
      createdAt: "2026-05-31T09:15:00Z",
      readAt: null,
      replyToId: null,
      reactions: [],
      media: null,
      sender: agentSender,
      metaError: null,
    },
    // Mensagem de áudio (sem arquivo real)
    {
      id: `${conv.id}-m6`,
      conversationId: conv.id,
      direction: "in" as const,
      content: "",
      messageType: "audio",
      private: false,
      status: "DELIVERED",
      createdAt: "2026-05-31T09:20:00Z",
      readAt: null,
      replyToId: null,
      reactions: [],
      media: {
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        mimeType: "audio/ogg",
        fileName: "audio-001.ogg",
        duration: 14,
        transcript: "Quinta às 14h está ótimo pra mim!",
      },
      sender: contactSender,
      metaError: null,
    },
    // Mensagem de imagem
    {
      id: `${conv.id}-m7`,
      conversationId: conv.id,
      direction: "out" as const,
      content: "Segue o deck de apresentação do produto 👆",
      messageType: "image",
      private: false,
      status: "READ",
      createdAt: "2026-05-31T09:25:00Z",
      readAt: "2026-05-31T09:26:00Z",
      replyToId: null,
      reactions: [],
      media: {
        url: "https://placehold.co/600x400/3b82f6/ffffff?text=Deck+Bwipo",
        mimeType: "image/png",
        fileName: "deck-eduit.png",
        duration: null,
        transcript: null,
      },
      sender: agentSender,
      metaError: null,
    },
    // Mensagem do sistema
    {
      id: `${conv.id}-m8`,
      conversationId: conv.id,
      direction: "system" as const,
      content: "Conversa atribuída a Marcelo Santos",
      messageType: "text",
      private: false,
      status: "SENT",
      createdAt: "2026-05-31T09:30:00Z",
      readAt: null,
      replyToId: null,
      reactions: [],
      media: null,
      sender: { id: "system", name: "Sistema", kind: "SYSTEM" as const },
      metaError: null,
    },
    // Última mensagem real da conversa
    {
      id: `${conv.id}-m9`,
      conversationId: conv.id,
      direction: conv.lastMessage.direction === "in" ? "in" as const : "out" as const,
      content: conv.lastMessage.preview,
      messageType: "text",
      private: false,
      status: conv.lastMessage.status,
      createdAt: conv.lastMessageAt ?? "2026-05-31T15:45:00Z",
      readAt: conv.lastMessage.status === "READ" ? conv.lastMessageAt : null,
      replyToId: null,
      reactions: [],
      media: null,
      sender: conv.lastMessage.direction === "in" ? contactSender : agentSender,
      metaError: conv.hasError ? "131026: Message undeliverable" : null,
    },
  ];
  return base;
}

/* ── Automações ── */
/* ── Automations (dados reais anonimizados) ── */
const AUTOMATIONS = [
  {
    id: "au-3001",
    name: "Boas-vindas novo lead",
    description: "Mensagem automática ao entrar lead via WhatsApp",
    triggerType: "CONTACT_CREATED",
    triggerConfig: { channel: "WHATSAPP" },
    active: true,
    executionCount: 312,
    createdAt: "2026-03-10T10:00:00Z",
    updatedAt: "2026-05-20T08:00:00Z",
    stepCount: 4,
    steps: [
      { id: "as-3001a", automationId: "au-3001", type: "WAIT",            config: { delay: 300, unit: "seconds" },                           position: 1 },
      { id: "as-3001b", automationId: "au-3001", type: "SEND_MESSAGE",    config: { templateId: "tpl-welcome", channel: "WHATSAPP" },        position: 2 },
      { id: "as-3001c", automationId: "au-3001", type: "ADD_TAG",         config: { tagId: "tag-3" },                                        position: 3 },
      { id: "as-3001d", automationId: "au-3001", type: "CREATE_ACTIVITY", config: { type: "TASK", title: "Qualificar novo lead" },           position: 4 },
    ],
  },
  {
    id: "au-3002",
    name: "Follow-up proposta",
    description: "Cobra retorno 2 dias após envio da proposta",
    triggerType: "DEAL_STAGE_CHANGED",
    triggerConfig: { stageId: "stg-3" },
    active: true,
    executionCount: 88,
    createdAt: "2026-04-02T10:00:00Z",
    updatedAt: "2026-05-18T15:30:00Z",
    stepCount: 3,
    steps: [
      { id: "as-3002a", automationId: "au-3002", type: "WAIT",         config: { delay: 48, unit: "hours" },                                position: 1 },
      { id: "as-3002b", automationId: "au-3002", type: "SEND_MESSAGE", config: { templateId: "tpl-followup", channel: "WHATSAPP" },         position: 2 },
      { id: "as-3002c", automationId: "au-3002", type: "ADD_TAG",      config: { tagId: "tag-4" },                                          position: 3 },
    ],
  },
  {
    id: "au-3003",
    name: "Reativação inativos",
    description: "Dispara para contatos sem interação há 30 dias",
    triggerType: "SCHEDULE",
    triggerConfig: { cron: "0 9 * * 1" },
    active: false,
    executionCount: 0,
    createdAt: "2026-02-15T10:00:00Z",
    updatedAt: "2026-05-01T12:00:00Z",
    stepCount: 5,
    steps: [
      { id: "as-3003a", automationId: "au-3003", type: "FILTER",          config: { idleDays: 30 },                                         position: 1 },
      { id: "as-3003b", automationId: "au-3003", type: "ADD_TAG",         config: { tagId: "tag-4" },                                       position: 2 },
      { id: "as-3003c", automationId: "au-3003", type: "SEND_MESSAGE",    config: { templateId: "tpl-reactivate" },                         position: 3 },
      { id: "as-3003d", automationId: "au-3003", type: "WAIT",            config: { delay: 72, unit: "hours" },                             position: 4 },
      { id: "as-3003e", automationId: "au-3003", type: "CREATE_ACTIVITY", config: { type: "TASK", title: "Verificar reativação" },          position: 5 },
    ],
  },
];

/* ── Contacts list (shape de /api/contacts — dados reais anonimizados) ── */
const CONTACTS_LIST = [
  { id: "ct-1001", name: "Ana Beatriz Ferreira", email: "ana.ferreira@stellar.edu.br", phone: "+5531988120045", avatarUrl: null, leadScore: 87, lifecycleStage: "OPPORTUNITY", createdAt: "2026-05-22T13:40:00Z", company: { id: "co-6", name: "Stellar Educação", domain: "stellar.edu.br" }, tags: [TAGS[0], TAGS[1]] },
  { id: "ct-1002", name: "Carlos Eduardo Lima",   email: "carlos.lima@acme.com",           phone: "+5511997640112", avatarUrl: null, leadScore: 64, lifecycleStage: "LEAD",        createdAt: "2026-05-19T09:10:00Z", company: { id: "co-1", name: "Acme Tech",        domain: "acme.com"       }, tags: [TAGS[2]] },
  { id: "ct-1003", name: "Patrícia Gomes",        email: "patricia@globex.com.br",          phone: "+5511996330078", avatarUrl: null, leadScore: 42, lifecycleStage: "CUSTOMER",   createdAt: "2026-04-30T16:05:00Z", company: { id: "co-2", name: "Globex Logistics", domain: "globex.com.br"  }, tags: [TAGS[5]] },
  { id: "ct-1004", name: "Rafael Monteiro",       email: null,                              phone: "+5521995210099", avatarUrl: null, leadScore: null, lifecycleStage: "LEAD",     createdAt: "2026-05-25T11:22:00Z", company: null,                                                                   tags: [] },
];

/* ── Companies list (shape de /api/companies — dados reais anonimizados) ── */
const COMPANIES_LIST = [
  { id: "co-1", name: "Acme Tech",        domain: "acme.com",       industry: "Software",  size: "51-200",  phone: "+5511999990001", address: "Av. Paulista, 1000 — São Paulo, SP",                 createdAt: "2026-04-12T10:00:00Z", _count: { contacts: 14 } },
  { id: "co-2", name: "Globex Logistics", domain: "globex.com.br",  industry: "Logística", size: "201-500", phone: "+5511999990002", address: "Rod. Anhanguera, km 23 — Campinas, SP",              createdAt: "2026-03-28T10:00:00Z", _count: { contacts: 8  } },
  { id: "co-6", name: "Stellar Educação", domain: "stellar.edu.br", industry: "Educação",  size: "51-200",  phone: "+5531999990006", address: "R. dos Inconfidentes, 800 — Belo Horizonte, MG",    createdAt: "2026-01-10T10:00:00Z", _count: { contacts: 17 } },
];

/* ── Board (shape de /api/pipelines/:id/board — dados reais anonimizados) ── */
const BOARD_STAGES = [
  {
    id: "st-1", name: "Novo lead", color: "#3b82f6", position: 0, winProbability: 10, rottingDays: 7, isIncoming: true, totalCount: 2,
    deals: [
      { id: "dl-2001", number: 2001, title: "Plano Anual — Stellar",  value: 28500,  status: "OPEN", position: 0, expectedClose: "2026-06-30T00:00:00Z", createdAt: "2026-05-22T13:40:00Z", updatedAt: "2026-05-28T10:00:00Z", isRotting: false, priority: "HIGH",   contact: { id: "ct-1001", name: "Ana Beatriz Ferreira", email: "ana.ferreira@stellar.edu.br", phone: "+5531988120045", avatarUrl: null }, owner: { id: "u-juliana", name: "Juliana Costa",  avatarUrl: null }, lastMessage: { content: "Pode me enviar a proposta?",                 createdAt: "2026-05-28T09:55:00Z", direction: "INBOUND" }, channel: "WHATSAPP", productName: "Plano Anual EAD",  productType: "SERVICE", tags: [TAGS[0]], pendingActivities: 2, hasOverdueActivity: false, unreadCount: 1 },
      { id: "dl-2002", number: 2002, title: "Licenças — Acme Tech",   value: 12000,  status: "OPEN", position: 1, expectedClose: null,                   createdAt: "2026-05-19T09:10:00Z", updatedAt: "2026-05-26T14:00:00Z", isRotting: true,  priority: "MEDIUM", contact: { id: "ct-1002", name: "Carlos Eduardo Lima",  email: "carlos.lima@acme.com",           phone: "+5511997640112", avatarUrl: null }, owner: { id: "u-rafael",  name: "Rafael Almeida", avatarUrl: null }, lastMessage: null,                                                                                                channel: "EMAIL",    productName: null,            productType: null,      tags: [],        pendingActivities: 0, hasOverdueActivity: true,  unreadCount: 0 },
    ],
  },
  {
    id: "st-2", name: "Qualificado", color: "#8b5cf6", position: 1, winProbability: 35, rottingDays: 10, totalCount: 1,
    deals: [
      { id: "dl-2003", number: 2003, title: "Consultoria — Globex",   value: 45000,  status: "OPEN", position: 0, expectedClose: "2026-07-15T00:00:00Z", createdAt: "2026-04-30T16:05:00Z", updatedAt: "2026-05-27T11:30:00Z", isRotting: false, priority: "HIGH",   contact: { id: "ct-1003", name: "Patrícia Gomes",       email: "patricia@globex.com.br",          phone: "+5511996330078", avatarUrl: null }, owner: { id: "u-marcelo", name: "Marcelo Santos", avatarUrl: null }, lastMessage: { content: "Fechado, vamos seguir!",                    createdAt: "2026-05-27T11:25:00Z", direction: "INBOUND" }, channel: "WHATSAPP", productName: "Consultoria EaD", productType: "SERVICE", tags: [TAGS[1]], pendingActivities: 1, hasOverdueActivity: false, unreadCount: 0 },
    ],
  },
  { id: "st-3", name: "Proposta",   color: "#f59e0b", position: 2, winProbability: 60, rottingDays: 14, totalCount: 0, deals: [] },
  { id: "st-4", name: "Negociação", color: "#10b981", position: 3, winProbability: 85, rottingDays: 21, totalCount: 0, deals: [] },
  { id: "st-5", name: "Ganho",      color: "#22c55e", position: 4, winProbability: 100, rottingDays: 0, totalCount: 0, deals: [] },
  { id: "st-6", name: "Perdido",    color: "#ef4444", position: 5, winProbability: 0, rottingDays: 0, totalCount: 0, deals: [] },
];

/* ── Quick replies ── */
const QUICK_REPLIES = [
  { id: "qr-1", shortcut: "/oi",       content: "Olá! Tudo bem? Como posso te ajudar hoje? 😊" },
  { id: "qr-2", shortcut: "/proposta", content: "Acabei de enviar a proposta comercial para o seu e-mail. Qualquer dúvida, é só falar!" },
  { id: "qr-3", shortcut: "/agendou",  content: "Confirmado! Reunião agendada para {{data}}. Te mando um lembrete antes 👍" },
  { id: "qr-4", shortcut: "/obrigado", content: "Obrigado pelo contato! Estou à disposição." },
  { id: "qr-5", shortcut: "/horarios", content: "Tenho disponibilidade:\n• Quinta às 14h\n• Sexta às 10h\n• Sexta às 16h\nQual te atende melhor?" },
];

/* ── Templates Internos do CRM ── */
const INTERNAL_TEMPLATES = [
  {
    id: "it-1",
    name: "Boas-vindas ao lead",
    content: "Olá, {{contato.nome}}! Tudo bem? 😊 Sou o {{agente.nome}}, do time {{organizacao.nome}}. Vi que você demonstrou interesse e estou aqui para ajudar. Como posso te auxiliar?",
    category: "Vendas",
    channelType: null,
    language: "pt_BR",
    status: "ACTIVE",
  },
  {
    id: "it-2",
    name: "Apresentação do produto",
    content: "Olá, {{contato.nome}}! Obrigado pelo seu interesse. Nossa solução foi desenvolvida especialmente para empresas como a sua. Posso te apresentar as principais funcionalidades em uma chamada rápida de 15 minutos?",
    category: "Vendas",
    channelType: null,
    language: "pt_BR",
    status: "ACTIVE",
  },
  {
    id: "it-3",
    name: "Follow-up pós-reunião",
    content: "Olá, {{contato.nome}}! Foi um prazer conversar com você hoje. Conforme combinamos, segue o resumo dos próximos passos:\n\n1. Envio da proposta até {{data}}\n2. Reunião de alinhamento técnico\n3. Aprovação e assinatura\n\nQualquer dúvida, estou à disposição!",
    category: "Vendas",
    channelType: null,
    language: "pt_BR",
    status: "ACTIVE",
  },
  {
    id: "it-4",
    name: "Envio de proposta",
    content: "Olá, {{contato.nome}}! Conforme combinado, segue a proposta comercial referente ao negócio \"{{negocio.titulo}}\". Valor: R$ {{negocio.valor}}. Caso tenha alguma dúvida ou queira ajustar algo, é só falar. Estamos aqui para encontrar a melhor solução para você!",
    category: "Vendas",
    channelType: null,
    language: "pt_BR",
    status: "ACTIVE",
  },
  {
    id: "it-5",
    name: "Reativação de lead frio",
    content: "Oi, {{contato.nome}}! Faz algum tempo que não conversamos e queria saber como você está. Temos novidades e melhorias que podem fazer toda a diferença para o seu negócio. Posso te contar mais?",
    category: "Vendas",
    channelType: null,
    language: "pt_BR",
    status: "ACTIVE",
  },
  {
    id: "it-6",
    name: "Suporte - Abertura de chamado",
    content: "Olá, {{contato.nome}}! Recebi sua solicitação e já estou analisando. Em breve retorno com uma solução. Número de protocolo: #{{data}}. Obrigado pela paciência!",
    category: "Suporte",
    channelType: null,
    language: "pt_BR",
    status: "ACTIVE",
  },
  {
    id: "it-7",
    name: "Suporte - Resolução",
    content: "Olá, {{contato.nome}}! Sua solicitação foi resolvida com sucesso. Caso precise de mais alguma coisa, é só entrar em contato. Ficamos à disposição!",
    category: "Suporte",
    channelType: null,
    language: "pt_BR",
    status: "ACTIVE",
  },
  {
    id: "it-8",
    name: "Confirmação de reunião",
    content: "Oi, {{contato.nome}}! Passando para confirmar nossa reunião amanhã. Qualquer imprevisto, pode me avisar com antecedência. Até lá! 🗓️",
    category: "Agenda",
    channelType: null,
    language: "pt_BR",
    status: "ACTIVE",
  },
];

/* ── Templates WhatsApp ── */
const WA_TEMPLATES = [
  { id: "tpl-1", name: "boas_vindas",    category: "MARKETING",  language: "pt_BR", body: "Olá {{1}}, seja bem-vindo(a) ao Bwipo! Como posso ajudar?" },
  { id: "tpl-2", name: "envio_proposta", category: "UTILITY",    language: "pt_BR", body: "Oi {{1}}, segue a proposta comercial que combinamos. Qualquer dúvida, estou aqui!" },
  { id: "tpl-3", name: "followup_48h",   category: "UTILITY",    language: "pt_BR", body: "Oi {{1}}, passando para saber se teve chance de avaliar nossa proposta. 😊" },
  { id: "tpl-4", name: "reativacao",     category: "MARKETING",  language: "pt_BR", body: "Olá {{1}}, faz um tempo que não conversamos. Temos novidades que podem te interessar!" },
  { id: "tpl-5", name: "confirma_reuniao", category: "UTILITY",  language: "pt_BR", body: "Confirmado! Reunião marcada para {{1}} às {{2}}. Até lá 🗓️" },
];

/* ── Analytics: Dashboard ── */
const SERVICE_OVERVIEW = {
  summary: {
    total:          { value: "1.284", delta: 12  },
    firstResponse:  { value: "2m 14s", delta: -8  },
    resolutionTime: { value: "18m 30s", delta: -5  },
    resolutionRate: { value: "92%",    delta: 3   },
  },
  volumeByDay: [
    { day: "Seg", recebidas: 184, enviadas: 220 },
    { day: "Ter", recebidas: 201, enviadas: 245 },
    { day: "Qua", recebidas: 195, enviadas: 230 },
    { day: "Qui", recebidas: 220, enviadas: 268 },
    { day: "Sex", recebidas: 178, enviadas: 215 },
    { day: "Sab", recebidas:  82, enviadas:  95 },
    { day: "Dom", recebidas:  45, enviadas:  50 },
  ],
  responseTimeSeries: Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, "0")}h`,
    resposta: Math.max(20, 60 + Math.floor(Math.sin(h / 3) * 40)),
    primeira: Math.max(10, 30 + Math.floor(Math.cos(h / 4) * 20)),
  })),
  byConnection: [
    { name: "WhatsApp Vendas",  value: 645, color: "#22c55e" },
    { name: "WhatsApp Suporte", value: 412, color: "#3b82f6" },
    { name: "Instagram DMs",    value: 227, color: "#a855f7" },
  ],
  byAttendant: [
    { name: "Marcelo Santos",  value: 412, color: "#3b82f6" },
    { name: "Juliana Costa",   value: 388, color: "#a855f7" },
    { name: "Rafael Almeida",  value: 295, color: "#22c55e" },
    { name: "Camila Souza",    value: 189, color: "#f59e0b" },
  ],
  byPlatform: {
    rows: [
      { dia: "01/05", whatsapp: 180, instagram: 45 },
      { dia: "08/05", whatsapp: 210, instagram: 52 },
      { dia: "15/05", whatsapp: 235, instagram: 60 },
      { dia: "22/05", whatsapp: 198, instagram: 48 },
      { dia: "29/05", whatsapp: 245, instagram: 67 },
    ],
    platforms: [
      { key: "whatsapp",  label: "WhatsApp",  color: "#22c55e" },
      { key: "instagram", label: "Instagram", color: "#a855f7" },
    ],
  },
  heatmap: {
    cells: Array.from({ length: 7 * 24 }, (_, i) => ({
      x: i % 24,
      y: Math.floor(i / 24),
      value: Math.floor(
        Math.abs(Math.sin((i % 24) / 4) * 80) +
        (i % 24 >= 8 && i % 24 <= 18 ? 20 : 0)
      ),
    })),
    xLabels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}h`),
    yLabels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
  },
  attendantRanking: [
    { id: "u-marcelo", name: "Marcelo Santos",  attended: 412, avgResponse: "1m 50s", resolution: 94 },
    { id: "u-juliana", name: "Juliana Costa",   attended: 388, avgResponse: "2m 10s", resolution: 91 },
    { id: "u-rafael",  name: "Rafael Almeida",  attended: 295, avgResponse: "2m 35s", resolution: 89 },
    { id: "u-camila",  name: "Camila Souza",    attended: 189, avgResponse: "3m 05s", resolution: 86 },
  ],
};

const DEALS_OVERVIEW = {
  stages: [
    { id: "st-1", name: "Novo lead",   color: "#3b82f6", count: 18, value: 245000, entered: 32, exited: 14, lost: 4,  won: 0  },
    { id: "st-2", name: "Qualificado", color: "#8b5cf6", count: 12, value: 198000, entered: 14, exited: 10, lost: 3,  won: 0  },
    { id: "st-3", name: "Proposta",    color: "#f59e0b", count:  8, value: 380000, entered: 10, exited:  7, lost: 2,  won: 0  },
    { id: "st-4", name: "Negociação",  color: "#10b981", count:  5, value: 425000, entered:  7, exited:  5, lost: 1,  won: 4  },
    { id: "st-5", name: "Ganho",       color: "#22c55e", count: 11, value: 685000, entered: 11, exited:  0, lost: 0,  won: 11 },
    { id: "st-6", name: "Perdido",     color: "#ef4444", count:  7, value:      0, entered:  7, exited:  0, lost: 7,  won: 0  },
  ],
  summary: {
    totalValue: 1933000,
    totalDeals: 61,
    winRate: 73,
    avgTicket: 31688,
    deltas: { winRate: 5, avgTicket: 12 },
  },
};

/* ═══════════════════════════════════════════════════════════════════
   RBAC v2 FIXTURES
══════════════════════════════════════════════════════════════════ */

const ROLES = [
  {
    id: "role-admin",   name: "ADMIN",   description: "Acesso total à plataforma", isSystem: true,  systemPreset: "ADMIN",
    permissions: ["*"],
    _count: { assignments: 1, groups: 0 },
    _members: [{ id: "u-marcelo", name: "Marcelo Santos", email: "marcelo@eduit.com.br", avatarUrl: null }],
  },
  {
    id: "role-manager", name: "MANAGER", description: "Gestão de times e negócios", isSystem: true,  systemPreset: "MANAGER",
    permissions: ["deal:view_all","deal:create","deal:edit","deal:import","deal:export","conversation:view_all","conversation:assign","conversation:close","contact:view","contact:create","contact:edit","group:view","report:view"],
    _count: { assignments: 0, groups: 0 },
    _members: [],
  },
  {
    id: "role-member",  name: "MEMBER",  description: "Atendimento e negócios próprios", isSystem: true,  systemPreset: "MEMBER",
    permissions: ["deal:view_own","deal:create","deal:edit","conversation:view_own","conversation:view_unassigned","conversation:assign","contact:view","contact:create"],
    _count: { assignments: 3, groups: 1 },
    _members: [
      { id: "u-juliana", name: "Juliana Costa",  email: "juliana@eduit.com.br", avatarUrl: null },
      { id: "u-rafael",  name: "Rafael Almeida", email: "rafael@eduit.com.br",  avatarUrl: null },
      { id: "u-camila",  name: "Camila Souza",   email: "camila@eduit.com.br",  avatarUrl: null },
    ],
  },
  {
    id: "role-supervisor", name: "Supervisor SP", description: "Acesso restrito a WhatsApp e fases iniciais", isSystem: false, systemPreset: null,
    permissions: ["deal:view_group","deal:create","deal:edit","conversation:view_group","conversation:view_unassigned","conversation:assign","conversation:close","contact:view","contact:create"],
    _count: { assignments: 1, groups: 1 },
    _members: [{ id: "u-juliana", name: "Juliana Costa", email: "juliana@eduit.com.br", avatarUrl: null }],
  },
];

const PERMISSION_CATALOG_MOCK = [
  {
    resource: "deal", label: "Negócios",
    permissions: [
      { key: "deal:view_all",   label: "Ver todos os negócios" },
      { key: "deal:view_own",   label: "Ver apenas os próprios" },
      { key: "deal:view_group", label: "Ver negócios do grupo" },
      { key: "deal:create",     label: "Criar negócio" },
      { key: "deal:edit",       label: "Editar negócio" },
      { key: "deal:delete",     label: "Excluir negócio",        destructive: true },
      { key: "deal:import",     label: "Importar via CSV" },
      { key: "deal:export",     label: "Exportar negócios" },
    ],
  },
  {
    resource: "conversation", label: "Conversas",
    permissions: [
      { key: "conversation:view_all",         label: "Ver todas as conversas" },
      { key: "conversation:view_own",         label: "Ver apenas as próprias" },
      { key: "conversation:view_group",       label: "Ver conversas do grupo" },
      { key: "conversation:view_unassigned",  label: "Ver conversas sem atribuição" },
      { key: "conversation:assign",           label: "Atribuir conversa" },
      { key: "conversation:reassign",         label: "Reatribuir conversa" },
      { key: "conversation:close",            label: "Fechar conversa" },
      { key: "conversation:transfer",         label: "Transferir conversa" },
    ],
  },
  {
    resource: "contact", label: "Contatos",
    permissions: [
      { key: "contact:view",    label: "Visualizar contatos" },
      { key: "contact:create",  label: "Criar contato" },
      { key: "contact:edit",    label: "Editar contato" },
      { key: "contact:delete",  label: "Excluir contato",   destructive: true },
      { key: "contact:import",  label: "Importar contatos" },
      { key: "contact:export",  label: "Exportar contatos" },
    ],
  },
  {
    resource: "settings", label: "Configurações",
    permissions: [
      { key: "settings:roles",    label: "Gerenciar roles e permissões" },
      { key: "settings:users",    label: "Gerenciar usuários" },
      { key: "settings:channels", label: "Gerenciar canais" },
      { key: "settings:billing",  label: "Gerenciar planos e faturamento" },
      { key: "settings:security", label: "Configurações de segurança" },
    ],
  },
  {
    resource: "report", label: "Relatórios",
    permissions: [
      { key: "report:view",   label: "Visualizar relatórios" },
      { key: "report:export", label: "Exportar relatórios" },
    ],
  },
  {
    resource: "group", label: "Grupos",
    permissions: [
      { key: "group:view",   label: "Visualizar grupos" },
      { key: "group:manage", label: "Criar e editar grupos" },
    ],
  },
];

const EFFECTIVE_PERMISSIONS_MOCK = {
  permissions: ["*"],
  channelGrants: [],
  stageGrants: [],
  roles: [{ id: "role-admin", name: "ADMIN", systemPreset: "ADMIN" }],
  groups: [],
};

const FEATURE_FLAGS_MOCK = {
  flags: [
    {
      key: "permissions_v2_enabled",
      label: "Permissões v2 (RBAC dinâmico)",
      description: "Ativa visibilidade de deals e conversas controlada por roles e grupos configurados. Certifique-se de configurar os grupos antes de ativar.",
      enabled: false,
    },
    {
      key: "rbac_granular_scope_v1",
      label: "Escopo granular v1 (legado)",
      description: "Controle de visibilidade por enum de role (ADMIN/MANAGER/MEMBER). Desativado quando permissions_v2 estiver ativo.",
      enabled: false,
    },
  ],
};

/* ── Demandas (boards + solicitações; estado mutável p/ DELETE) ── */
const DEMAND_ACTOR = { id: USER.id, name: USER.name, avatarUrl: null as string | null };

type PreviewDemandItem = {
  id: string;
  number: number;
  title: string;
  description: string;
  kind: string;
  priority: string;
  position: number;
  votesCount: number;
  tags: string[];
  boardId: string;
  stageId: string;
  requesterId: string;
  assigneeId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requester: typeof DEMAND_ACTOR;
  assignee: typeof DEMAND_ACTOR | null;
  votedByMe: boolean;
};

type PreviewDemandStage = {
  id: string;
  name: string;
  key: string;
  color: string | null;
  position: number;
  isTerminal: boolean;
  items: PreviewDemandItem[];
};

type PreviewDemandBoard = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  color: string | null;
  description: string | null;
  position: number;
  isDefault: boolean;
  stages: PreviewDemandStage[];
};

function previewDemandItem(
  partial: Pick<
    PreviewDemandItem,
    "id" | "number" | "title" | "kind" | "priority" | "boardId" | "stageId" | "position"
  > &
    Partial<PreviewDemandItem>,
): PreviewDemandItem {
  return {
    description: "",
    votesCount: 0,
    tags: [],
    requesterId: USER.id,
    assigneeId: USER.id,
    dueAt: null,
    completedAt: null,
    createdAt: "2026-08-12T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
    requester: DEMAND_ACTOR,
    assignee: DEMAND_ACTOR,
    votedByMe: false,
    ...partial,
  };
}

let DEMAND_BOARDS: PreviewDemandBoard[] = [
  {
    id: "db-produto",
    name: "Produto",
    slug: "produto",
    kind: "PRODUCT",
    color: "#3B82F6",
    description: "Backlog de produto",
    position: 0,
    isDefault: true,
    stages: [
      {
        id: "ds-ideias",
        name: "Ideias",
        key: "IDEAS",
        color: "#94a3b8",
        position: 0,
        isTerminal: false,
        items: [
          previewDemandItem({
            id: "di-8",
            number: 8,
            title: "Aba de conversas não lidas na Inbox",
            kind: "FEATURE",
            priority: "HIGH",
            boardId: "db-produto",
            stageId: "ds-ideias",
            position: 0,
            votesCount: 12,
            description: "Separar não lidas para o time priorizar o que chegou.",
          }),
        ],
      },
      {
        id: "ds-triagem",
        name: "Triagem",
        key: "TRIAGE",
        color: "#f59e0b",
        position: 1,
        isTerminal: false,
        items: [
          previewDemandItem({
            id: "di-9",
            number: 9,
            title: "Filtro por tags no kanban de demandas",
            kind: "IMPROVEMENT",
            priority: "MEDIUM",
            boardId: "db-produto",
            stageId: "ds-triagem",
            position: 0,
            votesCount: 4,
          }),
        ],
      },
      {
        id: "ds-dev",
        name: "Em desenvolvimento",
        key: "DEV",
        color: "#3b82f6",
        position: 2,
        isTerminal: false,
        items: [
          previewDemandItem({
            id: "di-10",
            number: 10,
            title: "Excluir boards e solicitações",
            kind: "FEATURE",
            priority: "URGENT",
            boardId: "db-produto",
            stageId: "ds-dev",
            position: 0,
            votesCount: 7,
          }),
        ],
      },
    ],
  },
  {
    id: "db-bugs",
    name: "Bugs",
    slug: "bugs",
    kind: "BUGS",
    color: "#ef4444",
    description: "Incidents",
    position: 1,
    isDefault: false,
    stages: [
      {
        id: "ds-bugs-open",
        name: "Aberto",
        key: "OPEN",
        color: "#ef4444",
        position: 0,
        isTerminal: false,
        items: [
          previewDemandItem({
            id: "di-21",
            number: 21,
            title: "Drawer de demanda não fecha no ESC em mobile",
            kind: "BUG",
            priority: "HIGH",
            boardId: "db-bugs",
            stageId: "ds-bugs-open",
            position: 0,
            votesCount: 2,
          }),
        ],
      },
    ],
  },
];

function demandItemCount(board: PreviewDemandBoard) {
  return board.stages.reduce((n, s) => n + s.items.length, 0);
}

function demandBoardLite(board: PreviewDemandBoard) {
  return {
    id: board.id,
    name: board.name,
    slug: board.slug,
    kind: board.kind,
    color: board.color,
    description: board.description,
    position: board.position,
    isDefault: board.isDefault,
    itemCount: demandItemCount(board),
    stages: board.stages.map(({ items: _items, ...stage }) => stage),
  };
}

function findDemandItem(id: string) {
  for (const board of DEMAND_BOARDS) {
    for (const stage of board.stages) {
      const item = stage.items.find((it) => it.id === id);
      if (item) return { board, stage, item };
    }
  }
  return null;
}

function demandItemDetail(item: PreviewDemandItem) {
  return {
    ...item,
    comments: [] as { id: string }[],
    events: [
      {
        id: `ev-${item.id}`,
        type: "CREATED",
        payload: null,
        createdAt: item.createdAt,
        actor: item.requester,
      },
    ],
  };
}

function parseMockBody(init?: RequestInit): Record<string, unknown> {
  try {
    const raw = init?.body;
    if (typeof raw === "string") return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return {};
}

/* ═══════════════════════════════════════════════════════════════════
   ROUTER
══════════════════════════════════════════════════════════════════ */

function enrichDeal(d: typeof DEALS[number]) {
  const stage   = STAGES.find((s) => s.id === d.stageId)  ?? STAGES[0];
  const contact = CONTACTS.find((c) => c.id === d.contactId) ?? null;
  const owner   = AGENTS.find((a) => a.id === d.ownerId) ?? AGENTS[0];
  return {
    ...d,
    status: stage.id === "st-5" ? "WON" : stage.id === "st-6" ? "LOST" : "OPEN",
    number: Number(d.id.replace("dl-", "")),
    position: 0,
    stage:   { id: stage.id,   name: stage.name,   position: stage.order, color: stage.color, pipelineId: "pl-1" },
    contact: contact ? { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone, avatarUrl: null } : null,
    owner:   { id: owner.id,   name: owner.name,   email: owner.email,  avatarUrl: null },
  };
}

const ROUTES: { test: (url: URL, method: string) => boolean; handler: MockHandler }[] = [
  /* ── Auth ── */
  {
    test: (u) => u.pathname === "/api/auth/session",
    handler: () => ({ user: USER, expires: new Date(Date.now() + 86400 * 1000 * 30).toISOString() }),
  },

  /* ── Users / Org ── */
  {
    test: (u) => u.pathname === "/api/users/me" || u.pathname === "/api/me",
    handler: () => ({ user: { ...USER, status: "ONLINE" }, organization: ORG }),
  },
  {
    test: (u) => u.pathname === "/api/users",
    handler: () => ({ items: AGENTS, total: AGENTS.length }),
  },
  {
    test: (u) => u.pathname === "/api/organizations" || u.pathname === "/api/organization",
    handler: () => ({ organization: ORG, items: [ORG], total: 1 }),
  },
  {
    test: (u) => /^\/api\/agents\/[^/]+\/status$/.test(u.pathname),
    handler: (u) => {
      const id = u.pathname.split("/")[3];
      const agent = AGENTS.find((a) => a.id === id) ?? AGENTS[0];
      return { status: agent.status };
    },
  },

  /* ── Settings ── */
  {
    test: (u) => u.pathname === "/api/settings/self-assign",
    handler: () => ({ settings: { selfAssignEnabled: true }, self: { role: "OWNER", canSelfAssign: true } }),
  },
  {
    test: (u) => u.pathname === "/api/settings/permissions",
    handler: () => ({ scopeGrants: { canViewAll: true, canAssign: true, canResolve: true, canDelete: false } }),
  },
  {
    test: (u) => u.pathname === "/api/settings/departments",
    handler: () => [
      { id: "dept-vendas", name: "Vendas", color: "#3B82F6", icon: "briefcase", createdAt: "2026-01-10T10:00:00Z" },
      { id: "dept-suporte", name: "Suporte", color: "#10B981", icon: "headset", createdAt: "2026-01-10T10:00:00Z" },
    ],
  },

  /* ── Demandas ── */
  {
    test: (u) => u.pathname === "/api/demands/boards",
    handler: (_u, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        const body = parseMockBody(init);
        const id = `db-${Date.now()}`;
        const inboxId = `${id}-inbox`;
        const board: PreviewDemandBoard = {
          id,
          name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Novo board",
          slug: id,
          kind: "PRODUCT",
          color: "#3B82F6",
          description: typeof body.description === "string" ? body.description : null,
          position: DEMAND_BOARDS.length,
          isDefault: false,
          stages: [
            {
              id: inboxId,
              name: "Inbox",
              key: "INBOX",
              color: null,
              position: 0,
              isTerminal: false,
              items: [],
            },
          ],
        };
        DEMAND_BOARDS = [...DEMAND_BOARDS, board];
        return demandBoardLite(board);
      }
      return { boards: DEMAND_BOARDS.map(demandBoardLite) };
    },
  },
  {
    test: (u) => /^\/api\/demands\/boards\/[^/]+$/.test(u.pathname),
    handler: (u, init) => {
      const id = u.pathname.split("/")[4];
      const method = (init?.method ?? "GET").toUpperCase();
      const board = DEMAND_BOARDS.find((b) => b.id === id);
      if (method === "DELETE") {
        DEMAND_BOARDS = DEMAND_BOARDS.filter((b) => b.id !== id);
        return { ok: true };
      }
      if (method === "POST" && board) {
        const body = parseMockBody(init);
        const name =
          typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Nova fase";
        const stage: PreviewDemandStage = {
          id: `ds-${Date.now()}`,
          name,
          key: name.toUpperCase().replace(/\s+/g, "_"),
          color: typeof body.color === "string" ? body.color : null,
          position: board.stages.length,
          isTerminal: false,
          items: [],
        };
        board.stages = [...board.stages, stage];
        return stage;
      }
      return board ?? DEMAND_BOARDS[0];
    },
  },
  {
    test: (u) => u.pathname === "/api/demands/items",
    handler: (_u, init) => {
      const body = parseMockBody(init);
      const boardId = typeof body.boardId === "string" ? body.boardId : DEMAND_BOARDS[0]?.id;
      const board = DEMAND_BOARDS.find((b) => b.id === boardId) ?? DEMAND_BOARDS[0];
      if (!board) return { ok: false };
      const stageId =
        typeof body.stageId === "string"
          ? body.stageId
          : board.stages[0]?.id;
      const stage = board.stages.find((s) => s.id === stageId) ?? board.stages[0];
      if (!stage) return { ok: false };
      const item = previewDemandItem({
        id: `di-${Date.now()}`,
        number:
          DEMAND_BOARDS.reduce((max, b) => {
            const n = b.stages.flatMap((s) => s.items).reduce((m, it) => Math.max(m, it.number), 0);
            return Math.max(max, n);
          }, 0) + 1,
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Nova solicitação",
        description: typeof body.description === "string" ? body.description : "",
        kind: typeof body.kind === "string" ? body.kind : "REQUEST",
        priority: typeof body.priority === "string" ? body.priority : "NONE",
        boardId: board.id,
        stageId: stage.id,
        position: stage.items.length,
      });
      stage.items = [...stage.items, item];
      return item;
    },
  },
  {
    test: (u) => /^\/api\/demands\/items\/[^/]+\/(comments|vote|move)$/.test(u.pathname),
    handler: (u, init) => {
      const id = u.pathname.split("/")[4];
      const action = u.pathname.split("/")[5];
      const found = findDemandItem(id);
      if (!found) return { ok: false };
      if (action === "vote") {
        found.item.votedByMe = !found.item.votedByMe;
        found.item.votesCount += found.item.votedByMe ? 1 : -1;
        return { item: found.item, votedByMe: found.item.votedByMe };
      }
      if (action === "comments") {
        const body = parseMockBody(init);
        return {
          id: `dc-${Date.now()}`,
          content: typeof body.content === "string" ? body.content : "",
          createdAt: new Date().toISOString(),
          author: DEMAND_ACTOR,
        };
      }
      if (action === "move") {
        const body = parseMockBody(init);
        const nextStageId = typeof body.stageId === "string" ? body.stageId : found.stage.id;
        const nextStage =
          found.board.stages.find((s) => s.id === nextStageId) ?? found.stage;
        found.stage.items = found.stage.items.filter((it) => it.id !== found.item.id);
        found.item.stageId = nextStage.id;
        nextStage.items = [...nextStage.items, found.item];
        return found.item;
      }
      return found.item;
    },
  },
  {
    test: (u) => /^\/api\/demands\/items\/[^/]+$/.test(u.pathname),
    handler: (u, init) => {
      const id = u.pathname.split("/")[4];
      const method = (init?.method ?? "GET").toUpperCase();
      const found = findDemandItem(id);
      if (method === "DELETE") {
        if (found) {
          found.stage.items = found.stage.items.filter((it) => it.id !== id);
        }
        return { ok: true };
      }
      if (method === "PATCH" && found) {
        const patch = parseMockBody(init);
        Object.assign(found.item, patch);
        found.item.updatedAt = new Date().toISOString();
        return found.item;
      }
      return found ? demandItemDetail(found.item) : { comments: [], events: [] };
    },
  },

  /* ── Inbox ── */
  {
    test: (u) => u.pathname === "/api/inbox/agent-capacity",
    handler: () => ({ activeConversations: 5, maxConcurrent: 10, loadPct: 50, tone: "healthy" }),
  },
  {
    test: (u) => u.pathname === "/api/inbox/daily-stats",
    handler: () => ({ resolved: 24, responded: 38, pending: 5, total: 67 }),
  },

  /* ── Conversations ── */
  {
    test: (u) => u.pathname === "/api/conversations" && u.searchParams.get("counts") === "1",
    handler: () => ({
      todos:      CONVERSATIONS.length,
      entrada:    CONVERSATIONS.filter((c) => c.status === "OPEN" && !c.assignedTo).length + 4,
      esperando:  CONVERSATIONS.filter((c) => c.unreadCount > 0).length + 2,
      respondidas: CONVERSATIONS.filter((c) => c.lastMessage.direction === "out").length,
      ligar:      0,
      // Nenhuma conversa do fixture tem responsável IA (os mocks de
      // `assignedTo` são todos consultores humanos).
      agente_ia:  0,
      automacao:  2,
      finalizados: CONVERSATIONS.filter((c) => c.status === "RESOLVED").length,
      erro:       CONVERSATIONS.filter((c) => c.hasError).length,
    }),
  },
  {
    test: (u) => u.pathname === "/api/conversations",
    handler: (u) => {
      const tab    = u.searchParams.get("tab") ?? "todos";
      const search = (u.searchParams.get("search") ?? "").toLowerCase();
      let items = [...CONVERSATIONS];
      if (tab === "entrada")     items = items.filter((c) => c.status === "OPEN");
      if (tab === "esperando")   items = items.filter((c) => c.unreadCount > 0);
      if (tab === "respondidas") items = items.filter((c) => c.lastMessage.direction === "out");
      if (tab === "agente_ia")   items = [];
      if (tab === "finalizados") items = items.filter((c) => c.status === "RESOLVED");
      if (tab === "erro")        items = items.filter((c) => c.hasError);
      if (search) items = items.filter((c) => c.contact.name.toLowerCase().includes(search));
      return { items, total: items.length, page: 1, perPage: 60, nextCursor: null, hasMore: false };
    },
  },
  {
    test: (u) => /^\/api\/conversations\/[^/]+\/messages$/.test(u.pathname),
    handler: (u) => ({
      messages: makeMessages(u.pathname.split("/")[3]),
      pinnedNoteId: null,
      channelProvider: "WHATSAPP_META",
      session: {
        active: true,
        lastInboundAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 22 * 3600 * 1000).toISOString(),
      },
    }),
  },
  {
    test: (u) => /^\/api\/conversations\/[^/]+\/(actions|read|typing|pin-note|tags)$/.test(u.pathname),
    handler: (u) => {
      const convId = u.pathname.split("/")[3];
      const conv   = CONVERSATIONS.find((c) => c.id === convId) ?? CONVERSATIONS[0];
      return { ok: true, conversation: conv, appliedToContact: true, appliedToDeal: null };
    },
  },
  {
    test: (u) => u.pathname === "/api/conversations/bulk" || u.pathname === "/api/conversations/create",
    handler: () => ({ ok: true, conversation: { id: CONVERSATIONS[0].id } }),
  },
  {
    test: (u) => /^\/api\/conversations\/[^/]+\/forward$/.test(u.pathname),
    handler: () => ({ ok: true }),
  },
  {
    test: (u) => /^\/api\/conversations\/[^/]+\/template$/.test(u.pathname),
    handler: (u) => {
      const convId = u.pathname.split("/")[3];
      return {
        message: {
          id: `${convId}-tpl-${Date.now()}`,
          conversationId: convId,
          direction: "out",
          content: "Template enviado",
          messageType: "template",
          private: false,
          status: "SENT",
          createdAt: new Date().toISOString(),
          readAt: null,
          replyToId: null,
          reactions: [],
          media: null,
          sender: { id: USER.id, name: USER.name, kind: "AGENT" },
          metaError: null,
        },
      };
    },
  },

  /* ── Directory ── */
  {
    test: (u) => u.pathname === "/api/contacts",
    handler: () => ({
      items: CONTACTS_LIST,
      total: CONTACTS_LIST.length,
      page: 1,
      perPage: 20,
    }),
  },
  {
    test: (u) => /^\/api\/contacts\/[^/]+$/.test(u.pathname),
    handler: (u) => {
      const id = u.pathname.split("/")[3];
      return CONTACTS.find((c) => c.id === id) ?? CONTACTS[0];
    },
  },
  {
    test: (u) => u.pathname === "/api/companies/stats",
    handler: () => ({
      total: COMPANIES_LIST.length,
      withContacts: COMPANIES_LIST.filter((c) => (c._count?.contacts ?? 0) > 0).length,
      withoutEmail: COMPANIES_LIST.filter((c) => !c.domain).length,
      withoutPhone: COMPANIES_LIST.filter((c) => !c.phone).length,
    }),
  },
  {
    test: (u) => u.pathname === "/api/companies",
    handler: () => ({
      items: COMPANIES_LIST,
      total: COMPANIES_LIST.length,
      page: 1,
      perPage: 20,
    }),
  },
  {
    test: (u) => /^\/api\/companies\/[^/]+$/.test(u.pathname),
    handler: (u) => COMPANIES.find((c) => c.id === u.pathname.split("/")[3]) ?? COMPANIES[0],
  },
  {
    test: (u) => u.pathname === "/api/activities",
    handler: () => ({ items: ACTIVITIES, total: ACTIVITIES.length, page: 1, perPage: 50 }),
  },

  /* ── Automations ── */
  {
    test: (u) => u.pathname === "/api/automations",
    handler: () => ({
      items: AUTOMATIONS.map(({ steps: _s, ...a }) => a),
      total: AUTOMATIONS.length,
      page: 1, perPage: 50,
    }),
  },
  {
    test: (u) => /^\/api\/automations\/[^/]+$/.test(u.pathname),
    handler: (u) => AUTOMATIONS.find((a) => a.id === u.pathname.split("/")[3]) ?? AUTOMATIONS[0],
  },

  /* ── Pipelines / Deals ── */
  {
    test: (u) => u.pathname === "/api/pipelines",
    handler: () => PIPELINES,
  },
  {
    test: (u) => /^\/api\/pipelines\/[^/]+\/stages$/.test(u.pathname) || u.pathname === "/api/stages",
    handler: () => STAGES,
  },
  {
    test: (u) => u.pathname === "/api/deals",
    handler: () => {
      const items = DEALS.map(enrichDeal);
      return { items, total: items.length, page: 1, perPage: 50 };
    },
  },
  {
    test: (u) => /^\/api\/deals\/[^/]+$/.test(u.pathname),
    handler: (u) => {
      const deal = DEALS.find((d) => d.id === u.pathname.split("/")[3]) ?? DEALS[0];
      const contact = CONTACTS.find((c) => c.id === deal.contactId) ?? CONTACTS[0];
      return {
        ...enrichDeal(deal),
        contact: {
          ...contact,
          tags: contact.tags,
          deals: contact.deals,
          activities: contact.activities,
        },
        customFields: {},
        lostReason: deal.lostReason,
      };
    },
  },
  {
    test: (u) => u.pathname === "/api/deal-tags" || u.pathname === "/api/tags",
    handler: () => ({ items: TAGS, total: TAGS.length }),
  },
  {
    test: (u) => /^\/api\/pipelines\/[^/]+\/board/.test(u.pathname),
    handler: () => ({ stages: BOARD_STAGES }),
  },
  {
    test: (u) => /^\/api\/(deals|board)/.test(u.pathname),
    handler: () => ({ items: DEALS.map(enrichDeal), deals: DEALS.map(enrichDeal), stages: STAGES, total: DEALS.length }),
  },

  /* ── Analytics / Dashboard ── */
  {
    test: (u) => u.pathname === "/api/analytics/deals-overview",
    handler: () => DEALS_OVERVIEW,
  },
  {
    test: (u) => u.pathname === "/api/analytics/service-overview",
    handler: () => SERVICE_OVERVIEW,
  },

  /* ── Misc ── */
  {
    test: (u) => u.pathname === "/api/channels",
    handler: () => ({ items: CHANNELS, total: CHANNELS.length }),
  },
  {
    test: (u) => u.pathname === "/api/quick-replies",
    handler: () => ({ items: QUICK_REPLIES, total: QUICK_REPLIES.length }),
  },
  {
    test: (u) => u.pathname === "/api/templates",
    handler: () => INTERNAL_TEMPLATES,
  },
  {
    test: (u) => u.pathname === "/api/whatsapp-template-configs/agent-enabled",
    handler: () => ({ items: WA_TEMPLATES, total: WA_TEMPLATES.length }),
  },
  {
    // Automação usa os aprovados (shape de array, igual ao endpoint real).
    test: (u) => u.pathname === "/api/whatsapp-template-configs/approved",
    handler: () => WA_TEMPLATES,
  },
  {
    test: (u) => u.pathname === "/api/health",
    handler: () => ({ status: "ok", preview: true }),
  },
  {
    test: (u) => u.pathname.startsWith("/api/push/"),
    handler: () => ({ ok: true }),
  },
  {
    test: (u) => u.pathname.startsWith("/api/notifications"),
    handler: () => ({ items: [], total: 0 }),
  },
  {
    test: (u) => u.pathname === "/api/media/transcribe",
    handler: () => ({ transcript: "Quinta às 14h está ótimo pra mim!" }),
  },
  {
    test: (u) => /^\/api\/messages\/[^/]+\/reactions$/.test(u.pathname),
    handler: () => ({ reactions: [{ emoji: "👍", count: 1, byMe: true }] }),
  },
  {
    test: (u) => /^\/api\/ai-agents\/drafts\/[^/]+\/(approve|discard)$/.test(u.pathname),
    handler: () => ({ ok: true }),
  },

  /* ── RBAC v2: Roles ── */
  {
    test: (u) => u.pathname === "/api/roles",
    handler: () => ROLES,
  },
  {
    test: (u) => /^\/api\/roles\/[^/]+\/assignments$/.test(u.pathname),
    handler: (u) => {
      const roleId = u.pathname.split("/")[3];
      const role = ROLES.find((r) => r.id === roleId) ?? ROLES[0];
      return role._members ?? [];
    },
  },
  {
    test: (u) => /^\/api\/roles\/[^/]+\/assignments\/[^/]+$/.test(u.pathname),
    handler: () => ({ ok: true }),
  },
  {
    test: (u) => /^\/api\/roles\/[^/]+$/.test(u.pathname),
    handler: (u) => ROLES.find((r) => r.id === u.pathname.split("/")[3]) ?? ROLES[0],
  },

  /* ── RBAC v2: Permissions catalog ── */
  {
    test: (u) => u.pathname === "/api/permissions/catalog",
    handler: () => ({ resources: PERMISSION_CATALOG_MOCK }),
  },

  /* ── RBAC v2: Effective permissions ── */
  {
    test: (u) => /^\/api\/users\/[^/]+\/effective-permissions$/.test(u.pathname),
    handler: () => EFFECTIVE_PERMISSIONS_MOCK,
  },

  /* ── Settings: Feature flags ── */
  {
    test: (u) => u.pathname === "/api/settings/feature-flags",
    handler: () => FEATURE_FLAGS_MOCK,
  },
];

export function findMockResponse(url: URL, init?: RequestInit): Response | null {
  const method = (init?.method ?? "GET").toUpperCase();
  for (const route of ROUTES) {
    if (route.test(url, method)) {
      const payload = route.handler(url, init);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Preview-Mock": "1" },
      });
    }
  }
  // Fallback GET → lista vazia
  if (method === "GET" && url.pathname.startsWith("/api/")) {
    return new Response(
      JSON.stringify({ items: [], total: 0, page: 1, perPage: 50 }),
      { status: 200, headers: { "Content-Type": "application/json", "X-Preview-Mock": "1-fallback" } },
    );
  }
  // Fallback mutations
  if (url.pathname.startsWith("/api/")) {
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json", "X-Preview-Mock": "1-mutation" } },
    );
  }
  return null;
}
