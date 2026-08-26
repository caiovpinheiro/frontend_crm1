"use client"

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnConnectStart,
  type OnConnectEnd,
} from "@xyflow/react"
import dagre from "dagre"
import "@xyflow/react/dist/style.css"
import "./flow-editor.css"

import { nodeTypes, type FlowNodeData } from "./nodes"
import { edgeTypes } from "./deletable-edge"
import { STEP_GROUPS, stepIcon } from "./add-step-node"
import { stepTypeLabel, defaultStepConfig } from "@/lib/automation-workflow"
import { automationExportToCanvas, type FlowAnalysis } from "./automation-graph"
import { FLOW_FIXTURES, FLOW_FIXTURE_OPTIONS, type FlowFixtureKey } from "./fixtures"
import { DropdownGlass } from "@/components/crm/dropdown-glass"
import { useMobileChatChrome } from "@/hooks/use-mobile-chat-chrome"

/** Família de cor do ícone/acento por tipo de ação (espelha o HTML DS v2). */
type Chip = "blue" | "violet" | "green" | "amber" | "danger"

const STEP_CHIP: Record<string, Chip> = {
  // Mensagens
  send_whatsapp_message: "green",
  send_whatsapp_template: "green",
  send_whatsapp_media: "green",
  send_whatsapp_interactive: "violet",
  send_whatsapp_list: "violet",
  send_whatsapp_flow: "violet",
  send_email: "blue",
  // Salesbot
  question: "violet",
  wait_for_reply: "amber",
  set_variable: "blue",
  goto: "blue",
  transfer_automation: "violet",
  finish: "danger",
  // Ações
  move_stage: "blue",
  assign_owner: "blue",
  add_tag: "green",
  remove_tag: "danger",
  update_field: "blue",
  create_activity: "violet",
  update_lead_score: "green",
  create_deal: "green",
  finish_conversation: "green",
  tabulate_conversation: "green",
  consume_stock: "amber",
  execute_distribution: "blue",
  // Lógica
  delay: "amber",
  condition: "amber",
  business_hours: "amber",
  check_agent_status: "amber",
  // Integrações
  webhook: "blue",
  // IA
  transfer_to_ai_agent: "violet",
  ask_ai_agent: "violet",
  stop_automation: "danger",
}

const CHIP_ACCENT: Record<Chip, FlowNodeData["accent"]> = {
  blue: "blue",
  violet: "violet",
  green: "green",
  amber: "amber",
  danger: "red",
}

const chipOf = (type: string): Chip => STEP_CHIP[type] ?? "blue"

/** Grupos de blocos filtrados por texto (compartilhado pela barra e pelo modal). */
function groupsFor(query: string) {
  const q = query.trim().toLowerCase()
  return STEP_GROUPS.map((g) => ({
    title: g.title,
    items: q ? g.items.filter((t) => stepTypeLabel(t).toLowerCase().includes(q)) : g.items,
  })).filter((g) => g.items.length > 0)
}

