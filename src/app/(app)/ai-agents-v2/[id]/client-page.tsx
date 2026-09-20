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
} from "@tabler/icons-react";

import { AppV2PageShell } from "../../_v2-page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";

type AgentDetail = {
  id: string;
  name: string;
  active: boolean;
  simpleConfig: Record<string, unknown>;
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

type LogRow = {
  id: string;
  inboundText: string;
  reply?: string | null;
  handoff?: boolean;
  createdAt: string;
  prompt?: string;
  llmOutput?: Record<string, unknown> | null;
  appliedRuleId?: string | null;
  themeId?: string | null;
};

const BEHAVIOR_OPTIONS = [
  { value: "objective", label: "Mais objetivo", description: "Respostas diretas, consistentes e sem muita variação." },
  { value: "balanced", label: "Equilibrado", description: "Respostas naturais, mantendo consistência e objetividade." },
  { value: "natural", label: "Mais natural", description: "Conversa mais espontânea, com maior variedade na forma de responder." },
  { value: "creative", label: "Mais criativo", description: "Respostas mais variadas e flexíveis, com maior liberdade na comunicação." },
];

const FLOW_OPTIONS = [
  { value: "reception", label: "Recepção" },
  { value: "full", label: "Agente completo" },
  { value: "onboarding", label: "Primeiros dias" },
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
  { value: "short_reply", label: "Resposta curta" },
  { value: "reopen_and_route", label: "Reabrir e rotear" },
  { value: "ask_with_options", label: "Perguntar com opções" },
];

const STALLED_ACTION_OPTIONS = [
  { value: "handoff", label: "Transferir" },
  { value: "close", label: "Encerrar" },
];

const NONSENSE_ACTION_OPTIONS = [
  { value: "warn_and_silence", label: "Avisar e silenciar" },
  { value: "handoff", label: "Transferir" },
];

const TOOL_OPTIONS = [
  "search_products",
  "search_crm_records",
  "knowledge_search",
  "list_message_models",
  "send_message_model",
  "send_product",
  "send_whatsapp_template",
  "add_tag",
  "update_field",
  "add_note",
  "create_deal",
  "move_stage",
  "create_activity",
  "ask_with_options",
  "handoff",
  "close_conversation",
];

const RULE_CONDITION_TYPES = [
  "message_type",
  "keywords",
  "contact_tag",
  "first_message",
  "out_of_hours",
  "deal_stage",
  "field_equals",
  "no_deal",
  "survey_received",
  "media_kind",
];

const RULE_ACTION_TYPES = [
  "send_message",
  "set_theme",
  "handoff",
  "add_tag",
  "close_conversation",
  "no_reply",
  "send_message_model",
  "send_whatsapp_template",
  "set_variable",
  "record_knowledge_gap",
];

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

async function fetchAgent(id: string): Promise<AgentDetail> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`);
  return parseApiResponse<AgentDetail>(res, "Erro ao carregar agente v2.");
}

async function updateAgent(id: string, payload: { name?: string; active?: boolean }) {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseApiResponse<AgentDetail>(res, "Erro ao salvar agente v2.");
}

async function saveDraft(id: string, config: Record<string, unknown>) {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return parseApiResponse<AgentDetail>(res, "Erro ao salvar rascunho.");
}

async function publishAgent(id: string, comment?: string) {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  return parseApiResponse<{ versionNumber: number }>(res, "Erro ao publicar agente.");
}

async function deleteAgent(id: string) {
  const res = await apiFetch(`/api/ai-agents-v2/${id}`, { method: "DELETE" });
  return parseApiResponse<{ ok: boolean }>(res, "Erro ao deletar agente v2.");
}

async function fetchCatalogs(): Promise<Catalogs> {
  const res = await apiFetch("/api/ai-agents-v2/catalogs");
  return parseApiResponse<Catalogs>(res, "Erro ao carregar catálogos.");
}

async function testAgent(id: string, userMessage: string): Promise<TestResult> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userMessage }),
  });
  return parseApiResponse<TestResult>(res, "Erro ao testar agente v2.");
}

async function fetchLogs(id: string): Promise<LogRow[]> {
  const res = await apiFetch(`/api/ai-agents-v2/${id}/logs`);
  const data = await parseApiResponse<{ logs: LogRow[] }>(res, "Erro ao carregar logs.");
  return data.logs;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? {}));
}

function getPath(obj: Record<string, unknown>, path: string, fallback?: unknown): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key] ?? fallback;
    return fallback;
  }, obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

function makeId(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyTheme(): Record<string, unknown> {
  return {
    id: makeId("theme"),
    name: "",
    when: [],
    examples: [],
    instructions: "",
    allowedTools: [],
    allowedKnowledgeDocIds: [],
    allowedMessageModelIds: [],
    knowledgeDocIds: [],
    messageModelIds: [],
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
  };
}

function emptyRule(): Record<string, unknown> {
  return {
    id: makeId("rule"),
    name: "",
    order: 0,
    conditions: [],
    actions: [],
  };
}

function emptyBusinessHoursSlot(): Record<string, unknown> {
  return { day: 1, start: "08:00", end: "18:00" };
}

function useCatalogs() {
  return useQuery({
    queryKey: ["ai-agents-v2-catalogs"],
    queryFn: fetchCatalogs,
    staleTime: 60_000,
  });
}

function catalogOptions(items: Array<{ id: string; name: string }>) {
  return items.map((i) => ({ value: i.id, label: i.name }));
}

const COVERED_CONFIG_KEYS = new Set([
  "name",
  "flow",
  "model",
  "channelIds",
  "autonomyMode",
  "allowedDomains",
  "responseBehavior",
  "tone",
  "globalRules",
  "allowedKnowledgeDocIds",
  "allowedMessageModelIds",
  "themes",
  "entry",
  "handoff",
  "closure",
  "limits",
  "rules",
  "businessHours",
  "costCap",
  "dailyTokenCap",
  "enabledTools",
  "toolGovernor",
]);

function extractAdvanced(base: Record<string, unknown>): Record<string, unknown> {
  const advanced: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(base)) {
    if (!COVERED_CONFIG_KEYS.has(key)) advanced[key] = val;
  }
  return advanced;
}

function parseAdvanced(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text || "{}") as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mergeAdvanced(next: Record<string, unknown>, text: string): Record<string, unknown> | null {
  const parsed = parseAdvanced(text);
  if (!parsed) return null;
  for (const [key, val] of Object.entries(parsed)) {
    if (!COVERED_CONFIG_KEYS.has(key)) next[key] = val;
  }
  return next;
}

export default function AIAgentV2EditClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm: confirmDelete, dialog: deleteDialog } = useConfirm();
  const { confirm: confirmPublish, dialog: publishDialog } = useConfirm();
  const [activeTab, setActiveTab] = React.useState("config");

  const [config, setConfig] = React.useState<Record<string, unknown> | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [advancedText, setAdvancedText] = React.useState("{}");
  const [advancedError, setAdvancedError] = React.useState<string | null>(null);
  const initializedRef = React.useRef(false);

  // Reinicializa o estado local quando o id do agente muda (navegação).
  React.useEffect(() => {
    initializedRef.current = false;
  }, [id]);

  const { data: agent, isLoading } = useQuery({
    queryKey: ["ai-agents-v2", id],
    queryFn: () => fetchAgent(id),
    enabled: !!id,
  });

  React.useEffect(() => {
    if (!agent || initializedRef.current) return;
    initializedRef.current = true;
    const base = clone(agent.simpleConfig);
    setConfig(base);
    setAdvancedText(JSON.stringify(extractAdvanced(base), null, 2));
    setDirty(false);
  }, [agent]);

  const { data: catalogs } = useCatalogs();

  function updateConfig(path: string, value: unknown) {
    if (!config) return;
    const next = clone(config);
    setPath(next, path, clone(value));
    // merge advanced back
    const adv = parseAdvanced(advancedText);
    if (adv) {
      for (const [key, val] of Object.entries(adv)) {
        if (next[key] === undefined) next[key] = val;
      }
    }
    setConfig(next);
    setDirty(true);
  }

  function updateArray(path: string, value: unknown[]) {
    updateConfig(path, value);
  }

  function pushItem(path: string, item: unknown) {
    const arr = ((getPath(config ?? {}, path) as unknown[]) ?? []).slice();
    arr.push(item);
    updateArray(path, arr);
  }

  function removeItem(path: string, index: number) {
    const arr = ((getPath(config ?? {}, path) as unknown[]) ?? []).slice();
    arr.splice(index, 1);
    updateArray(path, arr);
  }

  function moveItem(path: string, index: number, delta: number) {
    const arr = ((getPath(config ?? {}, path) as unknown[]) ?? []).slice();
    const target = index + delta;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    updateArray(path, arr);
  }

  function updateArrayItem<T extends Record<string, unknown>>(path: string, index: number, patch: Partial<T>) {
    const arr = ((getPath(config ?? {}, path) as T[]) ?? []).slice();
    arr[index] = { ...arr[index], ...patch };
    updateArray(path, arr);
  }

  const saveDraftMutation = useMutation({
    mutationFn: () => saveDraft(id, config ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2", id] });
      setDirty(false);
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishAgent(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2", id] });
      setDirty(false);
      alert(`Publicado como versão ${res.versionNumber}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2"] });
      router.push("/ai-agents-v2");
    },
  });

  const nameActiveMutation = useMutation({
    mutationFn: (payload: { name?: string; active?: boolean }) => updateAgent(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-agents-v2", id] }),
  });

  function handleAdvancedChange(text: string) {
    setAdvancedText(text);
    const parsed = parseAdvanced(text);
    setAdvancedError(parsed ? null : "JSON inválido");
    if (!parsed || !config) return;
    const next = clone(config);
    mergeAdvanced(next, text);
    setConfig(next);
    setDirty(true);
  }

  if (isLoading || !config || !agent) {
    return (
      <AppV2PageShell title="Agente v2" icon={<IconBrain size={22} />}>
        <Skeleton className="h-[600px] rounded-xl" />
      </AppV2PageShell>
    );
  }

  return (
    <AppV2PageShell
      title={agent.name}
      icon={<IconBrain size={22} />}
      description="Configure, teste e publique o agente v2."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveDraftMutation.mutate()}
            disabled={!dirty || saveDraftMutation.isPending}
            className="gap-1"
          >
            <IconDeviceFloppy className="size-4" /> Salvar rascunho
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              const ok = await confirmPublish({
                title: "Publicar agente",
                description: "Publicar cria uma nova versão e ativa o agente. Continuar?",
              });
              if (ok) publishMutation.mutate();
            }}
            disabled={publishMutation.isPending}
            className="gap-1"
          >
            <IconRocket className="size-4" /> Publicar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              const ok = await confirmDelete({
                title: "Deletar agente v2",
                description: "Deletar este agente? Ação irreversível.",
                destructive: true,
              });
              if (ok) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 space-y-4">
        <TabsList>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="test">Testar</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <GeneralSection
            agent={agent}
            config={config}
            catalogs={catalogs}
            onConfigChange={updateConfig}
            onNameActiveChange={(p) => nameActiveMutation.mutate(p)}
          />
          <VoiceSection config={config} onChange={updateConfig} />
          <KnowledgeSection config={config} catalogs={catalogs} onChange={updateConfig} />
          <ThemesSection
            config={config}
            catalogs={catalogs}
            onPush={() => pushItem("themes", emptyTheme())}
            onRemove={(i) => removeItem("themes", i)}
            onMove={(i, d) => moveItem("themes", i, d)}
            onUpdateItem={(i, p) => updateArrayItem("themes", i, p)}
          />
          <OutputsSection config={config} catalogs={catalogs} onChange={updateConfig} />
          <TeamHoursSection config={config} catalogs={catalogs} onChange={updateConfig} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avançado (JSON)</CardTitle>
              <CardDescription>
                Só edite aqui chaves que ainda não têm campo na tela. Erros de JSON impedem salvar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={advancedText}
                onChange={(e) => handleAdvancedChange(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
              {advancedError && <p className="text-sm text-destructive">{advancedError}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test">
          <TestTab agentId={id} />
        </TabsContent>

        <TabsContent value="logs">
          <LogsTab agentId={id} />
        </TabsContent>
      </Tabs>
      {publishDialog}
      {deleteDialog}
    </AppV2PageShell>
  );
}

function GeneralSection({
  agent,
  config,
  catalogs,
  onConfigChange,
  onNameActiveChange,
}: {
  agent: AgentDetail;
  config: Record<string, unknown>;
  catalogs?: Catalogs;
  onConfigChange: (path: string, value: unknown) => void;
  onNameActiveChange: (payload: { name?: string; active?: boolean }) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Geral</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">Nome do agente</Label>
          <Input
            id="name"
            defaultValue={agent.name}
            onBlur={(e) => onNameActiveChange({ name: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="active"
            checked={agent.active}
            onCheckedChange={(v) => onNameActiveChange({ active: v })}
          />
          <Label htmlFor="active">Ativo</Label>
        </div>
        <div className="grid gap-2">
          <Label>Fluxo</Label>
          <Select
            value={(config.flow as string) ?? "full"}
            onValueChange={(v) => onConfigChange("flow", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Modelo LLM</Label>
          <Input
            value={(config.model as string) ?? "gpt-4o-mini"}
            onChange={(e) => onConfigChange("model", e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label>Canais vinculados</Label>
          <MultiSelectPopover
            label="Canais"
            options={catalogOptions(catalogs?.channels ?? [])}
            selected={(config.channelIds as string[]) ?? []}
            onChange={(v) => onConfigChange("channelIds", v)}
            triggerClassName="w-full"
          />
        </div>
        <div className="grid gap-2">
          <Label>Modo de execução</Label>
          <Select
            value={(config.autonomyMode as string) ?? "autonomous"}
            onValueChange={(v) => onConfigChange("autonomyMode", v)}
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
        </div>
        <div className="grid gap-2">
          <Label>Domínios permitidos em links</Label>
          <ChipInput
            values={((config.allowedDomains as string[]) ?? []).slice()}
            onChange={(v) => onConfigChange("allowedDomains", v)}
            placeholder="ex.: meusite.com.br"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function VoiceSection({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Jeito de falar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label>Comportamento da resposta</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {BEHAVIOR_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  (config.responseBehavior as string) === o.value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="responseBehavior"
                  value={o.value}
                  checked={(config.responseBehavior as string) === o.value}
                  onChange={() => onChange("responseBehavior", o.value)}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">{o.label}</p>
                  <p className="text-xs text-muted-foreground">{o.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Tom / persona</Label>
          <Textarea
            value={(config.tone as string) ?? ""}
            onChange={(e) => onChange("tone", e.target.value)}
            rows={3}
          />
        </div>
        <div className="grid gap-2">
          <Label>Regras globais</Label>
          <ChipInput
            values={((config.globalRules as string[]) ?? []).slice()}
            onChange={(v) => onChange("globalRules", v)}
            placeholder="Adicionar regra..."
          />
        </div>
      </CardContent>
    </Card>
  );
}

function KnowledgeSection({
  config,
  catalogs,
  onChange,
}: {
  config: Record<string, unknown>;
  catalogs?: Catalogs;
  onChange: (path: string, value: unknown) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">O que ele sabe</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Documentos de conhecimento globais</Label>
          <MultiSelectPopover
            label="Documentos"
            options={catalogOptions(catalogs?.knowledgeDocs ?? [])}
            selected={(config.allowedKnowledgeDocIds as string[]) ?? []}
            onChange={(v) => onChange("allowedKnowledgeDocIds", v)}
            triggerClassName="w-full"
          />
        </div>
        <div className="grid gap-2">
          <Label>Modelos de mensagem globais</Label>
          <MultiSelectPopover
            label="Modelos"
            options={catalogOptions(catalogs?.messageTemplates ?? [])}
            selected={(config.allowedMessageModelIds as string[]) ?? []}
            onChange={(v) => onChange("allowedMessageModelIds", v)}
            triggerClassName="w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ThemesSection({
  config,
  catalogs,
  onPush,
  onRemove,
  onMove,
  onUpdateItem,
}: {
  config: Record<string, unknown>;
  catalogs?: Catalogs;
  onPush: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, delta: number) => void;
  onUpdateItem: (index: number, patch: Record<string, unknown>) => void;
}) {
  const themes = (config.themes as Array<Record<string, unknown>>) ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Assuntos</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={onPush} className="gap-1">
          <IconPlus className="size-4" /> Novo assunto
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {themes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum assunto configurado.</p>
        )}
        {themes.map((theme, i) => (
          <div key={String(theme.id) ?? i} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Input
                value={(theme.name as string) ?? ""}
                onChange={(e) => onUpdateItem(i, { name: e.target.value })}
                placeholder="Nome do assunto"
                className="font-medium"
              />
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => onMove(i, -1)} disabled={i === 0}>
                  ↑
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onMove(i, 1)} disabled={i === themes.length - 1}>
                  ↓
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(i)}>
                  <IconTrash className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label className="text-xs">Gatilhos (palavras ou frases)</Label>
                <ChipInput
                  values={(theme.when as string[]) ?? []}
                  onChange={(v) => onUpdateItem(i, { when: v })}
                  placeholder="ex.: preço, suporte"
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label className="text-xs">Exemplos de mensagens</Label>
                <ChipInput
                  values={(theme.examples as string[]) ?? []}
                  onChange={(v) => onUpdateItem(i, { examples: v })}
                  placeholder="ex.: Quanto custa?"
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label className="text-xs">Instruções específicas</Label>
                <Textarea
                  value={(theme.instructions as string) ?? ""}
                  onChange={(e) => onUpdateItem(i, { instructions: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Tools permitidas</Label>
                <MultiSelectPopover
                  label="Tools"
                  options={TOOL_OPTIONS.map((t) => ({ value: t, label: t }))}
                  selected={(theme.allowedTools as string[]) ?? []}
                  onChange={(v) => onUpdateItem(i, { allowedTools: v })}
                  triggerClassName="w-full"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Máximo de turnos no assunto (0 = ilimitado)</Label>
                <Input
                  type="number"
                  min={0}
                  value={(theme.maxTurns as number) ?? 0}
                  onChange={(e) => onUpdateItem(i, { maxTurns: Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Docs permitidos (por assunto)</Label>
                <MultiSelectPopover
                  label="Docs"
                  options={catalogOptions(catalogs?.knowledgeDocs ?? [])}
                  selected={(theme.allowedKnowledgeDocIds as string[]) ?? []}
                  onChange={(v) => onUpdateItem(i, { allowedKnowledgeDocIds: v })}
                  triggerClassName="w-full"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Modelos permitidos (por assunto)</Label>
                <MultiSelectPopover
                  label="Modelos"
                  options={catalogOptions(catalogs?.messageTemplates ?? [])}
                  selected={(theme.allowedMessageModelIds as string[]) ?? []}
                  onChange={(v) => onUpdateItem(i, { allowedMessageModelIds: v })}
                  triggerClassName="w-full"
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label className="text-xs">Handoff deste assunto</Label>
                <DestinationPicker
                  value={theme.handoffDestination as { type: string; id?: string } | undefined}
                  onChange={(v) => onUpdateItem(i, { handoffDestination: v })}
                  catalogs={catalogs}
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OutputsSection({
  config,
  catalogs,
  onChange,
}: {
  config: Record<string, unknown>;
  catalogs?: Catalogs;
  onChange: (path: string, value: unknown) => void;
}) {
  const entry = (config.entry as Record<string, unknown>) ?? {};
  const handoff = (config.handoff as Record<string, unknown>) ?? {};
  const closure = (config.closure as Record<string, unknown>) ?? {};
  const limits = (config.limits as Record<string, unknown>) ?? {};
  const rules = (config.rules as Array<Record<string, unknown>>) ?? [];

  function updateEntry(patch: Record<string, unknown>) {
    onChange("entry", { ...entry, ...patch });
  }
  function updateHandoff(patch: Record<string, unknown>) {
    onChange("handoff", { ...handoff, ...patch });
  }
  function updateClosure(patch: Record<string, unknown>) {
    onChange("closure", { ...closure, ...patch });
  }
  function updateLimits(patch: Record<string, unknown>) {
    onChange("limits", { ...limits, ...patch });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saídas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Entrada / boas-vindas</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label className="text-xs">Mensagem de abertura</Label>
              <Textarea
                value={(entry.openingMessage as string) ?? ""}
                onChange={(e) => updateEntry({ openingMessage: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Mensagem de confirmação</Label>
              <Textarea
                value={(entry.confirmationMessage as string) ?? ""}
                onChange={(e) => updateEntry({ confirmationMessage: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Mensagem de identificação</Label>
              <Textarea
                value={(entry.identificationMessage as string) ?? ""}
                onChange={(e) => updateEntry({ identificationMessage: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Quando não encontrar negócio</Label>
              <Select
                value={(entry.onDealNotFound as string) ?? "ask_identification"}
                onValueChange={(v) => updateEntry({ onDealNotFound: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ON_DEAL_NOT_FOUND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="confirmContact"
                checked={(entry.confirmContact as boolean) ?? true}
                onCheckedChange={(v) => updateEntry({ confirmContact: v })}
              />
              <Label htmlFor="confirmContact" className="text-xs">Confirmar identidade antes de atender</Label>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label className="text-xs">Campos usados na confirmação</Label>
              <ChipInput
                values={((entry.confirmationFields as string[]) ?? []).slice()}
                onChange={(v) => updateEntry({ confirmationFields: v })}
                placeholder="name, email, cpf..."
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Handoff padrão</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label className="text-xs">Destino padrão</Label>
              <DestinationPicker
                value={handoff.defaultDestination as { type: string; id?: string } | undefined}
                onChange={(v) => updateHandoff({ defaultDestination: v })}
                catalogs={catalogs}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label className="text-xs">Mensagem de handoff</Label>
              <Textarea
                value={(handoff.message as string) ?? ""}
                onChange={(e) => updateHandoff({ message: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label className="text-xs">Palavras-chave de pedido humano</Label>
              <ChipInput
                values={((handoff.humanRequestKeywords as string[]) ?? []).slice()}
                onChange={(v) => updateHandoff({ humanRequestKeywords: v })}
                placeholder="humano, atendente..."
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Encerramento</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-xs">Janela pós-encerramento (horas)</Label>
              <Input
                type="number"
                min={0}
                value={(closure.postCloseWindowHours as number) ?? 6}
                onChange={(e) => updateClosure({ postCloseWindowHours: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Mensagem de despedida</Label>
              <Textarea
                value={(closure.goodbyeMessage as string) ?? ""}
                onChange={(e) => updateClosure({ goodbyeMessage: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Comportamento: cortesia</Label>
              <Select
                value={(closure.courtesyBehavior as string) ?? "no_reply"}
                onValueChange={(v) => updateClosure({ courtesyBehavior: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_CLOSE_BEHAVIOR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Comportamento: nova demanda</Label>
              <Select
                value={(closure.newDemandBehavior as string) ?? "reopen_and_route"}
                onValueChange={(v) => updateClosure({ newDemandBehavior: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_CLOSE_BEHAVIOR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Comportamento: ambíguo</Label>
              <Select
                value={(closure.ambiguousBehavior as string) ?? "ask_with_options"}
                onValueChange={(v) => updateClosure({ ambiguousBehavior: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_CLOSE_BEHAVIOR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="returnToOriginStage"
                checked={(closure.returnToOriginStage as boolean) ?? true}
                onCheckedChange={(v) => updateClosure({ returnToOriginStage: v })}
              />
              <Label htmlFor="returnToOriginStage" className="text-xs">Devolver card à etapa de origem ao fechar</Label>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Limites</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { key: "maxCourtesyReplies", label: "Respostas de cortesia" },
              { key: "maxHelpOffers", label: "Ofertas de ajuda" },
              { key: "maxStalledExchanges", label: "Trocas travadas" },
              { key: "nonsenseLimit", label: "Mensagens sem sentido" },
              { key: "silenceMinutes", label: "Minutos de silêncio" },
              { key: "loopDetectionWindowMinutes", label: "Janela de loop (min)" },
              { key: "maxLoopCount", label: "Máx. repetições (loop)" },
              { key: "maxAiTransfers", label: "Máx. transferências IA→IA" },
            ].map(({ key, label }) => (
              <div key={key} className="grid gap-2">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  min={0}
                  value={(limits[key as keyof typeof limits] as number) ?? 0}
                  onChange={(e) => updateLimits({ [key]: Number(e.target.value) })}
                />
              </div>
            ))}
            <div className="grid gap-2">
              <Label className="text-xs">Ação após travamento</Label>
              <Select
                value={(limits.stalledExchangesAction as string) ?? "handoff"}
                onValueChange={(v) => updateLimits({ stalledExchangesAction: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STALLED_ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Ação após sem sentido</Label>
              <Select
                value={(limits.nonsenseAction as string) ?? "warn_and_silence"}
                onValueChange={(v) => updateLimits({ nonsenseAction: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NONSENSE_ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <RulesSection rules={rules} onChange={(v) => onChange("rules", v)} catalogs={catalogs} />
      </CardContent>
    </Card>
  );
}

function RulesSection({
  rules,
  onChange,
  catalogs,
}: {
  rules: Array<Record<string, unknown>>;
  onChange: (v: Array<Record<string, unknown>>) => void;
  catalogs?: Catalogs;
}) {
  function update(i: number, patch: Record<string, unknown>) {
    const next = rules.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function push() {
    onChange([...rules, emptyRule()]);
  }
  function remove(i: number) {
    const next = rules.slice();
    next.splice(i, 1);
    onChange(next);
  }
  function move(i: number, delta: number) {
    const next = rules.slice();
    const target = i + delta;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    onChange(next);
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Regras determinísticas</h4>
        <Button type="button" variant="outline" size="sm" onClick={push} className="gap-1">
          <IconPlus className="size-4" /> Nova regra
        </Button>
      </div>
      {rules.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma regra.</p>}
      {rules.map((rule, i) => (
        <div key={String(rule.id) ?? i} className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={(rule.name as string) ?? ""}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Nome da regra"
              className="flex-1"
            />
            <Input
              type="number"
              value={(rule.order as number) ?? 0}
              onChange={(e) => update(i, { order: Number(e.target.value) })}
              className="w-24"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === rules.length - 1}>↓</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}><IconTrash className="size-4 text-destructive" /></Button>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Condições</Label>
            <ConditionsEditor
              value={(rule.conditions as Array<Record<string, unknown>>) ?? []}
              onChange={(v) => update(i, { conditions: v })}
              catalogs={catalogs}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Ações</Label>
            <ActionsEditor
              value={(rule.actions as Array<Record<string, unknown>>) ?? []}
              onChange={(v) => update(i, { actions: v })}
              catalogs={catalogs}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConditionsEditor({
  value,
  onChange,
  catalogs: _catalogs,
}: {
  value: Array<Record<string, unknown>>;
  onChange: (v: Array<Record<string, unknown>>) => void;
  catalogs?: Catalogs;
}) {
  function update(i: number, patch: Record<string, unknown>) {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function push() {
    onChange([...value, { type: "keywords", values: [] }]);
  }
  function remove(i: number) {
    const next = value.slice();
    next.splice(i, 1);
    onChange(next);
  }
  return (
    <div className="space-y-2">
      {value.map((cond, i) => (
        <div key={i} className="flex flex-wrap items-start gap-2 rounded-md bg-muted/40 p-2">
          <Select
            value={(cond.type as string) ?? "keywords"}
            onValueChange={(v) => update(i, { type: v })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_CONDITION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cond.type !== "first_message" && cond.type !== "out_of_hours" && cond.type !== "no_deal" && cond.type !== "survey_received" && (
            <ChipInput
              values={((cond.values as string[]) ?? []).slice()}
              onChange={(v) => update(i, { values: v })}
              placeholder="valores..."
            />
          )}
          {(cond.type === "field_equals" || cond.type === "deal_stage") && (
            <>
              <Input
                value={(cond.field as string) ?? ""}
                onChange={(e) => update(i, { field: e.target.value })}
                placeholder="campo"
                className="w-32"
              />
              <Input
                value={(cond.expected as string) ?? ""}
                onChange={(e) => update(i, { expected: e.target.value })}
                placeholder="valor esperado"
                className="w-40"
              />
            </>
          )}
          <div className="flex items-center gap-2">
            <Switch
              id={`neg-${i}`}
              checked={(cond.negate as boolean) ?? false}
              onCheckedChange={(v) => update(i, { negate: v })}
            />
            <Label htmlFor={`neg-${i}`} className="text-xs">Negar</Label>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}><IconTrash className="size-4 text-destructive" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={push} className="gap-1">
        <IconPlus className="size-4" /> Condição
      </Button>
    </div>
  );
}

function ActionsEditor({
  value,
  onChange,
  catalogs,
}: {
  value: Array<Record<string, unknown>>;
  onChange: (v: Array<Record<string, unknown>>) => void;
  catalogs?: Catalogs;
}) {
  function update(i: number, patch: Record<string, unknown>) {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function push() {
    onChange([...value, { type: "send_message", message: "" }]);
  }
  function remove(i: number) {
    const next = value.slice();
    next.splice(i, 1);
    onChange(next);
  }
  return (
    <div className="space-y-2">
      {value.map((action, i) => (
        <div key={i} className="flex flex-wrap items-start gap-2 rounded-md bg-muted/40 p-2">
          <Select
            value={(action.type as string) ?? "send_message"}
            onValueChange={(v) => update(i, { type: v })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_ACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(action.type === "send_message" || action.type === "send_message_model" || action.type === "send_whatsapp_template") && (
            <Input
              value={(action.message as string) ?? (action.modelId as string) ?? ""}
              onChange={(e) => update(i, action.type === "send_message" ? { message: e.target.value } : { modelId: e.target.value })}
              placeholder={action.type === "send_message" ? "mensagem" : "id do modelo/template"}
              className="w-64"
            />
          )}
          {action.type === "set_theme" && (
            <Input
              value={(action.themeId as string) ?? ""}
              onChange={(e) => update(i, { themeId: e.target.value })}
              placeholder="id do tema"
              className="w-48"
            />
          )}
          {action.type === "handoff" && (
            <DestinationPicker
              value={action.destination as { type: string; id?: string } | undefined}
              onChange={(v) => update(i, { destination: v })}
              catalogs={catalogs}
            />
          )}
          {action.type === "add_tag" && (
            <Input
              value={(action.tag as string) ?? ""}
              onChange={(e) => update(i, { tag: e.target.value })}
              placeholder="nome da tag"
              className="w-40"
            />
          )}
          {action.type === "set_variable" && (
            <>
              <Input
                value={((action.variable as Record<string, string>)?.key as string) ?? ""}
                onChange={(e) => update(i, { variable: { ...(action.variable as Record<string, string> ?? {}), key: e.target.value } })}
                placeholder="chave"
                className="w-32"
              />
              <Input
                value={((action.variable as Record<string, string>)?.value as string) ?? ""}
                onChange={(e) => update(i, { variable: { ...(action.variable as Record<string, string> ?? {}), value: e.target.value } })}
                placeholder="valor"
                className="w-40"
              />
            </>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}><IconTrash className="size-4 text-destructive" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={push} className="gap-1">
        <IconPlus className="size-4" /> Ação
      </Button>
    </div>
  );
}

function TeamHoursSection({
  config,
  catalogs: _catalogs,
  onChange,
}: {
  config: Record<string, unknown>;
  catalogs?: Catalogs;
  onChange: (path: string, value: unknown) => void;
}) {
  const businessHours = (config.businessHours as Record<string, unknown> | null) ?? null;
  const costCap = (config.costCap as Record<string, unknown>) ?? {};
  const enabledTools = (config.enabledTools as string[]) ?? [];
  const toolGovernor = (config.toolGovernor as Record<string, unknown>) ?? {};
  const slots = (businessHours?.weekdays as Array<Record<string, unknown>>) ?? [];

  function updateBusinessHours(patch: Record<string, unknown>) {
    onChange("businessHours", { enabled: false, timezone: "America/Sao_Paulo", weekdays: [], ...(businessHours ?? {}), ...patch });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Equipe e horários</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="bhEnabled"
              checked={(businessHours?.enabled as boolean) ?? false}
              onCheckedChange={(v) => updateBusinessHours({ enabled: v })}
            />
            <Label htmlFor="bhEnabled">Horário de atendimento ativo</Label>
          </div>
          {(businessHours?.enabled as boolean) && (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label className="text-xs">Timezone</Label>
                <Input
                  value={(businessHours?.timezone as string) ?? "America/Sao_Paulo"}
                  onChange={(e) => updateBusinessHours({ timezone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Mensagem fora do expediente</Label>
                <Textarea
                  value={(businessHours?.offHoursMessage as string) ?? ""}
                  onChange={(e) => updateBusinessHours({ offHoursMessage: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Dias/horários</Label>
                {slots.map((slot, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-muted/40 p-2">
                    <Select
                      value={String(slot.day ?? 1)}
                      onValueChange={(v) => {
                        const next = slots.slice();
                        next[i] = { ...next[i], day: Number(v) };
                        updateBusinessHours({ weekdays: next });
                      }}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((d) => (
                          <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="time"
                      value={(slot.start as string) ?? "08:00"}
                      onChange={(e) => {
                        const next = slots.slice();
                        next[i] = { ...next[i], start: e.target.value };
                        updateBusinessHours({ weekdays: next });
                      }}
                    />
                    <Input
                      type="time"
                      value={(slot.end as string) ?? "18:00"}
                      onChange={(e) => {
                        const next = slots.slice();
                        next[i] = { ...next[i], end: e.target.value };
                        updateBusinessHours({ weekdays: next });
                      }}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => {
                      const next = slots.slice();
                      next.splice(i, 1);
                      updateBusinessHours({ weekdays: next });
                    }}><IconTrash className="size-4 text-destructive" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => updateBusinessHours({ weekdays: [...slots, emptyBusinessHoursSlot()] })} className="gap-1">
                  <IconPlus className="size-4" /> Adicionar slot
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Tetos de custo</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label className="text-xs">Custo diário (USD)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={(costCap.maxUsdPerDay as number) ?? 0}
                onChange={(e) => onChange("costCap", { ...costCap, maxUsdPerDay: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Custo mensal (USD)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={(costCap.maxUsdPerMonth as number) ?? 0}
                onChange={(e) => onChange("costCap", { ...costCap, maxUsdPerMonth: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Teto de tokens diários (0 = ilimitado)</Label>
              <Input
                type="number"
                min={0}
                value={(config.dailyTokenCap as number) ?? 0}
                onChange={(e) => onChange("dailyTokenCap", Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Governança de tools</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-2">
              <Label className="text-xs">Tools habilitadas globalmente</Label>
              <MultiSelectPopover
                label="Tools"
                options={TOOL_OPTIONS.map((t) => ({ value: t, label: t }))}
                selected={enabledTools}
                onChange={(v) => onChange("enabledTools", v)}
                triggerClassName="w-full"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Máx. chamadas por turno</Label>
              <Input
                type="number"
                min={1}
                value={(toolGovernor.maxCallsPerTurn as number) ?? 6}
                onChange={(e) => onChange("toolGovernor", { ...toolGovernor, maxCallsPerTurn: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Máx. repetições da mesma tool</Label>
              <Input
                type="number"
                min={1}
                value={(toolGovernor.maxRepeatsPerTool as number) ?? 2}
                onChange={(e) => onChange("toolGovernor", { ...toolGovernor, maxRepeatsPerTool: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DestinationPicker({
  value,
  onChange,
  catalogs,
}: {
  value?: { type: string; id?: string; message?: string };
  onChange: (v: { type: string; id?: string; message?: string }) => void;
  catalogs?: Catalogs;
}) {
  const type = value?.type ?? "department";
  const id = value?.id ?? "";

  function catalogForType(t: string): Array<{ id: string; name: string }> {
    switch (t) {
      case "department": return catalogs?.departments ?? [];
      case "distribution_rule": return catalogs?.distributionRules ?? [];
      case "user": return catalogs?.users ?? [];
      case "ai_agent": return catalogs?.aiAgents ?? [];
      default: return [];
    }
  }

  const options = catalogForType(type);
  const selected = options.find((o) => o.id === id);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Select value={type} onValueChange={(t) => onChange({ type: t, id: undefined })}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="department">Departamento</SelectItem>
          <SelectItem value="distribution_rule">Regra de distribuição</SelectItem>
          <SelectItem value="user">Usuário</SelectItem>
          <SelectItem value="ai_agent">Agente de IA</SelectItem>
        </SelectContent>
      </Select>
      <div className="sm:col-span-2">
        {type === "automation" ? (
          <Input value={id} onChange={(e) => onChange({ type, id: e.target.value })} placeholder="id da automação" />
        ) : (
          <Select value={id || "__none__"} onValueChange={(v) => onChange({ type, id: v === "__none__" ? undefined : v })}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {id && !selected && <MissingBadge className="mt-1" />}
      </div>
      <div className="sm:col-span-3">
        <Input
          value={value?.message ?? ""}
          onChange={(e) => onChange({ ...value, type, id, message: e.target.value })}
          placeholder="Mensagem específica deste destino (opcional)"
        />
      </div>
    </div>
  );
}

function TestTab({ agentId }: { agentId: string }) {
  const [message, setMessage] = React.useState("oi");
  const [result, setResult] = React.useState<TestResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSend() {
    setLoading(true);
    setError(null);
    try {
      const r = await testAgent(agentId, message);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no teste");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Teste de resposta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite uma mensagem..."
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <Button onClick={handleSend} disabled={loading}>
            <IconSend className="size-4" /> Enviar
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Tokens: {result.inputTokens} in / {result.outputTokens} out</Badge>
              <Badge variant="outline">{result.latencyMs}ms</Badge>
              {result.appliedRuleId && <Badge variant="outline">Regra: {result.appliedRuleId}</Badge>}
              {result.themeId && <Badge variant="outline">Assunto: {result.themeId}</Badge>}
              {result.handoff && <Badge variant="secondary">Handoff</Badge>}
              {result.closed && <Badge variant="secondary">Encerrado</Badge>}
            </div>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Resposta</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{result.reply}</p>
                <p className="mt-2 text-xs text-muted-foreground">Motivo: {result.reason}</p>
              </CardContent>
            </Card>
            {result.toolCalls.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Tools chamadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.toolCalls.map((call, i) => (
                    <div key={i} className="rounded-md bg-muted p-2 text-xs">
                      <p className="font-medium">{call.toolName}</p>
                      <pre className="mt-1 max-h-24 overflow-auto">{JSON.stringify(call.args, null, 2)}</pre>
                      <pre className="mt-1 max-h-24 overflow-auto">{JSON.stringify(call.result, null, 2)}</pre>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {result.ragChunks.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Trechos do RAG</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.ragChunks.map((chunk, i) => (
                    <div key={i} className="rounded-md bg-muted p-2 text-xs">
                      <p className="font-medium">Doc {chunk.docId} · score {chunk.score?.toFixed(2)}</p>
                      <p className="mt-1">{chunk.text}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {result.executedActions.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Ações executadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(result.executedActions, null, 2)}</pre>
                </CardContent>
              </Card>
            )}
            {result.discardedActions.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Ações descartadas (fora da allowlist)</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(result.discardedActions, null, 2)}</pre>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogsTab({ agentId }: { agentId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["ai-agents-v2", agentId, "logs"],
    queryFn: () => fetchLogs(agentId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logs de turnos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum log encontrado.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <Card key={log.id} className="overflow-hidden">
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                  <p className="text-sm font-medium">Inbound: {log.inboundText}</p>
                  {log.reply && <p className="text-sm">Reply: {log.reply}</p>}
                  <div className="flex flex-wrap gap-1">
                    {log.handoff && <Badge variant="secondary">Handoff</Badge>}
                    {log.appliedRuleId && <Badge variant="outline">Regra: {log.appliedRuleId}</Badge>}
                    {log.themeId && <Badge variant="outline">Assunto: {log.themeId}</Badge>}
                  </div>
                  {log.llmOutput && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(log.llmOutput, null, 2)}</pre>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MissingBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 text-warning border-warning bg-warning/10", className)}>
      <IconAlertCircle className="size-3" /> Não encontrado no catálogo
    </Badge>
  );
}
