import {
  ACTION_STEP_TYPES,
  isMessageChannelStep,
  type ActionStepType,
} from "@/lib/automation-workflow"
import { defaultStepConfig, stepTypeLabel, summarizeStepConfig } from "@/lib/automation-workflow"
import {
  blankFlowNodeData,
  type FlowNodeData,
  type NodeConfig,
  type NodeKind,
  type Output,
} from "@/lib/flow-data"
import { hydrateConditionBranches } from "@/lib/automation-condition"
import { normalizeRoundRobinConfig, roundRobinOptionLabel } from "@/lib/automation-round-robin"

const INTERACTIVE_TYPES = new Set<ActionStepType>([
  "send_whatsapp_interactive",
  "send_whatsapp_list",
  "question",
])

const MESSAGE_TYPES = new Set<ActionStepType>([
  "send_whatsapp_message",
  "send_whatsapp_template",
  "send_whatsapp_media",
  "send_whatsapp_flow",
  "send_product",
  "send_email",
])

const FINISH_TYPES = new Set<ActionStepType>([
  "finish",
  "stop_automation",
  "finish_conversation",
  "tabulate_conversation",
  "mark_deal_won",
  "mark_deal_lost",
  "goto",
])

const CONDITION_TYPES = new Set<ActionStepType>([
  "condition",
  "round_robin",
  "business_hours",
  "check_agent_status",
])

const KIND_TO_STEP: Record<NodeKind, ActionStepType | undefined> = {
  trigger: undefined,
  template: "send_whatsapp_template",
  interactive: "send_whatsapp_interactive",
  media: "send_whatsapp_media",
  message: "send_whatsapp_message",
  webhook: "webhook",
  distribution: "execute_distribution",
  move_stage: "move_stage",
  finish: "finish",
  condition: "condition",
  action: undefined,
}

export type NodeFamily =
  | "message"
  | "webhook"
  | "condition"
  | "action"
  | "finish"
  | "trigger"
  | "distribution"

export function resolveStepType(data: Pick<FlowNodeData, "stepType" | "kind">): string {
  if (data.stepType) return data.stepType
  return KIND_TO_STEP[data.kind] ?? data.kind
}

export function nodeFamily(type: string): NodeFamily {
  if (type === "trigger") return "trigger"
  if (type === "webhook") return "webhook"
  if (type === "execute_distribution" || type === "distribution") return "distribution"
  if (CONDITION_TYPES.has(type as ActionStepType) || type === "condition") return "condition"
  if (FINISH_TYPES.has(type as ActionStepType) || type === "finish") return "finish"
  if (MESSAGE_TYPES.has(type as ActionStepType) || INTERACTIVE_TYPES.has(type as ActionStepType) || type === "wait_for_reply") {
    return "message"
  }
  return "action"
}

export function familyAccent(family: NodeFamily): { color: string; tint: string } {
  switch (family) {
    case "message":
      return { color: "var(--color-success)", tint: "color-mix(in oklch, var(--color-success) 14%, transparent)" }
    case "webhook":
      return { color: "var(--text-muted)", tint: "color-mix(in oklch, var(--text-muted) 14%, transparent)" }
    case "condition":
      return { color: "var(--color-cyan)", tint: "color-mix(in oklch, var(--color-cyan) 16%, transparent)" }
    case "distribution":
      return { color: "var(--brand-primary)", tint: "color-mix(in oklch, var(--brand-primary) 14%, transparent)" }
    case "finish":
      return { color: "var(--color-destructive)", tint: "color-mix(in oklch, var(--color-destructive) 14%, transparent)" }
    case "trigger":
      return { color: "var(--brand-primary)", tint: "color-mix(in oklch, var(--brand-primary) 14%, transparent)" }
    default:
      return { color: "var(--color-warn)", tint: "color-mix(in oklch, var(--color-warn) 16%, transparent)" }
  }
}

export function isMessageStepType(type: string | undefined): boolean {
  if (!type) return false
  return (
    MESSAGE_TYPES.has(type as ActionStepType) ||
    INTERACTIVE_TYPES.has(type as ActionStepType) ||
    type === "wait_for_reply" ||
    type === "template" ||
    type === "media" ||
    type === "interactive" ||
    type === "message"
  )
}

