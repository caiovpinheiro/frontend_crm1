/**
 * Adaptador API/export JSON → canvas do editor DS v2 (React Flow).
 * Reutiliza a mesma lógica de arestas do workflow-canvas legado.
 */
import type { Edge, Node } from "@xyflow/react"
import { normalizeConditionConfig } from "@/lib/automation-condition"
import {
  apiStepsToWorkflow,
  summarizeStepConfig,
  stepTypeLabel,
  triggerTypeLabel,
  type AutomationStep,
} from "@/lib/automation-workflow"
import type { FlowNodeData } from "./nodes"
import { resolveFlowPresentation } from "./node-presentation"

const TRIGGER_ID = "trigger"
const NONE = "__none__"

type Chip = FlowNodeData["accent"]

const STEP_CHIP: Record<string, Chip> = {
  send_whatsapp_message: "green",
  send_whatsapp_template: "green",
  send_whatsapp_media: "green",
  send_whatsapp_interactive: "violet",
  send_email: "blue",
  question: "violet",
  wait_for_reply: "amber",
  set_variable: "blue",
  goto: "blue",
  transfer_automation: "violet",
  move_stage: "blue",
  assign_owner: "blue",
  add_tag: "green",
  remove_tag: "red",
  update_field: "blue",
  create_activity: "violet",
  update_lead_score: "green",
  create_deal: "green",
  finish_conversation: "green",
  tabulate_conversation: "green",
  consume_stock: "amber",
  execute_distribution: "blue",
  delay: "amber",
  condition: "amber",
  business_hours: "amber",
  check_agent_status: "amber",
  webhook: "blue",
  transfer_to_ai_agent: "violet",
  ask_ai_agent: "violet",
  stop_automation: "red",
  finish: "red",
}

function chipOf(type: string): Chip {
  return STEP_CHIP[type] ?? "blue"
}

function readRfPos(config: unknown): { x: number; y: number } | null {
  if (typeof config !== "object" || config === null) return null
  const p = (config as Record<string, unknown>).__rfPos
  if (typeof p !== "object" || p === null) return null
  const o = p as Record<string, unknown>
  if (typeof o.x !== "number" || typeof o.y !== "number") return null
  return { x: o.x, y: o.y }
}

function readNextStepId(config: unknown): string | null {
  if (typeof config !== "object" || config === null) return null
  const c = config as Record<string, unknown>
  return typeof c.nextStepId === "string" ? c.nextStepId : null
}

function isInteractiveStep(step: { type: string; config?: Record<string, unknown> }): boolean {
  if (
    step.type === "question" ||
    step.type === "send_whatsapp_interactive" ||
    step.type === "send_whatsapp_list"
  ) {
    return true
  }
  // Template só é interativo com botões de resposta rápida (espelha workflow-canvas).
  if (step.type === "send_whatsapp_template") {
    return Array.isArray(step.config?.buttons) && (step.config!.buttons as unknown[]).length > 0
  }
  return false
}

function interactiveChoiceItems(
  stepType: string,
  cfg: Record<string, unknown>,
): { gotoStepId?: string }[] {
  if (stepType === "send_whatsapp_list") {
    return Array.isArray(cfg.rows) ? (cfg.rows as { gotoStepId?: string }[]) : []
  }
  return Array.isArray(cfg.buttons) ? (cfg.buttons as { gotoStepId?: string }[]) : []
}

const META_SEND_FAILURE_TYPES = new Set([
  "send_whatsapp_message",
  "send_whatsapp_template",
  "send_whatsapp_media",
  "send_whatsapp_interactive",
  "send_whatsapp_list",
  "send_whatsapp_flow",
  "question",
])

function readFailureGotoStepId(cfg: Record<string, unknown>): string | null {
  if (cfg.failureAction !== "goto") return null
  const id = cfg.failureGotoStepId
  if (typeof id !== "string" || !id || id === NONE) return null
  return id
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  err?: boolean,
): Edge {
  return { id, source, target, sourceHandle, type: "deletable", data: { err } }
}