const initialNodes: Node<FlowNodeData>[] = [
  {
    id: "trigger",
    type: "flow",
    position: { x: 0, y: 200 },
    data: {
      kind: "Gatilho",
      title: "Negócio criado",
      accent: "violet",
      subtitle: "Pipeline: Pipeline Principal",
      source: true,
      stats: { ok: 6402 },
    },
  },
  {
    id: "buttons",
    type: "flow",
    position: { x: 320, y: 150 },
    data: {
      kind: "Botões WhatsApp",
      title: "Olá! Seja bem-vindo(a)",
      accent: "green",
      stepType: "send_whatsapp_interactive",
      config: {
        body: "Olá! Seja bem-vindo(a). Como podemos ajudar?",
        buttons: [
          { id: "btn_0", title: "Emprego CLT", gotoStepId: "tag-clt" },
          { id: "btn_1", title: "Estágio · Superior", gotoStepId: "tag-sup" },
          { id: "btn_2", title: "Estágio · Médio", gotoStepId: "tag-med" },
        ],
        header: "",
        footer: "",
        elseGotoStepId: "",
        saveToVariable: "",
      },
      badge: "1",
      target: true,
      stats: { ok: 1148, err: 2 },
    },
  },
  {
    id: "tag-clt",
    type: "flow",
    position: { x: 660, y: 20 },
    data: { kind: "Adicionar tag", title: "CLT", accent: "green", stepType: "add_tag", config: { tagName: "CLT" }, badge: "2", target: true, source: true, stats: { ok: 847 } },
  },
  {
    id: "tag-sup",
    type: "flow",
    position: { x: 660, y: 220 },
    data: { kind: "Adicionar tag", title: "Estágio Superior", accent: "green", stepType: "add_tag", config: { tagName: "Estágio Superior" }, badge: "5", target: true, source: true, stats: { ok: 23 } },
  },
  {
    id: "tag-med",
    type: "flow",
    position: { x: 660, y: 410 },
    data: { kind: "Adicionar tag", title: "Estágio Médio", accent: "green", stepType: "add_tag", config: { tagName: "Estágio Médio" }, badge: "11", target: true, source: true, stats: { ok: 154 } },
  },
  {
    id: "msg-vagas",
    type: "flow",
    position: { x: 1000, y: 0 },
    data: {
      kind: "Mensagem WhatsApp",
      title: "Vagas disponíveis",
      accent: "green",
      stepType: "send_whatsapp_message",
      config: { content: "Ótimo! Para selecionarmos as melhores vagas, preencha o formulário a seguir." },
      badge: "3",
      subtitle: "Ótimo! Para selecionarmos as melhores vagas…",
      target: true,
      source: true,
      stats: { ok: 846, err: 1 },
    },
  },
  {
    id: "template",
    type: "flow",
    position: { x: 1000, y: 290 },
    data: {
      kind: "Template WhatsApp",
      title: "form_inicial_estag",
      accent: "blue",
      stepType: "send_whatsapp_template",
      config: { templateName: "form_inicial_estag_junho2026", languageCode: "pt_BR" },
      badge: "7",
      subtitle: "form_inicial_estag_junho2026",
      target: true,
      source: true,
      stats: { ok: 177 },
    },
  },
  {
    id: "wait",
    type: "flow",
    position: { x: 1360, y: 130 },
    data: {
      kind: "Aguardar resposta",
      title: "Até mensagem recebida",
      accent: "amber",
      stepType: "wait_for_reply",
      config: { timeoutMs: 480_000, receivedGotoStepId: "", timeoutGotoStepId: "", saveToVariable: "" },
      badge: "8",
      meta: "Cronômetro: 8 min",
      target: true,
      branches: [
        { id: "recebida", label: "Mensagem recebida" },
        { id: "semresposta", label: "Sem resposta no prazo", err: true },
      ],
      stats: { ok: 1022 },
    },
  },
  {
    id: "stage",
    type: "flow",
    position: { x: 1720, y: 80 },
    data: { kind: "Mover estágio", title: "Form preenchido", accent: "blue", stepType: "move_stage", config: { stageId: "" }, badge: "16", target: true, source: true, stats: { ok: 701 } },
  },
  {
    id: "lembrete",
    type: "flow",
    position: { x: 1720, y: 300 },
    data: {
      kind: "Mensagem WhatsApp",
      title: "Lembrete de formulário",
      accent: "green",
      stepType: "send_whatsapp_message",
      config: { content: "Notamos que ainda não completou o formulário. Podemos ajudar?" },
      badge: "14",
      subtitle: "Notamos que ainda não completou o formul…",
      target: true,
      targetErr: true,
      source: true,
      stats: { ok: 320 },
    },
  },
]

const E = (id: string, source: string, target: string, sourceHandle?: string, err?: boolean): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  type: "deletable",
  data: { err },
})

const initialEdges: Edge[] = [
  E("e1", "trigger", "buttons"),
  E("e2", "buttons", "tag-clt", "btn_0"),
  E("e3", "buttons", "tag-sup", "btn_1"),
  E("e4", "buttons", "tag-med", "btn_2"),
  E("e5", "tag-clt", "msg-vagas"),
  E("e6", "tag-sup", "template"),
  E("e7", "tag-med", "template"),
  E("e8", "msg-vagas", "wait"),
  E("e9", "template", "wait"),
  E("e10", "wait", "stage", "received"),
  E("e11", "wait", "lembrete", "timeout", true),
]

