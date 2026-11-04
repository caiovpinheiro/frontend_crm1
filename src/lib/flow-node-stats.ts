/**
 * Projeta os contadores de `GET /api/automations/:id/stats` sobre os nós do
 * canvas.
 *
 * Fica fora de `flow-automation-adapter.ts` de propósito: aquele módulo é a
 * conversão pura entre o registro persistido e o grafo, e telemetria não pode
 * virar dependência dele. Aqui é um passo posterior, aplicado sobre os nós já
 * montados.
 *
 * Vocabulário: o backend fala `success/failed/skipped`, o card fala
 * `sucessos/alertas/erros`. O mapeamento é o mesmo do canvas legado
 * (`components/automations/workflow-canvas.tsx`): alertas = skipped,
 * erros = failed.
 */
import type { Node } from "@xyflow/react"

import type { AutomationStats } from "./automation-stats-types"
import type { FlowNodeData } from "./flow-data"
import { TRIGGER_NODE_ID } from "./flow-automation-adapter"

export type FlowNodeStats = { sucessos: number; alertas: number; erros: number }

export type LogTabKey = "entered" | "success" | "alert" | "error"

/** Mesmos status que o rodapé do card e as abas da modal de logs. */
export const SUCCESS_LOG_STATUSES = [
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "SUCCESS",
] as const
export const ALERT_LOG_STATUSES = ["SKIPPED"] as const
export const ERROR_LOG_STATUSES = ["FAILED", "FAILED_HANDLED"] as const

const ZERO: FlowNodeStats = { sucessos: 0, alertas: 0, erros: 0 }

function sumStatuses(
  counts: Record<string, number>,
  keys: readonly string[],
): number {
  return keys.reduce((n, key) => n + (counts[key] ?? 0), 0)
}

/**
 * O gatilho não tem `stepId`, então o backend agrega os logs da automação por
 * status cru. `STARTED` é só o eco do disparo — sucesso é o desfecho
 * (`COMPLETED` / `SUCCESS`), o mesmo critério das abas da modal.
 */
function triggerStats(trigger: Record<string, number> | undefined): FlowNodeStats {
  const t = trigger ?? {}
  return {
    sucessos: sumStatuses(t, SUCCESS_LOG_STATUSES),
    alertas: sumStatuses(t, ALERT_LOG_STATUSES),
    erros: sumStatuses(t, ERROR_LOG_STATUSES),
  }
}

/**
 * Status crus enviados em `GET /logs?status=` e `logStatus=`. No gatilho o
 * sucesso é o desfecho; no passo o card só conta `SUCCESS` (o groupBy
 * de `/stats`).
 */
export function statusesForLogTab(tab: LogTabKey, nodeId: string): string[] {
  const success =
    nodeId === TRIGGER_NODE_ID ? [...SUCCESS_LOG_STATUSES] : ["SUCCESS"]
  if (tab === "success") return success
  if (tab === "alert") return [...ALERT_LOG_STATUSES]
  if (tab === "error") return [...ERROR_LOG_STATUSES]
  return [...success, ...ALERT_LOG_STATUSES, ...ERROR_LOG_STATUSES]
}

/** Guard da lista: sucesso nunca aparece na aba Erros, mesmo se a API errar. */
export function logRowMatchesTab(
  rawStatus: string,
  tab: LogTabKey,
  nodeId: string,
): boolean {
  if (tab === "entered") return true
  return statusesForLogTab(tab, nodeId).includes(rawStatus.trim().toUpperCase())
}

export function statsForNode(
  nodeId: string,
  stats: AutomationStats | undefined,
): FlowNodeStats {
  if (!stats) return ZERO
  if (nodeId === TRIGGER_NODE_ID) return triggerStats(stats.trigger)
  const s = stats.steps?.[nodeId]
  if (!s) return ZERO
  return { sucessos: s.success, alertas: s.skipped, erros: s.failed }
}

function same(a: FlowNodeStats, b: FlowNodeStats): boolean {
  return a.sucessos === b.sucessos && a.alertas === b.alertas && a.erros === b.erros
}

export type FlowNodeRoutes = Record<string, number>

/**
 * Traduz `stats.routes[stepId]` para as chaves das saídas do card.
 * `to:<id>` (desvio por destino) casa com a saída que aponta para esse id;
 * `next` sem saída `next` cai na saída "verdadeira" (`true`) dos IFs.
 * Chave sem saída correspondente (botão removido, aresta trocada) é ignorada.
 */
export function routesForNode(
  node: Node<FlowNodeData>,
  stats: AutomationStats | undefined,
): FlowNodeRoutes | undefined {
  if (node.id === TRIGGER_NODE_ID) return undefined
  const raw = stats?.routes?.[node.id]
  if (!raw) return undefined
  const outputs = node.data.outputs ?? []
  const keys = new Set(outputs.map((o) => o.key))
  const out: FlowNodeRoutes = {}
  for (const [routeKey, n] of Object.entries(raw)) {
    let key: string | undefined
    if (routeKey.startsWith("to:")) {
      const target = routeKey.slice(3)
      key = outputs.find((o) => o.target === target)?.key
    } else if (keys.has(routeKey)) {
      key = routeKey
    } else if (routeKey === "next" && keys.has("true")) {
      key = "true"
    }
    if (!key || !Number.isFinite(n) || n <= 0) continue
    out[key] = (out[key] ?? 0) + n
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function sameRoutes(a: FlowNodeRoutes | undefined, b: FlowNodeRoutes | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => a[k] === b[k])
}

/**
 * Devolve o mesmo array quando nada mudou — o canvas re-renderiza a cada
 * `setNodes`, e o polling dos stats bate a cada 30s sem novidade na maioria
 * das vezes.
 */
export function applyStatsToNodes(
  nodes: Node<FlowNodeData>[],
  stats: AutomationStats | undefined,
): Node<FlowNodeData>[] {
  let changed = false
  const next = nodes.map((node) => {
    const value = statsForNode(node.id, stats)
    const routes = routesForNode(node, stats)
    if (same(node.data.stats, value) && sameRoutes(node.data.routes, routes)) return node
    changed = true
    return { ...node, data: { ...node.data, stats: value, routes } }
  })
  return changed ? next : nodes
}