function buildEdges(steps: AutomationStep[]): Edge[] {
  const out: Edge[] = []
  if (steps.length === 0) return out

  const stepIds = new Set(steps.map((s) => s.id))
  out.push(edge(`trigger-${steps[0].id}`, TRIGGER_ID, steps[0].id))

  for (const a of steps) {
    const cfg = a.config

    if (isInteractiveStep(a)) {
      const buttons = interactiveChoiceItems(a.type, cfg)
      buttons.forEach((btn, idx) => {
        const gotoId = btn.gotoStepId && btn.gotoStepId !== NONE ? btn.gotoStepId : undefined
        if (!gotoId || !stepIds.has(gotoId)) return
        out.push(edge(`${a.id}-btn_${idx}-${gotoId}`, a.id, gotoId, `btn_${idx}`))
      })
      const elseId = typeof cfg.elseGotoStepId === "string" ? cfg.elseGotoStepId : ""
      if (elseId && stepIds.has(elseId)) {
        out.push(edge(`${a.id}-else-${elseId}`, a.id, elseId, "else", true))
      }
      const timeoutId = typeof cfg.timeoutGotoStepId === "string" ? cfg.timeoutGotoStepId : ""
      if (timeoutId && stepIds.has(timeoutId)) {
        out.push(edge(`${a.id}-timeout-${timeoutId}`, a.id, timeoutId, "timeout", true))
      }
    }

    if (a.type === "condition") {
      const condCfg = normalizeConditionConfig(cfg)
      condCfg.branches.forEach((branch) => {
        if (branch.nextStepId && stepIds.has(branch.nextStepId)) {
          out.push(edge(`${a.id}-branch:${branch.id}-${branch.nextStepId}`, a.id, branch.nextStepId, `branch:${branch.id}`))
        }
      })
      if (condCfg.elseStepId && stepIds.has(condCfg.elseStepId)) {
        out.push(edge(`${a.id}-else-${condCfg.elseStepId}`, a.id, condCfg.elseStepId, "else", true))
      }
      continue
    }

    if (a.type === "wait_for_reply") {
      const recv = typeof cfg.receivedGotoStepId === "string" ? cfg.receivedGotoStepId : ""
      if (recv && stepIds.has(recv)) {
        out.push(edge(`${a.id}-received-${recv}`, a.id, recv, "received"))
      }
      const timeoutId = typeof cfg.timeoutGotoStepId === "string" ? cfg.timeoutGotoStepId : ""
      if (timeoutId && stepIds.has(timeoutId)) {
        out.push(edge(`${a.id}-timeout-${timeoutId}`, a.id, timeoutId, "timeout", true))
      }
      // Sem continue — espelha workflow-canvas: nextStepId linear também vira aresta.
    }

    // Mensagem / template linear (sem botões): aresta Sem resposta.
    if (
      !isInteractiveStep(a) &&
      (a.type === "send_whatsapp_message" || a.type === "send_whatsapp_template" || a.type === "send_whatsapp_flow")
    ) {
      const timeoutId = typeof cfg.timeoutGotoStepId === "string" ? cfg.timeoutGotoStepId : ""
      if (timeoutId && stepIds.has(timeoutId)) {
        out.push(edge(`${a.id}-timeout-${timeoutId}`, a.id, timeoutId, "timeout", true))
      }
    }

    if (a.type === "business_hours" || a.type === "execute_distribution" || a.type === "check_agent_status") {
      const elseId = typeof cfg.elseStepId === "string" ? cfg.elseStepId : ""
      if (elseId && stepIds.has(elseId)) {
        out.push(edge(`${a.id}-else-${elseId}`, a.id, elseId, "false", true))
      }
    }

    if (META_SEND_FAILURE_TYPES.has(a.type)) {
      const failureGoto = readFailureGotoStepId(cfg)
      if (failureGoto && stepIds.has(failureGoto)) {
        out.push(edge(`${a.id}-failure-${failureGoto}`, a.id, failureGoto, "failure", true))
      }
    }

    const explicit = readNextStepId(cfg)
    if (explicit === NONE || !explicit) continue
    if (stepIds.has(explicit)) {
      const isMetaLinear =
        META_SEND_FAILURE_TYPES.has(a.type) && !isInteractiveStep(a)
      out.push(
        edge(
          `${a.id}-next-${explicit}`,
          a.id,
          explicit,
          isMetaLinear ? "next" : undefined,
        ),
      )
    }
  }

  return out
}

