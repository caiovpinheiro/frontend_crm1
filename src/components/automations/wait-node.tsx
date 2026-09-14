"use client";

import { Position, type Node, type NodeProps } from "@xyflow/react";
import {
  IconArrowBackUp as ArrowBack,
  IconCheck as Check,
  IconClock as Clock,
  IconMessageCircle as MessageCircle,
  IconPlayerPause as Pause,
} from "@tabler/icons-react";

import { NodeInlineConfig } from "./node-inline-config";
import { CustomHandle } from "./custom-handle";
import {
  FlowNodeDeleteButton,
  FlowNodeHeader,
  FlowNodeShell,
  FlowNodeStats,
} from "./flow-node-shell";

export type WaitNodeData = {
  label: string;
  summary: string;
  stepIndex?: number;
  hasReceivedGoto: boolean;
  hasTimeoutGoto: boolean;
  timeoutLabel: string;
  onDelete?: () => void;
  stats?: { success: number; failed: number; skipped: number };
  onStatsClick?: () => void;
  stepType?: string;
  config?: Record<string, unknown>;
  stepOptions?: Array<{ value: string; label: string }>;
  onConfigChange?: (next: Record<string, unknown>) => void;
};

type WaitRF = Node<WaitNodeData, "wait">;

export function WaitNode({ data, selected }: NodeProps<WaitRF>) {
  const s = data.stats;

  return (
    <FlowNodeShell
      selected={selected}
      type="fields"
      accent="orange"
      stepIndex={data.stepIndex}
      expanded={selected}
      className={selected ? "wf-node--wide" : undefined}
    >
      <CustomHandle type="target" position={Position.Left} connectionLimit={1} />
      <FlowNodeHeader
        icon={<Pause className="size-3.5" strokeWidth={2.4} />}
        title={data.label}
        subtitle={data.summary}
        actions={<FlowNodeDeleteButton onDelete={data.onDelete} label="Remover espera" />}
      />
      <div className="wf-node__outs">
        <div className="wf-node__out wf-node__out--ok fx-out fx-out--cond">
          <MessageCircle className="size-3 shrink-0" strokeWidth={2.4} />
          <span className="fx-out__label flex-1">
            {data.stepType === "closing_protocol"
              ? "Demanda (continua)"
              : "Mensagem recebida"}
          </span>
          <CustomHandle
            type="source"
            position={Position.Right}
            id="received"
            connectionLimit={1}
            className="fx-port--cond"
          />
        </div>
        {data.stepType === "closing_protocol" ? (
          <>
            <div className="wf-node__out fx-out fx-out--error">
              <Check className="size-3 shrink-0" strokeWidth={2.4} />
              <span className="fx-out__label flex-1">Encerrar</span>
              <CustomHandle
                type="source"
                position={Position.Right}
                id="encerrar"
                connectionLimit={1}
                className="fx-port--error"
              />
            </div>
            <div className="wf-node__out fx-out fx-out--cond">
              <ArrowBack className="size-3 shrink-0" strokeWidth={2.4} />
              <span className="fx-out__label flex-1">Devolver</span>
              <CustomHandle
                type="source"
                position={Position.Right}
                id="devolver"
                connectionLimit={1}
                className="fx-port--cond"
              />
            </div>
          </>
        ) : (
          <div className="wf-node__out fx-out fx-out--error">
            <Clock className="size-3 shrink-0" strokeWidth={2.4} />
            <span className="fx-out__label flex-1">
              {data.timeoutLabel || "Caso o contato não responda"}
            </span>
            <CustomHandle
              type="source"
              position={Position.Right}
              id="timeout"
              connectionLimit={1}
              className="fx-port--error"
            />
          </div>
        )}
      </div>
      <NodeInlineConfig
        selected={selected}
        stepType={data.stepType ?? "wait_for_reply"}
        config={data.config}
        stepOptions={data.stepOptions ?? []}
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
