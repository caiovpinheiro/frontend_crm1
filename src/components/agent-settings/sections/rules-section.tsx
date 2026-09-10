"use client";

import * as React from "react";

import { defaultAcademicSteeringRules } from "@/lib/ai-agents/academic-atendimento-prompt";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  useOnlyOwnRules,
  onUseOnlyOwnRulesChange,
}: {
  archetype: AgentArchetype;
  steeringRules: string;
  onSteeringRulesChange: (v: string) => void;
  override: string;
  onOverrideChange: (v: string) => void;
  template: string;
  onTemplateChange: (v: string) => void;
  useOnlyOwnRules: boolean;
  onUseOnlyOwnRulesChange: (v: boolean) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const composed = [template.trim(), steeringRules.trim(), override.trim()]
    .filter(Boolean)
    .join("\n\n");

  async function loadDefaultRules() {
    const fallback =
      archetype === "ATENDIMENTO" ? defaultAcademicSteeringRules() : "";
    // Substituir sem avisar ja apagou horas de regra escrita a mao: o
    // botao troca o texto inteiro, nao acrescenta.
    if (
      steeringRules.trim() &&
      !(await confirm({
        title: "Substituir as regras deste agente?",
        description:
          "O texto de fábrica entra no lugar do que está escrito aqui — " +
          "não é somado. O que você escreveu se perde ao salvar.",
        confirmLabel: "Substituir",
        destructive: true,
      }))
    ) {
      return;
    }
    onSteeringRulesChange(fallback);
  }

  return (
    <div className="space-y-5">
      {dialog}
      <SectionHeader
        title="Regras"
        description="Estas regras entram no prompt a cada mensagem. O que você salvar aqui vale na hora — sem deploy."
      />

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={useOnlyOwnRules}
          onChange={(e) => onUseOnlyOwnRulesChange(e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-medium">Usar apenas as minhas regras</span>
          <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
            Desligado, o texto do pacote da vertical é <strong>somado</strong> ao
            que você escreveu — e vence quando os dois se contradizem. Ligado,
            vale só o que está nesta tela e na aba Conhecimento.
          </span>
          {useOnlyOwnRules && (
            <span className="mt-2 block text-[12px] leading-relaxed text-[var(--color-warning-text,inherit)]">
              Também param de entrar os textos automáticos de polos, prova,
              portal, senha, primeiro acesso e certificado. Esse conteúdo passa
              a ser seu: escreva o comportamento aqui e as informações na aba
              Conhecimento.
            </span>
          )}
        </span>
      </label>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="ag-steering" className={formLabelClass}>
            Regras de atendimento
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => void loadDefaultRules()}
          >
            Carregar padrão
          </Button>
        </div>
        <Textarea
          id="ag-steering"
          value={steeringRules}
          onChange={(e) => onSteeringRulesChange(e.target.value)}
          rows={7}
          placeholder={
            archetype === "ATENDIMENTO"
              ? "Vazio = regras acadêmicas padrão (portal, departamentos, o que dizer / não dizer)."
              : "Regras específicas deste agente. Somadas ao modelo base."
          }
          className="min-h-[140px] resize-y rounded-xl font-mono text-[12px] leading-relaxed"
        />
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
