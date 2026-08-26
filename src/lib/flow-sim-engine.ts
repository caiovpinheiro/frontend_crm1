import type { Edge, Node } from "@xyflow/react"

import { stepTypeLabel, summarizeStepConfig } from "@/lib/automation-workflow"
import type { FlowNodeData, NodeConfig, Output } from "@/lib/flow-data"
import { resolveStepType } from "@/lib/flow-step-adapter"

import { TRIGGER_NODE_ID, STOP_SENTINEL } from "./flow-automation-adapter"

const PREVIEWABLE = new Set([
  "send_whatsapp_message",
  "send_whatsapp_template",
  "send_whatsapp_interactive",
  "send_whatsapp_list",
  "send_whatsapp_flow",
  "send_whatsapp_media",
  "send_product",
  "question",
])

const BRANCH_TYPES = new Set([
  "condition",
  "round_robin",
  "business_hours",
  "check_agent_status",
  "execute_distribution",
])

const END_TYPES = new Set([
  "finish",
  "stop_automation",
  "finish_conversation",
  "tabulate_conversation",
  "transfer_automation",
])

export type SimWait = "choice" | "reply" | "branch" | "done"

export type SimEvent =
  | {
      id: string
      kind: "bot"
      nodeId: string
      stepType: string
      config: NodeConfig
      outputs: Output[]
      preview: string
      time: string
    }
  | { id: string; kind: "user"; text: string; time: string }
  | { id: string; kind: "system"; text: string }

export type SimState = {
  events: SimEvent[]
  wait: SimWait
  currentId: string | null
  title: string
}

function timeNow() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function eid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function resolveSimTarget(
  node: Node<FlowNodeData>,
  handle: string,
  edges: Edge[],
): string | undefined {
  const out = node.data.outputs.find((o) => o.key === handle)
  if (out?.target && out.target !== STOP_SENTINEL) return out.target
  const edge = edges.find(
    (e) =>
      e.source === node.id &&
      (e.sourceHandle === handle || (!e.sourceHandle && handle === "next")),
  )
  return edge?.target
}

function delayLabel(cfg: NodeConfig): string {
  const ms = Number(cfg.delayMs ?? cfg.ms ?? 0)
  if (!Number.isFinite(ms) || ms <= 0) return "um instante"
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`
  return `${Math.round(ms / 86_400_000)} dia(s)`
}

function hasReplyChoices(stepType: string, outputs: Output[]): boolean {
  if (stepType === "send_whatsapp_flow") return true
  if (
    stepType === "send_whatsapp_interactive" ||
    stepType === "send_whatsapp_list" ||
    stepType === "question" ||
    stepType === "send_whatsapp_template"
  ) {
    return outputs.some((o) => o.kind === "response")
  }
  return false
}

export function emptySimState(): SimState {
  return { events: [], wait: "done", currentId: null, title: "Simulação" }
}

export function startFlowSimulation(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
): SimState {
  const trigger = nodes.find((n) => n.id === TRIGGER_NODE_ID)
  const first = trigger ? resolveSimTarget(trigger, "next", edges) : nodes.find((n) => n.id !== TRIGGER_NODE_ID)?.id
  const events: SimEvent[] = []
  const triggerType = typeof trigger?.data.triggerType === "string" ? trigger.data.triggerType : ""
  if (triggerType === "message_received" || triggerType === "conversation_created") {
    events.push({ id: eid("sys"), kind: "system", text: "Cliente iniciou a conversa" })
  }
  return walkSimulation(first, nodes, edges, events)
}

export function continueFlowSimulation(
  fromId: string | undefined,
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  events: SimEvent[],
): SimState {
  return walkSimulation(fromId, nodes, edges, events)
}

function walkSimulation(
  startId: string | undefined,
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  seed: SimEvent[],
): SimState {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const visits = new Map<string, number>()
  const events = [...seed]
  let id = startId

  for (let hops = 0; hops < 80 && id; hops++) {
    const seen = (visits.get(id) ?? 0) + 1
    visits.set(id, seen)
    if (seen > 6) {
      events.push({ id: eid("sys"), kind: "system", text: "Simulação parou — loop no fluxo" })
      return { events, wait: "done", currentId: id, title: "Loop" }
    }

    const node = byId.get(id)
    if (!node) {
      events.push({ id: eid("sys"), kind: "system", text: "Próximo passo não encontrado" })
      return { events, wait: "done", currentId: null, title: "Fim" }
    }

    const stepType = resolveStepType(node.data)
    const cfg = (node.data.config ?? {}) as NodeConfig
    const outputs = node.data.outputs ?? []
    const title = node.data.title || stepTypeLabel(stepType)

    if (stepType === "trigger") {
      id = resolveSimTarget(node, "next", edges)
      continue
    }

    if (stepType === "goto") {
      id = resolveSimTarget(node, "next", edges) || (typeof cfg.targetStepId === "string" ? cfg.targetStepId : undefined)
      continue
    }

    if (END_TYPES.has(stepType)) {
      events.push({
        id: eid("sys"),
        kind: "system",
        text: stepType === "transfer_automation"
          ? `Transferiu para ${cfg.targetAutomationName || "outra automação"}`
          : "Fluxo encerrado",
      })
      return { events, wait: "done", currentId: id, title }
    }

    if (PREVIEWABLE.has(stepType)) {
      events.push({
        id: eid("bot"),
        kind: "bot",
        nodeId: node.id,
        stepType,
        config: cfg,
        outputs,
        preview: node.data.preview || "",
        time: timeNow(),
      })
      if (hasReplyChoices(stepType, outputs)) {
        return { events, wait: "choice", currentId: id, title }
      }
      if (stepType === "question") {
        return { events, wait: "reply", currentId: id, title }
      }
      id = resolveSimTarget(node, "next", edges)
      continue
    }

    if (stepType === "wait_for_reply") {
      events.push({ id: eid("sys"), kind: "system", text: "Aguardando resposta do cliente" })
      return { events, wait: "reply", currentId: id, title }
    }

    if (BRANCH_TYPES.has(stepType)) {
      events.push({
        id: eid("sys"),
        kind: "system",
        text: summarizeStepConfig(stepType, cfg) || title,
      })
      return { events, wait: "branch", currentId: id, title }
    }

    if (stepType === "delay") {
      events.push({ id: eid("sys"), kind: "system", text: `Aguardou ${delayLabel(cfg)}` })
      id = resolveSimTarget(node, "next", edges)
      continue
    }

    events.push({
      id: eid("sys"),
      kind: "system",
      text: `${title}${summarizeStepConfig(stepType, cfg) ? ` · ${summarizeStepConfig(stepType, cfg)}` : ""}`,
    })
    id =
      resolveSimTarget(node, "next", edges) ||
      outputs.find((o) => o.kind === "navigation" && o.target && o.target !== STOP_SENTINEL)?.target
  }

  events.push({ id: eid("sys"), kind: "system", text: "Fim do fluxo" })
  return { events, wait: "done", currentId: id ?? null, title: "Fim" }
}

export function choiceHandle(choiceId: string, index: number, outputs: Output[]): string {
  if (outputs.some((o) => o.key === choiceId)) return choiceId
  const key = `btn_${index}`
  if (outputs.some((o) => o.key === key)) return key
  const responses = outputs.filter((o) => o.kind === "response")
  return responses[index]?.key ?? responses[0]?.key ?? "next"
}
