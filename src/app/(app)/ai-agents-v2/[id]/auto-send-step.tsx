"use client";

/**
 * "Começo e fim" › envios automáticos do agente v2:
 * - Retomar mais tarde: o cliente diz "me manda amanhã" e o agente agenda.
 * - Follow-up por etapa: régua de mensagens quando o negócio está numa etapa
 *   e o cliente não responde.
 * - Envios automáticos: horário, teto por dia, modelos da Meta para depois
 *   das 24 h e o que fazer sem modelo.
 * Tudo desligado por padrão: sem configuração, o agente segue como antes.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { IconPlus, IconSparkles, IconTrash } from "@tabler/icons-react";

import { ChipInput } from "@/components/ai-agents/chip-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";
import { apiFetch, parseApiResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SURFACE, Segmented } from "./ui";

export type AutoSendTemplate = { name: string; language?: string; variables?: string[]; purpose?: string };
type Slot = { day: number; start: string; end: string };
type AutoSend = {
  sendWindow?: Slot[];
  maxPerDay?: number;
  templates?: AutoSendTemplate[];
  autoPickTemplates?: boolean;
  noTemplate?: "task" | "handoff" | "skip";
  optOutTerms?: string[];
  optOutDays?: number;
};
type Scheduling = { enabled?: boolean; maxDaysAhead?: number; laterDefaultHours?: number; fallbackMessage?: string; stopOnStageChange?: boolean };
type SeqStep = { after: number; mode?: "fixed" | "generated"; message?: string; templates?: AutoSendTemplate[] };
type OnEnd = { action: "none" | "close" | "handoff" | "move_stage" | "add_tag"; after?: number; stageId?: string; tag?: string; message?: string };
export type FollowUpSequence = {
  id: string;
  name: string;
  enabled?: boolean;
  dealStages: string[];
  steps: SeqStep[];
  stopOnStageChange?: boolean;
  onEnd?: OnEnd;
};

type CatalogsLite = {
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string; isLost?: boolean }> }>;
  tags?: Array<{ id: string; name: string }>;
};

type TemplateRow = { name: string; language: string; label: string; bodyPreview: string; hasVariables: boolean };
type Suggestions = { recommended: string | null; templates: TemplateRow[] };

const SCHEDULE_FALLBACK = "Oi! Combinamos de retomar a nossa conversa agora. Podemos continuar?";
const STEP_FALLBACK = "Oi! Passando para saber se posso te ajudar a continuar. É só me responder por aqui.";
const OPT_OUT_DEFAULT = ["pare de mandar", "não quero mais", "não me mande", "não tenho interesse", "sair da lista", "descadastrar"];
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_SEQUENCES = 10;
const MAX_STEPS = 5;

const UNITS = [
  { value: "min", label: "minutos", factor: 1 },
  { value: "h", label: "horas", factor: 60 },
  { value: "d", label: "dias", factor: 60 * 24 },
] as const;
type Unit = (typeof UNITS)[number]["value"];

function unitOf(minutes: number): Unit {
  if (minutes > 0 && minutes % (60 * 24) === 0) return "d";
  if (minutes > 0 && minutes % 60 === 0) return "h";
  return "min";
}

const newId = () => `regua_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className={cn(SURFACE, "space-y-5 p-5 sm:p-6")}>
      <div className="space-y-1">
        <h3 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h3>
        {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberInput({ value, onChange, min, max, placeholder, className }: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      placeholder={placeholder}
      value={typeof value === "number" ? String(value) : ""}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(e.target.value === "" || !Number.isFinite(n) ? undefined : Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(n))));
      }}
      className={cn("max-w-[140px]", className)}
    />
  );
}

/** Prazo em minutos editado como número + unidade. */
function DurationInput({ minutes, onChange, minMinutes = 10 }: { minutes: number; onChange: (m: number) => void; minMinutes?: number }) {
  const [unit, setUnit] = React.useState<Unit>(unitOf(minutes));
  const factor = UNITS.find((u) => u.value === unit)!.factor;
  const shown = minutes > 0 ? Math.round((minutes / factor) * 100) / 100 : undefined;
  return (
    <div className="flex items-center gap-2">
      <NumberInput
        value={shown}
        min={1}
        onChange={(v) => onChange(Math.max(minMinutes, Math.round((v ?? 0) * factor)))}
        className="max-w-[100px]"
      />
      <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function useTemplateSuggestions(agentId: string, purpose: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ai-agents-v2-template-suggestions", agentId, purpose],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiFetch(`/api/ai-agents-v2/${agentId}/template-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose }),
      });
      return parseApiResponse<Suggestions>(res, "Erro ao listar os modelos.");
    },
  });
}

