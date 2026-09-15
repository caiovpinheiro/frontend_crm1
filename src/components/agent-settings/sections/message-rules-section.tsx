"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import {
  IconArrowDown as ArrowDown,
  IconArrowUp as ArrowUp,
  IconBook as BookOpen,
  IconMessage as MessageSquare,
  IconPencil as Pencil,
  IconPlus as Plus,
  IconTrash as Trash2,
  IconUser as User,
  IconUsers as Users,
  IconDirections as Signpost,
  IconTag as Tag,
} from "@tabler/icons-react";
import * as React from "react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import {
  MESSAGE_RULE_ACTION_LABELS,
  emptyMessageRule,
  type MessageRule,
  type MessageRuleAction,
} from "@/lib/ai-agents/message-rules";
import { cn, ownerLabel } from "@/lib/utils";
import { useTeamUsersQuery } from "@/features/shared/queries/team-users";

import {
  MultiSelectPopover,
  type MultiSelectOption,
} from "@/features/dashboard-v2/components/multi-select-popover";

import { ChipInput } from "../chip-input";
import { FieldHelp, SectionHeader } from "../section-header";

type TagOption = { name: string; color?: string };

const ACTION_ICON: Record<MessageRuleAction, React.ElementType> = {
  answer_with_knowledge: BookOpen,
  transfer_department: Signpost,
  transfer_human: Users,
  assign_owner: User,
  fixed_reply: MessageSquare,
  add_tag: Tag,
};

/** Tag é campo à parte; não aparece como único “o que fazer”. */
const STEP_ACTIONS: MessageRuleAction[] = [
  "answer_with_knowledge",
  "transfer_department",
  "transfer_human",
  "assign_owner",
  "fixed_reply",
];

type Department = { id: string; name: string };