const NODE_W = 230
const NODE_H = 92

/** Dagre auto-layout, left → right */
function layout<T extends Node>(nodes: T[], edges: Edge[]): T[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 110, marginx: 40, marginy: 40 })
  nodes.forEach((n) => g.setNode(n.id, { width: n.measured?.width ?? NODE_W, height: n.measured?.height ?? NODE_H }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - (n.measured?.width ?? NODE_W) / 2, y: p.y - (n.measured?.height ?? NODE_H) / 2 } }
  })
}

let idSeq = 100
const nextId = () => `n${idSeq++}`

type Ctx = { id: string; top: number; left: number } | null

function parseFixtureKey(raw: string | null): FlowFixtureKey {
  if (raw === "receptivo" || raw === "followup" || raw === "pos-vaga" || raw === "demo") return raw
  return "receptivo"
}

function EditorInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fixtureKey = parseFixtureKey(searchParams.get("flow"))

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [flowName, setFlowName] = useState("receptivo_geral(junho2026)")
  const [analysis, setAnalysis] = useState<FlowAnalysis | null>(null)
  const [diagOpen, setDiagOpen] = useState(true)
  const [active, setActive] = useState(true)
  const [blockQuery, setBlockQuery] = useState("")
  const [pickerQuery, setPickerQuery] = useState("")
  const [picker, setPicker] = useState<{
    x: number
    y: number
    fromId: string
    fromHandle: string | null
    fromType: "source" | "target"
  } | null>(null)
  const [ctx, setCtx] = useState<Ctx>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const reconnectDone = useRef(true)
  const connectFrom = useRef<{ nodeId: string | null; handleId: string | null; type: "source" | "target" } | null>(null)
  const { screenToFlowPosition, fitView, getNodes, getEdges } = useReactFlow<Node<FlowNodeData>>()

  const loadFixture = useCallback(
    (key: FlowFixtureKey) => {
      if (key === "demo") {
        setNodes(initialNodes)
        setEdges(initialEdges)
        setFlowName("receptivo_geral (demo)")
        setAnalysis(null)
        setActive(true)
        window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }))
        return
      }
      const exp = FLOW_FIXTURES[key]
      const { nodes: n, edges: e, analysis: a } = automationExportToCanvas(exp)
      setNodes(n)
      setEdges(e)
      setFlowName(exp.name)
      setAnalysis(a)
      setActive(exp.active ?? true)
      window.requestAnimationFrame(() => fitView({ padding: 0.15, duration: 400 }))
    },
    [setNodes, setEdges, fitView],
  )

  useEffect(() => {
    loadFixture(fixtureKey)
  }, [fixtureKey, loadFixture])

  const onFixtureChange = useCallback(
    (key: string) => {
      const k = parseFixtureKey(key)
      const params = new URLSearchParams(searchParams.toString())
      params.set("flow", k)
      router.replace(`/automations/editor?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: "deletable" }, eds)),
    [setEdges],
  )

  // ---- Arrastar conexão para o vazio → abre o seletor de blocos ----
  const onConnectStart = useCallback<OnConnectStart>((_, params) => {
    connectFrom.current = {
      nodeId: params.nodeId ?? null,
      handleId: params.handleId ?? null,
      type: (params.handleType ?? "source") as "source" | "target",
    }
  }, [])

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      // soltou sobre um ponto válido → onConnect já tratou
      if (connectionState?.isValid) return
      const from = connectFrom.current
      connectFrom.current = null
      if (!from?.nodeId) return
      const pt = "changedTouches" in event ? event.changedTouches[0] : (event as MouseEvent)
      const pos = screenToFlowPosition({ x: pt.clientX, y: pt.clientY })
      setPickerQuery("")
      setPicker({ x: pos.x, y: pos.y - 20, fromId: from.nodeId, fromHandle: from.handleId, fromType: from.type })
    },
    [screenToFlowPosition],
  )

  const addStepFromPicker = useCallback(
    (type: string) => {
      setPicker((p) => {
        if (!p) return null
        const id = nextId()
        const node: Node<FlowNodeData> = {
          id,
          type: "flow",
          position: { x: p.x, y: p.y },
          data: {
            kind: stepTypeLabel(type),
            title: stepTypeLabel(type),
            accent: CHIP_ACCENT[chipOf(type)],
            stepType: type,
            config: defaultStepConfig(type),
            target: true,
            source: true,
          },
        }
        setNodes((nds) => nds.concat(node))
        const conn: Connection =
          p.fromType === "target"
            ? { source: id, sourceHandle: null, target: p.fromId, targetHandle: p.fromHandle }
            : { source: p.fromId, sourceHandle: p.fromHandle, target: id, targetHandle: null }
        setEdges((eds) => addEdge({ ...conn, type: "deletable" }, eds))
        return null
      })
    },
    [setNodes, setEdges],
  )

  // ---- Reconnect: arrasta a ponta de uma conexão existente para outra caixa ----
  const onReconnectStart = useCallback(() => {
    reconnectDone.current = false
  }, [])
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectDone.current = true
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds))
    },
    [setEdges],
  )
  const onReconnectEnd = useCallback(
    (_: unknown, edge: Edge) => {
      // solto em área vazia → remove a conexão
      if (!reconnectDone.current) setEdges((eds) => eds.filter((e) => e.id !== edge.id))
      reconnectDone.current = true
    },
    [setEdges],
  )

  // ---- Drag & Drop a partir do painel de Blocos ----
  const onDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData(
      "application/reactflow",
      JSON.stringify({ type, accent: CHIP_ACCENT[chipOf(type)], label: stepTypeLabel(type) }),
    )
    e.dataTransfer.effectAllowed = "move"
  }
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData("application/reactflow")
      if (!raw) return
      const def = JSON.parse(raw) as { type: string; accent: FlowNodeData["accent"]; label: string }
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const node: Node<FlowNodeData> = {
        id: nextId(),
        type: "flow",
        position,
        data: {
          kind: def.label,
          title: def.label,
          accent: def.accent,
          stepType: def.type,
          config: defaultStepConfig(def.type),
          target: true,
          source: true,
        },
      }
      setNodes((nds) => nds.concat(node))
    },
    [screenToFlowPosition, setNodes],
  )

  // ---- Auto layout (Dagre) ----
  const onAutoLayout = useCallback(() => {
    const next = layout(getNodes(), getEdges())
    setNodes(next)
    window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }))
  }, [getNodes, getEdges, setNodes, fitView])

  // ---- Export JSON ----
  const onExport = useCallback(() => {
    const flow = { nodes: getNodes(), edges: getEdges() }
    const blob = new Blob([JSON.stringify(flow, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "receptivo_geral.json"
    a.click()
    URL.revokeObjectURL(url)
  }, [getNodes, getEdges])

  // ---- Menu de contexto (clique direito no nó) ----
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    const rect = wrapRef.current?.getBoundingClientRect()
    setCtx({ id: node.id, top: e.clientY - (rect?.top ?? 0), left: e.clientX - (rect?.left ?? 0) })
  }, [])
  const closeCtx = useCallback(() => setCtx(null), [])

  const duplicateNode = useCallback(() => {
    if (!ctx) return
    const src = getNodes().find((n) => n.id === ctx.id)
    if (src) {
      setNodes((nds) =>
        nds.concat({
          ...src,
          id: nextId(),
          position: { x: src.position.x + 40, y: src.position.y + 40 },
          selected: false,
          data: { ...(src.data as FlowNodeData), badge: undefined, stats: undefined },
        }),
      )
    }
    closeCtx()
  }, [ctx, getNodes, setNodes, closeCtx])

  const deleteNode = useCallback(() => {
    if (!ctx) return
    setNodes((nds) => nds.filter((n) => n.id !== ctx.id))
    setEdges((eds) => eds.filter((e) => e.source !== ctx.id && e.target !== ctx.id))
    closeCtx()
  }, [ctx, setNodes, setEdges, closeCtx])

  const filteredGroups = useMemo(() => groupsFor(blockQuery), [blockQuery])
  const pickerGroups = useMemo(() => groupsFor(pickerQuery), [pickerQuery])

  return (
    <div className="ds-flow automation-editor">
      {/* TOP BAR — padrão DS v2 (automations-canvas.html) */}
      <header className="topbar">
        <div className="page-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <div className="titles">
          <div className="crumb">
            <Link href="/automations" className="back" aria-label="Voltar para Automações">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Automações
            </Link>
            <span className="sep">/</span>
            <span className="cur">Editor de fluxo</span>
          </div>
          <h1 className="flow-name">
            {flowName}
            <span className="edit" role="button" tabIndex={0} aria-label="Renomear automação">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </span>
          </h1>
        </div>

        <div className="tb-spacer" />

        <div className="tb-actions">
          <div className="tb-group flow-fixture-select">
            <DropdownGlass
              options={FLOW_FIXTURE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
              value={fixtureKey}
              onValueChange={onFixtureChange}
              placeholder="Fluxo"
              matchTriggerWidth
              triggerClassName="!min-w-[200px]"
            />
          </div>
          <button
            type="button"
            className={`switch-wrap${active ? "" : " off"}`}
            onClick={() => setActive((v) => !v)}
            aria-pressed={active}
            role="switch"
            aria-checked={active}
          >
            <span className="lbl">{active ? "ATIVA" : "PAUSADA"}</span>
            <span className={`switch${active ? "" : " off"}`} />
          </button>

          <span className="tb-sep" aria-hidden="true" />

          <div className="tb-group">
            <button type="button" className="btn btn-ghost" onClick={onAutoLayout}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h7M3 6h12M3 18h9" />
              </svg>
              Auto alinhar
            </button>
            <button type="button" className="btn btn-ghost" onClick={onExport}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Exportar JSON
            </button>
            <button type="button" className="btn btn-ghost">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M8 13h8M8 17h5" />
              </svg>
              Logs
            </button>
          </div>

          <span className="tb-sep" aria-hidden="true" />

          <div className="tb-group">
            <button type="button" className="btn btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <path d="M17 21v-8H7v8M7 3v5h8" />
              </svg>
              Salvar
            </button>
          </div>
        </div>
      </header>

      {/* WORKSPACE */}
      <div className="workspace">
          {/* BLOCKS PANEL */}
          <aside className="blocks" aria-label="Blocos disponíveis">
            <div className="blocks-head">
              <h2>Blocos</h2>
              <p>Arraste para o canvas</p>
            </div>
            <div className="blocks-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                type="search"
                value={blockQuery}
                onChange={(e) => setBlockQuery(e.target.value)}
                placeholder="Buscar bloco..."
                aria-label="Buscar bloco"
              />
            </div>
            <div className="blocks-list">
              {filteredGroups.length === 0 && <div className="blocks-empty">Nenhum bloco encontrado.</div>}
              {filteredGroups.map((group) => (
                <Fragment key={group.title}>
                  <div className="grp-label">{group.title}</div>
                  {group.items.map((type) => {
                    const Ico = stepIcon[type]
                    return (
                      <div className="block" key={type} draggable onDragStart={(e) => onDragStart(e, type)}>
                        <span className={`b-ico ico-${chipOf(type)}`}>
                          {Ico ? <Ico className="size-[17px]" strokeWidth={2} /> : null}
                        </span>
                        <span className="b-name">{stepTypeLabel(type)}</span>
                      </div>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </aside>

          {/* CANVAS */}
          <div className="canvas" ref={wrapRef} onDrop={onDrop} onDragOver={onDragOver}>
            {analysis && (
              <div className={`flow-diag${diagOpen ? "" : " collapsed"}`}>
                <button type="button" className="flow-diag-toggle" onClick={() => setDiagOpen((v) => !v)}>
                  <span>
                    Preview — {analysis.reachableFromEntry}/{analysis.stepCount} no fluxo ativo · {analysis.edgeCount}{" "}
                    arestas
                    {analysis.diagnostics.filter((d) => d.level === "error").length > 0 && (
                      <em className="flow-diag-err">
                        {" "}
                        · {analysis.diagnostics.filter((d) => d.level === "error").length} erro(s)
                      </em>
                    )}
                    {analysis.unreachableStepIds.length > 0 && (
                      <em className="flow-diag-warn">
                        {" "}
                        · {analysis.unreachableStepIds.length} rascunho(s) morto(s)
                      </em>
                    )}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d={diagOpen ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
                  </svg>
                </button>
                {diagOpen && (
                  <ul className="flow-diag-list">
                    {analysis.diagnostics.length === 0 && (
                      <li className="flow-diag-item info">Plotagem ok — nenhum problema detectado.</li>
                    )}
                    {analysis.diagnostics.map((d, i) => (
                      <li key={i} className={`flow-diag-item ${d.level}`}>
                        {d.stepId && <code>{d.stepId.slice(0, 8)}</code>}
                        {d.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onReconnect={onReconnect}
              onReconnectStart={onReconnectStart}
              onReconnectEnd={onReconnectEnd}
              onNodeContextMenu={onNodeContextMenu}
              onPaneClick={closeCtx}
              onMoveStart={closeCtx}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              deleteKeyCode={["Delete", "Backspace"]}
              minZoom={0.3}
              maxZoom={1.6}
              snapToGrid
              snapGrid={[16, 16]}
              connectionRadius={36}
              defaultEdgeOptions={{ type: "deletable", reconnectable: true }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color="var(--canvas-dot)" />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap
                pannable
                zoomable
                position="bottom-right"
                nodeColor={(n) => {
                  const a = (n.data as FlowNodeData).accent
                  return a === "violet" ? "#a78bfa" : a === "amber" ? "#d97706" : a === "red" ? "#ef4444" : a === "blue" ? "#5b6ff5" : "#10b981"
                }}
                maskColor="rgba(91,111,245,0.15)"
              />
            </ReactFlow>

            {ctx && (
              <div className="ctx-menu" style={{ top: ctx.top, left: ctx.left }} onMouseLeave={closeCtx}>
                <button onClick={duplicateNode}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  Duplicar
                </button>
                <button className="danger" onClick={deleteNode}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  Excluir nó
                </button>
              </div>
            )}

            {picker && (
              <div className="step-picker-backdrop" onClick={() => setPicker(null)}>
                <div className="step-picker" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Adicionar passo">
                  <div className="blocks-head sp-head">
                    <div>
                      <h2>Adicionar passo</h2>
                      <p>Escolha um bloco para conectar a este fluxo.</p>
                    </div>
                    <button className="sp-close" onClick={() => setPicker(null)} aria-label="Fechar">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                  <div className="blocks-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    <input
                      type="search"
                      autoFocus
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      placeholder="Buscar bloco..."
                      aria-label="Buscar bloco"
                    />
                  </div>
                  <div className="blocks-list">
                    {pickerGroups.length === 0 && <div className="blocks-empty">Nenhum bloco encontrado.</div>}
                    {pickerGroups.map((group) => (
                      <Fragment key={group.title}>
                        <div className="grp-label">{group.title}</div>
                        {group.items.map((type) => {
                          const Ico = stepIcon[type]
                          return (
                            <button type="button" className="block block-pick" key={type} onClick={() => addStepFromPicker(type)}>
                              <span className={`b-ico ico-${chipOf(type)}`}>
                                {Ico ? <Ico className="size-[17px]" strokeWidth={2} /> : null}
                              </span>
                              <span className="b-name">{stepTypeLabel(type)}</span>
                            </button>
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
    </div>
  )
}

export function FlowEditor() {
  // Mobile: esconde a bottom nav enquanto o editor de fluxo está aberto.
  useMobileChatChrome(true)

  return (
    <ReactFlowProvider>
      <Suspense fallback={<div className="ds-flow automation-editor p-6 text-sm text-[var(--text-muted)]">Carregando editor…</div>}>
        <EditorInner />
      </Suspense>
    </ReactFlowProvider>
  )
}
