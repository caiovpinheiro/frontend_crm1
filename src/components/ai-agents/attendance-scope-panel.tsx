"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { ChipInput } from "@/components/ai-agents/chip-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultAttendanceScope,
  type AttendanceScope,
} from "@/lib/ai-agents/steering";
import { cn } from "@/lib/utils";

type PipelineWithStages = {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
};

type Props = {
  value: AttendanceScope;
  onChange: (next: AttendanceScope) => void;
};

/**
 * Em quais conversas o agente pode entrar: funis, etapas e tags do
 * contato. Nada marcado = atende tudo (comportamento atual).
 */
export function AttendanceScopePanel({ value, onChange }: Props) {
  const patch = (partial: Partial<AttendanceScope>) =>
    onChange({ ...defaultAttendanceScope(), ...value, ...partial });

  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ["ai-agent-pipelines"],
    queryFn: async (): Promise<PipelineWithStages[]> => {
      const res = await fetch(apiUrl("/api/pipelines"));
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.pipelines ?? []);
      return (list as PipelineWithStages[]).map((p) => ({
        id: p.id,
        name: p.name,
        stages: Array.isArray(p.stages)
          ? p.stages.map((s) => ({ id: s.id, name: s.name }))
          : [],
      }));
    },
    staleTime: 60_000,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ["ai-agent-tags"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/tags"));
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.tags ?? []);
      return (list as Array<{ name?: string }>)
        .map((t) => t.name)
        .filter((n): n is string => Boolean(n));
    },
    staleTime: 60_000,
  });

  const togglePipeline = (pipelineId: string) => {
    const on = value.allowedPipelineIds.includes(pipelineId);
    const allowedPipelineIds = on
      ? value.allowedPipelineIds.filter((x) => x !== pipelineId)
      : [...value.allowedPipelineIds, pipelineId];
    // Trocar de funil derruba etapas que não pertencem mais ao escopo.
    const validStageIds = new Set(
      pipelines
        .filter(
          (p) =>
            allowedPipelineIds.length === 0 ||
            allowedPipelineIds.includes(p.id),
        )
        .flatMap((p) => p.stages.map((s) => s.id)),
    );
    patch({
      allowedPipelineIds,
      allowedStageIds: value.allowedStageIds.filter((s) =>
        validStageIds.has(s),
      ),
      blockedStageIds: value.blockedStageIds.filter((s) =>
        validStageIds.has(s),
      ),
    });
  };

  const toggleStage = (stageId: string, list: "allowed" | "blocked") => {
    if (list === "allowed") {
      const on = value.allowedStageIds.includes(stageId);
      patch({
        allowedStageIds: on
          ? value.allowedStageIds.filter((x) => x !== stageId)
          : [...value.allowedStageIds, stageId],
        blockedStageIds: value.blockedStageIds.filter((x) => x !== stageId),
      });
      return;
    }
    const on = value.blockedStageIds.includes(stageId);
    patch({
      blockedStageIds: on
        ? value.blockedStageIds.filter((x) => x !== stageId)
        : [...value.blockedStageIds, stageId],
      allowedStageIds: value.allowedStageIds.filter((x) => x !== stageId),
    });
  };

  const visiblePipelines =
    value.allowedPipelineIds.length > 0
      ? pipelines.filter((p) => value.allowedPipelineIds.includes(p.id))
      : pipelines;

  const restricts =
    value.allowedPipelineIds.length > 0 ||
    value.allowedStageIds.length > 0 ||
    value.blockedStageIds.length > 0 ||
    value.allowedContactTags.length > 0 ||
    value.blockedContactTags.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        Onde o agente pode atuar. Nada marcado aqui = ele atende qualquer
        conversa atribuída a ele, como hoje. O escopo é avaliado antes de
        qualquer resposta ou intercepto.
      </p>

      <div className="rounded-xl border bg-muted/10 p-4">
        <div className="text-sm font-semibold">Funis que ele pode atender</div>
        <p className="mt-0.5 mb-3 text-[12px] text-muted-foreground">
          Vale para o negócio aberto do contato. Nenhum marcado = todos.
        </p>
        {isLoading ? (
          <p className="text-[12px] text-muted-foreground">Carregando…</p>
        ) : pipelines.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Nenhum funil encontrado.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {pipelines.map((p) => {
              const on = value.allowedPipelineIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePipeline(p.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px]",
                    on
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-muted/10 p-4">
        <div className="text-sm font-semibold">Etapas</div>
        <p className="mt-0.5 mb-3 text-[12px] text-muted-foreground">
          Clique uma vez para permitir (verde), duas para bloquear
          (vermelho). Nada marcado = todas as etapas do funil.
        </p>
        <div className="space-y-3">
          {visiblePipelines.map((p) => (
            <div key={p.id}>
              <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">
                {p.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.stages.map((s) => {
                  const allowed = value.allowedStageIds.includes(s.id);
                  const blocked = value.blockedStageIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        toggleStage(
                          s.id,
                          allowed || blocked ? "blocked" : "allowed",
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[12px]",
                        allowed &&
                          "border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]",
                        blocked &&
                          "border-destructive bg-destructive/10 text-destructive line-through",
                        !allowed &&
                          !blocked &&
                          "border-border text-muted-foreground hover:bg-muted/40",
                      )}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Tags que ele PODE atender</Label>
        <ChipInput
          values={value.allowedContactTags}
          onChange={(allowedContactTags) => patch({ allowedContactTags })}
          placeholder="Ex.: calouros1008_1"
          suggestions={tags}
        />
        <p className="text-[11px] text-muted-foreground">
          Vazio = qualquer tag. Se preencher, o agente só atende contato com
          pelo menos uma dessas tags.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label>Tags que ele NÃO pode atender</Label>
        <ChipInput
          values={value.blockedContactTags}
          onChange={(blockedContactTags) => patch({ blockedContactTags })}
          placeholder="Ex.: inadimplente"
          suggestions={tags}
        />
        <p className="text-[11px] text-muted-foreground">
          Bloqueio vence permissão: com uma dessas tags, o agente sai da
          conversa mesmo que a tag permitida também esteja lá.
        </p>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg border bg-background/50 p-3">
        <div>
          <Label htmlFor="scope-no-deal">Atender contato sem negócio aberto</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Desligado, quem não tem negócio no funil não é atendido pela IA.
            Só tem efeito com restrição de funil ou etapa.
          </p>
        </div>
        <Switch
          id="scope-no-deal"
          checked={value.attendWithoutDeal}
          onCheckedChange={(attendWithoutDeal) => patch({ attendWithoutDeal })}
        />
      </div>

      <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold">Fora do escopo</div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            O que fazer quando a conversa não se encaixa nas regras acima.
            {!restricts && " (sem efeito enquanto nada estiver restrito)"}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => patch({ action: "handoff" })}
            className={cn(
              "rounded-xl border p-3 text-left text-sm transition-colors",
              value.action === "handoff"
                ? "border-indigo-500 bg-[var(--color-indigo-soft)] dark:border-indigo-400 dark:bg-indigo-950/30"
                : "border-border hover:bg-muted/40",
            )}
          >
            <div className="font-medium">Passar para humano</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              Aciona a distribuição para um consultor.
            </div>
          </button>
          <button
            type="button"
            onClick={() => patch({ action: "ignore" })}
            className={cn(
              "rounded-xl border p-3 text-left text-sm transition-colors",
              value.action === "ignore"
                ? "border-indigo-500 bg-[var(--color-indigo-soft)] dark:border-indigo-400 dark:bg-indigo-950/30"
                : "border-border hover:bg-muted/40",
            )}
          >
            <div className="font-medium">Não responder</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              A conversa fica como está, sem mensagem nenhuma.
            </div>
          </button>
        </div>
        {value.action === "handoff" && (
          <div className="grid gap-1.5">
            <Label htmlFor="scope-msg">Mensagem antes de transferir</Label>
            <Textarea
              id="scope-msg"
              value={value.message ?? ""}
              onChange={(e) =>
                patch({ message: e.target.value.trim() || null })
              }
              rows={3}
              className="resize-y rounded-xl text-sm"
              placeholder="Vazio = transfere sem falar nada. Use {{contact.firstName}} para o primeiro nome."
            />
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Até que horário ele atende fica na aba <strong>Pilotagem</strong> →
        Horário de atendimento (com a mensagem de fora do expediente). As
        mensagens de handoff ficam na aba <strong>Inbox</strong>.
      </p>
    </div>
  );
}
