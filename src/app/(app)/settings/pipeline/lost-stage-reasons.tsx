"use client";

import { apiUrl } from "@/lib/api";
import {
  IconGripVertical,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SwitchGlass } from "@/components/crm/switch-glass";
import { AppLoading } from "@/components/crm/app-loading";
import { cn } from "@/lib/utils";

type PipelineLossMeta = {
  id: string;
  name: string;
  lossReasonRequired: boolean;
  lossReasonAllowOther: boolean;
  reasons: { id: string; label: string; position: number; linkId: string }[];
};

async function fetchMeta(pipelineId: string): Promise<PipelineLossMeta> {
  const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/loss-reasons`));
  if (!res.ok) throw new Error("Erro ao carregar motivos");
  return res.json();
}

/**
 * Bloco estilo Kommo na etapa Perdido: Ativo + personalizado + lista editável.
 */
export function LostStageReasonsPanel({ pipelineId }: { pipelineId: string }) {
  const qc = useQueryClient();
  const [draftNew, setDraftNew] = useState("");

  const metaQuery = useQuery({
    queryKey: ["pipeline-loss-reasons", pipelineId],
    queryFn: () => fetchMeta(pipelineId),
    enabled: !!pipelineId,
  });

  const meta = metaQuery.data;
  const active = Boolean(meta?.lossReasonRequired);
  const allowOther = meta?.lossReasonAllowOther !== false;
  const reasons = meta?.reasons ?? [];

  const saveMut = useMutation({
    mutationFn: async (payload: {
      reasonIds?: string[];
      lossReasonRequired?: boolean;
      lossReasonAllowOther?: boolean;
    }) => {
      const res = await fetch(
        apiUrl(`/api/pipelines/${pipelineId}/loss-reasons`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(err.message || "Erro ao salvar");
      }
      return res.json() as Promise<PipelineLossMeta>;
    },
    onMutate: async (payload) => {
      const key = ["pipeline-loss-reasons", pipelineId] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PipelineLossMeta>(key);
      if (prev) {
        qc.setQueryData<PipelineLossMeta>(key, {
          ...prev,
          ...(typeof payload.lossReasonRequired === "boolean"
            ? { lossReasonRequired: payload.lossReasonRequired }
            : {}),
          ...(typeof payload.lossReasonAllowOther === "boolean"
            ? { lossReasonAllowOther: payload.lossReasonAllowOther }
            : {}),
        });
      }
      return { prev, key };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev && ctx.key) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    },
    onSuccess: (data) => {
      qc.setQueryData(["pipeline-loss-reasons", pipelineId], data);
      void qc.invalidateQueries({ queryKey: ["loss-reasons"] });
    },
  });

  const createMut = useMutation({
    mutationFn: async (label: string) => {
      const res = await fetch(apiUrl("/api/settings/loss-reasons"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("Erro ao criar");
      const created = (await res.json()) as { id: string };
      const current = reasons.map((r) => r.id);
      const linkRes = await fetch(
        apiUrl(`/api/pipelines/${pipelineId}/loss-reasons`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reasonIds: [...current, created.id] }),
        },
      );
      if (!linkRes.ok) throw new Error("Erro ao vincular");
      return linkRes.json() as Promise<PipelineLossMeta>;
    },
    onSuccess: (data) => {
      setDraftNew("");
      qc.setQueryData(["pipeline-loss-reasons", pipelineId], data);
      void qc.invalidateQueries({ queryKey: ["loss-reasons"] });
    },
    onError: () => toast.error("Não foi possível adicionar o motivo"),
  });

  const renameMut = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const res = await fetch(apiUrl(`/api/settings/loss-reasons/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("Erro ao renomear");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pipeline-loss-reasons", pipelineId] });
      void qc.invalidateQueries({ queryKey: ["loss-reasons"] });
    },
  });

  function onDragEnd(result: DropResult) {
    if (!result.destination || !meta) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    const next = [...reasons];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    qc.setQueryData<PipelineLossMeta>(["pipeline-loss-reasons", pipelineId], {
      ...meta,
      reasons: next.map((r, i) => ({ ...r, position: i })),
    });
    saveMut.mutate({ reasonIds: next.map((r) => r.id) });
  }

  function unlink(reasonId: string) {
    saveMut.mutate({
      reasonIds: reasons.filter((r) => r.id !== reasonId).map((r) => r.id),
    });
  }

  function submitNew() {
    const t = draftNew.trim();
    if (!t || createMut.isPending) return;
    createMut.mutate(t);
  }

  if (metaQuery.isLoading) {
    return (
      <AppLoading variant="inline" className="mb-3 min-h-[112px]" />
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-2.5 py-2.5">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Motivo da perda
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--text-muted)]">
            Registre motivos ao marcar perdido neste funil.
          </p>
        </div>
        <SwitchGlass
          checked={active}
          onChange={(v) => saveMut.mutate({ lossReasonRequired: v })}
          disabled={saveMut.isPending}
          aria-label="Ativar motivos de perda"
        />
      </div>

      <label
        className={cn(
          "mb-2 flex items-center justify-between gap-2 rounded-md border border-[var(--glass-border)] px-2 py-1.5",
          !active && "opacity-50",
        )}
      >
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">
          Permite personalizado
        </span>
        <SwitchGlass
          checked={allowOther}
          onChange={(v) => saveMut.mutate({ lossReasonAllowOther: v })}
          disabled={!active || saveMut.isPending}
          aria-label="Permitir motivo fora da lista"
        />
      </label>

      <div className={cn(!active && "pointer-events-none opacity-45")}>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId={`lost-reasons-${pipelineId}`}>
            {(drop) => (
              <div
                ref={drop.innerRef}
                {...drop.droppableProps}
                className="flex flex-col gap-1.5"
              >
                {reasons.map((item, index) => (
                  <Draggable
                    key={item.id}
                    draggableId={item.id}
                    index={index}
                    isDragDisabled={!active}
                  >
                    {(drag, snapshot) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={cn(
                          "flex items-center gap-1 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-1 py-0.5",
                          snapshot.isDragging &&
                            "border-[var(--brand-primary)] shadow-[var(--glass-shadow-sm)]",
                        )}
                      >
                        <button
                          type="button"
                          aria-label="Reordenar"
                          className="flex size-7 shrink-0 cursor-grab items-center justify-center text-[var(--text-muted)] active:cursor-grabbing"
                          {...drag.dragHandleProps}
                        >
                          <IconGripVertical size={14} />
                        </button>
                        <ReasonInput
                          value={item.label}
                          disabled={!active}
                          onSave={(label) =>
                            renameMut.mutate({ id: item.id, label })
                          }
                        />
                        <button
                          type="button"
                          title="Remover"
                          aria-label="Remover motivo"
                          className="flex size-7 shrink-0 items-center justify-center text-[var(--color-danger-text)]/80 hover:text-[var(--color-danger-text)]"
                          onClick={() => unlink(item.id)}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {drop.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className="mt-1.5 flex items-center gap-1 rounded-md border border-dashed border-[var(--glass-border)] px-1 py-0.5">
          <span className="flex size-7 shrink-0 items-center justify-center text-[var(--text-muted)]">
            <IconPlus size={14} />
          </span>
          <input
            value={draftNew}
            disabled={!active || createMut.isPending}
            onChange={(e) => setDraftNew(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNew();
              }
            }}
            onBlur={() => {
              if (draftNew.trim()) submitNew();
            }}
            placeholder="Novo motivo…"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
      </div>
    </div>
  );
}

function ReasonInput({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled?: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t && t !== value) onSave(t);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="min-w-0 flex-1 bg-transparent py-1.5 text-[12px] font-medium text-[var(--text-primary)] outline-none disabled:cursor-not-allowed"
    />
  );
}
