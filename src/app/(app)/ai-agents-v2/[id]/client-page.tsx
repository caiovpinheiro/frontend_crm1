"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconBrain,
  IconTrash,
  IconSend,
  IconPlus,
  IconDeviceFloppy,
  IconRocket,
  IconAlertCircle,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconUpload,
  IconX,
  IconFile,
  IconInfoCircle,
  IconLoader2,
  IconRefresh,
  IconSearch,
  IconBulb,
  IconTool,
  IconRoute,
  IconArrowRight,
  IconMoodSad2,
  IconMoodSmile,
  IconAlertTriangle,
  IconMessageCircle2,
  IconTextSize,
  IconListCheck,
  IconUser,
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
  IconPencil,
  IconDownload,
  IconFileImport,
} from "@tabler/icons-react";

import { AppV2PageShell } from "../../_v2-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChipInput } from "@/components/ai-agents/chip-input";
import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";
import { OpenAiKeyField } from "@/components/agent-settings/openai-key-field";
import { looksLikeOpenAiApiKey } from "@/lib/agent-key";
import { cn, formatDate } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestConversations } from "./test-conversations";
import { CompareHuman } from "./compare-human";
import { CalendarStep } from "./calendar-step";
import { TextListEditor } from "./text-list-editor";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type AgentDetail = {
  id: string;
  name: string;
  active: boolean;
  /** Config publicada (usada pelo WhatsApp). */
  publishedConfig: Record<string, unknown>;
  /** Config em rascunho (usada pela aba Testar). */
  draftConfig?: Record<string, unknown>;
  /** Config efetiva exibida: rascunho primeiro. */
  config: Record<string, unknown>;
  hasUnpublishedChanges: boolean;
  /** Número da última versão publicada (0 se nunca publicado). */
  lastVersionNumber: number;
  hasOwnOpenaiKey: boolean;
  openaiApiKeyHint: string | null;
  createdAt: string;
  updatedAt: string;
};

type Catalogs = {
  departments: Array<{ id: string; name: string }>;
  distributionRules: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; type: string }>;
  aiAgents: Array<{ id: string; name: string }>;
  messageTemplates: Array<{ id: string; name: string }>;
  knowledgeDocs: Array<{ id: string; name: string }>;
  channels: Array<{ id: string; name: string }>;
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
  contactCustomFields: Array<{ id: string; name: string }>;
  dealCustomFields: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  whatsappTemplates: Array<{ id: string; name: string }>;
  models: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; name: string; phone?: string | null; email?: string | null }>;
};

type KnowledgeDoc = {
  id: string;
  title: string;
  source: string;
  mimeType?: string;
  sizeBytes: number;
  status: "PENDING" | "INDEXING" | "READY" | "FAILED";
  errorMessage?: string | null;
  chunkCount?: number;
  createdAt: string;
};

type TestResult = {
  userMessage: string;
  appliedRuleId: string | null;
  appliedRuleName?: string | null;
  themeId: string | null;
  themeName?: string | null;
  reply: string;
  reason: string;
  handoff: boolean;
  closed: boolean;
  toolCalls: Array<{ toolName: string; args: unknown; result: unknown }>;
  ragChunks: Array<{ docId?: string; docTitle?: string; text?: string; score?: number }>;
  executedActions: Array<{ action: Record<string, unknown>; label: string } | Record<string, unknown>>;
  discardedActions: Array<{ action: Record<string, unknown>; label: string; reason: string } | Record<string, unknown>>;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  tone?: string;
  responseLength?: string;
  globalRules?: string[];
  systemPrompt?: string;
  expandedByLength?: boolean;
  crmContext?: {
    contact?: Record<string, unknown> | null;
    selectedDeal?: Record<string, unknown> | null;
    deals?: Array<Record<string, unknown>>;
  };
  dealSelectionReason?: string;
  scrubbedFields?: string[];
  stage?: "idle" | "confirming" | "identifying" | "active" | "closed";
};

