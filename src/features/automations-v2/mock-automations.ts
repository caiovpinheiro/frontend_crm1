import type {
  AutomationListItemDto,
  AutomationListPage,
  AutomationListSummary,
  FetchAutomationsParams,
} from "./api";

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const MOCK_ITEMS: AutomationListItemDto[] = [
  {
    id: "auto-1",
    name: "Aguardando Resposta",
    description: "Espera resposta do lead e encerra se não houver retorno.",
    triggerType: "message_sent",
    triggerConfig: null,
    active: true,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(0),
    stepCount: 16,
    stepTypes: ["condition", "delay", "finish"],
    runs: 2313,
    runsToday: 120,
    successRate: 100,
    lastRunAt: ago(0),
  },
  {
    id: "auto-2",
    name: "BV – Calouros",
    description: "Onboarding de calouros com documentos e agente de IA.",
    triggerType: "deal_created",
    triggerConfig: null,
    active: true,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(1),
    stepCount: 45,
    stepTypes: ["send_email", "ask_ai_agent", "ask_ai_agent"],
    runs: 0,
    runsToday: 0,
    successRate: 0,
    lastRunAt: null,
  },
  {
    id: "auto-3",
    name: "acad_banido",
    description: "Trata mensagem recebida de aluno banido.",
    triggerType: "message_received",
    triggerConfig: null,
    active: false,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(5),
    stepCount: 7,
    stepTypes: ["condition", "send_whatsapp_message", "add_tag"],
    runs: 0,
    runsToday: 0,
    successRate: 0,
    lastRunAt: null,
  },
  {
    id: "auto-4",
    name: "Encerramento",
    description: "Encerra conversa tabulada com ramificações.",
    triggerType: "conversation_created",
    triggerConfig: null,
    active: true,
    createdAt: daysAgo(40),
    updatedAt: daysAgo(0),
    stepCount: 21,
    stepTypes: ["delay", "condition", "condition"],
    runs: 562,
    runsToday: 40,
    successRate: 100,
    lastRunAt: ago(0),
  },
  {
    id: "auto-5",
    name: "Bem vindo – Lead de Entrada",
    description: "Webhook + atraso + ramificação para lead novo.",
    triggerType: "deal_created",
    triggerConfig: null,
    active: true,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(0),
    stepCount: 27,
    stepTypes: ["webhook", "delay", "condition"],
    runs: 65,
    runsToday: 8,
    successRate: 100,
    lastRunAt: ago(2),
  },
  {
    id: "auto-6",
    name: "teste robin",
    description: "Fluxo de teste round-robin.",
    triggerType: "manual",
    triggerConfig: null,
    active: false,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    stepCount: 5,
    stepTypes: ["trigger", "finish", "add_tag"],
    runs: 0,
    runsToday: 0,
    successRate: 0,
    lastRunAt: null,
  },
  {
    id: "auto-7",
    name: "Ativação Campanha",
    description: "Ativa campanha quando o estágio muda.",
    triggerType: "stage_changed",
    triggerConfig: null,
    active: false,
    createdAt: daysAgo(15),
    updatedAt: daysAgo(3),
    stepCount: 8,
    stepTypes: ["send_email", "add_tag", "send_whatsapp_message"],
    runs: 0,
    runsToday: 0,
    successRate: 0,
    lastRunAt: null,
  },
  {
    id: "auto-8",
    name: "Saudação Agente-IA",
    description: "Saudação ao lead distribuído.",
    triggerType: "agent_changed",
    triggerConfig: null,
    active: false,
    createdAt: daysAgo(8),
    updatedAt: daysAgo(2),
    stepCount: 3,
    stepTypes: ["send_whatsapp_message", "finish"],
    runs: 0,
    runsToday: 0,
    successRate: 0,
    lastRunAt: null,
  },
  {
    id: "auto-9",
    name: "AR Pós-Graduação – MSG",
    description: "Sequência de mídia e mensagem.",
    triggerType: "manual",
    triggerConfig: null,
    active: true,
    createdAt: daysAgo(12),
    updatedAt: daysAgo(1),
    stepCount: 10,
    stepTypes: ["send_whatsapp_media", "send_whatsapp_message", "send_whatsapp_media"],
    runs: 0,
    runsToday: 0,
    successRate: 0,
    lastRunAt: null,
  },
];

export function mockAutomationsPage(
  params: FetchAutomationsParams = {},
): AutomationListPage {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 30;
  let items = [...MOCK_ITEMS];

  if (params.active === true) items = items.filter((a) => a.active);
  if (params.active === false) items = items.filter((a) => !a.active);

  const q = params.search?.trim().toLowerCase();
  if (q) {
    items = items.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        a.triggerType.toLowerCase().includes(q),
    );
  }

  const total = items.length;
  const start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    total,
    page,
    perPage,
  };
}

export function mockAutomationSummary(): AutomationListSummary {
  const active = MOCK_ITEMS.filter((a) => a.active).length;
  const runsToday = MOCK_ITEMS.reduce((sum, a) => sum + (a.runsToday ?? 0), 0);
  const avgSuccess =
    MOCK_ITEMS.length === 0
      ? 0
      : Math.round(
          MOCK_ITEMS.reduce((sum, a) => sum + (a.successRate ?? 0), 0) /
            MOCK_ITEMS.length,
        );
  return {
    total: MOCK_ITEMS.length,
    active,
    paused: MOCK_ITEMS.length - active,
    runsToday,
    avgSuccess,
  };
}

export const MOCK_AUTOMATIONS_PAGE = mockAutomationsPage({ perPage: 200 });
