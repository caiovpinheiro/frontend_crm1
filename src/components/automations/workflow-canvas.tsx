"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./flow-editor.css";

import { AnimatedEdge, AnimatedEdgeDefs, type AnimatedEdgeData } from "./animated-edge";
import { FlowCanvasToolbar } from "./flow-canvas-toolbar";
import { useFlowClipboard } from "./use-flow-clipboard";

import {
  type AutomationStep,
  defaultStepConfig,
  findFirstMessageStepIndex,
  inheritedChannelFromTrigger,
  isStepIncomplete,
  newStepId,
  stepTypeLabel,
  summarizeStepConfig,
  summarizeTriggerConfig,
  triggerBindsInboundChannel,
  triggerTypeLabel,
} from "@/lib/automation-workflow";
import { ALIGN_TRIGGER_POS, estimateStepNodeSize } from "@/lib/automation-layout";
import { useConnectedStepChannels } from "./step-channel-picker";
import {
  normalizeConditionConfig,
  type ConditionConfig,
} from "@/lib/automation-condition";
import {
  normalizeRoundRobinConfig,
  type RoundRobinConfig,
} from "@/lib/automation-round-robin";
import { cn } from "@/lib/utils";
import { useThemeV2 } from "@/hooks/use-theme-v2";
import { IconCopy as Copy, IconPlus as Plus, IconTrash as Trash2 } from "@tabler/icons-react";

import type { ActionStepType } from "@/lib/automation-workflow";

import { ActionNode } from "./action-node";
import { AddStepNode } from "./add-step-node";
import { BusinessHoursNode } from "./business-hours-node";
import { CheckAgentStatusNode } from "./check-agent-status-node";
import { DistributionNode } from "./distribution-node";
import { StepPickerModal } from "./step-picker-modal";
import { ConditionNode } from "./condition-node";
import { RoundRobinNode } from "./round-robin-node";
import { DelayNode } from "./delay-node";
import { FinishNode } from "./finish-node";
import { GotoNode } from "./goto-node";
import { InteractiveNode } from "./interactive-node";
import { NodePaletteDrawer } from "./node-palette-drawer";
import { readPaletteDragType } from "./node-palette";
import { QuestionNode } from "./question-node";
import { WaitNode } from "./wait-node";
import { TriggerNode } from "./trigger-node";
import { VariableNode } from "./variable-node";

const TRIGGER_ID = "trigger";
/** Zoom ao abrir: gatilho no centro, com folga (fitView sem teto chegava perto demais). */
const OPEN_VIEW_ZOOM = 0.65;

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  roundRobin: RoundRobinNode,
  businessHours: BusinessHoursNode,
  checkAgentStatus: CheckAgentStatusNode,
  distribution: DistributionNode,
  delay: DelayNode,
  question: QuestionNode,
  interactive: InteractiveNode,
  wait: WaitNode,
  variable: VariableNode,
  goto: GotoNode,
  finish: FinishNode,
  addStep: AddStepNode,
};

const edgeTypes = {
  flow: AnimatedEdge,
};

type RfPos = { x: number; y: number };

const START_X = 200;
const NODE_Y = 300;
// Espelha `GAP_X` de `@/lib/automation-layout` — nós expandidos (~400px)
// precisam de folga maior que 300 pra não cobrir o próximo step.
const GAP_X = 480;

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readRfPos(config: unknown): RfPos | null {
  if (typeof config !== "object" || config === null) return null;
  const c = config as Record<string, unknown>;
  if (typeof c.__rfPos !== "object" || c.__rfPos === null) return null;
  const p = c.__rfPos as Record<string, unknown>;
  const x = asFiniteNumber(p.x);
  const y = asFiniteNumber(p.y);
  if (x == null || y == null) return null;
  return { x, y };
}

