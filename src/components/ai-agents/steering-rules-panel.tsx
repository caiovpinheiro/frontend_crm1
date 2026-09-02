"use client";

import { IconPlayerPlay as Play } from "@tabler/icons-react";
import * as React from "react";

import { AgentPlayground } from "@/components/ai-agents/agent-playground";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { defaultAcademicSteeringRules } from "@/lib/ai-agents/academic-atendimento-prompt";

type Props = {
  agentId: string;
  agentName: string;
  archetype: string;
  template: string;
  onTemplateChange: (next: string) => void;
  steeringRules: string;
  onSteeringRulesChange: (next: string) => void;
  override: string;
  onOverrideChange: (next: string) => void;
};

export function SteeringRulesPanel({
  agentId,
  agentName,
  archetype,
  template,
  onTemplateChange,
  steeringRules,
  onSteeringRulesChange,
  override,
  onOverrideChange,
}: Props) {
  const [showPreview, setShowPreview] = React.useState(false);
  const [showTemplate, setShowTemplate] = React.useState(false);
  const [showPlayground, setShowPlayground] = React.useState(false);

  const composed = [template.trim(), steeringRules.trim(), override.trim()]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        Estas regras entram no prompt a cada mensagem. O que você salvar
        aqui vale na hora — sem deploy. Campo vazio no agente acadêmico
        cai nas regras padrão do código.
      </p>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="ed-steering">Regras de atendimento</Label>
          {archetype === "ATENDIMENTO" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onSteeringRulesChange(defaultAcademicSteeringRules())
              }
            >
              Carregar padrão acadêmico
            </Button>
          )}
        </div>
        <Textarea
          id="ed-steering"
          value={steeringRules}
          onChange={(e) => onSteeringRulesChange(e.target.value)}
          rows={14}
          placeholder={
            archetype === "ATENDIMENTO"
              ? "Vazio = regras acadêmicas padrão (portal, departamentos, o que dizer / não dizer)."
              : "Regras específicas deste agente. Somadas ao modelo base."
          }
          className="min-h-[240px] resize-y rounded-xl font-mono text-[12px] leading-relaxed"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ed-override">Instruções adicionais (opcional)</Label>
        <Textarea
          id="ed-override"
          value={override}
          onChange={(e) => onOverrideChange(e.target.value)}
          rows={4}
          placeholder="Regras pontuais do seu negócio. Somadas às regras acima."
          className="resize-y rounded-xl text-sm"
        />
      </div>

      <details
        className="rounded-xl border bg-muted/10"
        open={showTemplate}
        onToggle={(e) =>
          setShowTemplate((e.target as HTMLDetailsElement).open)
        }
      >
        <summary className="cursor-pointer p-3 text-sm font-medium">
          Modelo base do arquétipo (avançado)
        </summary>
        <div className="space-y-2 border-t p-3">
          <p className="text-[11px] text-muted-foreground">
            Placeholders como {"{{agent_name}}"} e {"{{tone}}"} são
            preenchidos em cada conversa. Mexa só se souber o impacto.
          </p>
          <Textarea
            value={template}
            onChange={(e) => onTemplateChange(e.target.value)}
            rows={10}
            className="resize-y rounded-xl font-mono text-[12px]"
          />
        </div>
      </details>

      <details
        className="rounded-xl border bg-muted/10"
        open={showPreview}
        onToggle={(e) =>
          setShowPreview((e.target as HTMLDetailsElement).open)
        }
      >
        <summary className="cursor-pointer p-3 text-sm font-medium">
          Preview do prompt composto
        </summary>
        <pre className="max-h-64 overflow-auto border-t bg-background/60 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
          {composed || "(vazio)"}
        </pre>
      </details>

      <div className="rounded-xl border bg-muted/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Testar no playground</div>
            <p className="text-[11px] text-muted-foreground">
              Usa a configuração já salva. Salve antes de testar uma
              regra nova.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowPlayground((v) => !v)}
          >
            <Play className="size-3.5" />
            {showPlayground ? "Ocultar" : "Abrir"}
          </Button>
        </div>
        {showPlayground && (
          <AgentPlayground
            agentId={agentId}
            agentName={agentName}
            open
            embedded
            onOpenChange={() => undefined}
          />
        )}
      </div>
    </div>
  );
}
