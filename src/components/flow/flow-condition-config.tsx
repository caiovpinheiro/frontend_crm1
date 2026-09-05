"use client"

import { useMemo, useState } from "react"
import { Ban } from "lucide-react"
import { DropdownGlass } from "@/components/crm/dropdown-glass"
import { Input } from "@/components/ui/input"
import {
  BOOL_OPTS,
  CHANNEL_KIND_OPTS,
  CONDITION_BOOL_FIELDS,
  CONDITION_FIELDS,
  CONDITION_OPS,
  CONDITION_SCHEDULE_OPS,
  DEAL_STATUS_OPTS,
  WEEK_DAYS,
} from "@/components/automations/editor-fields"
import {
  optionsWithSaved,
  useConditionFieldOptions,
  useConditionNameLookup,
  useCustomFieldConditionMeta,
  useDepartmentOptions,
  usePipelineOptions,
  useStageOptions,
  useTagOptions,
  useUserOptions,
} from "@/components/automations/editor-data"
import {
  hydrateConditionBranches,
  looksLikeOpaqueId,
  newBranchId,
  type ConditionBranch,
  type ConditionRule,
} from "@/lib/automation-condition"
import { useContactSources } from "@/hooks/use-contact-sources"
import { FlowVariableInput } from "./flow-variable-picker"
import type { NodeConfig } from "@/lib/flow-data"

const NO_VALUE_OPS = new Set(["empty", "not_empty"])
const CUSTOM_FIELD_SENTINEL = "__custom__"

type Schedule = { days?: number[]; from?: string; to?: string }

function asBranches(cfg: NodeConfig): ConditionBranch[] {
  return hydrateConditionBranches(cfg)
}

function fieldLabel(field: string): string {
  return CONDITION_FIELDS.find((f) => f.value === field)?.label ?? field
}

function opLabel(op: string): string {
  return CONDITION_OPS.find((o) => o.value === op)?.label ?? op
}

function isRuleReady(rule: ConditionRule): boolean {
  if (!rule.field) return false
  if (NO_VALUE_OPS.has(rule.op) || CONDITION_SCHEDULE_OPS.has(rule.op)) return true
  return String(rule.value ?? "").trim() !== ""
}

function displayValue(raw: string, lookup?: Record<string, string>): string {
  const v = raw.trim()
  if (!v) return ""
  const named = lookup?.[v]
  if (named && !looksLikeOpaqueId(named)) return named
  if (looksLikeOpaqueId(v)) return ""
  return v
}

function summarizeRule(rule: ConditionRule, lookup?: Record<string, string>): string {
  if (!rule.field) return "Definir regra"
  const value =
    NO_VALUE_OPS.has(rule.op) || CONDITION_SCHEDULE_OPS.has(rule.op)
      ? ""
      : displayValue(String(rule.value ?? ""), lookup)
  const field = lookup?.[rule.field] && !looksLikeOpaqueId(lookup[rule.field]!)
    ? lookup[rule.field]!
    : fieldLabel(rule.field)
  return `${field} ${opLabel(rule.op)}${value ? ` ${value}` : ""}`.trim()
}

function summarizeBranch(branch: ConditionBranch, lookup?: Record<string, string>): string {
  const ready = (branch.rules ?? []).filter(isRuleReady)
  if (ready.length === 0) return "Clique para definir"
  const extra = ready.length > 1 ? ` · e +${ready.length - 1}` : ""
  return summarizeRule(ready[0], lookup) + extra
}