/** Dimensões iniciais p/ fitView não pular nós ainda não medidos. */
function withFitSize(node: Node, width: number, height: number): Node {
  return {
    ...node,
    initialWidth: width,
    initialHeight: height,
  };
}

function rfNodeType(stepType: string): keyof typeof nodeTypes {
  if (stepType === "condition") return "condition";
  if (stepType === "round_robin") return "roundRobin";
  if (stepType === "business_hours") return "businessHours";
  if (stepType === "check_agent_status") return "checkAgentStatus";
  if (stepType === "execute_distribution") return "distribution";
  if (stepType === "delay") return "delay";
  if (stepType === "question") return "interactive";
  if (stepType === "send_whatsapp_interactive") return "interactive";
  if (stepType === "send_whatsapp_list") return "interactive";
  if (stepType === "wait_for_reply") return "wait";
  if (stepType === "set_variable") return "variable";
  if (stepType === "goto") return "goto";
  if (stepType === "finish") return "finish";
  if (stepType === "stop_automation") return "finish";
  return "action";
}

function isInteractiveStep(step: { type: string; config?: unknown }): boolean {
  const t = step.type;
  if (
    t === "question" ||
    t === "send_whatsapp_interactive" ||
    t === "send_whatsapp_list"
  ) {
    return true;
  }
  // Template WhatsApp vira nó interativo (1 handle por botão, arraste pra
  // conectar — estilo Kommo) SÓ quando tem botões de resposta rápida. Sem
  // botões, segue como envio linear simples.
  if (t === "send_whatsapp_template") {
    const cfg = step.config as Record<string, unknown> | undefined;
    return Array.isArray(cfg?.buttons) && (cfg!.buttons as unknown[]).length > 0;
  }
  return false;
}

/** Botões (interactive/question) ou rows (lista WhatsApp). */
function interactiveChoiceItems(
  stepType: string,
  cfg: Record<string, unknown>,
): Record<string, unknown>[] {
  if (stepType === "send_whatsapp_list") {
    return Array.isArray(cfg.rows) ? (cfg.rows as Record<string, unknown>[]) : [];
  }
  return Array.isArray(cfg.buttons) ? (cfg.buttons as Record<string, unknown>[]) : [];
}

function interactiveChoiceKey(stepType: string): "buttons" | "rows" {
  return stepType === "send_whatsapp_list" ? "rows" : "buttons";
}

const ADD_STEP_ID = "__addStep__";

/**
 * Steps que NUNCA recebem o botão "+ Adicionar próximo passo" depois
 * deles porque encerram o fluxo.
 */
const TERMINAL_STEP_TYPES = new Set([
  "goto",
  "finish",
  "stop_automation",
  "transfer_automation",
]);

/**
 * Steps que ramificam — não usam `nextStepId` raiz. O operador conecta
 * cada saída pelos handles laterais (received/timeout/else/branch:X/btn_X).
 * Não pendurar addStepNode global aqui evita botão "+" fantasma sem
 * destino claro de qual ramo seria continuado.
 */
const BRANCHING_STEP_TYPES = new Set([
  "condition",
  "round_robin",
  "wait_for_reply",
  "business_hours",
  "check_agent_status",
  "question",
  "send_whatsapp_interactive",
  "send_whatsapp_list",
]);

function isAddStepNodeId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id === ADD_STEP_ID || id.startsWith(`${ADD_STEP_ID}:`);
}

function isAddStepEdgeId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id === "addstep-edge" || id.startsWith("addstep-edge-");
}

/**
 * Folhas do grafo que precisam do botão "+ Adicionar próximo passo".
 * Critério: step linear (não-terminal, não-ramificador) cujo `nextStepId`
 * está vazio ou aponta pra step inexistente. Antes só dávamos o botão pro
 * último step do array linear, deixando ramos paralelos (ex: timeout do
 * wait_for_reply) órfãos visualmente — operadores sabiam soltar um drag
 * no canvas, mas nada na UI sugeria que dava pra continuar.
 */