export function stepTypeToNodeKind(type: ActionStepType): NodeKind {
  if (type === "send_whatsapp_template") return "template"
  if (type === "send_whatsapp_media") return "media"
  if (INTERACTIVE_TYPES.has(type)) return "interactive"
  if (type === "send_whatsapp_message" || type === "send_product" || type === "send_email" || type === "wait_for_reply") {
    return "message"
  }
  if (type === "execute_distribution") return "distribution"
  if (type === "move_stage") return "move_stage"
  if (FINISH_TYPES.has(type)) return "finish"
  if (type === "webhook") return "webhook"
  if (CONDITION_TYPES.has(type)) return "condition"
  return "action"
}

const NO_OUTPUT_TYPES = new Set<string>(["finish", "stop_automation"])
const META_FAILURE_TYPES = new Set<string>([
  "send_whatsapp_message",
  "send_whatsapp_template",
  "send_whatsapp_media",
  "send_whatsapp_interactive",
  "send_whatsapp_list",
  "send_whatsapp_flow",
  "question",
  "send_product",
  "send_email",
])

function choiceKey(type: string): "buttons" | "rows" {
  return type === "send_whatsapp_list" ? "rows" : "buttons"
}

function choiceItems(type: string, cfg: Record<string, unknown>): Record<string, unknown>[] {
  const key = choiceKey(type)
  return Array.isArray(cfg[key]) ? (cfg[key] as Record<string, unknown>[]) : []
}

function isInteractiveType(type: string, cfg: Record<string, unknown>): boolean {
  if (type === "question" || type === "send_whatsapp_interactive" || type === "send_whatsapp_list") return true
  if (type === "send_whatsapp_template") return choiceItems(type, cfg).length > 0
  return false
}

function cfgTarget(v: unknown): string | undefined {
  return typeof v === "string" && v && v !== "__none__" ? v : undefined
}

function mergeTarget(cfgTarget: string | undefined, prev?: string): string | undefined {
  return cfgTarget ?? prev
}

