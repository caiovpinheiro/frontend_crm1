/**
 * Visibilidade das etapas no Kanban e no Flow.
 *
 * Ganho/Perdido (etapas preset `isWon`/`isLost`) começam ocultas. O filtro
 * de Etapas as revela: "Exibir todas as fases" ou multi-seleção. Filtros
 * que só fazem sentido com negócios fechados (status Ganho/Perdido, motivo
 * de perda, período de fechamento) também revelam a coluna correspondente —
 * senão "Leads ganhos" abriria o quadro vazio.
 *
 * Só esconde colunas: menus de mover etapa, drawer e deep link continuam
 * com o board completo.
 */

import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";

type StageLike = {
  id: string;
  isWon?: boolean | null;
  isLost?: boolean | null;
};

export type StageVisibilityFilters = Pick<
  AdvancedDealFilters,
  "stageIds" | "statuses" | "lostReasons" | "closedAt" | "showAllStages"
>;

export function visibleBoardStages<T extends StageLike>(
  stages: T[],
  filters: StageVisibilityFilters | null | undefined,
): T[] {
  if (filters?.showAllStages) return stages;

  const picked = filters?.stageIds ?? [];
  if (picked.length > 0) {
    const set = new Set(picked);
    const hit = stages.filter((s) => set.has(s.id));
    // Etapas de outro funil (filtro salvo/URL) → cai no padrão.
    if (hit.length > 0) return hit;
  }

  const statuses = filters?.statuses ?? [];
  const closedPeriod = !!(filters?.closedAt?.from || filters?.closedAt?.to);
  const showWon = closedPeriod || statuses.includes("WON");
  const showLost =
    closedPeriod ||
    statuses.includes("LOST") ||
    (filters?.lostReasons?.length ?? 0) > 0;

  const visible = stages.filter((s) =>
    s.isWon ? showWon : s.isLost ? showLost : true,
  );
  return visible.length === stages.length ? stages : visible;
}

/**
 * Escopo server-side ("selecionar todos do filtro" na edição em massa)
 * alinhado às colunas visíveis — sem isso o lote incluiria os negócios
 * das etapas ocultas.
 */
export function filtersForVisibleStages(
  filters: AdvancedDealFilters,
  visible: readonly StageLike[],
  all: readonly StageLike[],
): AdvancedDealFilters {
  if (visible.length === all.length) return filters;
  return { ...filters, stageIds: visible.map((s) => s.id) };
}
