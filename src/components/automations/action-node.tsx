"use client";

import type { ComponentType } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import {
  IconActivity as Activity,
  IconArrowsLeftRight as ArrowRightLeft,
  IconRobotFace as BotMessageSquare,
  IconCircleX as CircleX,
  IconClock as Clock,
  IconPhoto as Image,
  IconMail as Mail,
  IconMessage as MessageSquare,
  IconClick as MousePointerClick,
  IconClipboardList as ClipboardList,
  IconPencil as Pencil,
  IconTag as Tag,
  IconTrophy as Trophy,
  IconUserPlus as UserPlus,
  IconWebhook as Webhook,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

import { NodeInlineConfig } from "./node-inline-config";
import {
  channelLabelFromOptions,
  StepChannelBadge,
  useConnectedStepChannels,
} from "./step-channel-picker";
import { isMessageChannelStep, readStepAllowedChannelIds } from "@/lib/automation-workflow";
import { CustomHandle } from "./custom-handle";
import {
  FlowNodeDeleteButton,
  FlowNodeHeader,
  FlowNodeShell,
  FlowNodeStats,
  type FlowNodeType,
} from "./flow-node-shell";

export type ActionNodeData = {
  stepType: string;
  label: string;
  summary: string;
  stepIndex?: number;
  incomplete?: boolean;
  onDelete?: () => void;
  stats?: { success: number; failed: number; skipped: number };
  onStatsClick?: () => void;
  config?: Record<string, unknown>;
  stepOptions?: Array<{ value: string; label: string }>;
  onConfigChange?: (next: Record<string, unknown>) => void;
  isFirstMessageStep?: boolean;
  inheritedChannelId?: string;
  bindToInbound?: boolean;
};

type ActionRF = Node<ActionNodeData, "action">;

const iconMap: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  send_email: Mail,
  move_stage: ArrowRightLeft,
  mark_deal_won: Trophy,
  mark_deal_lost: CircleX,
  assign_owner: UserPlus,
  add_tag: Tag,
  remove_tag: Tag,
  update_field: Pencil,
  create_activity: Activity,
  send_whatsapp_message: MessageSquare,
  send_whatsapp_template: MessageSquare,
  send_whatsapp_media: Image,
  send_whatsapp_interactive: MousePointerClick,
  send_whatsapp_flow: ClipboardList,
  webhook: Webhook,
  update_lead_score: Activity,
  transfer_to_ai_agent: BotMessageSquare,
};

const META_LINEAR_FAILURE_TYPES = new Set([
  "send_whatsapp_message",
  "send_whatsapp_template",
  "send_whatsapp_media",
  "send_whatsapp_flow",
]);

const META_WAIT_TIMEOUT_TYPES = new Set([
  "send_whatsapp_message",
  "send_whatsapp_template",
  "send_whatsapp_flow",
]);

function StepIcon({ type }: { type: string }) {
  const Icon = iconMap[type] ?? Activity;
  return <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />;
}

function actionNodeType(stepType: string): FlowNodeType {
  if (stepType === "webhook") return "api";
  if (
    stepType.startsWith("send_whatsapp") ||
    stepType === "send_product" ||
    stepType === "send_email"
  ) {
    return "message";
  }
  if (stepType === "update_field" || stepType === "set_variable") return "fields";
  return "action";
}

export function ActionNode({ data, selected }: NodeProps<ActionRF>) {
  const hasFailureOutput = META_LINEAR_FAILURE_TYPES.has(data.stepType);
  const hasTimeoutOutput = META_WAIT_TIMEOUT_TYPES.has(data.stepType);
  const isChannelStep = isMessageChannelStep(data.stepType);
  const { options: channelOptions } = useConnectedStepChannels(data.stepType, {
    enabled: isChannelStep,
  });
  const allowed = isChannelStep ? readStepAllowedChannelIds(data.config) : null;
  const channelBadgeLabel = !isChannelStep
    ? null
    : allowed === null
      ? "Todos os canais"
      : allowed.length === 1
        ? channelLabelFromOptions(channelOptions, allowed[0]) ?? "1 canal"
        : `${allowed.length} canais`;
  const nodeType = actionNodeType(data.stepType);
  const s = data.stats;
  const hasReplyTimeout =
    data.stepType === "send_whatsapp_message" ||
    data.stepType === "send_whatsapp_template" ||
    data.stepType === "send_whatsapp_flow";

  return (
    <FlowNodeShell
      selected={selected}
      incomplete={data.incomplete}
      type={nodeType}
      stepIndex={data.stepIndex}
      expanded={selected}
      className={cn(
        (data.stepType === "add_tag" || data.stepType === "remove_tag") &&
          selected &&
          "z-20 overflow-visible",
        selected && (data.stepType === "webhook" || hasReplyTimeout) && "wf-node--wide"
      )}
    >
      <CustomHandle type="target" position={Position.Left} connectionLimit={1} />
      <FlowNodeHeader
        icon={<StepIcon type={data.stepType} />}
        title={data.label}
        subtitle={data.summary}
        badge={
          selected && channelBadgeLabel ? (
            <StepChannelBadge label={channelBadgeLabel} />
          ) : undefined
        }
        actions={<FlowNodeDeleteButton onDelete={data.onDelete} />}
      />
      {hasFailureOutput ? (
        <div className="wf-node__outs">
          <div className="wf-node__out wf-node__out--ok fx-out fx-out--flow">
            <span className="fx-out__label flex-1">Próximo passo</span>
            <CustomHandle
              type="source"
              position={Position.Right}
              id="next"
              connectionLimit={1}
              className="fx-port--flow"
            />
          </div>
          {hasTimeoutOutput && (
            <div className="wf-node__out fx-out fx-out--error">
              <span className="fx-out__label flex-1">Caso o contato não responda</span>
              <CustomHandle
                type="source"
                position={Position.Right}
                id="timeout"
                connectionLimit={1}
                className="fx-port--error"
              />
            </div>
          )}
          <div className="wf-node__out wf-node__out--err fx-out fx-out--error">
            <span className="fx-out__label flex-1">
              Caso ocorrer erro no envio de mensagem
            </span>
            <CustomHandle
              type="source"
              position={Position.Right}
              id="failure"
              connectionLimit={1}
              className="fx-port--error"
            />
          </div>
        </div>
      ) : (
        <CustomHandle type="source" position={Position.Right} connectionLimit={1} />
      )}
      <NodeInlineConfig
        selected={selected}
        stepType={data.stepType}
        config={data.config}
        stepOptions={data.stepOptions ?? []}
        isFirstMessageStep={data.isFirstMessageStep}
        inheritedChannelId={data.inheritedChannelId}
        bindToInbound={data.bindToInbound}
        onChange={(next) => data.onConfigChange?.(next)}
      />
      {s && (
        <FlowNodeStats
          success={s.success}
          warning={s.skipped}
          error={s.failed}
          onClick={data.onStatsClick}
        />
      )}
    </FlowNodeShell>
  );
}