function collectLeafStepIds(steps: AutomationStep[]): Set<string> {
  const stepIds = new Set(steps.map((s) => s.id));
  const leaves = new Set<string>();
  for (const step of steps) {
    if (TERMINAL_STEP_TYPES.has(step.type)) continue;
    // Interactive tem handles por opção (+ next/else/timeout) e onConnectEnd
    // ao arrastar do handle — não recebe a pílula "+ Adicionar próximo passo"
    // (evita aresta fantasma pontilhada sem sourceHandle).
    if (isInteractiveStep(step)) continue;
    if (BRANCHING_STEP_TYPES.has(step.type)) continue;
    const next = readNextStepId(step.config);
    const hasRealNext = next && next !== NONE && stepIds.has(next);
    if (!hasRealNext) leaves.add(step.id);
  }
  return leaves;
}

/**
 * EDGE_TYPE — todas as conexões usam o custom <AnimatedEdge> registrado
 * em `edgeTypes`. Substitui o `smoothstep` cinza chapado por curva
 * Bezier brand com pulso elétrico. Variantes ditadas via `data`.
 */
const EDGE_TYPE = "flow" as const;

const EDGE_DATA_DEFAULT: AnimatedEdgeData = { variant: "default", energized: true };
const EDGE_DATA_BUTTON: AnimatedEdgeData = { variant: "button", energized: true };
const EDGE_DATA_ELSE: AnimatedEdgeData = { variant: "else", energized: false };
const EDGE_DATA_TIMEOUT: AnimatedEdgeData = { variant: "timeout", energized: false };
const EDGE_DATA_ADD: AnimatedEdgeData = { variant: "add", energized: false };

function isErrorEdge(e: Edge): boolean {
  const d = e.data as AnimatedEdgeData | undefined;
  if (d?.kind === "error") return true;
  return d?.variant === "else" || d?.variant === "timeout";
}

const NONE = "__none__";
const INTERACT_W = 20;

/** Envios Meta com fallback síncrono (`failureAction` / `failureGotoStepId`). */
const META_SEND_FAILURE_TYPES = new Set([
  "send_whatsapp_message",
  "send_whatsapp_template",
  "send_whatsapp_media",
  "send_whatsapp_interactive",
  "send_whatsapp_list",
  "send_whatsapp_flow",
  "question",
]);

function readFailureGotoStepId(cfg: Record<string, unknown>): string | null {
  if (cfg.failureAction !== "goto") return null;
  const id = cfg.failureGotoStepId;
  if (typeof id !== "string" || !id || id === NONE) return null;
  return id;
}

/**
 * Label "✕" das edges agora é renderizada pelo próprio AnimatedEdge via
 * <EdgeLabelRenderer> (pílula clicável estilizada). Não precisamos mais
 * de labelStyle/labelBgStyle — só do `label` em si.
 */
const DELETE_LABEL_PROPS = { label: "✕" };

function readNextStepId(config: unknown): string | null {
  if (typeof config !== "object" || config === null) return null;
  const c = config as Record<string, unknown>;
  return typeof c.nextStepId === "string" ? c.nextStepId : null;
}