function summarizeTrigger(triggerType: string, triggerConfig: Record<string, unknown>): string {
  const parts: string[] = []
  if (triggerType === "whatsapp_session_expiring") {
    return `${String(triggerConfig.hoursBeforeExpiry ?? 1)}h antes do encerramento`
  }
  if (triggerConfig.pipelineId) parts.push(`Pipeline: ${String(triggerConfig.pipelineId).slice(0, 12)}…`)
  if (triggerConfig.fromStageId) parts.push(`De: ${String(triggerConfig.stageName ?? triggerConfig.fromStageId).slice(0, 24)}`)
  if (triggerConfig.toStageId) parts.push(`Para: ${String(triggerConfig.stageName ?? triggerConfig.toStageId).slice(0, 24)}`)
  if (triggerConfig.tagName) parts.push(`Tag: ${String(triggerConfig.tagName)}`)
  return parts.length ? parts.join(" · ") : triggerTypeLabel(triggerType)
}

function stepTitle(step: AutomationStep): string {
  const c = step.config
  if (step.type === "move_stage" && c.stageName) return String(c.stageName)
  if (step.type === "add_tag" && c.tagName) return String(c.tagName)
  if (step.type === "remove_tag" && c.tagName) return String(c.tagName)
  return summarizeStepConfig(step.type, c)
}

export type FlowDiagnostic = {
  level: "error" | "warn" | "info"
  stepId?: string
  message: string
}

export type FlowAnalysis = {
  name: string
  automationId: string
  stepCount: number
  edgeCount: number
  reachableFromEntry: number
  unreachableStepIds: string[]
  diagnostics: FlowDiagnostic[]
  /** Arestas no config sem handle correspondente no nó (risco visual) */
  danglingConfigRefs: number
}

function collectTargets(cfg: Record<string, unknown>): string[] {
  const t: string[] = []
  const add = (id: unknown) => {
    if (typeof id === "string" && id && id !== NONE) t.push(id)
  }
  add(cfg.nextStepId)
  add(cfg.elseGotoStepId)
  add(cfg.timeoutGotoStepId)
  add(cfg.receivedGotoStepId)
  add(cfg.elseStepId)
  if (cfg.failureAction === "goto") add(cfg.failureGotoStepId)
  if (Array.isArray(cfg.buttons)) {
    for (const b of cfg.buttons as { gotoStepId?: string }[]) add(b.gotoStepId)
  }
  // Lista WhatsApp (`send_whatsapp_list`) persiste destinos em `rows`.
  if (Array.isArray(cfg.rows)) {
    for (const r of cfg.rows as { gotoStepId?: string }[]) add(r.gotoStepId)
  }
  if (Array.isArray(cfg.branches)) {
    for (const b of cfg.branches as { nextStepId?: string }[]) add(b.nextStepId)
  }
  return t
}

function reachableFromEntry(steps: AutomationStep[], via: "config" | "edges", edges?: Edge[]): Set<string> {
  const ids = new Set(steps.map((s) => s.id))
  const entry = steps[0]?.id
  const reachable = new Set<string>()
  if (!entry) return reachable

  const byId = new Map(steps.map((s) => [s.id, s]))
  const q = [entry]

  if (via === "config") {
    while (q.length) {
      const id = q.shift()!
      if (reachable.has(id)) continue
      reachable.add(id)
      for (const t of collectTargets(byId.get(id)!.config)) {
        if (ids.has(t) && !reachable.has(t)) q.push(t)
      }
    }
    return reachable
  }

  const edgeBySource = new Map<string, Edge[]>()
  for (const e of edges ?? []) {
    if (e.source === TRIGGER_ID) continue
    const list = edgeBySource.get(e.source) ?? []
    list.push(e)
    edgeBySource.set(e.source, list)
  }
  while (q.length) {
    const id = q.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const e of edgeBySource.get(id) ?? []) {
      if (!reachable.has(e.target)) q.push(e.target)
    }
  }
  return reachable
}

