"use client";

import { Position, type Node, type NodeProps } from "@xyflow/react";
import {
  IconArrowRight as ArrowRight,
  IconCircleOff as CircleSlash,
  IconClock as Clock,
  IconHelpCircle as HelpCircle,
  IconListDetails as ListDetails,
  IconMessageQuestion as MessageCircleQuestion,
  IconClick as MousePointerClick,
} from "@tabler/icons-react";

import { isMessageChannelStep, readStepAllowedChannelIds } from "@/lib/automation-workflow";
import { NodeInlineConfig } from "./node-inline-config";
import {
  channelLabelFromOptions,
  StepChannelBadge,
  useConnectedStepChannels,
} from "./step-channel-picker";
import { CustomHandle } from "./custom-handle";
import {
  FlowNodeDeleteButton,
  FlowNodeHeader,
  FlowNodeShell,
  FlowNodeStats,
} from "./flow-node-shell";

export type InteractiveButton = {
  text?: string;
  title?: string;
  id?: string;
  gotoStepId?: string;
};

export type InteractiveNodeData = {
  stepType: string;
  label: string;
  summary: string;
  stepIndex?: number;
  incomplete?: boolean;
  buttons: InteractiveButton[];
  hasElse: boolean;
  hasTimeout: boolean;
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

type InteractiveRF = Node<InteractiveNodeData, "interactive">;

function buttonLabel(btn: InteractiveButton, idx: number): string {
  return btn.title || btn.text || `Opção ${idx + 1}`;
}

export function InteractiveNode({ data, selected }: NodeProps<InteractiveRF>) {
  const buttons = data.buttons ?? [];
  const s = data.stats;
  const isQuestion = data.stepType === "question";
  const isList = data.stepType === "send_whatsapp_list";
  const Icon = isQuestion
    ? MessageCircleQuestion
    : isList
      ? ListDetails
      : MousePointerClick;
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

  return (
    <FlowNodeShell
      selected={selected}
      incomplete={data.incomplete}
      type="message"
      accent="violet"
      stepIndex={data.stepIndex}
      expanded={selected}
      className={selected ? "wf-node--wide" : undefined}
    >
      <CustomHandle type="target" position={Position.Left} connectionLimit={1} />
      <FlowNodeHeader
        icon={<Icon className="size-3.5" strokeWidth={2.4} />}
        title={data.label}
        subtitle={data.summary}
        badge={
          channelBadgeLabel ? <StepChannelBadge label={channelBadgeLabel} /> : undefined
        }
        actions={<FlowNodeDeleteButton onDelete={data.onDelete} />}
      />

      <div className="wf-node__outs">
        {buttons.map((btn, i) => (
          <div key={btn.id || i} className="wf-node__out fx-out fx-out--cond">
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--fx-cond)]" />
            <span className="fx-out__label flex-1">{buttonLabel(btn, i)}</span>
            <CustomHandle
              type="source"
              position={Position.Right}
              id={`btn_${i}`}
              connectionLimit={1}
              className="fx-port--cond"
            />
          </div>
        ))}
        <div className="wf-node__out fx-out fx-out--flow">
          <ArrowRight className="size-3 shrink-0" strokeWidth={2.4} />
          <span className="fx-out__label flex-1">Próximo passo</span>
          <CustomHandle
            type="source"
            position={Position.Right}
            id="next"
            connectionLimit={1}
            className="fx-port--flow"
          />
        </div>
        {data.hasElse && (
          <div className="wf-node__out fx-out fx-out--error">
            <HelpCircle className="size-3 shrink-0" strokeWidth={2.4} />
            <span className="fx-out__label flex-1">Outra resposta</span>
            <CustomHandle
              type="source"
              position={Position.Right}
              id="else"
              connectionLimit={1}
              className="fx-port--error"
            />
          </div>
        )}
        {data.hasTimeout && (
          <div className="wf-node__out fx-out fx-out--error">
            <Clock className="size-3 shrink-0" strokeWidth={2.4} />
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
          <CircleSlash className="size-3 shrink-0" strokeWidth={2.4} />
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
