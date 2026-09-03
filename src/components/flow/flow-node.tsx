"use client"

import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react"
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from "@xyflow/react"
import {
  MessageSquare,
  ArrowRight,
  CircleDot,
  Clock,
  Ban,
  Copy,
  Trash2,
  Square,
  Plus,
  X,
} from "lucide-react"
import {
  ROUTE_META,
  type FlowNodeData,
  type Output,
} from "@/lib/flow-data"
import {
  addInteractiveChoice,
  cardPreview,
  familyAccent,
  nodeFamily,
  outputsFromStepConfig,
  previewPlaceholder,
  remapFlowEdges,
  removeInteractiveChoice,
  renameInteractiveChoice,
  resolveStepType,
} from "@/lib/flow-step-adapter"
import { stepIcon, stepColor } from "@/components/automations/add-step-node"
import {
  getTemplateDetail,
  mergeTemplateQuickReplies,
  useConditionNameLookup,
  useStepTemplateCatalog,
} from "@/components/automations/editor-data"
import { useTriggerNameLookup } from "@/components/automations/trigger-config-fields"
import { summarizeTriggerConfig } from "@/lib/automation-workflow"
import { useLogs } from "./logs-context"
import { NodeConfigPanel } from "./node-config-panel"
import { useVariableTrigger, VariablePickerMenu } from "./flow-variable-picker"
import {
  isWhatsAppPreviewable,
  WhatsAppCustomerPreview,
  WhatsAppPreviewButton,
} from "./whatsapp-customer-preview"

type LogsTab = "entered" | "success" | "alert" | "error"

function OutputIcon({ output }: { output: Output }) {
  const cls = "h-3.5 w-3.5 shrink-0"
  if (output.kind === "response") {
    return <CircleDot className={cls} style={{ color: "var(--route-response)" }} />
  }
  if (output.kind === "error") {
    const Icon = output.key === "timeout" ? Clock : Ban
    return <Icon className={cls} style={{ color: "var(--route-error)" }} />
  }
  return <ArrowRight className={cls} style={{ color: "var(--route-navigation)" }} />
}

function InlineText({
  value,
  onCommit,
  multiline,
  className,
  style,
  placeholder,
}: {
  value: string
  onCommit: (v: string) => void
  multiline?: boolean
  className?: string
  style?: React.CSSProperties
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null)
  const vars = useVariableTrigger(draft, setDraft)

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      ref.current.select()
    }
  }, [editing])

  const commit = useCallback(() => {
    vars.close()
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== value) onCommit(trimmed)
  }, [draft, value, onCommit, vars.close])

  if (editing) {
    const shared = {
      ref: ref as never,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        setDraft(e.target.value)
        vars.refresh(e.target)
      },
      onBlur: () => {
        vars.closeT.current = setTimeout(commit, 160)
      },
      onFocus: () => {
        if (vars.closeT.current) clearTimeout(vars.closeT.current)
      },
      onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) =>
        vars.refresh(e.currentTarget),
      onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        if (vars.open) {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            vars.move(1)
            return
          }
          if (e.key === "ArrowUp") {
            e.preventDefault()
            vars.move(-1)
            return
          }
          if (e.key === "Enter") {
            e.preventDefault()
            vars.applyActive(e.currentTarget)
            return
          }
          if (e.key === "Escape") {
            e.preventDefault()
            vars.close()
            return
          }
        }
        if (e.key === "Enter" && !(multiline && e.shiftKey)) {
          e.preventDefault()
          setEditing(false)
          const trimmed = draft.trim()
          if (trimmed !== value) onCommit(trimmed)
        }
        if (e.key === "Escape") {
          setDraft(value)
          setEditing(false)
        }
      },
      className: `nodrag nopan w-full rounded-md border border-ring bg-background px-1.5 py-1 outline-none ${className ?? ""}`,
      style,
      placeholder,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation()
        vars.refresh(e.currentTarget as HTMLInputElement | HTMLTextAreaElement)
      },
    }
    return (
      <div className="relative w-full">
        {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} type="text" />}
        <VariablePickerMenu
          open={vars.open}
          grouped={vars.grouped}
          filtered={vars.filtered}
          active={vars.active}
          anchor={ref.current}
          onPick={(token) => vars.apply(ref.current, token)}
          onHover={vars.setActive}
        />
      </div>
    )
  }

  return (
    <span
      className={`cursor-text ${className ?? ""}`}
      style={style}
      title="Duplo clique para editar"
      onDoubleClick={(e) => {
        e.stopPropagation()
        setDraft(value)
        setEditing(true)
      }}
    >
      {value || <span className="text-muted-foreground/50">{placeholder}</span>}
    </span>
  )
}