function analyzeFlow(name: string, automationId: string, steps: AutomationStep[], edges: Edge[]): FlowAnalysis {
  const ids = new Set(steps.map((s) => s.id))
  const diagnostics: FlowDiagnostic[] = []
  const configReach = reachableFromEntry(steps, "config")
  const visualReach = reachableFromEntry(steps, "edges", edges)

  const deadInProduction = [...ids].filter((id) => !configReach.has(id))
  for (const id of deadInProduction) {
    const step = steps.find((s) => s.id === id)!
    diagnostics.push({
      level: "warn",
      stepId: id,
      message: `Rascunho morto — fora do fluxo ativo (${stepTypeLabel(step.type)}). Não executa em produção.`,
    })
  }

  // Aresta faltando no canvas mas referência válida no config
  for (const id of configReach) {
    if (!visualReach.has(id)) {
      diagnostics.push({
        level: "error",
        stepId: id,
        message: "Referenciado no config mas sem aresta no canvas — bug de plotagem.",
      })
    }
  }

  let danglingConfigRefs = 0
  for (const step of steps) {
    for (const ref of collectTargets(step.config)) {
      if (!ids.has(ref)) {
        danglingConfigRefs++
        diagnostics.push({
          level: "error",
          stepId: step.id,
          message: `Referência quebrada no config → ${ref.slice(0, 8)}…`,
        })
      }
    }

    const active = configReach.has(step.id)

    if (active && step.type === "wait_for_reply" && !step.config.receivedGotoStepId) {
      const hasTimeout = !!step.config.timeoutGotoStepId
      const hasLinear = readNextStepId(step.config) && readNextStepId(step.config) !== NONE
      if (!hasTimeout && !hasLinear) {
        diagnostics.push({
          level: "warn",
          stepId: step.id,
          message: "wait_for_reply ativo sem receivedGotoStepId — runtime cai no próximo passo da lista.",
        })
      }
    }

    if (active && step.type === "condition") {
      const cond = normalizeConditionConfig(step.config)
      for (const b of cond.branches) {
        if (!b.nextStepId) {
          diagnostics.push({
            level: "warn",
            stepId: step.id,
            message: `Branch ${b.id} sem destino — ramo inoperante.`,
          })
        }
      }
    }

    if (active && step.type === "question") {
      const btns = Array.isArray(step.config.buttons) ? step.config.buttons : []
      const fallbackCount = btns.filter(
        (b) => !(b as { gotoStepId?: string }).gotoStepId && step.config.nextStepId && step.config.nextStepId !== NONE,
      ).length
      if (fallbackCount > 0) {
        diagnostics.push({
          level: "info",
          stepId: step.id,
          message:
            fallbackCount === 1
              ? "1 botão usa fallback linear (nextStepId) — comportamento de produção."
              : `${fallbackCount} botões usam fallback linear (nextStepId) — comportamento de produção.`,
        })
      }
    }
  }

  return {
    name,
    automationId,
    stepCount: steps.length,
    edgeCount: edges.length,
    reachableFromEntry: configReach.size,
    unreachableStepIds: deadInProduction,
    diagnostics,
    danglingConfigRefs,
  }
}

export type AutomationExport = {
  id: string
  name: string
  triggerType: string
  triggerConfig: Record<string, unknown>
  active?: boolean
  steps: { id: string; type: string; config: unknown }[]
}

export function automationExportToCanvas(exportData: AutomationExport): {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
  analysis: FlowAnalysis
} {
  const steps = apiStepsToWorkflow(exportData.steps)
  const triggerCfg = exportData.triggerConfig ?? {}
  const triggerPos = readRfPos(triggerCfg) ?? { x: -400, y: 0 }

  const triggerNode: Node<FlowNodeData> = {
    id: TRIGGER_ID,
    type: "flow",
    position: triggerPos,
    data: {
      kind: "Gatilho",
      title: triggerTypeLabel(exportData.triggerType),
      accent: "violet",
      subtitle: summarizeTrigger(exportData.triggerType, triggerCfg),
      source: true,
    },
  }

  const stepNodes: Node<FlowNodeData>[] = steps.map((step, index) => {
    const config = step.config
    const pos = readRfPos(config) ?? { x: 80 + (index % 4) * 280, y: 80 + Math.floor(index / 4) * 160 }
    const kind = stepTypeLabel(step.type)
    const base: FlowNodeData = {
      kind,
      title: stepTitle(step),
      accent: chipOf(step.type),
      stepType: step.type,
      config,
      badge: String(index + 1),
      target: true,
      source: step.type !== "finish" && step.type !== "stop_automation",
    }
    const derived = resolveFlowPresentation(step.type, config, base)
    return {
      id: step.id,
      type: "flow",
      position: pos,
      data: { ...base, ...derived },
    }
  })

  const edges = buildEdges(steps)
  const analysis = analyzeFlow(exportData.name, exportData.id, steps, edges)

  return { nodes: [triggerNode, ...stepNodes], edges, analysis }
}
