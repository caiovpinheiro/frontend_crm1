/*
 * Funil do Painel: origens (`inflow`) e destinos (`outflow`) de cada etapa
 * viram linhas com rótulo legível. O nome vem do payload (`*StageName`);
 * sem ele, das etapas do funil em cache; sem nenhum dos dois, "outro funil".
 */

import type { PainelFunnelInflow, PainelFunnelOutflow } from "./painel-api";

export type FunnelFlowRow = { key: string; label: string; count: number };

/** Funis em cache (GET /api/pipelines) — só o necessário para nomear etapas. */
export type FunnelFlowPipeline = {
  id: string;
  name?: string;
  stages?: ReadonlyArray<{ id: string; name?: string }>;
};

type StageInfo = { name: string; pipelineId?: string };

export type FunnelStageLookup = (stageId: string) => StageInfo | undefined;

/**
 * Índice id → nome das etapas: primeiro as do funil exibido (payload do
 * Painel), depois as dos funis em cache.
 */
export function funnelStageLookup(
  funnelStages: ReadonlyArray<{ id: string; name: string }>,
  pipelines: ReadonlyArray<FunnelFlowPipeline> | undefined,
): FunnelStageLookup {
  const map = new Map<string, StageInfo>();
  for (const p of pipelines ?? []) {
    for (const s of p.stages ?? []) {
      const name = s.name?.trim();
      if (name) map.set(s.id, { name, pipelineId: p.id });
    }
  }
  for (const s of funnelStages) {
    const name = s.name.trim();
    if (name && !map.has(s.id)) map.set(s.id, { name });
  }
  return (stageId) => map.get(stageId);
}

const OTHER_ID = "other";

/**
 * "(outro funil)": o backend só manda `*PipelineId` quando a etapa do outro
 * lado é de outro funil; sem ele, vale o funil da etapa no cache.
 */
function otherPipeline(
  payloadPipelineId: string | undefined,
  cachedPipelineId: string | undefined,
  current: ReadonlyArray<string>,
): boolean {
  if (payloadPipelineId) return !current.includes(payloadPipelineId);
  return Boolean(cachedPipelineId && current.length > 0 && !current.includes(cachedPipelineId));
}

/** "de Qualificação 3 · criados aqui 2 · outro funil 1 · outras 1". */
export function inflowRows(
  inflow: ReadonlyArray<PainelFunnelInflow>,
  lookup: FunnelStageLookup,
  currentPipelineIds: ReadonlyArray<string> = [],
): FunnelFlowRow[] {
  return inflow
    .filter((row) => row.count > 0)
    .map((row, i) => {
      const id = row.fromStageId;
      if (id == null) return { key: `created-${i}`, label: "criados aqui", count: row.count };
      if (id === OTHER_ID) {
        return { key: `other-${i}`, label: "outras", count: row.count };
      }
      const known = lookup(id);
      const name = row.fromStageName?.trim() || known?.name;
      if (!name) return { key: `${id}-${i}`, label: "outro funil", count: row.count };
      const suffix = otherPipeline(row.fromPipelineId, known?.pipelineId, currentPipelineIds)
        ? " (outro funil)"
        : "";
      return { key: `${id}-${i}`, label: `de ${name}${suffix}`, count: row.count };
    });
}

/** "para Proposta 4 · para Perdido 2 · para outro funil 1 · outras 1". */
export function outflowRows(
  outflow: ReadonlyArray<PainelFunnelOutflow>,
  lookup: FunnelStageLookup,
  currentPipelineIds: ReadonlyArray<string> = [],
): FunnelFlowRow[] {
  return outflow
    .filter((row) => row.count > 0)
    .map((row, i) => {
      const id = row.toStageId;
      if (id === OTHER_ID) {
        return { key: `other-${i}`, label: "outras", count: row.count };
      }
      const known = lookup(id);
      const name = row.toStageName?.trim() || known?.name;
      if (!name) return { key: `${id}-${i}`, label: "para outro funil", count: row.count };
      const suffix = otherPipeline(row.toPipelineId, known?.pipelineId, currentPipelineIds)
        ? " (outro funil)"
        : "";
      return { key: `${id}-${i}`, label: `para ${name}${suffix}`, count: row.count };
    });
}
