"use client"

import { useMemo, useCallback, useEffect } from "react"
import { useReactFlow, useNodes, type Node } from "@xyflow/react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DropdownGlass } from "@/components/crm/dropdown-glass"
import { type FlowNodeData, type NodeConfig } from "@/lib/flow-data"
import {
  firstMessageChannel,
  migrateConditionNode,
  outputsFromStepConfig,
  rememberFlowDefaultChannel,
  remapFlowEdges,
  resolveStepType,
} from "@/lib/flow-step-adapter"
import {
  defaultTriggerConfig,
  stepTypeLabel,
  summarizeStepConfig,
  summarizeTriggerConfig,
  triggerBindsInboundChannel,
  triggerTypeLabel,
} from "@/lib/automation-workflow"
import {
  TriggerConfigFields,
  TriggerTypeSelect,
  useTriggerNameLookup,
} from "@/components/automations/trigger-config-fields"
import { STEP_FIELDS, type EditorField } from "@/components/automations/editor-fields"
import { NodeConfigEditor } from "@/components/automations/inline-editor"
import {
  useAiAgentOptions,
  useConditionNameLookup,
  useDepartmentOptions,
  useUserOptions,
} from "@/components/automations/editor-data"
import { isTabulationArchetype } from "@/lib/ai-agents/archetypes"
import { FlowConditionConfig } from "./flow-condition-config"
import { FlowRoundRobinConfig } from "./flow-round-robin-config"
import { cn } from "@/lib/utils"

const HIDE_EDITOR_KEYS = new Set([
  "timeoutGotoStepId",
  "failureGotoStepId",
  "elseGotoStepId",
  "elseStepId",
  "receivedGotoStepId",
  "timeoutAction",
  "failureAction",
  "languageCode",
])

const CUSTOM_STEP_TYPES = new Set(["assign_owner", "condition", "round_robin"])

function fieldsForFlow(stepType: string, cfg?: Record<string, unknown>): EditorField[] | null {
  const raw = STEP_FIELDS[stepType]
  if (!raw) return null
  const next = raw.filter((f) => {
    if (f.kind === "step") return false
    if (f.kind === "builder" && f.builder === "condition") return false
    if ("key" in f && HIDE_EDITOR_KEYS.has(f.key)) return false
    if ((f.kind === "textarea" || f.kind === "text") && "key" in f && (f.key === "content" || f.key === "body" || f.key === "message")) {
      return false
    }
    if (
      stepType === "execute_distribution" &&
      cfg?.mode === "leads" &&
      "key" in f &&
      (f.key === "departmentIds" || f.key === "distributionType")
    ) {
      return false
    }
    return true
  })
  return next.length > 0 ? next : null
}

type NodeOption = { id: string; ref: number; title: string }

/**
 * Painel de configuração INLINE no card selecionado.
 * O formulário segue o `stepType` real — não o kind visual genérico.
 */