function FlowNodeComponent({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData
  const { updateNodeData, getNode, addNodes, deleteElements, setEdges } = useReactFlow()
  const hasButtons = d.outputs.some((o) => o.kind === "response")
  const updateInternals = useUpdateNodeInternals()
  const logs = useLogs()
  const cardRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const stepType = resolveStepType(d)
  const canAddChoice =
    stepType === "send_whatsapp_interactive" ||
    stepType === "send_whatsapp_list" ||
    stepType === "question"
  const family = nodeFamily(stepType)
  const isMilestone =
    stepType === "trigger" ||
    stepType === "condition" ||
    stepType === "transfer_automation" ||
    stepType === "finish" ||
    stepType === "stop_automation"
  const accent =
    stepType === "transfer_automation"
      ? { color: "var(--brand-primary)", tint: "color-mix(in oklch, var(--brand-primary) 18%, white)" }
      : familyAccent(family)
  const Icon = stepIcon[stepType] ?? MessageSquare
  const iconClass = stepColor[stepType] ?? "text-[var(--text-muted)]"
  const triggerLookup = useTriggerNameLookup()
  const conditionLookup = useConditionNameLookup()
  const nameLookup = { ...triggerLookup, ...conditionLookup }
  const isTemplateCard = stepType === "send_whatsapp_template"
  const { detailsMap: tplMap } = useStepTemplateCatalog(d.config ?? {}, undefined, {
    enabled: isTemplateCard,
  })
  const tplName = String(d.config?.templateName ?? d.config?.template ?? "")
  const tplLang = String(d.config?.languageCode ?? d.config?.idioma ?? "")
  const tplDetail = isTemplateCard ? getTemplateDetail(tplMap, tplName, tplLang) : undefined
  const isTriggerCard = stepType === "trigger" || d.kind === "trigger"

  useEffect(() => {
    if (!isTemplateCard || !tplDetail) return
    const cfg = (d.config ?? {}) as Record<string, unknown>
    const prev = Array.isArray(cfg.buttons)
      ? (cfg.buttons as { title?: string; text?: string; gotoStepId?: string }[])
      : []
    const desired = mergeTemplateQuickReplies(prev, tplDetail.quickReplies)
    const buttonsSame =
      desired.length === prev.length &&
      desired.every(
        (b, i) =>
          b.title === String(prev[i]?.title ?? prev[i]?.text ?? "") &&
          (b.gotoStepId ?? "") === String(prev[i]?.gotoStepId ?? ""),
      )
    const bodySame = String(cfg.bodyPreview ?? "") === tplDetail.bodyPreview
    const langSame = !tplDetail.language || String(cfg.languageCode ?? "") === tplDetail.language
    if (buttonsSame && bodySame && langSame) return
    const nextCfg = {
      ...cfg,
      buttons: desired,
      bodyPreview: tplDetail.bodyPreview,
      ...(tplDetail.language ? { languageCode: tplDetail.language } : {}),
    }
    const outputs = outputsFromStepConfig(stepType, nextCfg, d.outputs)
    updateNodeData(id, { config: nextCfg, outputs })
    setEdges((eds) => remapFlowEdges(eds, [{ id, data: { ...d, config: nextCfg, outputs } }]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTemplateCard, tplName, tplDetail, id])
  const preview = isTriggerCard
    ? summarizeTriggerConfig(String(d.triggerType ?? ""), d.config ?? {}, nameLookup)
    : cardPreview(d, nameLookup)
  const isFinish = family === "finish"

  useLayoutEffect(() => {
    updateInternals(id)
  }, [id, selected, d.outputs.length, d.outputs.map((o) => o.key).join(), d.preview, updateInternals])

  useEffect(() => {
    const el = cardRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => updateInternals(id))
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, updateInternals])

  const duplicate = useCallback(() => {
    const node = getNode(id)
    if (!node) return
    addNodes({
      ...node,
      id: `copy-${Date.now()}`,
      position: { x: node.position.x + 48, y: node.position.y + 48 },
      selected: false,
      data: { ...node.data },
    })
  }, [id, getNode, addNodes])

  const remove = useCallback(() => {
    deleteElements({ nodes: [{ id }] })
  }, [id, deleteElements])

  const openLogs = useCallback(
    (initialTab: LogsTab) => {
      logs?.openLogs({
        nodeId: id,
        title: d.title,
        ref: d.ref,
        initialTab,
      })
    },
    [logs, id, d.title, d.ref],
  )

  const setOutputLabel = useCallback(
    (key: string, label: string) => {
      if (key.startsWith("branch:")) {
        const bid = key.slice("branch:".length)
        const branches = Array.isArray(d.config?.branches) ? d.config.branches : []
        updateNodeData(id, {
          outputs: d.outputs.map((o) => (o.key === key ? { ...o, label } : o)),
          config: {
            ...d.config,
            branches: branches.map((b) => {
              const rec = b && typeof b === "object" ? (b as Record<string, unknown>) : {}
              return rec.id === bid ? { ...rec, label } : b
            }),
          },
        })
        return
      }
      if (key.startsWith("option:")) {
        const oid = key.slice("option:".length)
        const options = Array.isArray(d.config?.options) ? d.config.options : []
        const next = {
          ...d.config,
          options: options.map((b) => {
            const rec = b && typeof b === "object" ? (b as Record<string, unknown>) : {}
            return rec.id === oid ? { ...rec, label } : b
          }),
        }
        updateNodeData(id, {
          config: next,
          outputs: outputsFromStepConfig(stepType, next as Record<string, unknown>, d.outputs),
        })
        return
      }
      if (key.startsWith("btn_")) {
        const next = renameInteractiveChoice(stepType, d.config ?? {}, key, label)
        updateNodeData(id, {
          config: next,
          outputs: outputsFromStepConfig(stepType, next as Record<string, unknown>, d.outputs),
        })
        return
      }
      updateNodeData(id, {
        outputs: d.outputs.map((o) => (o.key === key ? { ...o, label } : o)),
      })
    },
    [id, d.outputs, d.config, stepType, updateNodeData],
  )

  const addButton = useCallback(() => {
    const next = addInteractiveChoice(stepType, d.config ?? {})
    updateNodeData(id, {
      config: next,
      outputs: outputsFromStepConfig(stepType, next as Record<string, unknown>, d.outputs),
    })
  }, [id, d.config, d.outputs, stepType, updateNodeData])

  const removeOutput = useCallback(
    (key: string) => {
      const next = removeInteractiveChoice(stepType, d.config ?? {}, key)
      updateNodeData(id, {
        config: next,
        outputs: outputsFromStepConfig(stepType, next as Record<string, unknown>, d.outputs),
      })
      setEdges((eds) => eds.filter((e) => !(e.source === id && e.sourceHandle === key)))
    },
    [id, d.config, d.outputs, stepType, updateNodeData, setEdges],
  )

  return (
    <div
      ref={cardRef}
      className={`flow-card group relative w-[320px] rounded-xl border border-t-4 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.06)] transition-shadow duration-200 hover:shadow-[0_4px_14px_rgba(15,23,42,0.10)] ${
        selected ? "shadow-[0_4px_16px_rgba(15,23,42,0.12)]" : ""
      }`}
      {...(isTriggerCard ? { "data-tour": "builder-node" } : {})}
      style={{
        borderColor: isMilestone ? accent.color : "#E2E8F0",
        borderTopColor: accent.color,
        backgroundColor: isMilestone ? accent.color : "#ffffff",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={`!h-2.5 !w-2.5 !border-2 ${isMilestone ? "!border-white" : "!border-[var(--color-bg-card)]"}`}
        style={{ backgroundColor: isMilestone ? "#ffffff" : accent.color, top: 34 }}
      />

      <div className="flex items-center gap-2 p-3.5 pt-4">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
            isMilestone ? "text-white" : iconClass
          }`}
          style={{ backgroundColor: isMilestone ? "rgba(255,255,255,0.22)" : accent.tint }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <InlineText
          value={d.title}
          onCommit={(v) => updateNodeData(id, { title: v })}
          className={`flex-1 text-sm font-bold ${isMilestone ? "text-white" : "text-card-foreground"}`}
          placeholder="Sem título"
        />
        <div
          className={`nodrag flex shrink-0 items-center gap-0.5 transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          {...(isTriggerCard ? { "data-tour": "builder-node-actions" } : {})}
        >
          {isWhatsAppPreviewable(stepType) && (
            <WhatsAppPreviewButton onClick={() => setPreviewOpen(true)} />
          )}
          <button
            type="button"
            aria-label="Duplicar passo"
            title="Duplicar"
            onClick={(e) => {
              e.stopPropagation()
              duplicate()
            }}
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              isMilestone
                ? "text-white/80 hover:bg-white/15 hover:text-white"
                : "text-muted-foreground hover:bg-muted hover:text-card-foreground"
            }`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Excluir passo"
            title="Excluir"
            onClick={(e) => {
              e.stopPropagation()
              remove()
            }}
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              isMilestone
                ? "text-white/80 hover:bg-black/15 hover:text-white"
                : "text-muted-foreground hover:bg-[color-mix(in_oklch,var(--route-error)_15%,transparent)] hover:text-[var(--route-error)]"
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ${
            isMilestone ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
          }`}
        >
          #{d.ref}
        </span>
      </div>

      <div
        className={`px-3.5 pb-2 text-[13px] leading-relaxed ${
          isMilestone ? "text-white/80" : "text-muted-foreground"
        }`}
      >
        {isTriggerCard ||
        stepType === "send_product" ||
        stepType === "assign_owner" ||
        stepType === "transfer_automation" ||
        stepType === "condition" ||
        stepType === "move_stage" ||
        stepType === "mark_deal_won" ||
        stepType === "mark_deal_lost" ||
        stepType === "transfer_department" ||
        stepType === "add_tag" ||
        stepType === "remove_tag" ||
        stepType === "update_field" ||
        stepType === "create_deal" ||
        stepType === "create_activity" ||
        stepType === "tabulate_conversation" ||
        stepType === "ask_ai_agent" ||
        stepType === "transfer_to_ai_agent" ||
        stepType === "execute_distribution" ? (
          <span className="block leading-relaxed">
            {preview || (
              <span className={isMilestone ? "text-white/50" : "text-muted-foreground/50"}>
                {previewPlaceholder(stepType)}
              </span>
            )}
          </span>
        ) : (
          <InlineText
            value={preview}
            onCommit={(v) => {
              const key =
                stepType === "question"
                  ? "message"
                  : stepType === "send_whatsapp_interactive" || stepType === "send_whatsapp_list"
                    ? "body"
                    : "content"
              updateNodeData(id, { preview: v, config: { ...d.config, [key]: v } })
            }}
            multiline
            className="block leading-relaxed"
            placeholder={previewPlaceholder(stepType)}
          />
        )}
        {isWhatsAppPreviewable(stepType) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setPreviewOpen(true)
            }}
            className="nodrag mt-1.5 text-[11px] font-semibold text-[#008069] hover:underline"
          >
            Ver como o cliente recebe
          </button>
        )}
      </div>

      {selected && isTriggerCard && <NodeConfigPanel id={id} data={d} />}

      {d.outputs.length > 0 && (
        <div
          className="mt-3 flex flex-col border-t"
          style={{ borderColor: isMilestone ? "rgba(255,255,255,0.22)" : "#E2E8F0" }}
        >
          {d.outputs.map((o, i) => {
            const responseCount = d.outputs.filter((x) => x.kind === "response").length
            const maxChoices = 10
            const showAdd =
              canAddChoice &&
              responseCount < maxChoices &&
              ((o.kind === "response" && d.outputs[i + 1]?.kind !== "response") ||
                (!hasButtons && i === 0))
            return (
              <div key={o.key}>
                <div
                  className="relative flex items-center gap-2 border-b px-3.5 py-1.5"
                  {...(isTriggerCard && i === 0
                    ? { "data-tour": "builder-node-connect" }
                    : {})}
                  style={{
                    borderColor: isMilestone ? "rgba(255,255,255,0.22)" : "#E2E8F0",
                    backgroundColor: isMilestone ? "rgba(0,0,0,0.08)" : undefined,
                  }}
                >
                  <OutputIcon output={o} />
                  <div className="flex min-w-0 flex-1 items-center justify-end gap-1 text-right text-[12px] leading-tight">
                    {o.key === "else" ? (
                      <span
                        className="inline-block max-w-full font-medium"
                        style={{ color: isMilestone ? "rgba(255,255,255,0.92)" : "var(--route-error)" }}
                      >
                        {o.label || "Senão"}
                      </span>
                    ) : (
                    <InlineText
                      value={o.label}
                      onCommit={(v) => setOutputLabel(o.key, v)}
                      className="inline-block max-w-full text-right"
                      style={{
                        color: isMilestone
                          ? "rgba(255,255,255,0.92)"
                          : o.kind === "error"
                            ? "var(--route-error)"
                            : o.kind === "response"
                              ? "var(--card-foreground)"
                              : "var(--muted-foreground)",
                        fontWeight: o.kind === "response" ? 700 : 400,
                      }}
                      placeholder="Rótulo"
                    />
                    )}
                    {o.kind === "response" && (
                      <button
                        type="button"
                        aria-label="Remover botão"
                        title="Remover botão"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeOutput(o.key)
                        }}
                        className="nodrag nopan shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <Handle
                    id={o.key}
                    type="source"
                    position={Position.Right}
                    className={`!h-3 !w-3 !border-2 ${isMilestone ? "!border-white" : "!border-[var(--color-bg-card)]"}`}
                    style={{
                      backgroundColor: isMilestone ? "#ffffff" : ROUTE_META[o.kind].color,
                      right: -6,
                      cursor: "crosshair",
                    }}
                  />
                </div>
                {showAdd && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      addButton()
                    }}
                    className="nodrag nopan flex w-full items-center justify-center gap-1 border-b border-[#E2E8F0] px-3.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-[#F8FAFC] hover:text-card-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    {stepType === "send_whatsapp_interactive" && responseCount >= 3
                      ? "Opção (lista)"
                      : "Botão"}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected && !isTriggerCard && <NodeConfigPanel id={id} data={d} />}

      <div
        className="flex items-center justify-around gap-2 rounded-b-xl border-t border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-center"
        {...(isTriggerCard ? { "data-tour": "builder-node-stats" } : {})}
      >
        <Stat value={d.stats.sucessos} label="Sucessos" color="var(--route-response)" onClick={() => openLogs("success")} />
        <Stat value={d.stats.alertas} label="Alertas" color="var(--topic-documentos)" onClick={() => openLogs("alert")} />
        <Stat value={d.stats.erros} label="Erros" color="var(--route-error)" onClick={() => openLogs("error")} />
      </div>

      {isFinish && (
        <span className="pointer-events-none absolute -right-1 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-card">
          <Square className="h-3.5 w-3.5" style={{ color: accent.color }} />
        </span>
      )}

      {isWhatsAppPreviewable(stepType) && (
        <WhatsAppCustomerPreview
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          stepType={stepType}
          config={d.config ?? {}}
          outputs={d.outputs}
          cardPreview={d.preview}
        />
      )}
    </div>
  )
}

function Stat({
  value,
  label,
  color,
  onClick,
}: {
  value: number
  label: string
  color: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className="nodrag flex flex-1 flex-col items-center rounded-lg py-1 transition-colors hover:bg-muted"
      title={`Ver logs de ${label.toLowerCase()}`}
    >
      <span className="text-sm font-semibold" style={{ color }}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </button>
  )
}

export const FlowNode = memo(FlowNodeComponent)
