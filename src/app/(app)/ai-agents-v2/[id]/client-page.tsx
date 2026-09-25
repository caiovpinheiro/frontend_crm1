"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconBrain,
  IconTrash,
  IconSend,
  IconPlus,
  IconRocket,
  IconAlertCircle,
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
  IconHome,
  IconBook,
  IconUsers,
  IconFlask,
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
  { value: "objective", label: "Mais previsível", description: "Respostas diretas, consistentes e sem muita variação." },
  { value: "balanced", label: "Equilibrado", description: "Respostas naturais, mantendo consistência e objetividade." },
  { value: "natural", label: "Mais natural", description: "Conversa mais espontânea, com maior variedade na forma de responder." },
  { value: "creative", label: "Mais criativo", description: "Respostas mais variadas e flexíveis, com maior liberdade na comunicação." },
];

const TYPING_PACE_OPTIONS = [
  { value: "10", label: "Rápido" },
  { value: "25", label: "Normal" },
  { value: "50", label: "Calmo" },
  { value: "90", label: "Lento" },
];

const ON_DEAL_NOT_FOUND_OPTIONS = [
  { value: "ask_identification", label: "Pedir os dados (e-mail ou documento)" },
  { value: "create_deal", label: "Criar um negócio e seguir atendendo" },
  { value: "handoff", label: "Passar para a equipe" },
];

const POST_CLOSE_BEHAVIOR_OPTIONS = [
  { value: "no_reply", label: "Não responder" },
  { value: "short_reply", label: "Responder curtinho" },
  { value: "reopen_and_route", label: "Reabrir e encaminhar" },
  { value: "ask_with_options", label: "Perguntar com botões" },
];

const EMOJI_OPTIONS = [
  { value: "none", label: "Nenhum", example: "Sua entrega está prevista para 02/10. Quer que eu te passe como acompanhar?" },
  { value: "light", label: "Poucos", example: "Sua entrega está prevista para 02/10 📅 Quer que eu te passe como acompanhar?" },
  { value: "moderate", label: "À vontade", example: "📅 Entrega: 02/10\n👉 Quer que eu te passe como acompanhar? 😊" },
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
  { value: "distribution_rule", label: "Fila automática" },
  { value: "user", label: "Uma pessoa" },
  { value: "ai_agent", label: "Outro agente" },
  { value: "automation", label: "Automação" },
];

const CONDITION_TYPES = [
  { value: "keywords", label: "a mensagem contiver" },
  { value: "first_message", label: "for a primeira mensagem" },
  { value: "out_of_hours", label: "estiver fora do horário" },
  { value: "contact_tag", label: "o cliente tiver a etiqueta" },
  { value: "deal_stage", label: "o negócio estiver na etapa" },
  { value: "no_deal", label: "o cliente não tiver negócio aberto" },
  { value: "media_kind", label: "o cliente mandar mídia do tipo" },
  { value: "message_type", label: "a mensagem for do tipo" },
];
/** Só estas condições pedem valores; nas outras o campo não fazia sentido. */
const CONDITIONS_WITH_VALUES = new Set(["keywords", "contact_tag", "deal_stage", "media_kind", "message_type"]);
const CONDITION_PLACEHOLDER: Record<string, string> = {
  keywords: "Ex.: atendente, falar com alguém",
  contact_tag: "Nome da etiqueta",
  deal_stage: "Nome da etapa",
  media_kind: "audio, image ou document",
  message_type: "Ex.: text, audio",
};

