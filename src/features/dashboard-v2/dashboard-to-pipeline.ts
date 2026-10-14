import { SOURCE_NONE, type DashboardFiltersState } from "@/features/dashboard-v2/api";

/**
 * Filtros estruturais do Dashboard → URL da lista do Pipeline.
 * O período analítico (Hoje, 7 dias…) não vira `created`.
 * `userIds` é o filtro de usuário do painel, não o responsável do negócio.
 */
export function dashboardFiltersToPipelineHref(input: {
  filters: Pick<
    DashboardFiltersState,
    | "stageIds"
    | "tagIds"
    | "ownerIds"
    | "sources"
    | "idleMinutes"
    | "lastMessageDirection"
  >;
  pipelineRef?: string | null;
  /** Etapa clicada no funil. Substitui o filtro de etapas do Dashboard. */
  stageId?: string | null;
}): string {
  const sp = new URLSearchParams();
  if (input.pipelineRef) sp.set("pipeline", input.pipelineRef);
  const stages = input.stageId ? [input.stageId] : input.filters.stageIds;
  if (stages.length) sp.set("stages", stages.join(","));
  if (input.filters.ownerIds.length) sp.set("owner", input.filters.ownerIds.join(","));
  if (input.filters.tagIds.length) sp.set("tags", input.filters.tagIds.join(","));
  if (input.filters.sources.length) {
    sp.set(
      "source",
      input.filters.sources.map((s) => (s === SOURCE_NONE ? "none" : s)).join(","),
    );
  }
  if (input.filters.idleMinutes) {
    sp.set("idle", String(input.filters.idleMinutes));
    sp.set("sort", "interaction_oldest");
  }
  if (input.filters.lastMessageDirection) {
    sp.set("dir", input.filters.lastMessageDirection);
  }
  const q = sp.toString();
  return q ? `/pipeline/list?${q}` : "/pipeline/list";
}
