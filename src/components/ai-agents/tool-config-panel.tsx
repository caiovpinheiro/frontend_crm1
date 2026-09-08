"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { ChipInput } from "@/components/ai-agents/chip-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formLabelClass } from "@/components/ui/form-dialog";
import {
  emptyToolPolicy,
  isEmptyToolPolicy,
  type ToolConfigMap,
  type ToolPolicy,
} from "@/lib/ai-agents/steering";
import { TOOLS_CATALOG, type ToolDescriptor } from "@/lib/ai-agents/tools-catalog";
import { cn } from "@/lib/utils";

const ACTIVITY_TYPES = [
  "CALL",
  "EMAIL",
  "MEETING",
  "TASK",
  "NOTE",
  "WHATSAPP",
  "OTHER",
] as const;

const DEPT_TOOL_IDS = new Set([
  "transfer_to_department",
  "execute_distribution",
  "transfer_to_human",
]);

type Props = {
  enabledTools: string[];
  onToggleTool: (toolId: string) => void;
  value: ToolConfigMap;
  onChange: (next: ToolConfigMap) => void;
};

export function ToolConfigPanel({
  enabledTools,
  onToggleTool,
  value,
  onChange,
}: Props) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    enabledTools[0] ?? null,
  );

  React.useEffect(() => {
    if (selectedId && !enabledTools.includes(selectedId)) {
      setSelectedId(enabledTools[0] ?? null);
    }
  }, [enabledTools, selectedId]);

  const selected = TOOLS_CATALOG.find((t) => t.id === selectedId) ?? null;
  const policy = selectedId
    ? (value[selectedId] ?? emptyToolPolicy())
    : emptyToolPolicy();

  const patch = (partial: Partial<ToolPolicy>) => {
    if (!selectedId) return;
    const nextPolicy = { ...emptyToolPolicy(), ...policy, ...partial };
    const next: ToolConfigMap = { ...value };
    if (isEmptyToolPolicy(nextPolicy)) {
      delete next[selectedId];
    } else {
      next[selectedId] = nextPolicy;
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        Liga/desliga cada ferramenta e, na selecionada, trava argumentos,
        tags e departamentos. O que estiver desligado aqui o agente não
        consegue usar — sem precisar de deploy.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {TOOLS_CATALOG.map((t) => {
          const active = enabledTools.includes(t.id);
          const selectedTool = selectedId === t.id;
          const hasPolicy = Boolean(value[t.id]);
          return (
            <div
              key={t.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2 text-left text-[13px] transition-colors",
                selectedTool
                  ? "border-indigo-500 bg-[var(--color-indigo-soft)] dark:border-indigo-400 dark:bg-indigo-950/30"
                  : active
                    ? "border-border bg-muted/20"
                    : "border-border hover:bg-muted/40",
              )}
            >
              <button
                type="button"
                onClick={() => onToggleTool(t.id)}
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                  active
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-border",
                )}
                aria-label={`${active ? "Desligar" : "Ligar"} ${t.label}`}
              >
                {active && <span className="text-[10px]">✓</span>}
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setSelectedId(t.id)}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  {t.label}
                  {hasPolicy && (
                    <span className="rounded-full bg-indigo-500/15 px-1.5 py-px text-[10px] font-normal text-indigo-700 dark:text-indigo-300">
                      travas
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {t.description}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {selected && (
        <ToolPolicyForm
          tool={selected}
          enabled={enabledTools.includes(selected.id)}
          policy={policy}
          onChange={patch}
        />
      )}
    </div>
  );
}

export function ToolPolicyForm({
  tool,
  enabled,
  policy,
  onChange,
}: {
  tool: ToolDescriptor;
  enabled: boolean;
  policy: ToolPolicy;
  onChange: (partial: Partial<ToolPolicy>) => void;
}) {
  const { data: tags = [] } = useQuery({
    queryKey: ["ai-agent-tags"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/tags"));
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.tags ?? [];
      return (list as Array<{ name?: string }>)
        .map((t) => t.name)
        .filter((n): n is string => Boolean(n));
    },
    staleTime: 60_000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["ai-agent-departments"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/settings/departments"));
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      return (list as Array<{ name?: string }>)
        .map((d) => d.name)
        .filter((n): n is string => Boolean(n));
    },
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4 rounded-xl border bg-muted/10 p-4">
      <div>
        <div className="text-sm font-semibold">{tool.label}</div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {enabled
            ? "Configure o que esta ferramenta pode (e não pode) fazer."
            : "Ferramenta desligada — ligue acima para o agente usá-la."}
        </p>
      </div>

      {tool.id === "add_tag" && (
        <>
          <Field label="Tags permitidas" hint="Vazio = qualquer tag. Se preencher, só essas.">
            <ChipInput
              values={policy.allowedTagNames}
              onChange={(allowedTagNames) => onChange({ allowedTagNames })}
              placeholder="Nome da tag"
              suggestions={tags}
            />
          </Field>
          <ToggleRow
            id="deny-create-tag"
            label="Não criar tag nova"
            hint="Se a tag não existir no CRM, a ferramenta recusa em vez de criar."
            checked={policy.denyCreateNew}
            onChange={(denyCreateNew) => onChange({ denyCreateNew })}
          />
        </>
      )}

      {DEPT_TOOL_IDS.has(tool.id) && (
        <>
          <Field
            label="Departamentos permitidos"
            hint="Vazio = qualquer um. Use o nome exatamente como está no CRM."
          >
            <ChipInput
              values={policy.allowedDepartments}
              onChange={(allowedDepartments) => onChange({ allowedDepartments })}
              placeholder="Ex.: Acolhimento"
              suggestions={departments}
            />
          </Field>
          <Field
            label="Departamentos bloqueados"
            hint="Mesmo se o modelo pedir, o sistema recusa."
          >
            <ChipInput
              values={policy.blockedDepartments}
              onChange={(blockedDepartments) => onChange({ blockedDepartments })}
              placeholder="Ex.: Retenção"
              suggestions={departments}
            />
          </Field>
        </>
      )}

      {tool.id === "create_activity" && (
        <>
          <Field label="Tipos permitidos" hint="Vazio = todos os tipos.">
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_TYPES.map((t) => {
                const on = policy.allowedTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const allowedTypes = on
                        ? policy.allowedTypes.filter((x) => x !== t)
                        : [...policy.allowedTypes, t];
                      onChange({ allowedTypes });
                    }}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[12px]",
                      on
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                        : "border-border text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Tipo padrão" hint="Usado quando o modelo omitir o tipo.">
            <select
              value={policy.defaultType ?? ""}
              onChange={(e) =>
                onChange({ defaultType: e.target.value || null })
              }
              className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">Nenhum</option>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      {tool.id === "consultar_matricula" && (
        <>
          <Field
            label="Política da consulta"
            hint="Texto injetado na ferramenta. Vazio = política padrão do código."
          >
            <Textarea
              value={policy.policyText ?? ""}
              onChange={(e) =>
                onChange({ policyText: e.target.value.trim() || null })
              }
              rows={4}
              className="resize-y rounded-xl text-sm"
              placeholder="O que o agente pode e não pode revelar dos dados de matrícula."
            />
          </Field>
          <Field
            label="Mensagem ao transferir"
            hint="Usada quando a consulta exige handoff (ex.: situação financeira)."
          >
            <Input
              value={policy.transferMessage ?? ""}
              onChange={(e) =>
                onChange({ transferMessage: e.target.value.trim() || null })
              }
              placeholder="Vou te conectar com a equipe responsável…"
            />
          </Field>
        </>
      )}

      <Field
        label="Instrução extra para esta ferramenta"
        hint="Aparece na descrição que o modelo lê. Use para 'não envie X' ou 'prefira Y'."
      >
        <Textarea
          value={policy.argHints.geral ?? ""}
          onChange={(e) => {
            const geral = e.target.value.trim();
            const argHints = { ...policy.argHints };
            if (geral) argHints.geral = geral;
            else delete argHints.geral;
            onChange({ argHints });
          }}
          rows={3}
          className="resize-y rounded-xl text-sm"
          placeholder="Ex.: nunca invente o nome da tag; use só as da lista."
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className={formLabelClass}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-background/50 p-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
