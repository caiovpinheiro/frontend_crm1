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
