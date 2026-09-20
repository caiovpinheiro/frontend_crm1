"use client";

import * as React from "react";
import { IconInfoCircle } from "@tabler/icons-react";

import {
  AGENT_RESPONSE_BEHAVIOR_PRESETS,
  type AgentResponseBehavior,
} from "@/lib/ai-agents/behavior-presets";
import { TooltipHost } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function BehaviorSelector({
  value,
  onChange,
  label,
  helpText,
}: {
  value: AgentResponseBehavior;
  onChange: (value: AgentResponseBehavior) => void;
  label?: React.ReactNode;
  helpText?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {label && (
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {label}
          <TooltipHost
            label={
              <span className="text-xs leading-relaxed">
                Define o quanto o agente varia a forma de responder. Configurações mais objetivas deixam as respostas mais consistentes. Configurações mais naturais ou criativas permitem maior variedade na conversa. Isso não muda o conhecimento do agente, apenas a forma como ele formula as respostas.
              </span>
            }
          >
            <IconInfoCircle
              size={16}
              className="text-muted-foreground hover:text-foreground cursor-help"
            />
          </TooltipHost>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(AGENT_RESPONSE_BEHAVIOR_PRESETS).map(
          ([id, preset]) => {
            const active = value === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id as AgentResponseBehavior)}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border p-3 text-left text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted/40",
                )}
              >
                <span className="font-medium text-foreground">{preset.label}</span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {preset.description}
                </span>
              </button>
            );
          },
        )}
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
