"use client"

/**
 * Edição inline (sem modal) da config de cada ação dentro do próprio card
 * do canvas. Renderiza os campos a partir do esquema declarativo
 * (`editor-fields.ts`) e popula selects com dados reais (`editor-data.ts`).
 *
 * Toda a UI vive em `.n-config` com as classes `nodrag nopan nowheel` para
 * que digitar/rolar não arraste nem dê pan/zoom no React Flow.
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { toast } from "sonner"
import { DropdownGlass, type DropdownOption } from "@/components/crm/dropdown-glass"
import { InputGlass } from "@/components/crm/input-glass"
import { apiUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  BOOL_OPTS,
  CHANNEL_KIND_OPTS,
  CONDITION_BOOL_FIELDS,
  CONDITION_FIELDS,
  CONDITION_OPS,
  CONDITION_SCHEDULE_OPS,
  DEAL_STATUS_OPTS,
  STEP_FIELDS,
  WEEK_DAYS,
  type EditorField,
  type SourceKey,
} from "./editor-fields"
import {
  useAiAgentOptions,
  useAutomationOptions,
  useConditionFieldOptions,
  useCustomFieldConditionMeta,
  useCustomFieldMetaBySlug,
  useCustomFieldTokens,
  useDepartmentOptions,
  useFieldOptions,
  usePipelineLossReasonOptions,
  usePipelineOptions,
  useStageOptions,
  useTagOptions,
  getTemplateDetail,
  mergeTemplateQuickReplies,
  useStepTemplateCatalog,
  useUserOptions,
  usePublishedFlowOptions,
  optionsWithSaved,
  type Opt,
} from "./editor-data"
import {
  buildTemplateComponents,
  countMissingTemplateVariables,
  sameTemplateComponents,
  setTemplateVariableValue,
  templateVariableLabel,
  templateVariableSlots,
  templateVariableValue,
  templateVariablesFromConfig,
  templateVariablesOf,
} from "./template-variables"
import { renderTemplatePreview } from "@/lib/meta-whatsapp/build-template-components"
import { WebhookStepConfig } from "./webhook-step-config"
import { SendProductInlineConfig } from "./send-product-config"
import { TabulationStepConfig } from "./tabulation-step-config"
import {
  showsUpdateFieldVariableHint,
  UpdateFieldValueControl,
} from "./update-field-value"
import { ActiveChannelMultiSelect } from "./step-channel-picker"
import { readStepAllowedChannelIds, readStepChannelScope } from "@/lib/automation-workflow"

const CUSTOM_FIELD_SENTINEL = "__custom__"

type Cfg = Record<string, unknown>
type StepOpt = { value: string; label: string }

const str = (v: unknown) => (v == null ? "" : String(v))
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0)
let rseq = 0
const rid = (p: string) => `${p}_${Date.now().toString(36)}_${rseq++}`

// ───────────────────────────── Editor raiz ─────────────────────────────

export function NodeConfigEditor({
  stepType,
  config,
  steps,
  isFirstMessageStep,
  inheritedChannelId,
  bindToInbound,
  fields: fieldsOverride,
  hideStepTargets,
  onChange,
}: {
  stepType: string
  config: Cfg
  steps: StepOpt[]
  /** 1º passo de mensagem do fluxo (legado: exigia canal explícito). */
  isFirstMessageStep?: boolean
  /** Canal herdado do gatilho (1 conexão) ou do 1º passo. */
  inheritedChannelId?: string
  /** Gatilho inbound: o envio usa o canal da conversa, não um número fixo. */
  bindToInbound?: boolean
  /** Substitui `STEP_FIELDS[stepType]` — usado pelo editor /fluxo para omitir destinos via handle. */
  fields?: EditorField[]
  /** Esconde “Ir para passo” nos builders (o /fluxo usa handles). */
  hideStepTargets?: boolean
  onChange: (next: Cfg) => void
}) {
  const fields = fieldsOverride ?? STEP_FIELDS[stepType]
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value })

  if (!fields) {
    return (
      <div className="n-config nodrag nopan nowheel" onClick={(e) => e.stopPropagation()}>
        <p className="cfg-info">Este bloco não possui configuração.</p>
      </div>
    )
  }

  return (
    <div
      className="n-config nodrag nopan nowheel"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {fields.map((f, i) => (
        <Field
          key={"key" in f ? f.key : `f${i}`}
          field={f}
          config={config}
          steps={steps}
          set={set}
          onChange={onChange}
          stepType={stepType}
          isFirstMessageStep={isFirstMessageStep}
          inheritedChannelId={inheritedChannelId}
          bindToInbound={bindToInbound}
          hideStepTargets={hideStepTargets}
        />
      ))}
    </div>
  )
}

// ───────────────────────────── Dispatcher ─────────────────────────────

