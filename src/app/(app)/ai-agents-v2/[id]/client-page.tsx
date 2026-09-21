"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
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
import { apiFetch, parseApiResponse } from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ChipInput } from "@/components/ai-agents/chip-input";
import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";
import { OpenAiKeyField } from "@/components/agent-settings/openai-key-field";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type AgentDetail = {
  id: string;
  name: string;
  active: boolean;
  simpleConfig: Record<string, unknown>;
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
};

type KnowledgeDoc = {
  id: string;
  title: string;
  status?: string;
  chunkCount?: number;
};

type TestResult = {
  userMessage: string;
  appliedRuleId: string | null;
  themeId: string | null;
  reply: string;
  reason: string;
  handoff: boolean;
  closed: boolean;
  toolCalls: Array<{ toolName: string; args: unknown; result: unknown }>;
  ragChunks: Array<{ docId?: string; text?: string; score?: number }>;
  executedActions: Array<Record<string, unknown>>;
  discardedActions: Array<Record<string, unknown>>;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
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
  { value: "autonomous", label: "Autônomo (responde direto)" },
  { value: "draft", label: "Rascunho (sugere, operador aprova)" },
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

const MEDIA_ACTION_OPTIONS = [
  { value: "transcribe", label: "Transcrever / ler o texto" },
  { value: "describe", label: "Descrever" },
  { value: "ask_text", label: "Pedir para o cliente enviar em texto" },
  { value: "handoff", label: "Transferir para a equipe" },
];

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
  { value: "send_message_model", label: "Enviar modelo de mensagem" },
  { value: "send_whatsapp_template", label: "Enviar template oficial" },
  { value: "set_variable", label: "Definir variável" },
  { value: "record_knowledge_gap", label: "Registrar dúvida sem resposta" },
];

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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
  autonomyMode: "autonomous",
  allowedDomains: [],
  tone: "",
  globalRules: [],
  variables: [],
  contextFields: { contact: [], deal: [] },
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

async function fetchCatalogs(): Promise<Catalogs> {
  const res = await apiFetch("/api/ai-agents-v2/catalogs");
  return parseApiResponse<Catalogs>(res, "Erro ao carregar catálogos.");
}

async function testAgent(id: string, userMessage: string): Promise<TestResult> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userMessage }),
  });
  return parseApiResponse<TestResult>(res, "Erro ao testar agente.");
}

