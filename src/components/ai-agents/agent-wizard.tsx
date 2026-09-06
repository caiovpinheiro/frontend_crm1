"use client";

import { apiUrl } from "@/lib/api";
/**
 * Wizard de criação de agente IA (6 etapas).
 *
 * Fluxo:
 *  1. Identidade   — nome, avatar, idioma
 *  2. Arquétipo    — SDR / Atendimento / Vendedor / Suporte
 *  3. Personalidade — tom, modelo, temperatura, prompt override (com preview)
 *  4. Ferramentas  — checkboxes agrupados por categoria
 *  5. Conhecimento — placeholder (configurado após a criação, fase 4)
 *  6. Revisão      — resumo + modo de autonomia + botão "Criar"
 *
 * Sai com um POST em /api/ai-agents. Defaults vêm do arquétipo
 * escolhido (tools + prompt + modelo sugerido).
 */

import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import * as React from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import {
  ARCHETYPES,
  type ArchetypeDescriptor,
  type ArchetypeId,
} from "@/lib/ai-agents/archetypes";
import { TOOLS_CATALOG, toolsByCategory } from "@/lib/ai-agents/tools-catalog";
import { cn } from "@/lib/utils";
import { ProductPolicyPanel } from "./product-policy-panel";

type StepId =
  | "identity"
  | "archetype"
  | "personality"
  | "tools"
  | "products"
  | "knowledge"
  | "review";

const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: "identity", label: "Identidade", hint: "Nome e avatar" },
  { id: "archetype", label: "Arquétipo", hint: "Tipo de operador" },
  { id: "personality", label: "Personalidade", hint: "Tom e prompt" },
  { id: "tools", label: "Ferramentas", hint: "O que pode fazer" },
  { id: "products", label: "Produtos", hint: "Política de apresentação" },
  { id: "knowledge", label: "Conhecimento", hint: "Base de documentos" },
  { id: "review", label: "Revisão", hint: "Conferir e criar" },
];

const LANGUAGE_OPTIONS = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
];

const MODEL_OPTIONS = [
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini — recomendado (atendimento)" },
  { value: "gpt-4o-mini", label: "gpt-4o-mini — rápido e barato" },
  { value: "gpt-4o", label: "gpt-4o — mais capaz, mais caro" },
  { value: "gpt-5-mini", label: "gpt-5-mini — família 5 (se sua chave suportar)" },
];

const TONE_PRESETS = [
  "amigável, curioso e objetivo",
  "consultivo, seguro e educado",
  "empático, paciente e profissional",
  "técnico, claro e paciente",
];

type AutonomyMode = "AUTONOMOUS" | "DRAFT";

type AgentWizardProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (agentId: string) => void;
};