/**
 * Modelos da Meta (liberados para agente) usados quando o envio cai fora
 * das 24 h. Com vários, o agente escolhe na hora o mais adequado ao envio.
 * "Sugerir" ordena pelo propósito e marca o que o agente escolheria.
 */
function TemplatePicker({ agentId, purpose, value, onChange, emptyHint }: {
  agentId: string;
  purpose: string;
  value: AutoSendTemplate[];
  onChange: (next: AutoSendTemplate[]) => void;
  emptyHint: string;
}) {
  const [asked, setAsked] = React.useState<string | null>(null);
  const list = useTemplateSuggestions(agentId, "", true);
  const suggest = useTemplateSuggestions(agentId, asked ?? "", asked !== null);
  const rows = (asked !== null ? suggest.data?.templates : list.data?.templates) ?? [];
  const recommended = asked !== null ? suggest.data?.recommended ?? null : null;
  const chosen = new Set(value.map((t) => t.name));
  const byName = new Map((list.data?.templates ?? []).map((t) => [t.name, t]));
  const add = (t: TemplateRow) => {
    if (chosen.has(t.name)) return;
    onChange([...value, { name: t.name, language: t.language, ...(t.label ? { purpose: t.label } : {}) }]);
  };
  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-xs text-muted-foreground">{emptyHint}</p>}
      {value.map((t, i) => {
        const meta = byName.get(t.name);
        return (
          <div key={t.name} className="space-y-2 rounded-md border p-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{meta?.label || t.name}</p>
                {meta?.bodyPreview && <p className="line-clamp-2 text-xs text-muted-foreground">{meta.bodyPreview}</p>}
              </div>
              <Button variant="ghost" size="icon" aria-label={`Tirar o modelo ${t.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <IconTrash className="size-4" />
              </Button>
            </div>
            {meta?.hasVariables && (
              <Field label="Valores das variáveis, em ordem" hint="Ex.: @firstName (primeiro nome do contato), @name, uma variável do agente ou texto fixo. Sem valores, o modelo não sai.">
                <ChipInput
                  values={t.variables ?? []}
                  onChange={(vars) => onChange(value.map((x, j) => (j === i ? { ...x, variables: vars } : x)))}
                  placeholder="@firstName"
                />
              </Field>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Select value="" onValueChange={(name) => { const t = rows.find((r) => r.name === name); if (t) add(t); }}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder={list.isLoading ? "Carregando modelos…" : "Adicionar modelo…"} /></SelectTrigger>
          <SelectContent>
            {rows.filter((r) => !chosen.has(r.name)).map((r) => (
              <SelectItem key={r.name} value={r.name}>
                {(r.label || r.name) + (r.name === recommended ? " — sugerido" : "") + (r.hasVariables ? " (tem variáveis)" : "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setAsked(purpose)} disabled={suggest.isFetching}>
          <IconSparkles className="size-4" /> {suggest.isFetching ? "Sugerindo…" : "Sugerir"}
        </Button>
        {recommended && !chosen.has(recommended) && (
          <Button size="sm" variant="ghost" onClick={() => { const t = rows.find((r) => r.name === recommended); if (t) add(t); }}>
            Usar o sugerido: {byName.get(recommended)?.label || recommended}
          </Button>
        )}
        {asked !== null && suggest.data && !suggest.data.recommended && (
          <span className="text-xs text-muted-foreground">Nenhum modelo sem variável liberado para agente.</span>
        )}
      </div>
      {list.isError && <p className="text-xs text-destructive">Não deu para carregar os modelos liberados para agente.</p>}
    </div>
  );
}

export function AutoSendStep({ agentId, config, catalogs, onChange }: {
  agentId: string;
  config: Record<string, unknown>;
  catalogs: CatalogsLite;
  onChange: (path: string, value: unknown) => void;
}) {
  const scheduling = (config.scheduling ?? {}) as Scheduling;
  const autoSend = (config.autoSend ?? {}) as AutoSend;
  const sequences = (Array.isArray(config.followUpSequences) ? config.followUpSequences : []) as FollowUpSequence[];
  const setScheduling = (patch: Partial<Scheduling>) => onChange("scheduling", { ...scheduling, ...patch });
  const setAutoSend = (patch: Partial<AutoSend>) => onChange("autoSend", { ...autoSend, ...patch });
  const setSequences = (next: FollowUpSequence[]) => onChange("followUpSequences", next);
  const updateSeq = (i: number, patch: Partial<FollowUpSequence>) => setSequences(sequences.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const stageOptions = catalogs.pipelines.flatMap((p) => p.stages.map((s) => ({ value: s.id, label: `${p.name} › ${s.name}` })));
  const stageLabel = new Map(stageOptions.map((o) => [o.value, o.label]));
  const window = autoSend.sendWindow ?? [];
  const restricted = window.length > 0;
  const windowDays = new Set(window.map((s) => s.day));
  const windowStart = window[0]?.start ?? "08:00";
  const windowEnd = window[0]?.end ?? "20:00";
  const setWindow = (days: number[], start: string, end: string) =>
    setAutoSend({ sendWindow: days.sort((a, b) => a - b).map((day) => ({ day, start, end })) });
  const anyOn = scheduling.enabled === true || sequences.some((s) => s.enabled !== false);

  return (
    <div className="space-y-6">
      <Section
        title="Retomar mais tarde"
        description="Quando o cliente pede “me manda mais tarde”, “amanhã”, “segunda” ou “depois das 18h”, o agente agenda a volta e confirma quando vai chamar. Na hora, o motor confere se o cliente já voltou a escrever, se uma pessoa assumiu ou se o atendimento foi encerrado por alguém; se sim, não envia."
      >
        <label className="flex cursor-pointer items-center gap-3">
          <Switch checked={scheduling.enabled === true} onCheckedChange={(v) => setScheduling({ enabled: v })} aria-label="Agendar a retomada a pedido do cliente" />
          <span className="text-sm">Agendar a retomada a pedido do cliente</span>
        </label>
        {scheduling.enabled && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6">
              <Field label="Até quantos dias à frente">
                <NumberInput value={scheduling.maxDaysAhead ?? 7} min={1} max={30} onChange={(v) => setScheduling({ maxDaysAhead: v ?? 7 })} />
              </Field>
              <Field label="“Mais tarde” sem hora: daqui a (horas)">
                <NumberInput value={scheduling.laterDefaultHours ?? 3} min={1} max={24} onChange={(v) => setScheduling({ laterDefaultHours: v ?? 3 })} />
              </Field>
            </div>
            <Field
              label="Mensagem de reserva da retomada"
              hint={`Dentro das 24 h o agente escreve a retomada a partir da conversa (sem número, data, valor ou link). Se não conseguir, sai este texto. Vazio: “${SCHEDULE_FALLBACK}”`}
            >
              <Textarea value={scheduling.fallbackMessage ?? ""} onChange={(e) => setScheduling({ fallbackMessage: e.target.value })} />
            </Field>
            <label className="flex cursor-pointer items-center gap-3">
              <Switch checked={scheduling.stopOnStageChange === true} onCheckedChange={(v) => setScheduling({ stopOnStageChange: v })} aria-label="Cancelar se o negócio mudar de etapa" />
              <span className="text-sm">Cancelar se o negócio mudar de etapa até lá</span>
            </label>
            <p className="text-xs text-muted-foreground">Um retorno por conversa: se o cliente pedir outro horário, o novo substitui o anterior. Se ele disser só “ok” ou “obrigado”, o combinado continua.</p>
          </div>
        )}
      </Section>

      <Section
        title="Follow-up por etapa"
        description="Mensagens quando o negócio está numa etapa e o cliente para de responder. Os prazos contam da última mensagem do agente. Para quando o cliente responde, uma pessoa assume, o negócio muda de etapa (se marcado), o cliente pede para parar ou o negócio é ganho ou perdido. Só vale em conversa que está com este agente."
      >
        {sequences.map((seq, i) => {
          const steps = [...(seq.steps ?? [])];
          const setSteps = (next: SeqStep[]) => updateSeq(i, { steps: next });
          const end: OnEnd = seq.onEnd ?? { action: "none" };
          const setEnd = (patch: Partial<OnEnd>) => updateSeq(i, { onEnd: { ...end, ...patch } });
          return (
            <div key={seq.id} className="space-y-4 rounded-md border p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <Field label="Nome">
                    <Input value={seq.name} placeholder="Ex.: Inscrição pendente" onChange={(e) => updateSeq(i, { name: e.target.value })} />
                  </Field>
                </div>
                <label className="flex cursor-pointer items-center gap-2 pb-2">
                  <Switch checked={seq.enabled !== false} onCheckedChange={(v) => updateSeq(i, { enabled: v })} aria-label={`Ligar ${seq.name || "régua"}`} />
                  <span className="text-sm">Ligada</span>
                </label>
                <Button variant="ghost" size="icon" aria-label={`Remover ${seq.name || "régua"}`} onClick={() => setSequences(sequences.filter((_, j) => j !== i))}>
                  <IconTrash className="size-4" />
                </Button>
              </div>
              <Field label="Etapas em que vale" hint="Se o negócio estiver em mais de uma régua, vale a primeira da lista.">
                <div className="flex flex-wrap items-center gap-2">
                  <MultiSelectPopover
                    label="Etapas"
                    options={stageOptions}
                    selected={seq.dealStages ?? []}
                    onChange={(next) => updateSeq(i, { dealStages: next })}
                    emptyLabel="Nenhuma etapa"
                  />
                  {(seq.dealStages ?? []).map((s) => <Badge key={s} variant="secondary">{stageLabel.get(s) ?? s}</Badge>)}
                </div>
              </Field>
              <div className="space-y-3">
                <Label>Mensagens</Label>
                {steps.map((st, si) => (
                  <div key={si} className="space-y-3 rounded-md border p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <Field label={`${si + 1}ª depois de`}>
                        <DurationInput minutes={st.after} onChange={(m) => setSteps(steps.map((x, j) => (j === si ? { ...x, after: m } : x)))} />
                      </Field>
                      <Segmented
                        value={st.mode ?? "fixed"}
                        onChange={(v) => setSteps(steps.map((x, j) => (j === si ? { ...x, mode: v as SeqStep["mode"] } : x)))}
                        options={[{ value: "fixed", label: "Texto fixo" }, { value: "generated", label: "Escrito pelo agente" }]}
                      />
                      <Button variant="ghost" size="icon" aria-label={`Remover mensagem ${si + 1}`} onClick={() => setSteps(steps.filter((_, j) => j !== si))}>
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                    <Field
                      label={st.mode === "generated" ? "Texto de reserva" : "Texto"}
                      hint={`${st.mode === "generated" ? "O agente escreve a partir da conversa, sem número, data, valor ou link; se não conseguir, sai este texto. " : ""}Use @firstName para o primeiro nome. Vazio: “${STEP_FALLBACK}”`}
                    >
                      <Textarea value={st.message ?? ""} onChange={(e) => setSteps(steps.map((x, j) => (j === si ? { ...x, message: e.target.value } : x)))} />
                    </Field>
                    <Field label="Modelo da Meta se passar das 24 h" hint="Fora da janela do WhatsApp só sai modelo aprovado. Vazio: os modelos de “Envios automáticos”.">
                      <TemplatePicker
                        agentId={agentId}
                        purpose={`${seq.name || "follow-up"} — mensagem ${si + 1}`}
                        value={st.templates ?? []}
                        onChange={(next) => setSteps(steps.map((x, j) => (j === si ? { ...x, templates: next } : x)))}
                        emptyHint="Usa os modelos de Envios automáticos."
                      />
                    </Field>
                  </div>
                ))}
                {steps.length < MAX_STEPS && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const last = steps.reduce((m, s) => Math.max(m, s.after || 0), 0);
                      setSteps([...steps, { after: last > 0 ? last + 24 * 60 : 120, mode: "generated" }]);
                    }}
                  >
                    <IconPlus className="size-4" /> Adicionar mensagem
                  </Button>
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <Switch checked={seq.stopOnStageChange !== false} onCheckedChange={(v) => updateSeq(i, { stopOnStageChange: v })} aria-label="Parar se o negócio mudar de etapa" />
                <span className="text-sm">Parar se o negócio mudar de etapa</span>
              </label>
              <div className="space-y-3 rounded-md border p-3">
                <Field label="No fim, sem resposta">
                  <Select value={end.action} onValueChange={(v) => setEnd({ action: v as OnEnd["action"] })}>
                    <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nada</SelectItem>
                      <SelectItem value="close">Encerrar a conversa</SelectItem>
                      <SelectItem value="handoff">Transferir para a equipe (destino padrão)</SelectItem>
                      <SelectItem value="move_stage">Mover de etapa</SelectItem>
                      <SelectItem value="add_tag">Etiquetar</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {end.action !== "none" && (
                  <Field label="Depois da última mensagem">
                    <DurationInput minutes={end.after ?? 24 * 60} onChange={(m) => setEnd({ after: m })} />
                  </Field>
                )}
                {end.action === "move_stage" && (
                  <Field label="Etapa">
                    <Select value={end.stageId || undefined} onValueChange={(v) => setEnd({ stageId: v })}>
                      <SelectTrigger className="w-[320px]"><SelectValue placeholder="Escolha a etapa…" /></SelectTrigger>
                      <SelectContent>
                        {stageOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {end.action === "add_tag" && (
                  <Field label="Etiqueta">
                    <Select value={end.tag || undefined} onValueChange={(v) => setEnd({ tag: v })}>
                      <SelectTrigger className="w-[320px]"><SelectValue placeholder="Escolha a etiqueta…" /></SelectTrigger>
                      <SelectContent>
                        {(catalogs.tags ?? []).map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {(end.action === "close" || end.action === "handoff") && (
                  <Field label="Mensagem antes" hint="Só sai dentro das 24 h. Vazio: sem mensagem.">
                    <Textarea value={end.message ?? ""} onChange={(e) => setEnd({ message: e.target.value })} />
                  </Field>
                )}
              </div>
            </div>
          );
        })}
        {sequences.length < MAX_SEQUENCES && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSequences([...sequences, { id: newId(), name: "", enabled: true, dealStages: [], steps: [{ after: 120, mode: "generated" }], stopOnStageChange: true, onEnd: { action: "none" } }])}
          >
            <IconPlus className="size-4" /> Nova régua de follow-up
          </Button>
        )}
      </Section>

      <Section
        title="Envios automáticos"
        description="Vale para a retomada e para o follow-up. Dentro das 24 h desde a última mensagem do cliente sai texto; depois, só modelo aprovado da Meta. No WhatsApp por QR code sai sempre texto. Nenhum envio sai duas vezes."
      >
        {!anyOn && <p className="text-xs text-muted-foreground">Ligue a retomada ou uma régua de follow-up para estas regras valerem.</p>}
        <Field label="Quando pode enviar">
          <Segmented
            value={restricted ? "window" : "any"}
            onChange={(v) => (v === "any" ? setAutoSend({ sendWindow: [] }) : setWindow([1, 2, 3, 4, 5, 6], "08:00", "20:00"))}
            options={[{ value: "any", label: "A qualquer hora (24 h)" }, { value: "window", label: "Só em alguns horários" }]}
          />
        </Field>
        {restricted && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d, day) => {
                const on = windowDays.has(day);
                return (
                  <Button
                    key={d}
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() => {
                      const next = on ? [...windowDays].filter((x) => x !== day) : [...windowDays, day];
                      if (next.length > 0) setWindow(next, windowStart, windowEnd);
                    }}
                  >
                    {d}
                  </Button>
                );
              })}
            </div>
            <Field label="Das">
              <Input type="time" value={windowStart} onChange={(e) => setWindow([...windowDays], e.target.value, windowEnd)} className="w-[120px]" />
            </Field>
            <Field label="Até">
              <Input type="time" value={windowEnd} onChange={(e) => setWindow([...windowDays], windowStart, e.target.value)} className="w-[120px]" />
            </Field>
            <p className="w-full text-xs text-muted-foreground">Fora desses horários o envio espera a próxima abertura. Fuso do horário de atendimento do agente (padrão: Brasília).</p>
          </div>
        )}
        <Field label="Envios automáticos por conversa a cada 24 h">
          <NumberInput value={autoSend.maxPerDay ?? 2} min={1} max={5} onChange={(v) => setAutoSend({ maxPerDay: v ?? 2 })} />
        </Field>
        <Field label="Modelos da Meta para depois das 24 h" hint="Com mais de um, o agente escolhe na hora o que melhor serve ao envio (retomada ou etapa).">
          <TemplatePicker
            agentId={agentId}
            purpose="retomar o atendimento com o cliente"
            value={autoSend.templates ?? []}
            onChange={(next) => setAutoSend({ templates: next })}
            emptyHint="Nenhum modelo escolhido."
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-3">
          <Switch checked={autoSend.autoPickTemplates !== false} onCheckedChange={(v) => setAutoSend({ autoPickTemplates: v })} aria-label="Escolher entre os modelos liberados para agente" />
          <span className="text-sm">Sem modelo escolhido, o agente escolhe entre os liberados para agente (sem variáveis)</span>
        </label>
        <Field label="Depois das 24 h sem nenhum modelo possível">
          <Segmented
            value={autoSend.noTemplate ?? "task"}
            onChange={(v) => setAutoSend({ noTemplate: v as AutoSend["noTemplate"] })}
            options={[{ value: "task", label: "Criar tarefa para a equipe" }, { value: "handoff", label: "Transferir" }, { value: "skip", label: "Só registrar" }]}
          />
        </Field>
        <Field label="Quando o cliente pede para parar" hint={`Para todos os envios automáticos a esse contato. Vazio: ${OPT_OUT_DEFAULT.map((t) => `“${t}”`).join(", ")}.`}>
          <ChipInput values={autoSend.optOutTerms ?? []} onChange={(next) => setAutoSend({ optOutTerms: next })} placeholder="pare de mandar" />
        </Field>
        <Field label="Por quantos dias o pedido vale">
          <NumberInput value={autoSend.optOutDays ?? 30} min={1} max={365} onChange={(v) => setAutoSend({ optOutDays: v ?? 30 })} />
        </Field>
      </Section>
    </div>
  );
}
