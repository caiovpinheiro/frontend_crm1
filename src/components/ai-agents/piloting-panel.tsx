"use client";

/**
 * Painel de "pilotagem" do agente de IA — controles operacionais que
 * moram ACIMA do prompt e não dependem do LLM pra serem respeitados.
 *
 * Agrupa em 6 seções colapsáveis:
 *  1. Saudação inicial
 *  2. Handoff por inatividade (timer + destino)
 *  3. Palavras-chave que forçam transferência
 *  4. Perguntas obrigatórias de qualificação
 *  5. Horário de atendimento
 *  6. Estilo de saída (conversational vs structured)
 *
 * A persistência é controlada pelo componente pai via props; este
 * painel é "controlled" e só dispara `onChange` quando algo muda.
 */

import { useTeamUsersQuery } from "@/features/shared/queries/team-users";
import { IconAlertTriangle as AlertTriangle, IconBan as Ban, IconRobot as Bot, IconCalendarClock as CalendarClock, IconChecks as CheckCheck, IconClock as Clock, IconDoorExit as DoorExit, IconEye as Eye, IconHeartHandshake as Handshake, IconKeyboard as Keyboard, IconMessageCircle as MessageCircle, IconPlus as Plus, IconSparkles as Sparkles, IconTrash as Trash2, IconUserCheck as UserCheck } from "@tabler/icons-react";
import {
  Ban as LucideBan,
  CalendarClock as LucideCalendar,
  Clock as LucideClock,
  Keyboard as LucideKeyboard,
  LogOut as LucideLogOut,
  MessageCircle as LucideMessage,
  Sparkles as LucideSparkles,
  UserCheck as LucideUserCheck,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formLabelClass } from "@/components/ui/form-dialog";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import type {
  AutoCloseMode,
  AutoClosePolicy,
  BusinessHoursConfig,
  BusinessHoursSlot,
  HandoffMode,
  OutputStyle,
  QualificationQuestion,
} from "@/lib/ai-agents/piloting";
import { defaultAutoClosePolicy } from "@/lib/ai-agents/piloting";
import { cn } from "@/lib/utils";

export type PilotingValue = {
  openingMessage: string;
  openingDelayMs: number;
  inactivityTimerMs: number;
  inactivityHandoffMode: HandoffMode;
  inactivityHandoffUserId: string | null;
  inactivityFarewellMessage: string;
  keywordHandoffs: string[];
  qualificationQuestions: QualificationQuestion[];
  businessHours: BusinessHoursConfig;
  /// Fila humana (inboxPolicy.handoffMessage). Vazio = fallback do backend.
  handoffMessage: string;
  retentionHandoffMessage: string;
  outputStyle: OutputStyle;
  simulateTyping: boolean;
  typingPerCharMs: number;
  markMessagesRead: boolean;
  autoClosePolicy: AutoClosePolicy;
};

export function createDefaultPiloting(): PilotingValue {
  return {
    openingMessage: "",
    openingDelayMs: 0,
    inactivityTimerMs: 0,
    inactivityHandoffMode: "KEEP_OWNER",
    inactivityHandoffUserId: null,
    inactivityFarewellMessage: "",
    keywordHandoffs: [],
    qualificationQuestions: [],
    businessHours: {
      enabled: false,
      timezone: "America/Sao_Paulo",
      weekdays: [],
      offHoursMessage: "",
    },
    handoffMessage: "",
    retentionHandoffMessage: "",
    outputStyle: "conversational",
    simulateTyping: true,
    typingPerCharMs: 25,
    markMessagesRead: true,
    autoClosePolicy: defaultAutoClosePolicy(),
  };
}

export type PilotingPresentation = "details" | "accordion";

type Props = {
  value: PilotingValue;
  onChange: (next: PilotingValue) => void;
  presentation?: PilotingPresentation;
};

type UserOption = { id: string; name: string; email: string };

export function PilotingPanel({
  value,
  onChange,
  presentation = "details",
}: Props) {
  const patch = React.useCallback(
    (p: Partial<PilotingValue>) => onChange({ ...value, ...p }),
    [value, onChange],
  );

  return (
    <div className="space-y-3">
      {presentation === "details" && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-info-border)] bg-[var(--color-info-bg)] p-3">
          <Bot className="mt-0.5 size-4 shrink-0 text-[var(--color-info)]" />
          <div className="text-[12px] leading-relaxed text-[var(--text-primary)]">
            <div className="font-semibold">Pilotagem do agente</div>
            <div className="mt-0.5 text-[var(--text-secondary)]">
              Controles operacionais que funcionam fora do prompt — saudação,
              timers, fila humana, encerramento, palavras-chave e horário do
              time. Texto e expediente da fila não ficam no código: edita aqui.
            </div>
          </div>
        </div>
      )}

      <OpeningSection value={value} patch={patch} presentation={presentation} />
      <StyleSection value={value} patch={patch} presentation={presentation} />
      <HumanBehaviorSection value={value} patch={patch} presentation={presentation} />
      <InactivitySection value={value} patch={patch} presentation={presentation} />
      <KeywordSection value={value} patch={patch} presentation={presentation} />
      <AutoCloseSection value={value} patch={patch} presentation={presentation} />
      <QualificationSection value={value} patch={patch} presentation={presentation} />
      <BusinessHoursSection value={value} patch={patch} presentation={presentation} />
    </div>
  );
}

