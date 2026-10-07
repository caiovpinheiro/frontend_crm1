"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SwitchGlass } from "@/components/crm/switch-glass";
import { PIPELINES_QUERY_KEY } from "@/features/shared/queries/pipelines";
import { apiUrl } from "@/lib/api";

/**
 * Opção do funil aberto em /settings/pipeline.
 * Ligado: o mesmo contato pode ter vários negócios abertos neste funil.
 * Desligado: fica um negócio aberto por contato e os repetidos são unidos.
 */
export function DuplicateDealsSetting({ pipelineId }: { pipelineId: string }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pipeline-duplicate-deals", pipelineId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}/duplicate-deals`));
      if (!res.ok) throw new Error("Erro ao ler a opção do funil.");
      const data = (await res.json()) as { allowDuplicateDeals?: boolean };
      return data.allowDuplicateDeals !== false;
    },
  });

  const save = useMutation({
    mutationFn: async (allowDuplicateDeals: boolean) => {
      const res = await fetch(apiUrl(`/api/pipelines/${pipelineId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowDuplicateDeals }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        duplicatesRemoved?: number;
      };
      if (!res.ok) throw new Error(data.message || "Erro ao salvar.");
      return data;
    },
    onSuccess: async (data, allowDuplicateDeals) => {
      queryClient.setQueryData(
        ["pipeline-duplicate-deals", pipelineId],
        allowDuplicateDeals,
      );
      await queryClient.invalidateQueries({ queryKey: ["pipeline-board", pipelineId] });
      await queryClient.invalidateQueries({ queryKey: PIPELINES_QUERY_KEY });
      const removed = data.duplicatesRemoved ?? 0;
      if (!allowDuplicateDeals && removed > 0) {
        toast.success(
          removed === 1
            ? "1 negócio repetido foi unido ao que está mais à frente."
            : `${removed} negócios repetidos foram unidos ao que está mais à frente.`,
        );
        return;
      }
      if (!allowDuplicateDeals) {
        toast.success("Preferência salva. Os cards repetidos estão sendo unidos.");
        return;
      }
      toast.success("Preferência do funil salva.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao salvar.");
    },
  });

  const allowDuplicates = query.data ?? true;

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold text-foreground">
          Negócios duplicados
        </p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          Ligado, o mesmo contato pode ter vários negócios abertos neste funil.
          Desligado, fica um negócio aberto por contato: os cards repetidos são
          unidos no que está mais à frente e a conversa fica nele.
        </p>
        {query.isError ? (
          <p className="mt-1 text-xs text-destructive">Não foi possível carregar esta opção.</p>
        ) : null}
      </div>
      <SwitchGlass
        checked={allowDuplicates}
        disabled={!query.isSuccess || save.isPending}
        onChange={(next) => {
          if (next === allowDuplicates || !query.isSuccess) return;
          if (!next) {
            const ok = window.confirm(
              "Cada contato fica com um único negócio aberto neste funil. Os cards repetidos são unidos no que está mais à frente, e a conversa permanece nesse negócio. Continuar?",
            );
            if (!ok) return;
          }
          save.mutate(next);
        }}
        aria-label="Permitir negócios duplicados do mesmo contato"
        size="sm"
      />
    </div>
  );
}