export function AgentWizard({
  open,
  onOpenChange,
  onCreated,
}: AgentWizardProps) {
  const [step, setStep] = React.useState<StepId>("identity");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Form state
  const [name, setName] = React.useState("");
  const [language, setLanguage] = React.useState("pt-BR");
  const [archetype, setArchetype] = React.useState<ArchetypeId>("SDR");
  const [tone, setTone] = React.useState(TONE_PRESETS[0]);
  const [model, setModel] = React.useState("gpt-4o-mini");
  const [temperature, setTemperature] = React.useState(0.7);
  const [openaiApiKey, setOpenaiApiKey] = React.useState("");
  const [override, setOverride] = React.useState("");
  const [productPolicy, setProductPolicy] = React.useState("");
  const [enabledTools, setEnabledTools] = React.useState<string[]>([]);
  const [autonomyMode, setAutonomyMode] =
    React.useState<AutonomyMode>("DRAFT");

  const hasProductTool = enabledTools.includes("search_products");

  // Quando muda o arquétipo, puxa defaults (se o usuário ainda não
  // mexeu manualmente em tools/tom/modelo — detectamos isso por um
  // ref que guarda o último arquétipo aplicado).
  const lastAppliedArchetype = React.useRef<ArchetypeId | null>(null);
  React.useEffect(() => {
    if (lastAppliedArchetype.current === archetype) return;
    const a = ARCHETYPES.find((x) => x.id === archetype);
    if (a) {
      setTone(a.defaultTone);
      setModel(a.suggestedModel);
      setEnabledTools(a.defaultTools);
    }
    lastAppliedArchetype.current = archetype;
  }, [archetype]);

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setStep("identity");
      setName("");
      setLanguage("pt-BR");
      setArchetype("SDR");
      setTone(TONE_PRESETS[0]);
      setModel("gpt-4o-mini");
      setTemperature(0.7);
      setOpenaiApiKey("");
      setOverride("");
      setProductPolicy("");
      setEnabledTools([]);
      setAutonomyMode("DRAFT");
      setError(null);
      lastAppliedArchetype.current = null;
    }
  }, [open]);

  const currentIndex = STEPS.findIndex((s) => s.id === step);
  const isLast = step === "review";

  const openaiKeyLooksValid = /^sk-[A-Za-z0-9_-]{10,}$/.test(
    openaiApiKey.trim(),
  );

  const canAdvance = () => {
    if (step === "identity") return name.trim().length > 0;
    if (step === "personality") return openaiKeyLooksValid;
    if (step === "tools") return enabledTools.length > 0;
    return true;
  };

  const goNext = () => {
    const next = STEPS[currentIndex + 1];
    if (next) setStep(next.id);
  };
  const goBack = () => {
    const prev = STEPS[currentIndex - 1];
    if (prev) setStep(prev.id);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/ai-agents"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          archetype,
          tone,
          language,
          model,
          temperature,
          ...(openaiApiKey.trim() ? { openaiApiKey: openaiApiKey.trim() } : {}),
          systemPromptOverride: override.trim() || null,
          productPolicy: productPolicy.trim() || null,
          enabledTools,
          autonomyMode,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? "Erro ao criar agente.");
      }
      const data = await res.json();
      onCreated(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSubmitting(false);
    }
  };

  const archetypeDesc = ARCHETYPES.find((a) => a.id === archetype);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogClose />
        <DialogHeader>
          <DialogTitle>Novo agente IA</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 md:flex-row">
          <StepRail currentStep={step} onJump={setStep} />

          <div className="min-w-0 flex-1 space-y-5">
            {step === "identity" && (
              <IdentityStep
                name={name}
                setName={setName}
                language={language}
                setLanguage={setLanguage}
              />
            )}
            {step === "archetype" && (
              <ArchetypeStep value={archetype} onChange={setArchetype} />
            )}
            {step === "personality" && (
              <PersonalityStep
                name={name || "Agente"}
                language={language}
                archetype={archetypeDesc ?? ARCHETYPES[0]}
                tone={tone}
                setTone={setTone}
                model={model}
                setModel={setModel}
                temperature={temperature}
                setTemperature={setTemperature}
                openaiApiKey={openaiApiKey}
                setOpenaiApiKey={setOpenaiApiKey}
                override={override}
                setOverride={setOverride}
              />
            )}
            {step === "tools" && (
              <ToolsStep
                enabledTools={enabledTools}
                setEnabledTools={setEnabledTools}
              />
            )}
            {step === "products" && (
              <ProductsStep
                value={productPolicy}
                onChange={setProductPolicy}
                enabled={hasProductTool}
              />
            )}
            {step === "knowledge" && <KnowledgeStep />}
            {step === "review" && (
              <ReviewStep
                name={name}
                archetype={archetype}
                language={language}
                tone={tone}
                model={model}
                temperature={temperature}
                enabledTools={enabledTools}
                hasOverride={override.trim().length > 0}
                hasProductPolicy={productPolicy.trim().length > 0}
                hasOpenaiKey={openaiKeyLooksValid}
                autonomyMode={autonomyMode}
                setAutonomyMode={setAutonomyMode}
              />
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-[var(--color-danger-bg)] p-3 text-sm text-[var(--color-danger-text)]">
            {error}
          </div>
        )}

        <DialogFooter className="mt-4 gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <div className="flex flex-1" />
          {currentIndex > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={submitting}
            >
              Voltar
            </Button>
          )}
          {isLast ? (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={
                submitting ||
                !name.trim() ||
                enabledTools.length === 0 ||
                !openaiKeyLooksValid
              }
            >
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Criar agente
            </Button>
          ) : (
            <Button type="button" onClick={goNext} disabled={!canAdvance()}>
              Próximo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepRail({
  currentStep,
  onJump,
}: {
  currentStep: StepId;
  onJump: (s: StepId) => void;
}) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
  return (
    <nav className="md:w-48 md:shrink-0">
      <ol className="flex flex-row gap-2 overflow-x-auto md:flex-col">
        {STEPS.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <li key={s.id} className="md:w-full">
              <button
                type="button"
                onClick={() => {
                  // Só deixa voltar para etapas já vistas
                  if (i <= currentIdx) onJump(s.id);
                }}
                className={cn(
                  "flex min-w-max items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors md:w-full",
                  active
                    ? "border-[var(--brand-primary)] bg-[var(--color-enterprise-bg)] text-[var(--text-primary)]"
                    : done
                      ? "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-primary)]/80"
                      : "border-[var(--glass-border-subtle)] text-[var(--text-muted)]",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                    active
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                      : done
                        ? "border-[var(--color-success)] bg-[var(--color-success)] text-white"
                        : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.label}</div>
                  <div className="hidden truncate text-[10px] font-normal opacity-60 md:block">
                    {s.hint}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function IdentityStep({
  name,
  setName,
  language,
  setLanguage,
}: {
  name: string;
  setName: (v: string) => void;
  language: string;
  setLanguage: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Como o agente vai se chamar?</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          O nome aparece para os leads no WhatsApp e também nos seletores
          internos do CRM.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="w-name">Nome do agente</Label>
        <Input
          id="w-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Júlia (SDR)"
          autoFocus
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="w-lang">Idioma principal</Label>
        <DropdownGlass
          options={LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={language}
          onValueChange={setLanguage}
          triggerClassName="w-full"
        />
      </div>
    </div>
  );
}

function ArchetypeStep({
  value,
  onChange,
}: {
  value: ArchetypeId;
  onChange: (v: ArchetypeId) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Qual será o papel dele?</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Cada arquétipo já vem com prompt, tom e ferramentas recomendadas.
          Você pode ajustar tudo nas próximas etapas.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ARCHETYPES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange(a.id)}
            className={cn(
              "flex flex-col gap-2 rounded-xl border p-4 text-left text-sm transition-colors",
              value === a.id
                ? "border-[var(--brand-primary)] bg-[var(--color-enterprise-bg)]"
                : "border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)]",
            )}
          >
            <div className="font-semibold">{a.label}</div>
            <div className="text-[13px] text-[var(--text-muted)]">
              {a.longDescription}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {a.defaultTools.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-[var(--glass-bg-strong)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonalityStep({
  name,
  language,
  archetype,
  tone,
  setTone,
  model,
  setModel,
  temperature,
  setTemperature,
  openaiApiKey,
  setOpenaiApiKey,
  override,
  setOverride,
}: {
  name: string;
  language: string;
  archetype: ArchetypeDescriptor;
  tone: string;
  setTone: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  temperature: number;
  setTemperature: (v: number) => void;
  openaiApiKey: string;
  setOpenaiApiKey: (v: string) => void;
  override: string;
  setOverride: (v: string) => void;
}) {
  const keyTouched = openaiApiKey.trim().length > 0;
  const keyValid = /^sk-[A-Za-z0-9_-]{10,}$/.test(openaiApiKey.trim());
  // Renderiza o template trocando placeholders por valores atuais.
  const preview = React.useMemo(() => {
    const base = archetype.systemPromptTemplate
      .replaceAll("{{agent_name}}", name || "Agente")
      .replaceAll("{{company_name}}", "{{company_name}}")
      .replaceAll("{{tone}}", tone)
      .replaceAll("{{language}}", language);
    return override.trim() ? `${base}\n\n## Instruções adicionais\n${override}` : base;
  }, [archetype.systemPromptTemplate, name, tone, language, override]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Personalidade e modelo</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Configure o tom, o modelo LLM e eventuais regras específicas do seu
          negócio.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="w-tone">Tom de voz</Label>
          <Input
            id="w-tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="Ex.: amigável, curioso e objetivo"
          />
          <div className="flex flex-wrap gap-1 pt-1">
            {TONE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setTone(p)}
                className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)]"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="w-model">Modelo LLM</Label>
          <DropdownGlass
            options={MODEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={model}
            onValueChange={setModel}
            triggerClassName="w-full"
          />
          <div className="grid gap-1 pt-2">
            <Label htmlFor="w-temp" className="text-xs font-normal">
              Temperatura: {temperature.toFixed(1)}
            </Label>
            <input
              id="w-temp"
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-[var(--brand-primary)]"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
              <span>Previsível</span>
              <span>Criativo</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="w-openai-key">Chave OpenAI do agente</Label>
        <Input
          id="w-openai-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={openaiApiKey}
          onChange={(e) => setOpenaiApiKey(e.target.value)}
          placeholder="sk-…"
          className="font-mono"
        />
        <p className="text-[11px] text-[var(--text-muted)]">
          Cada agente usa a própria conta OpenAI — não há chave global. Sem
          uma chave válida o agente não responde. Fica cifrada no banco.
        </p>
        {keyTouched && !keyValid && (
          <p className="text-[11px] text-[var(--color-danger-text)]">
            Formato inválido. Esperado algo como <code>sk-…</code>.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="w-override">Instruções adicionais (opcional)</Label>
        <Textarea
          id="w-override"
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          rows={4}
          placeholder="Ex.: Nunca mencione nosso concorrente X. Sempre ofereça desconto de 10% pra alunos."
          className="resize-none"
        />
        <p className="text-[11px] text-[var(--text-muted)]">
          Essas instruções são somadas ao prompt do arquétipo no final.
        </p>
      </div>

      <details className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Pré-visualizar prompt completo
        </summary>
        <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--glass-bg-overlay)] p-3 text-[11px] leading-relaxed">
          {preview}
        </pre>
      </details>
    </div>
  );
}

function ToolsStep({
  enabledTools,
  setEnabledTools,
}: {
  enabledTools: string[];
  setEnabledTools: (v: string[]) => void;
}) {
  const grouped = React.useMemo(() => toolsByCategory(), []);
  const toggle = (id: string) => {
    if (enabledTools.includes(id)) {
      setEnabledTools(enabledTools.filter((t) => t !== id));
    } else {
      setEnabledTools([...enabledTools, id]);
    }
  };

  const categoryLabel: Record<string, string> = {
    crm: "CRM",
    whatsapp: "WhatsApp",
    handoff: "Transferência",
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Ferramentas habilitadas</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Defina o que o agente pode fazer. Selecione pelo menos uma ferramenta.
          Recomendamos sempre deixar <strong>transfer_to_human</strong> ativo.
        </p>
      </div>

      {Object.entries(grouped).map(([cat, tools]) => (
        <div key={cat} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {categoryLabel[cat] ?? cat}
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {tools.map((t) => {
              const active = enabledTools.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
                    active
                      ? "border-[var(--brand-primary)] bg-[var(--color-enterprise-bg)]"
                      : "border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)]",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                      active
                        ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                        : "border-[var(--glass-border)]",
                    )}
                  >
                    {active && <span className="text-[10px]">✓</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.label}</div>
                    <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                      {t.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-lg bg-[var(--glass-bg-overlay)] p-3 text-[12px] text-[var(--text-muted)]">
        {enabledTools.length} ferramenta{enabledTools.length === 1 ? "" : "s"}{" "}
        habilitada{enabledTools.length === 1 ? "" : "s"}
        {enabledTools.length === 0 && (
          <span className="ml-1 text-[var(--color-danger-text)]">
            — selecione pelo menos uma para continuar.
          </span>
        )}
      </div>
    </div>
  );
}

function ProductsStep({
  value,
  onChange,
  enabled,
}: {
  value: string;
  onChange: (v: string) => void;
  enabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Como apresentar produtos</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Quando a tool <strong>Consultar catálogo de produtos</strong> está
          ativa, o agente busca direto na base. Aqui você orienta o formato da
          apresentação — quais campos priorizar, tom pra falar de preço, quando
          oferecer handoff, etc.
        </p>
      </div>
      <ProductPolicyPanel value={value} onChange={onChange} enabled={enabled} />
    </div>
  );
}

function KnowledgeStep() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Base de conhecimento</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Documentos que o agente pode consultar antes de responder (catálogo,
          política de descontos, FAQ, etc.).
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-6 text-center">
        <div className="mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-full bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
          📚
        </div>
        <p className="text-sm font-medium">
          Upload de documentos disponível após a criação
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-[var(--text-muted)]">
          Para não atrasar a criação, você sobe os arquivos (PDF, TXT, MD) na
          aba <strong>Conhecimento</strong> da página do agente. A indexação
          acontece em background com pgvector — leva alguns segundos por
          documento.
        </p>
      </div>
    </div>
  );
}

function ReviewStep({
  name,
  archetype,
  language,
  tone,
  model,
  temperature,
  enabledTools,
  hasOverride,
  hasProductPolicy,
  hasOpenaiKey,
  autonomyMode,
  setAutonomyMode,
}: {
  name: string;
  archetype: ArchetypeId;
  language: string;
  tone: string;
  model: string;
  temperature: number;
  enabledTools: string[];
  hasOverride: boolean;
  hasProductPolicy: boolean;
  hasOpenaiKey: boolean;
  autonomyMode: AutonomyMode;
  setAutonomyMode: (v: AutonomyMode) => void;
}) {
  const archDesc = ARCHETYPES.find((a) => a.id === archetype);
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Revisão e modo de operação</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Confira as configurações e escolha como o agente vai trabalhar.
        </p>
      </div>

      <div className="rounded-xl border bg-[var(--glass-bg-overlay)] p-4">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <ReviewField label="Nome" value={name || "—"} />
          <ReviewField label="Arquétipo" value={archDesc?.label ?? archetype} />
          <ReviewField label="Idioma" value={language} />
          <ReviewField label="Tom" value={tone} />
          <ReviewField label="Modelo" value={model} />
          <ReviewField
            label="Temperatura"
            value={temperature.toFixed(1)}
          />
          <ReviewField
            label="Chave OpenAI"
            value={hasOpenaiKey ? "Configurada" : "Faltando"}
          />
          <ReviewField
            label="Instruções extras"
            value={hasOverride ? "Sim" : "Não"}
          />
          <ReviewField
            label="Política de produtos"
            value={
              hasProductPolicy
                ? enabledTools.includes("search_products")
                  ? "Configurada"
                  : "Configurada (tool inativa)"
                : enabledTools.includes("search_products")
                  ? "Padrão"
                  : "N/A"
            }
          />
          <ReviewField
            label="Ferramentas"
            value={`${enabledTools.length} habilitada(s)`}
          />
        </div>
        {enabledTools.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {enabledTools.map((t) => {
              const tool = TOOLS_CATALOG.find((x) => x.id === t);
              return (
                <span
                  key={t}
                  className="rounded-full bg-[var(--glass-bg-overlay)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                >
                  {tool?.label ?? t}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Modo de operação</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAutonomyMode("DRAFT")}
            className={cn(
              "rounded-xl border p-3 text-left text-sm transition-colors",
              autonomyMode === "DRAFT"
                ? "border-[var(--brand-primary)] bg-[var(--color-enterprise-bg)]"
                : "border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)]",
            )}
          >
            <div className="font-medium">Rascunho</div>
            <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
              Gera uma sugestão de resposta. O humano aprova/edita antes de
              enviar. Recomendado pra começar.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setAutonomyMode("AUTONOMOUS")}
            className={cn(
              "rounded-xl border p-3 text-left text-sm transition-colors",
              autonomyMode === "AUTONOMOUS"
                ? "border-[var(--brand-primary)] bg-[var(--color-enterprise-bg)]"
                : "border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)]",
            )}
          >
            <div className="font-medium">Autônomo</div>
            <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
              Envia direto pro lead sem supervisão. Requer testes em
              playground e um <code>dailyTokenCap</code> configurado.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-0.5 text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