// ── Helpers de UI ─────────────────────────────────────────────

function Section({
  icon: Icon,
  lucideIcon: Lucide,
  title,
  description,
  children,
  presentation = "details",
  enabled,
  onEnabledChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  lucideIcon?: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
  presentation?: PilotingPresentation;
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
}) {
  const HeaderIcon = presentation === "accordion" && Lucide ? Lucide : Icon;
  const showSwitch = presentation === "accordion" && onEnabledChange;

  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/30">
        <div className="flex min-w-0 items-start gap-3">
          <HeaderIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{title}</div>
            <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {description}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showSwitch && (
            <span
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <Switch
                checked={!!enabled}
                onCheckedChange={onEnabledChange}
                aria-label={`${enabled ? "Desligar" : "Ligar"} ${title}`}
              />
            </span>
          )}
          <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">
            ▾
          </span>
        </div>
      </summary>
      <div className="space-y-3 border-t border-border bg-muted/20 p-4">
        {children}
      </div>
    </details>
  );
}

// ── Seção 1: Saudação ────────────────────────────────────────

/**
 * Heurística pra detectar quando o usuário escreveu INSTRUÇÕES pro
 * agente no campo de saudação (que é enviado LITERAL pro cliente).
 * Cenário recorrente: admin cola texto tipo "você deve sempre orientar
 * o cliente a..." achando que está configurando o comportamento, mas
 * o cliente recebe essa frase bizarra em segunda pessoa.
 *
 * Retornamos um array de sinais encontrados — zero significa "parece
 * uma saudação legítima".
 */
function detectInstructionLeakSignals(text: string): string[] {
  const normalized = text.toLowerCase();
  const signals: string[] = [];
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /\bvoc[êe]\s+deve\b/, label: '"você deve"' },
    { re: /\bsempre\s+(oriente|orientar|informe|informar|pergunte|perguntar)\b/, label: '"sempre oriente/informe/pergunte"' },
    { re: /\bnunca\s+(revele|diga|envie|fale|informe)\b/, label: '"nunca revele/diga"' },
    { re: /\bap[óo]s\s+(passar|coletar|responder|enviar)\b/, label: '"após passar/coletar…"' },
    { re: /\bencerre\s+o\s+atendimento\b/, label: '"encerre o atendimento"' },
    { re: /\bfinalize\s+a\s+conversa\b/, label: '"finalize a conversa"' },
    { re: /\borient(e|ar)\s+o\s+cliente\b/, label: '"oriente o cliente"' },
    { re: /\bas\s+mensagens\s+que\s+(entrar|chegar)/, label: '"as mensagens que entrarão…"' },
    { re: /\bn[úu]mero\s+desativado\b/, label: '"número desativado"' },
  ];
  for (const { re, label } of patterns) {
    if (re.test(normalized) && !signals.includes(label)) {
      signals.push(label);
    }
  }
  return signals;
}

/** Preview simples: troca placeholders por valores de exemplo pro
 *  admin ver como o texto vai chegar no cliente. Não precisa ser
 *  idêntico ao renderTemplate do servidor (tem fallbacks diferentes)
 *  — só precisa dar uma ideia. */
function previewGreeting(raw: string): string {
  if (!raw.trim()) return "";
  return raw
    .replace(/\{\{\s*contact\.firstName\s*\}\}/gi, "Maria")
    .replace(/\{\{\s*contact\.name\s*\}\}/gi, "Maria Silva")
    .replace(/\{\{\s*contactName\s*\}\}/gi, "Maria Silva")
    .replace(/\{\{\s*deal\.title\s*\}\}/gi, "Curso de Gestão")
    .replace(/\{\{\s*dealTitle\s*\}\}/gi, "Curso de Gestão")
    .replace(/\{\{\s*stage\.name\s*\}\}/gi, "Negociação")
    .replace(/\{\{\s*stageName\s*\}\}/gi, "Negociação");
}

