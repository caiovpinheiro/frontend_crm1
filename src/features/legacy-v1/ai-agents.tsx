"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { IconAlertTriangle as AlertTriangle, IconRobot as Bot, IconAlertCircle as CircleAlert, IconLoader2 as Loader2, IconPencil as Pencil, IconPlayerPlay as Play, IconPlus as Plus, IconPower as Power, IconAdjustments as Settings2, IconTrash as Trash2 } from "@tabler/icons-react";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, pageHeaderPrimaryCtaClass } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentPlayground } from "@/components/ai-agents/agent-playground";
import { AgentWizard } from "@/components/ai-agents/agent-wizard";
import { KnowledgePanel } from "@/components/ai-agents/knowledge-panel";
import {
  PilotingPanel,
  createDefaultPiloting,
  type PilotingValue,
} from "@/components/ai-agents/piloting-panel";
import { ProductPolicyPanel } from "@/components/ai-agents/product-policy-panel";
import { StudentDataPanel } from "@/components/ai-agents/student-data-panel";
import { UsagePanel } from "@/components/ai-agents/usage-panel";
import {
  normalizeBusinessHours,
  normalizeOutputStyle,
  normalizeQualificationQuestions,
  type HandoffMode,
} from "@/lib/ai-agents/piloting";
import { ARCHETYPES } from "@/lib/ai-agents/archetypes";
import { TOOLS_CATALOG } from "@/lib/ai-agents/tools-catalog";
import { cn, getInitials } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

type AgentRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  archetype: "SDR" | "ATENDIMENTO" | "VENDEDOR" | "SUPORTE";
  model: string;
  autonomyMode: "AUTONOMOUS" | "DRAFT";
  enabledTools: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  knowledgeDocsCount: number;
};

async function fetchAgents(): Promise<AgentRow[]> {
  const res = await fetch(apiUrl("/api/ai-agents"));
  if (!res.ok) throw new Error("Erro ao carregar agentes.");
  return res.json();
}

type AiStatus = {
  configured: boolean;
  source?: "database" | "env" | "none";
  preview?: string | null;
};

async function fetchAiStatus(): Promise<AiStatus> {
  const res = await fetch(apiUrl("/api/settings/ai"));
  if (!res.ok) return { configured: false };
  return (await res.json()) as AiStatus;
}

const ARCHETYPE_MAP = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a])) as Record<
  string,
  (typeof ARCHETYPES)[number]
>;

const AUTONOMY_LABEL: Record<AgentRow["autonomyMode"], string> = {
  AUTONOMOUS: "Autônomo",
  DRAFT: "Rascunho",
};