/** Saídas canônicas — mesmos handle ids do canvas antigo. */
export function outputsFromStepConfig(
  type: string,
  cfg: Record<string, unknown> = {},
  prev: Output[] = [],
): Output[] {
  const prevByKey = new Map(prev.map((o) => [o.key, o.target]))
  const t = (key: string, fromCfg?: unknown) => mergeTarget(cfgTarget(fromCfg), prevByKey.get(key))

  if (type === "condition") return outputsFromCondition(cfg)
  if (type === "round_robin") {
    const rr = normalizeRoundRobinConfig(cfg)
    return rr.options.map((o, i) => ({
      key: `option:${o.id}`,
      label: roundRobinOptionLabel(o, i),
      kind: "navigation" as const,
      target: t(`option:${o.id}`, o.nextStepId),
    }))
  }
  if (isInteractiveType(type, cfg)) {
    const items = choiceItems(type, cfg)
    const buttons = items.map((item, i) => ({
      key: `btn_${i}`,
      label: String(item.title ?? item.text ?? `Opção ${i + 1}`),
      kind: "response" as const,
      target: t(`btn_${i}`, item.gotoStepId),
    }))
    const common = [
      { key: "else", label: "Outra resposta", kind: "navigation" as const, target: t("else", cfg.elseGotoStepId) },
      { key: "timeout", label: "Caso o contato não responda", kind: "error" as const, target: t("timeout", cfg.timeoutGotoStepId) },
      { key: "failure", label: "Caso ocorrer erro no envio de mensagem", kind: "error" as const, target: t("failure", cfg.failureGotoStepId) },
    ]
    // Template com botões ainda precisa de "Próximo passo" — o fluxo BV
    // liga o webhook nesse handle; sem ele o nextStepId some no reload.
    if (type === "send_whatsapp_template") {
      return [
        ...buttons,
        { key: "next", label: "Próximo passo", kind: "navigation" as const, target: t("next", cfg.nextStepId) },
        ...common,
      ]
    }
    return [...buttons, ...common]
  }
  if (type === "wait_for_reply") {
    return [
      { key: "received", label: "Quando responder", kind: "response", target: t("received", cfg.receivedGotoStepId) ?? t("next", cfg.receivedGotoStepId) },
      { key: "timeout", label: "Caso o contato não responda", kind: "error", target: t("timeout", cfg.timeoutGotoStepId) },
    ]
  }
  if (type === "webhook") {
    return [
      { key: "next", label: "Próximo passo", kind: "navigation", target: t("next", cfg.nextStepId) },
      { key: "failure", label: "Se o webhook falhar", kind: "error", target: t("failure", cfg.failureGotoStepId) },
    ]
  }
  if (type === "execute_distribution") {
    return [
      { key: "true", label: "Próximo passo", kind: "navigation", target: t("true", cfg.nextStepId) ?? t("next", cfg.nextStepId) },
      { key: "false", label: "Se não houver atendente", kind: "error", target: t("false", cfg.elseStepId) ?? t("other", cfg.elseStepId) },
    ]
  }
  if (type === "check_agent_status") {
    return [
      { key: "true", label: "Disponível", kind: "navigation", target: t("true", cfg.nextStepId) },
      { key: "false", label: "Offline", kind: "error", target: t("false", cfg.elseStepId) },
    ]
  }
  if (type === "business_hours") {
    return [
      { key: "true", label: "Dentro do expediente", kind: "navigation", target: t("true", cfg.nextStepId) },
      { key: "false", label: "Fora do expediente", kind: "error", target: t("false", cfg.elseStepId) },
    ]
  }
  if (NO_OUTPUT_TYPES.has(type)) return []
  if (type === "goto") {
    return [{ key: "next", label: "Ir para", kind: "navigation", target: t("next", cfg.targetStepId) }]
  }
  if (type === "send_whatsapp_media" || type === "send_email" || type === "send_product") {
    const outs: Output[] = [
      { key: "next", label: "Próximo passo", kind: "navigation", target: t("next", cfg.nextStepId) },
    ]
    if (type !== "send_product") {
      outs.push({
        key: "failure",
        label: "Caso ocorrer erro no envio de mensagem",
        kind: "error",
        target: t("failure", cfg.failureGotoStepId),
      })
    }
    return outs
  }
  if (
    type === "send_whatsapp_message" ||
    type === "send_whatsapp_template" ||
    type === "send_whatsapp_flow"
  ) {
    return [
      { key: "next", label: "Próximo passo", kind: "navigation", target: t("next", cfg.nextStepId) },
      { key: "timeout", label: "Caso o contato não responda", kind: "error", target: t("timeout", cfg.timeoutGotoStepId) },
      { key: "failure", label: "Caso ocorrer erro no envio de mensagem", kind: "error", target: t("failure", cfg.failureGotoStepId) },
    ]
  }
  return [{ key: "next", label: "Próximo passo", kind: "navigation", target: t("next", cfg.nextStepId) }]
}

export function defaultOutputsForStepType(type: ActionStepType): Output[] {
  return outputsFromStepConfig(type, defaultStepConfig(type))
}

const LOOKUP_PREVIEW_TYPES = new Set([
  "condition",
  "move_stage",
  "mark_deal_won",
  "mark_deal_lost",
  "assign_owner",
  "transfer_department",
  "add_tag",
  "remove_tag",
  "create_deal",
  "tabulate_conversation",
  "ask_ai_agent",
  "transfer_to_ai_agent",
  "execute_distribution",
  "send_product",
  "transfer_automation",
  "update_field",
])

export function cardPreview(data: FlowNodeData, lookup?: Record<string, string>): string {
  const type = resolveStepType(data)
  if (type === "trigger" || data.kind === "trigger") return data.preview
  if (LOOKUP_PREVIEW_TYPES.has(type)) {
    return summarizeStepConfig(type, data.config ?? {}, lookup)
  }
  if (data.preview.trim()) return data.preview
  return summarizeStepConfig(type, data.config ?? {}, lookup)
}

export function previewPlaceholder(type: string): string {
  const family = nodeFamily(type)
  if (family === "message") return "Sem mensagem"
  if (family === "webhook") return "Informe a URL do webhook"
  if (family === "condition") return "Defina a condição"
  if (family === "finish") return "Encerra o fluxo"
  return "Sem configuração"
}

