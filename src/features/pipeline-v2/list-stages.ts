/**
 * Etapas leves para a lista de negócios (`/pipeline/list`).
 *
 * A lista só precisa de id/nome/cor/isLost das etapas (menu de mover,
 * "Novo negócio", contexto do lote). Antes ela baixava o board inteiro
 * (`GET /board`, ~175 KB com 100 cards por coluna) só para isso. O
 * `GET /api/pipelines` — que a página já carrega para o seletor de funil —
 * traz `stages` (ordenadas por position e filtradas por visibilidade),
 * então a lista deriva daí sem nenhuma requisição extra.
 */

export type ListStage = {
  id: string;
  name: string;
  color?: string;
  isLost: boolean;
};

type PipelineWithStages = {
  id: string;
  stages?: Array<{
    id: string;
    name: string;
    color?: string | null;
    isLost?: boolean | null;
  }>;
};

const EMPTY: ListStage[] = [];

export function stagesForList(
  pipelines: readonly PipelineWithStages[] | undefined,
  pipelineId: string | null | undefined,
): ListStage[] {
  if (!pipelineId || !pipelines?.length) return EMPTY;
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  if (!pipeline?.stages?.length) return EMPTY;
  return pipeline.stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? undefined,
    isLost: Boolean(s.isLost),
  }));
}
