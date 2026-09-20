"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconRobot,
  IconBrain,
  IconTrash,
  IconPlus,
  IconSend,
  IconRefresh,
} from "@tabler/icons-react";

import { AppV2PageShell } from "../../_v2-page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, parseApiResponse, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type AgentDetail = {
  id: string;
  userId: string;
  name: string;
  archetype: string;
  model: string;
  temperature: number;
  active: boolean;
  engine: string | null;
  simpleConfig?: Record<string, unknown> | null;
};

type ModeItem = { id: string; when: string; instructions: string };

type SimpleConfigForm = {
  tone: string;
  rules: string;
  context_fields: { contact: string[]; deal: string[] };
  confirmation_message: string;
  on_deal_not_found: "ask_identification" | "handoff";
  identification_message: string;
  knowledge: string;
  modes: ModeItem[];
  allowed_actions: string[];
  allowed_fields: string[];
  handoff_message: string;
  handoff_queue: string;
  history_limit: number;
};

const AVAILABLE_ACTIONS = [
  { id: "create_deal", label: "Criar deal" },
  { id: "add_tag", label: "Adicionar tag" },
  { id: "create_activity", label: "Criar atividade" },
  { id: "search_products", label: "Buscar produtos" },
  { id: "move_stage", label: "Mover estágio" },
  { id: "send_whatsapp_template", label: "Enviar template WhatsApp" },
];

function defaultConfig(): SimpleConfigForm {
  return {
    tone: "",
    rules: "",
    context_fields: { contact: ["name", "phone", "email"], deal: ["title", "stage.name"] },
    confirmation_message: "",
    on_deal_not_found: "handoff",
    identification_message: "",
    knowledge: "",
    modes: [],
    allowed_actions: [],
    allowed_fields: [],
    handoff_message: "",
    handoff_queue: "",
    history_limit: 10,
  };
}

function asStringList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : fallback;
}

function normalizeConfig(raw: Record<string, unknown> | null | undefined): SimpleConfigForm {
  if (!raw) return defaultConfig();
  const base = defaultConfig();
  const r = raw as Record<string, unknown>;
  const contextFields =
    r.context_fields && typeof r.context_fields === "object"
      ? (r.context_fields as { contact?: unknown; deal?: unknown })
      : null;
  return {
    tone: typeof r.tone === "string" ? r.tone : base.tone,
    rules: typeof r.rules === "string" ? r.rules : base.rules,
    context_fields: {
      contact: asStringList(contextFields?.contact, base.context_fields.contact),
      deal: asStringList(contextFields?.deal, base.context_fields.deal),
    },
    confirmation_message: typeof r.confirmation_message === "string" ? r.confirmation_message : base.confirmation_message,
    on_deal_not_found:
      r.on_deal_not_found === "ask_identification" ? "ask_identification" : "handoff",
    identification_message: typeof r.identification_message === "string" ? r.identification_message : base.identification_message,
    knowledge: typeof r.knowledge === "string" ? r.knowledge : base.knowledge,
    modes: Array.isArray(r.modes)
      ? r.modes
          .map((m) => ({
            id: typeof (m as ModeItem).id === "string" ? (m as ModeItem).id : "",
            when: typeof (m as ModeItem).when === "string" ? (m as ModeItem).when : "",
            instructions: typeof (m as ModeItem).instructions === "string" ? (m as ModeItem).instructions : "",
          }))
          .filter((m) => m.id)
      : base.modes,
    allowed_actions: Array.isArray(r.allowed_actions)
      ? (r.allowed_actions as unknown[]).filter((v): v is string => typeof v === "string")
      : base.allowed_actions,
    allowed_fields: Array.isArray(r.allowed_fields)
      ? (r.allowed_fields as unknown[]).filter((v): v is string => typeof v === "string")
      : base.allowed_fields,
    handoff_message: typeof r.handoff_message === "string" ? r.handoff_message : base.handoff_message,
    handoff_queue: typeof r.handoff_queue === "string" ? r.handoff_queue : base.handoff_queue,
    history_limit: typeof r.history_limit === "number" ? Math.min(Math.max(r.history_limit, 1), 50) : base.history_limit,
  };
}