function configFromStep(type: ActionStepType): NodeConfig {
  const raw = defaultStepConfig(type)
  if (
    (type === "send_whatsapp_interactive" || type === "question") &&
    (!Array.isArray(raw.buttons) || raw.buttons.length === 0)
  ) {
    raw.buttons = [{ id: `btn_${Date.now().toString(36)}`, title: "Botão 1" }]
  }
  if (type === "send_whatsapp_list" && (!Array.isArray(raw.rows) || raw.rows.length === 0)) {
    raw.rows = [{ id: `row_${Date.now().toString(36)}`, title: "Item 1" }]
  }
  return {
    ...raw,
    delayMs: typeof raw.ms === "number" ? raw.ms : undefined,
    delayUnit: "minutes",
    template: typeof raw.templateName === "string" ? raw.templateName : undefined,
    idioma: typeof raw.languageCode === "string" ? raw.languageCode : undefined,
  } as NodeConfig
}

export function outputsFromCondition(cfg: {
  branches?: unknown
  elseStepId?: unknown
}): Output[] {
  const raw = Array.isArray(cfg.branches) ? cfg.branches : []
  const branches = raw.map((b, i) => {
    const rec = b && typeof b === "object" ? (b as Record<string, unknown>) : {}
    const id = typeof rec.id === "string" && rec.id ? rec.id : `branch_${i}`
    const label = typeof rec.label === "string" && rec.label.trim() ? rec.label.trim() : `Se ${i + 1}`
    const target = typeof rec.nextStepId === "string" ? rec.nextStepId : undefined
    return { key: `branch:${id}`, label, kind: "navigation" as const, target }
  })
  if (branches.length === 0) {
    branches.push({ key: "branch:1", label: "Se 1", kind: "navigation", target: undefined })
  }
  return [
    ...branches,
    {
      key: "else",
      label: "Senão",
      kind: "error",
      target: typeof cfg.elseStepId === "string" ? cfg.elseStepId : undefined,
    },
  ]
}

export function applyConditionHandle(
  cfg: NodeConfig,
  handle: string,
  targetId: string,
): NodeConfig {
  if (handle === "else" || handle === "false") return { ...cfg, elseStepId: targetId }
  if (handle.startsWith("branch:")) {
    const id = handle.slice("branch:".length)
    const branches = Array.isArray(cfg.branches) ? [...cfg.branches] : []
    return {
      ...cfg,
      branches: branches.map((b) => {
        const rec = b && typeof b === "object" ? (b as Record<string, unknown>) : {}
        if (rec.id !== id) return b
        return { ...rec, nextStepId: targetId }
      }),
    }
  }
  return cfg
}

export function applyHandleToConfig(
  cfg: NodeConfig,
  handle: string,
  targetId: string,
  stepType?: string,
): NodeConfig {
  const rec = { ...cfg } as Record<string, unknown>
  const type = stepType ?? ""

  const btnMatch = handle.match(/^btn_(\d+)$/)
  if (btnMatch && isInteractiveType(type, rec)) {
    const idx = Number(btnMatch[1])
    const key = choiceKey(type)
    const items = [...choiceItems(type, rec)]
    if (items[idx]) items[idx] = { ...items[idx], gotoStepId: targetId }
    rec[key] = items
    return rec as NodeConfig
  }

  if (handle === "next" && isInteractiveType(type, rec)) {
    const key = choiceKey(type)
    rec[key] = choiceItems(type, rec).map((b) => ({ ...b, gotoStepId: targetId }))
    rec.nextStepId = targetId
    return rec as NodeConfig
  }

  if (handle.startsWith("option:") && type === "round_robin") {
    const id = handle.slice("option:".length)
    const rr = normalizeRoundRobinConfig(rec)
    rec.options = rr.options.map((o) => (o.id === id ? { ...o, nextStepId: targetId } : o))
    return rec as NodeConfig
  }

  if (handle.startsWith("branch:") || (handle === "else" && type === "condition")) {
    return applyConditionHandle(cfg, handle, targetId)
  }

  if (handle === "else") {
    rec.elseGotoStepId = targetId
    return rec as NodeConfig
  }

  if (
    handle === "false" &&
    (type === "business_hours" || type === "execute_distribution" || type === "check_agent_status" || type === "condition")
  ) {
    rec.elseStepId = targetId
    return rec as NodeConfig
  }

  if (handle === "true" && (type === "business_hours" || type === "execute_distribution" || type === "check_agent_status")) {
    rec.nextStepId = targetId
    return rec as NodeConfig
  }

  if (handle === "timeout") {
    rec.timeoutGotoStepId = targetId
    rec.timeoutAction = "goto"
    if (!(Number(rec.timeoutMs) > 0)) rec.timeoutMs = 86_400_000
    return rec as NodeConfig
  }

  if (handle === "received" || (handle === "next" && type === "wait_for_reply")) {
    rec.receivedGotoStepId = targetId
    return rec as NodeConfig
  }

  if (handle === "failure") {
    rec.failureAction = "goto"
    rec.failureGotoStepId = targetId
    return rec as NodeConfig
  }

  if (handle === "next" && type === "goto") {
    rec.targetStepId = targetId
    return rec as NodeConfig
  }

  if (handle === "next") {
    rec.nextStepId = targetId
    return rec as NodeConfig
  }

  return rec as NodeConfig
}

