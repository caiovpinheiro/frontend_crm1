"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { type PilotingValue } from "@/components/ai-agents/piloting-panel";
import { ButtonGlass } from "@/components/crm/button-glass";
import {
  formDialogCancelClass,
  formDialogPrimaryClass,
} from "@/components/ui/form-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ARCHETYPES } from "@/lib/ai-agents/archetypes";
import {
  normalizeAutoClosePolicy,
  normalizeBusinessHours,
  normalizeOutputStyle,
  normalizeQualificationQuestions,
  type HandoffMode,
} from "@/lib/ai-agents/piloting";
import {
  defaultInboxPolicy,
  normalizeAttendanceScope,
  normalizeInboxPolicy,
  normalizeToolConfig,
} from "@/lib/ai-agents/steering";

import { IdentitySection } from "./sections/identity-section";
import {
  InboxSection,
  KnowledgeSection,
} from "./sections/placeholder-section";
import { PilotingSection } from "./sections/piloting-section";
import { RulesSection } from "./sections/rules-section";
import { ScopeSection } from "./sections/scope-section";
import { ToolsSection } from "./sections/tools-section";
import { SidebarNav } from "./sidebar-nav";
import {
  SimpleEditor,
  applySimpleSaveDefaults,
} from "./simple-editor";
import {
  EMPTY_AGENT_SETTINGS,
  PREVIEW_AGENT_SETTINGS,
  isPreviewAgentId,
  type AgentArchetype,
  type AgentSectionId,
  type AgentSettingsValues,
  type AutonomyMode,
} from "./types";

const ARCHETYPE_MAP = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a])) as Record<
  string,
  (typeof ARCHETYPES)[number]
>;

function hydrateFromApi(data: Record<string, unknown>): AgentSettingsValues {
  const archetype = (
    data.archetype === "SDR" ||
    data.archetype === "VENDEDOR" ||
    data.archetype === "SUPORTE"
      ? data.archetype
      : "ATENDIMENTO"
  ) as AgentArchetype;

  const inboxPolicy = normalizeInboxPolicy(data.inboxPolicy);
  const user = data.user as { name?: string } | undefined;

  const handoffMode: HandoffMode =
    data.inactivityHandoffMode === "SPECIFIC_USER" ||
    data.inactivityHandoffMode === "UNASSIGN"
      ? data.inactivityHandoffMode
      : "KEEP_OWNER";

  const bh = normalizeBusinessHours(data.businessHours) ?? {
    enabled: false,
    timezone: "America/Sao_Paulo",
    weekdays: [],
    offHoursMessage: "",
  };

  const piloting: PilotingValue = {
    openingMessage:
      typeof data.openingMessage === "string" ? data.openingMessage : "",
    openingDelayMs:
      typeof data.openingDelayMs === "number" ? data.openingDelayMs : 0,
    inactivityTimerMs:
      typeof data.inactivityTimerMs === "number" ? data.inactivityTimerMs : 0,
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
    handoffMessage: inboxPolicy.handoffMessage ?? "",
    retentionHandoffMessage: inboxPolicy.retentionHandoffMessage ?? "",
    outputStyle: normalizeOutputStyle(data.outputStyle),
    simulateTyping:
      typeof data.simulateTyping === "boolean" ? data.simulateTyping : true,
    typingPerCharMs:
      typeof data.typingPerCharMs === "number" && data.typingPerCharMs >= 0
        ? data.typingPerCharMs
        : 25,
    markMessagesRead:
      typeof data.markMessagesRead === "boolean" ? data.markMessagesRead : true,
    autoClosePolicy: normalizeAutoClosePolicy(data.autoClosePolicy),
  };

  return {
    name: user?.name ?? "",
    tone: typeof data.tone === "string" ? data.tone : "",
    model: typeof data.model === "string" ? data.model : "gpt-4o-mini",
    temperature: typeof data.temperature === "number" ? data.temperature : 0.7,
    dailyTokenCap:
      typeof data.dailyTokenCap === "number" ? data.dailyTokenCap : 0,
    autonomyMode:
      data.autonomyMode === "AUTONOMOUS" ? "AUTONOMOUS" : "DRAFT",
    enabledTools: Array.isArray(data.enabledTools)
      ? data.enabledTools.filter((t): t is string => typeof t === "string")
      : [],
    systemPromptOverride:
      typeof data.systemPromptOverride === "string"
        ? data.systemPromptOverride
        : "",
    systemPromptTemplate:
      typeof data.systemPromptTemplate === "string" &&
      data.systemPromptTemplate.trim()
        ? data.systemPromptTemplate
        : (ARCHETYPE_MAP[archetype]?.systemPromptTemplate ?? ""),
    steeringRules:
      typeof data.steeringRules === "string" ? data.steeringRules : "",
    productPolicy:
      typeof data.productPolicy === "string" ? data.productPolicy : "",
    toolConfig: normalizeToolConfig(data.toolConfig),
    attendanceScope: normalizeAttendanceScope(inboxPolicy.scope),
    inboxPolicy,
    piloting,
    archetype,
  };
}

