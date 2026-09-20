"use client";

import * as React from "react";

import { UsagePanel } from "@/components/ai-agents/usage-panel";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select";
import {
  formControlClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";
import { type AgentResponseBehavior } from "@/lib/ai-agents/behavior-presets";

import { BehaviorSelector } from "../behavior-selector";
import { OpenAiKeyField } from "../openai-key-field";
import { FieldHelp, SectionHeader } from "../section-header";
import { AGENT_MODELS, type AutonomyMode } from "../types";

export function IdentitySection({
  agentId,
  name,
  onNameChange,
  tone,
  onToneChange,
  model,
  onModelChange,
  responseBehavior,
  onResponseBehaviorChange,
  dailyTokenCap,
  onDailyTokenCapChange,
  autonomyMode,
  onAutonomyModeChange,
  openaiApiKey,
  onOpenaiApiKeyChange,
  onOpenaiApiKeyClear,
  hasOwnOpenaiKey,
  openaiApiKeyHint,
}: {
  agentId: string | null;
  name: string;
  onNameChange: (v: string) => void;
  tone: string;
  onToneChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  responseBehavior: AgentResponseBehavior;
  onResponseBehaviorChange: (v: AgentResponseBehavior) => void;
  dailyTokenCap: number;
  onDailyTokenCapChange: (v: number) => void;
  autonomyMode: AutonomyMode;
  onAutonomyModeChange: (v: AutonomyMode) => void;
  openaiApiKey: string;
  onOpenaiApiKeyChange: (v: string) => void;
  onOpenaiApiKeyClear: () => void;
  hasOwnOpenaiKey: boolean;
  openaiApiKeyHint: string | null;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Identidade"
        description="Quem é o agente, com qual modelo ele fala e se envia sozinho ou só sugere rascunho."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ag-name" className={formLabelClass}>
            Nome
          </label>
          <Input
            id="ag-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            className={formControlClass}
          />
        </div>
        <div>
          <label htmlFor="ag-tone" className={formLabelClass}>
            Tom de voz
          </label>
          <Input
            id="ag-tone"
            value={tone}
            onChange={(e) => onToneChange(e.target.value)}
            placeholder="Ex.: acolhedor e objetivo"
            className={formControlClass}
          />
        </div>
        <div>
          <label htmlFor="ag-model" className={formLabelClass}>
            Modelo
          </label>
          <SelectNative
            id="ag-model"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className={cn(formControlClass, "h-11 rounded-xl text-sm")}
          >
            {AGENT_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {!AGENT_MODELS.includes(model as (typeof AGENT_MODELS)[number]) && (
              <option value={model}>{model}</option>
            )}
          </SelectNative>
        </div>
        <div className="sm:col-span-2">
          <BehaviorSelector
            label="Comportamento das respostas"
            value={responseBehavior}
            onChange={onResponseBehaviorChange}
          />
        </div>
        <div>
          <label htmlFor="ag-cap" className={formLabelClass}>
            Limite diário de tokens
          </label>
          <Input
            id="ag-cap"
            type="number"
            min={0}
            step={1000}
            value={dailyTokenCap}
            onChange={(e) => onDailyTokenCapChange(parseInt(e.target.value) || 0)}
            className={formControlClass}
          />
          <FieldHelp>
            0 = sem limite. Ao estourar, o agente para até o dia seguinte.
          </FieldHelp>
        </div>
      </div>

      <OpenAiKeyField
        value={openaiApiKey}
        onChange={onOpenaiApiKeyChange}
        onClear={onOpenaiApiKeyClear}
        hasSavedKey={hasOwnOpenaiKey}
        savedHint={openaiApiKeyHint}
        idPrefix="ag"
      />

      <div>
        <p className={formLabelClass}>Modo</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            title="Rascunho"
            description="Sugere respostas ao operador humano antes de enviar."
            active={autonomyMode === "DRAFT"}
            onClick={() => onAutonomyModeChange("DRAFT")}
          />
          <ModeCard
            title="Autônomo"
            description="Envia direto pro lead sem supervisão."
            active={autonomyMode === "AUTONOMOUS"}
            onClick={() => onAutonomyModeChange("AUTONOMOUS")}
          />
        </div>
      </div>

      {agentId && (
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
            Uso e custo
          </summary>
          <div className="border-t border-border px-4 py-3">
            <UsagePanel agentId={agentId} />
          </div>
        </details>
      )}
    </div>
  );
}

function ModeCard({
  title,
  description,
  active,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