function OpeningSection({
  value,
  patch,
  presentation,
}: {
  value: PilotingValue;
  patch: (p: Partial<PilotingValue>) => void;
  presentation?: PilotingPresentation;
}) {
  const [showPreview, setShowPreview] = React.useState(false);
  const signals = React.useMemo(
    () => detectInstructionLeakSignals(value.openingMessage),
    [value.openingMessage],
  );
  const preview = React.useMemo(
    () => previewGreeting(value.openingMessage),
    [value.openingMessage],
  );

  return (
    <Section
      icon={MessageCircle}
      lucideIcon={LucideMessage}
      presentation={presentation}
      enabled={value.openingMessage.trim().length > 0}
      onEnabledChange={
        presentation === "accordion"
          ? (on) =>
              patch(
                on
                  ? value.openingMessage.trim()
                    ? {}
                    : {
                        openingMessage:
                          "Oi {{contact.firstName}}! Como posso te ajudar hoje?",
                      }
                  : { openingMessage: "", openingDelayMs: 0 },
              )
          : undefined
      }
      title="Saudação inicial"
      description="Mensagem enviada UMA vez, na primeira vez que o agente fala com o cliente."
    >
      <div className="flex items-start gap-2 rounded-xl border border-[var(--color-warning)]/60 bg-[var(--color-warn-bg)] p-3 text-[var(--color-warning)]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="text-[12px] leading-relaxed">
          Este texto é enviado <strong>palavra por palavra</strong> ao cliente.
          Escreva como se fosse <em>você</em> falando com ele. Para definir{" "}
          <em>comportamento</em> do agente (regras, tom, o que não dizer), use{" "}
          <strong>“Instruções adicionais”</strong> lá em cima do formulário.
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="pilot-opening" className={formLabelClass}>
          Texto da saudação
        </Label>
        <Textarea
          id="pilot-opening"
          rows={3}
          value={value.openingMessage}
          onChange={(e) => patch({ openingMessage: e.target.value })}
          placeholder="Ex.: Oi {{contact.firstName}}! Tudo bem? Sou o agente virtual. Como posso te ajudar hoje?"
          className={cn(
            "resize-none text-sm",
            signals.length > 0 && "border-[var(--color-warning)] focus-visible:ring-[var(--color-warning)]/40",
          )}
        />
        <p className="text-[11px] text-muted-foreground">
          Variáveis: <code>{"{{contact.firstName}}"}</code>,{" "}
          <code>{"{{contact.name}}"}</code>, <code>{"{{deal.title}}"}</code>,{" "}
          <code>{"{{stage.name}}"}</code>. Deixe vazio pra desativar.
        </p>
      </div>

      {signals.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-bg)] p-3 text-[var(--color-danger-text)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="text-[12px] leading-relaxed">
            Este texto parece uma{" "}
            <strong>instrução para o agente</strong>, não uma fala para o
            cliente (encontramos {signals.join(", ")}). Se deixar assim, o
            cliente vai receber essa frase literalmente no WhatsApp. Mova para{" "}
            <strong>“Instruções adicionais”</strong> e troque aqui por uma
            saudação curta — algo como “Oi {"{{contact.firstName}}"}, aqui é o
            assistente virtual. Como posso ajudar?”.
          </div>
        </div>
      )}

      {value.openingMessage.trim().length > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-3.5" />
              Prévia (como o cliente verá)
            </span>
            <span className="text-[11px] text-muted-foreground/70">
              {showPreview ? "Ocultar" : "Mostrar"}
            </span>
          </button>
          {showPreview && (
            <div className="border-t border-border/60 bg-background/50 p-3">
              <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-[var(--color-success-bg)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
                {preview}
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Exemplo com contato fictício &quot;Maria Silva&quot; /
                deal &quot;Curso de Gestão&quot;.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="pilot-opening-delay" className={formLabelClass}>
          Delay antes de enviar (segundos)
        </Label>
        <Input
          id="pilot-opening-delay"
          type="number"
          min={0}
          max={10}
          step={1}
          value={Math.round(value.openingDelayMs / 1000)}
          onChange={(e) =>
            patch({
              openingDelayMs: Math.max(0, Number(e.target.value) || 0) * 1000,
            })
          }
        />
        <p className="text-[11px] text-muted-foreground">
          0 = imediato. Máximo 10 segundos.
        </p>
      </div>
    </Section>
  );
}

// ── Seção 2: Estilo de saída ─────────────────────────────────

function StyleSection({
  value,
  patch,
  presentation,
}: {
  value: PilotingValue;
  patch: (p: Partial<PilotingValue>) => void;
  presentation?: PilotingPresentation;
}) {
  return (
    <Section
      icon={Sparkles}
      lucideIcon={LucideSparkles}
      presentation={presentation}
      title="Estilo de resposta"
      description="Força o agente a responder como humano em WhatsApp, evitando ficha técnica."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => patch({ outputStyle: "conversational" })}
          className={cn(
            "rounded-xl border p-3 text-left text-sm transition-colors",
            value.outputStyle === "conversational"
              ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
              : "border-border hover:bg-muted/40",
          )}
        >
          <div className="text-sm font-medium">Conversacional (recomendado)</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Texto corrido, 1–4 frases, sem bullets/markdown. Sempre termina
            com uma pergunta curta.
          </div>
        </button>
        <button
          type="button"
          onClick={() => patch({ outputStyle: "structured" })}
          className={cn(
            "rounded-xl border p-3 text-left text-sm transition-colors",
            value.outputStyle === "structured"
              ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
              : "border-border hover:bg-muted/40",
          )}
        >
          <div className="text-sm font-medium">Estruturado</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Permite listas, markdown e cabeçalhos. Use pra suporte
            técnico ou FAQ.
          </div>
        </button>
      </div>
    </Section>
  );
}

// ── Seção 2.5: Comportamento humano (typing + read) ──────────

function HumanBehaviorSection({
  value,
  patch,
  presentation,
}: {
  value: PilotingValue;
  patch: (p: Partial<PilotingValue>) => void;
  presentation?: PilotingPresentation;
}) {
  // Prévia do tempo de "digitando" pra uma mensagem de referência.
  // 120 chars ~ frase média que o agente manda (3 linhas).
  const sampleLen = 120;
  const sampleMs = Math.min(
    1500 + sampleLen * Math.max(0, Math.min(value.typingPerCharMs, 200)),
    25_000,
  );
  const sampleSec = (sampleMs / 1000).toFixed(1);

  return (
    <Section
      icon={Keyboard}
      lucideIcon={LucideKeyboard}
      presentation={presentation}
      enabled={value.simulateTyping || value.markMessagesRead}
      onEnabledChange={
        presentation === "accordion"
          ? (on) =>
              patch(
                on
                  ? { simulateTyping: true, markMessagesRead: true }
                  : { simulateTyping: false, markMessagesRead: false },
              )
          : undefined
      }
      title="Comportamento humano"
      description="Mostra “digitando…” e marca a mensagem como lida (✔✔ azul) no WhatsApp do cliente antes de responder."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleCard
          icon={Keyboard}
          title="Simular “digitando…”"
          description={`Mostra o indicador por ${sampleSec}s (proporcional ao tamanho da resposta). A API Meta mantém até 25s ou até o envio.`}
          checked={value.simulateTyping}
          onChange={(v) => patch({ simulateTyping: v })}
        />
        <ToggleCard
          icon={CheckCheck}
          title="Marcar como lida (✔✔ azul)"
          description="Chama /messages com status=read na mensagem recebida antes do agente responder. Quando “digitando” está ligado, o read já acontece junto."
          checked={value.markMessagesRead}
          onChange={(v) => patch({ markMessagesRead: v })}
        />
      </div>

      {value.simulateTyping && (
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="pilot-typing-pace" className={formLabelClass}>
            Velocidade de digitação
          </Label>
          <DropdownGlass
            options={[
              { value: "10", label: "Rápida (10ms/char · ~6000 cpm)" },
              { value: "25", label: "Humana média (25ms/char · ~2400 cpm)" },
              { value: "50", label: "Deliberada (50ms/char · ~1200 cpm)" },
              { value: "90", label: "Lenta (90ms/char · ~670 cpm)" },
            ]}
            value={String(value.typingPerCharMs)}
            onValueChange={(v) => patch({ typingPerCharMs: Number(v) || 25 })}
            triggerClassName="w-full"
          />
          <p className="text-[11px] text-muted-foreground">
            Base fixa de 1,5s + {value.typingPerCharMs}ms por caractere. Máximo
            25s por limitação da Meta.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        <strong className="text-foreground">Como funciona:</strong> a Meta aceita o
        indicador somente respondendo a uma mensagem recebida dos últimos 30s.
        Se o cliente ficou quieto por mais tempo, o agente envia sem indicador
        (sem ruído nem erro). Falhas pontuais nesses endpoints nunca bloqueiam
        o envio da resposta.
      </div>
    </Section>
  );
}

function ToggleCard({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
        checked
          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
          : "border-border hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
          checked
            ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{title}</span>
          <span
            className={cn(
              "inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              checked ? "bg-[var(--brand-primary)]" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "size-4 rounded-full bg-white shadow-sm transition-transform",
                checked ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {description}
        </div>
      </div>
    </button>
  );
}

// ── Seção 3: Inatividade ─────────────────────────────────────

function InactivitySection({
  value,
  patch,
  presentation,
}: {
  value: PilotingValue;
  patch: (p: Partial<PilotingValue>) => void;
  presentation?: PilotingPresentation;
}) {
  const { data: teamUsers = [] } = useTeamUsersQuery<{
    id?: unknown;
    name?: unknown;
    email?: unknown;
  }>();
  const users = React.useMemo<UserOption[]>(
    () =>
      teamUsers
        .map((u) => ({
          id: String(u.id ?? ""),
          name: String(u.name ?? ""),
          email: String(u.email ?? ""),
        }))
        .filter((u) => u.id && u.name),
    [teamUsers],
  );

  const timerMinutes = Math.round(value.inactivityTimerMs / 60_000);

  return (
    <Section
      icon={Clock}
      lucideIcon={LucideClock}
      presentation={presentation}
      enabled={value.inactivityTimerMs > 0}
      onEnabledChange={
        presentation === "accordion"
          ? (on) =>
              patch({ inactivityTimerMs: on ? 30 * 60_000 : 0 })
          : undefined
      }
      title="Handoff por inatividade"
      description="Se o cliente parar de responder por X minutos depois do agente falar, transfere pra humano."
    >
      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="pilot-timer" className={formLabelClass}>
          Inatividade (minutos)
        </Label>
        <Input
          id="pilot-timer"
          type="number"
          min={0}
          max={1440}
          step={5}
          value={timerMinutes}
          onChange={(e) =>
            patch({
              inactivityTimerMs:
                Math.max(0, Number(e.target.value) || 0) * 60_000,
            })
          }
        />
        <p className="text-[11px] text-muted-foreground">
          0 = desativado. Ex.: 30 = transfere se o cliente sumir por 30 min.
        </p>
      </div>

      {value.inactivityTimerMs > 0 && (
        <>
          <div className="grid gap-2">
            <Label className={formLabelClass}>Para quem transferir</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              <HandoffCard
                active={value.inactivityHandoffMode === "KEEP_OWNER"}
                onClick={() => patch({ inactivityHandoffMode: "KEEP_OWNER" })}
                title="Dono do deal"
                description="Volta pra quem já era dono do negócio (ou fica em fila se não houver)."
              />
              <HandoffCard
                active={value.inactivityHandoffMode === "SPECIFIC_USER"}
                onClick={() =>
                  patch({ inactivityHandoffMode: "SPECIFIC_USER" })
                }
                title="Usuário específico"
                description="Sempre transfere pro mesmo consultor."
              />
              <HandoffCard
                active={value.inactivityHandoffMode === "UNASSIGN"}
                onClick={() => patch({ inactivityHandoffMode: "UNASSIGN" })}
                title="Fila (sem dono)"
                description="Desatribui e deixa pra quem pegar primeiro."
              />
            </div>
          </div>

          {value.inactivityHandoffMode === "SPECIFIC_USER" && (
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="pilot-handoff-user" className={formLabelClass}>
                Consultor
              </Label>
              <DropdownGlass
                options={users.map((u) => ({
                  value: u.id,
                  label: `${u.name} (${u.email})`,
                }))}
                value={value.inactivityHandoffUserId ?? undefined}
                onValueChange={(v) => patch({ inactivityHandoffUserId: v || null })}
                placeholder="— selecione —"
                triggerClassName="w-full"
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="pilot-farewell" className={formLabelClass}>
              Mensagem de despedida (opcional)
            </Label>
            <Textarea
              id="pilot-farewell"
              rows={2}
              value={value.inactivityFarewellMessage}
              onChange={(e) =>
                patch({ inactivityFarewellMessage: e.target.value })
              }
              placeholder="Ex.: Vou passar a conversa pra um consultor humano pra te dar continuidade, tá?"
              className="resize-none text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Enviada antes do handoff. Aceita as mesmas variáveis da saudação.
            </p>
          </div>
        </>
      )}
    </Section>
  );
}

function HandoffCard({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left text-sm transition-colors",
        active
          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
          : "border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {active ? (
          <UserCheck className="size-3.5 text-[var(--brand-primary)]" />
        ) : (
          <Handshake className="size-3.5 text-muted-foreground" />
        )}
        {title}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {description}
      </div>
    </button>
  );
}

// ── Seção 4: Keywords ────────────────────────────────────────

function KeywordSection({
  value,
  patch,
  presentation,
}: {
  value: PilotingValue;
  patch: (p: Partial<PilotingValue>) => void;
  presentation?: PilotingPresentation;
}) {
  const [draft, setDraft] = React.useState("");

  const addKeyword = () => {
    const k = draft.trim();
    if (!k) return;
    if (value.keywordHandoffs.includes(k)) {
      setDraft("");
      return;
    }
    patch({ keywordHandoffs: [...value.keywordHandoffs, k] });
    setDraft("");
  };

  const removeKeyword = (k: string) =>
    patch({ keywordHandoffs: value.keywordHandoffs.filter((x) => x !== k) });

  return (
    <Section
      icon={Ban}
      lucideIcon={LucideBan}
      presentation={presentation}
      enabled={value.keywordHandoffs.length > 0}
      onEnabledChange={
        presentation === "accordion"
          ? (on) => {
              if (!on) patch({ keywordHandoffs: [] });
            }
          : undefined
      }
      title="Palavras-chave que forçam handoff"
      description="Se a mensagem do cliente contém alguma dessas, transfere IMEDIATAMENTE pra humano."
    >
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addKeyword();
            }
          }}
          placeholder="Ex.: cancelar, reclamação, atendente"
        />
        <Button type="button" variant="outline" onClick={addKeyword}>
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
      {value.keywordHandoffs.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Nenhuma palavra configurada. O agente decide sozinho quando
          transferir via LLM.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {value.keywordHandoffs.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-[12px]"
            >
              {k}
              <button
                type="button"
                onClick={() => removeKeyword(k)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remover "${k}"`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Match por substring, ignora acentos/maiúsculas. Usa o mesmo destino
        do handoff por inatividade.
      </p>
    </Section>
  );
}

// ── Seção 4b: Encerramento automático ────────────────────────

const AUTO_CLOSE_CARDS: Array<{
  mode: AutoCloseMode;
  title: string;
  description: string;
}> = [
  {
    mode: "off",
    title: "Desligado",
    description: "A IA nunca encerra o ticket. Só se despede por texto.",
  },
  {
    mode: "explicit",
    title: "Só pedido explícito",
    description:
      "Encerra se o aluno pedir para encerrar/finalizar, ou se bater numa palavra-chave abaixo. “Obrigado” e “boa noite” não fecham.",
  },
  {
    mode: "understood",
    title: "Quando a IA entender",
    description:
      "A IA encerra quando concluir que o aluno não precisa mais — e dispara a automação Encerramento.",
  },
];

function AutoCloseSection({
  value,
  patch,
  presentation,
}: {
  value: PilotingValue;
  patch: (p: Partial<PilotingValue>) => void;
  presentation?: PilotingPresentation;
}) {
  const policy = value.autoClosePolicy;
  const [draft, setDraft] = React.useState("");

  const setPolicy = (next: Partial<AutoClosePolicy>) =>
    patch({ autoClosePolicy: { ...policy, ...next } });

  const addKeyword = () => {
    const k = draft.trim();
    if (!k) return;
    if (policy.keywords.includes(k)) {
      setDraft("");
      return;
    }
    setPolicy({ keywords: [...policy.keywords, k] });
    setDraft("");
  };

  const removeKeyword = (k: string) =>
    setPolicy({ keywords: policy.keywords.filter((x) => x !== k) });

  return (
    <Section
      icon={DoorExit}
      lucideIcon={LucideLogOut}
      presentation={presentation}
      enabled={policy.mode !== "off"}
      onEnabledChange={
        presentation === "accordion"
          ? (on) =>
              patch({
                autoClosePolicy: {
                  ...policy,
                  mode: on ? "explicit" : "off",
                },
              })
          : undefined
      }
      title="Encerramento automático"
      description="Quando o atendimento for só da IA, fecha o ticket e dispara a automação Encerramento."
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {AUTO_CLOSE_CARDS.map((card) => (
          <button
            key={card.mode}
            type="button"
            onClick={() => setPolicy({ mode: card.mode })}
            className={cn(
              "rounded-xl border p-3 text-left text-sm transition-colors",
              policy.mode === card.mode
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10"
                : "border-border hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-medium">{card.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {card.description}
            </div>
          </button>
        ))}
      </div>

      {policy.mode !== "off" && (
        <>
          <div className="grid gap-2">
            <Label className={formLabelClass}>
              Palavras-chave que forçam encerramento
            </Label>
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                placeholder='Ex.: "era só isso", "pode fechar", "já resolvi"'
              />
              <Button type="button" variant="outline" onClick={addKeyword}>
                <Plus className="size-4" />
                Adicionar
              </Button>
            </div>
            {policy.keywords.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                Sem extras. O detector interno já cobre “encerrar”,
                “finalizar”, “era só isso”, “não preciso mais”.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {policy.keywords.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-[12px]"
                  >
                    {k}
                    <button
                      type="button"
                      onClick={() => removeKeyword(k)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remover "${k}"`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pilot-autoclose-msg" className={formLabelClass}>
              Mensagem ao encerrar (opcional)
            </Label>
            <Textarea
              id="pilot-autoclose-msg"
              rows={2}
              value={policy.message ?? ""}
              onChange={(e) => setPolicy({ message: e.target.value || null })}
              placeholder="Ex.: Combinado, {{contact.firstName}}! Qualquer coisa é só chamar."
              className="resize-none text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Enviada antes de fechar. Aceita as mesmas variáveis da
              saudação. Vazio = frase padrão do sistema.
            </p>
          </div>
        </>
      )}

      <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        <strong className="text-foreground">Como funciona:</strong> só
        encerra se ninguém humano tiver respondido nesta conversa. O
        fechamento dispara o mesmo gatilho do encerramento manual
        (automação Encerramento).
      </div>
    </Section>
  );
}

// ── Seção 5: Qualificação ────────────────────────────────────

function QualificationSection({
  value,
  patch,
  presentation,
}: {
  value: PilotingValue;
  patch: (p: Partial<PilotingValue>) => void;
  presentation?: PilotingPresentation;
}) {
  const [draftQuestion, setDraftQuestion] = React.useState("");
  const [draftHint, setDraftHint] = React.useState("");

  const add = () => {
    const q = draftQuestion.trim();
    if (!q) return;
    const id = Math.random().toString(36).slice(2, 10);
    patch({
      qualificationQuestions: [
        ...value.qualificationQuestions,
        { id, question: q, hint: draftHint.trim() || undefined },
      ],
    });
    setDraftQuestion("");
    setDraftHint("");
  };

  const remove = (id: string) =>
    patch({
      qualificationQuestions: value.qualificationQuestions.filter(
        (q) => q.id !== id,
      ),
    });

  return (
    <Section
      icon={UserCheck}
      lucideIcon={LucideUserCheck}
      presentation={presentation}
      enabled={value.qualificationQuestions.length > 0}
      onEnabledChange={
        presentation === "accordion"
          ? (on) => {
              if (!on) patch({ qualificationQuestions: [] });
            }
          : undefined
      }
      title="Perguntas obrigatórias de qualificação"
      description="O agente não transfere pra humano enquanto essas informações não forem coletadas."
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
        <Input
          value={draftQuestion}
          onChange={(e) => setDraftQuestion(e.target.value)}
          placeholder='Ex.: "Qual sua cidade?"'
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Input
          value={draftHint}
          onChange={(e) => setDraftHint(e.target.value)}
          placeholder="Formato (opcional)"
        />
        <Button type="button" variant="outline" onClick={add}>
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>

      {value.qualificationQuestions.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Sem perguntas obrigatórias. O agente decide quando tem informação
          suficiente.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {value.qualificationQuestions.map((q) => (
            <li
              key={q.id}
              className="flex items-start justify-between gap-2 rounded-lg border bg-muted/30 p-2 text-[13px]"
            >
              <div className="min-w-0">
                <div className="font-medium">{q.question}</div>
                {q.hint && (
                  <div className="text-[11px] text-muted-foreground">
                    Formato: {q.hint}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(q.id)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remover pergunta"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Essas instruções viram parte do system prompt. O LLM vai coletar
        naturalmente ao longo da conversa (não pede tudo de uma vez).
      </p>
    </Section>
  );
}

// ── Seção 6: Horário de atendimento ──────────────────────────

const DAYS = [
  { id: 0, label: "Dom" },
  { id: 1, label: "Seg" },
  { id: 2, label: "Ter" },
  { id: 3, label: "Qua" },
  { id: 4, label: "Qui" },
  { id: 5, label: "Sex" },
  { id: 6, label: "Sáb" },
];

function BusinessHoursSection({
  value,
  patch,
  presentation,
}: {
  value: PilotingValue;
  patch: (p: Partial<PilotingValue>) => void;
  presentation?: PilotingPresentation;
}) {
  const bh = value.businessHours;

  const toggleEnabled = (enabled: boolean) => {
    // Sem slots: fallback SAC (seg–sex 8–19, sáb 9–16).
    if (enabled && bh.weekdays.length === 0) {
      patch({
        businessHours: {
          ...bh,
          enabled: true,
          weekdays: [
            ...[1, 2, 3, 4, 5].map((day) => ({
              day,
              start: "08:00",
              end: "19:00",
            })),
            { day: 6, start: "09:00", end: "16:00" },
          ],
        },
      });
      return;
    }
    patch({ businessHours: { ...bh, enabled } });
  };

  const toggleDay = (day: number) => {
    const existing = bh.weekdays.find((s) => s.day === day);
    if (existing) {
      patch({
        businessHours: {
          ...bh,
          weekdays: bh.weekdays.filter((s) => s.day !== day),
        },
      });
    } else {
      patch({
        businessHours: {
          ...bh,
          weekdays: [
            ...bh.weekdays,
            {
              day,
              start: day === 6 ? "09:00" : "08:00",
              end: day === 6 ? "16:00" : "19:00",
            },
          ].sort((a, b) => a.day - b.day),
        },
      });
    }
  };

  const updateSlot = (
    day: number,
    field: "start" | "end",
    val: string,
  ) => {
    patch({
      businessHours: {
        ...bh,
        weekdays: bh.weekdays.map((s) =>
          s.day === day ? ({ ...s, [field]: val } as BusinessHoursSlot) : s,
        ),
      },
    });
  };

  return (
    <Section
      icon={CalendarClock}
      lucideIcon={LucideCalendar}
      presentation={presentation}
      enabled={bh.enabled}
      onEnabledChange={
        presentation === "accordion" ? toggleEnabled : undefined
      }
      title="Horário e fila humana"
      description="Expediente do consultor. A IA continua; estes textos são o que o aluno recebe na fila."
    >
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={bh.enabled}
            onChange={(e) => toggleEnabled(e.target.checked)}
          />
          Ativar horário comercial
        </label>
      </div>

      {bh.enabled && (
        <>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="pilot-tz" className={formLabelClass}>
              Fuso horário
            </Label>
            <DropdownGlass
              options={[
                { value: "America/Sao_Paulo", label: "America/Sao_Paulo" },
                { value: "America/Manaus", label: "America/Manaus" },
                { value: "America/Rio_Branco", label: "America/Rio_Branco" },
                { value: "America/Noronha", label: "America/Noronha" },
                { value: "UTC", label: "UTC" },
              ]}
              value={bh.timezone}
              onValueChange={(v) =>
                patch({ businessHours: { ...bh, timezone: v } })
              }
              triggerClassName="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label className={formLabelClass}>Dias e horários</Label>
            <div className="space-y-1.5">
              {DAYS.map((d) => {
                const slot = bh.weekdays.find((s) => s.day === d.id);
                const enabled = !!slot;
                return (
                  <div
                    key={d.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2",
                      enabled ? "bg-background" : "bg-muted/30",
                    )}
                  >
                    <label className="inline-flex min-w-[64px] items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleDay(d.id)}
                      />
                      {d.label}
                    </label>
                    {enabled && slot ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Input
                          type="time"
                          value={slot.start}
                          onChange={(e) =>
                            updateSlot(d.id, "start", e.target.value)
                          }
                          className="h-8 w-28"
                        />
                        <span className="text-muted-foreground">até</span>
                        <Input
                          type="time"
                          value={slot.end}
                          onChange={(e) =>
                            updateSlot(d.id, "end", e.target.value)
                          }
                          className="h-8 w-28"
                        />
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">
                        Fechado
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </>
      )}

      <div className="grid gap-2">
        <Label htmlFor="pilot-handoff" className={formLabelClass}>
          Mensagem de fila (sempre)
        </Label>
        <Textarea
          id="pilot-handoff"
          rows={3}
          value={value.handoffMessage}
          onChange={(e) => patch({ handoffMessage: e.target.value })}
          placeholder="Vazio = usa a mensagem fora do horário, ou o texto padrão do sistema. Se preencher, vale de dia e de noite."
          className="resize-y text-sm"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pilot-offhours" className={formLabelClass}>
          Mensagem fora do expediente
        </Label>
        <Textarea
          id="pilot-offhours"
          rows={3}
          value={bh.offHoursMessage ?? ""}
          onChange={(e) =>
            patch({
              businessHours: { ...bh, offHoursMessage: e.target.value },
            })
          }
          placeholder="Combinado — já registrei seu pedido com a equipe. O atendimento humano retoma às 8h…"
          className="resize-y text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Este é o texto das 8h. Sem horário ligado, o sistema ainda usa o
          expediente SAC (seg–sex 8h–19h, sáb 9h–16h) só para saber se está
          fechado.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pilot-retention" className={formLabelClass}>
          Mensagem de retenção
        </Label>
        <Textarea
          id="pilot-retention"
          rows={2}
          value={value.retentionHandoffMessage}
          onChange={(e) => patch({ retentionHandoffMessage: e.target.value })}
          placeholder="Vazio = texto padrão de trancamento/cancelamento."
          className="resize-y text-sm"
        />
      </div>
    </Section>
  );
}