function toPayload(form: SimpleConfigForm): Record<string, unknown> {
  return {
    tone: form.tone,
    rules: form.rules,
    context_fields: form.context_fields,
    confirmation_message: form.confirmation_message,
    on_deal_not_found: form.on_deal_not_found,
    identification_message: form.identification_message,
    knowledge: form.knowledge,
    modes: form.modes,
    allowed_actions: form.allowed_actions,
    allowed_fields: form.allowed_fields,
    handoff_message: form.handoff_message,
    handoff_queue: form.handoff_queue,
    history_limit: form.history_limit,
  };
}

async function fetchAgent(id: string): Promise<AgentDetail> {
  const res = await apiFetch(`/api/ai-agents/${id}`);
  return parseApiResponse<AgentDetail>(res, "Erro ao carregar agente.");
}

async function updateAgent(payload: {
  id: string;
  simpleConfig: Record<string, unknown>;
  active: boolean;
}): Promise<AgentDetail> {
  const res = await apiFetch(`/api/ai-agents/${payload.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      engine: "simple",
      simpleConfig: payload.simpleConfig,
      active: payload.active,
    }),
  });
  return parseApiResponse<AgentDetail>(res, "Erro ao salvar agente.");
}

export default function AIAgentV2EditClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [tab, setTab] = React.useState(searchParams.get("tab") || "edit");

  const agentId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : null;

  const { data: agent, isLoading } = useQuery({
    queryKey: ["ai-agent-v2", agentId],
    queryFn: () => fetchAgent(agentId!),
    enabled: !!agentId,
  });

  const updateMutation = useMutation({
    mutationFn: updateAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-v2", agentId] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents-v2"] });
    },
  });

  if (!agentId) return null;

  return (
    <AppV2PageShell
      title={agent?.name ?? "Agente v2"}
      icon={<IconBrain size={22} />}
      backHref="/ai-agents-v2"
      backLabel="Agentes v2"
    >
      {isLoading || !agent ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList>
            <TabsTrigger value="edit">Configuração</TabsTrigger>
            <TabsTrigger value="test">Testar</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="min-w-0">
            <EditTab
              agent={agent}
              onSave={(form, active) =>
                updateMutation.mutate({
                  id: agentId,
                  simpleConfig: toPayload(form),
                  active,
                })
              }
              savePending={updateMutation.isPending}
              saveError={
                updateMutation.error instanceof ApiError
                  ? updateMutation.error.message
                  : updateMutation.error?.message ?? null
              }
            />
          </TabsContent>
          <TabsContent value="test" className="min-w-0">
            <TestTab agentId={agentId} />
          </TabsContent>
          <TabsContent value="logs" className="min-w-0">
            <LogsTab agentId={agentId} />
          </TabsContent>
        </Tabs>
      )}
    </AppV2PageShell>
  );
}

function EditTab({
  agent,
  onSave,
  savePending,
  saveError,
}: {
  agent: AgentDetail;
  onSave: (form: SimpleConfigForm, active: boolean) => void;
  savePending: boolean;
  saveError: string | null;
}) {
  const [form, setForm] = React.useState<SimpleConfigForm>(() =>
    normalizeConfig(agent.simpleConfig),
  );
  const [active, setActive] = React.useState(agent.active);

  React.useEffect(() => {
    setForm(normalizeConfig(agent.simpleConfig));
    setActive(agent.active);
  }, [agent.simpleConfig, agent.active]);

  const update = <K extends keyof SimpleConfigForm>(
    key: K,
    value: SimpleConfigForm[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const addMode = () =>
    setForm((f) => ({
      ...f,
      modes: [...f.modes, { id: "", when: "", instructions: "" }],
    }));

  const removeMode = (idx: number) =>
    setForm((f) => ({ ...f, modes: f.modes.filter((_, i) => i !== idx) }));

  const updateMode = (idx: number, patch: Partial<ModeItem>) =>
    setForm((f) => ({
      ...f,
      modes: f.modes.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));

  const toggleAction = (id: string) =>
    setForm((f) => ({
      ...f,
      allowed_actions: f.allowed_actions.includes(id)
        ? f.allowed_actions.filter((a) => a !== id)
        : [...f.allowed_actions, id],
    }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form, active);
      }}
      className="min-w-0 space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidade e regras</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="tone">Tom de voz</Label>
            <Input
              id="tone"
              value={form.tone}
              onChange={(e) => update("tone", e.target.value)}
              placeholder="Ex: simpática, paciente e natural no WhatsApp"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="rules">Regras de comportamento</Label>
            <Textarea
              id="rules"
              rows={4}
              value={form.rules}
              onChange={(e) => update("rules", e.target.value)}
              placeholder="Uma regra por linha..."
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="knowledge">Base de conhecimento</Label>
            <Textarea
              id="knowledge"
              rows={5}
              value={form.knowledge}
              onChange={(e) => update("knowledge", e.target.value)}
              placeholder="FAQ, textos, procedimentos..."
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="active"
              checked={active}
              onCheckedChange={setActive}
            />
            <Label htmlFor="active" className="cursor-pointer">
              Ativo
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagens</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="confirmation_message">Mensagem de confirmação</Label>
            <Textarea
              id="confirmation_message"
              rows={2}
              value={form.confirmation_message}
              onChange={(e) => update("confirmation_message", e.target.value)}
              placeholder="Aceita {{contact.name}} e {{deal.title}}"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="on_deal_not_found">Se não achar deal</Label>
              <Select
                value={form.on_deal_not_found}
                onValueChange={(v) =>
                  update("on_deal_not_found", v as "ask_identification" | "handoff")
                }
              >
                <SelectTrigger id="on_deal_not_found">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ask_identification">Pedir identificação</SelectItem>
                  <SelectItem value="handoff">Handoff imediato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="identification_message">Mensagem de identificação</Label>
              <Input
                id="identification_message"
                value={form.identification_message}
                onChange={(e) => update("identification_message", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="handoff_message">Mensagem de handoff</Label>
            <Input
              id="handoff_message"
              value={form.handoff_message}
              onChange={(e) => update("handoff_message", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="handoff_queue">Fila de handoff (opcional)</Label>
            <Input
              id="handoff_queue"
              value={form.handoff_queue}
              onChange={(e) => update("handoff_queue", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos do CRM</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ctx-contact">Campos do contato (vírgula)</Label>
            <Input
              id="ctx-contact"
              value={form.context_fields.contact.join(", ")}
              onChange={(e) =>
                update("context_fields", {
                  ...form.context_fields,
                  contact: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ctx-deal">Campos do deal (vírgula)</Label>
            <Input
              id="ctx-deal"
              value={form.context_fields.deal.join(", ")}
              onChange={(e) =>
                update("context_fields", {
                  ...form.context_fields,
                  deal: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="history_limit">Limite de histórico</Label>
            <Input
              id="history_limit"
              type="number"
              min={1}
              max={50}
              value={form.history_limit}
              onChange={(e) => update("history_limit", Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.modes.map((mode, idx) => (
            <div
              key={idx}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Input
                placeholder="ID do modo"
                value={mode.id}
                onChange={(e) => updateMode(idx, { id: e.target.value })}
              />
              <Input
                placeholder="Quando usar (palavras-chave)"
                value={mode.when}
                onChange={(e) => updateMode(idx, { when: e.target.value })}
              />
              <div className="flex items-start gap-2 sm:col-span-2">
                <Textarea
                  placeholder="Instruções específicas deste modo"
                  value={mode.instructions}
                  onChange={(e) =>
                    updateMode(idx, { instructions: e.target.value })
                  }
                  className="min-h-[80px] flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMode(idx)}
                >
                  <IconTrash className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addMode}>
            <IconPlus className="mr-1 size-4" /> Adicionar modo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ferramentas permitidas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AVAILABLE_ACTIONS.map((action) => (
            <label
              key={action.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={form.allowed_actions.includes(action.id)}
                onChange={() => toggleAction(action.id)}
              />
              <span className="text-sm">{action.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      {saveError && (
        <p className="text-sm text-destructive">{saveError}</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={savePending}>
          {savePending ? "Salvando..." : "Salvar configuração"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/ai-agents-v2">Voltar</a>
        </Button>
      </div>
    </form>
  );
}

function TestTab({ agentId }: { agentId: string }) {
  const [history, setHistory] = React.useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = React.useState("");
  const [stage, setStage] = React.useState("active");
  const [loading, setLoading] = React.useState(false);
  const [lastRaw, setLastRaw] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    setInput("");
    const newHistory = [...history, { role: "user" as const, content: text }];
    setHistory(newHistory);
    try {
      const res = await apiFetch("/api/ai-simple/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          userMessage: text,
          history,
          stage,
        }),
      });
      const data = await parseApiResponse<{
        ok: boolean;
        output?: Record<string, unknown>;
        raw?: string;
        error?: string;
        inputTokens: number;
        outputTokens: number;
      }>(res, "Erro no teste do agente.");
      setLastRaw(data);
      const reply =
        typeof data.output?.reply === "string"
          ? data.output.reply
          : data.error
            ? `[erro: ${data.error}]`
            : "(sem resposta)";
      setHistory([...newHistory, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="flex h-[600px] flex-col">
        <CardHeader className="border-b">
          <CardTitle className="text-base flex items-center gap-2">
            Chat de teste
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="ml-auto w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">new</SelectItem>
                <SelectItem value="awaiting_identification">awaiting_identification</SelectItem>
                <SelectItem value="awaiting_confirmation">awaiting_confirmation</SelectItem>
                <SelectItem value="active">active</SelectItem>
              </SelectContent>
            </Select>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Envie uma mensagem para ver como o agente responde. Nenhuma
                mensagem real será enviada pelo WhatsApp.
              </p>
            )}
            {history.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-muted",
                )}
              >
                {m.content}
              </div>
            ))}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite uma mensagem..."
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={send} disabled={loading || !input.trim()}>
              <IconSend className="size-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              setHistory([]);
              setLastRaw(null);
              setError(null);
            }}
          >
            <IconRefresh className="mr-1 size-3.5" /> Limpar chat
          </Button>
        </CardContent>
      </Card>

      <Card className="h-[600px]">
        <CardHeader>
          <CardTitle className="text-base">Resposta JSON</CardTitle>
        </CardHeader>
        <CardContent className="h-[calc(100%-4rem)] overflow-auto">
          {lastRaw ? (
            <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(lastRaw, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              O JSON devolvido pelo LLM aparece aqui após o primeiro teste.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type LogRow = {
  id: string;
  createdAt: string;
  inboundText: string;
  reply: string | null;
  handoff: boolean;
  error: string | null;
  llmOutput: Record<string, unknown> | null;
  discardedActions: unknown;
  executedActions: unknown;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
};

async function fetchLogs(agentId: string): Promise<LogRow[]> {
  const res = await apiFetch(`/api/ai-simple/logs?agentId=${encodeURIComponent(agentId)}&take=50`);
  const data = await parseApiResponse<{ logs: LogRow[] }>(res, "Erro ao carregar logs.");
  return data.logs;
}

function LogsTab({ agentId }: { agentId: string }) {
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["ai-simple-logs", agentId],
    queryFn: () => fetchLogs(agentId),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Logs de turno</CardTitle>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <IconRefresh className="mr-1 size-3.5" /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="max-h-[600px] overflow-auto">
        {isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum log para este agente.</p>
        ) : (
          <div className="space-y-4">
            {data.map((log) => (
              <div key={log.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(log.createdAt).toLocaleString("pt-BR")}</span>
                  {log.handoff && <Badge variant="destructive">handoff</Badge>}
                  {log.error && <Badge variant="outline">erro</Badge>}
                  <span className="ml-auto">
                    {log.inputTokens}/{log.outputTokens} tokens
                    {log.latencyMs ? ` · ${log.latencyMs}ms` : ""}
                  </span>
                </div>
                <p className="mb-1 font-medium">Entrada:</p>
                <p className="mb-2 whitespace-pre-wrap text-muted-foreground">{log.inboundText}</p>
                {log.reply && (
                  <>
                    <p className="mb-1 font-medium">Resposta:</p>
                    <p className="mb-2 whitespace-pre-wrap">{log.reply}</p>
                  </>
                )}
                {log.llmOutput && (
                  <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
                    {JSON.stringify(log.llmOutput, null, 2)}
                  </pre>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {!!log.executedActions &&
                    JSON.stringify(log.executedActions) !== "[]" && (
                    <div>
                      <p className="text-xs font-medium">Executadas</p>
                      <pre className="rounded-md bg-muted p-2 text-xs">
                        {JSON.stringify(log.executedActions, null, 2)}
                      </pre>
                    </div>
                  )}
                  {!!log.discardedActions &&
                    JSON.stringify(log.discardedActions) !== "[]" && (
                    <div>
                      <p className="text-xs font-medium">Descartadas</p>
                      <pre className="rounded-md bg-muted p-2 text-xs">
                        {JSON.stringify(log.discardedActions, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
