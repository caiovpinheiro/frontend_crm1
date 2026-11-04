import { describe, expect, it } from "vitest"
import type { Node } from "@xyflow/react"

import type { FlowNodeData } from "../flow-data"
import { applyStatsToNodes, routesForNode } from "../flow-node-stats"

function node(id: string, outputs: FlowNodeData["outputs"]): Node<FlowNodeData> {
  return {
    id,
    type: "flowNode",
    position: { x: 0, y: 0 },
    data: {
      ref: 1,
      kind: "action",
      topic: "geral",
      title: "t",
      preview: "",
      outputs,
      stats: { sucessos: 0, alertas: 0, erros: 0 },
    } as unknown as FlowNodeData,
  }
}

const template = node("s58", [
  { key: "btn_0", label: "Quero meu acesso", kind: "response", target: "s51" },
  { key: "btn_1", label: "Primeiro Acesso", kind: "response", target: "s51" },
  { key: "btn_2", label: "Sobre o Curso", kind: "response", target: "s60" },
  { key: "next", label: "Próximo passo", kind: "navigation" },
  { key: "else", label: "Outra resposta", kind: "navigation" },
  { key: "timeout", label: "Sem resposta", kind: "error" },
  { key: "failure", label: "Erro", kind: "error" },
] as FlowNodeData["outputs"])

describe("routesForNode", () => {
  it("separa botões que apontam pro mesmo destino", () => {
    const r = routesForNode(template, {
      trigger: {},
      steps: {},
      routes: { s58: { btn_0: 80, btn_1: 50, timeout: 30, failure: 2 } },
    })
    expect(r).toEqual({ btn_0: 80, btn_1: 50, timeout: 30, failure: 2 })
  })

  it("traduz to:<id> e next→true e ignora chave órfã", () => {
    const ifNode = node("c1", [
      { key: "true", label: "Dentro", kind: "navigation", target: "a" },
      { key: "false", label: "Fora", kind: "error", target: "b" },
    ] as FlowNodeData["outputs"])
    const r = routesForNode(ifNode, {
      trigger: {},
      steps: {},
      routes: { c1: { next: 3, "to:b": 2, btn_9: 7 } },
    })
    expect(r).toEqual({ true: 3, false: 2 })
  })

  it("backend sem routes não altera o nó", () => {
    const nodes = [template]
    expect(applyStatsToNodes(nodes, { trigger: {}, steps: {} })).toBe(nodes)
  })
})