export default function AIAgentsPage({
  embedded = false,
}: {
  /** Quando true, omite o `PageHeader` legado (título/descrição já vêm do shell v2). */
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = React.useState(false);
  const { confirm, dialog } = useConfirm();

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["ai-agents"],
    queryFn: fetchAgents,
  });

  const { data: aiStatus } = useQuery({
    queryKey: ["ai-settings-status"],
    queryFn: fetchAiStatus,
    staleTime: 30_000,
  });
  const aiDisabled = aiStatus ? !aiStatus.configured : false;

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/ai-agents/${id}/toggle-active`), {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erro ao alternar status.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(apiUrl(`/api/ai-agents/${id}`), { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
    },
  });

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Excluir agente "${name}"?`,
      description: "Atenção: essa ação é definitiva.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(id);
  };

  const newAgentButton = (
    <Button
      onClick={() => setCreating(true)}
      className={cn("w-full gap-2 sm:w-auto", pageHeaderPrimaryCtaClass)}
      disabled={aiDisabled}
      title={aiDisabled ? "IA desativada — configure a chave da OpenAI" : undefined}
    >
      <Plus className="size-4" /> Novo agente
    </Button>
  );

  return (
    <div className="w-full min-w-0 space-y-6">
      {embedded ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {newAgentButton}
        </div>
      ) : (
        <PageHeader
          title="Agentes IA"
          description="Operadores virtuais que atendem leads, qualificam oportunidades e escalam pra humanos quando necessário."
          icon={<Bot />}
          className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          actions={newAgentButton}
        />
      )}

      {aiDisabled ? (
        <div className="rounded-xl border border-[var(--color-warning)]/70 bg-[var(--color-amber-soft)]/60 p-4 text-sm text-[var(--color-amber-text)] dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-[var(--color-amber-muted)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1 break-words">
              <p className="font-semibold">IA desativada — configure a chave da OpenAI</p>
              <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">
                Nenhuma chave configurada. Os agentes de IA e o playground
                ficam indisponíveis até que um administrador cadastre a
                credencial em Configurações → IA.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/settings/ai">
                  <Button size="sm" className="gap-2">
                    <Settings2 className="size-3.5" />
                    Configurar agora
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--color-warning)]/60 bg-[var(--color-amber-soft)]/40 p-4 text-sm text-[var(--color-amber-text)] dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-[var(--color-amber-muted)]">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1 break-words">
              <p className="font-medium">Playground e RAG ativos — Inbox nas próximas fases</p>
              <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">
                Crie, configure, alimente com documentos e teste agentes pelo
                botão <Play className="inline size-3.5 -translate-y-0.5" />{" "}
                Testar. O acoplamento automático ao WhatsApp (modo autônomo e
                rascunho com aprovação humana) chega na próxima fase.
              </p>
            </div>
          </div>
        </div>
      )}

      <StudentDataPanel />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => {
            const arch = ARCHETYPE_MAP[a.archetype];
            return (
              <div
                key={a.id}
                className={cn(
                  "group relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
                  !a.active && "opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="size-11">
                    <AvatarImage src={a.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-[var(--color-indigo-soft)] text-[var(--color-purple-text)] dark:bg-indigo-950 dark:text-indigo-200">
                      {getInitials(a.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{a.name}</h3>
                      {a.active ? (
                        <Badge
                          variant="secondary"
                          className="bg-[var(--color-success-subtle)] text-emerald-700 hover:bg-[var(--color-success-subtle)] dark:bg-emerald-950 dark:text-emerald-200"
                        >
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline">Desligado</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {arch?.label ?? a.archetype}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <div>
                    <div className="font-medium text-foreground/80">Modo</div>
                    <div className="mt-0.5 normal-case">
                      {AUTONOMY_LABEL[a.autonomyMode]}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground/80">Modelo</div>
                    <div className="mt-0.5 truncate normal-case">{a.model}</div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground/80">Conhec.</div>
                    <div className="mt-0.5 normal-case">
                      {a.knowledgeDocsCount} docs
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="flex flex-wrap gap-1">
                    {a.enabledTools.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                    {a.enabledTools.length > 3 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        +{a.enabledTools.length - 3}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-[var(--color-brand-primary)] hover:text-[var(--color-purple-text)] dark:text-[var(--color-brand-primary)]"
                      title={
                        aiDisabled
                          ? "IA desativada — configure a chave da OpenAI em Configurações → IA"
                          : "Testar no playground"
                      }
                      onClick={() => setTesting({ id: a.id, name: a.name })}
                      disabled={aiDisabled}
                    >
                      <Play className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title={a.active ? "Desligar" : "Ligar"}
                      onClick={() => toggleMutation.mutate(a.id)}
                      disabled={toggleMutation.isPending}
                    >
                      <Power className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      title="Editar"
                      onClick={() => setEditingId(a.id)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive/70 hover:text-destructive"
                      title="Excluir"
                      onClick={() => handleDelete(a.id, a.name)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AgentWizard
        open={creating}
        onOpenChange={(v) => setCreating(v)}
        onCreated={() => {
          setCreating(false);
          queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
        }}
      />

      <AgentPlayground
        agentId={testing?.id ?? null}
        agentName={testing?.name ?? ""}
        open={testing !== null}
        onOpenChange={(v) => {
          if (!v) setTesting(null);
        }}
      />

      <QuickEditDialog
        id={editingId}
        onOpenChange={(v) => {
          if (!v) setEditingId(null);
        }}
        onSaved={() => {
          setEditingId(null);
          queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
        }}
      />
      {dialog}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 py-16 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-[var(--color-indigo-soft)] text-[var(--color-brand-primary)] dark:bg-indigo-950 dark:text-[var(--color-brand-primary)]">
        <Bot className="size-8" />
      </div>
      <h3 className="mt-4 text-base font-semibold">Nenhum agente IA ainda</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Crie seu primeiro operador virtual. Ele pode qualificar leads no WhatsApp,
        atender dúvidas simples ou ajudar o time em tarefas repetitivas.
      </p>
      <Button onClick={onCreate} variant="outline" className="mt-4 gap-2">
        <Plus className="size-4" /> Criar primeiro agente
      </Button>
    </div>
  );
}

function QuickEditDialog({
  id,
  onOpenChange,
  onSaved,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const open = id !== null;
  const { data, isLoading } = useQuery({
    queryKey: ["ai-agent", id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/ai-agents/${id}`));
      if (!res.ok) throw new Error("Erro ao carregar agente.");
      return res.json();
    },
    enabled: open,
  });
  const [name, setName] = React.useState("");
  const [autonomyMode, setAutonomyMode] = React.useState<
    "AUTONOMOUS" | "DRAFT"
  >("DRAFT");
  const [tone, setTone] = React.useState("");
  const [model, setModel] = React.useState("gpt-4o-mini");
  const [temperature, setTemperature] = React.useState(0.7);
  const [dailyTokenCap, setDailyTokenCap] = React.useState(0);
  const [enabledTools, setEnabledTools] = React.useState<string[]>([]);
  const [override, setOverride] = React.useState("");
  const [productPolicy, setProductPolicy] = React.useState("");
  const [piloting, setPiloting] = React.useState<PilotingValue>(
    createDefaultPiloting,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (data) {
      setName(data.user?.name ?? "");
      setAutonomyMode(data.autonomyMode ?? "DRAFT");
      setTone(data.tone ?? "");
      setModel(data.model ?? "gpt-4o-mini");
      setTemperature(typeof data.temperature === "number" ? data.temperature : 0.7);
      setDailyTokenCap(
        typeof data.dailyTokenCap === "number" ? data.dailyTokenCap : 0,
      );
      setEnabledTools(Array.isArray(data.enabledTools) ? data.enabledTools : []);
      setOverride(data.systemPromptOverride ?? "");
      setProductPolicy(data.productPolicy ?? "");

      const bh = normalizeBusinessHours(data.businessHours) ?? {
        enabled: false,
        timezone: "America/Sao_Paulo",
        weekdays: [],
        offHoursMessage: "",
      };
      const handoffMode: HandoffMode =
        data.inactivityHandoffMode === "SPECIFIC_USER" ||
        data.inactivityHandoffMode === "UNASSIGN"
          ? data.inactivityHandoffMode
          : "KEEP_OWNER";
      setPiloting({
        openingMessage:
          typeof data.openingMessage === "string" ? data.openingMessage : "",
        openingDelayMs:
          typeof data.openingDelayMs === "number" ? data.openingDelayMs : 0,
        inactivityTimerMs:
          typeof data.inactivityTimerMs === "number"
            ? data.inactivityTimerMs
            : 0,
        inactivityHandoffMode: handoffMode,
        inactivityHandoffUserId:
          typeof data.inactivityHandoffUserId === "string"
            ? data.inactivityHandoffUserId
            : null,
        inactivityFarewellMessage:
          typeof data.inactivityFarewellMessage === "string"
            ? data.inactivityFarewellMessage
            : "",
        keywordHandoffs: Array.isArray(data.keywordHandoffs)
          ? data.keywordHandoffs.filter(
              (v: unknown): v is string => typeof v === "string",
            )
          : [],
        qualificationQuestions: normalizeQualificationQuestions(
          data.qualificationQuestions,
        ),
        businessHours: bh,
        outputStyle: normalizeOutputStyle(data.outputStyle),
        simulateTyping:
          typeof data.simulateTyping === "boolean" ? data.simulateTyping : true,
        typingPerCharMs:
          typeof data.typingPerCharMs === "number" && data.typingPerCharMs >= 0
            ? data.typingPerCharMs
            : 25,
        markMessagesRead:
          typeof data.markMessagesRead === "boolean"
            ? data.markMessagesRead
            : true,
      });
    }
  }, [data]);

  const toggleTool = (toolId: string) => {
    setEnabledTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/ai-agents/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          autonomyMode,
          tone: tone.trim() || undefined,
          model,
          temperature,
          dailyTokenCap,
          enabledTools,
          systemPromptOverride: override.trim() || null,
          productPolicy: productPolicy.trim() || null,

          openingMessage: piloting.openingMessage.trim() || null,
          openingDelayMs: piloting.openingDelayMs,
          inactivityTimerMs: piloting.inactivityTimerMs,
          inactivityHandoffMode: piloting.inactivityHandoffMode,
          inactivityHandoffUserId: piloting.inactivityHandoffUserId,
          inactivityFarewellMessage:
            piloting.inactivityFarewellMessage.trim() || null,
          keywordHandoffs: piloting.keywordHandoffs,
          qualificationQuestions: piloting.qualificationQuestions,
          businessHours: piloting.businessHours.enabled
            ? piloting.businessHours
            : { ...piloting.businessHours, enabled: false },
          outputStyle: piloting.outputStyle,
          simulateTyping: piloting.simulateTyping,
          typingPerCharMs: piloting.typingPerCharMs,
          markMessagesRead: piloting.markMessagesRead,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? "Erro ao salvar.");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogClose />
        <DialogHeader>
          <DialogTitle>Editar agente</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ed-name">Nome</Label>
                <Input
                  id="ed-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ed-tone">Tom de voz</Label>
                <Input
                  id="ed-tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ed-model">Modelo</Label>
                <SelectNative
                  id="ed-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="rounded-xl text-sm"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                </SelectNative>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ed-temp" className="flex items-center justify-between">
                  <span>Temperatura</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {temperature.toFixed(1)}
                  </span>
                </Label>
                <input
                  id="ed-temp"
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="ed-cap">
                  Limite diário de tokens (0 = sem limite)
                </Label>
                <Input
                  id="ed-cap"
                  type="number"
                  min={0}
                  step={1000}
                  value={dailyTokenCap}
                  onChange={(e) => setDailyTokenCap(parseInt(e.target.value) || 0)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Quando o agente ultrapassa esse limite no dia, ele para de
                  responder até o próximo dia ou até o limite ser aumentado.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Modo</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAutonomyMode("DRAFT")}
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm transition-colors",
                    autonomyMode === "DRAFT"
                      ? "border-indigo-500 bg-[var(--color-indigo-soft)] dark:border-indigo-400 dark:bg-indigo-950/30"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="font-medium">Rascunho</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    Sugere respostas ao operador humano antes de enviar.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAutonomyMode("AUTONOMOUS")}
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm transition-colors",
                    autonomyMode === "AUTONOMOUS"
                      ? "border-indigo-500 bg-[var(--color-indigo-soft)] dark:border-indigo-400 dark:bg-indigo-950/30"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="font-medium">Autônomo</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    Envia direto pro lead sem supervisão.
                  </div>
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Ferramentas habilitadas</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {TOOLS_CATALOG.map((t) => {
                  const active = enabledTools.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTool(t.id)}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-2 text-left text-[13px] transition-colors",
                        active
                          ? "border-indigo-500 bg-[var(--color-indigo-soft)] dark:border-indigo-400 dark:bg-indigo-950/30"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                          active
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "border-border",
                        )}
                      >
                        {active && <span className="text-[10px]">✓</span>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{t.label}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {t.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ed-override">Instruções adicionais (opcional)</Label>
              <Textarea
                id="ed-override"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                rows={5}
                placeholder="Regras específicas do seu negócio. Será somado ao prompt do arquétipo."
                className="resize-none rounded-xl text-sm"
              />
            </div>

            <ProductPolicyPanel
              value={productPolicy}
              onChange={setProductPolicy}
              enabled={enabledTools.includes("search_products")}
            />

            <PilotingPanel value={piloting} onChange={setPiloting} />

            {id && (
              <div className="rounded-xl border bg-muted/20 p-4">
                <KnowledgePanel agentId={id} />
              </div>
            )}

            {id && (
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-3">
                  <h4 className="text-sm font-semibold">Uso e custo</h4>
                  <p className="text-xs text-muted-foreground">
                    Tokens consumidos, custo estimado e últimos runs do agente.
                  </p>
                </div>
                <UsagePanel agentId={id} />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
