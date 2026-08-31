"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { DeptGlyph } from "@/features/conversations-settings/department-icons";
import { TabulationStepConfig } from "./tabulation-step-config";
import { Textarea } from "@/components/ui/textarea";
import type { AutomationStep } from "@/lib/automation-workflow";
import { stepTypeLabel, summarizeStepConfig } from "@/lib/automation-workflow";
import {
  newBranchId,
  normalizeConditionConfig,
  type ConditionBranch,
  type ConditionConfig,
  type ConditionOp,
  type ConditionRule,
} from "@/lib/automation-condition";
import { WebhookStepConfig } from "@/components/automations/webhook-step-config";
import { ProductPicker } from "@/components/automations/send-product-config";
import { TagStepInput } from "@/components/automations/tag-step-input";
import { useCustomFieldConditionMeta } from "@/components/automations/editor-data";
import { usePipelinesQuery } from "@/features/shared/queries/pipelines";
import { useTeamUsersQuery } from "@/features/shared/queries/team-users";
import {
  showsUpdateFieldVariableHint,
  UpdateFieldValueControl,
} from "@/components/automations/update-field-value";
import {
  validateEntries as validateWebhookEntries,
  type WebhookBodyEntry,
} from "@/lib/webhook-body-builder";
import type { OperatorVariableMeta } from "@/lib/meta-whatsapp/operator-template-variables";
import {
  applyOperatorVariableDefaults,
  buildTemplateComponents,
  countMissingTemplateVariables,
  sameTemplateComponents,
  setTemplateVariableValue,
  templateVariableLabel,
  templateVariableSlots,
  templateVariableValue,
  templateVariablesFromConfig,
  templateVariablesOf,
  unsupportedTemplateTokens,
} from "@/components/automations/template-variables";
import { renderTemplatePreview } from "@/lib/meta-whatsapp/build-template-components";

type PipelineStage = { id: string; name: string };
type Pipeline = { id: string; name: string; stages: PipelineStage[] };
type CustomFieldOption = {
  id: string;
  name: string;
  label: string;
  entity: string;
  type?: string;
  options?: string[];
};
type VariableShortcutOption = { label: string; token: string; hint?: string };

const UPDATE_FIELD_BUILTINS: Record<"contact" | "deal", Array<{ value: string; label: string }>> = {
  contact: [
    { value: "name", label: "Nome do contato" },
    { value: "email", label: "E-mail" },
    { value: "phone", label: "Telefone" },
    { value: "source", label: "Origem" },
    { value: "lifecycleStage", label: "Ciclo de vida" },
    { value: "assignedToId", label: "Responsável" },
  ],
  deal: [
    { value: "title", label: "Título do negócio" },
    { value: "value", label: "Valor" },
    { value: "status", label: "Status" },
    { value: "stageId", label: "Etapa (ID)" },
  ],
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: AutomationStep | null;
  onSave: (step: AutomationStep) => void;
  allSteps?: AutomationStep[];
};

const CONDITION_OPS = [
  { value: "equals", worker: "eq" as const, label: "Igual a" },
  { value: "not_equals", worker: "ne" as const, label: "Diferente de" },
  { value: "greater_than", worker: "gt" as const, label: "Maior que" },
  { value: "less_than", worker: "lt" as const, label: "Menor que" },
  { value: "contains", worker: "includes" as const, label: "Contém" },
] as const;

function _workerToUiOp(op: string): string {
  const m = CONDITION_OPS.find((o) => o.worker === op);
  return m?.value ?? "equals";
}

function _uiOpToWorker(ui: string): string {
  const m = CONDITION_OPS.find((o) => o.value === ui);
  return m?.worker ?? "eq";
}

function delayToUi(config: Record<string, unknown>): { duration: string; unit: string } {
  const ms = Number(config.ms ?? config.milliseconds ?? 0);
  if (ms >= 86_400_000 && ms % 86_400_000 === 0) {
    return { duration: String(ms / 86_400_000), unit: "days" };
  }
  if (ms >= 3_600_000 && ms % 3_600_000 === 0) {
    return { duration: String(ms / 3_600_000), unit: "hours" };
  }
  if (ms >= 60_000 && ms % 60_000 === 0) {
    return { duration: String(ms / 60_000), unit: "minutes" };
  }
  return { duration: ms ? String(ms / 60_000) : "1", unit: "minutes" };
}

function uiDelayToMs(duration: number, unit: string): number {
  switch (unit) {
    case "hours":
      return Math.max(0, duration * 3_600_000);
    case "days":
      return Math.max(0, duration * 86_400_000);
    default:
      return Math.max(0, duration * 60_000);
  }
}

