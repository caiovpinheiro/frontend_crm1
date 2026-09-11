import type { AutomationStats } from "@/lib/automation-stats-types";

import type {
  AutomationDetailDto,
  AutomationListItemDto,
  AutomationListPage,
  AutomationListSummary,
  AutomationLogsPage,
  AutomationWriteBody,
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
    number: 1,
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
    number: 2,
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
    number: 3,
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
    number: 4,
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
    number: 5,
    name: "Bem vindo – Lead de Entrada",
    description: "Webhook + atraso + ramificação para lead novo.",
    triggerType: "deal_created",
    triggerConfig: null,
    active: true,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(0),
    stepCount: 27,
    stepTypes: ["execute_distribution", "delay", "condition"],
    runs: 65,
    runsToday: 8,
    successRate: 100,
    lastRunAt: ago(2),
  },
  {
    id: "auto-6",
    number: 6,
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
    number: 7,
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
    number: 8,
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
    number: 9,
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

function isUsableAutomationId(id: string): boolean {
  const s = id.trim();
  return s.length > 0 && s !== "undefined" && s !== "null";
}

function defaultConfigForStep(type: string): Record<string, unknown> {
  if (type === "execute_distribution") return { mode: "leads" };
  if (type === "delay") return { ms: 60_000 };
  return {};
}

function stepsFor(item: AutomationListItemDto): AutomationDetailDto["steps"] {
  const types = item.stepTypes?.length ? item.stepTypes : ["finish"];
  return types.map((type, i) => ({
    id: `${item.id}-s${i + 1}`,
    automationId: item.id,
    type,
    config: defaultConfigForStep(type),
    position: i,
  }));
}

function findMockItem(id: string): AutomationListItemDto | undefined {
  if (!isUsableAutomationId(id)) return undefined;
  return MOCK_ITEMS.find(
    (a) => a.id === id || (a.number != null && String(a.number) === id),
  );
}

export function mockAutomationDetail(id: string): AutomationDetailDto | null {
  const item = findMockItem(id);
  if (!item) return null;
  return { ...item, steps: stepsFor(item) };
}

export function mockAutomationStats(): AutomationStats {
  return { trigger: {}, steps: {} };
}

export function mockAutomationLogs(): AutomationLogsPage {
  return { items: [], logs: [], total: 0, page: 1, perPage: 50 };
}

export function mockCreateAutomation(
  body: AutomationWriteBody,
): AutomationDetailDto {
  const number =
    MOCK_ITEMS.reduce((max, a) => Math.max(max, a.number ?? 0), 0) + 1;
  const id = `auto-${number}`;
  const item: AutomationListItemDto = {
    id,
    number,
    name: body.name?.trim() || "Nova automação",
    description: body.description ?? null,
    triggerType: body.triggerType ?? "manual",
    triggerConfig: body.triggerConfig ?? null,
    active: body.active ?? false,
    allowManualRun: body.allowManualRun,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stepCount: 0,
    stepTypes: [],
    runs: 0,
    runsToday: 0,
    successRate: 0,
    lastRunAt: null,
  };
  MOCK_ITEMS.unshift(item);
  return { ...item, steps: [] };
}

export function mockReplaceAutomation(
  id: string,
  body: AutomationWriteBody,
): AutomationDetailDto | null {
  const item = findMockItem(id);
  if (!item) return null;
  if (typeof body.name === "string" && body.name.trim()) item.name = body.name.trim();
  if (body.description !== undefined) item.description = body.description;
  if (typeof body.triggerType === "string") item.triggerType = body.triggerType;
  if (body.triggerConfig !== undefined) item.triggerConfig = body.triggerConfig;
  if (typeof body.active === "boolean") item.active = body.active;
  if (typeof body.allowManualRun === "boolean") item.allowManualRun = body.allowManualRun;
  if (body.steps) {
    item.stepCount = body.steps.length;
    item.stepTypes = body.steps.map((s) => s.type);
    item.updatedAt = new Date().toISOString();
    return {
      ...item,
      steps: body.steps.map((s, i) => ({
        id: s.id ?? `${item.id}-s${i + 1}`,
        automationId: item.id,
        type: s.type,
        config: (s.config as Record<string, unknown> | null) ?? {},
        position: i,
      })),
    };
  }
  item.updatedAt = new Date().toISOString();
  return { ...item, steps: stepsFor(item) };
}