export function MessageRulesSection({
  agentId,
  value,
  onChange,
}: {
  agentId: string | null;
  value: MessageRule[];
  onChange: (next: MessageRule[]) => void;
}) {
  const [editing, setEditing] = React.useState<MessageRule | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [testPhrase, setTestPhrase] = React.useState("");
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);

  const { data: departments = [] } = useQuery({
    queryKey: ["ai-agent-departments"],
    queryFn: async (): Promise<Department[]> => {
      const res = await fetch(apiUrl("/api/settings/departments"));
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.departments ?? []);
      return (list as Department[])
        .filter((d) => d?.id && d?.name)
        .map((d) => ({ id: d.id, name: d.name }));
    },
    staleTime: 60_000,
  });

  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const save = (rule: MessageRule) => {
    const clean: MessageRule = {
      ...rule,
      label: rule.label.trim() || "Regra sem nome",
      department:
        rule.action === "transfer_department" ? rule.department : null,
      message: rule.action === "answer_with_knowledge" ? null : rule.message,
      tagName: rule.tagName?.trim() || null,
      ownerUserId: rule.action === "assign_owner" ? rule.ownerUserId : null,
      ownerLabel: rule.action === "assign_owner" ? rule.ownerLabel : null,
    };
    onChange(
      isNew
        ? [...value, clean]
        : value.map((r) => (r.id === clean.id ? clean : r)),
    );
    setEditing(null);
  };

  const runTest = async () => {
    if (!agentId || !testPhrase.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(
        apiUrl(`/api/ai-agents/${agentId}/message-rules/test`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: testPhrase, rules: value }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        matched?: boolean;
        position?: number;
        rule?: { label?: string };
        nextStepLabel?: string;
        message?: string;
      };
      if (!res.ok) {
        setTestResult(data.message ?? "Não foi possível testar agora.");
        return;
      }
      setTestResult(
        data.matched
          ? `Regra ${data.position} — ${data.rule?.label}: ${data.nextStepLabel}`
          : (data.nextStepLabel ?? "Nenhuma regra pegou esta mensagem."),
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Regras de mensagem"
        description="Quando a mensagem for sobre um assunto, você escolhe o próximo passo."
      />

      <p className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        As regras valem <span className="text-foreground">na ordem da lista</span>,
        antes de qualquer automatismo do agente. A primeira que pegar a mensagem
        decide o atendimento e as seguintes nem são avaliadas. Use as setas para
        reordenar.
      </p>

      <div className="flex justify-end">
        <ButtonGlass
          type="button"
          variant="primary"
          className="rounded-full px-4"
          onClick={() => {
            setEditing(emptyMessageRule());
            setIsNew(true);
          }}
        >
          <Plus className="size-4" />
          Nova regra
        </ButtonGlass>
      </div>

      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
          <p className="text-sm text-foreground">Nenhuma regra criada.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sem regras, o agente segue o atendimento normal em todos os
            assuntos.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {value.map((rule, index) => {
            const Icon = ACTION_ICON[rule.action];
            return (
              <li
                key={rule.id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border border-border bg-card p-3",
                  !rule.enabled && "opacity-60",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {rule.label}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {MESSAGE_RULE_ACTION_LABELS[rule.action].label}
                        {rule.department ? ` · ${rule.department}` : ""}
                        {rule.ownerLabel ? ` · ${rule.ownerLabel}` : ""}
                        {rule.tagName ? ` · tag ${rule.tagName}` : ""}
                      </span>
                    </p>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(enabled) =>
                      onChange(
                        value.map((r) =>
                          r.id === rule.id ? { ...r, enabled } : r,
                        ),
                      )
                    }
                    aria-label={
                      rule.enabled ? "Desativar regra" : "Ativar regra"
                    }
                  />
                </div>

                {rule.anyOf.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground">Assunto:</span>{" "}
                    {rule.anyOf.join(" · ")}
                  </p>
                )}

                <div className="flex items-center justify-end gap-1">
                  <IconAction
                    label="Subir"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </IconAction>
                  <IconAction
                    label="Descer"
                    disabled={index === value.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </IconAction>
                  <IconAction
                    label="Editar"
                    onClick={() => {
                      setEditing({ ...rule });
                      setIsNew(false);
                    }}
                  >
                    <Pencil className="size-4" />
                  </IconAction>
                  <IconAction
                    label="Excluir"
                    onClick={() =>
                      onChange(value.filter((r) => r.id !== rule.id))
                    }
                  >
                    <Trash2 className="size-4" />
                  </IconAction>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Testar uma frase</p>
        <FieldHelp>
          Diz qual regra pega a frase e qual é o próximo passo. Não envia nada
          para ninguém.
        </FieldHelp>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={testPhrase}
            onChange={(e) => setTestPhrase(e.target.value)}
            placeholder="Ex.: quero trocar de polo"
            className={cn(formControlClass, "flex-1")}
          />
          <ButtonGlass
            type="button"
            variant="glass"
            className="rounded-full px-4"
            disabled={!agentId || testing || !testPhrase.trim()}
            onClick={runTest}
          >
            Testar
          </ButtonGlass>
        </div>
        {testResult && (
          <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-foreground">
            {testResult}
          </p>
        )}
        {!agentId && (
          <FieldHelp>Crie o agente para poder testar as frases.</FieldHelp>
        )}
      </div>

      {editing && (
        <RuleDialog
          rule={editing}
          isNew={isNew}
          departments={departments}
          onCancel={() => setEditing(null)}
          onChange={setEditing}
          onSave={save}
        />
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function RuleDialog({
  rule,
  isNew,
  departments,
  onCancel,
  onChange,
  onSave,
}: {
  rule: MessageRule;
  isNew: boolean;
  departments: Department[];
  onCancel: () => void;
  onChange: (next: MessageRule) => void;
  onSave: (rule: MessageRule) => void;
}) {
  // Tags existentes: a regra marca tag, não cria. Tag inventada não é
  // gatilho de automação nenhuma, então a escolha é fechada na lista.
  const { data: tags = [] } = useQuery({
    // Chave própria: a aba Escopo cacheia `["ai-agent-tags"]` como string[]
    // (só o nome). Reusar essa chave fazia cada opção nascer sem label —
    // bolinha vazia — e o filtro quebrava ao digitar (fecha o diálogo).
    queryKey: ["ai-agent-tags", "with-color"],
    queryFn: async (): Promise<TagOption[]> => {
      const res = await fetch(apiUrl("/api/tags"));
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.tags ?? []);
      const parsed: TagOption[] = [];
      for (const raw of list) {
        if (typeof raw === "string" && raw.trim()) {
          parsed.push({ name: raw.trim() });
          continue;
        }
        if (!raw || typeof raw !== "object") continue;
        const name = String(
          (raw as { name?: unknown }).name ?? "",
        ).trim();
        if (!name) continue;
        const color = (raw as { color?: unknown }).color;
        parsed.push({
          name,
          color: typeof color === "string" ? color : undefined,
        });
      }
      return parsed.sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
      );
    },
    staleTime: 60_000,
  });

  const tagOptions = React.useMemo(() => {
    const opts: MultiSelectOption[] = tags.map((t) => ({
      value: t.name,
      label: t.name,
      color: t.color,
    }));
    if (rule.tagName && !tags.some((t) => t.name === rule.tagName)) {
      opts.unshift({
        value: rule.tagName,
        label: rule.tagName,
        color: undefined,
        sub: "não existe mais no CRM",
      });
    }
    return opts;
  }, [tags, rule.tagName]);

  const { data: users = [], isLoading: loadingUsers } = useTeamUsersQuery(
    true,
    { includeAi: true },
  );

  const stepActions: MessageRuleAction[] =
    rule.action === "add_tag" ? [...STEP_ACTIONS, "add_tag"] : STEP_ACTIONS;

  const invalid =
    rule.anyOf.length === 0 ||
    (rule.action === "transfer_department" && !rule.department) ||
    (rule.action === "assign_owner" && !rule.ownerUserId) ||
    (rule.action === "fixed_reply" && !rule.message?.trim()) ||
    (rule.action === "add_tag" && !rule.tagName?.trim());

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={isNew ? "Nova regra" : "Editar regra"}
      description="Escreva o assunto como o cliente escreve e escolha o próximo passo."
      icon={
        <FormDialogIcon>
          <Signpost className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={onCancel}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={invalid}
            onClick={() => onSave(rule)}
          >
            {isNew ? "Criar" : "Salvar"}
          </ButtonGlass>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={formLabelClass} htmlFor="rule-label">
            Nome da regra *
          </label>
          <Input
            id="rule-label"
            value={rule.label}
            onChange={(e) => onChange({ ...rule, label: e.target.value })}
            placeholder="Ex.: Assunto de polo"
            className={formControlClass}
          />
        </div>

        <div>
          <label className={formLabelClass}>
            Quando a mensagem for sobre *
          </label>
          <ChipInput
            values={rule.anyOf}
            onChange={(anyOf) => onChange({ ...rule, anyOf })}
            placeholder="Ex.: polo"
          />
          <FieldHelp>
            Basta um destes termos aparecer na mensagem. Sem acento e sem
            maiúscula funciona igual.
          </FieldHelp>
        </div>

        <div>
          <label className={formLabelClass}>Só quando também aparecer</label>
          <ChipInput
            values={rule.allOf}
            onChange={(allOf) => onChange({ ...rule, allOf })}
            placeholder="Opcional"
          />
        </div>

        <div>
          <label className={formLabelClass}>Nunca quando aparecer</label>
          <ChipInput
            values={rule.noneOf}
            onChange={(noneOf) => onChange({ ...rule, noneOf })}
            placeholder="Opcional"
          />
        </div>

        <div>
          <label className={formLabelClass}>O que fazer *</label>
          <div className="mt-1 grid gap-2">
            {stepActions.map((action) => {
              const meta = MESSAGE_RULE_ACTION_LABELS[action];
              const on = rule.action === action;
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => onChange({ ...rule, action })}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    on
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="text-sm font-medium text-foreground">
                    {meta.label}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {meta.hint}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {rule.action === "transfer_department" && (
          <div>
            <label className={formLabelClass} htmlFor="rule-department">
              Departamento *
            </label>
            <select
              id="rule-department"
              value={rule.department ?? ""}
              onChange={(e) =>
                onChange({ ...rule, department: e.target.value || null })
              }
              className={cn(formControlClass, "w-full px-3")}
            >
              <option value="">Escolha um departamento</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
              {rule.department &&
                !departments.some((d) => d.name === rule.department) && (
                  <option value={rule.department}>{rule.department}</option>
                )}
            </select>
            <FieldHelp>Só departamentos desta organização.</FieldHelp>
          </div>
        )}

        {rule.action === "assign_owner" && (
          <div>
            <label className={formLabelClass}>Pessoa ou agente *</label>
            {loadingUsers ? (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            ) : (
              <DropdownGlass
                triggerClassName="w-full"
                searchable
                searchPlaceholder="Buscar consultor ou agente…"
                placeholder="Selecione quem recebe a conversa"
                value={rule.ownerUserId ?? ""}
                options={users.map((u) => ({
                  value: u.id,
                  label: ownerLabel(u.name ?? u.email, u.type) || u.id,
                  description:
                    (u.type ?? "").toUpperCase() === "AI"
                      ? "Agentes IA"
                      : "Consultores",
                  searchText: `${u.name ?? ""} ${u.email ?? ""}`,
                }))}
                onValueChange={(id) => {
                  const u = users.find((row) => row.id === id);
                  onChange({
                    ...rule,
                    ownerUserId: id || null,
                    ownerLabel:
                      ownerLabel(u?.name ?? u?.email, u?.type) || null,
                  });
                }}
              />
            )}
            <FieldHelp>
              A conversa e o negócio passam para essa pessoa. Agentes ligados
              aparecem na lista.
            </FieldHelp>
          </div>
        )}

        <div>
          <label className={formLabelClass}>Adicionar tag</label>
          <MultiSelectPopover
            label="Tags"
            triggerClassName="w-full justify-between"
            searchable
            emptyLabel="Nenhuma tag cadastrada no CRM."
            options={tagOptions}
            selected={rule.tagName ? [rule.tagName] : []}
            onChange={(next) => {
              const picked =
                next.length === 0 ? null : next[next.length - 1] ?? null;
              onChange({ ...rule, tagName: picked });
            }}
          />
          <FieldHelp>
            Opcional. A tag precisa já existir no CRM. Pode ir junto de
            atender ou de transferir — o sistema marca na hora, sem automação.
          </FieldHelp>
        </div>

        {rule.action !== "answer_with_knowledge" && (
          <div>
            <label className={formLabelClass} htmlFor="rule-message">
              {rule.action === "fixed_reply"
                ? "Texto que o agente envia *"
                : rule.action === "assign_owner"
                  ? "Mensagem ao transferir"
                  : "Mensagem antes de transferir"}
            </label>
            <Textarea
              id="rule-message"
              value={rule.message ?? ""}
              onChange={(e) =>
                onChange({ ...rule, message: e.target.value || null })
              }
              rows={3}
              className={cn(
                formControlClass.replace("h-11", "min-h-[84px]"),
                "resize-y py-3 text-sm",
              )}
              placeholder={
                rule.action === "fixed_reply"
                  ? "Ex.: Nosso polo funciona de 8h às 18h."
                  : rule.action === "assign_owner"
                    ? "Vazio = se for um agente IA, ele assume e cumprimenta."
                    : "Vazio = o agente usa o texto de fila da Pilotagem."
              }
            />
          </div>
        )}
      </div>
    </FormDialog>
  );
}