function Field({
  field,
  config,
  steps,
  set,
  onChange,
  stepType,
  isFirstMessageStep,
  inheritedChannelId,
  bindToInbound,
  hideStepTargets,
}: {
  field: EditorField
  config: Cfg
  steps: StepOpt[]
  set: (k: string, v: unknown) => void
  onChange: (next: Cfg) => void
  stepType: string
  isFirstMessageStep?: boolean
  inheritedChannelId?: string
  bindToInbound?: boolean
  hideStepTargets?: boolean
}) {
  switch (field.kind) {
    case "info":
      return <p className="cfg-info">{field.text}</p>

    case "text":
      return (
        <Labeled label={field.label} optional={field.optional} hint={field.hint}>
          {field.variables ? (
            <VariableInput
              value={str(config[field.key])}
              placeholder={field.placeholder}
              onChange={(v) => set(field.key, v)}
            />
          ) : (
            <InputGlass
              className="cfg-input nodrag"
              value={str(config[field.key])}
              placeholder={field.placeholder}
              onChange={(e) => set(field.key, e.target.value)}
            />
          )}
        </Labeled>
      )

    case "media":
      return <MediaField label={field.label} config={config} onChange={onChange} />

    case "tag":
      return <TagInput label={field.label} optional={field.optional} value={str(config[field.key])} onChange={(v) => set(field.key, v)} />

    case "textarea":
      return (
        <Labeled label={field.label} optional={field.optional} hint={field.hint}>
          <VariableTextarea
            value={str(config[field.key])}
            placeholder={field.placeholder}
            onChange={(v) => set(field.key, v)}
          />
        </Labeled>
      )

    case "number":
      return (
        <Labeled label={field.label} optional={field.optional} hint={field.hint}>
          <div className="cfg-affix">
            {field.suffix && <span className="cfg-suffix">{field.suffix}</span>}
            <InputGlass
              type="number"
              className="nodrag"
              min={field.min}
              step={field.step}
              value={str(config[field.key])}
              onChange={(e) => set(field.key, e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
        </Labeled>
      )

    case "select":
      return (
        <Labeled label={field.label} optional={field.optional} hint={field.hint}>
          <ConfigSelect
            value={str(config[field.key])}
            options={field.options}
            placeholder="Selecione…"
            onChange={(v) => set(field.key, v)}
          />
        </Labeled>
      )

    case "step":
      return (
        <Labeled label={field.label} optional={field.optional} hint={field.hint}>
          <ConfigSelect
            value={str(config[field.key])}
            options={steps}
            placeholder="Selecione um passo…"
            onChange={(v) => set(field.key, v)}
          />
        </Labeled>
      )

    case "source":
      // Departamento: grava também `departmentName` pra o summary do card
      // (summarizeStepConfig) e o executor exibirem o nome legível.
      if (field.source === "stage") {
        return (
          <Labeled label={field.label} optional={field.optional} hint={field.hint}>
            <StageSelect
              value={str(config[field.key])}
              onPick={(id, name) =>
                onChange({ ...config, stageId: id, stageName: name })
              }
            />
          </Labeled>
        )
      }
      if (field.source === "department") {
        return (
          <Labeled label={field.label} optional={field.optional} hint={field.hint}>
            <DepartmentSelect
              value={str(config[field.key])}
              onPick={(id, name) =>
                onChange({ ...config, departmentId: id, departmentName: name })
              }
            />
          </Labeled>
        )
      }
      // Funil (Ganho/Perda): grava `pipelineName` (summary + executor) e,
      // no node Perda, zera `lostReason` — o catálogo de motivos depende
      // do funil selecionado.
      if (field.source === "pipeline") {
        return (
          <Labeled label={field.label} optional={field.optional} hint={field.hint}>
            <PipelineSelect
              value={str(config[field.key])}
              onPick={(id, name) =>
                onChange({
                  ...config,
                  pipelineId: id,
                  pipelineName: name,
                  ...(stepType === "mark_deal_lost" ? { lostReason: "" } : {}),
                })
              }
            />
          </Labeled>
        )
      }
      return (
        <Labeled label={field.label} optional={field.optional} hint={field.hint}>
          <SourceSelect
            source={field.source}
            value={str(config[field.key])}
            config={config}
            inheritedChannelId={inheritedChannelId}
            bindToInbound={bindToInbound}
            onChange={(v) => set(field.key, v)}
          />
        </Labeled>
      )

    case "pipelineLossReason":
      return (
        <Labeled label={field.label} optional={field.optional} hint={field.hint}>
          <PipelineLossReasonSelect
            pipelineId={str(config.pipelineId)}
            value={str(config[field.key])}
            onChange={(v) => set(field.key, v)}
          />
        </Labeled>
      )

    case "departmentMulti":
      return (
        <Labeled label={field.label} optional={field.optional} hint={field.hint}>
          <DepartmentMultiSelect
            selectedIds={
              Array.isArray(config.departmentIds)
                ? (config.departmentIds as unknown[]).filter(
                    (v): v is string => typeof v === "string",
                  )
                : []
            }
            onChange={(ids, names) =>
              onChange({
                ...config,
                departmentIds: ids,
                departmentNames: names,
              })
            }
          />
        </Labeled>
      )

    case "duration":
      return <DurationField label={field.label} ms={num(config[field.key])} onChange={(ms) => set(field.key, ms)} />

    case "hours":
      return (
        <Labeled label={field.label}>
          <div className="cfg-affix">
            <InputGlass
              type="number"
              min={0}
              className="nodrag"
              value={String(Math.round((num(config[field.key]) / 3_600_000) * 100) / 100)}
              onChange={(e) => set(field.key, Math.max(0, Number(e.target.value)) * 3_600_000)}
            />
            <span className="cfg-suffix">h</span>
          </div>
        </Labeled>
      )

    case "delay":
      return <DelayField ms={num(config[field.key])} onChange={(ms) => set(field.key, ms)} />

    case "updateField":
      return <UpdateFieldEditor config={config} onChange={onChange} />

    case "templatePreview":
      return (
        <TemplatePreview
          config={config}
          inheritedChannelId={inheritedChannelId}
          bindToInbound={bindToInbound}
          onChange={onChange}
        />
      )

    case "webhookConfig":
      return <InlineWebhookConfig config={config} onChange={onChange} />

    case "sendProductConfig":
      return <SendProductInlineConfig config={config} onChange={onChange} />

    case "tabulationPicker":
      return <TabulationStepConfig config={config} onChange={onChange} />

    case "channelPicker":
      return (
        <ChannelPickerField
          stepType={stepType}
          config={config}
          mockIfEmpty={!!hideStepTargets}
          onChange={(scope, ids) =>
            onChange({
              ...config,
              channelScope: scope,
              channelIds: scope === "all" ? [] : ids,
              channelId: scope === "selected" && ids.length === 1 ? ids[0] : "",
            })
          }
        />
      )

    case "builder":
      switch (field.builder) {
        case "buttons":
          return <ButtonsBuilder label={field.label} variant="text" items={asArr(config[field.key])} steps={steps} hideStepTargets={hideStepTargets} onChange={(v) => set(field.key, v)} />
        case "buttonsTitle":
          return (
            <ButtonsBuilder
              label={field.label}
              variant="title"
              max={10}
              items={asArr(config[field.key])}
              steps={steps}
              hideStepTargets={hideStepTargets}
              onChange={(v) => set(field.key, v)}
              listMeta={
                asArr(config[field.key]).length > 3
                  ? {
                      button: str(config.button),
                      sectionTitle: str(config.sectionTitle),
                      onMetaChange: (patch) => onChange({ ...config, ...patch }),
                    }
                  : undefined
              }
            />
          )
        case "listRows":
          return (
            <ListRowsBuilder
              label={field.label}
              items={asArr(config[field.key])}
              steps={steps}
              hideStepTargets={hideStepTargets}
              onChange={(v) => set(field.key, v)}
            />
          )
        case "headers":
          return <HeadersBuilder items={asArr(config[field.key])} onChange={(v) => set(field.key, v)} />
        case "schedule":
          return <ScheduleBuilder items={asArr(config[field.key])} onChange={(v) => set(field.key, v)} />
        case "condition":
          return <ConditionBuilder config={config} steps={steps} onChange={onChange} />
      }
  }
}

function asArr<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

// ───────────────────────────── Primitivos ─────────────────────────────

function Labeled({
  label,
  optional,
  hint,
  children,
}: {
  label: string
  optional?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="cfg-field">
      <span className="cfg-label">
        {label}
        {optional && <em className="cfg-opt">opcional</em>}
      </span>
      {children}
      {hint && <span className="cfg-hint">{hint}</span>}
    </label>
  )
}

// ─────────────────── Textarea com atalho de variáveis ({ ou [) ───────────────────

type VarOpt = { token: string; label: string; hint?: string }

/** Monta a lista de variáveis: nativas + custom fields (contato/negócio). */
function useMessageVariables(): VarOpt[] {
  const { contact, deal } = useCustomFieldTokens()
  return useMemo(() => {
    const out: VarOpt[] = [
      { token: "{{contact.name}}", label: "Nome do contato" },
      { token: "{{contact.name|first_name}}", label: "Primeiro nome do contato" },
      { token: "{{contact.phone}}", label: "Telefone do contato" },
      { token: "{{contact.email}}", label: "E-mail do contato" },
      { token: "{{deal.title}}", label: "Título do negócio" },
      { token: "{{deal.value}}", label: "Valor do negócio" },
      { token: "{{assignee.name}}", label: "Responsável do lead", hint: "Consultor da conversa; sem ele, o dono do negócio" },
      { token: "{{assignee.name|first_name}}", label: "Primeiro nome do responsável" },
      { token: "{{lastResponse}}", label: "Mensagem do cliente (passo anterior)" },
    ]
    for (const c of contact) {
      if (!c.name) continue
      out.push({ token: `{{contactCustomFields.${c.name}}}`, label: `Contato: ${c.label || c.name}`, hint: "Campo personalizado" })
    }
    for (const d of deal) {
      if (!d.name) continue
      out.push({ token: `{{dealCustomFields.${d.name}}}`, label: `Negócio: ${d.label || d.name}`, hint: "Campo personalizado" })
    }
    return out
  }, [contact, deal])
}

function useVariablePicker(value: string, onChange: (v: string) => void) {
  const options = useMessageVariables()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [startPos, setStartPos] = useState<number | null>(null)
  const closeT = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || o.token.toLowerCase().includes(q))
      : options
    return base.slice(0, 30)
  }, [options, query])

  const close = () => {
    setOpen(false)
    setQuery("")
    setStartPos(null)
  }

  const refresh = (el: HTMLInputElement | HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? el.value.length
    const left = el.value.slice(0, caret)
    // Gatilho: "{" (tokens são {{...}}) ou "[" — usa o mais próximo do cursor.
    const trigger = Math.max(left.lastIndexOf("["), left.lastIndexOf("{"))
    if (trigger < 0) return close()
    let start = trigger
    const typed = left.slice(trigger + 1)
    if (typed.includes("\n")) return close()
    if (left[trigger] === "{") {
      while (start > 0 && left[start - 1] === "{") start -= 1
      if (typed.includes("}")) return close()
    } else if (typed.includes("]")) {
      return close()
    }
    setStartPos(start)
    setQuery(typed)
    setOpen(true)
  }

  const apply = (el: HTMLInputElement | HTMLTextAreaElement | null, token: string) => {
    if (!el || startPos == null) return
    const caret = el.selectionStart ?? value.length
    const next = `${value.slice(0, startPos)}${token}${value.slice(caret)}`
    onChange(next)
    close()
    requestAnimationFrame(() => {
      const pos = startPos + token.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return { open, filtered, closeT, refresh, apply, setOpen }
}

function VariablePickerPop({
  open,
  filtered,
  onPick,
}: {
  open: boolean
  filtered: VarOpt[]
  onPick: (token: string) => void
}) {
  if (!open || filtered.length === 0) return null
  return (
    <div className="cfg-pop nowheel nopan">
      {filtered.map((o) => (
        <button
          key={o.token}
          type="button"
          className="cfg-pop-item nodrag"
          title={o.token}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(o.token)
          }}
        >
          <span className="cfg-pop-dot" />
          {o.label}
        </button>
      ))}
    </div>
  )
}

