/**
 * Ponte entre a automação persistida (`{ id, name, triggerType, triggerConfig,
 * steps[] }`) e o grafo do canvas React Flow (`src/components/flow`).
 *
 * Regras de compatibilidade com o editor legado (`features/legacy-v1` +
 * `components/automations/workflow-canvas`), que continua lendo os MESMOS
 * registros:
 *  - o formato persistido não muda: `steps[i].config` é devolvido verbatim,
 *    com as mesmas chaves e a mesma semântica;
 *  - `__rfPos` guarda a posição do nó e `__hasExplicitEdges` sinaliza que os
 *    destinos são explícitos (em vez do fallback linear pela ordem do array);
 *  - `"__none__"` em `nextStepId` é sentinela de "fim de ramo", não um id.
 *
 * A derivação de saídas/handles reaproveita `flow-step-adapter.ts`, que já é a
 * lógica canônica do canvas — aqui só orquestramos carga e persistência.
 */
import type { Edge, Node } from "@xyflow/react"

import {
  blankFlowNodeData,
  nodeHeight,
  type FlowNodeData,
  type NodeConfig,
  type RouteType,
} from "./flow-data"
import {
  outputsFromStepConfig,
  resolveStepType,
  stepTypeToNodeKind,
} from "./flow-step-adapter"
import {
  stepTypeLabel,
  summarizeTriggerConfig,
  triggerTypeLabel,
  type ActionStepType,
} from "./automation-workflow"
import { clearGhostRootNext } from "./automation-ghost-next"
import { layoutFlow, NODE_WIDTH, type LayoutDirection } from "./layout"

export const TRIGGER_NODE_ID = "trigger"
export const STOP_SENTINEL = "__none__"

export type RawAutomationStep = {
  id: string
  type: string
  config: unknown
}

export type AutomationFlowSource = {
  id: string
  name: string
  triggerType: string
  triggerConfig: unknown
  steps: RawAutomationStep[]
}

export type AutomationFlowGraph = {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
  /** Ids de steps que chegaram sem `__rfPos` — recebem posição do Dagre. */
  unpositionedIds: string[]
}

type Rec = Record<string, unknown>

function asRecord(value: unknown): Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Rec)
    : {}
}

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

export function readRfPos(config: unknown): { x: number; y: number } | null {
  const pos = asRecord(asRecord(config).__rfPos)
  const x = finite(pos.x)
  const y = finite(pos.y)
  if (x === null || y === null) return null
  return { x, y }
}

function edgeId(source: string, handle: string, target: string): string {
  return `${source}::${handle}->${target}`
}

function buildEdge(source: string, handle: string, target: string, kind: RouteType): Edge {
  return {
    id: edgeId(source, handle, target),
    source,
    sourceHandle: handle,
    target,
    type: "deletable",
    data: { routeType: kind },
  }
}

// ─────────────────────────────────────────────────────────────────
// steps[] → grafo
// ─────────────────────────────────────────────────────────────────

/**
 * Converte a automação em nós/arestas. O `config` de cada step é preservado
 * INTEGRALMENTE em `node.data.config` — é ele que volta no save, então nenhuma
 * chave desconhecida pelo canvas se perde no caminho.
 */