const ACTION_TYPES = [
  { value: "send_message", label: "enviar a mensagem" },
  { value: "handoff", label: "passar para a equipe" },
  { value: "set_theme", label: "tratar como o assunto" },
  { value: "add_tag", label: "adicionar a etiqueta" },
  { value: "send_message_model", label: "enviar a mensagem pronta" },
  { value: "close_conversation", label: "encerrar a conversa" },
  { value: "no_reply", label: "não responder" },
];
// Fora da lista até a tela ter onde preencher os parâmetros (template
// oficial, variável, dúvida): salvas sem eles, falhavam em silêncio.

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Dicionário da tela: termo técnico do motor → o que aparece na tela, em português simples. */
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
  themeId?: string | null,
): Promise<TestResult> {
  // O assunto da mensagem anterior segue junto, como na conversa real.
  const body: Record<string, unknown> = { userMessage, history, stage, themeId: themeId ?? null };
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
    <section className="space-y-4 rounded-2xl bg-muted/40 p-5">
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
  hideMessage = false,
}: {
  value: { type?: string; id?: string; message?: string } | null | undefined;
  catalogs: Catalogs;
  onChange: (v: { type: string; id?: string; message?: string }) => void;
  /** O destino padrão já tem "Mensagem ao transferir". */
  hideMessage?: boolean;
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
      {!hideMessage && (
        <Input
          placeholder="Mensagem ao transferir para este destino (opcional; vazio usa a padrão)"
          value={value?.message ?? ""}
          onChange={(e) => onChange({ type: kind, id, message: e.target.value })}
        />
      )}
      {id && options.length > 0 && !options.find((o) => o.id === id) && (
        <Badge variant="outline" className="text-destructive border-destructive">
          Não encontrado no CRM
        </Badge>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página: seções no menu lateral + teste sempre ao lado
// ─────────────────────────────────────────────────────────────────────────────

type SectionId = "inicio" | "quem" | "sabe" | "cuida" | "comeco" | "equipe" | "publicacao" | "testes";

const SECTIONS: Array<{
  id: SectionId;
  title: string;
  intro: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "inicio", title: "Início", intro: "Onde o agente está e o que falta para ele atender.", icon: IconHome },
  { id: "quem", title: "Quem é o agente", intro: "Como ele fala e o que ele nunca faz.", icon: IconUser },
  { id: "sabe", title: "O que ele sabe", intro: "Ele só responde o que estiver aqui ou nos dados do cliente.", icon: IconBook },
  {
    id: "cuida",
    title: "Do que ele cuida",
    intro: "Cada assunto tem seu jeito de agir e para quem transferir. Ele reconhece o assunto pelo que o cliente escreve.",
    icon: IconListCheck,
  },
  {
    id: "comeco",
    title: "Começo e fim da conversa",
    intro: "Como ele cumprimenta, confirma quem é o cliente e encerra a conversa.",
    icon: IconMessageCircle2,
  },
  {
    id: "equipe",
    title: "Quando chama a equipe",
    intro: "Para quem ele passa a conversa, em que horários atende e quando para de responder.",
    icon: IconUsers,
  },
  { id: "publicacao", title: "Publicação", intro: "Onde ele atende, para quem, com qual modelo e qual versão.", icon: IconRocket },
  {
    id: "testes",
    title: "Testes",
    intro: "Veja as conversas dos números de teste e compare as respostas dele com as da sua equipe.",
    icon: IconFlask,
  },
];
const SECTION_IDS = SECTIONS.map((s) => s.id);

/** O que falta, por seção, para o agente poder atender. Vira o ponto vermelho no menu. */
function pendingBySection(cfg: Record<string, unknown>, hasKey: boolean): Partial<Record<SectionId, string[]>> {
  const out: Partial<Record<SectionId, string[]>> = {};
  const add = (id: SectionId, msg: string) => (out[id] = [...(out[id] ?? []), msg]);
  if (!String(cfg.tone ?? "").trim()) add("quem", "Falta o tom de voz");
  const dest = (cfg.handoff as { defaultDestination?: { id?: string } } | undefined)?.defaultDestination;
  if (!dest?.id) add("equipe", "Falta escolher para quem transferir");
  if (((cfg.channelIds as string[]) ?? []).length === 0) add("publicacao", "Falta escolher o número de WhatsApp");
  if (!hasKey) add("publicacao", "Falta a conta do modelo de IA");
  return out;
}

function useMinWidth(px: number): boolean {
  const [ok, setOk] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const update = () => setOk(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [px]);
  return ok;
}

function sectionFromUrl(): SectionId {
  if (typeof window === "undefined") return "inicio";
  const q = new URLSearchParams(window.location.search);
  if (q.get("tab") === "test") return "testes";
  const s = q.get("section") as SectionId | null;
  return s && SECTION_IDS.includes(s) ? s : "inicio";
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function AIAgentV2EditPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [section, setSection] = React.useState<SectionId>("inicio");
  const [knowTab, setKnowTab] = React.useState("materiais");
  const [careTab, setCareTab] = React.useState("assuntos");
  const [testsTab, setTestsTab] = React.useState("whatsapp");
  const [testOpen, setTestOpen] = React.useState(true);
  const isWide = useMinWidth(1280);
  const [config, setConfig] = React.useState<Record<string, unknown> | null>(null);
  const [name, setName] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [dirty, setDirty] = React.useState(false);
  const [openaiKey, setOpenaiKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [keyValidation, setKeyValidation] = React.useState<{ ok: boolean | null; message: string }>({ ok: null, message: "" });
  const [validatingKey, setValidatingKey] = React.useState(false);
  // Cada alteração soma 1. Um salvamento só limpa "alterado" se nada mudou
  // enquanto ele estava no ar; senão o próximo salvamento automático leva o resto.
  const editVersion = React.useRef(0);

  React.useEffect(() => {
    setSection(sectionFromUrl());
  }, []);

  const goTo = React.useCallback((next: SectionId) => {
    setSection(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("tab");
      url.searchParams.set("section", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* URL é conveniência */
    }
  }, []);

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

  const markDirty = React.useCallback(() => {
    editVersion.current += 1;
    setDirty(true);
  }, []);

  const updateConfig = React.useCallback(
    (path: string, value: unknown) => {
      setConfig((prev) => {
        if (!prev) return prev;
        return setPath(prev, path, value);
      });
      markDirty();
    },
    [markDirty],
  );

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!config) return;
      const version = editVersion.current;
      // Chave só vai quando está completa: o salvamento automático não pode
      // gravar uma chave pela metade enquanto a pessoa digita.
      const keyToSend = looksLikeOpenAiApiKey(openaiKey) ? openaiKey.trim() : undefined;
      setSaving(true);
      setSaveError(null);
      try {
        await updateAgentMeta(id, { name, active, openaiApiKey: keyToSend });
        await saveDraft(id, { ...config, name });
        if (keyToSend) setOpenaiKey("");
        if (editVersion.current === version) setDirty(false);
        setSavedAt(new Date());
        queryClient.invalidateQueries({ queryKey: ["ai-agents-v2", id] });
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Erro ao salvar.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
  });

  // Salvamento automático: 1,5 s depois da última alteração.
  React.useEffect(() => {
    if (!dirty || saving || !config) return;
    const t = setTimeout(() => {
      saveDraftMutation.mutate();
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, name, active, openaiKey, dirty, saving]);

  React.useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  const publishMutation = useMutation({
    mutationFn: async (comment?: string) => publishAgent(id, comment || undefined),
  });
  const [publishInfo, setPublishInfo] = React.useState<{
    next: number;
    first: boolean;
    changes: Array<{ section: string; items: string[] }>;
    realClients: boolean;
  } | null>(null);

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

  const hasKey = Boolean(agentQuery.data?.hasOwnOpenaiKey) || looksLikeOpenAiApiKey(openaiKey);

  const handlePublish = async () => {
    if (!hasKey) {
      await confirm({
        title: "Falta a conta do modelo",
        description: "Cole a chave da conta do modelo de IA em Publicação antes de publicar.",
        confirmLabel: "Entendi",
      });
      goTo("publicacao");
      return;
    }
    const dest = (config?.handoff as { defaultDestination?: { id?: string } } | undefined)?.defaultDestination;
    if (!dest?.id) {
      await confirm({
        title: "Falta escolher para quem transferir",
        description: "Sem isso, quando ele precisar passar a conversa para a equipe, ela não chega a ninguém.",
        confirmLabel: "Escolher agora",
      });
      goTo("equipe");
      return;
    }
    if (dirty) {
      try {
        await saveDraftMutation.mutateAsync();
      } catch {
        return;
      }
    }
    // Compara o que o servidor tem publicado com o rascunho salvo: os dois
    // passaram pela mesma normalização, então não aparecem diferenças falsas.
    const fresh = await queryClient.fetchQuery({ queryKey: ["ai-agents-v2", id], queryFn: () => fetchAgent(id), staleTime: 0 });
    const draft = fresh.draftConfig ?? fresh.publishedConfig ?? {};
    const channels = ((draft.channelIds as string[]) ?? []).length;
    const phones = ((draft.allowedPhoneNumbers as string[]) ?? []).length;
    const first = !fresh.lastVersionNumber;
    setPublishInfo({
      next: (fresh.lastVersionNumber ?? 0) + 1,
      first,
      changes: describeChanges(fresh.publishedConfig, fresh.draftConfig),
      realClients: (active || first) && channels > 0 && phones === 0,
    });
  };

  const confirmPublish = async (comment: string) => {
    if (!publishInfo) return;
    const first = publishInfo.first;
    const res = await publishMutation.mutateAsync(comment);
    setPublishInfo(null);
    // A primeira publicação liga o agente no servidor; o salvamento
    // automático não pode desligá-lo de volta com o estado antigo.
    if (first) setActive(true);
    queryClient.invalidateQueries({ queryKey: ["ai-agents-v2", id] });
    queryClient.invalidateQueries({ queryKey: ["ai-agents-v2-versions", id] });
    await confirm({ title: "Publicado", description: `A versão ${res.versionNumber} já está valendo no WhatsApp.` });
  };

  const reloadAfterRestore = () => {
    setConfig(null);
    setDirty(false);
    queryClient.invalidateQueries({ queryKey: ["ai-agents-v2", id] });
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
  const meta = agentQuery.data;
  const pending = pendingBySection(config, hasKey);
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const lastVersion = meta.lastVersionNumber;
  const changedSincePublish = Boolean(meta.hasUnpublishedChanges) || dirty;
  const showSidePanel = testOpen && isWide && section !== "testes";

  const statusBadge = !active ? (
    <Badge variant="outline" className="border-border bg-muted text-muted-foreground">Desligado</Badge>
  ) : !lastVersion ? (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Rascunho · nunca publicado</Badge>
  ) : changedSincePublish ? (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Publicado v{lastVersion} · com alterações</Badge>
  ) : (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Publicado v{lastVersion}</Badge>
  );

  const saveStatus = saving
    ? "Salvando…"
    : saveError
      ? "Não foi possível salvar"
      : dirty
        ? "Alterações serão salvas em instantes"
        : savedAt
          ? `Salvo às ${formatTime(savedAt)}`
          : "Tudo salvo";

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {statusBadge}
      <span className={cn("hidden text-xs sm:inline", saveError ? "text-destructive" : "text-muted-foreground")}>{saveStatus}</span>
      {section !== "testes" && (
        <Button variant="outline" onClick={() => setTestOpen((v) => !v || !isWide)} className="gap-1">
          <IconMessageCircle2 className="size-4" />
          {isWide && testOpen ? "Esconder teste" : "Testar"}
        </Button>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">
            <Button onClick={handlePublish} disabled={publishMutation.isPending} className="gap-1">
              <IconRocket className="size-4" />
              Publicar
            </Button>
          </span>
        </TooltipTrigger>
        {!hasKey && (
          <TooltipContent>
            <p>Falta a conta do modelo de IA (em Publicação).</p>
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );

  const testChat = (compact: boolean) => (
    <StepTestPublish
      agentId={id}
      dirty={dirty}
      catalogs={catalogs}
      compact={compact}
      onSave={async () => saveDraftMutation.mutateAsync()}
      onGoToTheme={() => {
        setCareTab("assuntos");
        goTo("cuida");
      }}
      onGoToRule={() => {
        setCareTab("atalhos");
        goTo("cuida");
      }}
    />
  );

  return (
    <TooltipProvider>
      <AppV2PageShell
        title={name || "Novo agente de IA"}
        icon={<IconBrain size={22} />}
        actions={headerActions}
        backHref="/ai-agents-v2"
        backLabel="Agentes"
      >
        {dialog}
        {publishInfo && (
          <PublishDialog
            open
            nextVersion={publishInfo.next}
            firstPublish={publishInfo.first}
            changes={publishInfo.changes}
            realClients={publishInfo.realClients}
            publishing={publishMutation.isPending}
            onCancel={() => setPublishInfo(null)}
            onConfirm={confirmPublish}
          />
        )}
        <div className="p-2 sm:p-4">
          {saveError && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertCircle className="size-4 shrink-0" />
              <span className="flex-1">Não conseguimos salvar: {saveError}</span>
              <Button size="sm" variant="outline" onClick={() => saveDraftMutation.mutate()}>
                Tentar de novo
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            {/* seções: coluna no desktop, faixa rolável no celular */}
            <nav
              aria-label="Seções do agente"
              className="flex shrink-0 gap-1 overflow-x-auto rounded-2xl border bg-card p-2 lg:sticky lg:top-4 lg:w-[216px] lg:flex-col lg:overflow-visible"
            >
              {SECTIONS.map((s) => {
                const on = s.id === section;
                const todo = (pending[s.id] ?? []).length > 0;
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => goTo(s.id)}
                    className={cn(
                      "flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3 text-left text-sm transition-colors",
                      on ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 whitespace-nowrap lg:whitespace-normal">{s.title}</span>
                    {todo && <span aria-label="Falta configurar" className="size-2 shrink-0 rounded-full bg-destructive" />}
                  </button>
                );
              })}
            </nav>

            <main className="min-w-0 flex-1 rounded-2xl border bg-card p-4 sm:p-6">
              <div className="max-w-[960px] space-y-5">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold tracking-tight">{current.title}</h2>
                  <p className="text-sm text-muted-foreground">{current.intro}</p>
                </div>

                {section === "inicio" && (
                  <SectionHome
                    config={config}
                    active={active}
                    lastVersion={lastVersion}
                    changedSincePublish={changedSincePublish}
                    hasKey={hasKey}
                    onGo={goTo}
                    onOpenTest={() => setTestOpen(true)}
                  />
                )}
                {section === "quem" && (
                  <div className="space-y-6">
                    <SectionCard title="Nome" description="Como ele aparece na lista de agentes e nas conversas.">
                      <Input
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          markDirty();
                        }}
                        placeholder="Ex.: Atendimento"
                        aria-label="Nome do agente"
                      />
                    </SectionCard>
                    <StepTone config={config} onChange={updateConfig} />
                  </div>
                )}
                {section === "sabe" && (
                  <Tabs value={knowTab} onValueChange={setKnowTab} className="space-y-4">
                    <TabsList className="flex h-auto flex-wrap justify-start">
                      <TabsTrigger value="materiais">Materiais</TabsTrigger>
                      <TabsTrigger value="calendario">Calendário</TabsTrigger>
                      <TabsTrigger value="dados">Dados do cliente e da empresa</TabsTrigger>
                      <TabsTrigger value="prontas">Mensagens prontas e catálogo</TabsTrigger>
                    </TabsList>
                    <TabsContent value="materiais">
                      <StepMaterials agentId={id} config={config} onChange={updateConfig} />
                    </TabsContent>
                    <TabsContent value="calendario">
                      <CalendarStep agentId={id} config={config} onChange={updateConfig} />
                    </TabsContent>
                    <TabsContent value="dados">
                      <StepContext config={config} catalogs={catalogs} onChange={updateConfig} />
                    </TabsContent>
                    <TabsContent value="prontas">
                      <StepMessagesProducts config={config} catalogs={catalogs} onChange={updateConfig} />
                    </TabsContent>
                  </Tabs>
                )}
                {section === "cuida" && (
                  <Tabs value={careTab} onValueChange={setCareTab} className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="assuntos">Assuntos</TabsTrigger>
                      <TabsTrigger value="atalhos">Atalhos automáticos</TabsTrigger>
                    </TabsList>
                    <TabsContent value="assuntos">
                      <StepThemes config={config} catalogs={catalogs} onChange={updateConfig} />
                    </TabsContent>
                    <TabsContent value="atalhos">
                      <StepRules config={config} catalogs={catalogs} onChange={updateConfig} />
                    </TabsContent>
                  </Tabs>
                )}
                {section === "comeco" && (
                  <div className="space-y-6">
                    <StepEntry config={config} onChange={updateConfig} />
                    <StepMedia config={config} onChange={updateConfig} />
                    <StepClosure config={config} catalogs={catalogs} onChange={updateConfig} />
                  </div>
                )}
                {section === "equipe" && (
                  <div className="space-y-6">
                    <StepTeam config={config} catalogs={catalogs} onChange={updateConfig} />
                    <StepOutputs config={config} onChange={updateConfig} />
                  </div>
                )}
                {section === "publicacao" && (
                  <StepStart
                    config={config}
                    catalogs={catalogs}
                    name={name}
                    hideName
                    active={active}
                    openaiKey={openaiKey}
                    hasOpenaiKey={meta.hasOwnOpenaiKey ?? false}
                    openaiKeyHint={meta.openaiApiKeyHint ?? null}
                    hasUnpublishedChanges={changedSincePublish}
                    publishedVersionNumber={lastVersion}
                    validatingKey={validatingKey}
                    keyValidation={keyValidation}
                    onNameChange={(v) => {
                      setName(v);
                      markDirty();
                    }}
                    onActiveChange={(v) => {
                      setActive(v);
                      markDirty();
                    }}
                    onKeyChange={(v) => {
                      setOpenaiKey(v);
                      markDirty();
                      setKeyValidation({ ok: null, message: "" });
                    }}
                    onChange={updateConfig}
                    onValidateKey={() => validateKeyMutation.mutate()}
                  />
                )}
                {section === "publicacao" && (
                  <VersionHistory agentId={id} lastVersion={lastVersion} onRestored={reloadAfterRestore} />
                )}
                {section === "testes" && (
                  <Tabs value={testsTab} onValueChange={setTestsTab} className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="whatsapp">Pelo WhatsApp</TabsTrigger>
                      <TabsTrigger value="compare">Comparar com a equipe</TabsTrigger>
                      <TabsTrigger value="try">Conversa de teste</TabsTrigger>
                    </TabsList>
                    <TabsContent value="whatsapp">
                      <TestConversations agentId={id} />
                    </TabsContent>
                    <TabsContent value="compare">
                      <CompareHuman agentId={id} />
                    </TabsContent>
                    <TabsContent value="try">{testChat(false)}</TabsContent>
                  </Tabs>
                )}
              </div>
            </main>

            {showSidePanel && (
              <aside
                aria-label="Testar o agente"
                className="sticky top-4 flex h-[calc(100vh-9rem)] w-[360px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-card"
              >
                {testChat(true)}
              </aside>
            )}
          </div>
        </div>

        {/* Telas menores: o teste abre por cima, da direita. */}
        <Sheet open={testOpen && !isWide && section !== "testes"} onOpenChange={(o) => setTestOpen(o)}>
          <SheetContent className="w-full max-w-[420px] p-0">
            <div className="flex h-full flex-col">{testChat(true)}</div>
          </SheetContent>
        </Sheet>
      </AppV2PageShell>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Publicação: o que muda e versões
// ─────────────────────────────────────────────────────────────────────────────

type AgentVersion = {
  versionNumber: number;
  comment?: string | null;
  createdAt: string;
  createdByName?: string | null;
};

async function fetchVersions(id: string): Promise<AgentVersion[]> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/versions`);
  const data = await parseApiResponse<{ versions: AgentVersion[] }>(res, "Erro ao carregar as versões.");
  return data.versions;
}

async function restoreVersion(id: string, versionNumber: number): Promise<void> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/versions/${versionNumber}/restore`, { method: "POST" });
  await parseApiResponse<unknown>(res, "Erro ao restaurar a versão.");
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

const CHANGE_GROUPS: Array<{ section: string; keys: Array<[string, string]> }> = [
  {
    section: "Quem é o agente",
    keys: [["name", "nome"], ["tone", "tom de voz"], ["responseLength", "tamanho das respostas"], ["emojis", "emojis"], ["globalRules", "regras que ele sempre segue"], ["responseBehavior", "estilo de resposta"]],
  },
  {
    section: "O que ele sabe",
    keys: [["allowedKnowledgeDocIds", "materiais em uso"], ["calendar", "calendário"], ["contextFields", "dados do cliente"], ["variables", "informações da empresa"], ["allowedMessageModelIds", "mensagens prontas"], ["productPolicy", "catálogo"], ["dealSelection", "negócio usado"]],
  },
  {
    section: "Do que ele cuida",
    keys: [["themes", "assuntos"], ["rules", "atalhos automáticos"], ["enabledTools", "o que ele pode fazer"], ["scope", "fora do escopo"]],
  },
  {
    section: "Começo e fim da conversa",
    keys: [["entry", "boas-vindas e confirmação"], ["media", "áudio, imagem e arquivo"], ["closure", "encerramento"]],
  },
  {
    section: "Quando chama a equipe",
    keys: [["handoff", "transferência"], ["businessHours", "horário de atendimento"], ["sentiment", "cliente irritado"], ["fallback", "quando não souber"], ["limits", "limites"]],
  },
  {
    section: "Publicação",
    keys: [["channelIds", "números de WhatsApp"], ["allowedPhoneNumbers", "fase de teste"], ["autonomyMode", "como ele responde"], ["model", "modelo de IA"], ["simulateTyping", "parecer humano"], ["markMessagesRead", "parecer humano"], ["typingPerCharMs", "parecer humano"], ["allowedDomains", "sites permitidos"], ["structuredOutput", "formato da resposta"]],
  },
];

/** Assuntos/atalhos: quantos entraram, saíram e mudaram, com os nomes que entraram. */
function describeListChange(label: string, before: unknown, after: unknown): string {
  const a = Array.isArray(before) ? (before as Array<Record<string, unknown>>) : [];
  const b = Array.isArray(after) ? (after as Array<Record<string, unknown>>) : [];
  const withId = (xs: Array<Record<string, unknown>>) => xs.every((x) => x && typeof x === "object" && typeof x.id === "string");
  if (!withId(a) || !withId(b)) {
    const added = b.filter((x) => !a.some((y) => stableJson(y) === stableJson(x))).length;
    const removed = a.filter((x) => !b.some((y) => stableJson(y) === stableJson(x))).length;
    const parts = [added ? `+${added}` : "", removed ? `−${removed}` : ""].filter(Boolean);
    return parts.length ? `${label}: ${parts.join(", ")}` : `${label} reordenados`;
  }
  const byId = new Map(a.map((x) => [x.id as string, x]));
  const added = b.filter((x) => !byId.has(x.id as string));
  const removed = a.filter((x) => !b.some((y) => y.id === x.id));
  const changed = b.filter((x) => byId.has(x.id as string) && stableJson(byId.get(x.id as string)) !== stableJson(x));
  const name = (x: Record<string, unknown>) => String(x.name ?? x.title ?? "").trim();
  const parts: string[] = [];
  if (added.length) parts.push(`+${added.length}${added.some(name) ? ` (${added.map(name).filter(Boolean).join(", ")})` : ""}`);
  if (removed.length) parts.push(`−${removed.length}`);
  if (changed.length) parts.push(`${changed.length} alterado${changed.length > 1 ? "s" : ""}`);
  return parts.length ? `${label}: ${parts.join(", ")}` : `${label} reordenados`;
}

function describeChanges(published: Record<string, unknown> | undefined, draft: Record<string, unknown> | undefined) {
  if (!draft) return [];
  const before = published ?? {};
  const out: Array<{ section: string; items: string[] }> = [];
  for (const g of CHANGE_GROUPS) {
    const items = new Set<string>();
    for (const [key, label] of g.keys) {
      if (stableJson(before[key]) === stableJson(draft[key])) continue;
      if (key === "themes" || key === "rules" || key === "globalRules" || key === "allowedKnowledgeDocIds") {
        items.add(describeListChange(label, before[key], draft[key]));
      } else if (key === "calendar") {
        const n = (x: unknown) => (((x as { events?: unknown[] } | undefined)?.events) ?? []).length;
        items.add(`calendário: ${n(before[key])} → ${n(draft[key])} datas`);
      } else {
        items.add(`${label} alterado`);
      }
    }
    if (items.size) out.push({ section: g.section, items: [...items] });
  }
  return out;
}

function PublishDialog({
  open,
  nextVersion,
  firstPublish,
  changes,
  realClients,
  publishing,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  nextVersion: number;
  firstPublish: boolean;
  changes: Array<{ section: string; items: string[] }>;
  realClients: boolean;
  publishing: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  // Montado só enquanto aberto: o comentário começa vazio a cada publicação.
  const [comment, setComment] = React.useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Publicar a versão {nextVersion}?</DialogTitle>
          <DialogDescription>
            {firstPublish
              ? "Ele passa a atender no WhatsApp com esta configuração."
              : "O WhatsApp passa a usar esta configuração agora. Conversas em andamento continuam normalmente."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!firstPublish && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                O que muda desde a versão {nextVersion - 1}
              </p>
              {changes.length === 0 ? (
                <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">Nada mudou desde a última publicação.</p>
              ) : (
                <div className="max-h-[40vh] space-y-2 overflow-y-auto">
                  {changes.map((c) => (
                    <div key={c.section} className="flex flex-col gap-0.5 rounded-xl bg-muted/60 px-3 py-2 sm:flex-row sm:gap-3">
                      <span className="shrink-0 text-sm font-semibold sm:w-48">{c.section}</span>
                      <span className="text-sm text-foreground/80">{c.items.join("; ")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {realClients && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                <b>Ele vai responder clientes reais.</b> Não há números na fase de teste. Para testar só com alguns números, preencha a fase de
                teste em Publicação antes.
              </p>
            </div>
          )}
          <Field label="O que mudou (opcional)" hint="Aparece no histórico de versões.">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex.: novo assunto de agendamento" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={publishing}>
              Cancelar
            </Button>
            <Button onClick={() => onConfirm(comment.trim())} disabled={publishing} className="gap-1">
              {publishing ? <IconLoader2 className="size-4 animate-spin" /> : <IconRocket className="size-4" />}
              Publicar versão {nextVersion}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionHistory({ agentId, lastVersion, onRestored }: { agentId: string; lastVersion?: number; onRestored: () => void }) {
  const { confirm, dialog } = useConfirm();
  const versionsQuery = useQuery({
    queryKey: ["ai-agents-v2-versions", agentId, lastVersion],
    queryFn: () => fetchVersions(agentId),
  });
  const restoreMutation = useMutation({
    mutationFn: (n: number) => restoreVersion(agentId, n),
    onSuccess: onRestored,
  });
  const versions = versionsQuery.data ?? [];

  const restore = async (n: number) => {
    const ok = await confirm({
      title: `Trazer a versão ${n} para o rascunho?`,
      description: "O que está no rascunho agora é substituído pela versão escolhida. O WhatsApp só muda quando você publicar de novo.",
      confirmLabel: "Trazer para o rascunho",
    });
    if (ok) restoreMutation.mutate(n);
  };

  return (
    <SectionCard title="Versões" description="Cada publicação vira uma versão. Dá para trazer uma antiga de volta para o rascunho.">
      {dialog}
      {versionsQuery.isLoading ? (
        <Skeleton className="h-24" />
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma versão publicada ainda.</p>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <div key={v.versionNumber} className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
              <span className="text-sm font-bold">v{v.versionNumber}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {formatDate(v.createdAt)}
                  {v.createdByName ? ` · ${v.createdByName}` : ""}
                </p>
                {v.comment && <p className="truncate text-xs text-muted-foreground">{v.comment}</p>}
              </div>
              {v.versionNumber === lastVersion ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  em uso
                </Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={() => restore(v.versionNumber)} disabled={restoreMutation.isPending}>
                  Trazer para o rascunho
                </Button>
              )}
            </div>
          ))}
          {restoreMutation.isError && (
            <p className="text-sm text-destructive">{(restoreMutation.error as Error)?.message ?? "Erro ao restaurar."}</p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Início
// ─────────────────────────────────────────────────────────────────────────────

function SectionHome({
  config,
  active,
  lastVersion,
  changedSincePublish,
  hasKey,
  onGo,
  onOpenTest,
}: {
  config: Record<string, unknown>;
  active: boolean;
  lastVersion?: number;
  changedSincePublish: boolean;
  hasKey: boolean;
  onGo: (s: SectionId) => void;
  onOpenTest: () => void;
}) {
  const themes = ((config.themes as unknown[]) ?? []).length;
  const materials = ((config.allowedKnowledgeDocIds as unknown[]) ?? []).length;
  const channels = ((config.channelIds as unknown[]) ?? []).length;
  const dest = (config.handoff as { defaultDestination?: { id?: string } } | undefined)?.defaultDestination;
  const tone = String(config.tone ?? "").trim();

  const items: Array<{ title: string; hint: string; done: boolean; required: boolean; go: SectionId; cta: string }> = [
    { title: "Tom de voz", hint: tone ? tone.slice(0, 80) : "Como ele fala com o cliente", done: Boolean(tone), required: true, go: "quem", cta: tone ? "Ver" : "Definir" },
    { title: "Para quem transferir", hint: dest?.id ? "Destino escolhido" : "Sem isso, as transferências não chegam a ninguém", done: Boolean(dest?.id), required: true, go: "equipe", cta: dest?.id ? "Ver" : "Escolher" },
    { title: "Conta do modelo de IA", hint: hasKey ? "Chave cadastrada" : "Necessária para testar e publicar", done: hasKey, required: true, go: "publicacao", cta: hasKey ? "Ver" : "Cadastrar" },
    { title: "Número de WhatsApp", hint: channels ? `${channels} número(s)` : "Onde ele vai atender", done: channels > 0, required: true, go: "publicacao", cta: channels ? "Ver" : "Escolher" },
    { title: "Assuntos ou materiais", hint: `${themes} assunto(s) · ${materials} material(is) em uso`, done: themes + materials > 0, required: false, go: "cuida", cta: "Ver" },
  ];
  const missing = items.filter((i) => i.required && !i.done).length;

  const state = !active
    ? { dot: "bg-muted-foreground", title: "Desligado", text: "As conversas dos números escolhidos vão para a distribuição normal." }
    : !lastVersion
      ? { dot: "bg-amber-500", title: "Ainda não publicado", text: "Ele só responde no teste. Publique quando o checklist abaixo estiver completo." }
      : changedSincePublish
        ? { dot: "bg-amber-500", title: `Ligado com a versão ${lastVersion}, com alterações ainda não publicadas`, text: "O que você mudou depois disso só vale no teste até publicar." }
        : { dot: "bg-emerald-500", title: `Ligado com a versão ${lastVersion}`, text: "O WhatsApp usa exatamente o que está aqui." };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#0E1C44] p-5 text-white">
        <div className="flex items-center gap-2.5">
          <span className={cn("size-2.5 rounded-full", state.dot)} />
          <p className="text-base font-bold">{state.title}</p>
        </div>
        <p className="mt-1.5 text-sm text-white/75">{state.text}</p>
      </div>

      <div className="space-y-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Para o agente funcionar {missing > 0 ? `· falta${missing > 1 ? "m" : ""} ${missing}` : "· tudo pronto"}
        </p>
        {items.map((it) => (
          <div key={it.title} className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                it.done ? "bg-emerald-50 text-emerald-700" : it.required ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {it.done ? <IconCheck size={14} stroke={3} /> : "!"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {it.title}
                {!it.required && <span className="ml-2 text-xs font-normal text-muted-foreground">recomendado</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{it.hint}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onGo(it.go)}>
              {it.cta}
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-primary/10 p-4 text-sm text-foreground">
        <IconMessageCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="space-y-2">
          <p>Comece testando: mande um "oi" no teste ao lado. Cada resposta mostra por que ele respondeu assim e leva ao que ajustar.</p>
          <Button size="sm" variant="outline" onClick={onOpenTest}>
            Abrir o teste
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 1 — Começar
// ─────────────────────────────────────────────────────────────────────────────

function StepStart({
  config,
  catalogs,
  name,
  hideName = false,
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
  /** O nome fica em "Quem é o agente". */
  hideName?: boolean;
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
  const autonomy = (config.autonomyMode as string) ?? "suggest";

  const hasKeyForPublish = hasOpenaiKey || looksLikeOpenAiApiKey(openaiKey);
  const showRealClientWarning = active && channelIds.length > 0 && allowedPhoneNumbers.length === 0;

  return (
    <div className="space-y-6">
      <SectionCard title="Estado do agente" description="Se ele está atendendo e qual versão o WhatsApp usa.">
        {!hideName && (
          <Field label="Nome do agente">
            <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Ex.: Atendimento" />
          </Field>
        )}
        <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{active ? "Ligado" : "Desligado"}</p>
            <p className="text-xs text-muted-foreground">
              {active
                ? "Atende nos números escolhidos com a versão publicada."
                : "As conversas dos números escolhidos vão para a distribuição normal."}
            </p>
          </div>
          <Switch checked={active} onCheckedChange={onActiveChange} id="active" aria-label="Ligar ou desligar o agente" />
        </div>
        <p className="text-xs text-muted-foreground">
          {publishedVersionNumber
            ? hasUnpublishedChanges
              ? `O WhatsApp usa a versão ${publishedVersionNumber}. O que você mudou depois só vale no teste até publicar.`
              : `O WhatsApp usa a versão ${publishedVersionNumber}, igual ao que está aqui.`
            : "Ainda não publicado: ele só responde no teste."}
        </p>
        {showRealClientWarning && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Ele vai responder clientes reais.</p>
              <p className="text-xs">Está ligado, com número escolhido e sem números na fase de teste. Para testar só com alguns números, preencha a fase de teste abaixo.</p>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Onde ele atende" description="Os números de WhatsApp que passam as conversas para este agente.">
        <Field label="Números de WhatsApp que ele atende">
          <MultiSelectPopover
            label="Escolha um ou mais números"
            options={(catalogs.channels ?? []).map((c) => ({ value: c.id, label: c.name ?? c.id }))}
            selected={channelIds.map(String)}
            onChange={(v) => onChange("channelIds", v)}
          />
          {channelIds.length === 0 && (
            <p className="text-xs text-destructive">Obrigatório para ele atender. Para testar aqui ao lado, não precisa.</p>
          )}
        </Field>
        <Field label="Fase de teste: responder só para estes números" hint="Deixe vazio para atender todo mundo.">
          <ChipInput
            values={allowedPhoneNumbers.map(String)}
            onChange={(v) => onChange("allowedPhoneNumbers", v)}
            placeholder="11999999999"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Como ele responde">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Como ele responde">
          {[
            { value: "auto", title: "Responder sozinho", text: "Envia a resposta direto ao cliente." },
            { value: "suggest", title: "Sugerir para a equipe", text: "A resposta fica como rascunho e alguém da equipe aprova antes de enviar." },
          ].map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={autonomy === o.value}
              onClick={() => onChange("autonomyMode", o.value)}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors",
                autonomy === o.value ? "border-primary bg-primary/10" : "hover:border-primary/40",
              )}
            >
              <span className="text-sm font-semibold">{o.title}</span>
              <span className="text-xs text-muted-foreground">{o.text}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Conta do modelo de IA" description="Cole a chave da conta. Ela fica guardada com segurança e só o final aparece aqui.">
        <div className="grid items-end gap-4 md:grid-cols-[1fr_auto]">
          <OpenAiKeyField value={openaiKey} onChange={onKeyChange} hasSavedKey={hasOpenaiKey} savedHint={openaiKeyHint ?? undefined} />
          <Button type="button" variant="outline" size="sm" onClick={onValidateKey} disabled={validatingKey || !hasKeyForPublish} className="gap-1">
            {validatingKey ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />}
            Testar chave
          </Button>
        </div>
        {keyValidation.ok === false && (
          <p className="flex items-center gap-1 text-sm text-destructive">
            <IconAlertCircle className="size-4" />
            {keyValidation.message || "Não funcionou. Confira a chave."}
          </p>
        )}
        {keyValidation.ok === true && (
          <p className="flex items-center gap-1 text-sm text-emerald-600">
            <IconCheck className="size-4" />
            {keyValidation.message || "Chave funcionando."}
          </p>
        )}
        {!hasKeyForPublish && (
          <p className="flex items-center gap-1 text-sm text-destructive">
            <IconAlertCircle className="size-4" />
            Obrigatória para testar e publicar.
          </p>
        )}
      </SectionCard>

      <AdvancedOptions count={4}>
        <SectionCard title="Modelo de IA" description="O padrão atende a maioria dos casos.">
          <Select value={modelId} onValueChange={(v) => onChange("model", v)}>
            <SelectTrigger aria-label="Modelo de IA">
              <SelectValue placeholder="Escolha…" />
            </SelectTrigger>
            <SelectContent>
              {catalogs.models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
              {!modelValid && modelId && <SelectItem value={modelId}>{modelId} (não listado)</SelectItem>}
            </SelectContent>
          </Select>
          {!modelValid && modelId && (
            <p className="flex items-center gap-1 text-xs text-amber-600">
              <IconAlertCircle className="size-3" />
              Este modelo não está mais na lista. Escolha outro.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Parecer humano no WhatsApp" description="Antes de responder, ele pode mostrar “digitando…” e marcar a mensagem como lida.">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
              <p className="text-sm font-medium">Mostrar “digitando…”</p>
              <Switch checked={config.simulateTyping !== false} onCheckedChange={(v) => onChange("simulateTyping", v)} id="simulate-typing" aria-label="Mostrar digitando" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
              <p className="text-sm font-medium">Marcar como lida</p>
              <Switch checked={config.markMessagesRead !== false} onCheckedChange={(v) => onChange("markMessagesRead", v)} id="mark-read" aria-label="Marcar como lida" />
            </div>
          </div>
          {config.simulateTyping !== false && (
            <Field label="Ritmo do “digitando…”">
              <div className="inline-flex rounded-full bg-muted p-1" role="radiogroup" aria-label="Ritmo do digitando">
                {TYPING_PACE_OPTIONS.map((o) => {
                  const on = String(config.typingPerCharMs ?? 25) === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onChange("typingPerCharMs", Number(o.value))}
                      className={cn("rounded-full px-4 py-1.5 text-sm", on ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        </SectionCard>

        <SectionCard title="Sites que ele pode mandar como link" description="Links de outros sites são tirados da resposta. Vazio: qualquer site.">
          <ChipInput
            values={((config.allowedDomains as string[]) ?? []).map(String)}
            onChange={(v) => onChange("allowedDomains", v)}
            placeholder="suaempresa.com.br"
          />
        </SectionCard>

        <SectionCard title="Resposta sempre no formato do agente" description="Recomendado. Evita perder transferências e dados quando o modelo responde fora do padrão.">
          <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <p className="text-sm font-medium">Ligado</p>
            <Switch checked={config.structuredOutput === true} onCheckedChange={(v) => onChange("structuredOutput", v)} id="structured-output" aria-label="Resposta sempre no formato do agente" />
          </div>
        </SectionCard>
      </AdvancedOptions>
    </div>
  );
}

/** Opções que quase ninguém precisa mexer: recolhidas por padrão. */
function AdvancedOptions({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        <IconChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        {open ? "Esconder opções avançadas" : `Mostrar opções avançadas (${count})`}
      </button>
      {open && <div className="space-y-6">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quem é o agente
// ─────────────────────────────────────────────────────────────────────────────

const TONE_STARTERS = [
  { label: "Profissional e direto", text: "Profissional, direto e educado. Vai ao ponto, sem formalidade excessiva." },
  { label: "Acolhedor", text: "Simpático e paciente. Explica com calma, em frases completas, e chama o cliente pelo nome no começo da conversa." },
  { label: "Descontraído", text: "Leve e próximo, como alguém da equipe conversando no WhatsApp, sem gírias e sem perder a clareza." },
];

function StepTone({ config, onChange }: { config: Record<string, unknown>; onChange: (path: string, value: unknown) => void }) {
  const tone = (config.tone as string) ?? "";
  const length = (config.responseLength as string) ?? "medium";
  const behavior = (config.responseBehavior as string) ?? "balanced";
  return (
    <div className="space-y-6">
      <SectionCard title="Tom de voz" description="Como ele fala com o cliente. Escolha um ponto de partida e ajuste do seu jeito.">
        <div className="flex flex-wrap gap-2">
          {TONE_STARTERS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onChange("tone", s.text)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                tone === s.text ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Textarea value={tone} onChange={(e) => onChange("tone", e.target.value)} placeholder="Ex.: profissional, direto e educado" aria-label="Tom de voz" />
        {!tone.trim() && <p className="text-xs text-destructive">Obrigatório.</p>}
      </SectionCard>

      <SectionCard title="Tamanho das respostas">
        <div className="inline-flex rounded-full bg-muted p-1" role="radiogroup" aria-label="Tamanho das respostas">
          {[
            ["short", "Curtas"],
            ["medium", "Médias"],
            ["long", "Longas"],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={length === v}
              onClick={() => onChange("responseLength", v)}
              className={cn("rounded-full px-5 py-1.5 text-sm", length === v ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Passo a passo sai sempre completo, em qualquer tamanho.</p>
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
                <span className="whitespace-pre-line rounded-lg border bg-card px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">{o.example}</span>
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
          placeholder="Ex.: Nunca peça senha nem número de cartão."
          emptyText="Nenhuma regra ainda."
        />
      </SectionCard>

      <AdvancedOptions count={1}>
        <SectionCard title="Estilo de resposta" description="Quanto ele varia a forma de dizer as coisas. O que ele sabe não muda.">
          <div className="inline-flex flex-wrap rounded-full bg-muted p-1" role="radiogroup" aria-label="Estilo de resposta">
            {BEHAVIOR_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={behavior === o.value}
                onClick={() => onChange("responseBehavior", o.value)}
                className={cn("rounded-full px-4 py-1.5 text-sm", behavior === o.value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
              >
                {o.label}
              </button>
            ))}
          </div>
        </SectionCard>
      </AdvancedOptions>
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
        // Entra já usável: sem permissão nenhuma o campo ficava inútil até marcar.
        { key, label: fieldLabel(key, catalogFields), permissions: ["read"] },
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
      <SectionCard title={title} description="Dados do cadastro que ele usa. Marque o que ele pode fazer com cada um.">
        <div className="overflow-x-auto">
          <div className="min-w-[360px] rounded-lg border">
            <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_40px_40px_40px_40px] sm:items-center sm:gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Campo</span>
              <HeaderCell label="Usar" tooltip="Usa o dado para entender a situação, sem repetir ao cliente." />
              <HeaderCell label="Dizer" tooltip="Pode dizer o dado ao cliente na conversa." />
              <HeaderCell label="Gravar" tooltip="Pode atualizar o dado ao encerrar a conversa." />
              <span className="sr-only">Remover</span>
            </div>
            {stored.map((s) => {
              const label = fieldLabel(s.key, catalogFields);
              const permLabel: Record<string, string> = { read: "Usar", cite: "Dizer", write: "Gravar" };
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
                    <SelectValue placeholder="Adicionar campo do cadastro…" />
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
      {renderFieldTable("Dados do contato", catalogs.contactCustomFields, contactFields, "contact")}
      {renderFieldTable("Dados do negócio", catalogs.dealCustomFields, dealFields, "deal")}

      <AdvancedOptions count={1}>
      <SectionCard title="Se o cliente tiver mais de um negócio aberto">
        <Field label="Qual negócio ele usa">
          <Select
            value={(config.dealSelection as string) ?? "latest"}
            onValueChange={(v) => onChange("dealSelection", v)}
          >
            <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Usar o mais recente</SelectItem>
              <SelectItem value="ask">Perguntar ao cliente qual</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>
      </AdvancedOptions>

      <SectionCard title="Informações da empresa" description="Escreva @ e o nome da informação nas mensagens (ex.: @NomeDaEmpresa) e o agente troca pelo valor. Ele também usa essas informações para responder.">
        <div className="space-y-2">
          {variables.map((v, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Nome (ex.: NomeDaEmpresa)"
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
            <IconPlus className="size-4" /> Adicionar informação
          </Button>
        </div>
      </SectionCard>

    </div>
  );
}

/** Política de mídia: fica em "Começo e fim da conversa". */
function StepMedia({ config, onChange }: { config: Record<string, unknown>; onChange: (path: string, value: unknown) => void }) {
  return (
      <SectionCard
        title="Se o cliente mandar áudio, imagem ou arquivo"
        description="Áudio e imagem podem virar texto para ele seguir o atendimento. Se não der para entender, ele avisa e pede para o cliente escrever."
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
  // O `dialog` precisa ser renderizado: sem ele a confirmação abria invisível
  // e o clique na lixeira não fazia nada.
  const { confirm: confirmDelete, dialog: confirmDeleteDialog } = useConfirm();
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
    onSuccess: (_r, docId) => {
      // Tira o removido dos permitidos: não sobra id de documento que não existe.
      const current = (config.allowedKnowledgeDocIds as string[]) ?? [];
      if (current.includes(docId)) onChange("allowedKnowledgeDocIds", current.filter((x) => x !== docId));
      docsQuery.refetch();
    },
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
      {confirmDeleteDialog}
      <SectionCard title="Materiais" description="Ligue os que ele pode consultar. Os que estão sendo processados atualizam sozinhos.">
        {docsQuery.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            {deleteMutation.isError && (
              <p className="mb-3 text-sm text-destructive">
                Não foi possível remover: {(deleteMutation.error as Error)?.message ?? "erro desconhecido"}
              </p>
            )}
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
                        não usado
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

      <SectionCard title="Adicionar arquivo" description="O sistema lê o texto do arquivo e divide em trechos. PDF escaneado (foto) não é lido.">
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

      <SectionCard title="Adicionar texto" description="Cole um texto ou uma lista de perguntas e respostas. O sistema divide em trechos para ele consultar.">
        <Field label="Título" hint="Ex.: Perguntas frequentes sobre entrega">
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

      <SectionCard title="O que ele acharia" description="Escreva uma pergunta de cliente para ver quais trechos ele encontraria nos materiais.">
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

function foldText(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Lista longa (dezenas ou centenas de itens) com busca e liga/desliga por
 * item. Um seletor suspenso ou uma nuvem de etiquetas não dão conta disso.
 */
function SearchableToggleList({
  items,
  selected,
  onChange,
  searchPlaceholder,
  emptyLabel,
  onLabel,
}: {
  items: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (v: string[]) => void;
  searchPlaceholder: string;
  emptyLabel: string;
  onLabel: string;
}) {
  const [query, setQuery] = React.useState("");
  const [onlyOn, setOnlyOn] = React.useState(false);
  const chosen = new Set(selected);
  const q = foldText(query.trim());
  const visible = items
    .filter((i) => (!onlyOn || chosen.has(i.value)) && (!q || foldText(i.label).includes(q)))
    .sort((a, b) => Number(chosen.has(b.value)) - Number(chosen.has(a.value)) || a.label.localeCompare(b.label));
  const toggle = (value: string) => onChange(chosen.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const hiddenOff = visible.filter((i) => !chosen.has(i.value));

  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-full border bg-card px-4">
          <IconSearch className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-full flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="inline-flex shrink-0 rounded-full bg-muted p-1" role="radiogroup" aria-label="Mostrar">
          {[
            [false, `Todas (${items.length})`],
            [true, `${onLabel} (${selected.length})`],
          ].map(([v, l]) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={onlyOn === v}
              onClick={() => setOnlyOn(v as boolean)}
              className={cn("rounded-full px-3.5 py-1.5 text-sm", onlyOn === v ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
            >
              {l as string}
            </button>
          ))}
        </div>
      </div>
      {q && hiddenOff.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([...selected, ...hiddenOff.map((i) => i.value)])}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Liberar as {hiddenOff.length} encontradas
        </button>
      )}
      <div className="max-h-[420px] divide-y overflow-y-auto rounded-xl border bg-card">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {onlyOn && !q ? "Nenhuma liberada ainda." : "Nada encontrado."}
          </p>
        ) : (
          visible.map((i) => (
            <label key={i.value} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
              <span className="min-w-0 flex-1 truncate text-sm">{i.label}</span>
              <Switch checked={chosen.has(i.value)} onCheckedChange={() => toggle(i.value)} aria-label={i.label} />
            </label>
          ))
        )}
      </div>
    </div>
  );
}

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
      <SectionCard title="Mensagens prontas que ele pode enviar" description="Modelos de mensagem do CRM (com vídeo, imagem ou texto). Ele só envia os que estiverem aqui.">
        <SearchableToggleList
          items={catalogs.messageTemplates.map((m) => ({ value: m.id, label: m.name }))}
          selected={allowedModels}
          onChange={(v) => onChange("allowedMessageModelIds", v)}
          searchPlaceholder="Buscar mensagem pronta…"
          emptyLabel="Nenhuma mensagem pronta cadastrada no CRM."
          onLabel="Liberadas"
        />
      </SectionCard>

      <SectionCard title="Catálogo" description="Se ele pode falar dos produtos e serviços cadastrados no CRM.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!pp.enabled}
            onCheckedChange={(v) => onChange("productPolicy", { ...pp, enabled: v })}
            id="prodEnabled"
          />
          <Label htmlFor="prodEnabled" className="cursor-pointer">Pode falar do catálogo</Label>
        </div>
        {!!pp.enabled && (
          <div className="space-y-4 pt-2">
            <MultiSelectPopover
              label="Todos os produtos ativos (ou escolha alguns)"
              tooltip="Vazio: todos os produtos ativos do CRM. Escolha alguns para limitar."
              options={productOptions}
              selected={allowedProductIds}
              onChange={(v) => onChange("productPolicy", { ...pp, allowedProductIds: v })}
              emptyLabel="Nenhum produto cadastrado no CRM"
            />
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
      <SectionCard title="Boas-vindas" description="O que ele manda quando o cliente escreve pela primeira vez.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!entry.openingEnabled}
            onCheckedChange={(v) => onChange("entry.openingEnabled", v)}
            id="openingEnabled"
          />
          <Label htmlFor="openingEnabled">Enviar boas-vindas</Label>
        </div>
        {!!entry.openingEnabled && (
          <Field label="Mensagem de boas-vindas">
            <Textarea
              value={(entry.openingMessage as string) ?? ""}
              onChange={(e) => onChange("entry.openingMessage", e.target.value)}
            />
          </Field>
        )}
      </SectionCard>

      <SectionCard title="Confirmar quem é o cliente" description="Antes de atender, ele pergunta se está falando com a pessoa do cadastro.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!entry.confirmContact}
            onCheckedChange={(v) => onChange("entry.confirmContact", v)}
            id="confirmContact"
          />
          <Label htmlFor="confirmContact">Confirmar antes de atender</Label>
        </div>
        {!!entry.confirmContact && (
          <>
            <Field label="Dados que ele mostra para confirmar" hint="Só aparecem os dados marcados em O que ele sabe › Dados do cliente.">
              <MultiSelectPopover
                label="Campos"
                options={fields}
                selected={((entry.confirmationFields as string[]) ?? []).map(String)}
                onChange={(v) => onChange("entry.confirmationFields", v)}
              />
            </Field>
            <Field label="Mensagem de confirmação">
              <Textarea
                value={(entry.confirmationMessage as string) ?? ""}
                onChange={(e) => onChange("entry.confirmationMessage", e.target.value)}
              />
            </Field>
            <Field label="Quando perguntar">
              <Select
                value={(entry.confirmationMode as string) ?? "combined"}
                onValueChange={(v) => onChange("entry.confirmationMode", v)}
              >
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="combined">Na mesma mensagem das boas-vindas</SelectItem>
                  <SelectItem value="separate_turn">Na mensagem seguinte</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
      </SectionCard>

      <SectionCard title="Se o número não estiver no cadastro">
        <Field label="O que ele faz">
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
            <Field label="Mensagem pedindo os dados">
              <Textarea
                value={(entry.identificationMessage as string) ?? ""}
                onChange={(e) => onChange("entry.identificationMessage", e.target.value)}
              />
            </Field>
            <Field label="Quantas vezes pedir antes de passar para a equipe">
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
              <Field label="Nome" hint="Curto, ex.: Cancelamento, Segunda via.">
                <Input
                  value={(t.name as string) ?? ""}
                  onChange={(e) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], name: e.target.value };
                    onChange("themes", next);
                  }}
                />
              </Field>
              <Field label="Como reconhecer: palavras ou frases do cliente" hint="Prefira frases de 2 ou mais palavras. Mesmo sem elas, ele reconhece pelo sentido da mensagem.">
                <ChipInput
                  values={(t.when as string[]) ?? []}
                  onChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], when: v };
                    onChange("themes", next);
                  }}
                  placeholder="Ex.: quero cancelar"
                />
              </Field>
              <Field label="Exemplos de mensagens do cliente" hint="Ajudam a reconhecer o assunto pelo sentido.">
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
                  placeholder="Ex.: quero cancelar meu pedido"
                />
              </Field>
              <Field label="O que fazer neste assunto" hint="Escreva como orientaria alguém novo na equipe.">
                <Textarea
                  value={(t.instructions as string) ?? ""}
                  onChange={(e) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], instructions: e.target.value };
                    onChange("themes", next);
                  }}
                />
              </Field>
              <Field label="Se precisar transferir, para quem" hint="Vazio: usa o destino padrão (Quando chama a equipe).">
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
                <Label htmlFor={`direct-${i}`}>Só encaminha para a equipe, sem responder</Label>
              </div>
              <AdvancedOptions count={2}>
              <Field label="Materiais extras só deste assunto" hint="Somam aos materiais gerais.">
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
              <Field label="Mensagens prontas deste assunto" hint="Se escolher alguma, só estas valem neste assunto (a lista geral deixa de valer).">
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
              </AdvancedOptions>
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
                <p className="text-sm font-semibold">Sempre que</p>
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
                      <SelectTrigger className="w-full sm:w-56">
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
                    {CONDITIONS_WITH_VALUES.has((c.type as string) ?? "keywords") ? (
                      <ChipInput
                        values={((c.values as string[]) ?? []).map(String)}
                        onChange={(v) => {
                          const next = rules.slice();
                          (next[i].conditions as Array<Record<string, unknown>>)[ci] = { ...c, values: v };
                          onChange("rules", next);
                        }}
                        placeholder={CONDITION_PLACEHOLDER[(c.type as string) ?? "keywords"] ?? "Valores"}
                      />
                    ) : (
                      <span className="flex-1" />
                    )}
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
                  <IconPlus className="size-4" /> e mais uma condição
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">então</p>
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
                    {a.type === "add_tag" && (
                      <Input
                        placeholder="Nome da etiqueta"
                        value={(a.tag as string) ?? ""}
                        onChange={(e) => {
                          const next = rules.slice();
                          (next[i].actions as Array<Record<string, unknown>>)[ai] = { ...a, tag: e.target.value };
                          onChange("rules", next);
                        }}
                      />
                    )}
                    {a.type === "send_message_model" && (
                      <Select
                        value={(a.modelId as string) ?? ""}
                        onValueChange={(v) => {
                          const next = rules.slice();
                          (next[i].actions as Array<Record<string, unknown>>)[ai] = { ...a, modelId: v };
                          onChange("rules", next);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Escolha a mensagem pronta…" /></SelectTrigger>
                        <SelectContent>
                          {catalogs.messageTemplates.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

  return (
    <div className="space-y-6">
      <SectionCard title="Quando não souber">
        <Field label="Se não achar a informação nos materiais" hint="Vazio: passa para a equipe.">
          <Textarea
            value={((fallback.noSource as Record<string, unknown>)?.message as string) ?? ""}
            onChange={(e) => onChange("fallback.noSource.message", e.target.value)}
          />
        </Field>
        <Field label="Se der um erro" hint="Vazio: usa a mensagem de transferência.">
          <Textarea
            value={((fallback.error as Record<string, unknown>)?.message as string) ?? ""}
            onChange={(e) => onChange("fallback.error.message", e.target.value)}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Se o cliente se irritar">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!getPath(config, "sentiment.enabled", false)}
            onCheckedChange={(v) => onChange("sentiment.enabled", v)}
            id="sentiment"
          />
          <Label htmlFor="sentiment">Reagir quando o cliente se irritar</Label>
        </div>
        {!!getPath(config, "sentiment.enabled", false) && (
          <div className="grid gap-4 md:grid-cols-2 pt-2">
            <Field label="A partir de">
              <Select
                value={(getPath(config, "sentiment.threshold", "dissatisfied") as string)}
                onValueChange={(v) => onChange("sentiment.threshold", v)}
              >
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer sinal de insatisfação</SelectItem>
                  <SelectItem value="dissatisfied">Cliente insatisfeito</SelectItem>
                  <SelectItem value="angry">Cliente bravo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="O que ele faz">
              <Select
                value={(getPath(config, "sentiment.action", "handoff") as string)}
                onValueChange={(v) => onChange("sentiment.action", v)}
              >
                <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="handoff">Passar para a equipe</SelectItem>
                  <SelectItem value="notify_and_continue">Continuar atendendo</SelectItem>
                  <SelectItem value="log_only">Só registrar no rastro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}
      </SectionCard>
      <AdvancedOptions count={3}>
      <SectionCard title="Quando ele para de insistir" description="Limites para conversas que não andam.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { path: "limits.maxCourtesyReplies", label: "Respostas a agradecimentos depois de encerrar", tooltip: "Quantas vezes ele responde a um obrigado depois que a conversa foi encerrada." },
            { path: "limits.nonsenseLimit", label: "Mensagens fora do assunto seguidas", tooltip: "Quantas mensagens fora do assunto (ou repetidas) ele aceita antes de agir." },
            { path: "limits.maxAiTransfers", label: "Vezes que pode passar para outro agente de IA", tooltip: "Limite de idas e voltas entre agentes de IA antes de ir para fila humana." },
          ].map((f) => (
            <Field key={f.path} label={f.label} tooltip={f.tooltip}>
              <Input
                type="number"
                value={String(getPath(config, f.path, 0) as number)}
                onChange={(e) => onChange(f.path, Number(e.target.value))}
              />
            </Field>
          ))}
          <Field label="Ao chegar nesse limite" tooltip="Avisar uma vez e parar de responder a esse tipo de mensagem, ou passar para a equipe.">
            <Select
              value={(getPath(config, "limits.nonsenseAction", "warn_and_silence") as string) || "warn_and_silence"}
              onValueChange={(v) => onChange("limits.nonsenseAction", v)}
            >
              <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warn_and_silence">Avisar e parar de responder</SelectItem>
                <SelectItem value="handoff">Passar para a equipe</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </SectionCard>
      </AdvancedOptions>
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

  return (
    <div className="space-y-6">
      <SectionCard title="Para quem ele passa a conversa" description="Vale sempre que nenhum assunto ou atalho disser outro destino.">
        <Field label="Destino">
          <DestinationPicker
            value={handoff.defaultDestination as Record<string, string> | undefined}
            catalogs={catalogs}
            onChange={(v) => onChange("handoff.defaultDestination", v)}
            hideMessage
          />
          {!(handoff.defaultDestination as { id?: string } | undefined)?.id && (
            <p className="text-xs text-destructive">Obrigatório: sem isso, as transferências não chegam a ninguém.</p>
          )}
        </Field>
        <Field label="Mensagem ao passar para a equipe">
          <Textarea
            value={(handoff.message as string) ?? ""}
            onChange={(e) => onChange("handoff.message", e.target.value)}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Horário de atendimento" description="Define o expediente usado pela condição &quot;Fora do horário&quot; das regras. Para agir fora do horário, crie uma regra com essa condição.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!bh?.enabled}
            onCheckedChange={(v) =>
              onChange(
                "businessHours",
                v
                  ? { enabled: true, timezone: "America/Sao_Paulo", weekdays: [] }
                  : null,
              )
            }
            id="bh"
          />
          <Label htmlFor="bh">Usar horário de atendimento</Label>
        </div>
        {!!bh?.enabled && (
          <>
            <Field label="Fuso horário" tooltip="Fuso usado para calcular se está dentro do expediente.">
              <Input value={(bh.timezone as string) ?? ""} onChange={(e) => onChange("businessHours.timezone", e.target.value)} />
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
      <SectionCard title="Despedida" description="O que ele manda ao encerrar a conversa.">
        <Field label="Mensagem de despedida" hint="Vazio: encerra sem mensagem.">
          <Textarea
            value={(closure.goodbyeMessage as string) ?? ""}
            onChange={(e) => onChange("closure.goodbyeMessage", e.target.value)}
          />
        </Field>
      </SectionCard>

      <AdvancedOptions count={4}>
      <SectionCard title="Dados a gravar ao encerrar" description="Ao encerrar, ele atualiza estes dados do contato ou do negócio.">
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

      <SectionCard title="Continuar a automação ao encerrar" description="Se o atendimento começou por uma automação, ela continua do passo indicado.">
        <Field label="Id do passo da automação" hint="Vazio: nenhuma automação continua.">
          <Input
            value={(closure.nextAutomationStepId as string) ?? ""}
            onChange={(e) => onChange("closure.nextAutomationStepId", e.target.value || undefined)}
            placeholder="Opcional"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Depois de encerrar" description="O que ele faz se o cliente escrever de novo pouco depois de encerrada a conversa.">
        <Field label="Por quantas horas uma nova mensagem continua a mesma conversa">
          <Input
            type="number"
            value={String(closure.postCloseWindowHours ?? 6)}
            onChange={(e) => onChange("closure.postCloseWindowHours", Number(e.target.value))}
          />
        </Field>
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
      </AdvancedOptions>
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
  compact = false,
}: {
  agentId: string;
  dirty: boolean;
  catalogs: Catalogs;
  /** Versão estreita, fixa ao lado das seções. */
  compact?: boolean;
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
      const lastThemeId = [...turns].reverse().find((t) => t.result?.themeId)?.result?.themeId ?? null;
      const r = await testAgent(agentId, text, history, testContactId || undefined, testStage, lastThemeId);
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

  const contactPicker = (
    <MultiSelectPopover
      label={compact ? "Testar como: cliente sem cadastro" : "Simular como contato genérico"}
      options={contactOptions}
      single
      value={testContactId}
      onValueChange={setTestContactId}
      onSearchQueryChange={setContactSearch}
      searchable
      width={compact ? 300 : 320}
    />
  );

  const restartButton = (
    <Button variant="outline" size="sm" onClick={restart} disabled={turns.length === 0} className="gap-1">
      <IconRefresh className="size-3.5" /> Recomeçar
    </Button>
  );

  const chat = (
    <div
      ref={scrollRef}
      className={cn(
        "flex flex-col gap-3 overflow-y-auto bg-[var(--chat-bg,var(--muted))] p-4",
        compact ? "min-h-0 flex-1" : "max-h-[480px] min-h-[320px] rounded-xl border",
      )}
    >
      {turns.length === 0 && !testing && (
        <div className="m-auto space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Escreva como se fosse o cliente, ou comece por aqui:</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {["oi", "preciso de ajuda", "quero falar com alguém"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setMessage(s)}
                className="rounded-full border bg-card px-3 py-1 text-xs hover:border-primary/40"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {turns.map((t) => (
        <React.Fragment key={t.id}>
          {/* Bolha do cliente simulado */}
          <div className="flex justify-start">
            <div
              className="max-w-[80%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm shadow-sm"
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
                  className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm px-3.5 py-2 text-sm shadow-sm"
                  style={{ background: "var(--chat-bubble-sent-bg, var(--primary))", color: "var(--chat-bubble-sent-text, var(--primary-foreground))" }}
                >
                  {t.result.reply || <span className="italic opacity-75">(sem resposta ao cliente)</span>}
                </div>
              </div>
              <p className="text-right text-[11px] text-muted-foreground">
                {[
                  t.result.themeName ? `Assunto: ${t.result.themeName}` : "Sem assunto",
                  t.result.appliedRuleName ? `Atalho: ${t.result.appliedRuleName}` : null,
                  (t.result.ragChunks?.length ?? 0) > 0 ? `leu ${t.result.ragChunks!.length} trecho(s)` : null,
                  t.result.handoff ? "passou para a equipe" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
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
                <div className={cn("w-full", compact ? "max-w-full" : "max-w-[92%]")}>
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
              <div className="max-w-[80%] rounded-2xl rounded-br-sm border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm text-destructive">
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
  );

  const inputRow = (
    <div className={cn("flex gap-2", compact && "border-t p-3")}>
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Escreva como se fosse o cliente…"
        onKeyDown={(e) => e.key === "Enter" && !testing && runTest()}
        disabled={testing}
        aria-label="Mensagem de teste"
      />
      <Button onClick={runTest} disabled={testing || !message.trim()} aria-label="Enviar">
        <IconSend className="size-4" />
        {!compact && " Enviar"}
      </Button>
    </div>
  );

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Testar agora</p>
            <p className="truncate text-xs text-muted-foreground">Usa o rascunho · nada é enviado a clientes</p>
          </div>
          {restartButton}
        </div>
        <div className="border-b px-3 py-2">{contactPicker}</div>
        {chat}
        {inputRow}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Conversa de teste"
        description="Converse com o agente como se fosse o cliente, sem afetar clientes reais. Depois de cada resposta, veja os bastidores em “Por que respondeu isso?”."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Simulação isolada — nada é enviado pelo canal real nem grava dados do cliente.</p>
          <div className="flex items-center gap-2">
            {contactPicker}
            {restartButton}
          </div>
        </div>
        {chat}
        {inputRow}
      </SectionCard>
    </div>
  );
}