export function FlowConditionConfig({
  cfg,
  onChange,
}: {
  cfg: NodeConfig
  onChange: (next: NodeConfig) => void
}) {
  const lookup = useConditionNameLookup()
  const branches = asBranches(cfg)
  const [openId, setOpenId] = useState<string | null>(() => {
    const incomplete = branches.find((b) => !(b.rules ?? []).some(isRuleReady))
    return incomplete?.id ?? null
  })
  const fallbackOpen = branches.find((b) => !(b.rules ?? []).some(isRuleReady))?.id ?? null

  function commit(nextBranches: ConditionBranch[], elseStepId = cfg.elseStepId) {
    onChange({ ...cfg, branches: nextBranches, elseStepId, field: undefined, op: undefined, value: undefined })
  }

  return (
    <section className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Regras no mesmo <span className="font-semibold text-foreground">Se</span> ={" "}
        <span className="font-semibold text-foreground">E</span>. Vários Se ={" "}
        <span className="font-semibold text-foreground">OU</span>. Nenhum bate → Senão.
      </p>

      {branches.map((branch, bi) => {
        const ready = (branch.rules ?? []).some(isRuleReady)
        const expanded = (openId ?? fallbackOpen) === branch.id
        const title = branch.label?.trim() || `Se ${bi + 1}`
        return (
          <div key={branch.id}>
            {bi > 0 && (
              <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                ou se
              </p>
            )}
            {!expanded ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg border border-[#E2E8F0] px-2.5 py-2 text-left hover:bg-[#F8FAFC]"
                onClick={() => setOpenId(branch.id)}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[color-mix(in_oklch,var(--color-cyan)_14%,transparent)] text-[10px] font-bold text-[var(--color-cyan)]">
                  {bi + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-foreground">{title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{summarizeBranch(branch, lookup)}</span>
                </span>
                {branches.length > 1 && (
                  <span
                    role="button"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remover Se"
                    onClick={(e) => {
                      e.stopPropagation()
                      commit(branches.filter((_, i) => i !== bi))
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
            ) : (
              <div className="space-y-2 rounded-lg border border-[#E2E8F0] p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={branch.label ?? ""}
                    onChange={(e) =>
                      commit(branches.map((b, i) => (i === bi ? { ...b, label: e.target.value } : b)))
                    }
                    placeholder={`Se ${bi + 1} (rótulo opcional)`}
                    className="h-8 text-[13px]"
                  />
                  {ready && (
                    <button
                      type="button"
                      className="shrink-0 text-[11px] font-semibold text-[var(--brand-primary)]"
                      onClick={() => setOpenId(null)}
                    >
                      Recolher
                    </button>
                  )}
                  {branches.length > 1 && (
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remover Se"
                      onClick={() => commit(branches.filter((_, i) => i !== bi))}
                    >
                      ×
                    </button>
                  )}
                </div>

                {(branch.rules ?? []).map((rule, ri) => (
                  <div key={`${branch.id}-${ri}`}>
                    {ri > 0 && (
                      <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        e
                      </p>
                    )}
                    <ConditionRuleRow
                      rule={rule}
                      onChange={(patch, collapse) => {
                        const next = branches.map((b, i) =>
                          i === bi
                            ? { ...b, rules: (b.rules ?? []).map((r, j) => (j === ri ? { ...r, ...patch } : r)) }
                            : b,
                        )
                        commit(next)
                        if (!collapse) return
                        const rules = next[bi]?.rules ?? []
                        if (rules.some(isRuleReady) && rules.every((r) => !r.field || isRuleReady(r))) {
                          setOpenId(null)
                        }
                      }}
                      onRemove={
                        (branch.rules ?? []).length > 1
                          ? () =>
                              commit(
                                branches.map((b, i) =>
                                  i === bi ? { ...b, rules: (b.rules ?? []).filter((_, j) => j !== ri) } : b,
                                ),
                              )
                          : undefined
                      }
                    />
                  </div>
                ))}

                <button
                  type="button"
                  className="w-full rounded-md border border-dashed border-[#E2E8F0] py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-[#F8FAFC] hover:text-foreground"
                  onClick={() =>
                    commit(
                      branches.map((b, i) =>
                        i === bi ? { ...b, rules: [...(b.rules ?? []), { field: "", op: "eq", value: "" }] } : b,
                      ),
                    )
                  }
                >
                  + e também
                </button>
              </div>
            )}
          </div>
        )
      })}

      <button
        type="button"
        className="w-full rounded-md border border-dashed border-[var(--brand-primary)]/40 py-2 text-[12px] font-semibold text-[var(--brand-primary)] hover:bg-[var(--color-primary-soft)]"
        onClick={() => {
          const next = { id: newBranchId(), label: "", rules: [{ field: "", op: "eq" as const, value: "" }] }
          commit([...branches, next])
          setOpenId(next.id)
        }}
      >
        + Ou se…
      </button>

      <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_oklch,var(--route-error)_25%,transparent)] bg-[color-mix(in_oklch,var(--route-error)_6%,transparent)] px-2.5 py-2 text-[12px] text-[var(--route-error)]">
        <Ban className="h-3.5 w-3.5 shrink-0" />
        Senão — nenhuma condição
      </div>
    </section>
  )
}

function ConditionRuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: ConditionRule
  onChange: (patch: Partial<ConditionRule>, collapse?: boolean) => void
  onRemove?: () => void
}) {
  const { options: customFields, isLoading } = useConditionFieldOptions()
  const lookup = useConditionNameLookup()
  const knownFields = useMemo(
    () => new Set([...CONDITION_FIELDS, ...customFields].map((o) => o.value)),
    [customFields],
  )
  const isCustom = !!rule.field && !knownFields.has(rule.field) && !isLoading
  const fieldOptions = useMemo(() => {
    const catalog = [
      ...CONDITION_FIELDS.map((o) => ({
        value: o.value,
        label: o.label,
        description: o.group,
        searchText: `${o.label} ${o.value} ${o.group ?? ""}`,
      })),
      ...customFields.map((o) => ({
        value: o.value,
        label: o.label,
        description: o.group,
        searchText: `${o.label} ${o.value} ${o.group ?? ""}`,
      })),
    ]
    const withSaved = isCustom
      ? catalog
      : optionsWithSaved(catalog, rule.field, lookup[rule.field] ?? fieldLabel(rule.field))
    return [
      ...withSaved,
      { value: CUSTOM_FIELD_SENTINEL, label: "Outro (caminho livre)…", searchText: "outro caminho livre custom" },
    ]
  }, [customFields, isCustom, lookup, rule.field])
  const hideValue = NO_VALUE_OPS.has(rule.op)

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <DropdownGlass
            triggerClassName="w-full"
            searchable
            searchPlaceholder="Buscar campo…"
            placeholder={isLoading ? "Carregando…" : "Campo"}
            value={isCustom ? CUSTOM_FIELD_SENTINEL : rule.field}
            options={fieldOptions}
            onValueChange={(v) =>
              onChange({ field: v === CUSTOM_FIELD_SENTINEL ? "variables." : v, value: "" }, false)
            }
          />
          {isCustom && (
            <Input
              value={rule.field}
              onChange={(e) => onChange({ field: e.target.value }, false)}
              placeholder="caminho (ex.: variables.resposta)"
              className="h-8 text-[13px]"
            />
          )}
          <DropdownGlass
            triggerClassName="w-full"
            value={rule.op}
            options={optionsWithSaved(CONDITION_OPS, rule.op, opLabel(rule.op))}
            onValueChange={(v) =>
              onChange({ op: v as ConditionRule["op"] }, NO_VALUE_OPS.has(v) || CONDITION_SCHEDULE_OPS.has(v))
            }
          />
          {!hideValue && (
            <ConditionValue
              field={rule.field}
              op={rule.op}
              value={String(rule.value ?? "")}
              onChange={(v, collapse) => onChange({ value: v }, collapse)}
            />
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            className="mt-1 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Remover regra"
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

function ConditionValue({
  field,
  op,
  value,
  onChange,
}: {
  field: string
  op: string
  value: string
  onChange: (v: string, collapse?: boolean) => void
}) {
  const tags = useTagOptions()
  const users = useUserOptions()
  const depts = useDepartmentOptions()
  const stages = useStageOptions()
  const pipelines = usePipelineOptions()
  const sourcesQuery = useContactSources(field === "contact.source")
  const lookup = useConditionNameLookup()
  const { byPath: customFieldMeta } = useCustomFieldConditionMeta()
  const savedLabel = lookup[value] ?? (looksLikeOpaqueId(value) ? value : undefined)

  const isTag = op === "has_tag" || op === "not_has_tag" || field.endsWith(".tags") || field.endsWith(".tagIds")
  if (isTag) {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        searchable
        placeholder={tags.isLoading && !value ? "Carregando…" : "Selecione uma tag…"}
        value={value}
        options={optionsWithSaved(tags.options, value, savedLabel)}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }
  if (field === "contact.source") {
    const sourceOpts = (sourcesQuery.data ?? []).map((s) => ({
      value: s,
      label: s,
    }))
    return (
      <div className="space-y-1.5">
        <DropdownGlass
          triggerClassName="w-full"
          searchable
          placeholder={
            sourcesQuery.isLoading && !value ? "Carregando…" : "Selecione uma origem…"
          }
          value={value}
          options={optionsWithSaved(sourceOpts, value)}
          onValueChange={(v) => onChange(v, true)}
        />
        <Input
          className="h-8 text-[12px]"
          placeholder="Ou digite uma origem…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }
  if (CONDITION_SCHEDULE_OPS.has(op)) {
    return <BusinessHoursValue value={value} onChange={onChange} />
  }
  if (CONDITION_BOOL_FIELDS.has(field)) {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        value={value}
        options={optionsWithSaved(BOOL_OPTS, value)}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }
  if (field.endsWith("assignedToId") || field.endsWith("ownerId")) {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        searchable
        placeholder={users.isLoading && !value ? "Carregando…" : "Selecione um usuário…"}
        value={value}
        options={optionsWithSaved(users.options, value, savedLabel)}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }
  if (field === "conversation.departmentId") {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        searchable
        placeholder={depts.isLoading && !value ? "Carregando…" : "Departamento…"}
        value={value}
        options={optionsWithSaved(depts.options, value, savedLabel)}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }
  if (field === "deal.stageId") {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        searchable
        placeholder={stages.isLoading && !value ? "Carregando…" : "Etapa…"}
        value={value}
        options={optionsWithSaved(stages.options, value, savedLabel)}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }
  if (field === "deal.pipelineId") {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        searchable
        placeholder={pipelines.isLoading && !value ? "Carregando…" : "Selecione um funil…"}
        value={value}
        options={optionsWithSaved(pipelines.options, value, savedLabel)}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }
  if (field === "deal.status") {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        value={value}
        options={optionsWithSaved(DEAL_STATUS_OPTS, value)}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }
  if (field === "conversation.channel") {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        value={value}
        options={optionsWithSaved(CHANNEL_KIND_OPTS, value)}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }
  const meta = customFieldMeta.get(field)
  if (meta?.type === "BOOLEAN") {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        value={value}
        options={optionsWithSaved(BOOL_OPTS, value)}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }
  if ((meta?.type === "SELECT" || meta?.type === "MULTI_SELECT") && meta.options.length > 0) {
    return (
      <DropdownGlass
        triggerClassName="w-full"
        searchable
        placeholder="Selecione…"
        value={value}
        options={optionsWithSaved(
          meta.options.map((opt) => ({ value: opt, label: opt })),
          value,
          savedLabel,
        )}
        onValueChange={(v) => onChange(v, true)}
      />
    )
  }

  return (
    <FlowVariableInput
      value={value}
      onChange={(v) => onChange(v, false)}
      onBlur={() => {
        if (value.trim()) onChange(value, true)
      }}
      placeholder="Valor ou { para variáveis"
      className="h-9"
    />
  )
}

function BusinessHoursValue({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let parsed: { schedule: Schedule[]; timezone: string } = { schedule: [], timezone: "America/Sao_Paulo" }
  try {
    const raw = value ? JSON.parse(value) : null
    if (raw && typeof raw === "object") {
      parsed = {
        schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
        timezone: typeof raw.timezone === "string" && raw.timezone ? raw.timezone : "America/Sao_Paulo",
      }
    }
  } catch {
    /* ignore */
  }

  const emit = (schedule: Schedule[], timezone: string) => {
    onChange(JSON.stringify({ schedule, timezone }))
  }

  const update = (i: number, patch: Partial<Schedule>) =>
    emit(
      parsed.schedule.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
      parsed.timezone,
    )
  const toggleDay = (i: number, day: number) => {
    const days = new Set(parsed.schedule[i]?.days ?? [])
    days.has(day) ? days.delete(day) : days.add(day)
    update(i, { days: [...days].sort() })
  }

  return (
    <div className="space-y-2 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-2">
      {parsed.schedule.map((it, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {WEEK_DAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`h-6 w-6 rounded text-[10px] font-semibold ${
                  (it.days ?? []).includes(d.value)
                    ? "bg-[var(--brand-primary)] text-white"
                    : "bg-white text-muted-foreground ring-1 ring-[#E2E8F0]"
                }`}
                onClick={() => toggleDay(i, d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="time"
              value={it.from || "09:00"}
              onChange={(e) => update(i, { from: e.target.value })}
              className="h-8 text-[12px]"
            />
            <span className="text-[11px] text-muted-foreground">→</span>
            <Input
              type="time"
              value={it.to || "18:00"}
              onChange={(e) => update(i, { to: e.target.value })}
              className="h-8 text-[12px]"
            />
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remover faixa"
              onClick={() =>
                emit(
                  parsed.schedule.filter((_, idx) => idx !== i),
                  parsed.timezone,
                )
              }
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="w-full rounded-md border border-dashed border-[#E2E8F0] py-1 text-[11px] font-medium text-muted-foreground hover:bg-white"
        onClick={() =>
          emit([...parsed.schedule, { days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" }], parsed.timezone)
        }
      >
        + Adicionar faixa horária
      </button>
      <Input
        value={parsed.timezone}
        onChange={(e) => emit(parsed.schedule, e.target.value)}
        placeholder="America/Sao_Paulo"
        className="h-8 text-[12px]"
      />
    </div>
  )
}