function buildEdges(steps: AutomationStep[], triggerDisconnected = false): Edge[] {
  const out: Edge[] = [];

  if (steps.length === 0) {
    out.push({
      id: `${TRIGGER_ID}-${ADD_STEP_ID}`,
      source: TRIGGER_ID,
      target: ADD_STEP_ID,
      animated: false,
      data: EDGE_DATA_ADD,
      type: EDGE_TYPE,
    });
    return out;
  }

  const stepIds = new Set(steps.map((s) => s.id));

  // Conector gatilho→1º passo. Agora com "✕" (DELETE_LABEL_PROPS) pra
  // poder apagar; ao apagar, marcamos triggerConfig.__entryDisconnected
  // e este edge deixa de ser emitido (até reconectar arrastando do gatilho).
  if (!triggerDisconnected) {
    out.push({
      id: `${TRIGGER_ID}-${steps[0].id}`,
      source: TRIGGER_ID,
      target: steps[0].id,
      animated: false,
      data: EDGE_DATA_DEFAULT,
      type: EDGE_TYPE,
      interactionWidth: INTERACT_W,
      ...DELETE_LABEL_PROPS,
    });
  }

  for (let i = 0; i < steps.length; i++) {
    const a = steps[i];
    const cfg = a.config as Record<string, unknown>;

    if (isInteractiveStep(a)) {
      // Lista WhatsApp usa `rows`; question/botões/template usam `buttons`.
      // Antes só lia `buttons` — conexões da lista gravavam gotoStepId em
      // `rows` mas a aresta nunca era desenhada (parecia que "não conecta").
      const buttons = interactiveChoiceItems(a.type, cfg) as {
        gotoStepId?: string;
      }[];

      const validGotos = buttons.map((btn) => {
        const gotoId = btn.gotoStepId && btn.gotoStepId !== "__none__"
          ? btn.gotoStepId
          : undefined;
        return gotoId && stepIds.has(gotoId) ? gotoId : null;
      });
      const allSameGoto =
        buttons.length > 0 &&
        validGotos.every((g) => g != null) &&
        new Set(validGotos).size === 1;

      if (allSameGoto) {
        const gotoId = validGotos[0] as string;
        out.push({
          id: `${a.id}-next-${gotoId}`,
          source: a.id, target: gotoId,
          sourceHandle: "next",
          animated: false, data: EDGE_DATA_BUTTON, type: EDGE_TYPE,
          interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
        });
      } else {
        buttons.forEach((btn, idx) => {
          const gotoId = validGotos[idx];
          if (!gotoId) return;
          out.push({
            id: `${a.id}-btn_${idx}-${gotoId}`,
            source: a.id, target: gotoId,
            sourceHandle: `btn_${idx}`,
            animated: false, data: EDGE_DATA_BUTTON, type: EDGE_TYPE,
            interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
          });
        });
      }

      if (typeof cfg.elseGotoStepId === "string" && cfg.elseGotoStepId && stepIds.has(cfg.elseGotoStepId)) {
        out.push({
          id: `${a.id}-else-${cfg.elseGotoStepId}`,
          source: a.id, target: cfg.elseGotoStepId,
          sourceHandle: "else",
          animated: false, data: EDGE_DATA_ELSE, type: EDGE_TYPE,
          interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
        });
      }

      if (typeof cfg.timeoutGotoStepId === "string" && cfg.timeoutGotoStepId && stepIds.has(cfg.timeoutGotoStepId)) {
        out.push({
          id: `${a.id}-timeout-${cfg.timeoutGotoStepId}`,
          source: a.id, target: cfg.timeoutGotoStepId,
          sourceHandle: "timeout",
          animated: false, data: EDGE_DATA_TIMEOUT, type: EDGE_TYPE,
          interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
        });
      }
    }

    if (a.type === "condition") {
      const condCfg = normalizeConditionConfig(cfg);
      condCfg.branches.forEach((branch) => {
        if (branch.nextStepId && stepIds.has(branch.nextStepId)) {
          out.push({
            id: `${a.id}-branch:${branch.id}-${branch.nextStepId}`,
            source: a.id,
            target: branch.nextStepId,
            sourceHandle: `branch:${branch.id}`,
            animated: false,
            data: EDGE_DATA_BUTTON,
            type: EDGE_TYPE,
            interactionWidth: INTERACT_W,
            ...DELETE_LABEL_PROPS,
          });
        }
      });
      if (condCfg.elseStepId && stepIds.has(condCfg.elseStepId)) {
        out.push({
          id: `${a.id}-else-${condCfg.elseStepId}`,
          source: a.id,
          target: condCfg.elseStepId,
          sourceHandle: "else",
          animated: false,
          data: EDGE_DATA_ELSE,
          type: EDGE_TYPE,
          interactionWidth: INTERACT_W,
          ...DELETE_LABEL_PROPS,
        });
      }
    }

    // round_robin: cada opção tem seu próprio handle `option:<id>` —
    // sem "else" obrigatória (ver help text do card).
    if (a.type === "round_robin") {
      const rrCfg = normalizeRoundRobinConfig(cfg);
      rrCfg.options.forEach((option) => {
        if (option.nextStepId && stepIds.has(option.nextStepId)) {
          out.push({
            id: `${a.id}-option:${option.id}-${option.nextStepId}`,
            source: a.id,
            target: option.nextStepId,
            sourceHandle: `option:${option.id}`,
            animated: false,
            data: EDGE_DATA_BUTTON,
            type: EDGE_TYPE,
            interactionWidth: INTERACT_W,
            ...DELETE_LABEL_PROPS,
          });
        }
      });
    }

    // execute_distribution = IF de 2 saídas (estilo n8n):
    //   • SIM (handle "true") = fluxo linear via nextStepId (bloco genérico abaixo).
    //   • NÃO (handle "false") = ramo `elseStepId` (sem agente elegível).
    if (a.type === "execute_distribution") {
      if (typeof cfg.elseStepId === "string" && cfg.elseStepId && stepIds.has(cfg.elseStepId)) {
        out.push({
          id: `${a.id}-else-${cfg.elseStepId}`,
          source: a.id, target: cfg.elseStepId,
          sourceHandle: "false",
          animated: false, data: EDGE_DATA_ELSE, type: EDGE_TYPE,
          interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
        });
      }
    }

    if (a.type === "business_hours" || a.type === "check_agent_status") {
      if (typeof cfg.elseStepId === "string" && cfg.elseStepId && stepIds.has(cfg.elseStepId)) {
        out.push({
          id: `${a.id}-else-${cfg.elseStepId}`,
          source: a.id, target: cfg.elseStepId,
          sourceHandle: "false",
          animated: false, data: EDGE_DATA_ELSE, type: EDGE_TYPE,
          interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
        });
      }
    }

    if (a.type === "wait_for_reply") {
      if (typeof cfg.receivedGotoStepId === "string" && cfg.receivedGotoStepId && stepIds.has(cfg.receivedGotoStepId)) {
        out.push({
          id: `${a.id}-received-${cfg.receivedGotoStepId}`,
          source: a.id, target: cfg.receivedGotoStepId,
          sourceHandle: "received",
          animated: false, data: EDGE_DATA_BUTTON, type: EDGE_TYPE,
          interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
        });
      }

      if (typeof cfg.timeoutGotoStepId === "string" && cfg.timeoutGotoStepId && stepIds.has(cfg.timeoutGotoStepId)) {
        out.push({
          id: `${a.id}-timeout-${cfg.timeoutGotoStepId}`,
          source: a.id, target: cfg.timeoutGotoStepId,
          sourceHandle: "timeout",
          animated: false, data: EDGE_DATA_TIMEOUT, type: EDGE_TYPE,
          interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
        });
      }
    }

    // Mensagem / template SEM botões (ActionNode): aresta "Sem resposta".
    // Template COM botões já cai no bloco isInteractiveStep acima.
    if (
      !isInteractiveStep(a) &&
      (a.type === "send_whatsapp_message" ||
        a.type === "send_whatsapp_template" ||
        a.type === "send_whatsapp_flow") &&
      typeof cfg.timeoutGotoStepId === "string" &&
      cfg.timeoutGotoStepId &&
      stepIds.has(cfg.timeoutGotoStepId)
    ) {
      out.push({
        id: `${a.id}-timeout-${cfg.timeoutGotoStepId}`,
        source: a.id, target: cfg.timeoutGotoStepId,
        sourceHandle: "timeout",
        animated: false, data: EDGE_DATA_TIMEOUT, type: EDGE_TYPE,
        interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
      });
    }

    // Fallback síncrono Meta: handle `failure` → failureGotoStepId.
    if (META_SEND_FAILURE_TYPES.has(a.type)) {
      const failureGoto = readFailureGotoStepId(cfg);
      if (failureGoto && stepIds.has(failureGoto)) {
        out.push({
          id: `${a.id}-failure-${failureGoto}`,
          source: a.id, target: failureGoto,
          sourceHandle: "failure",
          animated: false, data: EDGE_DATA_ELSE, type: EDGE_TYPE,
          interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
        });
      }
    }

    // O condition (multi-branch) NÃO usa nextStepId raiz — cada
    // branch tem o seu. Pular pra não criar edge fantasma no handle
    // "false" do losango antigo.
    if (a.type === "condition") continue;

    // round_robin idem — cada opção tem seu próprio destino, sem
    // nextStepId raiz.
    if (a.type === "round_robin") continue;

    // Nós interativos (question/interactive/template-com-botões) roteiam só
    // pelos handles (btn_N/else) — não usam nextStepId raiz. Pular evita
    // edge linear fantasma sobreposto aos ramos dos botões.
    if (isInteractiveStep(a)) continue;

    const explicit = readNextStepId(cfg);

    if (explicit === NONE || !explicit) continue;

    if (stepIds.has(explicit)) {
      const isMetaLinear =
        META_SEND_FAILURE_TYPES.has(a.type) && !isInteractiveStep(a);
      const isBinaryTrue =
        a.type === "business_hours" ||
        a.type === "execute_distribution" ||
        a.type === "check_agent_status";
      out.push({
        id: `${a.id}-next-${explicit}`,
        source: a.id, target: explicit,
        ...(isMetaLinear ? { sourceHandle: "next" } : isBinaryTrue ? { sourceHandle: "true" } : {}),
        animated: false, data: EDGE_DATA_DEFAULT, type: EDGE_TYPE,
        interactionWidth: INTERACT_W, ...DELETE_LABEL_PROPS,
      });
    }
  }

  // Edge "+ Adicionar próximo passo" pra TODA folha não-terminal/não-ramificadora,
  // não só pro último step do array. Antes só o ramo principal (cadeia linear)
  // tinha a pílula; ramos paralelos (ex: timeout do wait_for_reply) ficavam
  // sem indicação visual de que dá pra continuar.
  const leaves = collectLeafStepIds(steps);
  for (const leafId of leaves) {
    const leaf = steps.find((s) => s.id === leafId);
    // Meta linear: handle de sucesso é `next` (declarado antes de `failure`).
    // Sem sourceHandle a pílula colava na saída de falha.
    const metaLinear =
      leaf &&
      META_SEND_FAILURE_TYPES.has(leaf.type) &&
      !isInteractiveStep(leaf);
    out.push({
      id: `addstep-edge-${leafId}`,
      source: leafId,
      target: `${ADD_STEP_ID}:${leafId}`,
      ...(metaLinear ? { sourceHandle: "next" } : {}),
      animated: false,
      data: EDGE_DATA_ADD,
      type: EDGE_TYPE,
    });
  }

  return out;
}

export type { StepStats, AutomationStats } from "@/lib/automation-stats-types";
import type { AutomationStats } from "@/lib/automation-stats-types";

type InnerProps = {
  steps: AutomationStep[];
  onStepsChange: (steps: AutomationStep[]) => void;
  triggerType: string;
  triggerConfig: unknown;
  stats?: AutomationStats | null;
  onStepLogsOpen?: (stepId: string) => void;
  onTriggerClick?: () => void;
  onTriggerConfigChange?: (next: Record<string, unknown>) => void;
  autoAlignVersion?: number;
  className?: string;
};