export function clearHandleFromConfig(
  cfg: NodeConfig,
  handle: string,
  stepType?: string,
): NodeConfig {
  const rec = { ...cfg } as Record<string, unknown>
  const type = stepType ?? ""

  const btnMatch = handle.match(/^btn_(\d+)$/)
  if (btnMatch && isInteractiveType(type, rec)) {
    const idx = Number(btnMatch[1])
    const key = choiceKey(type)
    const items = [...choiceItems(type, rec)]
    if (items[idx]) {
      const { gotoStepId: _g, ...rest } = items[idx]
      items[idx] = rest
    }
    rec[key] = items
    return rec as NodeConfig
  }

  if (handle.startsWith("option:") && type === "round_robin") {
    const id = handle.slice("option:".length)
    const rr = normalizeRoundRobinConfig(rec)
    rec.options = rr.options.map((o) => {
      if (o.id !== id) return o
      const { nextStepId: _n, ...rest } = o
      return rest
    })
    return rec as NodeConfig
  }

  if (handle.startsWith("branch:")) {
    const id = handle.slice("branch:".length)
    const branches = Array.isArray(rec.branches) ? [...(rec.branches as Record<string, unknown>[])] : []
    rec.branches = branches.map((b) => {
      const row = b && typeof b === "object" ? b : {}
      if (row.id !== id) return b
      const { nextStepId: _n, ...rest } = row
      return rest
    })
    return rec as NodeConfig
  }

  if (handle === "else" || handle === "false") {
    delete rec.elseStepId
    delete rec.elseGotoStepId
    return rec as NodeConfig
  }

  if (handle === "timeout") {
    delete rec.timeoutGotoStepId
    return rec as NodeConfig
  }

  if (handle === "received" || (handle === "next" && type === "wait_for_reply")) {
    delete rec.receivedGotoStepId
    return rec as NodeConfig
  }

  if (handle === "failure") {
    delete rec.failureGotoStepId
    rec.failureAction = "stop"
    return rec as NodeConfig
  }

  if (handle === "next" && type === "goto") {
    delete rec.targetStepId
    return rec as NodeConfig
  }

  if (handle === "next" || handle === "true") {
    delete rec.nextStepId
    return rec as NodeConfig
  }

  return rec as NodeConfig
}

