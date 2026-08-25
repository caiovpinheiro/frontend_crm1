"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { RotateCcw, SendHorizonal, Smile } from "lucide-react"
import type { Edge, Node } from "@xyflow/react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useConnectedStepChannels } from "@/components/automations/step-channel-picker"
import {
  getTemplateDetail,
  useStepTemplateCatalog,
} from "@/components/automations/editor-data"
import type { FlowNodeData } from "@/lib/flow-data"
import { clipWa, WA_META } from "./whatsapp-phone-ui"
import {
  choiceHandle,
  continueFlowSimulation,
  emptySimState,
  resolveSimTarget,
  startFlowSimulation,
  type SimEvent,
  type SimState,
} from "@/lib/flow-sim-engine"
import {
  asWaChoices,
  nowWaLabel,
  SentBubble,
  SystemChip,
  waActionHint,
  WhatsAppBotBubble,
  WhatsAppListSheet,
  WhatsAppPhoneShell,
  type WaChoice,
} from "./whatsapp-phone-ui"

export function FlowSimulator({
  open,
  onOpenChange,
  nodes,
  edges,
  onStepChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
  onStepChange?: (nodeId: string | null) => void
}) {
  const [sim, setSim] = useState<SimState>(emptySimState)
  const [draft, setDraft] = useState("")
  const [listOpen, setListOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const time = useMemo(() => nowWaLabel(), [open])

  const current = nodes.find((n) => n.id === sim.currentId)
  const { options } = useConnectedStepChannels("send_whatsapp_message", { mockIfEmpty: true })
  const catalog = useStepTemplateCatalog(current?.data.config)
  const channelId =
    catalog.scopedChannelIds.length === 1 ? catalog.scopedChannelIds[0] : undefined
  const channel = options.find((o) => o.id === channelId)
  const bizName = channel?.label || "Empresa"
  const { detailsMap } = catalog

  useEffect(() => {
    if (!open) return
    const next = startFlowSimulation(nodes, edges)
    setSim(next)
    setDraft("")
    setListOpen(false)
    onStepChange?.(next.currentId)
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [sim.events, listOpen, sim.wait])

  const lastBot = [...sim.events].reverse().find((e): e is Extract<SimEvent, { kind: "bot" }> => e.kind === "bot")
  const lastBotTpl = lastBot
    ? getTemplateDetail(
        detailsMap,
        lastBot.config.templateName || lastBot.config.template || "",
        lastBot.config.languageCode || lastBot.config.idioma,
      )
    : undefined

  const lastChoices: WaChoice[] = lastBot
    ? lastBot.stepType === "send_whatsapp_template" && lastBotTpl?.buttons.length
      ? lastBotTpl.buttons.map((b, i) => ({
          id: `tpl_${i}`,
          title: clipWa(b.title, WA_META.templateBtn),
          kind: b.kind,
        }))
      : asWaChoices(lastBot.config, lastBot.outputs)
    : []

  const pickChoice = (c: WaChoice, index: number) => {
    if (c.kind === "flow") {
      if (!current) return
      if (lastBot?.preview === "WhatsApp Flow") {
        const target = resolveSimTarget(current, c.id, edges)
        const next = continueFlowSimulation(target, nodes, edges, [
          ...sim.events,
          { id: `u_${Date.now()}`, kind: "user", text: c.title, time: nowWaLabel() },
        ])
        setSim(next)
        setListOpen(false)
        onStepChange?.(next.currentId)
        return
      }
      const handle = choiceHandle(c.id, index, current.data.outputs)
      const cta = clipWa(c.title, WA_META.replyBtn) || "Continuar"
      setSim({
        ...sim,
        wait: "choice",
        currentId: current.id,
        events: [
          ...sim.events,
          { id: `u_${Date.now()}`, kind: "user", text: c.title, time: nowWaLabel() },
          {
            id: `flow_${Date.now()}`,
            kind: "bot",
            nodeId: current.id,
            stepType: "send_whatsapp_interactive",
            config: {
              body: "Abra o formulário para continuar.",
              buttons: [{ id: handle, title: cta, kind: "flow" }],
            },
            outputs: [{ key: handle, label: cta, kind: "response" as const }],
            preview: "WhatsApp Flow",
            time: nowWaLabel(),
          },
        ],
      })
      setListOpen(false)
      return
    }
    const hint = waActionHint(c.kind)
    if (hint) {
      setSim((prev) => ({
        ...prev,
        events: [...prev.events, { id: `hint_${Date.now()}`, kind: "system", text: hint }],
      }))
      setListOpen(false)
      return
    }
    if (!current) return
    const handle = choiceHandle(c.id, index, current.data.outputs)
    const target = resolveSimTarget(current, handle, edges)
    const next = continueFlowSimulation(target, nodes, edges, [
      ...sim.events,
      { id: `u_${Date.now()}`, kind: "user", text: c.title, time: nowWaLabel() },
    ])
    setSim(next)
    setListOpen(false)
    onStepChange?.(next.currentId)
  }

  const sendReply = (text: string, handle = "received") => {
    const trimmed = text.trim()
    if (!trimmed || !current) return
    const target = resolveSimTarget(current, handle, edges) || resolveSimTarget(current, "next", edges)
    const next = continueFlowSimulation(target, nodes, edges, [
      ...sim.events,
      { id: `u_${Date.now()}`, kind: "user", text: trimmed, time: nowWaLabel() },
    ])
    setSim(next)
    setDraft("")
    onStepChange?.(next.currentId)
  }

  const pickBranch = (handle: string, label: string) => {
    if (!current) return
    const target = resolveSimTarget(current, handle, edges)
    const next = continueFlowSimulation(target, nodes, edges, [
      ...sim.events,
      { id: `sys_${Date.now()}`, kind: "system", text: `Caminho: ${label}` },
    ])
    setSim(next)
    onStepChange?.(next.currentId)
  }

  const restart = () => {
    const next = startFlowSimulation(nodes, edges)
    setSim(next)
    setDraft("")
    setListOpen(false)
    onStepChange?.(next.currentId)
  }

  const asList =
    lastBot?.stepType === "send_whatsapp_list" ||
    (lastBot?.stepType === "send_whatsapp_interactive" && lastChoices.length > 3)
  const listTitle =
    (lastBot && typeof lastBot.config.header === "string" && lastBot.config.header) ||
    (typeof lastBot?.config.button === "string" && lastBot.config.button) ||
    "Opções"
  const timeoutOut = current?.data.outputs.find((o) => o.key === "timeout")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        showCloseButton={false}
        panelClassName="w-[min(calc(100vw-1rem),340px)] border-0 bg-transparent shadow-none"
        bodyClassName="flex flex-col items-center gap-2 overflow-hidden p-1"
      >
        <DialogTitle className="sr-only">Simular fluxo no WhatsApp</DialogTitle>
        <DialogDescription className="sr-only">
          Percorre o fluxo no mesmo preview do celular. Toque nos botões ou responda para avançar.
        </DialogDescription>

        <WhatsAppPhoneShell
          bizName={bizName}
          bizDetail={channel?.detail}
          time={time}
          onBack={() => onOpenChange(false)}
          overlay={
            listOpen && lastBot ? (
              <WhatsAppListSheet
                title={listTitle}
                sectionTitle={
                  typeof lastBot.config.sectionTitle === "string" ? lastBot.config.sectionTitle : undefined
                }
                choices={lastChoices}
                onClose={() => setListOpen(false)}
                onChoice={pickChoice}
              />
            ) : null
          }
          composer={
            sim.wait === "reply" ? (
              <form
                className="flex shrink-0 items-center gap-1 bg-[#f0f2f5] px-1 py-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  sendReply(draft)
                }}
              >
                <Smile className="h-3.5 w-3.5 text-[#54656f]" />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Mensagem"
                  className="min-w-0 flex-1 rounded-full bg-white px-2 py-1 text-[11px] text-[#111b21] outline-none placeholder:text-[#667781]"
                />
                <button
                  type="submit"
                  className="rounded-full p-1 text-[#008069] disabled:opacity-40"
                  disabled={!draft.trim()}
                  aria-label="Enviar"
                >
                  <SendHorizonal className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : undefined
          }
        >
          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1.5 px-2 py-2">
              <p className="mx-auto w-fit rounded-md bg-white/80 px-1.5 py-0.5 text-[9px] text-[#54656f] shadow-sm">
                Simulação
              </p>
              {sim.events.map((ev) => {
                if (ev.kind === "system") return <SystemChip key={ev.id}>{ev.text}</SystemChip>
                if (ev.kind === "user") {
                  return (
                    <SentBubble key={ev.id} time={ev.time}>
                      <p className="text-[11px] leading-[14px] text-[#111b21]">{ev.text}</p>
                    </SentBubble>
                  )
                }
                const live = lastBot?.id === ev.id && sim.wait === "choice"
                const tpl = detailsMap.get(ev.config.templateName || ev.config.template || "")
                return (
                  <WhatsAppBotBubble
                    key={ev.id}
                    stepType={ev.stepType}
                    config={ev.config}
                    outputs={ev.outputs}
                    cardPreview={ev.preview}
                    tpl={tpl}
                    time={ev.time}
                    interactive={live}
                    onChoice={pickChoice}
                    onOpenList={() => setListOpen(true)}
                  />
                )
              })}
              {sim.wait === "branch" && current && (
                <div className="flex flex-col gap-1">
                  {current.data.outputs.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => pickBranch(o.key, o.label)}
                      className="mx-auto w-fit rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#027eb5] shadow-sm hover:bg-[#f7f8fa]"
                    >
                      {o.label || o.key}
                    </button>
                  ))}
                </div>
              )}
              {sim.wait === "done" && (
                <button
                  type="button"
                  onClick={restart}
                  className="mx-auto mt-1 flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#008069] shadow-sm"
                >
                  <RotateCcw className="h-3 w-3" />
                  Recomeçar
                </button>
              )}
            </div>
          </div>
        </WhatsAppPhoneShell>

        <div className="flex flex-col items-center gap-1">
          <p className="shrink-0 text-center text-[11px] text-white/80">
            {sim.wait === "choice"
              ? asList
                ? "Toque na lista e escolha um item para avançar o fluxo"
                : "Toque num botão para seguir o caminho"
              : sim.wait === "reply"
                ? "Digite a resposta do cliente para continuar"
                : sim.wait === "branch"
                  ? "Escolha o caminho da condição"
                  : "Fim da simulação"}
          </p>
          {timeoutOut && (sim.wait === "reply" || sim.wait === "choice") ? (
            <button
              type="button"
              onClick={() => sendReply("(sem resposta)", "timeout")}
              className="text-[10px] text-white/55 underline-offset-2 hover:underline"
            >
              Simular sem resposta
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
