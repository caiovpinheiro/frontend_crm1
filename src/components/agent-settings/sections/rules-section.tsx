"use client";

import * as React from "react";

import { Textarea } from "@/components/ui/textarea";
import { formControlClass, formLabelClass } from "@/components/ui/form-dialog";

import { FieldHelp, SectionHeader } from "../section-header";
import type { AgentArchetype } from "../types";

export function RulesSection({
  archetype,
  steeringRules,
  onSteeringRulesChange,
  override,
  onOverrideChange,
  template,
  onTemplateChange,
}: {
  archetype: AgentArchetype;
  steeringRules: string;
  onSteeringRulesChange: (v: string) => void;
  override: string;
  onOverrideChange: (v: string) => void;
  template: string;
  onTemplateChange: (v: string) => void;
}) {
  const composed = [template.trim(), steeringRules.trim(), override.trim()]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Regras"
        description="Estas regras entram no prompt a cada mensagem. O que você salvar aqui vale na hora — sem deploy."
      />

      <div>
        <label htmlFor="ag-steering" className={formLabelClass}>
          Regras de atendimento
        </label>
        <Textarea
          id="ag-steering"
          value={steeringRules}
          onChange={(e) => onSteeringRulesChange(e.target.value)}
          rows={7}
          placeholder="Regras específicas deste agente. Somadas ao modelo base. Vazio = só o template do arquétipo."
          className="min-h-[140px] resize-y rounded-xl font-mono text-[12px] leading-relaxed"
        />
        <FieldHelp>
          {steeringRules.trim()
            ? "Com texto aqui, o agente segue só este texto — nada do padrão é somado."
            : "Vazio, o agente segue o texto padrão do arquétipo. O que você escrever passa a valer no lugar dele."}
        </FieldHelp>
      </div>

      <div>
        <label htmlFor="ag-override" className={formLabelClass}>
          Instruções adicionais
        </label>
        <Textarea
          id="ag-override"
          value={override}
          onChange={(e) => onOverrideChange(e.target.value)}
          rows={4}
          placeholder="Regras pontuais do seu negócio. Somadas às regras acima."
          className={formControlClass.replace("h-11", "min-h-[96px]") + " resize-y py-3 text-sm"}
        />
        <FieldHelp>Opcional. Será somado ao prompt do arquétipo.</FieldHelp>
      </div>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          Modelo base do arquétipo
        </summary>
        <div className="space-y-2 border-t border-border p-4">
          <FieldHelp>
            Placeholders como {"{{agent_name}}"} e {"{{tone}}"} são preenchidos
            em cada conversa. Mexa só se souber o impacto.
          </FieldHelp>
          <Textarea
            value={template}
            onChange={(e) => onTemplateChange(e.target.value)}
            rows={10}
            className="resize-y rounded-xl font-mono text-[12px]"
          />
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          Preview do prompt composto
        </summary>
        <pre className="max-h-64 overflow-auto border-t border-border bg-muted/30 p-4 text-[11px] leading-relaxed whitespace-pre-wrap">
          {composed || "(vazio)"}
        </pre>
      </details>
    </div>
  );
}
