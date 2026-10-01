"use client";

import { apiUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formControlClass, formLabelClass } from "@/components/ui/form-dialog";
import {
  defaultAttendanceScope,
  type AttendanceScope,
} from "@/lib/ai-agents/steering";
import { cn } from "@/lib/utils";

import { ChipInput } from "../chip-input";
import { FieldHelp, SectionHeader } from "../section-header";
import { PREVIEW_PIPELINES } from "../types";

type PipelineWithStages = {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
};

type StageState = "neutral" | "allowed" | "blocked";

export function ScopeSection({
  value,
  onChange,
  preview = false,
}: {
  value: AttendanceScope;
  onChange: (next: AttendanceScope) => void;
  preview?: boolean;
}) {
  const patch = (partial: Partial<AttendanceScope>) =>
    onChange({ ...defaultAttendanceScope(), ...value, ...partial });
  const seededLiveRef = React.useRef(false);

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

  const displayPipelines =
    pipelines.length > 0 ? pipelines : preview ? PREVIEW_PIPELINES : [];

  React.useEffect(() => {
    if (!preview || seededLiveRef.current || isLoading) return;
    if (pipelines.length === 0) return;
    const ids = new Set(pipelines.map((p) => p.id));
    if (value.allowedPipelineIds.some((id) => ids.has(id))) {
      seededLiveRef.current = true;
      return;
    }
    seededLiveRef.current = true;
    const first = pipelines[0];
    const stages = first.stages;
    onChange({
      ...defaultAttendanceScope(),
      ...value,
      allowedPipelineIds: [first.id],
      allowedStageIds: stages.slice(0, Math.min(2, stages.length)).map((s) => s.id),
      blockedStageIds:
        stages.length > 2 ? [stages[stages.length - 1].id] : [],
    });
    // Só no primeiro load do preview, quando os funis reais não batem com os ids mock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, isLoading, pipelines]);

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
    const validStageIds = new Set(
      displayPipelines
        .filter(
          (p) =>
            allowedPipelineIds.length === 0 ||
            allowedPipelineIds.includes(p.id),
        )
        .flatMap((p) => p.stages.map((s) => s.id)),
    );
    patch({
      allowedPipelineIds,
      allowedStageIds: value.allowedStageIds.filter((s) => validStageIds.has(s)),
      blockedStageIds: value.blockedStageIds.filter((s) => validStageIds.has(s)),
    });
  };

  const cycleStage = (stageId: string) => {
    const state = stageState(value, stageId);
    if (state === "neutral") {
      patch({
        allowedStageIds: [...value.allowedStageIds, stageId],
        blockedStageIds: value.blockedStageIds.filter((x) => x !== stageId),
      });
      return;
    }
    if (state === "allowed") {
      patch({
        allowedStageIds: value.allowedStageIds.filter((x) => x !== stageId),
        blockedStageIds: [...value.blockedStageIds, stageId],
      });
      return;
    }
    patch({
      allowedStageIds: value.allowedStageIds.filter((x) => x !== stageId),
      blockedStageIds: value.blockedStageIds.filter((x) => x !== stageId),
    });
  };

  const visiblePipelines =
    value.allowedPipelineIds.length > 0
      ? displayPipelines.filter((p) => value.allowedPipelineIds.includes(p.id))
      : displayPipelines;

  const restricts =
    value.allowedPipelineIds.length > 0 ||
    value.allowedStageIds.length > 0 ||
    value.blockedStageIds.length > 0 ||
    value.allowedContactTags.length > 0 ||
    value.blockedContactTags.length > 0;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Escopo"
        description="Onde o agente pode atuar. Nada marcado = atende qualquer conversa atribuída a ele. Avaliado antes de qualquer resposta."
      />

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Funis</p>
        <FieldHelp>Nenhum marcado = todos os funis.</FieldHelp>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : displayPipelines.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum funil encontrado.</p>
          ) : (
            displayPipelines.map((p) => {
              const on = value.allowedPipelineIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePipeline(p.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {p.name}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Etapas</p>
        <FieldHelp>
          Clique para ciclar: neutro → permitido (verde) → bloqueado (vermelho).
        </FieldHelp>
        <div className="mt-3 space-y-3">
          {visiblePipelines.map((p) => (
            <div key={p.id}>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                {p.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.stages.map((s) => {
                  const state = stageState(value, s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => cycleStage(s.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        state === "allowed" &&
                          "border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]",
                        state === "blocked" &&
                          "border-destructive bg-destructive/10 text-destructive line-through",
                        state === "neutral" &&
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

      <div>
        <label className={formLabelClass}>Tags que ele pode atender</label>
        <ChipInput
          values={value.allowedContactTags}
          onChange={(allowedContactTags) => patch({ allowedContactTags })}
          placeholder="Ex.: calouros1008_1"
          suggestions={tags}
        />
        <FieldHelp>
          Vazio = qualquer tag. Se preencher, só atende contato com ao menos uma.
        </FieldHelp>
      </div>

      <div>
        <label className={formLabelClass}>Tags que ele não pode atender</label>
        <ChipInput
          values={value.blockedContactTags}
          onChange={(blockedContactTags) => patch({ blockedContactTags })}
          placeholder="Ex.: inadimplente"
          suggestions={tags}
        />
        <FieldHelp>Bloqueio vence permissão se as duas listas baterem.</FieldHelp>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Atender contato sem negócio aberto
          </p>
          <FieldHelp>
            Desligado, quem não tem negócio no funil não é atendido pela IA.
          </FieldHelp>
        </div>
        <Switch
          id="scope-no-deal"
          checked={value.attendWithoutDeal}
          onCheckedChange={(attendWithoutDeal) => patch({ attendWithoutDeal })}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Fora do escopo</p>
          <FieldHelp>
            O que fazer quando a conversa não se encaixa.
            {!restricts && " Sem efeito enquanto nada estiver restrito."}
          </FieldHelp>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => patch({ action: "handoff" })}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              value.action === "handoff"
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-medium">Passar para humano</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Aciona a distribuição para um consultor.
            </p>
          </button>
          <button
            type="button"
            onClick={() => patch({ action: "ignore" })}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              value.action === "ignore"
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-medium">Não responder</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A conversa fica como está, sem mensagem.
            </p>
          </button>
        </div>
        {value.action === "handoff" && (
          <div>
            <label htmlFor="scope-msg" className={formLabelClass}>
              Mensagem antes de transferir
            </label>
            <Textarea
              id="scope-msg"
              value={value.message ?? ""}
              onChange={(e) =>
                patch({ message: e.target.value.trim() || null })
              }
              rows={3}
              className={cn(formControlClass.replace("h-11", "min-h-[84px]"), "resize-y py-3 text-sm")}
              placeholder="Vazio = transfere sem falar nada."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function stageState(value: AttendanceScope, stageId: string): StageState {
  if (value.allowedStageIds.includes(stageId)) return "allowed";
  if (value.blockedStageIds.includes(stageId)) return "blocked";
  return "neutral";
}