function VariableInput({
  value,
  placeholder,
  onChange,
  className,
}: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
  className?: string
}) {
  const ref = useRef<HTMLInputElement | null>(null)
  const { open, filtered, closeT, refresh, apply, setOpen } = useVariablePicker(value, onChange)

  return (
    <div className="cfg-combo">
      <InputGlass
        ref={ref}
        className={cn("cfg-input nodrag", className)}
        value={value}
        placeholder={placeholder ?? "Texto ou { para variáveis"}
        onChange={(e) => {
          onChange(e.target.value)
          refresh(e.target)
        }}
        onKeyUp={(e) => refresh(e.currentTarget)}
        onClick={(e) => refresh(e.currentTarget)}
        onFocus={(e) => {
          if (closeT.current) clearTimeout(closeT.current)
          refresh(e.currentTarget)
        }}
        onBlur={() => {
          closeT.current = setTimeout(() => setOpen(false), 160)
        }}
      />
      <VariablePickerPop open={open} filtered={filtered} onPick={(token) => apply(ref.current, token)} />
    </div>
  )
}

function VariableTextarea({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const { open, filtered, closeT, refresh, apply, setOpen } = useVariablePicker(value, onChange)

  return (
    <div className="cfg-combo">
      <textarea
        ref={ref}
        className="cfg-textarea nodrag nowheel"
        rows={3}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          refresh(e.target)
        }}
        onKeyUp={(e) => refresh(e.currentTarget)}
        onClick={(e) => refresh(e.currentTarget)}
        onFocus={(e) => {
          if (closeT.current) clearTimeout(closeT.current)
          refresh(e.currentTarget)
        }}
        onBlur={() => {
          closeT.current = setTimeout(() => setOpen(false), 160)
        }}
      />
      <VariablePickerPop open={open} filtered={filtered} onPick={(token) => apply(ref.current, token)} />
    </div>
  )
}

