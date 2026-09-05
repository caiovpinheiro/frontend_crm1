import {
  createDefaultPiloting,
  type PilotingValue,
} from "@/components/ai-agents/piloting-panel";
import { ACADEMIC_ATENDIMENTO_RULES } from "@/lib/ai-agents/academic-atendimento-prompt";
import { ARCHETYPES } from "@/lib/ai-agents/archetypes";
import {
  defaultAttendanceScope,
  defaultInboxPolicy,
  emptyToolPolicy,
  type AttendanceScope,
  type InboxPolicy,
  type ToolConfigMap,
} from "@/lib/ai-agents/steering";

export type AgentSectionId =
  | "identity"
  | "rules"
  | "scope"
  | "tools"
  | "piloting"
  | "inbox"
  | "knowledge";

export type AutonomyMode = "AUTONOMOUS" | "DRAFT";

export type AgentArchetype = "SDR" | "ATENDIMENTO" | "VENDEDOR" | "SUPORTE";

/** Contrato do formulário — espelha GET/PUT `/api/ai-agents/:id`. */
export type AgentSettingsValues = {
  name: string;
  tone: string;
  model: string;
  temperature: number;
  dailyTokenCap: number;
  autonomyMode: AutonomyMode;
  enabledTools: string[];
  systemPromptOverride: string;
  systemPromptTemplate: string;
  steeringRules: string;
  productPolicy: string;
  toolConfig: ToolConfigMap;
  attendanceScope: AttendanceScope;
  inboxPolicy: InboxPolicy;
  piloting: PilotingValue;
  archetype: AgentArchetype;
};

/** Fallback de empty state — não é backend fake. */
export const EMPTY_AGENT_SETTINGS: AgentSettingsValues = {
  name: "",
  tone: "",
  model: "gpt-4o-mini",
  temperature: 0.7,
  dailyTokenCap: 0,
  autonomyMode: "DRAFT",
  enabledTools: [],
  systemPromptOverride: "",
  systemPromptTemplate: "",
  steeringRules: "",
  productPolicy: "",
  toolConfig: {},
  attendanceScope: defaultAttendanceScope(),
  inboxPolicy: defaultInboxPolicy(),
  piloting: createDefaultPiloting(),
  archetype: "ATENDIMENTO",
};

export const AGENT_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
] as const;

/** Id sentinela — o lápis do card vazio abre o modal sem chamar a API. */
export const PREVIEW_AGENT_ID = "__preview__";

export function isPreviewAgentId(id: string | null | undefined): boolean {
  return id === PREVIEW_AGENT_ID;
}

/** Funis/etapas só para o empty-state do modal (API de pipelines vazia). */
export const PREVIEW_PIPELINES: Array<{
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
}> = [
  {
    id: "preview-pipeline-academico",
    name: "Atendimento acadêmico",
    stages: [
      { id: "preview-stage-triagem", name: "Triagem" },
      { id: "preview-stage-em-atendimento", name: "Em atendimento" },
      { id: "preview-stage-resolvido", name: "Resolvido" },
    ],
  },
  {
    id: "preview-pipeline-comercial",
    name: "Comercial",
    stages: [
      { id: "preview-stage-novo", name: "Novo lead" },
      { id: "preview-stage-qualificacao", name: "Qualificação" },
      { id: "preview-stage-proposta", name: "Proposta" },
      { id: "preview-stage-perdido", name: "Perdido" },
    ],
  },
];

const ATENDIMENTO = ARCHETYPES.find((a) => a.id === "ATENDIMENTO");

const PREVIEW_MATRICULA_POLICY = emptyToolPolicy();
PREVIEW_MATRICULA_POLICY.argHints = {
  contactId: "Não envie — o sistema resolve pelo telefone do contato.",
};
PREVIEW_MATRICULA_POLICY.policyText =
  "Uso interno. Não confirme situação financeira nem RGM no WhatsApp. Se o aluno pedir boleto ou status de matrícula, transfira.";
PREVIEW_MATRICULA_POLICY.transferMessage =
  "Vou te passar para o time acadêmico com o contexto da matrícula, tá?";