function VariableShortcutHint() {
  return (
    <p className="text-[11px] text-muted-foreground">
      Atalho: digite <span className="font-mono">{"{"}</span> ou{" "}
      <span className="font-mono">[</span> para abrir campos e variáveis.
    </p>
  );
}

type VariableShortcutTextareaProps = {
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: VariableShortcutOption[];
  rows?: number;
  placeholder?: string;
  /** Campo de uma linha (ex.: valor de variável de template), mesmo atalho. */
  singleLine?: boolean;
};

function VariableShortcutTextarea({
  id,
  value,
  onChange,
  options,
  rows = 3,
  placeholder,
  singleLine,
}: VariableShortcutTextareaProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [startPos, setStartPos] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 20);
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || o.token.toLowerCase().includes(q))
      .slice(0, 20);
  }, [options, query]);

  const refreshShortcutState = (el: HTMLTextAreaElement | HTMLInputElement) => {
    const close = () => {
      setOpen(false);
      setQuery("");
      setStartPos(null);
    };
    const caret = el.selectionStart ?? el.value.length;
    const left = el.value.slice(0, caret);
    // Gatilho: "[" (legado) ou "{" — como os tokens são {{...}}, digitar "{"
    // é o mais intuitivo. Usa o marcador mais próximo do cursor.
    const triggerStart = Math.max(left.lastIndexOf("["), left.lastIndexOf("{"));
    if (triggerStart < 0) return close();

    let start = triggerStart;
    const typed = left.slice(triggerStart + 1);
    if (typed.includes("\n")) return close();
    if (left[triggerStart] === "{") {
      // Absorve a sequência de "{" já digitada (ex.: "{{") para o token
      // inserido não duplicar as chaves de abertura.
      while (start > 0 && left[start - 1] === "{") start -= 1;
      if (typed.includes("}")) return close();
    } else if (typed.includes("]")) {
      return close();
    }
    setStartPos(start);
    setQuery(typed);
    setOpen(true);
  };

  const applyToken = (token: string) => {
    const el = inputRef.current;
    if (!el || startPos == null) return;
    const caret = el.selectionStart ?? value.length;
    const next = `${value.slice(0, startPos)}${token}${value.slice(caret)}`;
    onChange(next);
    setOpen(false);
    setQuery("");
    setStartPos(null);
    requestAnimationFrame(() => {
      const pos = startPos + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const shortcutHandlers = {
    value,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      onChange(e.target.value);
      refreshShortcutState(e.target);
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      refreshShortcutState(e.currentTarget),
    onClick: (e: React.MouseEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      refreshShortcutState(e.currentTarget),
    onBlur: () => {
      setTimeout(() => setOpen(false), 120);
    },
    placeholder,
  };

  return (
    <div className="relative">
      {singleLine ? (
        <Input
          id={id}
          ref={(el) => {
            inputRef.current = el;
          }}
          {...shortcutHandlers}
        />
      ) : (
        <Textarea
          id={id}
          ref={(el) => {
            inputRef.current = el;
          }}
          rows={rows}
          {...shortcutHandlers}
        />
      )}
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-lg)]">
          {filtered.map((opt) => (
            <button
              key={`${opt.label}-${opt.token}`}
              type="button"
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-subtle)]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyToken(opt.token)}
            >
              <span className="mt-0.5 rounded bg-[var(--glass-bg-base)] px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {opt.token}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-foreground">{opt.label}</span>
                {opt.hint ? (
                  <span className="block truncate text-[10px] text-[var(--text-muted)]">{opt.hint}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MESSAGING_STEP_TYPES = new Set([
  "send_whatsapp_message",
  "send_whatsapp_interactive",
  "send_whatsapp_list",
  "send_product",
  "question",
]);

export function StepConfigPanel({ open, onOpenChange, step, onSave, allSteps = [] }: Props) {
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [updateFieldFilter, setUpdateFieldFilter] = useState("");
  const declaredVariables = useMemo(
    () => collectDeclaredVariables(allSteps, step?.id ?? ""),
    [allSteps, step?.id],
  );

  // Busca custom fields quando o passo é de mensagem (alimenta o atalho "[")
  const customFieldsShortcutQuery = useQuery({
    queryKey: ["custom-fields-for-shortcut"],
    enabled: open && !!step?.type && MESSAGING_STEP_TYPES.has(step.type),
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const [contactRes, dealRes] = await Promise.all([
        fetch(apiUrl("/api/custom-fields?entity=contact")),
        fetch(apiUrl("/api/custom-fields?entity=deal")),
      ]);
      const contacts: CustomFieldOption[] = contactRes.ok ? await contactRes.json() : [];
      const deals: CustomFieldOption[] = dealRes.ok ? await dealRes.json() : [];
      return { contacts, deals };
    },
  });

  const variableShortcutOptions = useMemo<VariableShortcutOption[]>(() => {
    const out: VariableShortcutOption[] = [];

    // Variáveis do produto — só fazem sentido no passo "Enviar produto".
    if (step?.type === "send_product") {
      out.push(
        { label: "Nome do produto", token: "{{produto.nome}}" },
        { label: "Preço do produto", token: "{{produto.preco}}", hint: "Formatado em R$" },
        { label: "SKU do produto", token: "{{produto.sku}}" },
        { label: "Descrição do produto", token: "{{produto.descricao}}" },
        { label: "Unidade do produto", token: "{{produto.unidade}}" },
      );
    }

    out.push(
      // Dados do contato
      { label: "Nome do contato", token: "{{contact.name}}" },
      { label: "Primeiro nome do contato", token: "{{contact.name|first_name}}", hint: "Filtra só o primeiro nome" },
      { label: "Telefone do contato", token: "{{contact.phone}}" },
      { label: "E-mail do contato", token: "{{contact.email}}" },
      // Dados do negócio
      { label: "Título do negócio", token: "{{deal.title}}" },
      { label: "Valor do negócio", token: "{{deal.value}}" },
      // Responsável do lead
      {
        label: "Responsável do lead",
        token: "{{assignee.name}}",
        hint: "Consultor da conversa; sem ele, o dono do negócio",
      },
      {
        label: "Primeiro nome do responsável",
        token: "{{assignee.name|first_name}}",
        hint: "Ideal para “sou o {{assignee.name|first_name}}”",
      },
      // Resposta anterior
      {
        label: "Mensagem do cliente (passo anterior)",
        token: "{{lastResponse}}",
        hint: "Resposta recebida no último passo interativo",
      },
      {
        label: "Primeiro nome da mensagem do cliente",
        token: "{{lastResponse|first_name}}",
        hint: "Aplica filtro de primeiro nome",
      },
    );

    // Custom fields do contato
    for (const cf of customFieldsShortcutQuery.data?.contacts ?? []) {
      out.push({
        label: `Contato: ${cf.label || cf.name}`,
        token: `{{contactCustomFields.${cf.name}}}`,
        hint: "Campo personalizado do contato",
      });
    }

    // Custom fields do negócio
    for (const cf of customFieldsShortcutQuery.data?.deals ?? []) {
      out.push({
        label: `Negócio: ${cf.label || cf.name}`,
        token: `{{dealCustomFields.${cf.name}}}`,
        hint: "Campo personalizado do negócio",
      });
    }

    // Variáveis declaradas no fluxo
    for (const v of declaredVariables) {
      const rawName = v.value.startsWith("variables.")
        ? v.value.slice("variables.".length)
        : v.value;
      const name = rawName.trim();
      if (!name) continue;
      out.push({
        label: `Variável: ${name}`,
        token: `{{${name}}}`,
      });
      out.push({
        label: `Variável: ${name} (primeiro nome)`,
        token: `{{${name}|first_name}}`,
      });
    }
    return out;
  }, [declaredVariables, customFieldsShortcutQuery.data, step?.type]);

  const pipelinesQuery = usePipelinesQuery<Pipeline>(
    open && (step?.type === "move_stage" || step?.type === "create_deal"),
  );

  const customFieldsQuery = useQuery({
    queryKey: ["custom-fields-for-update-field"],
    enabled: open && step?.type === "update_field",
    staleTime: 60_000,
    queryFn: async () => {
      const [contactRes, dealRes] = await Promise.all([
        fetch(apiUrl("/api/custom-fields?entity=contact")),
        fetch(apiUrl("/api/custom-fields?entity=deal")),
      ]);
      const contacts = contactRes.ok ? ((await contactRes.json()) as CustomFieldOption[]) : [];
      const deals = dealRes.ok ? ((await dealRes.json()) as CustomFieldOption[]) : [];
      return [...contacts, ...deals];
    },
  });

  useEffect(() => {
    if (!step) return;
    if (step.type === "delay") {
      const ui = delayToUi(step.config);
      setDraft({ duration: ui.duration, unit: ui.unit });
      return;
    }
    if (step.type === "condition") {
      const cfg = normalizeConditionConfig(step.config);
      // Garante ao menos 1 branch com 1 rule (pra UI poder editar logo).
      const branches: ConditionBranch[] =
        cfg.branches.length > 0
          ? cfg.branches.map((b) => ({
              ...b,
              rules: b.rules.length > 0 ? b.rules : [{ field: "", op: "eq", value: "" }],
            }))
          : [
              {
                id: newBranchId(),
                rules: [{ field: "", op: "eq", value: "" }],
              },
            ];
      setDraft({
        branches: branches as unknown as Record<string, unknown>[],
        elseStepId: cfg.elseStepId ?? "",
      });
      return;
    }
    if (step.type === "update_field") {
      const cfg = (step.config ?? {}) as Record<string, unknown>;
      const field = String(cfg.field ?? "");
      setDraft({
        entity: String(cfg.entity ?? "contact"),
        field,
        value: cfg.value ?? "",
      });
      setUpdateFieldFilter(field);
      return;
    }
    setDraft({ ...step.config });
  }, [step]);

  const title = useMemo(() => {
    if (!step) return "Passo";
    return stepTypeLabel(step.type);
  }, [step]);

  if (!step) return null;

  const save = () => {
    const orig = (step.config ?? {}) as Record<string, unknown>;
    const preserved: Record<string, unknown> = {};
    if (orig.nextStepId !== undefined) preserved.nextStepId = orig.nextStepId;
    if (orig.__rfPos !== undefined) preserved.__rfPos = orig.__rfPos;
    if (orig.__hasExplicitEdges !== undefined) preserved.__hasExplicitEdges = orig.__hasExplicitEdges;

    let config = { ...draft };
    if (step.type === "condition") {
      // Valida antes de filtrar: queremos avisar o usuário se ele
      // deixou algo incompleto em vez de silenciosamente descartar.
      const rawBranches = Array.isArray(config.branches)
        ? (config.branches as ConditionBranch[])
        : [];
      const opsWithoutValue = new Set<ConditionOp>(["empty", "not_empty"]);
      for (let bIdx = 0; bIdx < rawBranches.length; bIdx++) {
        const b = rawBranches[bIdx];
        const rules = Array.isArray(b.rules) ? b.rules : [];
        const hasAny = rules.some((r) => r.field?.trim());
        if (!hasAny) {
          toast.error(
            `Condição ${bIdx + 1}: selecione ao menos um campo para avaliar.`,
          );
          return;
        }
        for (let rIdx = 0; rIdx < rules.length; rIdx++) {
          const r = rules[rIdx];
          const hasField = !!r.field?.trim();
          if (!hasField) continue; // regra vazia é descartada abaixo
          if (opsWithoutValue.has(r.op)) continue;
          const valStr =
            r.value === null || r.value === undefined ? "" : String(r.value);
          if (!valStr.trim()) {
            toast.error(
              `Condição ${bIdx + 1}, regra ${rIdx + 1}: informe um valor para comparar com "${r.field}".`,
            );
            return;
          }
        }
      }

      const branches: ConditionBranch[] = rawBranches
        .map((b) => ({
          id: b.id || newBranchId(),
          label: b.label?.trim() || undefined,
          rules: (b.rules ?? []).filter((r) => r.field?.trim()),
          nextStepId: b.nextStepId || undefined,
        }))
        .filter((b) => b.rules.length > 0);

      if (branches.length === 0) {
        toast.error("Adicione pelo menos uma condição válida antes de salvar.");
        return;
      }

      const elseStepId =
        typeof config.elseStepId === "string" && config.elseStepId
          ? config.elseStepId
          : undefined;
      const newCfg: ConditionConfig = { branches, elseStepId };
      // O step `condition` não usa mais `nextStepId` raiz — cada
      // branch tem seu próprio. Descartamos do preserved pra evitar
      // inconsistência com o novo modelo.
      delete preserved.nextStepId;
      config = newCfg as unknown as Record<string, unknown>;
    }
    if (step.type === "delay") {
      const duration = Number(config.duration ?? 1) || 1;
      const unit = String(config.unit ?? "minutes");
      config = { ms: uiDelayToMs(duration, unit) };
    }
    if (step.type === "question") {
      config = {
        message: config.message ?? "",
        buttons: Array.isArray(config.buttons) ? config.buttons : [],
        saveToVariable: config.saveToVariable ?? "",
        timeoutMs: Number(config.timeoutMs ?? 86_400_000),
        timeoutAction: config.timeoutAction ?? "continue",
        timeoutGotoStepId: config.timeoutGotoStepId ?? "",
        elseGotoStepId: config.elseGotoStepId ?? "",
      };
    }
    if (step.type === "send_whatsapp_interactive") {
      config = {
        body: config.body ?? "",
        header: config.header ?? "",
        footer: config.footer ?? "",
        buttons: Array.isArray(config.buttons) ? config.buttons : [],
        elseGotoStepId: config.elseGotoStepId ?? "",
        saveToVariable: config.saveToVariable ?? "",
        timeoutMs: Number(config.timeoutMs ?? 86_400_000),
        timeoutAction: config.timeoutAction ?? "continue",
        timeoutGotoStepId: config.timeoutGotoStepId ?? "",
      };
    }
    if (step.type === "set_variable") {
      config = {
        variableName: config.variableName ?? "",
        value: config.value ?? "",
      };
    }
    if (step.type === "goto") {
      config = { targetStepId: config.targetStepId ?? "" };
    }
    if (step.type === "wait_for_reply") {
      config = {
        timeoutMs: Number(config.timeoutMs ?? 60_000),
        receivedGotoStepId: config.receivedGotoStepId ?? "",
        timeoutGotoStepId: config.timeoutGotoStepId ?? "",
        saveToVariable: config.saveToVariable ?? "",
      };
    }
    if (step.type === "update_field") {
      config = {
        entity: String(config.entity ?? "contact"),
        field: String(config.field ?? ""),
        value: config.value ?? "",
      };
    }
    if (step.type === "transfer_automation") {
      config = {
        targetAutomationId: config.targetAutomationId ?? "",
        targetAutomationName: config.targetAutomationName ?? "",
      };
    }
    if (step.type === "stop_automation") {
      config = {};
    }
    if (step.type === "finish") {
      config = { action: "stop" };
    }
    if (step.type === "create_deal") {
      config = {
        stageId: config.stageId ?? "",
        title: config.title ?? "Novo negócio",
        value: Number(config.value ?? 0),
      };
    }
    if (step.type === "finish_conversation") {
      config = {};
    }
    if (step.type === "tabulate_conversation") {
      const tabulationId = String(config.tabulationId ?? "").trim();
      if (!tabulationId) {
        toast.error("Selecione a tabulação que este passo vai gravar.");
        return;
      }
      config = {
        departmentId: String(config.departmentId ?? ""),
        tabulationId,
        tabulationLabel: String(config.tabulationLabel ?? ""),
        closeConversation: config.closeConversation !== false,
      };
    }
    if (step.type === "execute_distribution") {
      const ids = Array.isArray(config.departmentIds)
        ? (config.departmentIds as unknown[]).filter(
            (v): v is string => typeof v === "string" && v.trim().length > 0,
          )
        : [];
      const names = Array.isArray(config.departmentNames)
        ? (config.departmentNames as unknown[]).filter(
            (v): v is string => typeof v === "string",
          )
        : [];
      config = {
        distributionType: config.distributionType ?? "",
        departmentIds: ids,
        departmentNames: names,
        elseStepId: config.elseStepId ?? "",
      };
    }
    if (step.type === "consume_stock") {
      config = {};
    }
    if (step.type === "business_hours") {
      config = {
        schedule: Array.isArray(config.schedule) ? config.schedule : [],
        timezone: config.timezone ?? "America/Sao_Paulo",
        elseStepId: config.elseStepId ?? "",
      };
    }
    if (step.type === "check_agent_status") {
      config = {
        elseStepId: config.elseStepId ?? "",
      };
    }
    if (step.type === "ask_ai_agent") {
      config = {
        agentId: String(config.agentId ?? ""),
        agentLabel: String(config.agentLabel ?? ""),
        promptTemplate: String(config.promptTemplate ?? ""),
        saveToVariable: String(config.saveToVariable ?? "ai_response"),
      };
    }
    if (step.type === "transfer_to_ai_agent") {
      const agentUserId = String(config.agentUserId ?? "");
      if (!agentUserId) {
        toast.error("Selecione o agente IA que vai assumir a conversa.");
        return;
      }
      config = {
        agentUserId,
        agentLabel: String(config.agentLabel ?? ""),
        target: String(config.target ?? "deal") === "contact" ? "contact" : "deal",
      };
    }
    if (step.type === "assign_owner") {
      // userId vazio é permitido: significa "limpar responsável" no target
      // escolhido (desatribuir deal/contato/ambos). Não bloqueia o save.
      const userId = String(config.userId ?? "").trim();
      const target = String(config.target ?? "deal");
      config = {
        userId,
        userLabel: userId ? String(config.userLabel ?? "") : "",
        userType: String(config.userType ?? "HUMAN") === "AI" ? "AI" : "HUMAN",
        target: target === "contact" ? "contact" : target === "both" ? "both" : "deal",
      };
    }
    if (step.type === "transfer_department") {
      const departmentId = String(config.departmentId ?? "");
      if (!departmentId) {
        toast.error("Selecione um departamento.");
        return;
      }
      config = {
        departmentId,
        departmentName: String(config.departmentName ?? ""),
      };
    }
    if (step.type === "webhook") {
      // O construtor visual mantém `__webhookBodyEntries` em paralelo
      // ao `body` no draft. Validamos as entries antes de salvar — se
      // houver chave vazia, duplicada, perigosa, conflito de path,
      // entry incompleta ou tokens não reconhecidos vindos de body
      // legado, bloqueamos o save.
      const rawEntries = config.__webhookBodyEntries;
      const entries: WebhookBodyEntry[] = Array.isArray(rawEntries)
        ? (rawEntries as WebhookBodyEntry[])
        : [];
      const errors = validateWebhookEntries(entries);
      if (errors.length > 0) {
        toast.error(`Body do webhook: ${errors[0].message}`);
        return;
      }
      // `__webhookBodyEntries` é estado de UI — não persiste no config
      // do step. O `body` (string JSON) é o que o backend consome.
      const { __webhookBodyEntries: _drop, ...rest } = config as Record<string, unknown>;
      void _drop;
      config = rest;
    }
    onSave({ ...step, config: { ...config, ...preserved } });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Ajuste os parâmetros deste passo do fluxo.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {step.type === "send_email" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="sc-to">Para (campo / e-mail)</Label>
                <Input
                  id="sc-to"
                  value={String(draft.to ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  placeholder="contact.email ou endereço"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-sub">Assunto</Label>
                <Input
                  id="sc-sub"
                  value={String(draft.subject ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-body">Corpo</Label>
                <Textarea
                  id="sc-body"
                  rows={4}
                  value={String(draft.body ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                />
              </div>
            </>
          )}

          {step.type === "move_stage" && (() => {
            const pipelines = pipelinesQuery.data ?? [];
            const allStages = pipelines.flatMap((p) =>
              p.stages.map((s) => ({ ...s, pipelineName: p.name }))
            );
            return (
              <div className="space-y-2">
                <Label htmlFor="sc-stage">Mover para estágio</Label>
                {pipelinesQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando estágios…</p>
                ) : allStages.length === 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground">Nenhum estágio encontrado.</p>
                    <Input
                      id="sc-stage"
                      value={String(draft.stageId ?? "")}
                      onChange={(e) => setDraft((d) => ({ ...d, stageId: e.target.value }))}
                      placeholder="ID do estágio"
                    />
                  </>
                ) : (
                  <DropdownGlass
                    triggerClassName="w-full"
                    placeholder="Selecione…"
                    value={String(draft.stageId ?? "")}
                    options={pipelines.flatMap((p) =>
                      p.stages.map((s) => ({
                        value: s.id,
                        label: s.name,
                        description: p.name,
                      }))
                    )}
                    onValueChange={(sid) => {
                      const stage = allStages.find((s) => s.id === sid);
                      setDraft((d) => ({
                        ...d,
                        stageId: sid,
                        stageName: stage ? stage.name : "",
                      }));
                    }}
                  />
                )}
                <label className="flex cursor-pointer items-start gap-2 rounded px-0.5 py-1 text-[12.5px]">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 accent-[var(--brand-primary)]"
                    checked={draft.continueIfNoDeal === true}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, continueIfNoDeal: e.target.checked }))
                    }
                  />
                  <span className="font-medium text-[var(--text-primary)]">
                    Continuar o fluxo se o contato não tiver negócio aberto
                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                      Sem isso, o fluxo é interrompido e os passos seguintes não executam.
                    </span>
                  </span>
                </label>
              </div>
            );
          })()}

          {step.type === "assign_owner" && (
            <AssignOwnerStepConfig draft={draft} setDraft={setDraft} />
          )}

          {step.type === "transfer_department" && (
            <TransferDepartmentStepConfig draft={draft} setDraft={setDraft} />
          )}

          {step.type === "transfer_to_ai_agent" && (
            <TransferToAIAgentStepConfig draft={draft} setDraft={setDraft} />
          )}

          {(step.type === "add_tag" || step.type === "remove_tag") && (
            <div className="ds-flow ds-flow--node-inline">
              <TagStepInput
                label="Nome da tag"
                value={String(draft.tagName ?? "")}
                onChange={(tagName) => setDraft((d) => ({ ...d, tagName }))}
                allowCreate={step.type !== "remove_tag"}
              />
            </div>
          )}

          {step.type === "update_field" && (() => {
            const entity = String(draft.entity ?? "contact") === "deal" ? "deal" : "contact";
            const fieldSlug = String(draft.field ?? "");
            const selectedCustom = (customFieldsQuery.data ?? []).find(
              (f) => f.entity === entity && f.name === fieldSlug,
            );
            const fieldType = (selectedCustom?.type || "").toUpperCase();
            const fieldOpts = selectedCustom?.options ?? [];
            return (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sc-uf-entity">Entidade</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    value={entity}
                    options={[
                      { value: "contact", label: "Contato" },
                      { value: "deal", label: "Negócio" },
                    ]}
                    onValueChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        entity: v,
                        field: "",
                        value: "",
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-field-filter">Localizar campo</Label>
                  <Input
                    id="sc-field-filter"
                    value={updateFieldFilter}
                    onChange={(e) => setUpdateFieldFilter(e.target.value)}
                    placeholder="Digite para filtrar campos..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-field">Campo</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    placeholder="Selecione um campo…"
                    value={fieldSlug}
                    options={[
                      ...(UPDATE_FIELD_BUILTINS[entity] ?? [])
                        .filter((o) =>
                          `${o.label} ${o.value}`
                            .toLowerCase()
                            .includes(updateFieldFilter.trim().toLowerCase()),
                        )
                        .map((o) => ({
                          value: o.value,
                          label: o.label,
                          description: "Campos nativos",
                        })),
                      ...(customFieldsQuery.data ?? [])
                        .filter((f) => f.entity === entity)
                        .filter((f) =>
                          `${f.label} ${f.name}`
                            .toLowerCase()
                            .includes(updateFieldFilter.trim().toLowerCase()),
                        )
                        .map((f) => ({
                          value: f.name,
                          label: `${f.label} (${f.name})`,
                          description: "Campos personalizados",
                        })),
                    ]}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, field: v, value: "" }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-val">Valor</Label>
                  <UpdateFieldValueControl
                    fieldType={fieldType}
                    options={fieldOpts}
                    value={String(draft.value ?? "")}
                    onChange={(v) => setDraft((d) => ({ ...d, value: v }))}
                    variant="panel"
                  />
                  {showsUpdateFieldVariableHint(fieldType) && (
                    <p className="text-[11px] text-muted-foreground">
                      Você pode usar variáveis no valor, ex.: {"{{"}lastResponse{"}}"}.
                    </p>
                  )}
                </div>
              </>
            );
          })()}

          {step.type === "create_activity" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="sc-act-type">Tipo</Label>
                <DropdownGlass
                  triggerClassName="w-full"
                  value={String(draft.type ?? "TASK")}
                  options={[
                    { value: "CALL", label: "Ligação" },
                    { value: "EMAIL", label: "E-mail" },
                    { value: "MEETING", label: "Reunião" },
                    { value: "TASK", label: "Tarefa" },
                    { value: "NOTE", label: "Nota" },
                    { value: "WHATSAPP", label: "WhatsApp" },
                    { value: "OTHER", label: "Outro" },
                  ]}
                  onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-act-title">Título</Label>
                <Input
                  id="sc-act-title"
                  value={String(draft.title ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-act-desc">Descrição</Label>
                <Textarea
                  id="sc-act-desc"
                  rows={3}
                  value={String(draft.description ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </div>
            </>
          )}

          {step.type === "send_whatsapp_message" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="sc-cw-msg">Conteúdo da mensagem</Label>
                <VariableShortcutTextarea
                  id="sc-cw-msg"
                  rows={4}
                  value={String(draft.content ?? "")}
                  onChange={(next) => setDraft((d) => ({ ...d, content: next }))}
                  placeholder="Ex.: Olá, tudo bem?"
                  options={variableShortcutOptions}
                />
                <VariableShortcutHint />
                <p className="text-[11px] text-muted-foreground">
                  O destinatário é resolvido automaticamente pelo telefone do contato.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Enviar como</Label>
                <DropdownGlass
                  triggerClassName="w-full"
                  value={String(draft.sendAs ?? "bot")}
                  options={[
                    { value: "bot", label: "Bot (automação)" },
                    {
                      value: "assignee",
                      label: "Responsável da conversa",
                      description:
                        "Conta como 1ª resposta do consultor (sai da Entrada → Respondidas)",
                    },
                  ]}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, sendAs: v || "bot" }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Com &quot;Responsável&quot;, a mensagem aparece como se o consultor
                  tivesse respondido. Sem responsável humano, envia como bot.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-cw-fb">Template fallback (sessão expirada)</Label>
                <Input
                  id="sc-cw-fb"
                  value={String(draft.fallbackTemplateName ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, fallbackTemplateName: e.target.value }))}
                  placeholder="Nome do template (opcional)"
                />
                <p className="text-[11px] text-muted-foreground">
                  Se a sessão de 24h expirou, envia este template em vez da mensagem de texto.
                </p>
              </div>
            </>
          )}

          {step.type === "send_whatsapp_template" && (
            <TemplateStepConfig
              draft={draft}
              setDraft={setDraft}
              otherSteps={allSteps.filter((s) => s.id !== step.id)}
              variableOptions={variableShortcutOptions}
            />
          )}

          {step.type === "send_whatsapp_media" && (
            <MediaStepConfig draft={draft} setDraft={setDraft} />
          )}

          {step.type === "send_product" && (
            <>
              <div className="space-y-2">
                <Label>Produto</Label>
                <ProductPicker
                  value={String(draft.productId ?? "")}
                  valueName={String(draft.productName ?? "")}
                  valueChannel={
                    typeof draft.channel === "string" ? draft.channel : undefined
                  }
                  valueUnitPrice={
                    typeof draft.unitPrice === "number"
                      ? draft.unitPrice
                      : draft.unitPrice != null
                        ? Number(draft.unitPrice)
                        : undefined
                  }
                  valueDiscountPercent={
                    typeof draft.discountPercent === "number"
                      ? draft.discountPercent
                      : draft.discountPercent != null
                        ? Number(draft.discountPercent)
                        : undefined
                  }
                  onChange={(sel) =>
                    setDraft((d) => ({
                      ...d,
                      productId: sel.id,
                      productName: sel.name,
                      unitPrice: sel.unitPrice ?? "",
                      discountPercent: sel.discountPercent ?? "",
                      channel: sel.channel ?? "",
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-prod-msg">Mensagem (opcional)</Label>
                <VariableShortcutTextarea
                  id="sc-prod-msg"
                  rows={4}
                  value={String(draft.content ?? "")}
                  onChange={(next) => setDraft((d) => ({ ...d, content: next }))}
                  placeholder="Ex.: Olá! Separei este produto pra você: {{produto.nome}} por {{produto.preco}}."
                  options={variableShortcutOptions}
                />
                <VariableShortcutHint />
                <p className="text-[11px] text-muted-foreground">
                  Use as variáveis do produto (<code>{"{{produto.nome}}"}</code>,{" "}
                  <code>{"{{produto.preco}}"}</code>, …). Se deixar vazio, enviamos um
                  resumo padrão com nome, descrição e valor.
                </p>
              </div>
            </>
          )}

          {step.type === "send_whatsapp_interactive" && (() => {
            const buttons = Array.isArray(draft.buttons)
              ? (draft.buttons as { id?: string; title?: string; gotoStepId?: string }[])
              : [];
            const otherSteps = allSteps.filter((s) => s.id !== step.id);
            return (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sc-int-body">Texto da mensagem</Label>
                  <VariableShortcutTextarea
                    id="sc-int-body"
                    rows={3}
                    value={String(draft.body ?? "")}
                    onChange={(next) => setDraft((d) => ({ ...d, body: next }))}
                    placeholder="Escolha uma das opções abaixo:"
                    options={variableShortcutOptions}
                  />
                  <VariableShortcutHint />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-int-header">Cabeçalho (opcional)</Label>
                  <Input
                    id="sc-int-header"
                    value={String(draft.header ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, header: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Botões (máx. 3) — cada um leva a um passo diferente</Label>
                  <div className="flex flex-col gap-3">
                    {buttons.map((btn, idx) => (
                      <div key={idx} className="rounded-md border border-border p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={btn.title ?? ""}
                            onChange={(e) => {
                              const next = [...buttons];
                              next[idx] = { ...next[idx], title: e.target.value, id: next[idx].id || `btn_${idx}` };
                              setDraft((d) => ({ ...d, buttons: next }));
                            }}
                            placeholder={`Texto do botão ${idx + 1}`}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            onClick={() => {
                              const next = buttons.filter((_, i) => i !== idx);
                              setDraft((d) => ({ ...d, buttons: next }));
                            }}
                          >
                            <span className="text-lg text-destructive">×</span>
                          </Button>
                        </div>
                        <DropdownGlass
                          triggerClassName="w-full"
                          value={btn.gotoStepId ?? ""}
                          options={[
                            { value: "", label: "→ Próximo passo (linear)" },
                            ...otherSteps.map((s) => ({
                              value: s.id,
                              label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                            })),
                          ]}
                          onValueChange={(v) => {
                            const next = [...buttons];
                            next[idx] = { ...next[idx], gotoStepId: v };
                            setDraft((d) => ({ ...d, buttons: next }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  {buttons.length < 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setDraft((d) => ({
                        ...d,
                        buttons: [...buttons, { id: `btn_${buttons.length}`, title: "", gotoStepId: "" }],
                      }))}
                    >
                      + Adicionar botão
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Se a resposta não bater com nenhum botão</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    value={String(draft.elseGotoStepId ?? "")}
                    options={[
                      { value: "", label: "→ Próximo passo (linear)" },
                      ...otherSteps.map((s) => ({
                        value: s.id,
                        label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                      })),
                    ]}
                    onValueChange={(v) => setDraft((d) => ({ ...d, elseGotoStepId: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-int-var">Salvar resposta em variável</Label>
                  <Input
                    id="sc-int-var"
                    value={String(draft.saveToVariable ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, saveToVariable: e.target.value }))}
                    placeholder="Ex.: opcao_escolhida"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-int-footer">Rodapé (opcional)</Label>
                  <Input
                    id="sc-int-footer"
                    value={String(draft.footer ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, footer: e.target.value }))}
                  />
                </div>
                {(() => {
                  const tMs = Number(draft.timeoutMs ?? 86_400_000);
                  const tHours = Math.floor(tMs / 3_600_000);
                  const tMinutes = Math.floor((tMs % 3_600_000) / 60_000);
                  return (
                    <div className="space-y-2 border-t border-border pt-3">
                      <Label>Sem resposta em</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-center gap-0.5">
                          <Input
                            type="number"
                            min={0}
                            max={999}
                            className="w-16 text-center"
                            value={tHours}
                            onChange={(e) => {
                              const h = Math.max(0, Number(e.target.value) || 0);
                              setDraft((d) => ({ ...d, timeoutMs: h * 3_600_000 + tMinutes * 60_000 }));
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">horas</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <Input
                            type="number"
                            min={0}
                            max={59}
                            className="w-16 text-center"
                            value={tMinutes}
                            onChange={(e) => {
                              const m = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                              setDraft((d) => ({ ...d, timeoutMs: tHours * 3_600_000 + m * 60_000 }));
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">min</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Evita que o fluxo fique parado esperando resposta indefinidamente.
                      </p>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  <Label htmlFor="sc-int-tact">Se ninguém responder</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    value={String(draft.timeoutAction ?? "continue")}
                    options={[
                      { value: "continue", label: "Continuar fluxo (próximo passo)" },
                      { value: "stop", label: "Encerrar automação" },
                      { value: "goto", label: "Ir para passo" },
                    ]}
                    onValueChange={(v) => setDraft((d) => ({ ...d, timeoutAction: v }))}
                  />
                </div>
                {String(draft.timeoutAction) === "goto" && (
                  <div className="space-y-2">
                    <Label htmlFor="sc-int-tgt">Ir para (no timeout)</Label>
                    <DropdownGlass
                      triggerClassName="w-full"
                      placeholder="Selecione…"
                      value={String(draft.timeoutGotoStepId ?? "")}
                      options={otherSteps.map((s) => ({
                        value: s.id,
                        label: `${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                      }))}
                      onValueChange={(v) => setDraft((d) => ({ ...d, timeoutGotoStepId: v }))}
                    />
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  O bot pausa e aguarda o cliente clicar em um botão. Cada botão pode levar a um passo diferente.
                </p>
              </>
            );
          })()}

          {step.type === "webhook" && (
            <WebhookStepConfig draft={draft} setDraft={setDraft} />
          )}

          {step.type === "delay" && (() => {
            const ui = delayToUi(step.config);
            const duration = String(draft.duration ?? ui.duration);
            const unit = String(draft.unit ?? ui.unit);
            return (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sc-delay-n">Duração</Label>
                  <Input
                    id="sc-delay-n"
                    type="number"
                    min={0}
                    value={duration}
                    onChange={(e) => setDraft((d) => ({ ...d, duration: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-delay-u">Unidade</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    value={unit}
                    options={[
                      { value: "minutes", label: "Minutos" },
                      { value: "hours", label: "Horas" },
                      { value: "days", label: "Dias" },
                    ]}
                    onValueChange={(v) => setDraft((d) => ({ ...d, unit: v }))}
                  />
                </div>
              </>
            );
          })()}

          {step.type === "condition" && (
            <ConditionStepConfig
              draft={draft}
              setDraft={setDraft}
              allSteps={allSteps}
              currentStepId={step.id}
            />
          )}

          {step.type === "update_lead_score" && (
            <p className="text-sm text-muted-foreground">Recalcular Lead Score do contato no contexto.</p>
          )}

          {step.type === "wait_for_reply" && (() => {
            const otherSteps = allSteps.filter((s) => s.id !== step.id);
            const timeoutMs = Number(draft.timeoutMs ?? 60000);
            const hours = Math.floor(timeoutMs / 3_600_000);
            const minutes = Math.floor((timeoutMs % 3_600_000) / 60_000);
            const seconds = Math.floor((timeoutMs % 60_000) / 1000);
            return (
              <>
                <p className="text-sm font-medium text-foreground">
                  O fluxo pausa e aguarda o cliente responder.
                </p>
                <div className="space-y-2">
                  <Label>Cronômetro (tempo limite)</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-0.5">
                      <Input
                        type="number"
                        min={0}
                        max={999}
                        className="w-16 text-center"
                        value={hours}
                        onChange={(e) => {
                          const h = Math.max(0, Number(e.target.value) || 0);
                          setDraft((d) => ({ ...d, timeoutMs: h * 3_600_000 + minutes * 60_000 + seconds * 1000 }));
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">horas</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        className="w-16 text-center"
                        value={minutes}
                        onChange={(e) => {
                          const m = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                          setDraft((d) => ({ ...d, timeoutMs: hours * 3_600_000 + m * 60_000 + seconds * 1000 }));
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">min</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        className="w-16 text-center"
                        value={seconds}
                        onChange={(e) => {
                          const s = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                          setDraft((d) => ({ ...d, timeoutMs: hours * 3_600_000 + minutes * 60_000 + s * 1000 }));
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">seg</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sc-wfr-var">Salvar resposta em variável</Label>
                  <Input
                    id="sc-wfr-var"
                    value={String(draft.saveToVariable ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, saveToVariable: e.target.value }))}
                    placeholder="Ex.: lastResponse"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Até a mensagem recebida → ir para</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    value={String(draft.receivedGotoStepId ?? "")}
                    options={[
                      { value: "", label: "Próximo passo (linear)" },
                      ...otherSteps.map((s) => ({
                        value: s.id,
                        label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                      })),
                    ]}
                    onValueChange={(v) => setDraft((d) => ({ ...d, receivedGotoStepId: v }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Sem resposta (timeout) → ir para</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    value={String(draft.timeoutGotoStepId ?? "")}
                    options={[
                      { value: "", label: "Próximo passo (linear)" },
                      ...otherSteps.map((s) => ({
                        value: s.id,
                        label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                      })),
                    ]}
                    onValueChange={(v) => setDraft((d) => ({ ...d, timeoutGotoStepId: v }))}
                  />
                </div>
              </>
            );
          })()}

          {step.type === "question" && (() => {
            const buttons = Array.isArray(draft.buttons) ? (draft.buttons as { text: string; gotoStepId: string }[]) : [];
            const otherSteps = allSteps.filter((s) => s.id !== step.id);
            return (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sc-q-msg">Mensagem enviada ao lead</Label>
                  <VariableShortcutTextarea
                    id="sc-q-msg"
                    rows={3}
                    value={String(draft.message ?? "")}
                    onChange={(next) => setDraft((d) => ({ ...d, message: next }))}
                    placeholder="Ex.: Qual o seu nome completo?"
                    options={variableShortcutOptions}
                  />
                  <VariableShortcutHint />
                  <p className="text-[11px] text-muted-foreground">
                    Use variáveis: {"{{nome}}"}, {"{{telefone}}"}, {"{{campo_x}}"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Botões de resposta — cada um leva a um passo</Label>
                  <div className="flex flex-col gap-3">
                    {buttons.map((btn, idx) => (
                      <div key={idx} className="rounded-md border border-border p-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={btn.text}
                            onChange={(e) => {
                              const next = [...buttons];
                              next[idx] = { ...next[idx], text: e.target.value };
                              setDraft((d) => ({ ...d, buttons: next }));
                            }}
                            placeholder={`Texto do botão ${idx + 1}`}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            onClick={() => {
                              const next = buttons.filter((_, i) => i !== idx);
                              setDraft((d) => ({ ...d, buttons: next }));
                            }}
                          >
                            <span className="text-lg text-destructive">×</span>
                          </Button>
                        </div>
                        <DropdownGlass
                          triggerClassName="w-full"
                          value={btn.gotoStepId ?? ""}
                          options={[
                            { value: "", label: "→ Próximo passo (linear)" },
                            ...otherSteps.map((s) => ({
                              value: s.id,
                              label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                            })),
                          ]}
                          onValueChange={(v) => {
                            const next = [...buttons];
                            next[idx] = { ...next[idx], gotoStepId: v };
                            setDraft((d) => ({ ...d, buttons: next }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setDraft((d) => ({
                      ...d,
                      buttons: [...buttons, { text: "", gotoStepId: "" }],
                    }))}
                  >
                    + Adicionar botão
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sc-q-var">Salvar resposta em variável</Label>
                  <Input
                    id="sc-q-var"
                    value={String(draft.saveToVariable ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, saveToVariable: e.target.value }))}
                    placeholder="Ex.: resposta_nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Se a resposta não bater com nenhum botão</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    value={String(draft.elseGotoStepId ?? "")}
                    options={[
                      { value: "", label: "→ Próximo passo (linear)" },
                      ...otherSteps.map((s) => ({
                        value: s.id,
                        label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                      })),
                    ]}
                    onValueChange={(v) => setDraft((d) => ({ ...d, elseGotoStepId: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-q-timeout">Timeout (horas)</Label>
                  <Input
                    id="sc-q-timeout"
                    type="number"
                    min={1}
                    value={String(Math.round(Number(draft.timeoutMs ?? 86_400_000) / 3_600_000))}
                    onChange={(e) => setDraft((d) => ({ ...d, timeoutMs: Number(e.target.value) * 3_600_000 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-q-tact">Ação ao expirar</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    value={String(draft.timeoutAction ?? "continue")}
                    options={[
                      { value: "continue", label: "Continuar fluxo" },
                      { value: "stop", label: "Parar fluxo" },
                      { value: "retry", label: "Reenviar pergunta" },
                      { value: "goto", label: "Ir para step" },
                    ]}
                    onValueChange={(v) => setDraft((d) => ({ ...d, timeoutAction: v }))}
                  />
                </div>
                {String(draft.timeoutAction) === "goto" && (
                  <div className="space-y-2">
                    <Label htmlFor="sc-q-tgt">Ir para (no timeout)</Label>
                    <DropdownGlass
                      triggerClassName="w-full"
                      placeholder="Selecione…"
                      value={String(draft.timeoutGotoStepId ?? "")}
                      options={otherSteps.map((s) => ({
                        value: s.id,
                        label: `${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                      }))}
                      onValueChange={(v) => setDraft((d) => ({ ...d, timeoutGotoStepId: v }))}
                    />
                  </div>
                )}
              </>
            );
          })()}

          {step.type === "set_variable" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="sc-sv-name">Nome da variável</Label>
                <Input
                  id="sc-sv-name"
                  value={String(draft.variableName ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, variableName: e.target.value }))}
                  placeholder="Ex.: cidade_lead"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-sv-val">Valor</Label>
                <Input
                  id="sc-sv-val"
                  value={String(draft.value ?? "")}
                  onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                  placeholder="Texto fixo ou {{variavel}}"
                />
              </div>
            </>
          )}

          {step.type === "finish" && (
            <p className="text-sm text-muted-foreground">
              Este passo encerra o fluxo da automação. O contexto será marcado como COMPLETED.
            </p>
          )}

          {step.type === "goto" && (() => {
            const otherSteps = allSteps.filter((s) => s.id !== step.id);
            return (
              <div className="space-y-2">
                <Label htmlFor="sc-gt-target">Ir para qual passo?</Label>
                <DropdownGlass
                  triggerClassName="w-full"
                  placeholder="Selecione…"
                  value={String(draft.targetStepId ?? "")}
                  options={otherSteps.map((s) => ({
                    value: s.id,
                    label: `${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                  }))}
                  onValueChange={(v) => setDraft((d) => ({ ...d, targetStepId: v }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Permite criar loops e desvios no fluxo.
                </p>
              </div>
            );
          })()}

          {step.type === "transfer_automation" && (
            <TransferAutomationConfig
              draft={draft}
              setDraft={setDraft}
              currentAutomationId={step.id}
            />
          )}

          {step.type === "create_deal" && (() => {
            const pipelines = pipelinesQuery.data ?? [];
            const allStages = pipelines.flatMap((p) =>
              p.stages.map((s) => ({ ...s, pipelineName: p.name }))
            );
            return (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sc-cd-title">Título do negócio</Label>
                  <Input
                    id="sc-cd-title"
                    value={String(draft.title ?? "Novo negócio")}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-cd-stage">Estágio</Label>
                  {allStages.length === 0 ? (
                    <Input
                      id="sc-cd-stage"
                      value={String(draft.stageId ?? "")}
                      onChange={(e) => setDraft((d) => ({ ...d, stageId: e.target.value }))}
                      placeholder="ID do estágio"
                    />
                  ) : (
                    <DropdownGlass
                      triggerClassName="w-full"
                      placeholder="Selecione…"
                      value={String(draft.stageId ?? "")}
                      options={pipelines.flatMap((p) =>
                        p.stages.map((s) => ({
                          value: s.id,
                          label: s.name,
                          description: p.name,
                        }))
                      )}
                      onValueChange={(v) => setDraft((d) => ({ ...d, stageId: v }))}
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-cd-value">Valor (R$)</Label>
                  <Input
                    id="sc-cd-value"
                    type="number"
                    min={0}
                    value={String(draft.value ?? 0)}
                    onChange={(e) => setDraft((d) => ({ ...d, value: Number(e.target.value) }))}
                  />
                </div>
              </>
            );
          })()}

          {step.type === "finish_conversation" && (
            <p className="text-sm text-muted-foreground">
              Encerra todas as conversas abertas do contato, marcando-as como resolvidas.
            </p>
          )}

          {step.type === "tabulate_conversation" && (
            <TabulationStepConfig
              config={draft}
              onChange={(next) => setDraft(() => next)}
            />
          )}

          {step.type === "consume_stock" && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              <p>
                Reduz o estoque dos produtos vinculados ao negócio, pela quantidade de cada item.
                Só age em produtos com <strong className="text-foreground">controle de estoque</strong> ativado.
              </p>
              <p>
                Use este passo com um gatilho como <strong className="text-foreground">Negócio ganho</strong>{" "}
                ou entrada em um estágio. Sem este passo, nenhum estoque é baixado.
              </p>
              <p>
                Se algum produto não tiver saldo suficiente, o passo é{" "}
                <strong className="text-foreground">bloqueado</strong> (nada é baixado, sem estoque negativo).
              </p>
            </div>
          )}

          {step.type === "execute_distribution" && (
            <div className="space-y-3">
              <p className="rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
                Distribui o lead entre os responsáveis elegíveis usando a
                Distribuição Inteligente — a mesma regra da tela e da simulação.
                Não força atribuição.
              </p>
              <div className="rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
                <p className="mb-1.5 font-semibold text-[var(--text-default)]">
                  Funciona como um IF (Sim / Não):
                </p>
                <ul className="space-y-1">
                  <li>
                    <span className="font-semibold text-[var(--color-success-text)]">Distribuído</span>{" "}
                    (saída verde) — havia agente disponível e o lead foi atribuído.
                  </li>
                  <li>
                    <span className="font-semibold text-[var(--color-danger-text)]">Sem agente</span>{" "}
                    (saída vermelha) — ninguém elegível no momento; o lead entra na
                    fila de espera e você escolhe o que fazer aqui.
                  </li>
                </ul>
                <p className="mt-1.5 text-[11px] opacity-80">
                  Conecte cada saída do bloco no canvas para definir os próximos passos.
                </p>
              </div>
              <ExecuteDistributionDeptsDraft draft={draft} setDraft={setDraft} />
              <div className="space-y-2">
                <Label htmlFor="sc-dist-type">Tipo / segmento (opcional)</Label>
                <Input
                  id="sc-dist-type"
                  value={String(draft.distributionType ?? "")}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, distributionType: e.target.value }))
                  }
                  placeholder="ex.: inbound, vendas, suporte"
                />
              </div>
            </div>
          )}

          {step.type === "business_hours" && (() => {
            const schedule = Array.isArray(draft.schedule)
              ? (draft.schedule as { days: number[]; from: string; to: string }[])
              : [];
            const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
            const otherSteps = allSteps.filter((s) => s.id !== step.id);
            return (
              <>
                <div className="space-y-2">
                  <Label>Horários de funcionamento</Label>
                  {schedule.map((slot, idx) => (
                    <div key={idx} className="rounded-md border border-border p-2 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {DAY_LABELS.map((d, dayIdx) => {
                          const active = slot.days?.includes(dayIdx);
                          return (
                            <button
                              key={dayIdx}
                              type="button"
                              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                active
                                  ? "bg-primary text-white"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                              onClick={() => {
                                const next = [...schedule];
                                const days = active
                                  ? slot.days.filter((x) => x !== dayIdx)
                                  : [...(slot.days ?? []), dayIdx].sort();
                                next[idx] = { ...next[idx], days };
                                setDraft((d) => ({ ...d, schedule: next }));
                              }}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          className="w-28"
                          value={slot.from ?? "09:00"}
                          onChange={(e) => {
                            const next = [...schedule];
                            next[idx] = { ...next[idx], from: e.target.value };
                            setDraft((d) => ({ ...d, schedule: next }));
                          }}
                        />
                        <span className="text-xs text-muted-foreground">até</span>
                        <Input
                          type="time"
                          className="w-28"
                          value={slot.to ?? "18:00"}
                          onChange={(e) => {
                            const next = [...schedule];
                            next[idx] = { ...next[idx], to: e.target.value };
                            setDraft((d) => ({ ...d, schedule: next }));
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          onClick={() => {
                            const next = schedule.filter((_, i) => i !== idx);
                            setDraft((d) => ({ ...d, schedule: next }));
                          }}
                        >
                          <span className="text-destructive">×</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setDraft((d) => ({
                      ...d,
                      schedule: [...schedule, { days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" }],
                    }))}
                  >
                    + Adicionar faixa horária
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-bh-tz">Fuso horário</Label>
                  <Input
                    id="sc-bh-tz"
                    value={String(draft.timezone ?? "America/Sao_Paulo")}
                    onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fora do horário → ir para</Label>
                  <DropdownGlass
                    triggerClassName="w-full"
                    value={String(draft.elseStepId ?? "")}
                    options={[
                      { value: "", label: "Encerrar fluxo" },
                      ...otherSteps.map((s) => ({
                        value: s.id,
                        label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                      })),
                    ]}
                    onValueChange={(v) => setDraft((d) => ({ ...d, elseStepId: v }))}
                  />
                </div>
              </>
            );
          })()}

          {step.type === "ask_ai_agent" && (
            <AskAIAgentStepConfig draft={draft} setDraft={setDraft} />
          )}

          {step.type === "stop_automation" && (
            <p className="text-sm text-muted-foreground">
              Encerra a automação atual imediatamente. Nenhum passo posterior será executado e o contexto do contato será finalizado.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CONDITION_OP_OPTIONS: { value: ConditionOp; label: string }[] = [
  { value: "eq", label: "Igual a" },
  { value: "ne", label: "Diferente de" },
  { value: "includes", label: "Contém" },
  { value: "starts_with", label: "Começa com" },
  { value: "ends_with", label: "Termina com" },
  { value: "gt", label: "Maior que" },
  { value: "gte", label: "Maior ou igual" },
  { value: "lt", label: "Menor que" },
  { value: "lte", label: "Menor ou igual" },
  { value: "empty", label: "Está vazio" },
  { value: "not_empty", label: "Não está vazio" },
  { value: "has_tag", label: "Tem a tag" },
  { value: "not_has_tag", label: "Não tem a tag" },
];

// Campos cuja semântica natural é "checagem de tag" — quando o usuário
// escolhe um desses, restringimos os ops disponíveis pros relevantes pra
// evitar configurações sem sentido (ex.: "tags eq 5" não faz nada).
const TAG_FIELDS = new Set<string>([
  "contact.tags",
  "deal.tags",
]);

function opsForField(field: string): { value: ConditionOp; label: string }[] {
  if (TAG_FIELDS.has(field)) {
    return [
      { value: "has_tag", label: "Tem a tag" },
      { value: "not_has_tag", label: "Não tem a tag" },
      { value: "empty", label: "Sem tags" },
      { value: "not_empty", label: "Tem alguma tag" },
    ];
  }
  // Para outros campos, escondemos os ops específicos de tag (que não
  // têm sentido fora do contexto de tags).
  return CONDITION_OP_OPTIONS.filter(
    (o) => o.value !== "has_tag" && o.value !== "not_has_tag",
  );
}

// Catálogo de campos disponíveis para avaliação em condições, alinhado com
// `evalRoot` no `automation-executor.ts` (contact / deal / data / event /
// variables). Se o executor ganhar novos campos, atualize aqui.
type FieldOption = { value: string; label: string; hint?: string };
type FieldGroup = { label: string; options: FieldOption[] };

const CONDITION_FIELD_GROUPS: FieldGroup[] = [
  {
    label: "Contato",
    options: [
      { value: "contact.name", label: "Nome" },
      { value: "contact.email", label: "Email" },
      { value: "contact.phone", label: "Telefone" },
      { value: "contact.leadScore", label: "Lead score", hint: "numérico" },
      { value: "contact.lifecycleStage", label: "Etapa do ciclo" },
      { value: "contact.source", label: "Origem" },
      // 27/mai/26 — Campo de tags. Junto com os ops `has_tag` /
      // `not_has_tag`, permite criar branches do tipo "se o contato
      // tem a tag X". O picker de valor mostra um dropdown puxando
      // `/api/tags`.
      { value: "contact.tags", label: "Tags do contato", hint: "tem / não tem" },
      { value: "contact.whatsappJid", label: "WhatsApp JID" },
      { value: "contact.companyId", label: "ID da empresa" },
      { value: "contact.assignedToId", label: "ID do responsável" },
    ],
  },
  {
    label: "Negócio (Deal)",
    options: [
      { value: "deal.title", label: "Título" },
      { value: "deal.value", label: "Valor", hint: "numérico" },
      { value: "deal.status", label: "Status", hint: "OPEN / WON / LOST" },
      // Preferimos comparar por NOME (a UI tem os nomes mapeados); os
      // campos por ID ficam como "avançado" mais abaixo pra quem
      // precisa.
      { value: "deal.stageName", label: "Etapa (nome)" },
      { value: "deal.pipelineName", label: "Pipeline (nome)" },
      { value: "deal.tags", label: "Tags do negócio", hint: "tem / não tem" },
      { value: "deal.lostReason", label: "Motivo da perda" },
    ],
  },
  {
    label: "Conversa",
    options: [
      { value: "conversation.status", label: "Status da conversa" },
      {
        value: "conversation.isClosed",
        label: "Conversa fechada?",
        hint: "sim / não",
      },
      { value: "conversation.channel", label: "Canal", hint: "whatsapp, email…" },
      {
        value: "conversation.departmentId",
        label: "Departamento",
        hint: "é / não é",
      },
      {
        value: "conversation.hasError",
        label: "Tem erro de envio?",
        hint: "sim / não",
      },
      {
        value: "conversation.hasAgentReply",
        label: "Agente já respondeu?",
        hint: "sim / não",
      },
      {
        value: "conversation.unreadCount",
        label: "Mensagens não lidas",
        hint: "numérico",
      },
    ],
  },
  {
    label: "Mensagem / Evento",
    options: [
      { value: "data.content", label: "Conteúdo da mensagem" },
      { value: "data.text", label: "Texto" },
      { value: "data.direction", label: "Direção", hint: "in / out" },
      { value: "data.messageType", label: "Tipo da mensagem" },
      { value: "event.type", label: "Tipo do evento" },
      { value: "event.channel", label: "Canal" },
    ],
  },
  {
    label: "Avançado (por ID)",
    options: [
      { value: "deal.stageId", label: "ID da etapa" },
      { value: "deal.pipelineId", label: "ID do pipeline" },
    ],
  },
];

/**
 * Extrai variáveis declaradas em steps `set_variable` que ocorrem ANTES do
 * step de condição atual (apenas essas são garantidamente atribuídas no
 * runtime). Não olha ramificações, só a ordem linear em `allSteps` — é uma
 * aproximação útil; se o usuário precisar de algo fora disso, o campo
 * "Personalizado" permite digitar `variables.<qualquer coisa>`.
 */
function collectDeclaredVariables(
  allSteps: AutomationStep[],
  currentStepId: string,
): FieldOption[] {
  const out: FieldOption[] = [];
  const seen = new Set<string>();
  for (const s of allSteps) {
    if (s.id === currentStepId) break;
    if (s.type !== "set_variable") continue;
    const cfg = (s.config ?? {}) as Record<string, unknown>;
    const raw =
      (typeof cfg.variableName === "string" && cfg.variableName) ||
      (typeof cfg.name === "string" && cfg.name) ||
      "";
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ value: `variables.${name}`, label: name });
  }
  return out;
}

/**
 * Seletor de campo para condições. Apresenta os campos conhecidos em
 * optgroups (contact/deal/message/variáveis) e fallback para entrada livre
 * via modo "Personalizado" — assim o usuário comum não precisa memorizar
 * paths, mas o poder de digitar qualquer path continua disponível.
 */
function ConditionFieldPicker({
  value,
  onChange,
  declaredVariables,
}: {
  value: string;
  onChange: (next: string) => void;
  declaredVariables: FieldOption[];
}) {
  const CUSTOM = "__custom__";

  const customFieldsQuery = useQuery({
    queryKey: ["custom-fields-for-condition"],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const [contactRes, dealRes] = await Promise.all([
        fetch(apiUrl("/api/custom-fields?entity=contact")),
        fetch(apiUrl("/api/custom-fields?entity=deal")),
      ]);
      const contacts: CustomFieldOption[] = contactRes.ok ? await contactRes.json() : [];
      const deals: CustomFieldOption[] = dealRes.ok ? await dealRes.json() : [];
      return { contacts, deals };
    },
  });

  const customFieldGroups = useMemo<FieldGroup[]>(() => {
    const contacts = (customFieldsQuery.data?.contacts ?? [])
      .filter((f) => (f.name || "").trim())
      .map((f) => ({
        value: `contactCustomFields.${f.name}`,
        label: f.label || f.name,
        hint: f.name,
      }));
    const deals = (customFieldsQuery.data?.deals ?? [])
      .filter((f) => (f.name || "").trim())
      .map((f) => ({
        value: `dealCustomFields.${f.name}`,
        label: f.label || f.name,
        hint: f.name,
      }));
    const groups: FieldGroup[] = [];
    if (contacts.length > 0) {
      groups.push({ label: "Campos personalizados (contato)", options: contacts });
    }
    if (deals.length > 0) {
      groups.push({ label: "Campos personalizados (negócio)", options: deals });
    }
    return groups;
  }, [customFieldsQuery.data]);

  const allGroups = useMemo(
    () => [...CONDITION_FIELD_GROUPS, ...customFieldGroups],
    [customFieldGroups],
  );

  const knownValues = useMemo(() => {
    const set = new Set<string>();
    for (const g of allGroups) {
      for (const o of g.options) set.add(o.value);
    }
    for (const o of declaredVariables) set.add(o.value);
    return set;
  }, [allGroups, declaredVariables]);

  // Valor que não está na lista (e não vazio) → entra no modo customizado,
  // preservando o que o usuário tinha digitado antes.
  const isCustom = value.length > 0 && !knownValues.has(value);
  const [customMode, setCustomMode] = useState<boolean>(isCustom);

  useEffect(() => {
    if (isCustom) setCustomMode(true);
  }, [isCustom]);

  if (customMode) {
    return (
      <div className="flex gap-1">
        <Input
          placeholder="ex.: contactCustomFields.cidade"
          className="h-9 flex-1 text-[12px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-[11px] text-muted-foreground"
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
        >
          ← Lista
        </Button>
      </div>
    );
  }

  return (
    <DropdownGlass
      triggerClassName="h-9 text-[12px] w-full"
      placeholder="Selecione um campo…"
      value={value}
      options={[
        ...allGroups.flatMap((group) =>
          group.options.map((opt) => ({
            value: opt.value,
            label: opt.hint ? `${opt.label} (${opt.hint})` : opt.label,
            description: group.label,
          })),
        ),
        ...declaredVariables.map((opt) => ({
          value: opt.value,
          label: opt.label,
          description: "Variáveis do fluxo",
        })),
        { value: CUSTOM, label: "✏ Personalizado…" },
      ]}
      onValueChange={(v) => {
        if (v === CUSTOM) {
          setCustomMode(true);
          onChange("");
          return;
        }
        onChange(v);
      }}
    />
  );
}

/**
 * Picker de valor para condições: quando o campo avaliado é um ID
 * conhecido (stage, pipeline, company, user, enums) mostramos um
 * select específico, buscando a lista no backend. Caso contrário,
 * cai num `<Input>` de texto livre — mesmo comportamento antigo.
 *
 * Mantemos o valor salvo como o ID bruto (ou o enum string) pra que
 * o `evalRoot` do executor continue comparando contra o mesmo path
 * que ele lê em runtime (contact.companyId é o ID, não o nome).
 */
function ConditionValueInput({
  field,
  value,
  onChange,
}: {
  field: string;
  value: unknown;
  onChange: (next: string) => void;
}) {
  const str = value === null || value === undefined ? "" : String(value);
  // Hook incondicional — o `if` abaixo decide qual JSX retorna, não se o
  // hook roda (evita violar as regras de hooks).
  const { byPath: customFieldMeta } = useCustomFieldConditionMeta();

  if (field === "contact.tags" || field === "deal.tags") {
    return <TagPickerValue value={str} onChange={onChange} />;
  }
  if (field === "deal.stageId") {
    return <StagePickerValue value={str} onChange={onChange} />;
  }
  if (field === "deal.pipelineId") {
    return <PipelinePickerValue value={str} onChange={onChange} />;
  }
  // Versões "por nome": salvamos o NOME (string) no rule.value para
  // sobreviver à recriação de estágio/pipeline. O executor compara
  // contra `deal.stageName` / `deal.pipelineName` populados em runtime.
  if (field === "deal.stageName") {
    return <StageNamePickerValue value={str} onChange={onChange} />;
  }
  if (field === "deal.pipelineName") {
    return <PipelineNamePickerValue value={str} onChange={onChange} />;
  }
  if (field === "contact.companyId") {
    return <CompanyPickerValue value={str} onChange={onChange} />;
  }
  if (field === "contact.assignedToId") {
    return <OwnerPickerValue value={str} onChange={onChange} />;
  }
  if (field === "conversation.departmentId") {
    return <DepartmentPickerValue value={str} onChange={onChange} />;
  }
  if (field === "conversation.status") {
    return (
      <DropdownGlass
        triggerClassName="h-9 text-[12px] w-full"
        placeholder="Selecione…"
        value={str}
        options={[
          { value: "", label: "Selecione…" },
          { value: "OPEN", label: "Em aberto (OPEN)" },
          { value: "RESOLVED", label: "Fechada / Resolvida (RESOLVED)" },
          { value: "PENDING", label: "Pendente (PENDING)" },
          { value: "SNOOZED", label: "Adiada (SNOOZED)" },
        ]}
        onValueChange={onChange}
      />
    );
  }
  if (
    field === "conversation.isClosed" ||
    field === "conversation.hasError" ||
    field === "conversation.hasAgentReply"
  ) {
    return (
      <DropdownGlass
        triggerClassName="h-9 text-[12px] w-full"
        placeholder="Selecione…"
        value={str}
        options={[
          { value: "", label: "Selecione…" },
          { value: "true", label: "Sim" },
          { value: "false", label: "Não" },
        ]}
        onValueChange={onChange}
      />
    );
  }
  if (field === "conversation.channel") {
    return (
      <DropdownGlass
        triggerClassName="h-9 text-[12px] w-full"
        placeholder="Selecione…"
        value={str}
        options={[
          { value: "", label: "Selecione…" },
          { value: "whatsapp", label: "WhatsApp" },
          { value: "email", label: "E-mail" },
          { value: "telegram", label: "Telegram" },
          { value: "instagram", label: "Instagram" },
          { value: "webchat", label: "Web chat" },
        ]}
        onValueChange={onChange}
      />
    );
  }
  if (field === "deal.status") {
    return (
      <DropdownGlass
        triggerClassName="h-9 text-[12px] w-full"
        placeholder="Selecione…"
        value={str}
        options={[
          { value: "", label: "Selecione…" },
          { value: "OPEN", label: "Aberto (OPEN)" },
          { value: "WON", label: "Ganho (WON)" },
          { value: "LOST", label: "Perdido (LOST)" },
        ]}
        onValueChange={onChange}
      />
    );
  }
  if (field === "contact.lifecycleStage") {
    return (
      <DropdownGlass
        triggerClassName="h-9 text-[12px] w-full"
        placeholder="Selecione…"
        value={str}
        options={[
          { value: "", label: "Selecione…" },
          { value: "SUBSCRIBER", label: "Assinante" },
          { value: "LEAD", label: "Lead" },
          { value: "MQL", label: "MQL" },
          { value: "SQL", label: "SQL" },
          { value: "OPPORTUNITY", label: "Oportunidade" },
          { value: "CUSTOMER", label: "Cliente" },
          { value: "EVANGELIST", label: "Evangelista" },
          { value: "OTHER", label: "Outro" },
        ]}
        onValueChange={onChange}
      />
    );
  }

  const customMeta = customFieldMeta.get(field);
  if (customMeta?.type === "BOOLEAN") {
    return (
      <DropdownGlass
        triggerClassName="h-9 text-[12px] w-full"
        placeholder="Selecione…"
        value={str}
        options={[
          { value: "", label: "Selecione…" },
          { value: "true", label: "Sim" },
          { value: "false", label: "Não" },
        ]}
        onValueChange={onChange}
      />
    );
  }
  if (
    (customMeta?.type === "SELECT" || customMeta?.type === "MULTI_SELECT") &&
    customMeta.options.length > 0
  ) {
    return (
      <DropdownGlass
        triggerClassName="h-9 text-[12px] w-full"
        placeholder="Selecione…"
        value={str}
        options={[
          { value: "", label: "Selecione…" },
          ...customMeta.options.map((opt) => ({ value: opt, label: opt })),
        ]}
        onValueChange={onChange}
      />
    );
  }

  return (
    <Input
      placeholder="valor"
      className="h-9 text-[12px]"
      value={str}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function StagePickerValue({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { data: pipelines = [], isLoading } = usePipelinesQuery<Pipeline>();

  if (isLoading) {
    return (
      <div className="flex h-9 items-center rounded-md border border-border bg-[var(--color-bg-subtle)] px-3 text-[11px] italic text-[var(--color-ink-muted)]">
        Carregando estágios…
      </div>
    );
  }

  return (
    <DropdownGlass
      triggerClassName="h-9 text-[12px] w-full"
      placeholder="Selecione um estágio…"
      value={value}
      options={pipelines.flatMap((p) =>
        p.stages.map((s) => ({
          value: s.id,
          label: s.name,
          description: p.name,
        }))
      )}
      onValueChange={onChange}
    />
  );
}

function PipelinePickerValue({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { data: pipelines = [], isLoading } = usePipelinesQuery<Pipeline>();

  if (isLoading) {
    return (
      <div className="flex h-9 items-center rounded-md border border-border bg-[var(--color-bg-subtle)] px-3 text-[11px] italic text-[var(--color-ink-muted)]">
        Carregando pipelines…
      </div>
    );
  }

  return (
    <DropdownGlass
      triggerClassName="h-9 text-[12px] w-full"
      placeholder="Selecione um pipeline…"
      value={value}
      options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
      onValueChange={onChange}
    />
  );
}

/**
 * Picker de valor para `contact.tags` / `deal.tags`. Lista todas as
 * tags da org (via `/api/tags`) e salva o NOME — o executor compara
 * case-insensitive contra `contact.tags` (array de nomes) ou
 * `contact.tagIds` (array de IDs), então salvar o nome funciona pra
 * ambos os arrays. Se a tag for renomeada depois, basta o operador
 * atualizar a condição (a opção de salvar id é mais resiliente, mas
 * usuário comum prefere ver nome).
 */
function TagPickerValue({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  type TagRow = { id: string; name: string; color?: string };
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags-for-condition"],
    queryFn: async (): Promise<TagRow[]> => {
      const res = await fetch(apiUrl("/api/tags"));
      if (!res.ok) return [];
      return (await res.json()) as TagRow[];
    },
    staleTime: 60_000,
  });

  const allNames = useMemo(
    () => new Set(tags.map((t) => t.name)),
    [tags],
  );
  const isCustom = value.length > 0 && !allNames.has(value);

  if (isLoading) {
    return (
      <div className="flex h-9 items-center rounded-md border border-border bg-[var(--color-bg-subtle)] px-3 text-[11px] italic text-[var(--color-ink-muted)]">
        Carregando tags…
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <Input
        placeholder="Nome da tag"
        className="h-9 text-[12px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <DropdownGlass
      triggerClassName="h-9 text-[12px] w-full"
      placeholder="Selecione uma tag…"
      value={value}
      options={[
        ...tags.map((t) => ({ value: t.name, label: t.name })),
        ...(isCustom ? [{ value: value, label: `${value} (valor personalizado)` }] : []),
      ]}
      onValueChange={onChange}
    />
  );
}

/**
 * Picker de estágio que salva o NOME do estágio (não o ID). Mostra os
 * pipelines como optgroups para dar contexto (um nome como "Negociação"
 * pode existir em múltiplos pipelines) — mas o valor salvo é só o nome,
 * que é o que o executor compara contra `deal.stageName`.
 *
 * Também aceita valor de texto livre (caso o estágio não exista mais ou
 * o operador queira comparar contra um valor "virtual") via fallback
 * de Input.
 */
function StageNamePickerValue({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { data: pipelines = [], isLoading } = usePipelinesQuery<Pipeline>();

  const allNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of pipelines) for (const s of p.stages) set.add(s.name);
    return set;
  }, [pipelines]);

  const isCustom = value.length > 0 && !allNames.has(value);

  if (isLoading) {
    return (
      <div className="flex h-9 items-center rounded-md border border-border bg-[var(--color-bg-subtle)] px-3 text-[11px] italic text-[var(--color-ink-muted)]">
        Carregando estágios…
      </div>
    );
  }

  return (
    <DropdownGlass
      triggerClassName="h-9 text-[12px] w-full"
      placeholder="Selecione uma etapa…"
      value={value}
      options={[
        ...pipelines.flatMap((p) =>
          p.stages.map((s) => ({
            value: s.name,
            label: s.name,
            description: p.name,
          }))
        ),
        ...(isCustom ? [{ value: value, label: `${value} (valor personalizado)` }] : []),
      ]}
      onValueChange={onChange}
    />
  );
}

/** Picker de pipeline por NOME (espelha `StageNamePickerValue`). */
function PipelineNamePickerValue({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { data: pipelines = [], isLoading } = usePipelinesQuery<Pipeline>();

  const allNames = useMemo(
    () => new Set(pipelines.map((p) => p.name)),
    [pipelines],
  );
  const isCustom = value.length > 0 && !allNames.has(value);

  if (isLoading) {
    return (
      <div className="flex h-9 items-center rounded-md border border-border bg-[var(--color-bg-subtle)] px-3 text-[11px] italic text-[var(--color-ink-muted)]">
        Carregando pipelines…
      </div>
    );
  }

  return (
    <DropdownGlass
      triggerClassName="h-9 text-[12px] w-full"
      placeholder="Selecione um pipeline…"
      value={value}
      options={[
        ...pipelines.map((p) => ({ value: p.name, label: p.name })),
        ...(isCustom ? [{ value: value, label: `${value} (valor personalizado)` }] : []),
      ]}
      onValueChange={onChange}
    />
  );
}

type CompanyOption = { id: string; name: string };

function CompanyPickerValue({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies-for-condition"],
    queryFn: async (): Promise<CompanyOption[]> => {
      const res = await fetch(apiUrl("/api/companies?perPage=100"));
      if (!res.ok) return [];
      const json = await res.json();
      const items = Array.isArray(json)
        ? json
        : Array.isArray(json.items)
          ? json.items
          : Array.isArray(json.data)
            ? json.data
            : [];
      return items.map((c: Record<string, unknown>) => ({
        id: String(c.id ?? ""),
        name: String(c.name ?? ""),
      }));
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-9 items-center rounded-md border border-border bg-[var(--color-bg-subtle)] px-3 text-[11px] italic text-[var(--color-ink-muted)]">
        Carregando empresas…
      </div>
    );
  }

  return (
    <DropdownGlass
      triggerClassName="h-9 text-[12px] w-full"
      placeholder="Selecione uma empresa…"
      value={value}
      options={companies.map((c) => ({ value: c.id, label: c.name }))}
      onValueChange={onChange}
    />
  );
}

function DepartmentPickerValue({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["automation-departments"],
    queryFn: async (): Promise<Array<{ id: string; name: string; icon?: string }>> => {
      const res = await fetch(apiUrl("/api/settings/departments"), {
        credentials: "include",
      });
      if (!res.ok) return [];
      return (await res.json()) as Array<{ id: string; name: string; icon?: string }>;
    },
    staleTime: 120_000,
  });

  return (
    <DropdownGlass
      triggerClassName="h-9 text-[12px] w-full"
      placeholder={isLoading ? "Carregando…" : "Selecione o departamento…"}
      value={value}
      options={[
        { value: "", label: "Selecione…" },
        ...departments.map((d) => ({
          value: d.id,
          label: d.name,
          icon: <DeptGlyph icon={d.icon} size={16} />,
        })),
      ]}
      onValueChange={onChange}
    />
  );
}

function OwnerPickerValue({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { data: humans = [], isLoading: loadingHumans } =
    useTeamUsersQuery<HumanUserOption>();

  const { data: agents = [], isLoading: loadingAgents } = useQuery({
    queryKey: ["automation-ai-agents-with-user"],
    queryFn: async (): Promise<AIAgentOption[]> => {
      const res = await fetch(apiUrl("/api/ai-agents"));
      if (!res.ok) return [];
      const rows = (await res.json()) as Array<{
        id: string;
        userId: string;
        name: string;
        archetype: string;
        active: boolean;
        autonomyMode: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        archetype: r.archetype,
        active: r.active,
        autonomyMode: r.autonomyMode,
      }));
    },
    staleTime: 120_000,
  });

  if (loadingHumans || loadingAgents) {
    return (
      <div className="flex h-9 items-center rounded-md border border-border bg-[var(--color-bg-subtle)] px-3 text-[11px] italic text-[var(--color-ink-muted)]">
        Carregando…
      </div>
    );
  }

  const activeAgents = agents.filter((a) => a.active);

  return (
    <DropdownGlass
      triggerClassName="h-9 text-[12px] w-full"
      placeholder="Selecione…"
      value={value}
      options={[
        ...humans.map((u) => ({ value: u.id, label: u.name, description: "Humanos" })),
        ...activeAgents.map((a) => ({ value: a.userId, label: `🤖 ${a.name}`, description: "Agentes IA" })),
      ]}
      onValueChange={onChange}
    />
  );
}

function ConditionStepConfig({
  draft,
  setDraft,
  allSteps,
  currentStepId,
}: {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
  allSteps: AutomationStep[];
  currentStepId: string;
}) {
  const branches = Array.isArray(draft.branches)
    ? (draft.branches as ConditionBranch[])
    : [];
  const otherSteps = allSteps.filter((s) => s.id !== currentStepId);
  const declaredVariables = useMemo(
    () => collectDeclaredVariables(allSteps, currentStepId),
    [allSteps, currentStepId],
  );

  const updateBranches = (next: ConditionBranch[]) => {
    setDraft((d) => ({ ...d, branches: next as unknown as Record<string, unknown>[] }));
  };

  const updateBranch = (idx: number, patch: Partial<ConditionBranch>) => {
    const next = branches.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    updateBranches(next);
  };

  const updateRule = (bIdx: number, rIdx: number, patch: Partial<ConditionRule>) => {
    const next = branches.map((b, i) => {
      if (i !== bIdx) return b;
      const rules = b.rules.map((r, j) => (j === rIdx ? { ...r, ...patch } : r));
      return { ...b, rules };
    });
    updateBranches(next);
  };

  const addRule = (bIdx: number) => {
    const next = branches.map((b, i) =>
      i === bIdx ? { ...b, rules: [...b.rules, { field: "", op: "eq" as ConditionOp, value: "" }] } : b
    );
    updateBranches(next);
  };

  const removeRule = (bIdx: number, rIdx: number) => {
    const next = branches.map((b, i) => {
      if (i !== bIdx) return b;
      return { ...b, rules: b.rules.filter((_, j) => j !== rIdx) };
    });
    updateBranches(next);
  };

  const addBranch = () => {
    updateBranches([
      ...branches,
      {
        id: newBranchId(),
        rules: [{ field: "", op: "eq", value: "" }],
      },
    ]);
  };

  const removeBranch = (idx: number) => {
    updateBranches(branches.filter((_, i) => i !== idx));
  };

  return (
    <>
      <div className="rounded-lg border border-[var(--color-cyan)]/15 bg-[var(--color-cyan-soft)] p-3">
        <p className="text-[12px] font-semibold text-[var(--text-primary)]">
          Condições em cascata
        </p>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          O fluxo avalia cada condição na ordem. A primeira que baterem todas as
          regras (E) dispara seu caminho. Se nenhuma baterem, segue o caminho{" "}
          <span className="font-semibold">Nenhuma das condições</span>.
        </p>
      </div>

      {branches.map((branch, bIdx) => (
        <div
          key={branch.id}
          className="space-y-3 rounded-lg border border-border bg-[var(--color-bg-card)] p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded bg-[var(--color-cyan-soft)] text-[11px] font-bold text-[var(--color-cyan)] ring-1 ring-[var(--color-cyan)]/15">
                {bIdx + 1}
              </span>
              <Input
                className="h-7 w-48 text-[12px]"
                placeholder="Rótulo (opcional)"
                value={branch.label ?? ""}
                onChange={(e) => updateBranch(bIdx, { label: e.target.value })}
              />
            </div>
            {branches.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive hover:bg-[var(--color-danger-bg)]"
                onClick={() => removeBranch(bIdx)}
              >
                Remover
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {branch.rules.map((rule, rIdx) => {
              // Ops válidos pro campo atual. Pra campos de tag fica
              // restrito a {has_tag, not_has_tag, empty, not_empty};
              // pros demais escondemos os ops de tag. Quando o op
              // salvo não está mais na lista (trocou de campo), cai
              // pro primeiro da lista no render — o salvo não muda
              // até o usuário escolher.
              const availableOps = opsForField(rule.field);
              const opStillValid = availableOps.some((o) => o.value === rule.op);
              const effectiveOp = opStillValid ? rule.op : availableOps[0]?.value ?? rule.op;
              return (
              <div
                key={rIdx}
                className="grid grid-cols-[minmax(0,1fr)_130px_minmax(0,1fr)_auto] items-start gap-2"
              >
                <ConditionFieldPicker
                  value={rule.field}
                  onChange={(next) => {
                    // Quando o campo muda, garante que o op continua válido.
                    // Pra campos de tag, força `has_tag` como default; pra
                    // demais, mantém o op atual se ainda for válido, senão
                    // cai pra `eq`.
                    const nextOps = opsForField(next);
                    const opValid = nextOps.some((o) => o.value === rule.op);
                    const patch: Partial<ConditionRule> = { field: next };
                    if (!opValid) {
                      patch.op = nextOps[0]?.value ?? "eq";
                      // Limpa o value pra evitar arrastar lixo do tipo
                      // anterior (ex.: número quando passou pra tag).
                      patch.value = "";
                    }
                    updateRule(bIdx, rIdx, patch);
                  }}
                  declaredVariables={declaredVariables}
                />
                <DropdownGlass
                  triggerClassName="h-9 text-[12px] w-full"
                  value={effectiveOp}
                  options={availableOps.map((o) => ({ value: o.value, label: o.label }))}
                  onValueChange={(v) =>
                    updateRule(bIdx, rIdx, { op: v as ConditionOp })
                  }
                />
                {effectiveOp === "empty" || effectiveOp === "not_empty" ? (
                  <div className="flex h-9 items-center rounded-md border border-border bg-[var(--color-bg-subtle)] px-3 text-[11px] italic text-[var(--color-ink-muted)]">
                    (sem valor)
                  </div>
                ) : (
                  <ConditionValueInput
                    field={rule.field}
                    value={rule.value}
                    onChange={(next) => updateRule(bIdx, rIdx, { value: next })}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  disabled={branch.rules.length <= 1}
                  onClick={() => removeRule(bIdx, rIdx)}
                  aria-label="Remover regra"
                >
                  <span className="text-destructive">×</span>
                </Button>
                {rIdx < branch.rules.length - 1 && (
                  <span className="col-span-4 -my-1 text-center text-[10px] font-bold tracking-widest text-[var(--color-ink-muted)]">
                    E
                  </span>
                )}
              </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => addRule(bIdx)}
            >
              + Adicionar regra (E)
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px]">Quando esta condição baterem → ir para</Label>
            <DropdownGlass
              triggerClassName="h-9 text-[12px] w-full"
              value={branch.nextStepId ?? ""}
              options={[
                { value: "", label: "Encerrar fluxo" },
                ...otherSteps.map((s) => ({
                  value: s.id,
                  label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                })),
              ]}
              onValueChange={(v) =>
                updateBranch(bIdx, { nextStepId: v || undefined })
              }
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addBranch}
      >
        + Adicionar próxima condição (OU)
      </Button>

      <div className="space-y-1.5 rounded-lg border border-[var(--color-danger)]/20 bg-[var(--color-danger-bg)]/40 p-3">
        <Label className="text-[11px] text-[var(--color-danger-text)]">
          Nenhuma das condições → ir para
        </Label>
        <DropdownGlass
          triggerClassName="h-9 text-[12px] w-full"
          value={String(draft.elseStepId ?? "")}
          options={[
            { value: "", label: "Encerrar fluxo" },
            ...otherSteps.map((s) => ({
              value: s.id,
              label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
            })),
          ]}
          onValueChange={(v) => setDraft((d) => ({ ...d, elseStepId: v }))}
        />
      </div>
    </>
  );
}

type AIAgentOption = {
  id: string;
  userId: string;
  name: string;
  archetype: string;
  active: boolean;
  autonomyMode: string;
};

type HumanUserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const ARCHETYPE_LABEL: Record<string, string> = {
  SDR: "SDR",
  ATENDIMENTO: "Atendimento",
  VENDEDOR: "Vendedor",
  SUPORTE: "Suporte",
};

function ExecuteDistributionDeptsDraft({
  draft,
  setDraft,
}: {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
}) {
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["automation-departments"],
    queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
      const res = await fetch(apiUrl("/api/settings/departments"), {
        credentials: "include",
      });
      if (!res.ok) return [];
      return (await res.json()) as Array<{ id: string; name: string }>;
    },
    staleTime: 120_000,
  });

  const selectedIds = Array.isArray(draft.departmentIds)
    ? (draft.departmentIds as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  const selected = new Set(selectedIds);

  const toggle = (id: string) => {
    const next = selected.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    const names = next
      .map((nid) => departments.find((d) => d.id === nid)?.name)
      .filter((n): n is string => !!n);
    setDraft((prev) => ({
      ...prev,
      departmentIds: next,
      departmentNames: names,
    }));
  };

  return (
    <div className="space-y-2">
      <Label>Departamentos (opcional)</Label>
      <p className="text-[11px] text-[var(--text-muted)]">
        Vazio = distribuição geral. Com seleção, só membros desses departamentos
        entram na disputa.
      </p>
      <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-2">
        {isLoading ? (
          <p className="px-1 py-2 text-[12px] text-[var(--text-muted)]">
            Carregando…
          </p>
        ) : departments.length === 0 ? (
          <p className="px-1 py-2 text-[12px] text-[var(--text-muted)]">
            Nenhum departamento cadastrado.
          </p>
        ) : (
          departments.map((d) => (
            <label
              key={d.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-[var(--glass-bg-overlay)]"
            >
              <input
                type="checkbox"
                className="size-3.5 accent-[var(--brand-primary)]"
                checked={selected.has(d.id)}
                onChange={() => toggle(d.id)}
              />
              <span className="truncate font-medium text-[var(--text-primary)]">
                {d.name}
              </span>
            </label>
          ))
        )}
      </div>
      {selectedIds.length > 0 && (
        <button
          type="button"
          className="text-[11px] font-semibold text-[var(--brand-primary)] hover:underline"
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              departmentIds: [],
              departmentNames: [],
            }))
          }
        >
          Limpar seleção ({selectedIds.length})
        </button>
      )}
    </div>
  );
}

function TransferDepartmentStepConfig({
  draft,
  setDraft,
}: {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
}) {
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["automation-departments"],
    queryFn: async (): Promise<Array<{ id: string; name: string; icon?: string }>> => {
      const res = await fetch(apiUrl("/api/settings/departments"), {
        credentials: "include",
      });
      if (!res.ok) return [];
      return (await res.json()) as Array<{ id: string; name: string; icon?: string }>;
    },
    staleTime: 120_000,
  });

  const value = String(draft.departmentId ?? "");

  return (
    <div className="space-y-2">
      <Label>Departamento de destino</Label>
      <DropdownGlass
        triggerClassName="w-full"
        placeholder={isLoading ? "Carregando…" : "Selecione o departamento…"}
        value={value}
        options={[
          { value: "", label: "Selecione…" },
          ...departments.map((d) => ({
            value: d.id,
            label: d.name,
            icon: <DeptGlyph icon={d.icon} size={16} />,
          })),
        ]}
        onValueChange={(next) => {
          const dep = departments.find((d) => d.id === next);
          setDraft((prev) => ({
            ...prev,
            departmentId: next,
            departmentName: dep?.name ?? "",
          }));
        }}
      />
      <p className="text-[11px] text-muted-foreground">
        A conversa é transferida para este departamento quando o passo executa.
      </p>
    </div>
  );
}

function AssignOwnerStepConfig({
  draft,
  setDraft,
}: {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
}) {
  const { data: humans = [], isLoading: loadingHumans } =
    useTeamUsersQuery<HumanUserOption>();

  const { data: agents = [], isLoading: loadingAgents } = useQuery({
    queryKey: ["automation-ai-agents-with-user"],
    queryFn: async (): Promise<AIAgentOption[]> => {
      const res = await fetch(apiUrl("/api/ai-agents"));
      if (!res.ok) return [];
      const rows = (await res.json()) as Array<{
        id: string;
        userId: string;
        name: string;
        archetype: string;
        active: boolean;
        autonomyMode: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        archetype: r.archetype,
        active: r.active,
        autonomyMode: r.autonomyMode,
      }));
    },
    staleTime: 120_000,
  });

  const selectedId = String(draft.userId ?? "");
  const selectedType = String(draft.userType ?? "HUMAN");
  const target = String(draft.target ?? "deal");

  const isLoading = loadingHumans || loadingAgents;
  const activeAgents = agents.filter((a) => a.active);

  const handleChange = (value: string) => {
    if (!value) {
      setDraft((d) => ({ ...d, userId: "", userLabel: "", userType: "HUMAN" }));
      return;
    }
    const human = humans.find((h) => h.id === value);
    if (human) {
      setDraft((d) => ({
        ...d,
        userId: human.id,
        userLabel: human.name,
        userType: "HUMAN",
      }));
      return;
    }
    const agent = activeAgents.find((a) => a.userId === value);
    if (agent) {
      setDraft((d) => ({
        ...d,
        userId: agent.userId,
        userLabel: agent.name,
        userType: "AI",
      }));
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="sc-owner">Responsável</Label>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando usuários…</p>
        ) : (
          <DropdownGlass
            triggerClassName="w-full"
            placeholder="Selecione…"
            value={selectedId}
            options={[
              { value: "", label: "Sem responsável (limpar)", description: "Desatribuir" },
              ...humans.map((u) => ({
                value: u.id,
                label: `${u.name} (${u.email})`,
                description: "Humanos",
              })),
              ...activeAgents.map((a) => ({
                value: a.userId,
                label: `🤖 ${a.name} · ${ARCHETYPE_LABEL[a.archetype] ?? a.archetype} · ${a.autonomyMode === "AUTONOMOUS" ? "autônomo" : "rascunho"}`,
                description: "Agentes IA (handoff automático)",
              })),
            ]}
            onValueChange={handleChange}
          />
        )}
        {!selectedId && (
          <p className="text-xs text-muted-foreground">
            Sem responsável selecionado: este passo vai <b>limpar</b> o responsável atual no alvo escolhido abaixo.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Aplicar em</Label>
        <DropdownGlass
          triggerClassName="w-full"
          value={target}
          options={[
            { value: "deal", label: "Negócio (deal) — herda no contato e nas conversas" },
            { value: "contact", label: "Contato — propaga pras conversas abertas" },
            { value: "both", label: "Ambos — negócio e contato" },
          ]}
          onValueChange={(v) => setDraft((d) => ({ ...d, target: v }))}
        />
      </div>

      {selectedType === "AI" && selectedId && (
        <div className="rounded-lg border border-[var(--color-lavender)]/30 bg-[var(--color-lavender-soft)] p-3 text-[12px] leading-relaxed text-[var(--color-text-primary)]">
          <p className="mb-1 font-semibold">
            🤖 Handoff pra agente IA
          </p>
          <p className="text-[11px]">
            A partir deste passo, o agente assume a conversa automaticamente.
            Toda mensagem que o cliente mandar vai ser respondida pelo agente,
            conforme o modo configurado:
          </p>
          <ul className="mt-1.5 space-y-0.5 text-[11px]">
            <li>
              • <b>Autônomo</b>: responde direto no WhatsApp.
            </li>
            <li>
              • <b>Rascunho</b>: gera a resposta como nota privada pro operador
              humano aprovar no inbox.
            </li>
          </ul>
          <p className="mt-1.5 text-[11px]">
            Pra devolver pro humano, o próprio agente pode usar a ferramenta
            de handoff interna, ou crie outro passo `Atribuir responsável`
            apontando pra um humano.
          </p>
        </div>
      )}
    </>
  );
}

function TransferToAIAgentStepConfig({
  draft,
  setDraft,
}: {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
}) {
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["automation-ai-agents-with-user"],
    queryFn: async (): Promise<AIAgentOption[]> => {
      const res = await fetch(apiUrl("/api/ai-agents"));
      if (!res.ok) return [];
      const rows = (await res.json()) as Array<{
        id: string;
        userId: string;
        name: string;
        archetype: string;
        active: boolean;
        autonomyMode: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        archetype: r.archetype,
        active: r.active,
        autonomyMode: r.autonomyMode,
      }));
    },
    staleTime: 120_000,
  });

  const selectedId = String(draft.agentUserId ?? "");
  const target = String(draft.target ?? "deal");
  const activeAgents = agents.filter((a) => a.active);
  const selected = activeAgents.find((a) => a.userId === selectedId);

  return (
    <>
      <div className="rounded-lg border border-[var(--color-lavender)]/30 bg-[var(--color-lavender-soft)] p-3 text-[11px] leading-relaxed text-[var(--color-text-primary)]">
        <p className="mb-1 font-semibold">Como funciona</p>
        <p>
          Este passo atribui a conversa a um <b>agente de IA</b>. A partir
          deste ponto, o agente assume o atendimento — cada nova mensagem do
          cliente é respondida pelo agente (ou rascunhada pra operador humano
          aprovar, se o modo for DRAFT). Para devolver pro humano, o próprio
          agente pode executar um handoff via tool, ou adicione outro passo
          `Atribuir responsável` apontando pra um humano.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sc-ai-transfer">Agente IA</Label>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando agentes…</p>
        ) : activeAgents.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum agente IA ativo. Crie um em{" "}
            <a href="/ai-agents" className="underline">
              Agentes IA
            </a>
            .
          </p>
        ) : (
          <DropdownGlass
            triggerClassName="w-full"
            placeholder="Selecione um agente…"
            value={selectedId}
            options={activeAgents.map((a) => ({
              value: a.userId,
              label: `🤖 ${a.name} · ${ARCHETYPE_LABEL[a.archetype] ?? a.archetype} · ${a.autonomyMode === "AUTONOMOUS" ? "autônomo" : "rascunho"}`,
            }))}
            onValueChange={(v) => {
              const a = activeAgents.find((x) => x.userId === v);
              setDraft((d) => ({
                ...d,
                agentUserId: v,
                agentLabel: a?.name ?? "",
              }));
            }}
          />
        )}
      </div>

      {selected && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] text-foreground/80">
          <p>
            Modo de autonomia:{" "}
            <b>
              {selected.autonomyMode === "AUTONOMOUS"
                ? "Autônomo (responde direto)"
                : "Rascunho (humano aprova antes)"}
            </b>
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Aplicar em</Label>
        <DropdownGlass
          triggerClassName="w-full"
          value={target}
          options={[
            { value: "deal", label: "Negócio (deal) — herda no contato e nas conversas" },
            { value: "contact", label: "Contato — propaga pras conversas abertas" },
          ]}
          onValueChange={(v) => setDraft((d) => ({ ...d, target: v }))}
        />
      </div>
    </>
  );
}

function AskAIAgentStepConfig({
  draft,
  setDraft,
}: {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
}) {
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["automation-ai-agents-with-user"],
    queryFn: async (): Promise<AIAgentOption[]> => {
      const res = await fetch(apiUrl("/api/ai-agents"));
      if (!res.ok) return [];
      const rows = (await res.json()) as Array<{
        id: string;
        userId: string;
        name: string;
        archetype: string;
        active: boolean;
        autonomyMode: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        archetype: r.archetype,
        active: r.active,
        autonomyMode: r.autonomyMode,
      }));
    },
    staleTime: 120_000,
  });

  const selectedId = String(draft.agentId ?? "");
  const activeAgents = agents.filter((a) => a.active);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="sc-ai-agent">Agente de IA</Label>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando agentes…</p>
        ) : activeAgents.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum agente ativo. Crie um em{" "}
            <a href="/ai-agents" className="underline">
              Agentes IA
            </a>
            .
          </p>
        ) : (
          <DropdownGlass
            triggerClassName="w-full"
            placeholder="Selecione um agente…"
            value={selectedId}
            options={activeAgents.map((a) => ({
              value: a.id,
              label: `${a.name} · ${a.archetype}`,
            }))}
            onValueChange={(v) => {
              const a = activeAgents.find((x) => x.id === v);
              setDraft((d) => ({
                ...d,
                agentId: v,
                agentLabel: a?.name ?? "",
              }));
            }}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sc-ai-prompt">Pergunta para o agente</Label>
        <Textarea
          id="sc-ai-prompt"
          rows={4}
          placeholder="Ex.: Resuma em 1 parágrafo o interesse do lead {{contact.name}} com base no histórico."
          value={String(draft.promptTemplate ?? "")}
          onChange={(e) => setDraft((d) => ({ ...d, promptTemplate: e.target.value }))}
        />
        <p className="text-[11px] text-muted-foreground">
          Use <code className="font-mono text-[10px]">{"{{variavel}}"}</code> para interpolar dados do fluxo.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sc-ai-var">Salvar resposta em variável</Label>
        <Input
          id="sc-ai-var"
          placeholder="ai_response"
          value={String(draft.saveToVariable ?? "ai_response")}
          onChange={(e) => setDraft((d) => ({ ...d, saveToVariable: e.target.value }))}
        />
        <p className="text-[11px] text-muted-foreground">
          A resposta fica disponível como{" "}
          <code className="font-mono text-[10px]">
            {"{{"}
            {String(draft.saveToVariable ?? "ai_response")}
            {"}}"}
          </code>{" "}
          nos próximos passos.
        </p>
      </div>
    </>
  );
}

type TemplateOption = {
  metaTemplateId: string;
  metaTemplateName: string;
  label: string;
  language: string;
  category: string | null;
  bodyPreview: string;
  /** Texto do HEADER quando ele é do tipo TEXT — pode ter placeholders. */
  headerPreview?: string;
  hasButtons?: boolean;
  hasVariables?: boolean;
  buttonTypes?: string[];
  buttons?: { type: string; text: string; url?: string | null }[];
  flowAction?: string | null;
  flowId?: string | null;
  /** `format` do componente HEADER (Graph) — NONE | TEXT | IMAGE | VIDEO | DOCUMENT. */
  headerFormat?: string | null;
  /**
   * Mapeamento variável → campo do CRM definido na criação do template
   * (Configurações → Modelos de mensagem). Serve de valor padrão dos
   * parâmetros; o operador pode sobrescrever.
   */
  operatorVariables?: OperatorVariableMeta[] | null;
};

const HEADER_MEDIA_LABEL_PT: Record<string, string> = {
  IMAGE: "imagem",
  VIDEO: "vídeo",
  DOCUMENT: "documento",
};

/**
 * Campo de mídia do HEADER do template (IMAGE/VIDEO/DOCUMENT), usado no
 * painel legado (`TemplateStepConfig`). Mesma UX/endpoint do bloco de mídia
 * do step `send_whatsapp_media` (`MediaStepConfig` abaixo) e do
 * `HeaderMediaField` do editor inline — grava em `draft.headerMediaUrl` /
 * `draft.headerMediaType`, os mesmos campos lidos pelo executor da
 * automação (ver `injectTemplateHeaderMediaComponent`).
 */
function TemplateHeaderMediaField({
  headerFormat,
  draft,
  setDraft,
}: {
  headerFormat: "IMAGE" | "VIDEO" | "DOCUMENT";
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaType = headerFormat.toLowerCase();
  const mediaUrl = String(draft.headerMediaUrl ?? "");
  const uploadedFileName = String(draft.headerUploadedFileName ?? "");
  const hasFile = mediaUrl.startsWith("/uploads/") || mediaUrl.startsWith("/api/storage/");
  const missing = mediaUrl.trim() === "";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.warning("Arquivo excede o limite de 16 MB.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiUrl("/api/uploads/automation-media"), {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "Erro ao enviar arquivo.");
        return;
      }
      setDraft((d) => ({
        ...d,
        headerMediaUrl: data.url,
        headerMediaType: mediaType,
        headerUploadedFileName: data.fileName,
      }));
    } catch {
      toast.error("Erro de rede ao enviar arquivo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label>Mídia do cabeçalho (obrigatório)</Label>
      <p className="text-[11px] text-muted-foreground">
        Este template exige {HEADER_MEDIA_LABEL_PT[headerFormat] ?? "mídia"} no cabeçalho — anexe um
        arquivo ou cole uma URL HTTPS pública.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept={MEDIA_ACCEPT[mediaType] ?? "*/*"}
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <>
              <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Enviando…
            </>
          ) : (
            <>
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Carregar arquivo do computador
            </>
          )}
        </Button>

        {hasFile && uploadedFileName && (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-success)]/30 bg-[var(--color-success-bg)] px-2.5 py-1.5">
            <svg className="size-4 shrink-0 text-[var(--color-success-text)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span className="flex-1 truncate text-xs font-medium text-[var(--color-success-text)]">
              {uploadedFileName}
            </span>
            <button
              type="button"
              className="text-xs text-[var(--color-success-text)] underline hover:text-[var(--color-success-text)]"
              onClick={() => setDraft((d) => ({ ...d, headerMediaUrl: "", headerUploadedFileName: "" }))}
            >
              Remover
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <div className="absolute inset-x-0 top-1/2 border-t border-border/60" />
        <p className="relative mx-auto w-fit bg-[var(--color-bg-card)] px-2 text-[10px] text-muted-foreground">
          ou cole uma URL
        </p>
      </div>

      <Input
        value={hasFile ? "" : mediaUrl}
        onChange={(e) =>
          setDraft((d) => ({
            ...d,
            headerMediaUrl: e.target.value,
            headerMediaType: mediaType,
            headerUploadedFileName: "",
          }))
        }
        placeholder="https://exemplo.com/arquivo.mp4"
        disabled={hasFile}
      />

      {missing && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          Este template exige {HEADER_MEDIA_LABEL_PT[headerFormat] ?? "mídia"} no cabeçalho.
        </p>
      )}
    </div>
  );
}

const CAT_LABEL: Record<string, string> = {
  UTILITY: "Utilidade",
  MARKETING: "Marketing",
  AUTHENTICATION: "Autenticação",
};

const BTN_TYPE_LABEL: Record<string, string> = {
  QUICK_REPLY: "Resposta rápida",
  URL: "Link",
  PHONE_NUMBER: "Telefone",
  COPY_CODE: "Copiar código",
  FLOW: "Flow",
};

type TemplateRouteButton = { id?: string; title?: string; text?: string; gotoStepId?: string };

/** Botões QUICK_REPLY do template — únicos que geram resposta inbound roteável. */
function quickReplyButtons(tpl: TemplateOption | undefined): { title: string }[] {
  if (!tpl?.buttons) return [];
  return tpl.buttons
    .filter((b) => String(b.type).toUpperCase() === "QUICK_REPLY" && (b.text ?? "").trim() !== "")
    .map((b) => ({ title: b.text.trim() }));
}

function TemplateStepConfig({
  draft,
  setDraft,
  otherSteps,
  variableOptions,
}: {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
  otherSteps: AutomationStep[];
  variableOptions: VariableShortcutOption[];
}) {
  const { data: metaChannels = [] } = useQuery({
    queryKey: ["meta-cloud-whatsapp-channels"],
    queryFn: async () => {
      const { fetchMetaCloudWhatsAppChannels } = await import(
        "@/lib/meta-whatsapp/meta-cloud-channels"
      );
      return fetchMetaCloudWhatsAppChannels();
    },
    staleTime: 60_000,
  });

  const draftChannelId =
    typeof draft.channelId === "string" && draft.channelId.trim()
      ? draft.channelId.trim()
      : "";

  useEffect(() => {
    if (!metaChannels.length) return;
    if (draftChannelId && metaChannels.some((c) => c.id === draftChannelId)) return;
    const connected = metaChannels.find((c) => c.status === "CONNECTED");
    const fallback = (connected ?? metaChannels[0])?.id;
    if (fallback) setDraft((d) => ({ ...d, channelId: fallback }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaChannels, draftChannelId]);

  const channelId = draftChannelId;

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["automation-whatsapp-templates", channelId || "none"],
    queryFn: async (): Promise<TemplateOption[]> => {
      // Automação usa templates APROVADOS da WABA do canal selecionado.
      const qs = channelId
        ? `?channelId=${encodeURIComponent(channelId)}`
        : "";
      const res = await fetch(apiUrl(`/api/whatsapp-template-configs/approved${qs}`));
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 120_000,
    enabled: Boolean(channelId) || metaChannels.length === 0,
  });

  const selectedName = String(draft.templateName ?? "");
  const selected = templates.find((t) => t.metaTemplateName === selectedName);
  const routeButtons: TemplateRouteButton[] = Array.isArray(draft.buttons)
    ? (draft.buttons as TemplateRouteButton[])
    : [];

  const varSlots = useMemo(
    () => templateVariableSlots(selected?.bodyPreview, selected?.headerPreview),
    [selected],
  );
  const vars = useMemo(
    () => templateVariablesFromConfig(varSlots, draft.components),
    [varSlots, draft.components],
  );
  const missingVars = countMissingTemplateVariables(vars);
  const badTokens = useMemo(
    () => unsupportedTemplateTokens(selected?.bodyPreview, selected?.headerPreview),
    [selected],
  );

  // Sincroniza `draft.buttons` com os QUICK_REPLY do template selecionado
  // (preservando gotoStepId já escolhido por título) e reescreve
  // `draft.components` a partir dos placeholders do template atual — um
  // parâmetro órfão do template anterior faria a Meta rejeitar o envio.
  // Roda quando os templates carregam / o template muda. Só grava se houve
  // mudança real.
  useEffect(() => {
    if (!selected) return;
    const qr = quickReplyButtons(selected);
    const prev = Array.isArray(draft.buttons) ? (draft.buttons as TemplateRouteButton[]) : [];
    const merged = qr.map((b, i) => {
      const prevMatch = prev.find(
        (p) => (p.title ?? p.text ?? "").trim().toLowerCase() === b.title.toLowerCase(),
      );
      return { id: `btn_${i}`, title: b.title, gotoStepId: prevMatch?.gotoStepId ?? "" };
    });
    const same =
      merged.length === prev.length &&
      merged.every(
        (m, i) =>
          m.title === (prev[i]?.title ?? "") && (m.gotoStepId ?? "") === (prev[i]?.gotoStepId ?? ""),
      );
    // Pré-preenche os slots vazios com o mapeamento gravado na criação do
    // template; o operador ainda pode trocar campo por campo.
    const desiredComponents = buildTemplateComponents(
      applyOperatorVariableDefaults(vars, selected.operatorVariables),
    );
    const sameComponents = sameTemplateComponents(draft.components, desiredComponents);
    if (same && sameComponents) return;
    setDraft((d) => ({
      ...d,
      ...(same ? {} : { buttons: merged }),
      ...(sameComponents ? {} : { components: desiredComponents }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedName, templates.length, channelId]);

  const setVar = (slot: (typeof varSlots)[number], value: string) => {
    setDraft((d) => ({
      ...d,
      components: buildTemplateComponents(setTemplateVariableValue(vars, slot, value)),
    }));
  };

  return (
    <>
      {metaChannels.length > 0 ? (
        <div className="space-y-2">
          <Label htmlFor="sc-tpl-channel">Canal / número</Label>
          <DropdownGlass
            triggerClassName="w-full"
            placeholder="Selecione o canal…"
            value={channelId}
            options={metaChannels.map((c) => ({
              value: c.id,
              label: `${c.name}${c.phoneNumber ? ` · ${c.phoneNumber}` : ""}`,
              description: c.status === "CONNECTED" ? "Conectado" : c.status,
            }))}
            onValueChange={(v) => {
              setDraft((d) => ({
                ...d,
                channelId: v,
                // Trocar de WABA invalida a seleção anterior de template.
                templateName: "",
                templateLabel: "",
                buttons: [],
                headerMediaUrl: "",
                headerMediaType: "",
                headerUploadedFileName: "",
              }));
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Templates listados são os da WABA deste canal (número antigo vs novo).
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="sc-tpl-select">Template</Label>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando templates…</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum template aprovado neste canal. Aprove um template do WhatsApp
            (Meta) em Configurações → Modelos de mensagem, ou selecione outro canal.
          </p>
        ) : (
          <DropdownGlass
            triggerClassName="w-full"
            placeholder="Selecione um template…"
            searchable
            searchPlaceholder="Buscar template pelo nome…"
            value={selectedName}
            options={templates.map((t) => ({
              value: t.metaTemplateName,
              label: `${t.label || t.metaTemplateName}${t.category ? ` (${CAT_LABEL[t.category] ?? t.category})` : ""}`,
              description: t.label ? t.metaTemplateName : undefined,
              searchText: `${t.label ?? ""} ${t.metaTemplateName}`,
            }))}
            onValueChange={(v) => {
              const tpl = templates.find((t) => t.metaTemplateName === v);
              const stillNeedsHeaderMedia =
                tpl?.headerFormat === "IMAGE" || tpl?.headerFormat === "VIDEO" || tpl?.headerFormat === "DOCUMENT";
              setDraft((d) => ({
                ...d,
                templateName: v,
                templateLabel: tpl?.label ?? "",
                languageCode: tpl?.language ?? d.languageCode ?? "pt_BR",
                templateCategory: tpl?.category ?? "",
                ...(stillNeedsHeaderMedia
                  ? {}
                  : { headerMediaUrl: "", headerMediaType: "", headerUploadedFileName: "" }),
              }));
            }}
          />
        )}
      </div>

      {selected && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              {selected.label || selected.metaTemplateName}
            </span>
            {selected.label && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {selected.metaTemplateName}
              </span>
            )}
          </div>
          {selected.category && (
            <p className="text-[10px] text-muted-foreground">
              Categoria: {CAT_LABEL[selected.category] ?? selected.category} · Idioma: {selected.language}
            </p>
          )}
          {selected.bodyPreview && (
            <p className="whitespace-pre-wrap text-xs text-foreground/80">
              {renderTemplatePreview(selected.bodyPreview, templateVariablesOf(vars, "body"))}
            </p>
          )}
          {selected.buttons && selected.buttons.length > 0 && (
            <div className="space-y-1 border-t border-border/50 pt-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Botões ({selected.buttons.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selected.buttons.map((btn, i) => (
                  <span
                    key={`${btn.text}-${i}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] font-medium text-foreground/90"
                    title={btn.url ?? BTN_TYPE_LABEL[btn.type] ?? btn.type}
                  >
                    <span className="text-primary">•</span>
                    {btn.text || BTN_TYPE_LABEL[btn.type] || btn.type}
                    <span className="text-[9px] text-muted-foreground">
                      {BTN_TYPE_LABEL[btn.type] ?? btn.type}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selected && varSlots.length > 0 && (
        <div className="space-y-2">
          <Label>Variáveis do template</Label>
          <p className="text-[11px] text-muted-foreground">
            O template aprovado na Meta só entende os placeholders abaixo. Preencha cada um
            com texto fixo ou com um campo do CRM — o token é resolvido no envio.
          </p>
          <div className="space-y-2.5">
            {varSlots.map((slot) => (
              <div className="space-y-1" key={`${slot.component}-${slot.key}`}>
                <Label
                  htmlFor={`sc-tpl-var-${slot.component}-${slot.key}`}
                  className="text-[11px] font-semibold text-muted-foreground"
                >
                  {templateVariableLabel(slot)}
                </Label>
                <VariableShortcutTextarea
                  singleLine
                  id={`sc-tpl-var-${slot.component}-${slot.key}`}
                  value={templateVariableValue(vars, slot)}
                  onChange={(v) => setVar(slot, v)}
                  options={variableOptions}
                  placeholder="Texto fixo ou { para variáveis"
                />
              </div>
            ))}
          </div>
          <VariableShortcutHint />
          {missingVars > 0 && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
              {missingVars === 1
                ? "1 variável sem valor — a Meta rejeita o envio com parâmetro faltando."
                : `${missingVars} variáveis sem valor — a Meta rejeita o envio com parâmetro faltando.`}
            </p>
          )}
        </div>
      )}

      {selected && badTokens.length > 0 && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          O corpo aprovado usa {badTokens.map((t) => `{{${t}}}`).join(", ")}, que a Meta
          não reconhece como variável — o texto vai literal para o contato. Para
          preencher esses trechos, recadastre o template na Meta usando{" "}
          <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>… no lugar.
        </p>
      )}

      {selected &&
        (selected.headerFormat === "IMAGE" ||
          selected.headerFormat === "VIDEO" ||
          selected.headerFormat === "DOCUMENT") && (
          <TemplateHeaderMediaField
            headerFormat={selected.headerFormat}
            draft={draft}
            setDraft={setDraft}
          />
        )}

      {routeButtons.length > 0 && (
        <div className="space-y-2">
          <Label>Roteamento por botão — cada opção leva a um passo</Label>
          <p className="text-[11px] text-muted-foreground">
            Quando o contato tocar num botão de <strong>resposta rápida</strong>, o fluxo
            segue para o passo escolhido. Deixe em “linear” para seguir na ordem.
          </p>
          <div className="flex flex-col gap-2">
            {routeButtons.map((btn, idx) => (
              <div key={btn.id || idx} className="rounded-md border border-border p-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <span className="text-primary">•</span>
                  {btn.title || btn.text || `Botão ${idx + 1}`}
                </div>
                <DropdownGlass
                  triggerClassName="w-full"
                  value={btn.gotoStepId ?? ""}
                  options={[
                    { value: "", label: "→ Próximo passo (linear)" },
                    ...otherSteps.map((s) => ({
                      value: s.id,
                      label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                    })),
                  ]}
                  onValueChange={(v) => {
                    const next = [...routeButtons];
                    next[idx] = { ...next[idx], gotoStepId: v };
                    setDraft((d) => ({ ...d, buttons: next }));
                  }}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1.5 pt-1">
            <Label>Se a resposta não bater com nenhum botão</Label>
            <DropdownGlass
              triggerClassName="w-full"
              value={String(draft.elseGotoStepId ?? "")}
              options={[
                { value: "", label: "→ Próximo passo (linear)" },
                ...otherSteps.map((s) => ({
                  value: s.id,
                  label: `→ ${stepTypeLabel(s.type)}: ${summarizeStepConfig(s.type, s.config).slice(0, 40)}`,
                })),
              ]}
              onValueChange={(v) => setDraft((d) => ({ ...d, elseGotoStepId: v }))}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="sc-tpl-lang">Idioma</Label>
        <Input
          id="sc-tpl-lang"
          value={String(draft.languageCode ?? "pt_BR")}
          onChange={(e) => setDraft((d) => ({ ...d, languageCode: e.target.value }))}
          placeholder="pt_BR"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        O destinatário é resolvido automaticamente pelo telefone do contato.
      </p>
    </>
  );
}

const MEDIA_ACCEPT: Record<string, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/webm",
  audio: "audio/ogg,audio/mpeg,audio/mp4,audio/mp3",
  document: "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain",
};

function MediaStepConfig({
  draft,
  setDraft,
}: {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaType = String(draft.mediaType ?? "image");
  const mediaUrl = String(draft.mediaUrl ?? "");
  const hasFile =
    mediaUrl.startsWith("/uploads/") || mediaUrl.startsWith("/api/storage/");
  const uploadedFileName = String(draft.uploadedFileName ?? "");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 16 * 1024 * 1024) {
      toast.warning("Arquivo excede o limite de 16 MB.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiUrl("/api/uploads/automation-media"), {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "Erro ao enviar arquivo.");
        return;
      }
      setDraft((d) => ({
        ...d,
        mediaUrl: data.url,
        uploadedFileName: data.fileName,
        filename: d.filename || data.fileName,
      }));
    } catch {
      toast.error("Erro de rede ao enviar arquivo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="sc-media-type">Tipo de mídia</Label>
        <DropdownGlass
          triggerClassName="w-full"
          value={mediaType}
          options={[
            { value: "image", label: "Imagem" },
            { value: "video", label: "Vídeo" },
            { value: "audio", label: "Áudio" },
            { value: "document", label: "Documento" },
          ]}
          onValueChange={(v) => setDraft((d) => ({ ...d, mediaType: v }))}
        />
      </div>

      <div className="space-y-2">
        <Label>Arquivo</Label>

        <input
          ref={fileInputRef}
          type="file"
          accept={MEDIA_ACCEPT[mediaType] ?? "*/*"}
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Enviando…
              </>
            ) : (
              <>
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Carregar arquivo do computador
              </>
            )}
          </Button>

          {hasFile && uploadedFileName && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-success)]/30 bg-[var(--color-success-bg)] px-2.5 py-1.5">
              <svg className="size-4 shrink-0 text-[var(--color-success-text)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span className="flex-1 truncate text-xs font-medium text-[var(--color-success-text)]">
                {uploadedFileName}
              </span>
              <button
                type="button"
                className="text-xs text-[var(--color-success-text)] underline hover:text-[var(--color-success-text)]"
                onClick={() => {
                  setDraft((d) => ({ ...d, mediaUrl: "", uploadedFileName: "" }));
                }}
              >
                Remover
              </button>
            </div>
          )}

          {mediaType === "image" && hasFile && mediaUrl && (
            <div className="overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl}
                alt="Preview"
                className="max-h-[160px] w-full object-contain bg-muted/30"
              />
            </div>
          )}
        </div>

        <div className="relative">
          <div className="absolute inset-x-0 top-1/2 border-t border-border/60" />
          <p className="relative mx-auto w-fit bg-[var(--color-bg-card)] px-2 text-[10px] text-muted-foreground">
            ou cole uma URL
          </p>
        </div>

        <Input
          value={hasFile ? "" : mediaUrl}
          onChange={(e) => setDraft((d) => ({ ...d, mediaUrl: e.target.value, uploadedFileName: "" }))}
          placeholder="https://exemplo.com/arquivo.jpg"
          disabled={hasFile}
        />
      </div>

      {mediaType !== "audio" && (
        <div className="space-y-2">
          <Label htmlFor="sc-media-caption">Legenda</Label>
          <Input
            id="sc-media-caption"
            value={String(draft.caption ?? "")}
            onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
            placeholder="Texto opcional"
          />
        </div>
      )}

      {mediaType === "document" && (
        <div className="space-y-2">
          <Label htmlFor="sc-media-fname">Nome do arquivo</Label>
          <Input
            id="sc-media-fname"
            value={String(draft.filename ?? "")}
            onChange={(e) => setDraft((d) => ({ ...d, filename: e.target.value }))}
            placeholder="tutorial.pdf"
          />
        </div>
      )}
    </>
  );
}

type AutomationListItem = {
  id: string;
  name: string;
  active: boolean;
  triggerType: string;
};

function TransferAutomationConfig({
  draft,
  setDraft,
  currentAutomationId,
}: {
  draft: Record<string, unknown>;
  setDraft: Dispatch<SetStateAction<Record<string, unknown>>>;
  currentAutomationId: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["automation-list-for-transfer"],
    queryFn: async (): Promise<AutomationListItem[]> => {
      const res = await fetch(apiUrl("/api/automations?perPage=100"));
      if (!res.ok) return [];
      const json = await res.json();
      const items = Array.isArray(json.items)
        ? json.items
        : Array.isArray(json.data)
          ? json.data
          : Array.isArray(json)
            ? json
            : [];
      return items.map((a: Record<string, unknown>) => ({
        id: String(a.id ?? ""),
        name: String(a.name ?? ""),
        active: Boolean(a.active),
        triggerType: String(a.triggerType ?? ""),
      }));
    },
    staleTime: 60_000,
  });

  const automations = (data ?? []).filter((a) => a.id !== currentAutomationId);
  const selectedId = String(draft.targetAutomationId ?? "");

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="sc-transfer-target">Automação destino</Label>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando automações…</p>
        ) : automations.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma outra automação encontrada.</p>
        ) : (
          <DropdownGlass
            triggerClassName="w-full"
            placeholder="Selecione uma automação…"
            value={selectedId}
            options={automations.map((a) => ({
              value: a.id,
              label: `${a.name}${!a.active ? " (inativa)" : ""}`,
            }))}
            onValueChange={(v) => {
              const a = automations.find((x) => x.id === v);
              setDraft((d) => ({
                ...d,
                targetAutomationId: v,
                targetAutomationName: a?.name ?? "",
              }));
            }}
          />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        A automação atual será encerrada e o fluxo da automação selecionada será iniciado com o mesmo contato e contexto.
      </p>
    </>
  );
}