function TagInput({
  label,
  optional,
  value,
  onChange,
}: {
  label: string
  optional?: boolean
  value: string
  onChange: (v: string) => void
}) {
  const { options, isLoading } = useTagOptions()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState<string | null>(null)
  const closeT = useRef<ReturnType<typeof setTimeout> | null>(null)

  // query === null → mostra TODAS (foco sem digitar); senão filtra pelo texto.
  const q = (query ?? "").trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  const exists = options.some((o) => o.value.toLowerCase() === value.trim().toLowerCase())

  const choose = (v: string) => {
    onChange(v)
    setQuery(null)
    setOpen(false)
  }

  return (
    <div className="cfg-field">
      <span className="cfg-label">
        {label}
        {optional && <em className="cfg-opt">opcional</em>}
      </span>
      <div className="cfg-combo">
        <InputGlass
          className="nodrag"
          value={value}
          placeholder={isLoading ? "Carregando tags…" : "Buscar ou criar tag…"}
          onFocus={() => {
            if (closeT.current) clearTimeout(closeT.current)
            setQuery(null)
            setOpen(true)
          }}
          onBlur={() => {
            closeT.current = setTimeout(() => setOpen(false), 160)
          }}
          onChange={(e) => {
            onChange(e.target.value)
            setQuery(e.target.value)
            setOpen(true)
          }}
        />
        {open && (
          <div className="cfg-pop cfg-pop--inplace nowheel nopan">
            {isLoading && <div className="cfg-pop-empty">Carregando tags…</div>}
            {!isLoading && filtered.length === 0 && (
              <div className="cfg-pop-empty">{value.trim() ? "Nenhuma tag — Enter cria esta." : "Nenhuma tag cadastrada."}</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`cfg-pop-item nodrag${o.value === value ? " on" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(o.value)
                }}
              >
                <span className="cfg-pop-dot" />
                {o.label}
              </button>
            ))}
            {value.trim() && !exists && (
              <button
                type="button"
                className="cfg-pop-item create nodrag"
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(value.trim())
                }}
              >
                + Criar tag “{value.trim()}”
              </button>
            )}
          </div>
        )}
      </div>
      <span className="cfg-hint">Selecione uma tag existente ou digite para criar uma nova.</span>
    </div>
  )
}

function stopFlowPointer(e: React.PointerEvent) {
  e.stopPropagation()
}

/** Select do DS v2 (DropdownGlass) — substitui `<select>` nativo. */
function ConfigSelect({
  value,
  options,
  placeholder,
  onChange,
  loading,
  allowEmpty = true,
}: {
  value: string
  options: Opt[]
  placeholder?: string
  onChange: (v: string) => void
  loading?: boolean
  allowEmpty?: boolean
}) {
  const ph = loading ? "Carregando…" : (placeholder ?? "Selecione…")
  const missing =
    value && !options.some((o) => o.value === value)
      ? [{ value, label: value }]
      : []
  const dropdownOptions: DropdownOption[] = [
    ...(allowEmpty ? [{ value: "", label: ph }] : []),
    ...missing.map((o) => ({ value: o.value, label: o.label })),
    ...options.map((o) => ({
      value: o.value,
      label: o.label,
      description: o.group,
    })),
  ]

  return (
    <div className="cfg-select-wrap nodrag nopan" onPointerDown={stopFlowPointer}>
      <DropdownGlass
        options={dropdownOptions}
        value={value}
        onValueChange={onChange}
        placeholder={ph}
        matchTriggerWidth
        disabled={loading}
        triggerClassName="!w-full"
      />
    </div>
  )
}

/**
 * Canais do passo — mesmo padrão do Kommo: "Selecionar tudo" + checkboxes
 * dos canais CONNECTED. `channelId` legado sozinho não vira filtro.
 */
function ChannelPickerField({
  stepType,
  config,
  mockIfEmpty,
  onChange,
}: {
  stepType: string
  config: Cfg
  mockIfEmpty?: boolean
  onChange: (scope: "all" | "selected", channelIds: string[]) => void
}) {
  const allowed = readStepAllowedChannelIds(config)
  const scope = readStepChannelScope(config)
  const values = allowed ?? []

  return (
    <div className="cfg-select-wrap nodrag nopan" onPointerDown={stopFlowPointer}>
      <ActiveChannelMultiSelect
        id="step-channels"
        kinds={stepType === "send_email" ? "email" : "whatsapp"}
        scope={scope}
        values={values}
        mockIfEmpty={mockIfEmpty}
        emptyHint="Marque ao menos um canal. Sem seleção, este passo não envia."
        onChange={onChange}
      />
    </div>
  )
}

/** Adapta WebhookStepConfig (setDraft) ao onChange do editor inline. */
function InlineWebhookConfig({
  config,
  onChange,
}: {
  config: Cfg
  onChange: (next: Cfg) => void
}) {
  // Ref espelha o draft mais recente pra updates funcionais em sequência
  // (URL + body no mesmo tick) não sobrescreverem uns aos outros.
  const draftRef = useRef(config)
  draftRef.current = config

  const setDraft: Dispatch<SetStateAction<Cfg>> = (updater) => {
    const base = draftRef.current
    const next = typeof updater === "function" ? updater(base) : updater
    // `__webhookBodyEntries` é estado de UI — backend só consome `body`.
    const { __webhookBodyEntries: _drop, ...rest } = next
    void _drop
    draftRef.current = rest
    onChange(rest)
  }

  return <WebhookStepConfig draft={config} setDraft={setDraft} />
}

function SourceSelect({
  source,
  value,
  onChange,
  config,
  inheritedChannelId,
  bindToInbound,
}: {
  source: SourceKey
  value: string
  onChange: (v: string) => void
  config: Cfg
  inheritedChannelId?: string
  bindToInbound?: boolean
}) {
  switch (source) {
    case "stage":
      return <HookSelect hook={useStageOptions} value={value} onChange={onChange} placeholder="Selecione um estágio…" />
    case "department":
      return <HookSelect hook={useDepartmentOptions} value={value} onChange={onChange} placeholder="Selecione um departamento…" />
    case "template":
      return (
        <TemplateNameSelect
          config={config}
          inheritedChannelId={inheritedChannelId}
          bindToInbound={bindToInbound}
          value={value}
          onChange={onChange}
        />
      )
    case "automation":
      return <HookSelect hook={useAutomationOptions} value={value} onChange={onChange} placeholder="Selecione uma automação…" />
    case "aiAgentId":
      return <AgentSelect by="id" value={value} onChange={onChange} />
    case "aiAgentUserId":
      return <AgentSelect by="userId" value={value} onChange={onChange} />
    case "owner":
      // Placeholder deixa o clear (opção vazia) óbvio: selecionar "Sem
      // responsável" desatribui no target configurado pro step.
      return <OwnerSelect value={value} onChange={onChange} placeholder="Sem responsável (limpar)…" />
  }
}

function StageSelect({
  value,
  onPick,
}: {
  value: string
  onPick: (id: string, name: string) => void
}) {
  const { options, isLoading } = useStageOptions()
  return (
    <ConfigSelect
      value={value}
      options={options}
      loading={isLoading}
      placeholder="Selecione um estágio…"
      onChange={(id) => {
        const opt = options.find((o) => o.value === id)
        onPick(id, opt?.label ?? "")
      }}
    />
  )
}

function DepartmentSelect({
  value,
  onPick,
}: {
  value: string
  onPick: (id: string, name: string) => void
}) {
  const { options, isLoading, isError } = useDepartmentOptions()
  if (isError) {
    return (
      <p className="cfg-info">
        Não foi possível carregar os departamentos. Verifique permissão (Admin/Manager)
        ou se a API `/api/settings/departments` está respondendo.
      </p>
    )
  }
  if (!isLoading && options.length === 0) {
    return (
      <p className="cfg-info">
        Nenhum departamento cadastrado. Crie em Configurações → Conversas → Departamentos.
      </p>
    )
  }
  return (
    <ConfigSelect
      value={value}
      options={options}
      loading={isLoading}
      placeholder="Selecione um departamento…"
      onChange={(id) => {
        const opt = options.find((o) => o.value === id)
        onPick(id, opt?.label ?? "")
      }}
    />
  )
}

function PipelineSelect({
  value,
  onPick,
}: {
  value: string
  onPick: (id: string, name: string) => void
}) {
  const { options, isLoading } = usePipelineOptions()
  return (
    <ConfigSelect
      value={value}
      options={options}
      loading={isLoading}
      placeholder="Selecione um funil…"
      onChange={(id) => {
        const opt = options.find((o) => o.value === id)
        onPick(id, opt?.label ?? "")
      }}
    />
  )
}

/** Motivo da perda (node "Perda") — catálogo restrito ao funil escolhido. */
function PipelineLossReasonSelect({
  pipelineId,
  value,
  onChange,
}: {
  pipelineId: string
  value: string
  onChange: (v: string) => void
}) {
  const { options, isLoading } = usePipelineLossReasonOptions(pipelineId)
  if (!pipelineId) {
    return <p className="cfg-info">Selecione um funil primeiro.</p>
  }
  if (!isLoading && options.length === 0) {
    return (
      <p className="cfg-info">
        Este funil não tem motivos de perda cadastrados. Configure em
        Configurações → Pipeline → etapa Perdido.
      </p>
    )
  }
  return (
    <ConfigSelect
      value={value}
      options={options}
      loading={isLoading}
      placeholder="Selecione o motivo…"
      onChange={onChange}
    />
  )
}

function DepartmentMultiSelect({
  selectedIds,
  onChange,
}: {
  selectedIds: string[]
  onChange: (ids: string[], names: string[]) => void
}) {
  const { options, isLoading, isError } = useDepartmentOptions()
  if (isError) {
    return (
      <p className="cfg-info">
        Não foi possível carregar os departamentos. Verifique permissão (Admin/Manager)
        ou se a API `/api/settings/departments` está respondendo.
      </p>
    )
  }
  if (!isLoading && options.length === 0) {
    return (
      <p className="cfg-info">
        Nenhum departamento cadastrado. Crie em Configurações → Conversas → Departamentos.
      </p>
    )
  }
  const selected = new Set(selectedIds)
  const toggle = (id: string) => {
    const next = selected.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    const names = next
      .map((nid) => options.find((o) => o.value === nid)?.label)
      .filter((n): n is string => !!n)
    onChange(next, names)
  }
  return (
    <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-2">
      {isLoading ? (
        <p className="cfg-info">Carregando departamentos…</p>
      ) : (
        options.map((opt) => {
          const checked = selected.has(opt.value)
          return (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] text-[var(--text-primary)] hover:bg-[var(--glass-bg-overlay)]"
            >
              <input
                type="checkbox"
                className="nodrag size-3.5 accent-[var(--brand-primary)]"
                checked={checked}
                onChange={() => toggle(opt.value)}
              />
              <span className="truncate font-medium">{opt.label}</span>
            </label>
          )
        })
      )}
      {selectedIds.length > 0 && (
        <button
          type="button"
          className="nodrag mt-0.5 self-start text-[11px] font-semibold text-[var(--brand-primary)] hover:underline"
          onClick={() => onChange([], [])}
        >
          Limpar seleção
        </button>
      )}
    </div>
  )
}

function TemplateNameSelect({
  config,
  inheritedChannelId,
  bindToInbound,
  value,
  onChange,
}: {
  config: Cfg
  inheritedChannelId?: string
  bindToInbound?: boolean
  value: string
  onChange: (v: string) => void
}) {
  const catalog = useStepTemplateCatalog(config, inheritedChannelId, { bindToInbound })
  const missing = catalog.missingChannelLabels(value, str(config.languageCode))
  return (
    <>
      <ConfigSelect
        value={value}
        options={catalog.options}
        onChange={onChange}
        placeholder="Selecione um template…"
        loading={catalog.isLoading}
      />
      {catalog.isIntersect && !catalog.isLoading ? (
        <p className="cfg-hint">
          Só templates aprovados em todos os WhatsApp deste passo. Cada envio sai no número da conversa.
        </p>
      ) : null}
      {missing.length > 0 ? (
        <p className="cfg-warning">
          O template {value} não está aprovado na WABA de {missing.join(", ")}.
          O envio nesse número vai falhar — não usamos outro WhatsApp.
        </p>
      ) : null}
    </>
  )
}

function HookSelect({
  hook,
  value,
  onChange,
  placeholder,
}: {
  hook: () => { options: Opt[]; isLoading: boolean }
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { options, isLoading } = hook()
  return <ConfigSelect value={value} options={options} onChange={onChange} placeholder={placeholder} loading={isLoading} />
}

function AgentSelect({ by, value, onChange }: { by: "id" | "userId"; value: string; onChange: (v: string) => void }) {
  const { options, isLoading } = useAiAgentOptions(by)
  return <ConfigSelect value={value} options={options} onChange={onChange} placeholder="Selecione um agente…" loading={isLoading} />
}

function OwnerSelect({
  value,
  onChange,
  placeholder = "Selecione um responsável…",
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const users = useUserOptions()
  const agents = useAiAgentOptions("userId")
  const options: Opt[] = [
    ...users.options.map((o) => ({ ...o, group: "Usuários" })),
    ...agents.options.map((o) => ({ ...o, group: "Agentes IA" })),
  ]
  return (
    <ConfigSelect
      value={value}
      options={options}
      onChange={onChange}
      placeholder={placeholder}
      loading={users.isLoading || agents.isLoading}
    />
  )
}

// ───────────────────── Duração (h/m/s) e Delay (valor+unidade) ─────────────────────

function DurationField({ label, ms, onChange }: { label: string; ms: number; onChange: (ms: number) => void }) {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const emit = (nh: number, nm: number, ns: number) => onChange(nh * 3_600_000 + nm * 60_000 + ns * 1000)
  return (
    <div className="cfg-field">
      <span className="cfg-label">{label}</span>
      <div className="cfg-duration">
        <NumBox v={h} suffix="h" onChange={(x) => emit(x, m, s)} />
        <NumBox v={m} suffix="min" max={59} onChange={(x) => emit(h, x, s)} />
        <NumBox v={s} suffix="seg" max={59} onChange={(x) => emit(h, m, x)} />
      </div>
    </div>
  )
}

function NumBox({ v, suffix, max, onChange }: { v: number; suffix: string; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="cfg-affix">
      <InputGlass
        type="number"
        min={0}
        max={max}
        className="nodrag"
        value={String(v)}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
      />
      <span className="cfg-suffix">{suffix}</span>
    </div>
  )
}

const DELAY_UNITS: Opt[] = [
  { value: "minutes", label: "minutos" },
  { value: "hours", label: "horas" },
  { value: "days", label: "dias" },
]

function DelayField({ ms, onChange }: { ms: number; onChange: (ms: number) => void }) {
  let unit: "minutes" | "hours" | "days" = "minutes"
  let value = Math.round(ms / 60_000)
  if (ms > 0 && ms % 86_400_000 === 0) {
    unit = "days"
    value = ms / 86_400_000
  } else if (ms > 0 && ms % 3_600_000 === 0) {
    unit = "hours"
    value = ms / 3_600_000
  }
  const factor = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }
  return (
    <div className="cfg-field">
      <span className="cfg-label">Duração</span>
      <div className="cfg-row">
        <InputGlass
          type="number"
          min={0}
          className="nodrag"
          value={String(value)}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)) * factor[unit])}
        />
        <ConfigSelect value={unit} options={DELAY_UNITS} onChange={(u) => onChange(value * factor[u as keyof typeof factor])} />
      </div>
    </div>
  )
}

// ───────────────────────────── update_field ─────────────────────────────

function UpdateFieldEditor({ config, onChange }: { config: Cfg; onChange: (next: Cfg) => void }) {
  const entity = (str(config.entity) || "contact") as "contact" | "deal"
  const { options, isLoading } = useFieldOptions(entity)
  const { bySlug } = useCustomFieldMetaBySlug(entity)
  const fieldSlug = str(config.field)
  const meta = fieldSlug ? bySlug.get(fieldSlug) : undefined
  const fieldType = meta?.type ?? ""
  const fieldOpts = meta?.options ?? []
  return (
    <>
      <Labeled label="Entidade">
        <ConfigSelect
          value={entity}
          options={[
            { value: "contact", label: "Contato" },
            { value: "deal", label: "Negócio" },
          ]}
          onChange={(v) => onChange({ ...config, entity: v, field: "", value: "" })}
        />
      </Labeled>
      <Labeled label="Campo">
        <ConfigSelect
          value={fieldSlug}
          options={options}
          loading={isLoading}
          onChange={(v) => onChange({ ...config, field: v, value: "" })}
          placeholder="Selecione o campo…"
        />
      </Labeled>
      <Labeled
        label="Valor"
        hint={
          showsUpdateFieldVariableHint(fieldType)
            ? "Aceita variáveis, ex.: {{lastResponse}}"
            : undefined
        }
      >
        <UpdateFieldValueControl
          fieldType={fieldType}
          options={fieldOpts}
          value={str(config.value)}
          onChange={(v) => onChange({ ...config, value: v })}
          variant="inline"
        />
      </Labeled>
    </>
  )
}

// ─────────────────────── Preview do template WhatsApp ───────────────────────

/**
 * Preview do template (estilo WhatsApp): apenas o CORPO da mensagem. Os
 * botões NÃO aparecem aqui — eles viram linhas com handle no próprio card
 * (nó interativo), onde cada botão é arrastado para o próximo passo (modelo
 * Kommo). Aqui só auto-sincronizamos `config.buttons` a partir dos
 * quick-replies do template (preservando `gotoStepId` por título) + o
 * `bodyPreview`; é isso que faz o card renderizar 1 handle por botão.
 */
function TemplatePreview({
  config,
  inheritedChannelId,
  bindToInbound,
  onChange,
}: {
  config: Cfg
  inheritedChannelId?: string
  bindToInbound?: boolean
  onChange: (next: Cfg) => void
}) {
  const templateName = str(config.templateName)
  const { detailsMap, isLoading } = useStepTemplateCatalog(config, inheritedChannelId, {
    bindToInbound,
  })
  const detail = getTemplateDetail(detailsMap, templateName, str(config.languageCode))

  const varSlots = useMemo(
    () => templateVariableSlots(detail?.bodyPreview, detail?.headerPreview),
    [detail],
  )
  const vars = useMemo(
    () => templateVariablesFromConfig(varSlots, config.components),
    [varSlots, config.components],
  )

  useEffect(() => {
    if (!detail) return
    const prev = asArr(config.buttons) as BtnItem[]
    const desired = mergeTemplateQuickReplies(prev, detail.quickReplies)
    const sameBtns =
      desired.length === prev.length &&
      desired.every(
        (b, i) => b.title === str(prev[i]?.title) && b.gotoStepId === str(prev[i]?.gotoStepId),
      )
    const sameBody = str(config.bodyPreview) === detail.bodyPreview
    const sameLang = !detail.language || str(config.languageCode) === detail.language
    const hf = (detail.headerFormat || "").toUpperCase()
    const needsMedia = hf === "IMAGE" || hf === "VIDEO" || hf === "DOCUMENT"
    const clearHeader =
      !needsMedia &&
      (str(config.headerMediaUrl) !== "" ||
        str(config.headerMediaType) !== "" ||
        str(config.headerUploadedFileName) !== "")
    // Reconciliação na troca de template: parâmetro órfão do template anterior
    // faz a Meta rejeitar o envio, então o array é sempre reescrito a partir
    // dos placeholders do template atual.
    const desiredComponents = buildTemplateComponents(vars)
    const sameComponents = sameTemplateComponents(config.components, desiredComponents)
    if (sameBtns && sameBody && sameLang && !clearHeader && sameComponents) return
    onChange({
      ...config,
      buttons: desired,
      bodyPreview: detail.bodyPreview,
      components: desiredComponents,
      ...(detail.language ? { languageCode: detail.language } : {}),
      ...(clearHeader
        ? { headerMediaUrl: "", headerMediaType: "", headerUploadedFileName: "" }
        : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateName, detail])

  const setVar = (slot: (typeof varSlots)[number], value: string) => {
    onChange({
      ...config,
      components: buildTemplateComponents(setTemplateVariableValue(vars, slot, value)),
    })
  }

  if (!templateName) return null
  if (isLoading && !detail) return <p className="cfg-info">Carregando preview…</p>
  if (!detail) return null

  const headerFormat = (detail.headerFormat || "").toUpperCase()
  const needsHeaderMedia = headerFormat === "IMAGE" || headerFormat === "VIDEO" || headerFormat === "DOCUMENT"
  const hasBody = detail.bodyPreview.trim() !== ""

  if (!hasBody && !needsHeaderMedia && varSlots.length === 0) return null

  const headerMediaMissing = needsHeaderMedia && str(config.headerMediaUrl) === ""
  const missingVars = countMissingTemplateVariables(vars)

  return (
    <>
      {needsHeaderMedia && (
        <HeaderMediaField
          headerFormat={headerFormat as "IMAGE" | "VIDEO" | "DOCUMENT"}
          config={config}
          onChange={onChange}
        />
      )}
      {headerMediaMissing && (
        <p className="cfg-warning">
          Este template exige {HEADER_MEDIA_LABEL[headerFormat] ?? "mídia"} no cabeçalho — configure acima antes de ativar a automação.
        </p>
      )}
      {varSlots.length > 0 && (
        <div className="cfg-field">
          <span className="cfg-label">Variáveis do template</span>
          <p className="cfg-hint">
            A Meta só entende os placeholders do template aprovado. Escreva texto fixo ou
            digite <code>{"{"}</code> para inserir um campo do CRM.
          </p>
          <div className="cfg-list">
            {varSlots.map((slot) => (
              <div className="cfg-field" key={`${slot.component}-${slot.key}`}>
                <span className="cfg-sublabel">{templateVariableLabel(slot)}</span>
                <VariableInput
                  value={templateVariableValue(vars, slot)}
                  placeholder="Texto ou { para variáveis"
                  onChange={(v) => setVar(slot, v)}
                />
              </div>
            ))}
          </div>
          {missingVars > 0 && (
            <p className="cfg-warning">
              {missingVars === 1
                ? "1 variável sem valor — a Meta rejeita o envio com parâmetro faltando."
                : `${missingVars} variáveis sem valor — a Meta rejeita o envio com parâmetro faltando.`}
            </p>
          )}
        </div>
      )}
      {hasBody && (
        <div className="cfg-field">
          <span className="cfg-label">Pré-visualização</span>
          <div className="cfg-tpl-preview nodrag nowheel">
            <p className="cfg-tpl-body">
              {renderTemplatePreview(detail.bodyPreview, templateVariablesOf(vars, "body"))}
            </p>
          </div>
          {detail.quickReplies.length > 0 && (
            <p className="cfg-hint">
              Os botões aparecem no card — arraste cada um para o próximo passo.
            </p>
          )}
        </div>
      )}
    </>
  )
}

const HEADER_MEDIA_LABEL: Record<string, string> = {
  IMAGE: "imagem",
  VIDEO: "vídeo",
  DOCUMENT: "documento",
}

// ───────────────────────────── Mídia (upload + URL) ─────────────────────────────

const MEDIA_ACCEPT: Record<string, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/webm",
  audio: "audio/ogg,audio/mpeg,audio/mp4,audio/mp3",
  document:
    "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain",
}

/**
 * Base compartilhada do campo de mídia: anexar arquivo direto (upload p/
 * `/api/uploads/automation-media`) OU colar uma URL. `MediaField` e
 * `HeaderMediaField` só diferem nas chaves de `config` onde gravam o
 * resultado — a UI e a lógica de upload são as mesmas.
 */
function MediaUploadField({
  label,
  hint,
  mediaType,
  url,
  fileName,
  onPatch,
}: {
  label: string
  hint?: string
  mediaType: string
  url: string
  fileName: string
  onPatch: (p: { url: string; fileName: string }) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const hasFile = url.startsWith("/uploads/") || url.startsWith("/api/storage/")

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 16 * 1024 * 1024) {
      toast.warning("Arquivo excede o limite de 16 MB.")
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(apiUrl("/api/uploads/automation-media"), { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message ?? "Erro ao enviar arquivo.")
        return
      }
      onPatch({ url: data.url, fileName: data.fileName })
    } catch {
      toast.error("Erro de rede ao enviar arquivo.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="cfg-field">
      <span className="cfg-label">{label}</span>
      {hint && <span className="cfg-hint">{hint}</span>}

      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT[mediaType] ?? "*/*"}
        onChange={onFile}
        style={{ display: "none" }}
      />

      <button
        type="button"
        className="cfg-add nodrag"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Enviando…" : "📎 Anexar arquivo do computador"}
      </button>

      {hasFile && (
        <div className="cfg-row" style={{ alignItems: "center", marginTop: 6 }}>
          <span className="cfg-hint" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ✓ {fileName || "arquivo anexado"}
          </span>
          <button
            type="button"
            className="cfg-x nodrag"
            title="Remover"
            onClick={() => onPatch({ url: "", fileName: "" })}
          >
            ×
          </button>
        </div>
      )}

      {mediaType === "image" && hasFile && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Prévia"
          style={{ maxHeight: 120, width: "100%", objectFit: "contain", marginTop: 6, borderRadius: 6 }}
        />
      )}

      <span className="cfg-hint" style={{ marginTop: 6 }}>ou cole uma URL HTTPS:</span>
      <InputGlass
        className="nodrag"
        value={hasFile ? "" : url}
        placeholder="https://…"
        disabled={hasFile}
        onChange={(e) => onPatch({ url: e.target.value, fileName: "" })}
      />
    </div>
  )
}

/**
 * Campo de mídia da automação: grava em `config.mediaUrl` e guarda
 * `config.uploadedFileName` p/ mostrar o nome.
 */
function MediaField({ label, config, onChange }: { label: string; config: Cfg; onChange: (next: Cfg) => void }) {
  const mediaType = str(config.mediaType) || "image"
  return (
    <MediaUploadField
      label={label}
      mediaType={mediaType}
      url={str(config.mediaUrl)}
      fileName={str(config.uploadedFileName)}
      onPatch={({ url, fileName }) => onChange({ ...config, mediaUrl: url, uploadedFileName: fileName })}
    />
  )
}

/**
 * Campo de mídia do HEADER do template (IMAGE/VIDEO/DOCUMENT). A Meta exige
 * o parâmetro do header preenchido nesses casos (erro `132012`), com uma URL
 * HTTPS pública — grava em `config.headerMediaUrl` + `config.headerMediaType`
 * (usados pelo executor da automação, não pelo `mediaUrl` do template em si).
 */
function HeaderMediaField({
  headerFormat,
  config,
  onChange,
}: {
  headerFormat: "IMAGE" | "VIDEO" | "DOCUMENT"
  config: Cfg
  onChange: (next: Cfg) => void
}) {
  const mediaType = headerFormat.toLowerCase()
  return (
    <MediaUploadField
      label="Mídia do cabeçalho (obrigatório)"
      hint="Obrigatório para este template. Faça upload aqui ou cole uma URL HTTPS pública."
      mediaType={mediaType}
      url={str(config.headerMediaUrl)}
      fileName={str(config.headerUploadedFileName)}
      onPatch={({ url, fileName }) =>
        onChange({ ...config, headerMediaUrl: url, headerMediaType: mediaType, headerUploadedFileName: fileName })
      }
    />
  )
}

// ───────────────────────────── Builders ─────────────────────────────

type BtnItem = {
  id?: string
  text?: string
  title?: string
  gotoStepId?: string
  kind?: string
  flowDefinitionId?: string
  flowCta?: string
}

function ButtonsBuilder({
  label,
  variant,
  max,
  items,
  steps,
  hideStepTargets,
  onChange,
  listMeta,
}: {
  label: string
  variant: "text" | "title"
  max?: number
  items: BtnItem[]
  steps: StepOpt[]
  hideStepTargets?: boolean
  onChange: (v: BtnItem[]) => void
  listMeta?: {
    button: string
    sectionTitle: string
    onMetaChange: (patch: { button?: string; sectionTitle?: string }) => void
  }
}) {
  const key = variant
  const asList = items.length > 3
  const titleMax = asList ? 24 : 20
  const allowFlow = variant === "title"
  const flows = usePublishedFlowOptions()
  const update = (i: number, patch: Partial<BtnItem>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const add = () => onChange([...items, { id: rid("btn"), [key]: "", kind: "action" }])
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const full = max != null && items.length >= max
  const isFlowItem = (it: BtnItem) =>
    (it.kind ?? "").toLowerCase() === "flow" || Boolean((it.flowDefinitionId ?? "").trim() && (it.kind ?? "").toLowerCase() !== "action")
  return (
    <div className="cfg-field">
      <span className="cfg-label">{asList ? "Itens da lista (máx. 10)" : label}</span>
      <span className="cfg-hint">
        {asList
          ? "4+ opções: o WhatsApp envia como lista (Meta: 10 itens, título 24 caracteres)."
          : "Até 3 opções aparecem como botões (20 caracteres). A 4ª vira lista."}
        {allowFlow ? " Cada botão pode ser Ação (resposta) ou Flow (abre um formulário publicado)." : ""}
      </span>
      {asList && listMeta && (
        <div className="mt-2 flex flex-col gap-2">
          <InputGlass
            className="cfg-input nodrag"
            placeholder="Botão que abre a lista (máx. 20)"
            value={listMeta.button}
            maxLength={20}
            onChange={(e) => listMeta.onMetaChange({ button: e.target.value })}
          />
          <InputGlass
            className="cfg-input nodrag"
            placeholder="Título da seção (opcional, máx. 24)"
            value={listMeta.sectionTitle}
            maxLength={24}
            onChange={(e) => listMeta.onMetaChange({ sectionTitle: e.target.value })}
          />
        </div>
      )}
      <div className="cfg-list">
        {items.map((it, i) => (
          <div className="cfg-item" key={it.id ?? i}>
            <div className="cfg-item-head">
              <InputGlass
                className="cfg-input nodrag"
                placeholder={`${asList ? "Item" : "Botão"} ${i + 1} (máx. ${titleMax})`}
                value={str(it[key])}
                maxLength={titleMax}
                onChange={(e) => update(i, { [key]: e.target.value })}
              />
              <button className="cfg-x nodrag" title="Remover" onClick={() => remove(i)}>
                ×
              </button>
            </div>
            {allowFlow && (
              <ConfigSelect
                value={isFlowItem(it) ? "flow" : "action"}
                allowEmpty={false}
                options={[
                  { value: "action", label: "Botão de ação" },
                  { value: "flow", label: "Botão de Flow" },
                ]}
                placeholder="Tipo"
                onChange={(v) =>
                  update(i, {
                    kind: v,
                    ...(v === "action" ? { flowDefinitionId: "", flowCta: "" } : {}),
                  })
                }
              />
            )}
            {allowFlow && isFlowItem(it) && (
              <>
                <ConfigSelect
                  value={str(it.flowDefinitionId)}
                  options={optionsWithSaved(flows.options, str(it.flowDefinitionId))}
                  loading={flows.isLoading}
                  placeholder="Flow publicado…"
                  onChange={(v) => update(i, { flowDefinitionId: v, kind: "flow" })}
                />
                {!flows.isLoading && flows.options.length === 0 && (
                  <span className="cfg-hint">
                    Nenhum Flow publicado. Crie em Configurações → Modelos de mensagem.
                  </span>
                )}
                <InputGlass
                  className="cfg-input nodrag"
                  placeholder="CTA do Flow (máx. 20)"
                  value={str(it.flowCta)}
                  maxLength={20}
                  onChange={(e) => update(i, { flowCta: e.target.value, kind: "flow" })}
                />
              </>
            )}
            {!hideStepTargets && (
              <ConfigSelect value={str(it.gotoStepId)} options={steps} placeholder="Ir para passo…" onChange={(v) => update(i, { gotoStepId: v })} />
            )}
          </div>
        ))}
      </div>
      {!full && (
        <button className="cfg-add nodrag" onClick={add}>
          {asList ? "+ Adicionar item" : "+ Adicionar botão"}
        </button>
      )}
    </div>
  )
}

type ListRowItem = {
  id?: string
  title?: string
  description?: string
  gotoStepId?: string
}

function ListRowsBuilder({
  label,
  items,
  steps,
  hideStepTargets,
  onChange,
}: {
  label: string
  items: ListRowItem[]
  steps: StepOpt[]
  hideStepTargets?: boolean
  onChange: (v: ListRowItem[]) => void
}) {
  const update = (i: number, patch: Partial<ListRowItem>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const add = () => onChange([...items, { id: rid("row"), title: "", description: "" }])
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const full = items.length >= 10
  return (
    <div className="cfg-field">
      <span className="cfg-label">{label}</span>
      <span className="cfg-hint">Título ≤ 24 caracteres · descrição ≤ 72 (opcional).</span>
      <div className="cfg-list">
        {items.map((it, i) => (
          <div className="cfg-item" key={it.id ?? i}>
            <div className="cfg-item-head">
              <VariableInput
                placeholder={`Item ${i + 1}`}
                value={str(it.title)}
                onChange={(v) => update(i, { title: v })}
              />
              <button className="cfg-x nodrag" title="Remover" onClick={() => remove(i)}>
                ×
              </button>
            </div>
            <VariableInput
              placeholder="Descrição (opcional)"
              value={str(it.description)}
              onChange={(v) => update(i, { description: v })}
            />
            {!hideStepTargets && (
              <ConfigSelect
                value={str(it.gotoStepId)}
                options={steps}
                placeholder="Ir para passo…"
                onChange={(v) => update(i, { gotoStepId: v })}
              />
            )}
          </div>
        ))}
      </div>
      {!full && (
        <button className="cfg-add nodrag" onClick={add}>
          + Adicionar item
        </button>
      )}
    </div>
  )
}

type Header = { key?: string; value?: string }

function HeadersBuilder({ items, onChange }: { items: Header[]; onChange: (v: Header[]) => void }) {
  const update = (i: number, patch: Partial<Header>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  return (
    <div className="cfg-field">
      <span className="cfg-label">Headers</span>
      <div className="cfg-list">
        {items.map((it, i) => (
          <div className="cfg-row" key={i}>
            <InputGlass className="nodrag" placeholder="Chave" value={str(it.key)} onChange={(e) => update(i, { key: e.target.value })} />
            <InputGlass className="nodrag" placeholder="Valor" value={str(it.value)} onChange={(e) => update(i, { value: e.target.value })} />
            <button className="cfg-x nodrag" title="Remover" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="cfg-add nodrag" onClick={() => onChange([...items, { key: "", value: "" }])}>
        + Adicionar header
      </button>
    </div>
  )
}

type Schedule = { days?: number[]; from?: string; to?: string }

/**
 * Widget de valor para as ops `in_business_hours` / `not_in_business_hours`
 * do bloco Condição. Reusa `ScheduleBuilder` e um input de timezone,
 * serializando/deserializando como JSON `{ schedule, timezone }` no
 * value da regra.
 */
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
  } catch { /* ignore parse errors — usa default */ }

  const emit = (schedule: Schedule[], timezone: string) => {
    onChange(JSON.stringify({ schedule, timezone }))
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-2">
      <ScheduleBuilder items={parsed.schedule} onChange={(next) => emit(next, parsed.timezone)} />
      <label className="flex items-center gap-2 text-[11px] text-[var(--color-ink-muted)]">
        <span className="shrink-0">Fuso:</span>
        <input
          type="text"
          className="cfg-input nodrag flex-1"
          placeholder="America/Sao_Paulo"
          value={parsed.timezone}
          onChange={(e) => emit(parsed.schedule, e.target.value)}
        />
      </label>
    </div>
  )
}

function ScheduleBuilder({ items, onChange }: { items: Schedule[]; onChange: (v: Schedule[]) => void }) {
  const update = (i: number, patch: Partial<Schedule>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const toggleDay = (i: number, day: number) => {
    const days = new Set(items[i]?.days ?? [])
    days.has(day) ? days.delete(day) : days.add(day)
    update(i, { days: [...days].sort() })
  }
  return (
    <div className="cfg-field">
      <span className="cfg-label">Horários de funcionamento</span>
      <div className="cfg-list">
        {items.map((it, i) => (
          <div className="cfg-item" key={i}>
            <div className="cfg-days">
              {WEEK_DAYS.map((d) => (
                <button
                  key={d.value}
                  className={`cfg-day nodrag${(it.days ?? []).includes(d.value) ? " on" : ""}`}
                  onClick={() => toggleDay(i, d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="cfg-row">
              <input type="time" className="cfg-input nodrag" value={str(it.from) || "09:00"} onChange={(e) => update(i, { from: e.target.value })} />
              <span className="cfg-dash">→</span>
              <input type="time" className="cfg-input nodrag" value={str(it.to) || "18:00"} onChange={(e) => update(i, { to: e.target.value })} />
              <button className="cfg-x nodrag" title="Remover" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="cfg-add nodrag" onClick={() => onChange([...items, { days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" }])}>
        + Adicionar faixa horária
      </button>
    </div>
  )
}

type Rule = { field?: string; op?: string; value?: unknown }
type Branch = { id?: string; label?: string; rules?: Rule[]; nextStepId?: string }

const NO_VALUE_OPS = new Set(["empty", "not_empty"])

/**
 * Widget de VALOR da regra, escolhido pelo campo/operador selecionado.
 * Cada ramo renderiza um componente próprio que chama seu hook — sem
 * violar as regras de hooks (o condicional é sobre QUAL componente
 * renderiza, não sobre chamar hooks condicionalmente).
 */
function ConditionValue({
  field,
  op,
  value,
  onChange,
}: {
  field: string
  op: string
  value: string
  onChange: (v: string) => void
}) {
  // Hooks incondicionais — o `if` decide qual JSX retorna, não se o hook roda.
  const { byPath: customFieldMeta } = useCustomFieldConditionMeta()

  const isTagField = field.endsWith(".tags") || field.endsWith(".tagIds")
  if (op === "has_tag" || op === "not_has_tag" || isTagField) {
    return <HookSelect hook={useTagOptions} value={value} onChange={onChange} placeholder="Selecione uma tag…" />
  }
  // Expediente: dias + faixas horárias + fuso — value serializado como JSON
  // { schedule: [{days,from,to}], timezone }
  if (CONDITION_SCHEDULE_OPS.has(op)) {
    return <BusinessHoursValue value={value} onChange={onChange} />
  }
  if (CONDITION_BOOL_FIELDS.has(field)) {
    return <ConfigSelect value={value} options={BOOL_OPTS} onChange={onChange} placeholder="Sim/Não" />
  }
  if (field.endsWith("assignedToId") || field.endsWith("ownerId")) {
    return <OwnerSelect value={value} onChange={onChange} />
  }
  if (field === "conversation.departmentId") {
    return <HookSelect hook={useDepartmentOptions} value={value} onChange={onChange} placeholder="Selecione um departamento…" />
  }
  if (field === "deal.stageId") {
    return <HookSelect hook={useStageOptions} value={value} onChange={onChange} placeholder="Selecione uma etapa…" />
  }
  if (field === "deal.pipelineId") {
    return <HookSelect hook={usePipelineOptions} value={value} onChange={onChange} placeholder="Selecione um funil…" />
  }
  if (field === "deal.status") {
    return <ConfigSelect value={value} options={DEAL_STATUS_OPTS} onChange={onChange} placeholder="Status…" />
  }
  if (field === "conversation.channel") {
    return <ConfigSelect value={value} options={CHANNEL_KIND_OPTS} onChange={onChange} placeholder="Canal…" />
  }
  const meta = customFieldMeta.get(field)
  if (meta?.type === "BOOLEAN") {
    return <ConfigSelect value={value} options={BOOL_OPTS} onChange={onChange} placeholder="Sim/Não" />
  }
  if ((meta?.type === "SELECT" || meta?.type === "MULTI_SELECT") && meta.options.length > 0) {
    return (
      <ConfigSelect
        value={value}
        options={meta.options.map((opt) => ({ value: opt, label: opt }))}
        onChange={onChange}
        placeholder="Selecione…"
      />
    )
  }
  return <InputGlass className="nodrag" placeholder="valor" value={value} onChange={(e) => onChange(e.target.value)} />
}

function ConditionBuilder({ config, steps, onChange }: { config: Cfg; steps: StepOpt[]; onChange: (next: Cfg) => void }) {
  const branches = asArr<Branch>(config.branches)
  const { options: customFieldOptions, isLoading: fieldsLoading } = useConditionFieldOptions()
  const fieldOptions = [...CONDITION_FIELDS, ...customFieldOptions]
  const knownFields = new Set(fieldOptions.map((f) => f.value))
  const setBranches = (b: Branch[]) => onChange({ ...config, branches: b })
  const updateBranch = (bi: number, patch: Partial<Branch>) => setBranches(branches.map((b, i) => (i === bi ? { ...b, ...patch } : b)))
  const updateRule = (bi: number, ri: number, patch: Partial<Rule>) => {
    const rules = (branches[bi]?.rules ?? []).map((r, i) => (i === ri ? { ...r, ...patch } : r))
    updateBranch(bi, { rules })
  }
  return (
    <div className="cfg-field">
      <span className="cfg-label">Condições</span>
      <div className="cfg-list">
        {branches.map((b, bi) => (
          <div className="cfg-branch" key={b.id ?? bi}>
            <div className="cfg-item-head">
              <InputGlass
                className="nodrag"
                placeholder={`Ramo ${bi + 1} (rótulo opcional)`}
                value={str(b.label)}
                onChange={(e) => updateBranch(bi, { label: e.target.value })}
              />
              {branches.length > 1 && (
                <button className="cfg-x nodrag" title="Remover ramo" onClick={() => setBranches(branches.filter((_, i) => i !== bi))}>
                  ×
                </button>
              )}
            </div>
            {(b.rules ?? []).map((r, ri) => {
              const noVal = NO_VALUE_OPS.has(str(r.op))
              const field = str(r.field)
              const isCustom = !!field && !knownFields.has(field)
              return (
                <div className="cfg-rule cfg-rule--stack" key={ri}>
                  <div className="cfg-rule-row">
                    <ConfigSelect
                      value={isCustom ? CUSTOM_FIELD_SENTINEL : field}
                      options={[
                        ...fieldOptions,
                        { value: CUSTOM_FIELD_SENTINEL, label: "Outro (caminho livre)…" },
                      ]}
                      loading={fieldsLoading}
                      placeholder="Campo"
                      onChange={(v) => {
                        if (v === CUSTOM_FIELD_SENTINEL) {
                          updateRule(bi, ri, { field: "variables.", value: "" })
                        } else {
                          updateRule(bi, ri, { field: v, value: "" })
                        }
                      }}
                    />
                    <button
                      className="cfg-x nodrag"
                      title="Remover regra"
                      onClick={() => updateBranch(bi, { rules: (b.rules ?? []).filter((_, i) => i !== ri) })}
                    >
                      ×
                    </button>
                  </div>
                  {isCustom && (
                    <InputGlass
                      className="nodrag"
                      placeholder="caminho (ex.: variables.resposta)"
                      value={field}
                      onChange={(e) => updateRule(bi, ri, { field: e.target.value })}
                    />
                  )}
                  <div className="cfg-rule-row">
                    <ConfigSelect
                      value={str(r.op)}
                      options={CONDITION_OPS}
                      placeholder="Operador"
                      onChange={(v) => updateRule(bi, ri, { op: v })}
                    />
                  </div>
                  {!noVal && (
                    <div className="cfg-rule-row">
                      <ConditionValue
                        field={field}
                        op={str(r.op)}
                        value={str(r.value)}
                        onChange={(v) => updateRule(bi, ri, { value: v })}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            <button
              className="cfg-add cfg-add--dashed nodrag"
              onClick={() =>
                updateBranch(bi, { rules: [...(b.rules ?? []), { field: "", op: "eq", value: "" }] })
              }
            >
              + regra
            </button>
            <div className="cfg-subrow">
              <span className="cfg-sublabel">Quando bater → ir para</span>
              <ConfigSelect
                value={str(b.nextStepId)}
                options={steps}
                placeholder="Selecione o passo…"
                onChange={(v) => updateBranch(bi, { nextStepId: v })}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        className="cfg-add cfg-add--block nodrag"
        onClick={() =>
          setBranches([
            ...branches,
            { id: rid("br"), label: "", rules: [{ field: "", op: "eq", value: "" }] },
          ])
        }
      >
        + Adicionar ramo
      </button>
      <div className="cfg-subrow cfg-subrow--else">
        <span className="cfg-sublabel">Nenhuma condição → ir para</span>
        <ConfigSelect
          value={str(config.elseStepId)}
          options={steps}
          placeholder="Selecione o passo…"
          onChange={(v) => onChange({ ...config, elseStepId: v })}
        />
      </div>
    </div>
  )
}