export function AgentSettingsDialog({
  id,
  onOpenChange,
  onSaved,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const open = id !== null;
  const preview = isPreviewAgentId(id);
  const [advanced, setAdvanced] = React.useState(false);
  const [section, setSection] = React.useState<AgentSectionId>("identity");
  const [form, setForm] = React.useState<AgentSettingsValues>(EMPTY_AGENT_SETTINGS);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-agent", id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/ai-agents/${id}`));
      if (!res.ok) throw new Error("Erro ao carregar agente.");
      return res.json() as Promise<Record<string, unknown>>;
    },
    enabled: open && !preview,
  });

  React.useEffect(() => {
    if (open) {
      setSection("identity");
      setAdvanced(false);
    }
  }, [open, id]);

  React.useEffect(() => {
    if (preview) {
      setForm(structuredClone(PREVIEW_AGENT_SETTINGS));
      return;
    }
    if (data) setForm(hydrateFromApi(data));
  }, [preview, data]);

  const patch = <K extends keyof AgentSettingsValues>(
    key: K,
    value: AgentSettingsValues[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleTool = (toolId: string) => {
    setForm((prev) => ({
      ...prev,
      enabledTools: prev.enabledTools.includes(toolId)
        ? prev.enabledTools.filter((t) => t !== toolId)
        : [...prev.enabledTools, toolId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (preview) {
      toast("preview — não salva no banco");
      onSaved();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const inboxPolicy = {
        ...defaultInboxPolicy(),
        ...form.inboxPolicy,
        scope: form.attendanceScope,
        handoffMessage: form.piloting.handoffMessage.trim() || null,
        retentionHandoffMessage:
          form.piloting.retentionHandoffMessage.trim() || null,
      };
      const simple = applySimpleSaveDefaults(form);
      const res = await fetch(apiUrl(`/api/ai-agents/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          autonomyMode: form.autonomyMode,
          tone: form.tone.trim() || undefined,
          model: form.model,
          temperature: form.temperature,
          dailyTokenCap: form.dailyTokenCap,
          enabledTools: form.enabledTools,
          systemPromptOverride: simple.systemPromptOverride.trim() || null,
          systemPromptTemplate: form.systemPromptTemplate.trim() || undefined,
          steeringRules: simple.steeringRules.trim() || null,
          productPolicy: form.productPolicy.trim() || null,
          toolConfig: form.toolConfig,
          inboxPolicy,

          openingMessage: form.piloting.openingMessage.trim() || null,
          openingDelayMs: form.piloting.openingDelayMs,
          inactivityTimerMs: form.piloting.inactivityTimerMs,
          inactivityHandoffMode: form.piloting.inactivityHandoffMode,
          inactivityHandoffUserId: form.piloting.inactivityHandoffUserId,
          inactivityFarewellMessage:
            form.piloting.inactivityFarewellMessage.trim() || null,
          keywordHandoffs: simple.piloting.keywordHandoffs,
          qualificationQuestions: form.piloting.qualificationQuestions,
          businessHours: form.piloting.businessHours.enabled
            ? form.piloting.businessHours
            : { ...form.piloting.businessHours, enabled: false },
          outputStyle: form.piloting.outputStyle,
          simulateTyping: form.piloting.simulateTyping,
          typingPerCharMs: form.piloting.typingPerCharMs,
          markMessagesRead: form.piloting.markMessagesRead,
          autoClosePolicy: {
            mode: form.piloting.autoClosePolicy.mode,
            keywords: form.piloting.autoClosePolicy.keywords,
            message: form.piloting.autoClosePolicy.message?.trim() || null,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          typeof d.message === "string" ? d.message : "Erro ao salvar.",
        );
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      data-agent-settings
      className="flex min-h-[min(70vh,44rem)] flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex size-9 items-center justify-center rounded-[var(--radius-lg)] border border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          aria-label="Voltar à lista"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0">
          <h2 className="truncate font-sans text-base font-semibold text-foreground">
            {form.name.trim() || "Editar agente"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {preview
              ? "Prévia local — não persiste no banco."
              : advanced
                ? "Modo avançado"
                : "Configuração simples"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="ms-auto shrink-0 text-xs font-medium text-primary hover:underline"
        >
          {advanced ? "Voltar ao simples" : "Avançado"}
        </button>
      </header>

      {!preview && (isLoading || !data) ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {advanced && <SidebarNav active={section} onChange={setSection} />}
            <ScrollArea className="min-h-0 flex-1 px-6 py-5 text-sm">
              {!advanced && id && (
                <SimpleEditor
                  agentId={id}
                  preview={preview}
                  form={form}
                  onChange={setForm}
                />
              )}
              {advanced && section === "identity" && (
                <IdentitySection
                  agentId={preview ? null : id}
                  name={form.name}
                  onNameChange={(v) => patch("name", v)}
                  tone={form.tone}
                  onToneChange={(v) => patch("tone", v)}
                  model={form.model}
                  onModelChange={(v) => patch("model", v)}
                  temperature={form.temperature}
                  onTemperatureChange={(v) => patch("temperature", v)}
                  dailyTokenCap={form.dailyTokenCap}
                  onDailyTokenCapChange={(v) => patch("dailyTokenCap", v)}
                  autonomyMode={form.autonomyMode as AutonomyMode}
                  onAutonomyModeChange={(v) => patch("autonomyMode", v)}
                />
              )}
              {advanced && section === "rules" && (
                <RulesSection
                  archetype={form.archetype}
                  steeringRules={form.steeringRules}
                  onSteeringRulesChange={(v) => patch("steeringRules", v)}
                  override={form.systemPromptOverride}
                  onOverrideChange={(v) => patch("systemPromptOverride", v)}
                  template={form.systemPromptTemplate}
                  onTemplateChange={(v) => patch("systemPromptTemplate", v)}
                />
              )}
              {advanced && section === "scope" && (
                <ScopeSection
                  value={form.attendanceScope}
                  onChange={(v) => patch("attendanceScope", v)}
                  preview={preview}
                />
              )}
              {advanced && section === "tools" && (
                <ToolsSection
                  enabledTools={form.enabledTools}
                  onToggleTool={toggleTool}
                  toolConfig={form.toolConfig}
                  onToolConfigChange={(v) => patch("toolConfig", v)}
                  productPolicy={form.productPolicy}
                  onProductPolicyChange={(v) => patch("productPolicy", v)}
                />
              )}
              {advanced && section === "piloting" && (
                <PilotingSection
                  value={form.piloting}
                  onChange={(v) => patch("piloting", v)}
                />
              )}
              {advanced && section === "inbox" && (
                <InboxSection
                  value={form.inboxPolicy}
                  onChange={(v) => patch("inboxPolicy", v)}
                />
              )}
              {advanced && section === "knowledge" && id && (
                <KnowledgeSection agentId={id} preview={preview} />
              )}
            </ScrollArea>
          </div>

          {error && (
            <div className="shrink-0 px-6 pb-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-4 py-3">
            <ButtonGlass
              type="button"
              variant="glass"
              className={formDialogCancelClass}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              type="submit"
              variant="primary"
              className={formDialogPrimaryClass}
              disabled={submitting}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </ButtonGlass>
          </div>
        </form>
      )}
    </div>
  );
}