export function stripDeletedStepTargets(
  cfg: NodeConfig,
  deleted: Set<string>,
  stepType?: string,
): NodeConfig {
  const rec = { ...cfg } as Record<string, unknown>
  let changed = false
  const drop = (key: string) => {
    if (typeof rec[key] === "string" && deleted.has(rec[key] as string)) {
      delete rec[key]
      changed = true
    }
  }
  if (typeof rec.nextStepId === "string" && deleted.has(rec.nextStepId)) {
    delete rec.nextStepId
    changed = true
  }
  drop("targetStepId")
  drop("elseGotoStepId")
  drop("elseStepId")
  drop("timeoutGotoStepId")
  drop("receivedGotoStepId")
  if (typeof rec.failureGotoStepId === "string" && deleted.has(rec.failureGotoStepId)) {
    delete rec.failureGotoStepId
    rec.failureAction = "stop"
    changed = true
  }

  const type = stepType ?? ""
  if (isInteractiveType(type, rec)) {
    const key = choiceKey(type)
    rec[key] = choiceItems(type, rec).map((item) => {
      if (typeof item.gotoStepId === "string" && deleted.has(item.gotoStepId)) {
        const { gotoStepId: _g, ...rest } = item
        changed = true
        return rest
      }
      return item
    })
  }
  if (type === "round_robin" && Array.isArray(rec.options)) {
    rec.options = (rec.options as Record<string, unknown>[]).map((o) => {
      if (typeof o.nextStepId === "string" && deleted.has(o.nextStepId)) {
        const { nextStepId: _n, ...rest } = o
        changed = true
        return rest
      }
      return o
    })
  }
  if (type === "condition" && Array.isArray(rec.branches)) {
    rec.branches = (rec.branches as Record<string, unknown>[]).map((b) => {
      if (typeof b.nextStepId === "string" && deleted.has(b.nextStepId)) {
        const { nextStepId: _n, ...rest } = b
        changed = true
        return rest
      }
      return b
    })
  }

  return changed ? (rec as NodeConfig) : cfg
}

export function addInteractiveChoice(type: string, cfg: NodeConfig): NodeConfig {
  const key = choiceKey(type)
  const items = [...choiceItems(type, cfg as Record<string, unknown>)]
  if (items.length >= 10) return cfg
  const n = items.length + 1
  items.push(
    type === "send_whatsapp_list"
      ? { id: `row_${Date.now().toString(36)}`, title: `Item ${n}` }
      : { id: `btn_${Date.now().toString(36)}`, title: `Botão ${n}` },
  )
  const next = { ...cfg, [key]: items } as NodeConfig
  if (type === "send_whatsapp_interactive" && items.length === 4 && !String(cfg.button ?? "").trim()) {
    next.button = "Ver opções"
  }
  return next
}

export function removeInteractiveChoice(type: string, cfg: NodeConfig, handle: string): NodeConfig {
  const m = handle.match(/^btn_(\d+)$/)
  if (!m) return cfg
  const idx = Number(m[1])
  const key = choiceKey(type)
  const items = [...choiceItems(type, cfg as Record<string, unknown>)]
  items.splice(idx, 1)
  return { ...cfg, [key]: items } as NodeConfig
}

export function renameInteractiveChoice(type: string, cfg: NodeConfig, handle: string, label: string): NodeConfig {
  const m = handle.match(/^btn_(\d+)$/)
  if (!m) return cfg
  const idx = Number(m[1])
  const key = choiceKey(type)
  const items = [...choiceItems(type, cfg as Record<string, unknown>)]
  if (!items[idx]) return cfg
  items[idx] = { ...items[idx], title: label, text: label }
  return { ...cfg, [key]: items } as NodeConfig
}

function needsConditionMigration(data: FlowNodeData): boolean {
  if (resolveStepType(data) !== "condition") return false
  const outs = data.outputs ?? []
  const hasLegacy = outs.some((o) => o.key === "true" || o.key === "false")
  const hasBranch = outs.some((o) => o.key.startsWith("branch:"))
  const hasElse = outs.some((o) => o.key === "else")
  const cfg = data.config ?? {}
  const hasBranches = Array.isArray(cfg.branches) && cfg.branches.length > 0
  return hasLegacy || !hasBranch || !hasElse || !hasBranches
}

export function migrateConditionNode(data: FlowNodeData): FlowNodeData {
  if (!needsConditionMigration(data)) return data
  const cfg = data.config ?? {}
  const trueTarget = data.outputs.find((o) => o.key === "true")?.target
  const falseTarget = data.outputs.find((o) => o.key === "false" || o.key === "else")?.target
  const branches = hydrateConditionBranches(cfg).map((b, i) => ({
    ...b,
    nextStepId: b.nextStepId ?? (i === 0 ? trueTarget : undefined),
  }))
  const nextCfg: NodeConfig = {
    ...cfg,
    branches,
    elseStepId:
      typeof cfg.elseStepId === "string" && cfg.elseStepId
        ? cfg.elseStepId
        : falseTarget,
    field: undefined,
    op: undefined,
    value: undefined,
  }
  return {
    ...data,
    config: nextCfg,
    outputs: outputsFromCondition(nextCfg),
  }
}