/** Mock rico para navegar as 7 seções quando a lista da API está vazia. */
export const PREVIEW_AGENT_SETTINGS: AgentSettingsValues = {
  name: "Agente academico",
  tone: ATENDIMENTO?.defaultTone ?? "simpática, paciente e natural (WhatsApp)",
  model: ATENDIMENTO?.suggestedModel ?? "gpt-4.1-mini",
  temperature: 0.4,
  dailyTokenCap: 80_000,
  autonomyMode: "DRAFT",
  enabledTools: ["consultar_matricula"],
  systemPromptOverride:
    "Priorize calouros e dúvidas de portal/Blackboard. Se o aluno pedir preço, turma ou desconto, transfira. Nunca invente data de início de aula.",
  systemPromptTemplate:
    ATENDIMENTO?.systemPromptTemplate ?? EMPTY_AGENT_SETTINGS.systemPromptTemplate,
  steeringRules: ACADEMIC_ATENDIMENTO_RULES,
  productPolicy:
    "Ao falar de curso, use só o catálogo. Destaque carga horária, polo e modalidade. Preço só se vier da tool — senão, transfira.",
  toolConfig: {
    consultar_matricula: PREVIEW_MATRICULA_POLICY,
  },
  attendanceScope: {
    allowedPipelineIds: ["preview-pipeline-academico"],
    blockedPipelineIds: [],
    allowedStageIds: ["preview-stage-triagem", "preview-stage-em-atendimento"],
    blockedStageIds: ["preview-stage-resolvido"],
    allowedContactTags: ["calouros1008_1", "matricula-2026"],
    blockedContactTags: ["inadimplente", "juridico"],
    attendWithoutDeal: true,
    action: "handoff",
    message:
      "Vou te passar para um consultor acadêmico, tá? Já já alguém te atende.",
  },
  inboxPolicy: {
    confidenceThreshold: 0.4,
    lowConfidenceHandoff: true,
    interceptRetention: true,
    interceptCourseShopping: true,
    retentionKeywords: ["trancar", "cancelar matrícula", "reembolso"],
    courseShoppingKeywords: ["quanto custa", "mensalidade", "bolsa"],
    departmentAliases: {
      acolhimento: ["acolhimento", "recepção"],
      retencao: ["retenção", "evasão"],
      atendimento: ["atendimento", "suporte acadêmico"],
    },
    inauguralEnabled: true,
    inauguralUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    inauguralDates: ["2026-02-10", "2026-02-11"],
    scope: defaultAttendanceScope(),
    handoffMessage:
      "Vou te conectar com um consultor humano agora. Ele já vai ver o histórico.",
    retentionHandoffMessage:
      "Entendi que você quer revisar a matrícula. Vou te passar para retenção.",
  },
  piloting: {
    ...createDefaultPiloting(),
    openingMessage:
      "Oi, {{contact.firstName}}! Sou do suporte acadêmico. Como posso te ajudar?",
    openingDelayMs: 1200,
    inactivityTimerMs: 30 * 60 * 1000,
    inactivityHandoffMode: "UNASSIGN",
    inactivityFarewellMessage:
      "Fico por aqui. Quando quiser, é só mandar outra mensagem.",
    keywordHandoffs: ["atendente", "humano", "consultor", "reclamação"],
    qualificationQuestions: [
      { id: "q-curso", question: "Qual curso ou turma?", hint: "nome do curso" },
      { id: "q-polo", question: "Qual polo ou cidade?", hint: "cidade" },
    ],
    businessHours: {
      enabled: true,
      timezone: "America/Sao_Paulo",
      weekdays: [
        { day: 1, start: "08:00", end: "18:00" },
        { day: 2, start: "08:00", end: "18:00" },
        { day: 3, start: "08:00", end: "18:00" },
        { day: 4, start: "08:00", end: "18:00" },
        { day: 5, start: "08:00", end: "18:00" },
      ],
      offHoursMessage:
        "Nosso horário é das 8h às 18h. Deixa sua dúvida que a gente responde no próximo expediente.",
    },
    outputStyle: "conversational",
    simulateTyping: true,
    typingPerCharMs: 25,
    markMessagesRead: true,
    autoClosePolicy: {
      mode: "explicit",
      keywords: ["pode encerrar", "resolvido", "obrigado, era isso"],
      message: "Tudo certo. Qualquer coisa é só chamar de novo.",
    },
  },
  archetype: "ATENDIMENTO",
};

export const PREVIEW_AGENT_ROW = {
  id: PREVIEW_AGENT_ID,
  userId: "__preview_user__",
  name: "Agente academico",
  email: "agente-academico@ai.local",
  avatarUrl: null,
  archetype: "ATENDIMENTO" as const,
  model: ATENDIMENTO?.suggestedModel ?? "gpt-4.1-mini",
  autonomyMode: "DRAFT" as const,
  enabledTools: ["consultar_matricula"],
  active: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  knowledgeDocsCount: 0,
};

export const SECTION_META: Record<
  AgentSectionId,
  { label: string; description: string }
> = {
  identity: {
    label: "Identidade",
    description: "Nome, tom, modelo e o quanto o agente age sozinho.",
  },
  rules: {
    label: "Regras",
    description: "Instruções de atendimento injetadas no prompt a cada mensagem.",
  },
  scope: {
    label: "Escopo",
    description: "Em quais funis, etapas e tags o agente pode entrar.",
  },
  tools: {
    label: "Ferramentas",
    description: "O que o agente pode executar no CRM e no WhatsApp.",
  },
  piloting: {
    label: "Pilotagem",
    description: "Controles operacionais que valem mesmo se o modelo improvisar.",
  },
  inbox: {
    label: "Inbox",
    description: "Interceptos de confiança, retenção e mensagens de handoff.",
  },
  knowledge: {
    label: "Conhecimento",
    description: "Documentos que o agente consulta por RAG em cada resposta.",
  },
};
