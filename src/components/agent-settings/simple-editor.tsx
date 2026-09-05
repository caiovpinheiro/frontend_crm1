"use client";

import { BookOpen, MessageSquareText, UserRound } from "lucide-react";
import * as React from "react";

import { KnowledgePanel } from "@/components/ai-agents/knowledge-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formControlClass, formLabelClass } from "@/components/ui/form-dialog";
import { defaultAcademicSteeringRules } from "@/lib/ai-agents/academic-atendimento-prompt";
import { cn } from "@/lib/utils";

import type { AgentSettingsValues } from "./types";

/** Palavras que o backend transfere SEM passar pelo modelo. */
export const INSTANT_HANDOFF_WORDS = [
  "cancelar",
  "trancar",
  "trancamento",
  "desistir",
];

export const CANCEL_REASON_BLOCK = `
## ANTES DE CANCELAR / TRANCAR / DESISTIR
Não transfira na primeira frase. Faça 1 pergunta curta sobre o motivo (financeiro, curso, tempo, pessoal). Acolha em 1 frase. Não argumente retenção longa.
Se o aluno responder, insistir ou pedir humano → aí sim Retenção (transfer_to_department + execute_distribution).
"Só quero cancelar" / "pode transferir" → Retenção na hora.
`.trim();

function hasCancelReasonRule(text: string): boolean {
  return /ANTES DE CANCELAR/i.test(text);
}

function stripInstantHandoffKeywords(keywords: string[]): string[] {
  return keywords.filter((k) => {
    const n = k
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return !INSTANT_HANDOFF_WORDS.some((w) => n.includes(w));
  });
}

export function SimpleEditor({
  agentId,
  preview,
  form,
  onChange,
}: {
  agentId: string;
  preview: boolean;
  form: AgentSettingsValues;
  onChange: (next: AgentSettingsValues) => void;
}) {
  const askReason = hasCancelReasonRule(form.systemPromptOverride);
  const leftoverKeywords = form.piloting.keywordHandoffs.filter((k) =>
    INSTANT_HANDOFF_WORDS.some((w) =>
      k
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(w),
    ),
  );

  const setOverride = (text: string) =>
    onChange({ ...form, systemPromptOverride: text, steeringRules: "" });

  const setAskReason = (on: boolean) => {
    let text = form.systemPromptOverride.trim();
    if (on && !hasCancelReasonRule(text)) {
      text = text ? `${text}\n\n${CANCEL_REASON_BLOCK}` : CANCEL_REASON_BLOCK;
    }
    if (!on && hasCancelReasonRule(text)) {
      text = text
        .replace(/\n*## ANTES DE CANCELAR[\s\S]*?(?=\n## |\s*$)/, "")
        .trim();
    }
    onChange({
      ...form,
      systemPromptOverride: text,
      steeringRules: "",
      piloting: {
        ...form.piloting,
        keywordHandoffs: on
          ? stripInstantHandoffKeywords(form.piloting.keywordHandoffs)
          : form.piloting.keywordHandoffs,
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <p className="text-sm text-muted-foreground">
        Três coisas bastam para o agente atender: quem ele é, o que pode dizer,
        e os textos de apoio. O resto fica em Avançado.
      </p>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <UserRound className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">1. Quem é</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={formLabelClass} htmlFor="simple-name">
              Nome no CRM
            </label>
            <Input
              id="simple-name"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              className={formControlClass}
            />
          </div>
          <div>
            <p className={formLabelClass}>Como responde</p>
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                label="Rascunho"
                hint="Humano aprova"
                active={form.autonomyMode === "DRAFT"}
                onClick={() => onChange({ ...form, autonomyMode: "DRAFT" })}
              />
              <ModeButton
                label="Autônomo"
                hint="Manda no WhatsApp"
                active={form.autonomyMode === "AUTONOMOUS"}
                onClick={() =>
                  onChange({ ...form, autonomyMode: "AUTONOMOUS" })
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              2. Como deve atender
            </h3>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setOverride(defaultAcademicSteeringRules())}
          >
            Carregar padrão acadêmico
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Este texto é o que o agente lê em toda mensagem. Salva no campo que o
          DEV já grava (não some ao recarregar). Cole o roteiro inteiro aqui —
          um único bloco, sem “instruções extras” por baixo.
        </p>
        <Textarea
          value={form.systemPromptOverride}
          onChange={(e) => setOverride(e.target.value)}
          rows={12}
          placeholder="Ex.: Você atende alunos da Cruzeiro do Sul no WhatsApp. Não invente URL. Senha é por SMS…"
          className="min-h-[200px] resize-y rounded-xl font-mono text-[12px] leading-relaxed"
        />

        <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Se falar em cancelar, perguntar o motivo
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Uma pergunta antes de mandar para Retenção. Também tira
              “cancelar” das palavras que transferem sozinhas.
            </p>
            {leftoverKeywords.length > 0 && !askReason && (
              <p className="mt-1 text-xs text-destructive">
                Ainda transfere na hora por: {leftoverKeywords.join(", ")}.
                Ligue o interruptor.
              </p>
            )}
          </div>
          <Switch checked={askReason} onCheckedChange={setAskReason} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            3. Textos de apoio (FAQ)
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Cole passo a passo (portal, senha, prova). Sem isso o agente só tem o
          texto da etapa 2 — e inventa o resto.
        </p>
        {preview ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            Prévia — cole documentos depois de criar o agente no banco.
          </div>
        ) : (
          <KnowledgePanel agentId={agentId} />
        )}
      </section>
    </div>
  );
}

function ModeButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-left",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}

export function applySimpleSaveDefaults(
  form: AgentSettingsValues,
): Pick<
  AgentSettingsValues,
  "systemPromptOverride" | "steeringRules" | "piloting"
> {
  const ask = hasCancelReasonRule(form.systemPromptOverride);
  return {
    systemPromptOverride: form.systemPromptOverride,
    steeringRules: "",
    piloting: {
      ...form.piloting,
      keywordHandoffs: ask
        ? stripInstantHandoffKeywords(form.piloting.keywordHandoffs)
        : form.piloting.keywordHandoffs,
    },
  };
}