async function fetchKnowledgeDocs(id: string): Promise<{ docs: KnowledgeDoc[] }> {
  const res = await apiFetch(`/api/ai-agents/${id}/knowledge`);
  return parseApiResponse<{ docs: KnowledgeDoc[] }>(res, "Erro ao carregar materiais.");
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
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

function MultiChip({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <ChipInput values={values} onChange={onChange} placeholder={placeholder} />
    </Field>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "start", title: "Começar", subtitle: "Nome e modelo" },
  { id: "tone", title: "Jeito de falar", subtitle: "Tom e regras" },
  { id: "context", title: "O que ele sabe", subtitle: "Dados do cliente" },
  { id: "materials", title: "Materiais de consulta", subtitle: "Documentos e FAQ" },
  { id: "messages", title: "Mensagens prontas e produtos", subtitle: "Modelos e catálogo" },
  { id: "entry", title: "Início da conversa", subtitle: "Como ela começa" },
  { id: "themes", title: "Assuntos", subtitle: "O que ele atende" },
  { id: "rules", title: "Regras automáticas", subtitle: "Sempre que… então…" },
  { id: "outputs", title: "Saídas", subtitle: "Quando parar de responder" },
  { id: "team", title: "Equipe e horários", subtitle: "Transferir e encerrar" },
  { id: "closure", title: "Encerrar e classificar", subtitle: "Tabulação e pesquisa" },
  { id: "test", title: "Testar e publicar", subtitle: "Conferir antes de ligar" },
];

export default function AIAgentV2EditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [step, setStep] = React.useState(0);
  const [config, setConfig] = React.useState<Record<string, unknown> | null>(null);
  const [name, setName] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [dirty, setDirty] = React.useState(false);
  const [openaiKey, setOpenaiKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

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
      setConfig(mergeDefaults(agentQuery.data.simpleConfig ?? {}, DEFAULT_CONFIG));
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
        await saveDraft(id, config);
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

  const handlePublish = async () => {
    const ok = await confirm({
      title: "Publicar agente",
      description: "Publicar cria uma nova versão e ativa o agente. Continuar?",
      confirmLabel: "Publicar",
      pendingLabel: "Publicando…",
      action: async () => {
        const res = await publishMutation.mutateAsync();
        await confirm({ title: "Publicado", description: `Versão ${res.versionNumber} criada com sucesso.` });
      },
    });
    if (ok) router.push(`/ai-agents-v2/${id}`);
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
    <AppV2PageShell title={name || "Novo agente de IA"} icon={<IconBrain size={22} />}>
      {dialog}
      <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4 p-4">
        {/* top bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">{name || "Novo agente de IA"}</h1>
            <p className="text-sm text-muted-foreground">
              Etapa {step + 1} de {STEPS.length}: {STEPS[step].title}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => saveDraftMutation.mutate()}
              className="gap-1"
            >
              <IconDeviceFloppy className="size-4" />
              Salvar rascunho
            </Button>
            <Button size="sm" onClick={handlePublish} disabled={publishMutation.isPending} className="gap-1">
              <IconRocket className="size-4" />
              Publicar
            </Button>
          </div>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <IconAlertCircle className="size-4" />
            {saveError}
          </div>
        )}

        <div className="flex flex-1 gap-4 overflow-hidden">
          {/* steps nav */}
          <nav className="hidden w-64 shrink-0 flex-col gap-1 overflow-y-auto md:flex">
            {STEPS.map((s, i) => {
              const done = i < step;
              const current = i === step;
              return (
                <button
                  key={s.id}
                  onClick={() => handleStepChange(i)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    current
                      ? "border-primary bg-primary/10"
                      : done
                        ? "border-border bg-muted/40"
                        : "border-border bg-card hover:bg-muted/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      current
                        ? "border-primary bg-primary text-primary-foreground"
                        : done
                          ? "border-success bg-success text-success-foreground"
                          : "border-border bg-muted",
                    )}
                  >
                    {done ? <IconCheck size={14} /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={cn("text-sm font-semibold", current && "text-primary")}>{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* main */}
          <main className="flex-1 overflow-y-auto rounded-xl border bg-card p-5">
            {step === 0 && (
              <StepStart
                config={config}
                name={name}
                active={active}
                openaiKey={openaiKey}
                onNameChange={setName}
                onActiveChange={setActive}
                onKeyChange={(v) => {
                  setOpenaiKey(v);
                  setDirty(true);
                }}
                onChange={updateConfig}
              />
            )}
            {step === 1 && <StepTone config={config} onChange={updateConfig} />}
            {step === 2 && <StepContext config={config} catalogs={catalogs} onChange={updateConfig} />}
            {step === 3 && (
              <StepMaterials
                agentId={id}
                config={config}
                onChange={updateConfig}
              />
            )}
            {step === 4 && <StepMessagesProducts config={config} catalogs={catalogs} onChange={updateConfig} />}
            {step === 5 && <StepEntry config={config} onChange={updateConfig} />}
            {step === 6 && <StepThemes config={config} catalogs={catalogs} onChange={updateConfig} />}
            {step === 7 && <StepRules config={config} catalogs={catalogs} onChange={updateConfig} />}
            {step === 8 && <StepOutputs config={config} onChange={updateConfig} />}
            {step === 9 && <StepTeam config={config} catalogs={catalogs} onChange={updateConfig} />}
            {step === 10 && <StepClosure config={config} onChange={updateConfig} />}
            {step === 11 && (
              <StepTestPublish
                agentId={id}
                dirty={dirty}
                onSave={async () => saveDraftMutation.mutateAsync()}
              />
            )}
          </main>
        </div>

        {/* footer nav */}
        <div className="flex items-center justify-between border-t bg-card p-4">
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => handleStepChange(step - 1)}
            className="gap-1"
          >
            <IconChevronLeft className="size-4" /> Voltar
          </Button>
          <Button
            disabled={step === STEPS.length - 1}
            onClick={() => handleStepChange(step + 1)}
            className="gap-1"
          >
            Continuar <IconChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </AppV2PageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Etapa 1 — Começar
// ─────────────────────────────────────────────────────────────────────────────

function StepStart({
  config,
  name,
  active,
  openaiKey,
  onNameChange,
  onActiveChange,
  onKeyChange,
  onChange,
}: {
  config: Record<string, unknown>;
  name: string;
  active: boolean;
  openaiKey: string;
  onNameChange: (v: string) => void;
  onActiveChange: (v: boolean) => void;
  onKeyChange: (v: string) => void;
  onChange: (path: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionCard title="Identidade do agente" description="Como ele aparece e quando responde.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome do agente">
            <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Ex: Atendimento" />
          </Field>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={active} onCheckedChange={onActiveChange} id="active" />
            <Label htmlFor="active">Ativo</Label>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Modelo e comportamento" description="Qual modelo usa e como formula as respostas.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Modelo LLM" hint="Ex: gpt-4o-mini">
            <Input
              value={(config.model as string) ?? ""}
              onChange={(e) => onChange("model", e.target.value)}
            />
          </Field>
          <Field label="Comportamento das respostas">
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
          <Field label="Tamanho das respostas">
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
          <Field label="Modo de execução">
            <Select
              value={(config.autonomyMode as string) ?? "autonomous"}
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

      <SectionCard title="Canais e domínios" description="Por onde ele atende e quais links pode enviar.">
        <Field label="Canais vinculados" hint="IDs dos canais que usam este agente.">
          <ChipInput
            values={((config.channelIds as string[]) ?? []).map(String)}
            onChange={(v) => onChange("channelIds", v)}
            placeholder="Adicionar ID do canal"
          />
        </Field>
        <Field label="Domínios permitidos em links">
          <ChipInput
            values={((config.allowedDomains as string[]) ?? []).map(String)}
            onChange={(v) => onChange("allowedDomains", v)}
            placeholder="suaempresa.com.br"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Chave OpenAI" description="Cada agente usa sua própria conta OpenAI.">
        <OpenAiKeyField value={openaiKey} onChange={onKeyChange} />
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
        <Field label="Descrição do tom">
          <Textarea
            value={(config.tone as string) ?? ""}
            onChange={(e) => onChange("tone", e.target.value)}
            placeholder="Ex: profissional, direto e educado"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Regras que ele sempre segue" description="Uma por linha. Exemplos: nunca prometer prazo, sempre pedir confirmação.">
        <ChipInput
          values={(config.globalRules as string[]) ?? []}
          onChange={(v) => onChange("globalRules", v)}
          placeholder="Adicionar regra"
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

  function renderFieldTable(
    title: string,
    catalogFields: Array<{ id: string; name: string }>,
    stored: Array<{ key: string; label?: string; permissions: string[] }>,
    entity: string,
  ) {
    const all = new Map<string, { key: string; label: string; permissions: string[] }>();
    for (const f of catalogFields) {
      all.set(f.id, { key: f.id, label: f.name, permissions: [] });
    }
    for (const s of stored) {
      const existing = all.get(s.key);
      if (existing) {
        existing.permissions = s.permissions;
      } else {
        all.set(s.key, { key: s.key, label: s.label ?? s.key, permissions: s.permissions });
      }
    }
    const rows = Array.from(all.values());

    const toggle = (key: string, perm: string) => {
      const list = stored.slice();
      const idx = list.findIndex((x) => x.key === key);
      const item = idx >= 0 ? { ...list[idx] } : { key, label: all.get(key)?.label ?? key, permissions: [] };
      const perms = new Set(item.permissions);
      if (perms.has(perm)) perms.delete(perm);
      else perms.add(perm);
      item.permissions = Array.from(perms);
      if (idx >= 0) list[idx] = item;
      else list.push(item);
      onChange(`contextFields.${entity}`, list);
    };

    return (
      <SectionCard title={title}>
        <div className="rounded-lg border">
          <div className="grid grid-cols-[1fr,auto,auto,auto] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>Campo</span>
            <span className="text-center">Ler</span>
            <span className="text-center">Citar</span>
            <span className="text-center">Atualizar</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.key}
              className="grid grid-cols-[1fr,auto,auto,auto] items-center gap-2 border-b px-3 py-2 last:border-0"
            >
              <span className="text-sm">{r.label}</span>
              {["read", "cite", "write"].map((p) => (
                <input
                  key={p}
                  type="checkbox"
                  checked={r.permissions.includes(p)}
                  onChange={() => toggle(r.key, p)}
                  className="mx-auto size-4 accent-primary"
                />
              ))}
            </div>
          ))}
          {rows.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum campo disponível.</p>}
        </div>
      </SectionCard>
    );
  }

  const variables = (config.variables as Array<{ key: string; value: string }>) ?? [];

  return (
    <div className="space-y-6">
      {renderFieldTable("Campos do contato", catalogs.contactCustomFields, contactFields, "contact")}
      {renderFieldTable("Campos do negócio", catalogs.dealCustomFields, dealFields, "deal")}

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

      <SectionCard title="Mídia recebida" description="O que fazer com áudio, imagem e documento.">
        {(["audio", "image", "document"] as const).map((kind) => (
          <div key={kind} className="grid gap-2 md:grid-cols-2">
            <Field label={`${kind === "audio" ? "Áudio" : kind === "image" ? "Imagem" : "Documento"}`}>
              <Select
                value={(getPath(config, `media.${kind}.action`, "handoff") as string)}
                onValueChange={(v) => onChange(`media.${kind}.action`, v)}
              >
                <SelectTrigger />
                <SelectContent>
                  {MEDIA_ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mensagem quando não entender">
              <Input
                value={(getPath(config, `media.${kind}.notUnderstoodMessage`, "") as string)}
                onChange={(e) => onChange(`media.${kind}.notUnderstoodMessage`, e.target.value)}
              />
            </Field>
          </div>
        ))}
        <div className="flex items-center gap-3 pt-2">
          <Switch
            checked={!!getPath(config, "media.confirmUnderstanding", true)}
            onCheckedChange={(v) => onChange("media.confirmUnderstanding", v)}
            id="confirmMedia"
          />
          <Label htmlFor="confirmMedia">Confirmar entendimento antes de agir</Label>
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
  const docsQuery = useQuery({
    queryKey: ["ai-agents", agentId, "knowledge"],
    queryFn: () => fetchKnowledgeDocs(agentId),
  });
  const [file, setFile] = React.useState<File | null>(null);
  const uploadMutation = useMutation({
    mutationFn: (f: File) => uploadKnowledgeDoc(agentId, f),
    onSuccess: () => docsQuery.refetch(),
  });

  const allowedIds = (config.allowedKnowledgeDocIds as string[]) ?? [];

  return (
    <div className="space-y-6">
      <SectionCard title="Enviar material" description="PDFs, Word, textos e planilhas viram documentos de consulta.">
        <div className="flex gap-2">
          <Input
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button
            disabled={!file || uploadMutation.isPending}
            onClick={() => file && uploadMutation.mutate(file)}
          >
            <IconUpload className="size-4" /> Enviar
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Materiais disponíveis" description="Selecione quais o agente pode consultar globalmente.">
        {docsQuery.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <MultiSelectPopover
              label="Materiais permitidos"
              options={(docsQuery.data?.docs ?? []).map((d) => ({ value: d.id, label: d.title }))}
              selected={allowedIds}
              onChange={(v) => onChange("allowedKnowledgeDocIds", v)}
              emptyLabel="Nenhum material enviado"
            />
            <div className="mt-4 space-y-2">
              {(docsQuery.data?.docs ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <IconFile className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.status ?? "ok"} · {d.chunkCount ?? 0} trechos
                      </p>
                    </div>
                  </div>
                  <Badge variant={allowedIds.includes(d.id) ? "default" : "outline"}>
                    {allowedIds.includes(d.id) ? "Usado" : "Não usado"}
                  </Badge>
                </div>
              ))}
            </div>
          </>
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

  return (
    <div className="space-y-6">
      <SectionCard title="Mensagens prontas" description="Modelos de mensagem do CRM que o agente pode usar.">
        <MultiSelectPopover
          label="Modelos permitidos"
          options={catalogs.messageTemplates.map((m) => ({ value: m.id, label: m.name }))}
          selected={allowedModels}
          onChange={(v) => onChange("allowedMessageModelIds", v)}
          emptyLabel="Nenhum modelo cadastrado"
        />
      </SectionCard>

      <SectionCard title="Produtos e planos" description="Permitir que o agente fale do catálogo.">
        <div className="flex items-center gap-3">
          <Switch
            checked={!!pp.enabled}
            onCheckedChange={(v) => onChange("productPolicy", { ...pp, enabled: v })}
            id="prodEnabled"
          />
          <Label htmlFor="prodEnabled">Falar de produtos</Label>
        </div>
        {!!pp.enabled && (
          <div className="space-y-4 pt-2">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Quantos por vez">
                <Input
                  type="number"
                  value={String(pp.maxItems ?? 3)}
                  onChange={(e) => onChange("productPolicy", { ...pp, maxItems: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              {[
                { key: "showPrice", label: "Mostrar preço" },
                { key: "showConditions", label: "Mostrar condições" },
                { key: "showImage", label: "Mostrar imagem" },
                { key: "showLink", label: "Incluir link" },
              ].map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <Switch
                    checked={!!pp[c.key]}
                    onCheckedChange={(v) => onChange("productPolicy", { ...pp, [c.key]: v })}
                    id={c.key}
                  />
                  <Label htmlFor={c.key}>{c.label}</Label>
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
          <Field label="Mensagem de abertura">
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
            <Field label="Campos usados na confirmação">
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
          </>
        )}
      </SectionCard>

      <SectionCard title="Quando não encontrar o cliente" description="O que fazer se o número ainda não está no CRM.">
        <Field label="Ação">
          <Select
            value={(entry.onDealNotFound as string) ?? "ask_identification"}
            onValueChange={(v) => onChange("entry.onDealNotFound", v)}
          >
            <SelectTrigger />
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
            <Field label="Mensagem pedindo identificação">
              <Textarea
                value={(entry.identificationMessage as string) ?? ""}
                onChange={(e) => onChange("entry.identificationMessage", e.target.value)}
              />
            </Field>
            <Field label="Tentativas antes de transferir">
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
      {themes.map((t, i) => (
        <Card key={String(t.id) ?? i}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{(t.name as string) || "Assunto sem nome"}</CardTitle>
                <CardDescription>{((t.when as string[]) ?? []).join(", ") || "Sem gatilhos"}</CardDescription>
              </div>
              <div className="flex gap-1">
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
              <Field label="Nome">
                <Input
                  value={(t.name as string) ?? ""}
                  onChange={(e) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], name: e.target.value };
                    onChange("themes", next);
                  }}
                />
              </Field>
              <Field label="Quando usar (palavras ou frases)">
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
              <Field label="Exemplos de mensagens do cliente">
                <ChipInput
                  values={(t.examples as string[]) ?? []}
                  onChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], examples: v };
                    onChange("themes", next);
                  }}
                  placeholder="Ex: quero cancelar"
                />
              </Field>
              <Field label="Como agir">
                <Textarea
                  value={(t.instructions as string) ?? ""}
                  onChange={(e) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], instructions: e.target.value };
                    onChange("themes", next);
                  }}
                />
              </Field>
              <Field label="Quem responde">
                <Select
                  value={(t.answerBy as string) ?? "self"}
                  onValueChange={(v) => {
                    const next = themes.slice();
                    next[i] = { ...next[i], answerBy: v };
                    onChange("themes", next);
                  }}
                >
                  <SelectTrigger />
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
              <Field label="Materiais permitidos neste assunto">
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
              <Field label="Modelos permitidos neste assunto">
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
              <Field label="Destino quando transferir">
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
        <Field label="Não encontrou nos materiais">
          <Textarea
            value={(unknown.message as string) ?? ""}
            onChange={(e) => onChange("fallback.unknown.message", e.target.value)}
          />
        </Field>
        <Field label="Ação quando não souber">
          <Select
            value={(unknown.action as string) ?? "handoff"}
            onValueChange={(v) => onChange("fallback.unknown.action", v)}
          >
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="handoff">Passar para a equipe</SelectItem>
              <SelectItem value="silence">Não responder</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cliente pediu para falar com pessoa">
          <Textarea
            value={((fallback.humanRequest as Record<string, unknown>)?.message as string) ?? ""}
            onChange={(e) => onChange("fallback.humanRequest.message", e.target.value)}
          />
        </Field>
        <Field label="Sem material de consulta">
          <Textarea
            value={((fallback.noSource as Record<string, unknown>)?.message as string) ?? ""}
            onChange={(e) => onChange("fallback.noSource.message", e.target.value)}
          />
        </Field>
        <Field label="Erro técnico">
          <Textarea
            value={((fallback.error as Record<string, unknown>)?.message as string) ?? ""}
            onChange={(e) => onChange("fallback.error.message", e.target.value)}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Limites de segurança" description="Quando o agente para de responder sozinho.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { path: "limits.maxCourtesyReplies", label: "Respostas de cortesia" },
            { path: "limits.maxHelpOffers", label: "Ofertas de ajuda" },
            { path: "limits.maxStalledExchanges", label: "Trocas sem avanço" },
            { path: "limits.nonsenseLimit", label: "Mensagens sem sentido" },
            { path: "limits.silenceMinutes", label: "Minutos de silêncio" },
            { path: "limits.maxAiTransfers", label: "Máx. transferências IA→IA" },
          ].map((f) => (
            <Field key={f.path} label={f.label}>
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
            <Field label="Quando">
              <Select
                value={(getPath(config, "sentiment.threshold", "dissatisfied") as string)}
                onValueChange={(v) => onChange("sentiment.threshold", v)}
              >
                <SelectTrigger />
                <SelectContent>
                  <SelectItem value="any">Qualquer insatisfação</SelectItem>
                  <SelectItem value="dissatisfied">Insatisfeito</SelectItem>
                  <SelectItem value="angry">Bravo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ação">
              <Select
                value={(getPath(config, "sentiment.action", "handoff") as string)}
                onValueChange={(v) => onChange("sentiment.action", v)}
              >
                <SelectTrigger />
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
        <Field label="Destino">
          <DestinationPicker
            value={handoff.defaultDestination as Record<string, string> | undefined}
            catalogs={catalogs}
            onChange={(v) => onChange("handoff.defaultDestination", v)}
          />
        </Field>
        <Field label="Mensagem de handoff">
          <Textarea
            value={(handoff.message as string) ?? ""}
            onChange={(e) => onChange("handoff.message", e.target.value)}
          />
        </Field>
        <MultiChip
          label="Palavras-chave de pedido humano"
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
            <Field label="Fuso horário">
              <Input value={(bh.timezone as string) ?? ""} onChange={(e) => onChange("businessHours.timezone", e.target.value)} />
            </Field>
            <Field label="Fora do horário">
              <Select
                value={(bh.outsideAction as string) ?? "message"}
                onValueChange={(v) => onChange("businessHours.outsideAction", v)}
              >
                <SelectTrigger />
                <SelectContent>
                  <SelectItem value="message">Enviar mensagem</SelectItem>
                  <SelectItem value="handoff">Transferir</SelectItem>
                  <SelectItem value="silence">Não responder</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mensagem fora do horário">
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
            <Field label="Lembrete após (min)">
              <Input
                type="number"
                value={String(inactivity.nudgeAfter ?? 30)}
                onChange={(e) => onChange("inactivity.nudgeAfter", Number(e.target.value))}
              />
            </Field>
            <Field label="Encerrar após (min)">
              <Input
                type="number"
                value={String(inactivity.closeAfter ?? 1440)}
                onChange={(e) => onChange("inactivity.closeAfter", Number(e.target.value))}
              />
            </Field>
            <Field label="Mensagem de lembrete" className="md:col-span-2">
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
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  const closure = getPath(config, "closure", {}) as Record<string, unknown>;
  const survey = getPath(config, "survey", {}) as Record<string, unknown>;
  const tabulation = getPath(config, "tabulation", {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <SectionCard title="Encerramento" description="Mensagem de despedida e janela pós-encerramento.">
        <Field label="Mensagem de despedida">
          <Textarea
            value={(closure.goodbyeMessage as string) ?? ""}
            onChange={(e) => onChange("closure.goodbyeMessage", e.target.value)}
          />
        </Field>
        <Field label="Janela pós-encerramento (horas)">
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

      <SectionCard title="Comportamento após reabertura" description="O que fazer quando o cliente manda nova mensagem depois de encerrado.">
        {[
          { key: "courtesyBehavior", label: "Cortesia/despedida" },
          { key: "newDemandBehavior", label: "Nova demanda" },
          { key: "ambiguousBehavior", label: "Ambíguo" },
        ].map((c) => (
          <Field key={c.key} label={c.label}>
            <Select
              value={(closure[c.key] as string) ?? "short_reply"}
              onValueChange={(v) => onChange(`closure.${c.key}`, v)}
            >
              <SelectTrigger />
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
            <Field label="Pergunta">
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
            <Field label="Frequência máxima (dias)">
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
            <Field label="Quando">
              <Select
                value={(tabulation.when as string) ?? "on_close"}
                onValueChange={(v) => onChange("tabulation.when", v)}
              >
                <SelectTrigger />
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

function StepTestPublish({
  agentId,
  dirty,
  onSave,
}: {
  agentId: string;
  dirty: boolean;
  onSave: () => Promise<void>;
}) {
  const [message, setMessage] = React.useState("Oi");
  const [result, setResult] = React.useState<TestResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);

  const runTest = async () => {
    if (dirty) await onSave();
    setTesting(true);
    setError(null);
    try {
      const r = await testAgent(agentId, message);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no teste");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Testar antes de publicar" description="Envie uma mensagem e veja como o agente responderia, sem afetar clientes reais.">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite uma mensagem…"
            onKeyDown={(e) => e.key === "Enter" && runTest()}
          />
          <Button onClick={runTest} disabled={testing || !message.trim()}>
            <IconSend className="size-4" /> Enviar
          </Button>
        </div>
        {testing && <p className="text-sm text-muted-foreground">Pensando…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Resposta:</span> {result.reply || "(sem resposta)"}
            </p>
            <p>
              <span className="text-muted-foreground">Motivo:</span> {result.reason}
            </p>
            {result.handoff && <Badge>Handoff</Badge>}
            {result.closed && <Badge>Encerrado</Badge>}
            {result.toolCalls.length > 0 && (
              <div>
                <p className="font-semibold">Ferramentas chamadas:</p>
                <ul className="list-disc pl-5">
                  {result.toolCalls.map((t, i) => (
                    <li key={i}>
                      {t.toolName} → {JSON.stringify(t.result).slice(0, 120)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.ragChunks.length > 0 && (
              <div>
                <p className="font-semibold">Trechos dos materiais:</p>
                {result.ragChunks.map((c, i) => (
                  <p key={i} className="text-muted-foreground">
                    {c.text?.slice(0, 200)}
                  </p>
                ))}
              </div>
            )}
            {result.executedActions.length > 0 && (
              <div>
                <p className="font-semibold">Ações executadas:</p>
                {result.executedActions.map((a, i) => (
                  <p key={i} className="text-muted-foreground">
                    {JSON.stringify(a)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