export function automationToFlowGraph(source: AutomationFlowSource): AutomationFlowGraph {
  const steps = Array.isArray(source.steps) ? source.steps : []
  const stepIds = new Set(steps.map((s) => s.id))
  const unpositionedIds: string[] = []

  const stepNodes: Node<FlowNodeData>[] = steps.map((step, index) => {
    const config = asRecord(step.config)
    const kind = stepTypeToNodeKind(step.type as ActionStepType)
    const data = blankFlowNodeData(kind, index + 2, {
      title: stepTypeLabel(step.type),
      stepType: step.type,
      // `preview` fica vazio de propósito: o card deriva o texto do próprio
      // config (`cardPreview`), evitando duas fontes de verdade.
      preview: "",
      config: config as NodeConfig,
      outputs: outputsFromStepConfig(step.type, config),
    })
    const saved = readRfPos(config)
    if (!saved) unpositionedIds.push(step.id)
    return {
      id: step.id,
      type: "flowNode",
      position: saved ?? { x: 0, y: 0 },
      data,
    }
  })

  const triggerCfg = asRecord(source.triggerConfig)
  const entryId = triggerCfg.__entryDisconnected === true ? undefined : steps[0]?.id
  const triggerNode: Node<FlowNodeData> = {
    id: TRIGGER_NODE_ID,
    type: "flowNode",
    position: readRfPos(triggerCfg) ?? { x: 0, y: 0 },
    data: {
      ref: 1,
      kind: "trigger",
      stepType: "trigger",
      triggerType: source.triggerType,
      topic: "inicio",
      title: triggerTypeLabel(source.triggerType),
      preview: summarizeTrigger(source.triggerType, triggerCfg),
      outputs: [{ key: "next", label: "Iniciar fluxo", kind: "navigation", target: entryId }],
      stats: { sucessos: 0, alertas: 0, erros: 0 },
      config: triggerCfg as NodeConfig,
    },
  }
  if (!readRfPos(triggerCfg)) unpositionedIds.push(TRIGGER_NODE_ID)

  const nodes = [triggerNode, ...stepNodes]

  // Arestas derivam exclusivamente das saídas já resolvidas pelo adapter de
  // handles — nada é inventado, e destinos órfãos (step apagado) são ignorados.
  const edges: Edge[] = []
  const seen = new Set<string>()
  for (const node of nodes) {
    for (const out of node.data.outputs) {
      const target = out.target
      if (!target || target === STOP_SENTINEL) continue
      if (!stepIds.has(target)) continue
      const id = edgeId(node.id, out.key, target)
      if (seen.has(id)) continue
      seen.add(id)
      edges.push(buildEdge(node.id, out.key, target, out.kind))
    }
  }

  return { nodes, edges, unpositionedIds }
}

function summarizeTrigger(triggerType: string, cfg: Rec): string {
  return summarizeTriggerConfig(triggerType, cfg)
}

// ─────────────────────────────────────────────────────────────────
// Layout: respeita `__rfPos`, Dagre só para o que falta
// ─────────────────────────────────────────────────────────────────

/**
 * Mantém as posições salvas e roda o Dagre APENAS para os nós sem `__rfPos`.
 *
 * O Dagre trabalha num sistema de coordenadas próprio; para os nós novos não
 * caírem longe do fluxo já organizado, deslocamos o resultado pela mediana da
 * diferença entre as posições salvas e as calculadas. Sem nenhuma posição
 * salva, o layout automático vale para o grafo inteiro.
 */