export function NodeConfigPanel({ id, data }: { id: string; data: FlowNodeData }) {
  const { updateNodeData, setEdges } = useReactFlow()
  const allNodes = useNodes<Node<FlowNodeData>>()

  const cfg = data.config ?? {}
  const stepType = resolveStepType(data)
  const triggerType = String(
    data.triggerType ??
      allNodes.find((n) => n.data.kind === "trigger")?.data.triggerType ??
      "",
  )
  const isTrigger = data.kind === "trigger" || stepType === "trigger"
  const inboundBound = triggerBindsInboundChannel(triggerType)
  const isCondition = stepType === "condition"
  const isRoundRobin = stepType === "round_robin"
  const catalogFields = !CUSTOM_STEP_TYPES.has(stepType) && !isTrigger ? fieldsForFlow(stepType, cfg as Record<string, unknown>) : null
  const { firstId, channelId: inheritedChannelId } = firstMessageChannel(allNodes)
  const isFirstMessageStep = id === firstId
  const isFinish = (stepType === "finish" || stepType === "stop_automation") && !catalogFields
  const isAssignOwner = stepType === "assign_owner"
  const { options: userOptions, isLoading: loadingUsers } = useUserOptions()
  const { records: agentRecords, isLoading: loadingAgents } = useAiAgentOptions("userId")
  const { options: deptOptions, isLoading: loadingDepts } = useDepartmentOptions()
  const triggerLookup = useTriggerNameLookup()
  const conditionLookup = useConditionNameLookup()
  const nameLookup = useMemo(
    () => ({ ...triggerLookup, ...conditionLookup }),
    [triggerLookup, conditionLookup],
  )

  useEffect(() => {
    if (isTrigger) return
    const migrated = isCondition ? migrateConditionNode(data) : data
    const outputs = outputsFromStepConfig(stepType, (migrated.config ?? {}) as Record<string, unknown>, migrated.outputs)
    const same =
      outputs.length === data.outputs.length &&
      outputs.every((o, i) => o.key === data.outputs[i]?.key)
    if (same && migrated === data) return
    updateNodeData(id, { config: migrated.config, outputs })
    setEdges((eds) => remapFlowEdges(eds, [{ id, data: { ...migrated, outputs } }]))
    // só na abertura do painel / troca de tipo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, stepType])

  const targetOptions = useMemo<NodeOption[]>(
    () =>
      allNodes
        .filter((n) => n.id !== id)
        .map((n) => ({ id: n.id, ref: n.data.ref, title: n.data.title })),
    [allNodes, id],
  )

  const commitConfig = useCallback(
    (next: NodeConfig) => {
      const nextMode = (next as Record<string, unknown>).mode
      updateNodeData(id, {
        config: next,
        outputs: outputsFromStepConfig(stepType, next as Record<string, unknown>, data.outputs),
        preview: summarizeStepConfig(stepType, next, nameLookup),
        ...(stepType === "execute_distribution"
          ? {
              title:
                nextMode === "leads"
                  ? "Distribuição por Leads"
                  : stepTypeLabel(stepType),
            }
          : {}),
      })
    },
    [id, stepType, data.outputs, nameLookup, updateNodeData],
  )

  const commitTriggerType = useCallback(
    (nextType: string) => {
      if (!nextType || nextType === triggerType) return
      const prev = (data.config ?? {}) as Record<string, unknown>
      const nextConfig: Record<string, unknown> = { ...defaultTriggerConfig(nextType) }
      if (prev.__rfPos !== undefined) nextConfig.__rfPos = prev.__rfPos
      if (prev.__entryDisconnected === true) nextConfig.__entryDisconnected = true
      updateNodeData(id, {
        triggerType: nextType,
        title: triggerTypeLabel(nextType),
        config: nextConfig as NodeConfig,
        preview: summarizeTriggerConfig(nextType, nextConfig, triggerLookup),
      })
    },
    [id, triggerType, data.config, triggerLookup, updateNodeData],
  )

  useEffect(() => {
    if (!isTrigger || !triggerType) return
    const next = summarizeTriggerConfig(triggerType, cfg, nameLookup)
    if (next !== data.preview) updateNodeData(id, { preview: next })
  }, [isTrigger, triggerType, cfg, nameLookup, data.preview, id, updateNodeData])

  useEffect(() => {
    if (!isCondition) return
    const next = summarizeStepConfig("condition", cfg, nameLookup)
    if (next !== data.preview) updateNodeData(id, { preview: next })
  }, [isCondition, cfg, nameLookup, data.preview, id, updateNodeData])

  return (
    <div
      className={cn(
        "nodrag nopan cursor-default border-t border-border bg-[var(--color-bg-card)] px-3.5 py-4",
        isTrigger && "[&_label]:text-xs",
      )}
    >
      {isTrigger ? (
        <div className="space-y-4">
          <TriggerTypeSelect value={triggerType} onChange={commitTriggerType} />
          {triggerType ? (
            <TriggerConfigFields
              stacked
              triggerType={triggerType}
              value={cfg as Record<string, unknown>}
              onChange={(next) => {
                updateNodeData(id, {
                  config: next as NodeConfig,
                  preview: summarizeTriggerConfig(triggerType, next, triggerLookup),
                })
              }}
            />
          ) : null}
        </div>
      ) : null}

      {isCondition && <FlowConditionConfig cfg={cfg} onChange={commitConfig} />}

      {isRoundRobin && <FlowRoundRobinConfig cfg={cfg} onChange={commitConfig} />}

      {catalogFields && (
        <div className="ds-flow ds-flow--node-inline">
          <NodeConfigEditor
            stepType={stepType}
            fields={catalogFields}
            hideStepTargets
            isFirstMessageStep={isFirstMessageStep}
            inheritedChannelId={inboundBound || isFirstMessageStep ? undefined : inheritedChannelId}
            bindToInbound={inboundBound}
            config={cfg as Record<string, unknown>}
            steps={targetOptions.map((n) => ({ value: n.id, label: `#${n.ref} · ${n.title}` }))}
            onChange={(next) => {
              if (!inboundBound && typeof next.channelId === "string") {
                rememberFlowDefaultChannel(next.channelId)
              }
              commitConfig(next as NodeConfig)
            }}
          />
        </div>
      )}

      {isAssignOwner && (
        <AssignOwnerFields
          cfg={cfg}
          onChange={(patch) => commitConfig({ ...cfg, ...patch })}
          users={userOptions}
          agents={agentRecords}
          departments={deptOptions}
          loading={loadingUsers || loadingDepts || loadingAgents}
        />
      )}

      {(stepType === "move_stage" || stepType === "mark_deal_won" || stepType === "mark_deal_lost") && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-border px-2.5 py-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--brand-primary)]"
            checked={cfg.continueIfNoDeal === true}
            onChange={(e) => commitConfig({ ...cfg, continueIfNoDeal: e.target.checked })}
          />
          <span>
            <span className="font-medium">Continuar se não houver negócio aberto</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Sem isso, o fluxo para quando o contato não tem negócio.
            </span>
          </span>
        </label>
      )}

      {isFinish && (
        <p className="text-[13px] text-muted-foreground">
          Este passo encerra o fluxo. Não há saídas adicionais.
        </p>
      )}
    </div>
  )
}