export function remapConditionEdges<E extends { source: string; sourceHandle?: string | null }>(
  edges: E[],
  nodes: { id: string; data: FlowNodeData }[],
): E[] {
  return remapFlowEdges(edges, nodes)
}

export function migrateFlowNode(data: FlowNodeData): FlowNodeData {
  const type = resolveStepType(data)
  if (type === "condition") return migrateConditionNode(data)
  const cfg = data.config ?? {}
  return { ...data, outputs: outputsFromStepConfig(type, cfg as Record<string, unknown>, data.outputs) }
}

export function remapFlowEdges<E extends { source: string; sourceHandle?: string | null }>(
  edges: E[],
  nodes: { id: string; data: FlowNodeData }[],
): E[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges.map((e) => {
    const n = byId.get(e.source)
    if (!n) return e
    const type = resolveStepType(n.data)
    const h = e.sourceHandle ?? ""
    if (type === "condition") {
      if (h === "true") {
        const first = n.data.outputs.find((o) => o.key.startsWith("branch:"))
        return first ? { ...e, sourceHandle: first.key } : e
      }
      if (h === "false") return { ...e, sourceHandle: "else" }
    }
    if (type === "wait_for_reply" && h === "next") return { ...e, sourceHandle: "received" }
    if (h === "other") return { ...e, sourceHandle: "else" }
    if (type === "execute_distribution") {
      if (h === "next") return { ...e, sourceHandle: "true" }
      if (h === "other") return { ...e, sourceHandle: "false" }
    }
    if (type === "round_robin" && /^opt-\d+$/.test(h)) {
      const idx = Number(h.slice(4)) - 1
      const key = n.data.outputs[idx]?.key
      return key ? { ...e, sourceHandle: key } : e
    }
    const dashed = h.match(/^btn-(\d+)$/)
    if (dashed && Number(dashed[1]) < 20) return { ...e, sourceHandle: `btn_${dashed[1]}` }
    return e
  })
}

const FLOW_WA_CHANNEL_KEY = "crm1.fluxo.default-wa-channel"

export function firstMessageChannel(
  nodes: { id: string; data: Pick<FlowNodeData, "ref" | "stepType" | "kind" | "config"> }[],
): { firstId: string | undefined; channelId: string } {
  const msgs = nodes
    .filter((n) => isMessageChannelStep(resolveStepType(n.data)))
    .sort((a, b) => a.data.ref - b.data.ref)
  const first = msgs[0]
  const raw = first?.data.config?.channelId
  const channelId = typeof raw === "string" && raw.trim() ? raw.trim() : readFlowDefaultChannel()
  return { firstId: first?.id, channelId }
}

export function readFlowDefaultChannel(): string {
  try {
    return window.localStorage.getItem(FLOW_WA_CHANNEL_KEY)?.trim() ?? ""
  } catch {
    return ""
  }
}

/** Grava só a primeira escolha — cards novos herdam, cada card continua editável. */
export function rememberFlowDefaultChannel(channelId: string) {
  const id = channelId.trim()
  if (!id || readFlowDefaultChannel()) return
  try {
    window.localStorage.setItem(FLOW_WA_CHANNEL_KEY, id)
  } catch {
    /* ignore quota / private mode */
  }
}

export function blankFlowNodeFromStep(
  type: ActionStepType,
  ref: number,
  extras?: { channelId?: string },
): FlowNodeData {
  const config = configFromStep(type)
  if (extras?.channelId && isMessageChannelStep(type)) {
    config.channelId = extras.channelId
  }
  return blankFlowNodeData(stepTypeToNodeKind(type), ref, {
    title: stepTypeLabel(type),
    stepType: type,
    outputs: outputsFromStepConfig(type, config as Record<string, unknown>),
    config,
    preview: "",
  })
}

/** Garante que todo o catálogo tem saídas definidas. */
export function assertStepOutputCatalog(): string[] {
  return ACTION_STEP_TYPES.filter((t) => defaultOutputsForStepType(t) === undefined)
}