export function applySavedLayout(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  unpositioned: Set<string>,
  direction: LayoutDirection = "LR",
): Node<FlowNodeData>[] {
  if (unpositioned.size === 0) return nodes
  const laid = layoutFlow(nodes, edges, direction)
  const laidById = new Map(laid.map((n) => [n.id, n]))

  if (unpositioned.size === nodes.length) return laid

  const dx: number[] = []
  const dy: number[] = []
  for (const node of nodes) {
    if (unpositioned.has(node.id)) continue
    const l = laidById.get(node.id)
    if (!l) continue
    dx.push(node.position.x - l.position.x)
    dy.push(node.position.y - l.position.y)
  }
  const offset = { x: median(dx), y: median(dy) }

  const taken = nodes
    .filter((n) => !unpositioned.has(n.id))
    .map((n) => ({ ...n.position, h: nodeHeight(n.data) }))

  return nodes.map((node) => {
    if (!unpositioned.has(node.id)) return node
    const l = laidById.get(node.id)
    const base = l
      ? { x: l.position.x + offset.x, y: l.position.y + offset.y }
      : { x: 0, y: 0 }
    const position = nudgeFromOverlap(base, nodeHeight(node.data), taken)
    taken.push({ ...position, h: nodeHeight(node.data) })
    return { ...node, position }
  })
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Empurra o nó para baixo enquanto colidir com algum card já posicionado. */
function nudgeFromOverlap(
  base: { x: number; y: number },
  height: number,
  taken: { x: number; y: number; h: number }[],
): { x: number; y: number } {
  const pos = { ...base }
  for (let i = 0; i < 40; i++) {
    const hit = taken.find(
      (t) =>
        Math.abs(t.x - pos.x) < NODE_WIDTH * 0.8 &&
        pos.y < t.y + t.h + 24 &&
        t.y < pos.y + height + 24,
    )
    if (!hit) break
    pos.y = hit.y + hit.h + 48
  }
  return pos
}

// ─────────────────────────────────────────────────────────────────
// grafo → steps[]
// ─────────────────────────────────────────────────────────────────

export type AutomationFlowPersistPayload = {
  steps: { id: string; type: string; config: Rec }[]
  triggerConfig: Rec
  triggerType: string
}

/**
 * Converte o canvas de volta para o formato persistido.
 *
 * Estratégia deliberadamente conservadora: o `config` de cada nó JÁ É o config
 * original (mutado pelos helpers de handle durante a edição), então ele é
 * reenviado como está. Só sobrescrevemos `__rfPos` com a posição corrente.
 * Assim uma chave que o canvas não conhece nunca é descartada.
 *
 * A ordem do array é preservada (o editor legado usa `steps[0]` como entrada);
 * steps criados no canvas entram no fim, e um step só sobe para a primeira
 * posição se o operador religar o gatilho nele.
 */
export function flowGraphToAutomation(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  source: AutomationFlowSource,
): AutomationFlowPersistPayload {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const originalOrder = (Array.isArray(source.steps) ? source.steps : []).map((s) => s.id)

  const stepNodes = nodes.filter((n) => n.id !== TRIGGER_NODE_ID)
  const rank = new Map(originalOrder.map((id, i) => [id, i]))
  const ordered = [...stepNodes].sort(
    (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  )

  const triggerEdge = edges.find((e) => e.source === TRIGGER_NODE_ID)
  if (triggerEdge && byId.has(triggerEdge.target)) {
    const idx = ordered.findIndex((n) => n.id === triggerEdge.target)
    if (idx > 0) ordered.unshift(...ordered.splice(idx, 1))
  }

  const steps = clearGhostRootNext(
    ordered.map((node) => ({
      id: node.id,
      type: resolveStepType(node.data),
      config: withRfPos(node.data.config, node.position),
    })),
  ).steps

  const triggerNode = byId.get(TRIGGER_NODE_ID)
  const baseTrigger = asRecord(source.triggerConfig)
  let triggerConfig: Rec = triggerNode
    ? withRfPos(triggerNode.data.config, triggerNode.position)
    : { ...baseTrigger }
  const triggerType =
    typeof triggerNode?.data.triggerType === "string" && triggerNode.data.triggerType
      ? triggerNode.data.triggerType
      : source.triggerType

  // `__entryDisconnected` é a forma legada de dizer "o gatilho não aponta para
  // o primeiro step". Mantemos a mesma semântica nos dois sentidos.
  if (!triggerEdge && steps.length > 0) {
    triggerConfig = { ...triggerConfig, __entryDisconnected: true }
  } else if (triggerConfig.__entryDisconnected === true) {
    const { __entryDisconnected: _drop, ...rest } = triggerConfig
    triggerConfig = rest
  }

  return { steps, triggerConfig, triggerType }
}

function withRfPos(config: unknown, position: { x: number; y: number }): Rec {
  const base = { ...asRecord(config) }
  const x = Math.round(position.x * 100) / 100
  const y = Math.round(position.y * 100) / 100
  const current = readRfPos(base)
  if (current && current.x === x && current.y === y) return base
  base.__rfPos = { x, y }
  return base
}

/** Marca o step como tendo destinos explícitos — espelha o canvas legado. */
export function markExplicitEdges(config: NodeConfig | undefined): NodeConfig {
  return { ...(config ?? {}), __hasExplicitEdges: true } as NodeConfig
}