const DEPT_PREFIX = "dept:"
const ASSIGN_TARGETS = [
  { value: "deal", label: "Atribuir ao negócio" },
  { value: "contact", label: "Atribuir ao contato" },
  { value: "conversation", label: "Atribuir à conversa" },
] as const

function AssignOwnerFields({
  cfg,
  onChange,
  users,
  agents,
  departments,
  loading,
}: {
  cfg: NodeConfig
  onChange: (patch: Partial<NodeConfig>) => void
  users: { value: string; label: string }[]
  agents: { userId: string; name: string; active?: boolean; archetype?: string }[]
  departments: { value: string; label: string }[]
  loading: boolean
}) {
  const assignAll = Boolean(cfg.assignAll || cfg.assignTo === "all" || cfg.target === "all" || cfg.target === "both")
  const target = assignAll
    ? "all"
    : cfg.assignTo === "contact" || cfg.assignTo === "conversation"
      ? cfg.assignTo
      : cfg.target === "contact" || cfg.target === "conversation"
        ? cfg.target
        : "deal"
  const selected = cfg.departmentId
    ? `${DEPT_PREFIX}${cfg.departmentId}`
    : (cfg.userId ?? "")
  const assignableAgents = agents.filter(
    (a) =>
      a.active !== false &&
      a.userId &&
      (!isTabulationArchetype(a.archetype) || a.userId === selected),
  )

  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Responsável</Label>
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : (
          <DropdownGlass
            triggerClassName="w-full"
            searchable
            searchPlaceholder="Buscar departamento, usuário ou agente…"
            placeholder="Selecione…"
            value={selected}
            options={[
              { value: "", label: "Sem responsável (limpar)", description: "Desatribuir" },
              ...departments.map((d) => ({
                value: `${DEPT_PREFIX}${d.value}`,
                label: d.label,
                description: "Departamentos",
                searchText: d.label,
              })),
              ...users.map((u) => ({
                value: u.value,
                label: u.label,
                description: "Usuários",
                searchText: u.label,
              })),
              ...assignableAgents.map((a) => ({
                value: a.userId,
                label: `🤖 ${a.name}`,
                description: "Agentes IA",
                searchText: a.name,
              })),
            ]}
            onValueChange={(v) => {
              if (!v) {
                onChange({
                  userId: "",
                  userLabel: "",
                  userType: "HUMAN",
                  departmentId: undefined,
                  departmentName: undefined,
                })
                return
              }
              if (v.startsWith(DEPT_PREFIX)) {
                const id = v.slice(DEPT_PREFIX.length)
                const dept = departments.find((d) => d.value === id)
                onChange({
                  departmentId: id,
                  departmentName: dept?.label,
                  userId: "",
                  userLabel: "",
                  userType: "HUMAN",
                })
                return
              }
              const agent = assignableAgents.find((a) => a.userId === v)
              if (agent) {
                onChange({
                  userId: agent.userId,
                  userLabel: agent.name,
                  userType: "AI",
                  departmentId: undefined,
                  departmentName: undefined,
                  // Deal + contato + conversa: o nome aparece no inbox e no
                  // kanban, igual a um consultor.
                  target: "both",
                  assignAll: true,
                  assignTo: "all",
                })
                return
              }
              const user = users.find((u) => u.value === v)
              onChange({
                userId: v,
                userLabel: user?.label,
                userType: "HUMAN",
                departmentId: undefined,
                departmentName: undefined,
              })
            }}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Aplicar em</Label>
        <div className="flex flex-col gap-1">
          {ASSIGN_TARGETS.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]",
                assignAll ? "cursor-not-allowed text-muted-foreground" : "text-foreground hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="assign-target"
                className="accent-[var(--brand-primary)]"
                disabled={assignAll}
                checked={!assignAll && target === opt.value}
                onChange={() =>
                  onChange({
                    assignTo: opt.value,
                    assignAll: false,
                    target: opt.value === "conversation" ? "contact" : opt.value,
                  })
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-2.5 py-2 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 accent-[var(--brand-primary)]"
          checked={assignAll}
          onChange={(e) =>
            onChange({
              assignAll: e.target.checked,
              assignTo: e.target.checked ? "all" : "deal",
              target: e.target.checked ? "both" : "deal",
            })
          }
        />
        <span>
          <span className="font-medium">Atribuir a todas as entidades</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Aplica em negócio, contato e conversa ao mesmo tempo.
          </span>
        </span>
      </label>
    </section>
  )
}