/** Rótulo amigável para a ferramenta chamada (sem jargão de código). */
const TOOL_LABELS: Record<string, string> = {
  search_products: "Buscar produtos no catálogo",
  search_crm_records: "Buscar dados do cliente/negócio no CRM",
  knowledge_search: "Buscar nos materiais de consulta",
  list_message_models: "Listar mensagens prontas",
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

const RESPONSE_LENGTH_LABELS: Record<string, string> = {
  short: "Curta",
  medium: "Média",
  long: "Detalhada",
};

type ChatTurn = {
  id: string;
  userMessage: string;
  result?: TestResult;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de opções
// ─────────────────────────────────────────────────────────────────────────────

const BEHAVIOR_OPTIONS = [
  { value: "objective", label: "Mais objetivo", description: "Respostas diretas, consistentes e sem muita variação." },
  { value: "balanced", label: "Equilibrado", description: "Respostas naturais, mantendo consistência e objetividade." },
  { value: "natural", label: "Mais natural", description: "Conversa mais espontânea, com maior variedade na forma de responder." },
  { value: "creative", label: "Mais criativo", description: "Respostas mais variadas e flexíveis, com maior liberdade na comunicação." },
];

const AUTONOMY_OPTIONS = [
  { value: "suggest", label: "Sugerir resposta para a equipe aprovar" },
  { value: "auto", label: "Responder sozinho" },
];

const TYPING_PACE_OPTIONS = [
  { value: "10", label: "Rápida (10 ms por caractere)" },
  { value: "25", label: "Humana média (25 ms por caractere)" },
  { value: "50", label: "Deliberada (50 ms por caractere)" },
  { value: "90", label: "Lenta (90 ms por caractere)" },
];

const ON_DEAL_NOT_FOUND_OPTIONS = [
  { value: "ask_identification", label: "Perguntar dados de identificação" },
  { value: "create_deal", label: "Criar negócio" },
  { value: "handoff", label: "Transferir" },
];

const POST_CLOSE_BEHAVIOR_OPTIONS = [
  { value: "no_reply", label: "Não responder" },
  { value: "short_reply", label: "Responder curtinho" },
  { value: "reopen_and_route", label: "Reabrir e encaminhar" },
  { value: "ask_with_options", label: "Perguntar com botões" },
];

const EMOJI_OPTIONS = [
  { value: "none", label: "Nenhum", example: "A prova será de 02 a 05/10. Quer que eu te passe como acessar?" },
  { value: "light", label: "Poucos", example: "A prova será de 02 a 05/10 📅 Quer que eu te passe como acessar?" },
  { value: "moderate", label: "À vontade", example: "📅 Prova: 02 a 05/10\n👉 Quer que eu te passe como acessar? 😊" },
];

/** Só o que o motor faz para cada tipo de mídia. */
const MEDIA_ACTION_OPTIONS: Record<"audio" | "image" | "document", Array<{ value: string; label: string }>> = {
  audio: [
    { value: "transcribe", label: "Transcrever e continuar o atendimento" },
    { value: "ask_text", label: "Pedir para o cliente escrever" },
    { value: "handoff", label: "Passar para a equipe" },
  ],
  image: [
    { value: "describe", label: "Ler a imagem e continuar o atendimento" },
    { value: "ask_text", label: "Pedir para o cliente escrever" },
    { value: "handoff", label: "Passar para a equipe" },
  ],
  document: [
    { value: "ask_text", label: "Pedir para o cliente escrever" },
    { value: "handoff", label: "Passar para a equipe" },
  ],
};
const MEDIA_KIND_LABEL = { audio: "Áudio", image: "Imagem", document: "Documento" } as const;
const MEDIA_KIND_HINT = {
  audio: "Transcrito com a chave do próprio agente (a mesma conta que ele usa para responder).",
  image: "O modelo do agente descreve a imagem e copia o texto que aparece nela (print de erro, comprovante).",
  document: "Leitura de documento enviado na conversa ainda não está disponível.",
} as const;

const DEST_KIND_OPTIONS = [
  { value: "department", label: "Departamento" },
  { value: "distribution_rule", label: "Distribuição inteligente" },
  { value: "user", label: "Pessoa" },
  { value: "ai_agent", label: "Outro agente de IA" },
  { value: "automation", label: "Automação" },
];

const CONDITION_TYPES = [
  { value: "message_type", label: "Tipo de mensagem" },
  { value: "keywords", label: "Contiver palavras" },
  { value: "contact_tag", label: "Contato tiver etiqueta" },
  { value: "first_message", label: "For a primeira mensagem" },
  { value: "out_of_hours", label: "Estiver fora do horário" },
  { value: "deal_stage", label: "Negócio estiver na etapa" },
  { value: "field_equals", label: "Campo igual a" },
  { value: "no_deal", label: "Cliente não tiver negócio aberto" },
  { value: "survey_received", label: "Pesquisa respondida" },
  { value: "media_kind", label: "Tipo de mídia" },
];

const ACTION_TYPES = [
  { value: "send_message", label: "Enviar mensagem" },
  { value: "set_theme", label: "Definir assunto" },
  { value: "handoff", label: "Passar para uma pessoa" },
  { value: "add_tag", label: "Adicionar etiqueta" },
  { value: "close_conversation", label: "Encerrar conversa" },
  { value: "no_reply", label: "Não responder" },
  { value: "send_message_model", label: "Enviar mensagem pronta" },
  { value: "send_whatsapp_template", label: "Enviar template oficial" },
  { value: "set_variable", label: "Definir variável" },
  { value: "record_knowledge_gap", label: "Registrar dúvida sem resposta" },
];

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Dicionário da tela: termo técnico do motor → o que aparece na tela, em português simples. */
const SCREEN_DICTIONARY: Array<{ term: string; meaning: string }> = [
  { term: "Modelo (preset)", meaning: "Ponto de partida pronto do agente (ex.: Atendimento, Vendas)." },
  { term: "Tom de voz", meaning: "Como o agente fala com o cliente." },
  { term: "Regras que ele sempre segue", meaning: "Instruções fixas, válidas em qualquer assunto." },
  { term: "Campos do contato e do negócio", meaning: "Dados do CRM que o agente pode usar." },
  { term: "Informações fixas da empresa", meaning: "Variáveis como @Nome da empresa, sempre disponíveis nas mensagens." },
  { term: "Materiais de consulta", meaning: "Documentos que o agente pesquisa para responder (também chamado RAG)." },
  { term: "Como a conversa chega", meaning: "De onde vem a primeira mensagem: cliente, automação ou outra pessoa." },
  { term: "Confirmar o cadastro", meaning: "Checar com o cliente se os dados encontrados são dele." },
  { term: "Assuntos / Demandas", meaning: "Os temas que o agente atende (cada um com suas próprias instruções)." },
  { term: "O que ele pode fazer", meaning: "Lista de ações e ferramentas liberadas para o assunto." },
  { term: "Regras automáticas", meaning: "Condições que, quando batem, decidem a resposta antes do agente pensar." },
  { term: "Distribuição inteligente", meaning: "Escolha automática de quem vai atender, pelas regras do CRM." },
  { term: "Passar para uma pessoa", meaning: "Transferir a conversa para alguém da equipe (também chamado handoff)." },
  { term: "Passar para um especialista", meaning: "Transferir para outro agente de IA." },
  { term: "Equipe atendendo / Devolver para o agente", meaning: "Uma pessoa assumiu a conversa; ela pode devolver para o agente quando terminar." },
  { term: "Classificar o atendimento", meaning: "Marcar a tabulação/motivo do atendimento ao encerrar." },
  { term: "Sugerir resposta para aprovar", meaning: "Modo rascunho: o agente escreve, mas alguém aprova antes de enviar." },
  { term: "Por que respondeu isso?", meaning: "Os bastidores da resposta: regra, assunto, ferramentas e motivo." },
  { term: "Conversa de teste", meaning: "Simulação sem afetar clientes reais (também chamado playground)." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Defaults da configuração (garante que todos os campos existam)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Record<string, unknown> = {
  name: "",
  flow: "full",
  channelIds: [],
  model: "gpt-4o-mini",
  responseBehavior: "balanced",
  responseLength: "medium",
  autonomyMode: "suggest",
  simulateTyping: true,
  typingPerCharMs: 25,
  markMessagesRead: true,
  allowedDomains: [],
  tone: "",
  globalRules: [],
  variables: [],
  contextFields: { contact: [], deal: [] },
  dealSelection: "latest",
  media: {
    audio: { action: "handoff" },
    image: { action: "handoff" },
    document: { action: "handoff" },
    confirmUnderstanding: true,
  },
  allowedKnowledgeDocIds: [],
  allowedMessageModelIds: [],
  productPolicy: {
    enabled: false,
    maxItems: 3,
    showPrice: false,
    showConditions: false,
    showImage: false,
    showLink: false,
    citableFields: [],
    actions: [],
  },
  entry: {
    openingEnabled: true,
    openingMessage: "",
    confirmContact: true,
    confirmationFields: [],
    confirmationMessage: "",
    identificationMessage: "",
    onDealNotFound: "ask_identification",
    automationVariablesMapping: {},
    maxAttempts: 2,
  },
  themes: [],
  rules: [],
  handoff: {
    defaultDestination: { type: "department" },
    message: "Vou transferir você para um atendente da equipe.",
    humanRequestKeywords: ["humano", "pessoa", "atendente", "consultor"],
  },
  closure: {
    postCloseWindowHours: 6,
    courtesyBehavior: "short_reply",
    newDemandBehavior: "reopen_and_route",
    ambiguousBehavior: "ask_with_options",
    returnToOriginStage: true,
    goodbyeMessage: "",
  },
  limits: {
    maxCourtesyReplies: 1,
    maxHelpOffers: 1,
    maxStalledExchanges: 2,
    stalledExchangesAction: "handoff",
    nonsenseLimit: 3,
    nonsenseAction: "warn_and_silence",
    silenceMinutes: 30,
    loopDetectionWindowMinutes: 60,
    maxLoopCount: 3,
    maxAiTransfers: 3,
  },
  fallback: {
    unknown: { message: "", action: "handoff" },
    humanRequest: { message: "" },
    noSource: { message: "" },
    error: { message: "" },
  },
  scope: { message: "", forbidden: [] },
  sentiment: { enabled: false, threshold: "dissatisfied", action: "handoff" },
  survey: {
    enabled: false,
    type: "nps",
    when: "immediate",
    question: "Como foi o atendimento?",
    askReason: true,
    maxFrequencyDays: 30,
  },
  businessHours: null,
  inactivity: { enabled: false, nudgeAfter: 30, closeAfter: 1440 },
  tabulation: { enabled: false, when: "on_close", required: false, byTheme: {}, mode: "suggest" },
  enabledTools: [],
  toolGovernor: { maxCallsPerTurn: 6, maxRepeatsPerTool: 2 },
  dailyTokenCap: 0,
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeDefaults<T>(target: T, defaults: Record<string, unknown>): T {
  if (target === undefined || target === null) return JSON.parse(JSON.stringify(defaults)) as T;
  const clone = JSON.parse(JSON.stringify(target)) as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    if (!(key in clone)) {
      clone[key] = JSON.parse(JSON.stringify(defaults[key]));
    } else if (isObject(defaults[key]) && isObject(clone[key])) {
      clone[key] = mergeDefaults(clone[key], defaults[key] as Record<string, unknown>);
    } else if (Array.isArray(defaults[key]) && !Array.isArray(clone[key])) {
      clone[key] = JSON.parse(JSON.stringify(defaults[key]));
    }
  }
  return clone as T;
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function getPath(obj: Record<string, unknown>, path: string, fallback: unknown = undefined) {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (!isObject(cur)) return fallback;
    cur = cur[p];
  }
  return cur === undefined ? fallback : cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split(".");
  const next = clone(obj);
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    cur[p] = isObject(cur[p]) ? clone(cur[p]) : {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAgent(id: string): Promise<AgentDetail> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`);
  return parseApiResponse<AgentDetail>(res, "Erro ao carregar agente v2.");
}

async function updateAgentMeta(
  id: string,
  body: { name?: string; active?: boolean; openaiApiKey?: string | null },
): Promise<AgentDetail> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<AgentDetail>(res, "Erro ao salvar agente v2.");
}

async function saveDraft(id: string, config: Record<string, unknown>): Promise<AgentDetail> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return parseApiResponse<AgentDetail>(res, "Erro ao salvar rascunho.");
}

async function publishAgent(id: string, comment?: string): Promise<{ versionNumber: number }> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  return parseApiResponse<{ versionNumber: number }>(res, "Erro ao publicar agente.");
}

async function validateAgentKey(id: string): Promise<{ ok: boolean; message: string }> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/validate-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await parseApiResponse<{ ok: boolean; error?: string; message?: string }>(res, "Erro ao validar chave.");
  return { ok: data.ok, message: data.message ?? (data.ok ? "Chave válida." : "Chave inválida.") };
}

async function fetchCatalogs(): Promise<Catalogs> {
  const res = await apiFetch("/api/ai-agents-v2/catalogs");
  return parseApiResponse<Catalogs>(res, "Erro ao carregar catálogos.");
}

async function testAgent(
  id: string,
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  contactId?: string,
  stage?: TestResult["stage"],
): Promise<TestResult> {
  const body: Record<string, unknown> = { userMessage, history, stage };
  if (contactId) body.contactId = contactId;
  const res = await apiFetch(`/api/ai-agents-v2/${id}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<TestResult>(res, "Erro ao testar agente.");
}

async function fetchKnowledgeDocs(id: string): Promise<{ items: KnowledgeDoc[]; total: number }> {
  const res = await apiFetch(`/api/ai-agents/${id}/knowledge`);
  return parseApiResponse<{ items: KnowledgeDoc[]; total: number }>(res, "Erro ao carregar materiais.");
}

async function uploadKnowledgeDoc(id: string, file: File): Promise<KnowledgeDoc> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`/api/ai-agents/${id}/knowledge`, {
    method: "POST",
    body: form,
  });
  return parseApiResponse<KnowledgeDoc>(res, "Erro ao enviar material.");
}

async function pasteKnowledgeDoc(id: string, payload: { title: string; content: string }): Promise<KnowledgeDoc> {
  const res = await apiFetch(`/api/ai-agents/${id}/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<KnowledgeDoc>(res, "Erro ao salvar material.");
}

async function deleteKnowledgeDoc(id: string, docId: string): Promise<void> {
  const res = await apiFetch(`/api/ai-agents/${id}/knowledge/${docId}`, {
    method: "DELETE",
  });
  await parseApiResponse<{ ok: boolean }>(res, "Erro ao remover material.");
}

async function retryKnowledgeDoc(id: string, docId: string): Promise<KnowledgeDoc> {
  const res = await apiFetch(`/api/ai-agents/${id}/knowledge/${docId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reindex" }),
  });
  return parseApiResponse<KnowledgeDoc>(res, "Erro ao tentar novamente.");
}

async function testKnowledgeSearch(
  id: string,
  query: string,
): Promise<{ query: string; chunks: Array<{ docId: string; docTitle: string; content: string; distance: number }> }> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/test-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return parseApiResponse(res, "Erro ao testar busca de materiais.");
}

async function getKnowledgeDoc(
  id: string,
  docId: string,
): Promise<KnowledgeDoc & { content?: string | null; contentReconstructed?: boolean }> {
  const res = await apiFetch(`/api/ai-agents/${id}/knowledge/${docId}`);
  return parseApiResponse(res, "Erro ao carregar material.");
}

async function updateKnowledgeDoc(
  id: string,
  docId: string,
  payload: { title: string; content: string },
): Promise<KnowledgeDoc> {
  const res = await apiFetch(`/api/ai-agents/${id}/knowledge/${docId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(res, "Erro ao salvar material.");
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componentes auxiliares
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="space-y-1">
        <h3 className="text-base font-bold leading-tight">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function InfoLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  if (!tooltip) return <Label>{label}</Label>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-1">
          <Label className="cursor-help">{label}</Label>
          <IconInfoCircle className="size-3.5 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-xs leading-relaxed">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function Field({
  label,
  hint,
  tooltip,
  children,
  className,
}: {
  label: string;
  hint?: string;
  tooltip?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <InfoLabel label={label} tooltip={tooltip} />
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DestinationPicker({
  value,
  catalogs,
  onChange,
}: {
  value: { type?: string; id?: string; message?: string } | null | undefined;
  catalogs: Catalogs;
  onChange: (v: { type: string; id?: string; message?: string }) => void;
}) {
  const kind = value?.type ?? "department";
  const id = value?.id ?? "";
  const options =
    kind === "department"
      ? catalogs.departments
      : kind === "distribution_rule"
        ? catalogs.distributionRules
        : kind === "user"
          ? catalogs.users
          : kind === "ai_agent"
            ? catalogs.aiAgents
            : [];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Select value={kind} onValueChange={(t) => onChange({ type: t })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEST_KIND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {options.length > 0 && (
          <Select value={id} onValueChange={(v) => onChange({ type: kind, id: v, message: value?.message })}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <Input
        placeholder="Mensagem específica deste destino (opcional)"
        value={value?.message ?? ""}
        onChange={(e) => onChange({ type: kind, id, message: e.target.value })}
      />
      {id && options.length > 0 && !options.find((o) => o.id === id) && (
        <Badge variant="outline" className="text-destructive border-destructive">
          Não encontrado no CRM
        </Badge>
      )}
    </div>
  );
}

function MultiChip({ label, tooltip, values, onChange, placeholder }: { label: string; tooltip?: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <Field label={label} tooltip={tooltip}>
      <ChipInput values={values} onChange={onChange} placeholder={placeholder} />
    </Field>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard
// ─────────────────────────────────────────────────────────────────────────────

/** Etapa preenchida (✓ na trilha). Etapas opcionais contam como feitas. */
function isStepComplete(
  stepIndex: number,
  cfg: Record<string, unknown> | null,
  agentName: string,
): boolean {
  if (!cfg) return false;
  const contactFields =
    ((cfg.contextFields as Record<string, unknown> | undefined)?.contact as
      | Array<{ key: string }>
      | undefined) ?? [];
  const dealFields =
    ((cfg.contextFields as Record<string, unknown> | undefined)?.deal as
      | Array<{ key: string }>
      | undefined) ?? [];
  switch (STEPS[stepIndex]?.id) {
    case "start":
      return Boolean(agentName.trim()) && ((cfg.channelIds as string[]) ?? []).length > 0;
    case "tone":
      return Boolean((cfg.tone as string)?.trim() || (cfg.systemPromptTemplate as string)?.trim());
    case "context":
      return contactFields.length + dealFields.length > 0;
    case "materials":
      return (
        ((cfg.allowedKnowledgeDocIds as string[]) ?? []).length > 0 ||
        ((cfg.knowledgeDocs as unknown[]) ?? []).length > 0
      );
    case "calendar":
      return (((cfg.calendar as Record<string, unknown> | undefined)?.events as unknown[]) ?? []).length > 0;
    case "entry":
      return Boolean((cfg.entry as Record<string, unknown> | undefined)?.openingMessage);
    case "themes":
      return ((cfg.themes as unknown[]) ?? []).length > 0;
    case "rules":
    case "team":
      return true;
    default:
      return false;
  }
}

const STEPS = [
  {
    id: "start",
    title: "Começar",
    subtitle: "Nome, canal e modelo",
    heading: "Vamos criar seu agente",
    intro: "Dê um nome, escolha onde ele atende e qual modelo de IA ele usa.",
  },
  {
    id: "tone",
    title: "Jeito de falar",
    subtitle: "Tom e regras",
    heading: "Jeito de falar",
    intro: "Defina a personalidade do agente e as regras que ele nunca pode quebrar.",
  },
  {
    id: "context",
    title: "O que ele sabe",
    subtitle: "Dados do cliente",
    heading: "O que ele sabe do cliente",
    intro: "Escolha quais dados do CRM o agente pode consultar e cadastre as informações fixas da empresa.",
  },
  {
    id: "materials",
    title: "Materiais de consulta",
    subtitle: "Documentos, mensagens e produtos",
    heading: "Materiais de consulta",
    intro:
      "Envie os documentos que o agente usa para responder. Ele só afirma o que estiver aqui ou nos dados do cliente. Mais abaixo, as mensagens prontas e os produtos que ele pode enviar.",
  },
  {
    id: "calendar",
    title: "Calendário",
    subtitle: "Datas e prazos",
    heading: "Calendário",
    intro:
      "Datas e prazos oficiais que o agente usa para responder “quando é”, “qual a próxima” e “ainda dá tempo”. Fica separado dos materiais porque o sistema calcula sozinho o que já passou e o que vem.",
  },
  {
    id: "entry",
    title: "Início da conversa",
    subtitle: "Boas-vindas e confirmação",
    heading: "Início da conversa",
    intro: "Como o agente cumprimenta, confirma com quem está falando e o que faz quando não encontra o cliente.",
  },
  {
    id: "themes",
    title: "Assuntos",
    subtitle: "O que ele atende",
    heading: "Assuntos que ele atende",
    intro:
      "Cada assunto é uma especialidade do agente, com instruções, materiais e ações próprias. Ele identifica o assunto sozinho a cada mensagem.",
  },
  {
    id: "rules",
    title: "Regras automáticas",
    subtitle: "Sempre que… então…",
    heading: "Regras automáticas",
    intro: "Situações com resposta certa, sem margem para interpretação: “sempre que acontecer isso, faça aquilo”.",
  },
  {
    id: "team",
    title: "Equipe e encerramento",
    subtitle: "Transferir, horários e fim",
    heading: "Equipe, horários e encerramento",
    intro:
      "Quando o agente chama uma pessoa, em que horários ele atende, quando para de responder e como a conversa termina.",
  },
  {
    id: "test",
    title: "Testar e publicar",
    subtitle: "Conferir antes de ligar",
    heading: "Testar e publicar",
    intro:
      "Converse com o agente como se fosse um cliente, veja por que ele respondeu cada coisa, compare com a sua equipe e só então publique.",
  },
];
const STEP_INDEX = Object.fromEntries(STEPS.map((st, i) => [st.id, i])) as Record<string, number>;

export default function AIAgentV2EditPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [step, setStep] = React.useState(0);
  const [testTab, setTestTab] = React.useState("try");
  const [config, setConfig] = React.useState<Record<string, unknown> | null>(null);
  const [name, setName] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [dirty, setDirty] = React.useState(false);
  const [openaiKey, setOpenaiKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [dictionaryOpen, setDictionaryOpen] = React.useState(false);
  const [keyValidation, setKeyValidation] = React.useState<{ ok: boolean | null; message: string }>({ ok: null, message: "" });
  const [validatingKey, setValidatingKey] = React.useState(false);

  const agentQuery = useQuery({
    queryKey: ["ai-agents-v2", id],
    queryFn: () => fetchAgent(id),
  });

  const catalogsQuery = useQuery({
    queryKey: ["ai-agents-v2-catalogs"],
    queryFn: fetchCatalogs,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (agentQuery.data && config === null) {
      setConfig(mergeDefaults(agentQuery.data.config ?? {}, DEFAULT_CONFIG));
      setName(agentQuery.data.name);
      setActive(agentQuery.data.active);
    }
  }, [agentQuery.data, config]);

  const updateConfig = React.useCallback((path: string, value: unknown) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return setPath(prev, path, value);
    });
    setDirty(true);
  }, []);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!config) return;
      setSaving(true);
      setSaveError(null);
      try {
        await updateAgentMeta(id, { name, active, openaiApiKey: openaiKey.trim() || undefined });
        const cfgToSave = { ...config, name };
        await saveDraft(id, cfgToSave);
        setConfig(cfgToSave);
        setDirty(false);
        setOpenaiKey("");
        queryClient.invalidateQueries({ queryKey: ["ai-agents-v2", id] });
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Erro ao salvar.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (dirty) await saveDraftMutation.mutateAsync();
      return publishAgent(id);
    },
  });

  const validateKeyMutation = useMutation({
    mutationFn: async () => {
      setValidatingKey(true);
      try {
        const result = await validateAgentKey(id);
        setKeyValidation({ ok: result.ok, message: result.message });
        return result;
      } finally {
        setValidatingKey(false);
      }
    },
  });

  const handlePublish = async () => {
    const hasKey = agentQuery.data?.hasOwnOpenaiKey || looksLikeOpenAiApiKey(openaiKey);
    if (!hasKey) {
      await confirm({
        title: "Chave ausente",
        description: "Configure uma chave de modelo válida antes de publicar.",
        confirmLabel: "Entendi",
      });
      return;
    }
    const ok = await confirm({
      title: "Publicar agente",
      description: "Publicar cria uma nova versão e ativa o agente. Continuar?",
      confirmLabel: "Publicar",
    });
    if (!ok) return;
    const res = await publishMutation.mutateAsync();
    await confirm({ title: "Publicado", description: `Versão ${res.versionNumber} criada com sucesso.` });
  };

  const handleStepChange = async (next: number) => {
    if (dirty && next !== step) {
      try {
        await saveDraftMutation.mutateAsync();
      } catch {
        // fica no passo atual se salvar falhou
        return;
      }
    }
    setStep(next);
  };

  if (agentQuery.isLoading || catalogsQuery.isLoading || !config) {
    return (
      <AppV2PageShell title="Agente de IA" icon={<IconBrain size={22} />}>
        <div className="space-y-4 p-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppV2PageShell>
    );
  }

  if (agentQuery.error || !agentQuery.data) {
    return (
      <AppV2PageShell title="Agente de IA" icon={<IconBrain size={22} />}>
        <div className="p-6 text-destructive">Erro ao carregar agente.</div>
      </AppV2PageShell>
    );
  }

  const catalogs = catalogsQuery.data ?? ({} as Catalogs);

  return (
    <TooltipProvider>
      <AppV2PageShell title="Agente de IA" icon={<IconBrain size={22} />}>
        {dialog}
        <Dialog open={dictionaryOpen} onOpenChange={setDictionaryOpen}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>Dicionário da tela</DialogTitle>
              <DialogDescription>Termos técnicos do motor de IA e o que eles significam em português simples.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {SCREEN_DICTIONARY.map((d) => (
                <div key={d.term} className="rounded-lg border px-3 py-2">
                  <p className="text-sm font-semibold">{d.term}</p>
                  <p className="text-sm text-muted-foreground">{d.meaning}</p>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        <div className="p-2 sm:p-4">
          <div className="flex min-h-[calc(100vh-8rem)] flex-col overflow-clip rounded-2xl border bg-card">
            {/* cabeçalho */}
            <header className="flex flex-col gap-3 px-4 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:pt-6">
              <div className="min-w-0 space-y-1">
                <h1 className="truncate text-2xl font-bold tracking-tight">{name || "Novo agente de IA"}</h1>
                <p className="text-sm text-muted-foreground">
                  Passo {step + 1} de {STEPS.length} ·{" "}
                  {saving ? "salvando…" : dirty ? "alterações não salvas" : "rascunho salvo"}
                  {agentQuery.data?.hasUnpublishedChanges && !dirty && " · há mudanças ainda não publicadas"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => setDictionaryOpen(true)} className="gap-1">
                  <IconBulb className="size-4" />
                  Dicionário
                </Button>
                <Button
                  variant="outline"
                  disabled={!dirty || saving}
                  onClick={() => saveDraftMutation.mutate()}
                  className="gap-1"
                >
                  <IconDeviceFloppy className="size-4" />
                  Salvar rascunho
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <Button
                        onClick={handlePublish}
                        disabled={publishMutation.isPending || !agentQuery.data?.hasOwnOpenaiKey && !looksLikeOpenAiApiKey(openaiKey)}
                        className="gap-1"
                      >
                        <IconRocket className="size-4" />
                        Publicar
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!agentQuery.data?.hasOwnOpenaiKey && !looksLikeOpenAiApiKey(openaiKey) && (
                    <TooltipContent>
                      <p>Configure uma chave de modelo válida para publicar.</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
            </header>

            {saveError && (
              <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive sm:mx-8">
                <IconAlertCircle className="size-4" />
                {saveError}
              </div>
            )}

            <div className="flex flex-1 flex-col gap-6 px-4 py-5 sm:px-8 sm:py-6 lg:flex-row lg:gap-8">
              {/* trilha de etapas: coluna no desktop, faixa rolável no celular */}
              <nav
                aria-label="Etapas"
                className="-mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:w-[268px] lg:flex-col lg:self-start lg:overflow-visible lg:px-0 lg:pb-0"
              >
                {STEPS.map((s, i) => {
                  const current = i === step;
                  const done = !current && isStepComplete(i, config, name);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-current={current ? "step" : undefined}
                      onClick={() => handleStepChange(i)}
                      className={cn(
                        "flex min-h-11 shrink-0 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                        current ? "border-primary/40 bg-primary/10" : "bg-card hover:border-primary/30",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          current
                            ? "bg-primary text-primary-foreground"
                            : done
                              ? "bg-success text-success-foreground"
                              : "border text-muted-foreground",
                        )}
                      >
                        {done ? <IconCheck size={14} stroke={3} /> : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block whitespace-nowrap text-sm font-semibold lg:whitespace-normal">{s.title}</span>
                        <span className="hidden text-xs text-muted-foreground lg:block">{s.subtitle}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>

              {/* etapa */}
              <main className="min-w-0 flex-1 space-y-5">
                <div className="space-y-1.5">
                  <h2 className="text-2xl font-bold tracking-tight">{STEPS[step].heading}</h2>
                  <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{STEPS[step].intro}</p>
                </div>

                {STEPS[step].id === "start" && (
                  <StepStart
                    config={config}
                    catalogs={catalogs}
                    name={name}
                    active={active}
                    openaiKey={openaiKey}
                    hasOpenaiKey={agentQuery.data?.hasOwnOpenaiKey ?? false}
                    openaiKeyHint={agentQuery.data?.openaiApiKeyHint ?? null}
                    hasUnpublishedChanges={agentQuery.data?.hasUnpublishedChanges ?? false}
                    publishedVersionNumber={agentQuery.data?.lastVersionNumber}
                    validatingKey={validatingKey}
                    keyValidation={keyValidation}
                    onNameChange={(v) => {
                      setName(v);
                      setDirty(true);
                    }}
                    onActiveChange={(v) => {
                      setActive(v);
                      setDirty(true);
                    }}
                    onKeyChange={(v) => {
                      setOpenaiKey(v);
                      setDirty(true);
                      setKeyValidation({ ok: null, message: "" });
                    }}
                    onChange={updateConfig}
                    onValidateKey={() => validateKeyMutation.mutate()}
                  />
                )}
                {STEPS[step].id === "tone" && <StepTone config={config} onChange={updateConfig} />}
                {STEPS[step].id === "context" && <StepContext config={config} catalogs={catalogs} onChange={updateConfig} />}
                {STEPS[step].id === "materials" && (
                  <>
                    <StepMaterials agentId={id} config={config} onChange={updateConfig} />
                    <StepMessagesProducts config={config} catalogs={catalogs} onChange={updateConfig} />
                  </>
                )}
                {STEPS[step].id === "calendar" && <CalendarStep agentId={id} config={config} onChange={updateConfig} />}
                {STEPS[step].id === "entry" && <StepEntry config={config} onChange={updateConfig} />}
                {STEPS[step].id === "themes" && <StepThemes config={config} catalogs={catalogs} onChange={updateConfig} />}
                {STEPS[step].id === "rules" && <StepRules config={config} catalogs={catalogs} onChange={updateConfig} />}
                {STEPS[step].id === "team" && (
                  <>
                    <StepTeam config={config} catalogs={catalogs} onChange={updateConfig} />
                    <StepOutputs config={config} onChange={updateConfig} />
                    <StepClosure config={config} catalogs={catalogs} onChange={updateConfig} />
                  </>
                )}
                {STEPS[step].id === "test" && (
                  <Tabs value={testTab} onValueChange={setTestTab} className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="try">Testar agora</TabsTrigger>
                      <TabsTrigger value="whatsapp">Conversas de teste</TabsTrigger>
                      <TabsTrigger value="compare">Comparar com humano</TabsTrigger>
                    </TabsList>
                    <TabsContent value="try">
                      <StepTestPublish
                        agentId={id}
                        dirty={dirty}
                        catalogs={catalogs}
                        onSave={async () => saveDraftMutation.mutateAsync()}
                        onGoToTheme={() => handleStepChange(STEP_INDEX.themes)}
                        onGoToRule={() => handleStepChange(STEP_INDEX.rules)}
                      />
                    </TabsContent>
                    <TabsContent value="whatsapp">
                      <TestConversations agentId={id} />
                    </TabsContent>
                    <TabsContent value="compare">
                      <CompareHuman agentId={id} />
                    </TabsContent>
                  </Tabs>
                )}
              </main>
            </div>

            {/* rodapé */}
            <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-muted/40 px-4 py-3 backdrop-blur sm:px-8">
              <Button
                variant="outline"
                disabled={step === 0}
                onClick={() => handleStepChange(step - 1)}
                className="gap-1"
              >
                <IconChevronLeft className="size-4" /> Voltar
              </Button>
              <div className="flex items-center gap-4">
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {step + 1} de {STEPS.length}
                </span>
                {step < STEPS.length - 1 ? (
                  <Button onClick={() => handleStepChange(step + 1)} className="gap-1">
                    Continuar <IconChevronRight className="size-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handlePublish}
                    disabled={publishMutation.isPending || !agentQuery.data?.hasOwnOpenaiKey && !looksLikeOpenAiApiKey(openaiKey)}
                    className="gap-1"
                  >
                    <IconRocket className="size-4" /> Publicar
                  </Button>
                )}
              </div>
            </footer>
          </div>
        </div>
      </AppV2PageShell>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 1 — Começar
// ─────────────────────────────────────────────────────────────────────────────

function StepStart({
  config,
  catalogs,
  name,
  active,
  openaiKey,
  hasOpenaiKey,
  openaiKeyHint,
  hasUnpublishedChanges,
  publishedVersionNumber,
  validatingKey,
  keyValidation,
  onNameChange,
  onActiveChange,
  onKeyChange,
  onChange,
  onValidateKey,
}: {
  config: Record<string, unknown>;
  catalogs: Catalogs;
  name: string;
  active: boolean;
  openaiKey: string;
  hasOpenaiKey: boolean;
  openaiKeyHint: string | null;
  hasUnpublishedChanges: boolean;
  publishedVersionNumber?: number;
  validatingKey: boolean;
  keyValidation: { ok: boolean | null; message: string };
  onNameChange: (v: string) => void;
  onActiveChange: (v: boolean) => void;
  onKeyChange: (v: string) => void;
  onChange: (path: string, value: unknown) => void;
  onValidateKey: () => void;
}) {
  const channelIds = (config.channelIds as string[]) ?? [];
  const allowedPhoneNumbers = (config.allowedPhoneNumbers as string[]) ?? [];
  const modelId = (config.model as string) ?? "";
  const modelValid = catalogs.models.some((m) => m.id === modelId);

  const hasKeyForPublish = hasOpenaiKey || looksLikeOpenAiApiKey(openaiKey);
  const showRealClientWarning = active && channelIds.length > 0 && allowedPhoneNumbers.length === 0;

  return (
    <div className="space-y-6">
      <SectionCard title="Identidade e disponibilidade" description="Nome, se está ligado e status da publicação.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome do agente" tooltip="Nome exibido na lista e nas conversas.">
            <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Ex: Atendimento" />
          </Field>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={active} onCheckedChange={onActiveChange} id="active" />
            <Label htmlFor="active">
              Ativo
              <span className="ml-2 text-xs text-muted-foreground">responde em canais reais</span>
            </Label>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Estado da publicação:</span>
          {hasUnpublishedChanges ? (
            <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 bg-amber-50">
              <IconAlertCircle className="size-3" />
              Alterações não publicadas
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
              <IconCheck className="size-3" />
              {publishedVersionNumber ? `Publicado (versão ${publishedVersionNumber})` : "Publicado"}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            A aba <b>Testar</b> usa o rascunho. O WhatsApp usa a versão publicada.
          </span>
        </div>

        {showRealClientWarning && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Este agente vai responder clientes reais.</p>
              <p className="text-xs">
                Ele está ativo, tem canal vinculado e a lista "Responder só para estes números" está vazia.
                Preencha essa lista se quiser restringir o teste a números específicos.
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Modelo e comportamento" description="Qual modelo usa e como formula as respostas.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Modelo" tooltip="Modelo da OpenAI usado para gerar as respostas. Valor salvo que não existe mais na lista aparece com aviso.">
            <Select value={modelId} onValueChange={(v) => onChange("model", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalogs.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
                {!modelValid && modelId && (
                  <SelectItem value={modelId}>
                    {modelId} (não listado)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {!modelValid && modelId && (
              <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                <IconAlertCircle className="size-3" />
                Modelo salvo não está na lista de modelos suportados.
              </p>
            )}
          </Field>
          <Field label="Comportamento das respostas" tooltip="Define o quanto o agente varia a forma de responder sem alterar seu conhecimento.">
            <Select
              value={(config.responseBehavior as string) ?? "balanced"}
              onValueChange={(v) => onChange("responseBehavior", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BEHAVIOR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Modo de execução" tooltip="Sugerir resposta: nada é enviado ao cliente sem aprovação. Responder sozinho: envia direto.">
            <Select
              value={(config.autonomyMode as string) ?? "suggest"}
              onValueChange={(v) => onChange("autonomyMode", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTONOMY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Comportamento no WhatsApp"
        description="Antes de responder, o agente pode mostrar que está digitando e marcar a mensagem do cliente como lida."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Simular “digitando…”</p>
              <p className="text-xs text-muted-foreground">O indicador aparece no WhatsApp do cliente, proporcional ao tamanho da resposta. A Meta mantém até 25 segundos.</p>
            </div>
            <Switch
              checked={config.simulateTyping !== false}
              onCheckedChange={(v) => onChange("simulateTyping", v)}
              id="simulate-typing"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Marcar como lida</p>
              <p className="text-xs text-muted-foreground">Os dois ticks azuis na mensagem recebida, antes da resposta. Com “digitando” ligado, a leitura já acontece junto.</p>
            </div>
            <Switch
              checked={config.markMessagesRead !== false}
              onCheckedChange={(v) => onChange("markMessagesRead", v)}
              id="mark-read"
            />
          </div>
        </div>
        {config.simulateTyping !== false && (
          <Field label="Velocidade de digitação" tooltip="Base de 1,5 s mais este tempo por caractere. Máximo de 25 s por limitação da Meta.">
            <Select
              value={String(config.typingPerCharMs ?? 25)}
              onValueChange={(v) => onChange("typingPerCharMs", Number(v) || 25)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPING_PACE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </SectionCard>

      <SectionCard title="Canais e alcance" description="Por onde ele atende e para quem pode responder.">
        <Field label="Canais vinculados" tooltip="Quais canais de WhatsApp usam este agente quando recebem uma nova conversa.">
          <MultiSelectPopover
            label="Canais"
            options={(catalogs.channels ?? []).map((c) => ({ value: c.id, label: c.name ?? c.id }))}
            selected={channelIds.map(String)}
            onChange={(v) => onChange("channelIds", v)}
          />
        </Field>
        <Field label="Responder só para estes números (modo de teste)" tooltip="Se preenchida, o agente ignora qualquer outro número, mesmo ativo e com canal vinculado. Vazio = responde qualquer número.">
          <ChipInput
            values={allowedPhoneNumbers.map(String)}
            onChange={(v) => onChange("allowedPhoneNumbers", v)}
            placeholder="11999999999"
          />
        </Field>
        <Field label="Domínios permitidos em links" tooltip="URLs de quais domínios o agente pode enviar ao cliente (segurança de phishing).">
          <ChipInput
            values={((config.allowedDomains as string[]) ?? []).map(String)}
            onChange={(v) => onChange("allowedDomains", v)}
            placeholder="suaempresa.com.br"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Chave de acesso ao modelo" description="Cada agente usa sua própria conta OpenAI. A chave nunca volta completa para a tela.">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
          <OpenAiKeyField
            value={openaiKey}
            onChange={onKeyChange}
            hasSavedKey={hasOpenaiKey}
            savedHint={openaiKeyHint ?? undefined}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onValidateKey}
            disabled={validatingKey || !hasKeyForPublish}
            className="gap-1"
          >
            {validatingKey ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />}
            Testar chave
          </Button>
        </div>
        {keyValidation.ok === false && (
          <p className="mt-2 text-sm text-destructive flex items-center gap-1">
            <IconAlertCircle className="size-4" />
            {keyValidation.message || "Falhou — verifique a chave."}
          </p>
        )}
        {keyValidation.ok === true && (
          <p className="mt-2 text-sm text-emerald-600 flex items-center gap-1">
            <IconCheck className="size-4" />
            {keyValidation.message || "Chave válida."}
          </p>
        )}
        {!hasKeyForPublish && (
          <p className="mt-2 text-sm text-amber-600 flex items-center gap-1">
            <IconAlertCircle className="size-4" />
            Sem chave válida o agente não pode ser publicado.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Formato da resposta do modelo"
        description="Em teste: obriga o modelo a devolver a resposta no formato que o agente entende."
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Resposta sempre no formato do agente</p>
            <p className="text-xs text-muted-foreground">
              Sem isso, às vezes o modelo responde em texto solto (“LLM devolveu texto livre” no teste) e a
              transferência, os dados coletados e as ações daquele turno se perdem. Se o modelo escolhido não aceitar,
              o agente segue como antes, automaticamente.
            </p>
          </div>
          <Switch
            checked={config.structuredOutput === true}
            onCheckedChange={(v) => onChange("structuredOutput", v)}
            id="structured-output"
          />
        </div>
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 2 — Jeito de falar
// ─────────────────────────────────────────────────────────────────────────────

function StepTone({ config, onChange }: { config: Record<string, unknown>; onChange: (path: string, value: unknown) => void }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Tom de voz" description="Como o agente deve soar nas mensagens.">
        <Field label="Descrição do tom" tooltip="Ex: formal, informal, direto, empático. Define a personalidade do agente.">
          <Textarea
            value={(config.tone as string) ?? ""}
            onChange={(e) => onChange("tone", e.target.value)}
            placeholder="Ex: profissional, direto e educado"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Tamanho das respostas" description="Controle o tamanho médio das mensagens do agente.">
        <Field label="Tamanho das respostas" tooltip="Tamanho médio desejado para as respostas do agente.">
          <Select
            value={(config.responseLength as string) ?? "medium"}
            onValueChange={(v) => onChange("responseLength", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Curtas</SelectItem>
              <SelectItem value="medium">Médias</SelectItem>
              <SelectItem value="long">Longas</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>

      <SectionCard title="Emojis" description="Deixam a mensagem mais calorosa e fácil de ler no WhatsApp. Em reclamação ou cobrança ele não usa.">
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Emojis">
          {EMOJI_OPTIONS.map((o) => {
            const selected = ((config.emojis as string) ?? "none") === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange("emojis", o.value)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors",
                  selected ? "border-primary bg-primary/10" : "hover:border-primary/40",
                )}
              >
                <span className="text-sm font-semibold">{o.label}</span>
                <span className="whitespace-pre-line rounded-lg border bg-card px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
                  {o.example}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Regras que ele sempre segue"
        description="Valem em qualquer assunto. Uma regra por item, escrita como se orientasse alguém novo na equipe. As de cima pesam mais."
      >
        <TextListEditor
          values={(config.globalRules as string[]) ?? []}
          onChange={(v) => onChange("globalRules", v)}
          addLabel="Adicionar regra"
          itemLabel="Regra"
          placeholder="Ex.: Nunca prometa prazo que não esteja nos materiais."
          emptyText="Nenhuma regra ainda."
        />
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 3 — O que ele sabe
// ─────────────────────────────────────────────────────────────────────────────

function StepContext({
  config,
  catalogs,
  onChange,
}: {
  config: Record<string, unknown>;
  catalogs: Catalogs;
  onChange: (path: string, value: unknown) => void;
}) {
  const contactFields = (getPath(config, "contextFields.contact", []) as Array<{ key: string; label?: string; permissions: string[] }>) ?? [];
  const dealFields = (getPath(config, "contextFields.deal", []) as Array<{ key: string; label?: string; permissions: string[] }>) ?? [];

  const builtinLabels: Record<string, string> = {
    name: "Nome",
    phone: "Telefone",
    email: "E-mail",
    stage: "Etapa",
    status: "Status",
    value: "Valor",
  };

  function fieldLabel(key: string, catalogFields: Array<{ id: string; name: string }>) {
    const fromCatalog = catalogFields.find((f) => f.id === key)?.name;
    return fromCatalog ?? builtinLabels[key] ?? key;
  }

  const EXAMPLE_VALUES: Record<string, string> = {
    name: "Ex.: João Silva",
    phone: "Ex.: (11) 98888-7777",
    email: "Ex.: joao@empresa.com",
    stage: "Ex.: Negociação",
    status: "Ex.: Aberto",
    value: "Ex.: R$ 1.200,00",
  };

  function exampleValue(key: string, label: string): string {
    if (EXAMPLE_VALUES[key]) return EXAMPLE_VALUES[key];
    const lower = label.toLowerCase();
    if (lower.includes("data")) return "Ex.: 12/03/2026";
    if (lower.includes("telefone") || lower.includes("celular")) return "Ex.: (11) 98888-7777";
    if (lower.includes("e-mail") || lower.includes("email")) return "Ex.: joao@empresa.com";
    if (lower.includes("valor") || lower.includes("preço") || lower.includes("preco")) return "Ex.: R$ 1.200,00";
    return "Ex.: valor de exemplo deste campo";
  }

  function HeaderCell({ label, tooltip }: { label: string; tooltip: string }) {
    return (
      <div className="flex items-center justify-center gap-0.5 text-center">
        <span>{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconInfoCircle className="size-3 cursor-help text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs leading-relaxed">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  function renderFieldTable(
    title: string,
    catalogFields: Array<{ id: string; name: string }>,
    stored: Array<{ key: string; label?: string; permissions: string[] }>,
    entity: string,
  ) {
    const usedKeys = new Set(stored.map((s) => s.key));
    const available = catalogFields.filter((f) => !usedKeys.has(f.id));
    const builtins = {
      contact: ["name", "phone", "email"],
      deal: ["stage", "status", "value"],
    }[entity] ?? [];
    const builtinOptions = builtins
      .filter((key) => !usedKeys.has(key))
      .map((key) => ({ id: key, name: builtinLabels[key] ?? key }));
    const options = [...builtinOptions, ...available].sort((a, b) => a.name.localeCompare(b.name));

    const add = (key: string) => {
      onChange(`contextFields.${entity}`, [
        ...stored,
        { key, label: fieldLabel(key, catalogFields), permissions: [] },
      ]);
    };

    const remove = (key: string) => {
      onChange(
        `contextFields.${entity}`,
        stored.filter((s) => s.key !== key),
      );
    };

    const toggle = (key: string, perm: string) => {
      const list = stored.map((s) => ({ ...s }));
      const item = list.find((s) => s.key === key);
      if (!item) return;
      const perms = new Set(item.permissions);
      if (perms.has(perm)) perms.delete(perm);
      else perms.add(perm);
      item.permissions = Array.from(perms);
      onChange(`contextFields.${entity}`, list);
    };

    return (
      <SectionCard title={title} description="Campos do CRM que o agente pode ler, citar ou atualizar.">
        <div className="overflow-x-auto">
          <div className="min-w-[360px] rounded-lg border">
            <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_40px_40px_40px_40px] sm:items-center sm:gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Campo</span>
              <HeaderCell label="Ler" tooltip="O agente pode usar o valor para entender o contexto." />
              <HeaderCell label="Citar" tooltip="O agente pode repetir o valor em mensagens ao cliente." />
              <HeaderCell label="Atualizar" tooltip="O agente pode alterar o valor via ações (ex.: mudar etapa)." />
              <span className="sr-only">Remover</span>
            </div>
            {stored.map((s) => {
              const label = fieldLabel(s.key, catalogFields);
              const permLabel: Record<string, string> = { read: "Ler", cite: "Citar", write: "Atualizar" };
              return (
                <div
                  key={s.key}
                  className="flex flex-col gap-2 border-b px-3 py-3 last:border-0 sm:grid sm:grid-cols-[minmax(0,1fr)_40px_40px_40px_40px] sm:items-center sm:gap-2 sm:py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{exampleValue(s.key, label)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:contents">
                    {["read", "cite", "write"].map((p) => (
                      <label key={p} className="flex items-center gap-1.5 sm:contents">
                        <span className="text-sm text-muted-foreground sm:hidden">{permLabel[p]}</span>
                        <input
                          type="checkbox"
                          checked={s.permissions.includes(p)}
                          onChange={() => toggle(s.key, p)}
                          className="size-4 accent-primary sm:mx-auto"
                          aria-label={`${permLabel[p]} ${label}`}
                        />
                      </label>
                    ))}
                    <Button variant="ghost" size="icon" onClick={() => remove(s.key)} aria-label={`Remover ${label}`}>
                      <IconTrash className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {stored.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum campo selecionado.</p>}
            {options.length > 0 && (
              <div className="flex items-center gap-2 border-t px-3 py-2">
                <Select value="" onValueChange={(v) => v && add(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Adicionar campo do CRM…" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    );
  }

  const variables = (config.variables as Array<{ key: string; value: string }>) ?? [];

  return (
    <div className="space-y-6">
      {renderFieldTable("Campos do contato", catalogs.contactCustomFields, contactFields, "contact")}
      {renderFieldTable("Campos do negócio", catalogs.dealCustomFields, dealFields, "deal")}

      <SectionCard title="Vários negócios abertos" description="O que fazer quando o cliente tem mais de um negócio em andamento.">
        <Field label="Escolha do negócio" tooltip="latest = usa o negócio atualizado mais recentemente. ask = pergunta qual negócio o cliente quer tratar.">
          <Select
            value={(config.dealSelection as string) ?? "latest"}
            onValueChange={(v) => onChange("dealSelection", v)}
          >
            <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Usar o mais recente</SelectItem>
              <SelectItem value="ask">Perguntar qual negócio</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>

      <SectionCard title="Informações fixas" description="Variáveis como @Nome da empresa, @Link da área do cliente etc.">
        <div className="space-y-2">
          {variables.map((v, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Nome da variável"
                value={v.key}
                onChange={(e) => {
                  const next = variables.slice();
                  next[i] = { ...next[i], key: e.target.value };
                  onChange("variables", next);
                }}
              />
              <Input
                placeholder="Valor"
                value={v.value}
                onChange={(e) => {
                  const next = variables.slice();
                  next[i] = { ...next[i], value: e.target.value };
                  onChange("variables", next);
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => onChange("variables", variables.filter((_, j) => j !== i))}
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => onChange("variables", [...variables, { key: "", value: "" }])}>
            <IconPlus className="size-4" /> Adicionar variável
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Mídia que o cliente manda"
        description="Áudio e imagem podem virar texto para o agente seguir o atendimento. Se não der para entender, ele avisa e pede para o cliente escrever."
      >
        {(["audio", "image", "document"] as const).map((kind) => {
          const options = MEDIA_ACTION_OPTIONS[kind];
          const current = getPath(config, `media.${kind}.action`, "handoff") as string;
          // Valor antigo que não vale para este tipo (ex.: "transcrever" documento).
          const value = options.some((o) => o.value === current) ? current : "handoff";
          const understands = value === "transcribe" || value === "describe";
          return (
            <div key={kind} className="grid gap-3 rounded-xl border p-3 md:grid-cols-2">
              <Field label={MEDIA_KIND_LABEL[kind]} hint={MEDIA_KIND_HINT[kind]}>
                <Select value={value} onValueChange={(v) => onChange(`media.${kind}.action`, v)}>
                  <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {understands && (
                <Field label="Se não conseguir entender" hint="Vazio usa uma mensagem padrão pedindo para escrever.">
                  <Input
                    value={(getPath(config, `media.${kind}.notUnderstoodMessage`, "") as string)}
                    onChange={(e) => onChange(`media.${kind}.notUnderstoodMessage`, e.target.value)}
                    placeholder="Não consegui entender. Pode me escrever o que precisa?"
                  />
                </Field>
              )}
              {value === "ask_text" && (
                <Field label="Mensagem pedindo para escrever" hint="Vazio usa uma mensagem padrão.">
                  <Input
                    value={(getPath(config, `media.${kind}.askTextMessage`, "") as string)}
                    onChange={(e) => onChange(`media.${kind}.askTextMessage`, e.target.value)}
                    placeholder="Não consigo ouvir áudios por aqui. Pode me escrever?"
                  />
                </Field>
              )}
              {value === "handoff" && (
                <Field label="Mensagem ao passar para a equipe" hint="Vazio usa a mensagem de transferência do agente.">
                  <Input
                    value={(getPath(config, `media.${kind}.handoffMessage`, "") as string)}
                    onChange={(e) => onChange(`media.${kind}.handoffMessage`, e.target.value)}
                  />
                </Field>
              )}
            </div>
          );
        })}
        <div className="flex items-start gap-3 pt-1">
          <Switch
            checked={!!getPath(config, "media.confirmUnderstanding", true)}
            onCheckedChange={(v) => onChange("media.confirmUnderstanding", v)}
            id="confirmMedia"
          />
          <div className="space-y-0.5">
            <Label htmlFor="confirmMedia">Confirmar o entendimento quando o pedido estiver ambíguo</Label>
            <p className="text-xs text-muted-foreground">
              “Entendi que você quer cancelar, é isso?” Evita agir em cima de uma transcrição errada. Pedido claro é
              respondido direto.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 4 — Materiais
// ─────────────────────────────────────────────────────────────────────────────

function StepMaterials({
  agentId,
  config,
  onChange,
}: {
  agentId: string;
  config: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  const { confirm: confirmDelete } = useConfirm();
  const docsQuery = useQuery({
    queryKey: ["ai-agents", agentId, "knowledge"],
    queryFn: () => fetchKnowledgeDocs(agentId),
    refetchInterval: (query) => {
      const items = (query.state.data?.items ?? []) as KnowledgeDoc[];
      const processing = items.some((d) => d.status === "PENDING" || d.status === "INDEXING");
      return processing ? 3000 : false;
    },
  });

  const [file, setFile] = React.useState<File | null>(null);
  const [pasteTitle, setPasteTitle] = React.useState("");
  const [pasteContent, setPasteContent] = React.useState("");

  // Material novo entra direto nos permitidos: antes ficava na lista sem o
  // agente consultar até alguém marcá-lo, salvar e publicar.
  const [addedNotice, setAddedNotice] = React.useState<string | null>(null);
  const allowNewDoc = (doc: KnowledgeDoc) => {
    const current = (config.allowedKnowledgeDocIds as string[]) ?? [];
    if (!current.includes(doc.id)) onChange("allowedKnowledgeDocIds", [...current, doc.id]);
    setAddedNotice(doc.title);
  };

  const uploadMutation = useMutation({
    mutationFn: (f: File) => uploadKnowledgeDoc(agentId, f),
    onSuccess: (doc) => {
      setFile(null);
      allowNewDoc(doc);
      docsQuery.refetch();
    },
  });

  const pasteMutation = useMutation({
    mutationFn: () => pasteKnowledgeDoc(agentId, { title: pasteTitle, content: pasteContent }),
    onSuccess: (doc) => {
      setPasteTitle("");
      setPasteContent("");
      allowNewDoc(doc);
      docsQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => deleteKnowledgeDoc(agentId, docId),
    onSuccess: () => docsQuery.refetch(),
  });

  const retryMutation = useMutation({
    mutationFn: (docId: string) => retryKnowledgeDoc(agentId, docId),
    onSuccess: () => docsQuery.refetch(),
  });

  const [editingDoc, setEditingDoc] = React.useState<KnowledgeDoc | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editContent, setEditContent] = React.useState("");
  const [editLoading, setEditLoading] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateKnowledgeDoc(agentId, editingDoc!.id, {
        title: editTitle.trim(),
        content: editContent,
      }),
    onSuccess: () => {
      setEditingDoc(null);
      setEditTitle("");
      setEditContent("");
      setEditError(null);
      docsQuery.refetch();
    },
    onError: (err) => setEditError(err instanceof Error ? err.message : "Erro ao salvar."),
  });

  async function openEdit(doc: KnowledgeDoc) {
    setEditingDoc(doc);
    setEditTitle(doc.title);
    setEditContent("");
    setEditError(null);
    setEditLoading(true);
    try {
      const full = await getKnowledgeDoc(agentId, doc.id);
      setEditTitle(full.title);
      setEditContent(typeof full.content === "string" ? full.content : "");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erro ao carregar conteúdo.");
    } finally {
      setEditLoading(false);
    }
  }

  function closeEdit() {
    setEditingDoc(null);
    setEditTitle("");
    setEditContent("");
    setEditError(null);
    updateMutation.reset();
  }

  async function exportDoc(doc: KnowledgeDoc) {
    try {
      const full = await getKnowledgeDoc(agentId, doc.id);
      const text = typeof full.content === "string" ? full.content : "";
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.title.replace(/[^\w\s-]/g, "").trim() || "material"}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setEditError("Erro ao exportar conteúdo.");
    }
  }

  function onImportFileSelected(file: File | undefined) {
    if (!file) return;
    const textTypes = ["text/plain", "text/markdown", "text/csv", "text/tab-separated-values"];
    if (!textTypes.includes(file.type) && !/\.(txt|md|csv|tsv)$/i.test(file.name)) {
      setEditError("Importação de conteúdo só suporta .txt, .md, .csv ou .tsv no momento.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditContent(typeof reader.result === "string" ? reader.result : "");
      setEditError(null);
    };
    reader.onerror = () => setEditError("Erro ao ler arquivo.");
    reader.readAsText(file);
  }

  const [testQuery, setTestQuery] = React.useState("");
  const [testSearchResult, setTestSearchResult] = React.useState<{
    query: string;
    chunks: Array<{ docId: string; docTitle: string; content: string; distance: number }>;
  } | null>(null);
  const testSearchMutation = useMutation({
    mutationFn: () => testKnowledgeSearch(agentId, testQuery),
    onSuccess: (data) => setTestSearchResult(data),
  });

  const allowedIds = (config.allowedKnowledgeDocIds as string[]) ?? [];
  const items = docsQuery.data?.items ?? [];
  // Liberado no agente ou em algum assunto: é o que o motor consulta.
  const themeDocIds = new Set(
    ((config.themes as Array<Record<string, unknown>>) ?? []).flatMap((t) => [
      ...(((t.allowedKnowledgeDocIds as string[]) ?? []).map(String)),
      ...(((t.knowledgeDocIds as string[]) ?? []).map(String)),
    ]),
  );
  const isReleased = (id: string) => allowedIds.includes(id) || themeDocIds.has(id);

  const statusLabel: Record<KnowledgeDoc["status"], string> = {
    PENDING: "Processando",
    INDEXING: "Indexando",
    READY: "Pronto",
    FAILED: "Falhou",
  };

  const statusVariant: Record<KnowledgeDoc["status"], "default" | "secondary" | "destructive" | "outline"> = {
    PENDING: "secondary",
    INDEXING: "secondary",
    READY: "default",
    FAILED: "destructive",
  };

  async function handleDelete(doc: KnowledgeDoc) {
    const ok = await confirmDelete({
      title: "Remover material",
      description: `Remover "${doc.title}"? O agente não poderá mais consultar este documento.`,
      confirmLabel: "Remover",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(doc.id);
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Escrever direto" description="Cole um texto curto ou uma FAQ; o sistema divide em trechos para a IA consultar.">
        <Field label="Título" hint="Ex.: FAQ de matrícula">
          <Input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} />
        </Field>
        <Field label="Conteúdo" hint="Texto puro ou Markdown.">
          <Textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            rows={6}
          />
        </Field>
        <Button
          disabled={!pasteTitle.trim() || !pasteContent.trim() || pasteMutation.isPending}
          onClick={() => pasteMutation.mutate()}
        >
          {pasteMutation.isPending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconUpload className="size-4" />
          )}{" "}
          Salvar texto
        </Button>
        {!!pasteMutation.error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{(pasteMutation.error as Error)?.message ?? "Erro ao salvar material."}</span>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Enviar arquivo" description="Arraste ou escolha um arquivo. O sistema extrai o texto e divide em trechos.">
        <Field label="Arquivo" tooltip="Formatos aceitos: .txt, .md, .csv, .tsv, .docx e .pdf. Tamanho máximo 10 MB. PDFs escaneados não são lidos." hint="Formatos: .txt, .md, .csv, .docx, .pdf. Máx. 10 MB.">
          <div className="flex gap-2">
            <Input
              type="file"
              accept=".txt,.md,.csv,.tsv,.doc,.docx,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              disabled={!file || uploadMutation.isPending}
              onClick={() => file && uploadMutation.mutate(file)}
            >
              {uploadMutation.isPending ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconUpload className="size-4" />
              )}{" "}
              Enviar
            </Button>
          </div>
        </Field>
        {!!uploadMutation.error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{(uploadMutation.error as Error)?.message ?? "Erro ao enviar material."}</span>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Materiais disponíveis" description="Selecione quais o agente pode consultar globalmente. Materiais em processamento atualizam sozinhos.">
        {docsQuery.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            {addedNotice && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <IconAlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="flex-1">
                  “{addedNotice}” foi incluído nos materiais permitidos. Para o agente usar no atendimento,{" "}
                  <span className="font-medium">salve o rascunho e publique</span>. No teste do agente, ele já vale
                  depois de salvar.
                </p>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setAddedNotice(null)}>
                  Ok
                </Button>
              </div>
            )}
            <MultiSelectPopover
              label="Materiais permitidos"
              tooltip="Documentos que o agente pode citar em qualquer assunto. Assuntos também podem ter sua própria lista."
              options={items.map((d) => ({ value: d.id, label: d.title }))}
              selected={allowedIds}
              onChange={(v) => onChange("allowedKnowledgeDocIds", v)}
              emptyLabel="Nenhum material enviado"
            />
            <div className="mt-4 space-y-2">
              {items.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <IconFile className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(d.sizeBytes)} · {formatDate(d.createdAt)} · {d.chunkCount ?? 0} trechos
                      </p>
                      {d.status === "FAILED" && d.errorMessage && (
                        <p className="mt-1 text-xs text-destructive">{d.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isReleased(d.id) && (
                      <Badge variant="outline" title="Não está nos materiais permitidos nem em nenhum assunto: o agente não consulta.">
                        não liberado
                      </Badge>
                    )}
                    <Badge variant={statusVariant[d.status]}>{statusLabel[d.status]}</Badge>
                    {d.status === "FAILED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retryMutation.isPending && retryMutation.variables === d.id}
                        onClick={() => retryMutation.mutate(d.id)}
                      >
                        <IconRefresh className="size-4" />
                        <span className="sr-only">Tentar indexar {d.title} novamente</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(d)}
                    >
                      <IconPencil className="size-4" />
                      <span className="sr-only">Editar {d.title}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportDoc(d)}
                    >
                      <IconDownload className="size-4" />
                      <span className="sr-only">Exportar {d.title}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingDoc(d);
                        setEditTitle(d.title);
                        setEditContent("");
                        setEditError(null);
                        importInputRef.current?.click();
                      }}
                    >
                      <IconFileImport className="size-4" />
                      <span className="sr-only">Importar conteúdo para {d.title}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending && deleteMutation.variables === d.id}
                      onClick={() => handleDelete(d)}
                    >
                      <IconTrash className="size-4" />
                      <span className="sr-only">Remover {d.title}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <Dialog open={!!editingDoc} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingDoc?.title}</DialogTitle>
            <DialogDescription>
              Edite o título e o conteúdo do material. Ao salvar, o agente reindexa o texto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <input
              type="file"
              ref={importInputRef}
              className="hidden"
              accept=".txt,.md,.csv,.tsv"
              onChange={(e) => {
                onImportFileSelected(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {editLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconLoader2 className="size-4 animate-spin" />
                Carregando conteúdo...
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="kb-edit-title">Título</Label>
              <Input
                id="kb-edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Título do material"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="kb-edit-content">Conteúdo</Label>
              <Textarea
                id="kb-edit-content"
                rows={12}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Cole ou importe o conteúdo do material..."
                className="resize-none font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {editContent.length.toLocaleString("pt-BR")} caracteres
              </p>
            </div>
            {editError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeEdit} type="button">
                Cancelar
              </Button>
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || editLoading || !editTitle.trim() || editContent.trim().length < 10}
              >
                {updateMutation.isPending && <IconLoader2 className="mr-1.5 size-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SectionCard title="Testar busca" description="Escreva uma pergunta para ver quais trechos dos materiais seriam encontrados, sem chamar o modelo.">
        <div className="flex gap-2">
          <Input
            placeholder="Ex.: qual o prazo de emissão do documento X?"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && testQuery.trim()) {
                testSearchMutation.mutate();
              }
            }}
          />
          <Button
            disabled={!testQuery.trim() || testSearchMutation.isPending}
            onClick={() => testSearchMutation.mutate()}
          >
            {testSearchMutation.isPending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconSearch className="size-4" />
            )}
            Buscar
          </Button>
        </div>
        {testSearchMutation.error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{(testSearchMutation.error as Error)?.message ?? "Erro ao testar busca."}</span>
          </div>
        )}
        {testSearchResult && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {testSearchResult.chunks.length === 0
                ? "Nenhum trecho encontrado para esta pergunta."
                : `${testSearchResult.chunks.length} trecho(s) encontrado(s):`}
            </p>
            {testSearchResult.chunks.map((chunk, i) => (
              <div key={i} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{chunk.docTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{chunk.content.slice(0, 300)}{chunk.content.length > 300 ? "…" : ""}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 5 — Mensagens prontas e produtos
// ─────────────────────────────────────────────────────────────────────────────

function StepMessagesProducts({
  config,
  catalogs,
  onChange,
}: {
  config: Record<string, unknown>;
  catalogs: Catalogs;
  onChange: (path: string, value: unknown) => void;
}) {
  const pp = getPath(config, "productPolicy", {}) as Record<string, unknown>;
  const allowedModels = (config.allowedMessageModelIds as string[]) ?? [];

  const allowedProductIds = (pp.allowedProductIds as string[]) ?? [];
  const productOptions = catalogs.products.map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="space-y-6">
      <SectionCard title="Mensagens prontas" description="Modelos de mensagem do CRM que o agente pode usar.">
        <MultiSelectPopover
          label="Modelos permitidos"
          tooltip="Modelos de mensagem já cadastrados no CRM. O agente só pode enviá-los se estiverem nesta lista.
Use @Modelo para citar um modelo dentro de uma resposta."
          options={catalogs.messageTemplates.map((m) => ({ value: m.id, label: m.name }))}
          selected={allowedModels}
          onChange={(v) => onChange("allowedMessageModelIds", v)}
          emptyLabel="Nenhum modelo cadastrado"
        />
        {catalogs.messageTemplates.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {catalogs.messageTemplates.map((m) => (
              <Badge key={m.id} variant={allowedModels.includes(m.id) ? "default" : "outline"}>
                {m.name}
              </Badge>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Produtos e planos" description="Permitir que o agente fale do catálogo.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!pp.enabled}
            onCheckedChange={(v) => onChange("productPolicy", { ...pp, enabled: v })}
            id="prodEnabled"
          />
          <Label htmlFor="prodEnabled" className="cursor-pointer">Falar de produtos</Label>
        </div>
        {!!pp.enabled && (
          <div className="space-y-4 pt-2">
            <Field label="Quantos por vez" tooltip="Máximo de produtos que o agente pode enviar em uma única resposta.">
              <Input
                type="number"
                value={String(pp.maxItems ?? 3)}
                onChange={(e) => onChange("productPolicy", { ...pp, maxItems: Number(e.target.value) })}
              />
            </Field>
            <MultiSelectPopover
              label="Produtos permitidos"
              tooltip="Vazio = todos os produtos ativos do CRM. Selecione IDs específicos para restringir o catálogo deste agente."
              options={productOptions}
              selected={allowedProductIds}
              onChange={(v) => onChange("productPolicy", { ...pp, allowedProductIds: v })}
              emptyLabel="Nenhum produto cadastrado no CRM"
            />
            {catalogs.products.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {catalogs.products.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3 transition-colors",
                      allowedProductIds.length > 0 && !allowedProductIds.includes(p.id) && "opacity-50",
                    )}
                  >
                    <span className="text-sm">{p.name}</span>
                    <Switch
                      checked={allowedProductIds.length === 0 || allowedProductIds.includes(p.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(allowedProductIds);
                        if (v) next.add(p.id);
                        else next.delete(p.id);
                        onChange("productPolicy", { ...pp, allowedProductIds: Array.from(next) });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              {[
                { key: "showPrice", label: "Mostrar preço", tooltip: "Incluir o preço nas respostas sobre produtos." },
                { key: "showConditions", label: "Mostrar condições", tooltip: "Incluir condições/como funciona." },
                { key: "showImage", label: "Mostrar imagem", tooltip: "Anexar imagem do produto quando houver." },
                { key: "showLink", label: "Incluir link", tooltip: "Incluir link para o produto (se o domínio estiver permitido)." },
              ].map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <Switch
                    checked={!!pp[c.key]}
                    onCheckedChange={(v) => onChange("productPolicy", { ...pp, [c.key]: v })}
                    id={c.key}
                  />
                  <Label htmlFor={c.key} className="cursor-pointer">{c.label}</Label>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 6 — Início da conversa
// ─────────────────────────────────────────────────────────────────────────────

function StepEntry({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  const entry = getPath(config, "entry", {}) as Record<string, unknown>;
  const fields = [
    ...((getPath(config, "contextFields.contact", []) as Array<{ key: string; label?: string }>) ?? []).map((f) => ({
      value: f.key,
      label: f.label ?? f.key,
    })),
    ...((getPath(config, "contextFields.deal", []) as Array<{ key: string; label?: string }>) ?? []).map((f) => ({
      value: f.key,
      label: f.label ?? f.key,
    })),
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="Primeira mensagem" description="Como o agente se apresenta quando a conversa começa.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!entry.openingEnabled}
            onCheckedChange={(v) => onChange("entry.openingEnabled", v)}
            id="openingEnabled"
          />
          <Label htmlFor="openingEnabled">Enviar boas-vindas</Label>
        </div>
        {!!entry.openingEnabled && (
          <Field label="Mensagem de abertura" tooltip="Texto enviado automaticamente na primeira mensagem do cliente.">
            <Textarea
              value={(entry.openingMessage as string) ?? ""}
              onChange={(e) => onChange("entry.openingMessage", e.target.value)}
            />
          </Field>
        )}
      </SectionCard>

      <SectionCard title="Confirmar cadastro" description="Antes de atender, confirma quem é o cliente.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!entry.confirmContact}
            onCheckedChange={(v) => onChange("entry.confirmContact", v)}
            id="confirmContact"
          />
          <Label htmlFor="confirmContact">Confirmar identidade antes de atender</Label>
        </div>
        {!!entry.confirmContact && (
          <>
            <Field label="Campos usados na confirmação" tooltip="Dados que o agente pede ao cliente para confirmar quem ele é.">
              <MultiSelectPopover
                label="Campos"
                options={fields}
                selected={((entry.confirmationFields as string[]) ?? []).map(String)}
                onChange={(v) => onChange("entry.confirmationFields", v)}
              />
            </Field>
            <Field label="Mensagem de confirmação" tooltip="Mensagem enviada após encontrar o contato e negócio no CRM.">
              <Textarea
                value={(entry.confirmationMessage as string) ?? ""}
                onChange={(e) => onChange("entry.confirmationMessage", e.target.value)}
              />
            </Field>
            <Field label="Momento da confirmação" tooltip="Junto com a boas-vindas (uma mensagem só) ou no turno seguinte (duas trocas).">
              <Select
                value={(entry.confirmationMode as string) ?? "combined"}
                onValueChange={(v) => onChange("entry.confirmationMode", v)}
              >
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="combined">Junto com a boas-vindas</SelectItem>
                  <SelectItem value="separate_turn">No turno seguinte</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
      </SectionCard>

      <SectionCard title="Quando não encontrar o cliente" description="O que fazer se o número ainda não está no CRM.">
        <Field label="Ação" tooltip="Comportamento inicial quando o telefone ainda não está cadastrado.">
          <Select
            value={(entry.onDealNotFound as string) ?? "ask_identification"}
            onValueChange={(v) => onChange("entry.onDealNotFound", v)}
          >
            <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
            <SelectContent>
              {ON_DEAL_NOT_FOUND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {entry.onDealNotFound === "ask_identification" && (
          <>
            <Field label="Mensagem pedindo identificação" tooltip="Texto usado quando o agente não reconhece o cliente e precisa pedir dados.">
              <Textarea
                value={(entry.identificationMessage as string) ?? ""}
                onChange={(e) => onChange("entry.identificationMessage", e.target.value)}
              />
            </Field>
            <Field label="Tentativas antes de transferir" tooltip="Quantas vezes o agente tenta identificar antes de passar para um humano.">
              <Input
                type="number"
                value={String(entry.maxAttempts ?? 2)}
                onChange={(e) => onChange("entry.maxAttempts", Number(e.target.value))}
              />
            </Field>
          </>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 7 — Assuntos
// ─────────────────────────────────────────────────────────────────────────────

function StepThemes({
  config,
  catalogs,
  onChange,
}: {
  config: Record<string, unknown>;
  catalogs: Catalogs;
  onChange: (path: string, value: unknown) => void;
}) {
  const themes = (config.themes as Array<Record<string, unknown>>) ?? [];
  const [editingIdx, setEditingIdx] = React.useState<number | null>(null);
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);

  const moveTheme = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= themes.length || to >= themes.length) return;
    const next = themes.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange("themes", next);
    if (editingIdx === from) setEditingIdx(to);
  };

  const addTheme = () => {
    const next = themes.slice();
    next.push({
      id: `theme_${Date.now()}`,
      name: "Novo assunto",
      when: [],
      examples: [],
      instructions: "",
      allowedTools: [],
      allowedKnowledgeDocIds: [],
      allowedMessageModelIds: [],
      productPolicy: { enabled: false },
      answerBy: "self",
      directHandoff: false,
    });
    onChange("themes", next);
    setEditingIdx(next.length - 1);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Assuntos são os temas que este agente atende (ex.: Cancelamento, Suporte técnico, Financeiro). Cada mensagem do
        cliente é encaixada em um assunto, que define as instruções, ferramentas e materiais usados na resposta.
        Arraste pela alça <IconGripVertical className="inline size-3.5 -translate-y-0.5" /> para mudar a ordem em que o
        agente considera os assuntos.
      </p>
      {themes.map((t, i) => (
        <Card
          key={String(t.id) ?? i}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIdx !== null) moveTheme(dragIdx, i);
            setDragIdx(null);
          }}
          onDragEnd={() => setDragIdx(null)}
          className={cn(dragIdx === i && "opacity-50")}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <span className="mt-1 cursor-grab text-muted-foreground active:cursor-grabbing" title="Arrastar para reordenar">
                  <IconGripVertical className="size-4" />
                </span>
                <div>
                  <CardTitle className="text-base">{(t.name as string) || "Assunto sem nome"}</CardTitle>
                  <CardDescription>{((t.when as string[]) ?? []).join(", ") || "Sem gatilhos"}</CardDescription>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" disabled={i === 0} onClick={() => moveTheme(i, i - 1)} aria-label="Mover para cima">
                  <IconChevronUp className="size-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={i === themes.length - 1} onClick={() => moveTheme(i, i + 1)} aria-label="Mover para baixo">
                  <IconChevronDown className="size-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditingIdx(editingIdx === i ? null : i)}>
                  {editingIdx === i ? "Fechar" : "Editar"}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onChange("themes", themes.filter((_, j) => j !== i))}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          {editingIdx === i && (
            <CardContent className="space-y-4">
              <Field label="Nome" tooltip="Nome curto do assunto (ex.: Cancelamento, Suporte técnico).">
                <Input
                  value={(t.name as string) ?? ""}
                  onChange={(e) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], name: e.target.value };
                    onChange("themes", next);
                  }}
                />
              </Field>
              <Field label="Quando usar (palavras ou frases)" tooltip="Palavras-chave ou frases que o cliente digitar para o agente usar este assunto.">
                <ChipInput
                  values={(t.when as string[]) ?? []}
                  onChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], when: v };
                    onChange("themes", next);
                  }}
                  placeholder="Adicionar gatilho"
                />
              </Field>
              <Field label="Exemplos de mensagens do cliente" tooltip="Exemplos de mensagens típicas para ajudar o agente a reconhecer o assunto.">
                <TextListEditor
                  values={(t.examples as string[]) ?? []}
                  onChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], examples: v };
                    onChange("themes", next);
                  }}
                  numbered={false}
                  addLabel="Adicionar exemplo"
                  itemLabel="Exemplo"
                  placeholder="Ex.: quero cancelar minha matrícula"
                />
              </Field>
              <Field label="Como agir" tooltip="Instruções específicas de comportamento para este assunto (tom, passos, regras).">
                <Textarea
                  value={(t.instructions as string) ?? ""}
                  onChange={(e) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], instructions: e.target.value };
                    onChange("themes", next);
                  }}
                />
              </Field>
              <Field label="Quem responde" tooltip="Escolha transferir automaticamente para outro agente de IA, ou deixar este responder.">
                <Select
                  value={(t.answerBy as string) ?? "self"}
                  onValueChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], answerBy: v };
                    onChange("themes", next);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Este próprio agente</SelectItem>
                    {catalogs.aiAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Materiais permitidos neste assunto" tooltip="Documentos de consulta que o agente pode usar só neste assunto.">
                <MultiSelectPopover
                  label="Materiais"
                  options={catalogs.knowledgeDocs.map((d) => ({ value: d.id, label: d.name }))}
                  selected={((t.allowedKnowledgeDocIds as string[]) ?? []).map(String)}
                  onChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], allowedKnowledgeDocIds: v };
                    onChange("themes", next);
                  }}
                />
              </Field>
              <Field label="Modelos permitidos neste assunto" tooltip="Modelos de mensagem que este assunto pode enviar.">
                <MultiSelectPopover
                  label="Modelos"
                  options={catalogs.messageTemplates.map((m) => ({ value: m.id, label: m.name }))}
                  selected={((t.allowedMessageModelIds as string[]) ?? []).map(String)}
                  onChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], allowedMessageModelIds: v };
                    onChange("themes", next);
                  }}
                />
              </Field>
              <div className="flex items-center gap-3">
                <Switch
                  checked={!!t.directHandoff}
                  onCheckedChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], directHandoff: v };
                    onChange("themes", next);
                  }}
                  id={`direct-${i}`}
                />
                <Label htmlFor={`direct-${i}`}>Passar direto para o destino sem responder</Label>
              </div>
              <Field label="Destino quando transferir" tooltip="Setor, fila, usuário ou outro agente de IA que recebe este assunto.">
                <DestinationPicker
                  value={t.handoffDestination as Record<string, string> | undefined}
                  catalogs={catalogs}
                  onChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], handoffDestination: v };
                    onChange("themes", next);
                  }}
                />
              </Field>
            </CardContent>
          )}
        </Card>
      ))}
      <Button variant="outline" onClick={addTheme}>
        <IconPlus className="size-4" /> Novo assunto
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 8 — Regras automáticas
// ─────────────────────────────────────────────────────────────────────────────

function StepRules({
  config,
  catalogs,
  onChange,
}: {
  config: Record<string, unknown>;
  catalogs: Catalogs;
  onChange: (path: string, value: unknown) => void;
}) {
  const rules = (config.rules as Array<Record<string, unknown>>) ?? [];

  const addRule = () => {
    onChange("rules", [
      ...rules,
      {
        id: `rule_${Date.now()}`,
        name: "Nova regra",
        enabled: true,
        order: rules.length,
        conditions: [{ type: "keywords", values: [] }],
        actions: [{ type: "send_message", message: "" }],
      },
    ]);
  };

  return (
    <div className="space-y-4">
      {rules.map((rule, i) => {
        const conditions = (rule.conditions as Array<Record<string, unknown>>) ?? [];
        const actions = (rule.actions as Array<Record<string, unknown>>) ?? [];
        return (
          <Card key={String(rule.id) ?? i}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {i + 1}
                  </span>
                  <Input
                    className="h-8 w-64"
                    value={(rule.name as string) ?? ""}
                    onChange={(e) => {
                      const next = rules.slice();
                      next[i] = { ...next[i], name: e.target.value };
                      onChange("rules", next);
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!rule.enabled}
                    onCheckedChange={(v) => {
                      const next = rules.slice();
                      next[i] = { ...next[i], enabled: v };
                      onChange("rules", next);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onChange("rules", rules.filter((_, j) => j !== i))}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold">Quando</p>
                {conditions.map((c, ci) => (
                  <div key={ci} className="flex items-start gap-2">
                    <Select
                      value={(c.type as string) ?? "keywords"}
                      onValueChange={(v) => {
                        const next = rules.slice();
                        (next[i].conditions as Array<Record<string, unknown>>)[ci] = { type: v, values: [] };
                        onChange("rules", next);
                      }}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_TYPES.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ChipInput
                      values={((c.values as string[]) ?? []).map(String)}
                      onChange={(v) => {
                        const next = rules.slice();
                        (next[i].conditions as Array<Record<string, unknown>>)[ci] = { ...c, values: v };
                        onChange("rules", next);
                      }}
                      placeholder="Valores"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const next = rules.slice();
                        (next[i].conditions as Array<Record<string, unknown>>).splice(ci, 1);
                        onChange("rules", next);
                      }}
                    >
                      <IconX className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = rules.slice();
                    (next[i].conditions as Array<Record<string, unknown>>).push({ type: "keywords", values: [] });
                    onChange("rules", next);
                  }}
                >
                  <IconPlus className="size-4" /> Condição
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Então</p>
                {actions.map((a, ai) => (
                  <div key={ai} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex items-start gap-2">
                      <Select
                        value={(a.type as string) ?? "send_message"}
                        onValueChange={(v) => {
                          const next = rules.slice();
                          (next[i].actions as Array<Record<string, unknown>>)[ai] = { type: v };
                          onChange("rules", next);
                        }}
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPES.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const next = rules.slice();
                          (next[i].actions as Array<Record<string, unknown>>).splice(ai, 1);
                          onChange("rules", next);
                        }}
                      >
                        <IconX className="size-4" />
                      </Button>
                    </div>
                    {a.type === "send_message" && (
                      <Textarea
                        placeholder="Mensagem"
                        value={(a.message as string) ?? ""}
                        onChange={(e) => {
                          const next = rules.slice();
                          (next[i].actions as Array<Record<string, unknown>>)[ai] = { ...a, message: e.target.value };
                          onChange("rules", next);
                        }}
                      />
                    )}
                    {(a.type === "handoff" || a.type === "set_theme") && (
                      <>
                        {a.type === "set_theme" && (
                          <Select
                            value={(a.themeId as string) ?? ""}
                            onValueChange={(v) => {
                              const next = rules.slice();
                              (next[i].actions as Array<Record<string, unknown>>)[ai] = { ...a, themeId: v };
                              onChange("rules", next);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Escolher assunto" />
                            </SelectTrigger>
                            <SelectContent>
                              {((config.themes as Array<Record<string, unknown>>) ?? []).map((t) => (
                                <SelectItem key={String(t.id)} value={String(t.id)}>
                                  {(t.name as string) ?? "Assunto"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {a.type === "handoff" && (
                          <DestinationPicker
                            value={a.destination as Record<string, string> | undefined}
                            catalogs={catalogs}
                            onChange={(v) => {
                              const next = rules.slice();
                              (next[i].actions as Array<Record<string, unknown>>)[ai] = { ...a, destination: v };
                              onChange("rules", next);
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = rules.slice();
                    (next[i].actions as Array<Record<string, unknown>>).push({ type: "send_message", message: "" });
                    onChange("rules", next);
                  }}
                >
                  <IconPlus className="size-4" /> Ação
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Button variant="outline" onClick={addRule}>
        <IconPlus className="size-4" /> Nova regra
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 9 — Saídas
// ─────────────────────────────────────────────────────────────────────────────

function StepOutputs({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  const fallback = getPath(config, "fallback", {}) as Record<string, unknown>;
  const unknown = (fallback.unknown as Record<string, unknown>) ?? {};

  return (
    <div className="space-y-6">
      <SectionCard title="Quando não souber a resposta" description="Mensagens de saída para cada situação.">
        <Field label="Não encontrou nos materiais" tooltip="Mensagem quando a resposta não existe nos materiais nem nos dados do cliente.">
          <Textarea
            value={(unknown.message as string) ?? ""}
            onChange={(e) => onChange("fallback.unknown.message", e.target.value)}
          />
        </Field>
        <Field label="Ação quando não souber" tooltip="O que fazer quando o agente não consegue responder sem inventar.">
          <Select
            value={(unknown.action as string) ?? "handoff"}
            onValueChange={(v) => onChange("fallback.unknown.action", v)}
          >
            <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="handoff">Passar para a equipe</SelectItem>
              <SelectItem value="silence">Não responder</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cliente pediu para falar com pessoa" tooltip="Resposta usada quando o cliente pede atendimento humano.">
          <Textarea
            value={((fallback.humanRequest as Record<string, unknown>)?.message as string) ?? ""}
            onChange={(e) => onChange("fallback.humanRequest.message", e.target.value)}
          />
        </Field>
        <Field label="Sem material de consulta" tooltip="Resposta quando não há documentos associados ao assunto.">
          <Textarea
            value={((fallback.noSource as Record<string, unknown>)?.message as string) ?? ""}
            onChange={(e) => onChange("fallback.noSource.message", e.target.value)}
          />
        </Field>
        <Field label="Erro técnico" tooltip="Mensagem amigável exibida quando algo falha na geração da resposta.">
          <Textarea
            value={((fallback.error as Record<string, unknown>)?.message as string) ?? ""}
            onChange={(e) => onChange("fallback.error.message", e.target.value)}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Limites de segurança" description="Quando o agente para de responder sozinho.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { path: "limits.maxCourtesyReplies", label: "Respostas de cortesia", tooltip: "Máximo de respostas educadas após o cliente agradecer antes de encerrar." },
            { path: "limits.maxHelpOffers", label: "Ofertas de ajuda", tooltip: "Quantas vezes o agente pode oferecer ajuda extra sem resposta do cliente." },
            { path: "limits.maxStalledExchanges", label: "Trocas sem avanço", tooltip: "Limite de voltas sem progresso no assunto antes de transferir." },
            { path: "limits.nonsenseLimit", label: "Mensagens sem sentido", tooltip: "Quantas mensagens sem sentido o agente tolera antes de parar." },
            { path: "limits.silenceMinutes", label: "Minutos de silêncio", tooltip: "Tempo sem resposta do cliente para considerar a conversa parada." },
            { path: "limits.maxAiTransfers", label: "Máx. transferências IA→IA", tooltip: "Limite de idas e voltas entre agentes de IA antes de ir para fila humana." },
          ].map((f) => (
            <Field key={f.path} label={f.label} tooltip={f.tooltip}>
              <Input
                type="number"
                value={String(getPath(config, f.path, 0) as number)}
                onChange={(e) => onChange(f.path, Number(e.target.value))}
              />
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Humor do cliente" description="Reage a insatisfação ou raiva.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!getPath(config, "sentiment.enabled", false)}
            onCheckedChange={(v) => onChange("sentiment.enabled", v)}
            id="sentiment"
          />
          <Label htmlFor="sentiment">Reagir ao humor do cliente</Label>
        </div>
        {!!getPath(config, "sentiment.enabled", false) && (
          <div className="grid gap-4 md:grid-cols-2 pt-2">
            <Field label="Quando" tooltip="Nível de insatisfação que dispara a reação.">
              <Select
                value={(getPath(config, "sentiment.threshold", "dissatisfied") as string)}
                onValueChange={(v) => onChange("sentiment.threshold", v)}
              >
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer insatisfação</SelectItem>
                  <SelectItem value="dissatisfied">Insatisfeito</SelectItem>
                  <SelectItem value="angry">Bravo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ação" tooltip="O que fazer quando o humor do cliente atinge o limite.">
              <Select
                value={(getPath(config, "sentiment.action", "handoff") as string)}
                onValueChange={(v) => onChange("sentiment.action", v)}
              >
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="handoff">Transferir</SelectItem>
                  <SelectItem value="notify_and_continue">Notificar e continuar</SelectItem>
                  <SelectItem value="log_only">Apenas registrar</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 10 — Equipe e horários
// ─────────────────────────────────────────────────────────────────────────────

function StepTeam({
  config,
  catalogs,
  onChange,
}: {
  config: Record<string, unknown>;
  catalogs: Catalogs;
  onChange: (path: string, value: unknown) => void;
}) {
  const handoff = getPath(config, "handoff", {}) as Record<string, unknown>;
  const bh = getPath(config, "businessHours", null) as Record<string, unknown> | null;
  const inactivity = getPath(config, "inactivity", {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <SectionCard title="Destino padrão" description="Para quem o agente passa quando nenhuma regra diz o contrário.">
        <Field label="Destino" tooltip="Para quem a conversa vai quando nenhuma regra específica define o destino.">
          <DestinationPicker
            value={handoff.defaultDestination as Record<string, string> | undefined}
            catalogs={catalogs}
            onChange={(v) => onChange("handoff.defaultDestination", v)}
          />
        </Field>
        <Field label="Mensagem ao transferir" tooltip="Texto enviado ao cliente antes de passar para uma pessoa.">
          <Textarea
            value={(handoff.message as string) ?? ""}
            onChange={(e) => onChange("handoff.message", e.target.value)}
          />
        </Field>
        <MultiChip
          label="Palavras-chave de pedido humano"
          tooltip="Se o cliente usar uma dessas palavras, o agente transfere para a equipe."
          values={((handoff.humanRequestKeywords as string[]) ?? []).map(String)}
          onChange={(v) => onChange("handoff.humanRequestKeywords", v)}
        />
      </SectionCard>

      <SectionCard title="Horário de atendimento" description="Fora do horário, a ação definida entra em vigor.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!bh?.enabled}
            onCheckedChange={(v) =>
              onChange(
                "businessHours",
                v
                  ? { enabled: true, timezone: "America/Sao_Paulo", weekdays: [], offHoursMessage: "" }
                  : null,
              )
            }
            id="bh"
          />
          <Label htmlFor="bh">Respeitar horário de atendimento</Label>
        </div>
        {!!bh?.enabled && (
          <>
            <Field label="Fuso horário" tooltip="Fuso usado para calcular se está dentro do expediente.">
              <Input value={(bh.timezone as string) ?? ""} onChange={(e) => onChange("businessHours.timezone", e.target.value)} />
            </Field>
            <Field label="Fora do horário" tooltip="O que fazer se o cliente enviar mensagem fora do expediente.">
              <Select
                value={(bh.outsideAction as string) ?? "message"}
                onValueChange={(v) => onChange("businessHours.outsideAction", v)}
              >
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">Enviar mensagem</SelectItem>
                  <SelectItem value="handoff">Transferir</SelectItem>
                  <SelectItem value="silence">Não responder</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mensagem fora do horário" tooltip="Resposta automática usada quando o atendimento está fechado.">
              <Textarea
                value={(bh.offHoursMessage as string) ?? ""}
                onChange={(e) => onChange("businessHours.offHoursMessage", e.target.value)}
              />
            </Field>
            <div className="space-y-2">
              {((bh.weekdays as Array<Record<string, unknown>>) ?? []).map((slot, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={String(slot.day ?? 1)}
                    onValueChange={(v) => {
                      const next = (bh.weekdays as Array<Record<string, unknown>>).slice();
                      next[i] = { ...next[i], day: Number(v) };
                      onChange("businessHours.weekdays", next);
                    }}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d, idx) => (
                        <SelectItem key={idx} value={String(idx)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="time"
                    value={(slot.start as string) ?? "08:00"}
                    onChange={(e) => {
                      const next = (bh.weekdays as Array<Record<string, unknown>>).slice();
                      next[i] = { ...next[i], start: e.target.value };
                      onChange("businessHours.weekdays", next);
                    }}
                  />
                  <span>até</span>
                  <Input
                    type="time"
                    value={(slot.end as string) ?? "18:00"}
                    onChange={(e) => {
                      const next = (bh.weekdays as Array<Record<string, unknown>>).slice();
                      next[i] = { ...next[i], end: e.target.value };
                      onChange("businessHours.weekdays", next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      onChange(
                        "businessHours.weekdays",
                        (bh.weekdays as Array<Record<string, unknown>>).filter((_, j) => j !== i),
                      )
                    }
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange("businessHours.weekdays", [
                    ...((bh.weekdays as Array<Record<string, unknown>>) ?? []),
                    { day: 1, start: "08:00", end: "18:00" },
                  ])
                }
              >
                <IconPlus className="size-4" /> Adicionar dia
              </Button>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Inatividade" description="Lembrete e encerramento automático se o cliente parar de responder.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!inactivity.enabled}
            onCheckedChange={(v) => onChange("inactivity.enabled", v)}
            id="inactivity"
          />
          <Label htmlFor="inactivity">Ativar</Label>
        </div>
        {!!inactivity.enabled && (
          <div className="grid gap-4 md:grid-cols-2 pt-2">
            <Field label="Lembrete após (min)" tooltip="Tempo de silêncio antes de enviar um lembrete educado.">
              <Input
                type="number"
                value={String(inactivity.nudgeAfter ?? 30)}
                onChange={(e) => onChange("inactivity.nudgeAfter", Number(e.target.value))}
              />
            </Field>
            <Field label="Encerrar após (min)" tooltip="Tempo de silêncio antes de encerrar a conversa automaticamente.">
              <Input
                type="number"
                value={String(inactivity.closeAfter ?? 1440)}
                onChange={(e) => onChange("inactivity.closeAfter", Number(e.target.value))}
              />
            </Field>
            <Field label="Mensagem de lembrete" tooltip="Texto enviado para reengajar o cliente antes de encerrar." className="md:col-span-2">
              <Textarea
                value={(inactivity.nudgeMessage as string) ?? ""}
                onChange={(e) => onChange("inactivity.nudgeMessage", e.target.value)}
              />
            </Field>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 11 — Encerrar e classificar
// ─────────────────────────────────────────────────────────────────────────────

function StepClosure({
  config,
  catalogs,
  onChange,
}: {
  config: Record<string, unknown>;
  catalogs: Catalogs;
  onChange: (path: string, value: unknown) => void;
}) {
  const closure = getPath(config, "closure", {}) as Record<string, unknown>;
  const survey = getPath(config, "survey", {}) as Record<string, unknown>;
  const tabulation = getPath(config, "tabulation", {}) as Record<string, unknown>;
  const fieldUpdates = (closure.fieldUpdates as Array<{ entity: "contact" | "deal"; key: string; value: string }>) ?? [];

  const contactFields = (getPath(config, "contextFields.contact", []) as Array<{ key: string; label?: string; permissions: string[] }>) ?? [];
  const dealFields = (getPath(config, "contextFields.deal", []) as Array<{ key: string; label?: string; permissions: string[] }>) ?? [];
  const writableOptions = [
    ...contactFields.filter((f) => f.permissions.includes("write")).map((f) => ({
      entity: "contact" as const,
      key: f.key,
      label: `Contato · ${f.label ?? catalogs.contactCustomFields.find((c) => c.id === f.key)?.name ?? f.key}`,
    })),
    ...dealFields.filter((f) => f.permissions.includes("write")).map((f) => ({
      entity: "deal" as const,
      key: f.key,
      label: `Negócio · ${f.label ?? catalogs.dealCustomFields.find((c) => c.id === f.key)?.name ?? f.key}`,
    })),
  ];

  const setFieldUpdates = (next: typeof fieldUpdates) => onChange("closure.fieldUpdates", next);

  return (
    <div className="space-y-6">
      <SectionCard title="Encerramento" description="Mensagem de despedida e janela pós-encerramento.">
        <Field label="Mensagem de despedida" tooltip="Texto enviado quando a conversa é encerrada.">
          <Textarea
            value={(closure.goodbyeMessage as string) ?? ""}
            onChange={(e) => onChange("closure.goodbyeMessage", e.target.value)}
          />
        </Field>
        <Field label="Janela pós-encerramento (horas)" tooltip="Por quanto tempo uma nova mensagem do cliente reabre a mesma conversa.">
          <Input
            type="number"
            value={String(closure.postCloseWindowHours ?? 6)}
            onChange={(e) => onChange("closure.postCloseWindowHours", Number(e.target.value))}
          />
        </Field>
        <div className="flex items-center gap-3">
          <Switch
            checked={!!closure.returnToOriginStage}
            onCheckedChange={(v) => onChange("closure.returnToOriginStage", v)}
            id="returnStage"
          />
          <Label htmlFor="returnStage">Devolver card à etapa de origem ao fechar</Label>
        </div>
      </SectionCard>

      <SectionCard title="Campos a atualizar no encerramento" description="Sempre que a conversa for encerrada por este agente, atualize automaticamente estes campos do contato ou do negócio.">
        <div className="space-y-2">
          {fieldUpdates.map((fu, i) => (
            <div key={i} className="flex gap-2">
              <Select
                value={`${fu.entity}:${fu.key}`}
                onValueChange={(v) => {
                  const [entity, key] = v.split(":");
                  const next = fieldUpdates.slice();
                  next[i] = { ...next[i], entity: entity as "contact" | "deal", key };
                  setFieldUpdates(next);
                }}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Campo…" />
                </SelectTrigger>
                <SelectContent>
                  {writableOptions.map((o) => (
                    <SelectItem key={`${o.entity}:${o.key}`} value={`${o.entity}:${o.key}`}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Novo valor"
                value={fu.value}
                onChange={(e) => {
                  const next = fieldUpdates.slice();
                  next[i] = { ...next[i], value: e.target.value };
                  setFieldUpdates(next);
                }}
              />
              <Button variant="outline" size="icon" onClick={() => setFieldUpdates(fieldUpdates.filter((_, j) => j !== i))}>
                <IconTrash className="size-4" />
              </Button>
            </div>
          ))}
          {writableOptions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum campo com permissão de atualizar. Libere a coluna “Atualizar” em O que ele sabe primeiro.
            </p>
          )}
          {writableOptions.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setFieldUpdates([...fieldUpdates, { entity: writableOptions[0].entity, key: writableOptions[0].key, value: "" }])}
            >
              <IconPlus className="size-4" /> Adicionar campo
            </Button>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Devolver para a automação" description="Se este atendimento começou por uma automação, ela pode continuar de onde ficou paralisada, no passo indicado.">
        <Field label="Id do passo da automação" tooltip="Id do step da automação que deve continuar quando este agente encerrar a conversa. Deixe vazio se não houver automação de origem.">
          <Input
            value={(closure.nextAutomationStepId as string) ?? ""}
            onChange={(e) => onChange("closure.nextAutomationStepId", e.target.value || undefined)}
            placeholder="Opcional"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Comportamento após reabertura" description="O que fazer quando o cliente manda nova mensagem depois de encerrado.">
        {[
          { key: "courtesyBehavior", label: "Cortesia/despedida", tooltip: "Cliente só agradeceu ou se despediu." },
          { key: "newDemandBehavior", label: "Nova demanda", tooltip: "Cliente trouxe uma solicitação clara após encerramento." },
          { key: "ambiguousBehavior", label: "Ambíguo", tooltip: "Não ficou claro se é uma nova demanda ou continuação." },
        ].map((c) => (
          <Field key={c.key} label={c.label} tooltip={c.tooltip}>
            <Select
              value={(closure[c.key] as string) ?? "short_reply"}
              onValueChange={(v) => onChange(`closure.${c.key}`, v)}
            >
              <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
              <SelectContent>
                {POST_CLOSE_BEHAVIOR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ))}
      </SectionCard>

      <SectionCard title="Pesquisa de satisfação" description="Perguntar nota ao encerrar.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!survey.enabled}
            onCheckedChange={(v) => onChange("survey.enabled", v)}
            id="survey"
          />
          <Label htmlFor="survey">Ativar pesquisa</Label>
        </div>
        {!!survey.enabled && (
          <>
            <Field label="Pergunta" tooltip="Texto usado para pedir a nota de satisfação.">
              <Textarea
                value={(survey.question as string) ?? ""}
                onChange={(e) => onChange("survey.question", e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Switch
                checked={!!survey.askReason}
                onCheckedChange={(v) => onChange("survey.askReason", v)}
                id="askReason"
              />
              <Label htmlFor="askReason">Perguntar motivo da nota</Label>
            </div>
            <Field label="Frequência máxima (dias)" tooltip="Intervalo mínimo entre pesquisas enviadas ao mesmo cliente.">
              <Input
                type="number"
                value={String(survey.maxFrequencyDays ?? 30)}
                onChange={(e) => onChange("survey.maxFrequencyDays", Number(e.target.value))}
              />
            </Field>
          </>
        )}
      </SectionCard>

      <SectionCard title="Tabulação" description="Classificar o atendimento ao encerrar ou transferir.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!tabulation.enabled}
            onCheckedChange={(v) => onChange("tabulation.enabled", v)}
            id="tabulation"
          />
          <Label htmlFor="tabulation">Ativar tabulação</Label>
        </div>
        {!!tabulation.enabled && (
          <>
            <Field label="Quando" tooltip="Momento em que a classificação deve ser aplicada.">
              <Select
                value={(tabulation.when as string) ?? "on_close"}
                onValueChange={(v) => onChange("tabulation.when", v)}
              >
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_close">Ao encerrar</SelectItem>
                  <SelectItem value="on_transfer">Ao transferir</SelectItem>
                  <SelectItem value="always">Sempre</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center gap-3">
              <Switch
                checked={!!tabulation.required}
                onCheckedChange={(v) => onChange("tabulation.required", v)}
                id="tabRequired"
              />
              <Label htmlFor="tabRequired">Obrigatória</Label>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 12 — Testar e publicar
// ─────────────────────────────────────────────────────────────────────────────

/** Normaliza executedActions/discardedActions (formato antigo achatado ou novo { action, label }). */
function normalizeActionEntry(entry: Record<string, unknown>): { action: Record<string, unknown>; label: string; reason?: string } {
  if (entry && typeof entry === "object" && "action" in entry && "label" in entry) {
    return entry as { action: Record<string, unknown>; label: string; reason?: string };
  }
  const type = typeof entry.type === "string" ? entry.type : "Ação";
  return { action: entry, label: type };
}

function formatCrmValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "[objeto]";
    }
  }
  return String(v);
}

function WhyPanel({ result, onEditTheme, onEditRule }: {
  result: TestResult;
  onEditTheme?: () => void;
  onEditRule?: () => void;
}) {
  const executed = result.executedActions.map((a) => normalizeActionEntry(a as Record<string, unknown>));
  const discarded = result.discardedActions.map((a) => normalizeActionEntry(a as Record<string, unknown>));
  return (
    <div className="mt-2 space-y-3 rounded-xl border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium">
          <IconRoute className="size-3.5 text-muted-foreground" />
          Regra aplicada:{" "}
          <strong className="font-semibold">{result.appliedRuleName ?? result.appliedRuleId ?? "Nenhuma (o modelo decidiu)"}</strong>
        </span>
        {onEditRule && result.appliedRuleId && (
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={onEditRule}>
            Editar regra <IconArrowRight className="size-3" />
          </Button>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium">
          <IconMessageCircle2 className="size-3.5 text-muted-foreground" />
          Assunto identificado:{" "}
          <strong className="font-semibold">{result.themeName ?? result.themeId ?? "Nenhum"}</strong>
        </span>
        {onEditTheme && result.themeId && (
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={onEditTheme}>
            Editar assunto <IconArrowRight className="size-3" />
          </Button>
        )}
        {result.handoff && <Badge variant="secondary">Passou para uma pessoa</Badge>}
        {result.closed && <Badge variant="secondary">Encerrou a conversa</Badge>}
        {result.expandedByLength && (
          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 bg-amber-50">
            <IconAlertCircle className="size-3" />
            Resposta foi curta demais; modelo reconvidado com mais tokens
          </Badge>
        )}
        {result.tone && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium">
            <IconMoodSmile className="size-3.5 text-muted-foreground" />
            Tom: <strong className="font-semibold">{result.tone}</strong>
          </span>
        )}
        {result.responseLength && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs font-medium">
            <IconTextSize className="size-3.5 text-muted-foreground" />
            Tamanho: <strong className="font-semibold">{RESPONSE_LENGTH_LABELS[result.responseLength] ?? result.responseLength}</strong>
          </span>
        )}
      </div>

      {result.globalRules && result.globalRules.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <IconListCheck className="size-3.5" /> Regras gerais enviadas
          </p>
          <ul className="list-inside list-disc rounded-lg bg-background px-3 py-2 text-[13px]">
            {result.globalRules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <IconUser className="size-3.5" /> Cliente carregado
        </p>
        {result.crmContext?.contact && Object.keys(result.crmContext.contact).length > 0 ? (
          <ul className="space-y-1 rounded-lg bg-background px-3 py-2 text-[13px]">
            {Object.entries(result.crmContext.contact).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">{k}:</span>{" "}
                <span className="text-muted-foreground">{formatCrmValue(v).slice(0, 200)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-background px-3 py-2 text-[13px] text-muted-foreground">Nenhum contato encontrado para esta conversa.</p>
        )}
      </div>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <IconFile className="size-3.5" /> Negócio usado
        </p>
        {result.crmContext?.selectedDeal && Object.keys(result.crmContext.selectedDeal).length > 0 ? (
          <ul className="space-y-1 rounded-lg bg-background px-3 py-2 text-[13px]">
            {Object.entries(result.crmContext.selectedDeal).map(([k, v]) => (
              <li key={k}>
                <span className="font-medium">{k}:</span>{" "}
                <span className="text-muted-foreground">{formatCrmValue(v).slice(0, 200)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-background px-3 py-2 text-[13px] text-muted-foreground">Nenhum negócio selecionado.</p>
        )}
        {result.dealSelectionReason && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium">Por quê:</span> {result.dealSelectionReason}
          </p>
        )}
        {result.crmContext?.deals && result.crmContext.deals.length > 1 && !result.crmContext.selectedDeal && (
          <p className="mt-1 text-xs text-amber-600">
            {result.crmContext.deals.length} negócios abertos encontrados. Aguardando escolha do cliente.
          </p>
        )}
      </div>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <IconBulb className="size-3.5" /> Por que respondeu isso
        </p>
        <p className="rounded-lg bg-background px-3 py-2 text-[13px]">{result.reason || "Sem motivo informado."}</p>
      </div>

      {result.toolCalls.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <IconTool className="size-3.5" /> Ferramentas chamadas
          </p>
          <ul className="space-y-1">
            {result.toolCalls.map((t, i) => (
              <li key={i} className="rounded-lg bg-background px-3 py-2 text-[13px]">
                <span className="font-medium">{toolLabel(t.toolName)}</span>
                <span className="text-muted-foreground"> → {JSON.stringify(t.result).slice(0, 160)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.ragChunks.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <IconFile className="size-3.5" /> Trechos dos materiais usados
          </p>
          <ul className="space-y-1">
            {result.ragChunks.map((c, i) => (
              <li key={i} className="rounded-lg bg-background px-3 py-2 text-[13px]">
                {c.docTitle && <span className="font-medium">{c.docTitle}: </span>}
                <span className="text-muted-foreground">{(c.text ?? "").slice(0, 220) || "(sem trecho)"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {executed.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <IconCheck className="size-3.5" /> Ações que seriam executadas
          </p>
          <ul className="space-y-1">
            {executed.map((a, i) => (
              <li key={i} className="rounded-lg bg-background px-3 py-2 text-[13px]">
                <span className="font-medium">{a.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {discarded.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <IconMoodSad2 className="size-3.5" /> Ações descartadas e o motivo
          </p>
          <ul className="space-y-1">
            {discarded.map((a, i) => (
              <li key={i} className="rounded-lg bg-background px-3 py-2 text-[13px]">
                <span className="font-medium">{a.label}</span>
                <span className="text-muted-foreground"> — {a.reason ?? "Não permitida neste contexto."}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.scrubbedFields && result.scrubbedFields.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-600">
            <IconAlertTriangle className="size-3.5" /> Informações removidas da resposta
          </p>
          <p className="rounded-lg bg-background px-3 py-2 text-[13px]">
            Um ou mais campos marcados apenas como "Ler" foram detectados no texto que o modelo gerou e removidos antes de serem enviados ao cliente.
          </p>
        </div>
      )}

      <p className="text-right text-[11px] text-muted-foreground">
        {result.inputTokens + result.outputTokens} tokens · {result.latencyMs}ms
      </p>
    </div>
  );
}

function StepTestPublish({
  agentId,
  dirty,
  catalogs,
  onSave,
  onGoToTheme,
  onGoToRule,
}: {
  agentId: string;
  dirty: boolean;
  catalogs: Catalogs;
  onSave: () => Promise<void>;
  onGoToTheme?: (themeId: string) => void;
  onGoToRule?: (ruleId: string) => void;
}) {
  const [message, setMessage] = React.useState("");
  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [testing, setTesting] = React.useState(false);
  const [openWhyId, setOpenWhyId] = React.useState<string | null>(null);
  const [testContactId, setTestContactId] = React.useState<string>("");
  const [contactSearch, setContactSearch] = React.useState("");
  const [debouncedContactSearch, setDebouncedContactSearch] = React.useState("");
  const [testStage, setTestStage] = React.useState<TestResult["stage"]>("idle");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedContactSearch(contactSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [contactSearch]);

  const contactsQuery = useQuery({
    queryKey: ["ai-agents-v2-test-contacts", debouncedContactSearch],
    queryFn: async () => {
      const res = await apiFetch(`/api/contacts?search=${encodeURIComponent(debouncedContactSearch)}&perPage=20`);
      return parseApiResponse<{ items: Array<{ id: string; name: string | null; phone: string | null; email: string | null }> }>(
        res,
        "Erro ao buscar contatos.",
      );
    },
    enabled: debouncedContactSearch.length >= 2,
    staleTime: 60_000,
  });

  const selectedContact = React.useMemo(() => {
    if (!testContactId) return null;
    return (
      (catalogs.contacts ?? []).find((c) => c.id === testContactId) ??
      contactsQuery.data?.items.find((c) => c.id === testContactId) ??
      null
    );
  }, [testContactId, catalogs.contacts, contactsQuery.data]);

  const contactOptions = React.useMemo(() => {
    const generic = { value: "", label: "Contato genérico" };
    const searched = (contactsQuery.data?.items ?? []).map((c) => ({
      value: c.id,
      label: c.name || c.phone || c.email || c.id,
      sub: c.phone || c.email || undefined,
    }));
    const selectedOption = selectedContact
      ? {
          value: selectedContact.id,
          label: selectedContact.name || selectedContact.phone || selectedContact.email || selectedContact.id,
          sub: selectedContact.phone || selectedContact.email || undefined,
        }
      : undefined;
    const options: Array<{ value: string; label: string; sub?: string }> = [generic];
    if (selectedOption && !searched.some((s) => s.value === selectedOption.value)) {
      options.push(selectedOption);
    }
    options.push(...searched);
    return options;
  }, [contactsQuery.data, selectedContact]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, testing]);

  const runTest = async () => {
    const text = message.trim();
    if (!text) return;
    if (dirty) await onSave();
    const turnId = `t_${Date.now()}`;
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const t of turns) {
      history.push({ role: "user", content: t.userMessage });
      if (t.result?.reply) history.push({ role: "assistant", content: t.result.reply });
    }
    setTurns((prev) => [...prev, { id: turnId, userMessage: text }]);
    setMessage("");
    setTesting(true);
    try {
      const r = await testAgent(agentId, text, history, testContactId || undefined, testStage);
      setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, result: r } : t)));
      if (r.stage) setTestStage(r.stage);
      setOpenWhyId(turnId);
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, error: err instanceof Error ? err.message : "Erro no teste" } : t)),
      );
    } finally {
      setTesting(false);
    }
  };

  const restart = () => {
    setTurns([]);
    setOpenWhyId(null);
    setTestStage("idle");
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Conversa de teste"
        description="Converse com o agente como se fosse o cliente, sem afetar clientes reais. Depois de cada resposta, veja os bastidores em “Por que respondeu isso?”."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Simulação isolada — nada é enviado pelo canal real nem grava dados do cliente.</p>
          <div className="flex items-center gap-2">
            <MultiSelectPopover
              label="Simular como contato genérico"
              options={contactOptions}
              single
              value={testContactId}
              onValueChange={setTestContactId}
              onSearchQueryChange={setContactSearch}
              searchable
              width={320}
            />
            <Button variant="outline" size="sm" onClick={restart} disabled={turns.length === 0} className="gap-1">
              <IconRefresh className="size-3.5" /> Recomeçar
            </Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex max-h-[480px] min-h-[320px] flex-col gap-3 overflow-y-auto rounded-xl border bg-[var(--chat-bg,var(--muted))] p-4"
        >
          {turns.length === 0 && !testing && (
            <p className="m-auto text-sm text-muted-foreground">Digite uma mensagem abaixo para começar a simulação.</p>
          )}
          {turns.map((t) => (
            <React.Fragment key={t.id}>
              {/* Bolha do cliente simulado */}
              <div className="flex justify-start">
                <div
                  className="max-w-[75%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm shadow-sm"
                  style={{ background: "var(--chat-bubble-received-bg, #fff)", color: "var(--chat-bubble-received-text, inherit)" }}
                >
                  {t.userMessage}
                </div>
              </div>
              {/* Bolha do agente */}
              {t.result && (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex justify-end">
                    <div
                      className="max-w-[75%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm shadow-sm"
                      style={{ background: "var(--chat-bubble-sent-bg, var(--primary))", color: "var(--chat-bubble-sent-text, var(--primary-foreground))" }}
                    >
                      {t.result.reply || <span className="italic opacity-75">(sem resposta ao cliente)</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenWhyId(openWhyId === t.id ? null : t.id)}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <IconBulb className="size-3.5" />
                    Por que respondeu isso?
                    <IconChevronDown className={cn("size-3 transition-transform", openWhyId === t.id && "rotate-180")} />
                  </button>
                  {openWhyId === t.id && (
                    <div className="w-full max-w-[92%]">
                      <WhyPanel
                        result={t.result}
                        onEditTheme={t.result.themeId && onGoToTheme ? () => onGoToTheme(t.result!.themeId!) : undefined}
                        onEditRule={t.result.appliedRuleId && onGoToRule ? () => onGoToRule(t.result!.appliedRuleId!) : undefined}
                      />
                    </div>
                  )}
                </div>
              )}
              {t.error && (
                <div className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-br-sm border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm text-destructive">
                    Não consegui responder: {t.error}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
          {testing && (
            <div className="flex justify-end">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-br-sm bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
                <span className="ml-1">digitando…</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite como se fosse o cliente…"
            onKeyDown={(e) => e.key === "Enter" && !testing && runTest()}
            disabled={testing}
          />
          <Button onClick={runTest} disabled={testing || !message.trim()}>
            <IconSend className="size-4" /> Enviar
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Antes de publicar" description="Confira o essencial antes de deixar o agente no ar.">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2"><IconCheck className="size-4 text-success" /> Teste ao menos uma mensagem de cada assunto importante.</li>
          <li className="flex items-center gap-2"><IconCheck className="size-4 text-success" /> Confira se os campos citados aparecem certos nas respostas.</li>
          <li className="flex items-center gap-2"><IconCheck className="size-4 text-success" /> Veja se a transferência para pessoa acontece quando deveria.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
