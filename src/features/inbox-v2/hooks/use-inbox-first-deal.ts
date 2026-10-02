"use client";

import { useMemo } from "react";

import type { PipelineListStageDto } from "@/features/pipeline-v2/api";
import { useDealDetail, usePipelines } from "@/features/pipeline-v2/hooks";

import type { toContactAside } from "../adapters";

/**
 * Funil do primeiro deal do contato ativo (card do ContactAside e abas do
 * chat).
 *
 * pipelineId já vem achatado no GET contact (?view=inbox). Não espera
 * useDealDetail nem carrega o board completo (~150KB) — só stages via
 * GET /api/pipelines (~3KB, staleTime 5min).
 */
export function useInboxFirstDeal(params: {
  contactAsideView: ReturnType<typeof toContactAside> | null;
  effectiveAsideCollapsed: boolean;
  canFetchInbox: boolean;
}) {
  const { contactAsideView, effectiveAsideCollapsed, canFetchInbox } = params;

  const firstDeal = contactAsideView?.deals?.[0] ?? null;
  const firstDealId = firstDeal?.id ?? null;
  const { data: firstDealDetail } = useDealDetail(
    effectiveAsideCollapsed ? null : firstDealId,
  );
  const dealStage = (
    firstDealDetail as
      | { stage?: { id?: string; pipeline?: { id?: string; name?: string } } }
      | undefined
  )?.stage;
  const firstDealPipelineId =
    firstDeal?.pipelineId ?? dealStage?.pipeline?.id ?? null;
  const firstDealPipelineName =
    firstDeal?.pipelineName ?? dealStage?.pipeline?.name ?? null;
  const { data: pipelinesLite } = usePipelines(
    canFetchInbox && !!firstDealPipelineId,
  );
  const boardStages: PipelineListStageDto[] = useMemo(() => {
    if (!firstDealPipelineId || !pipelinesLite) return [];
    const pipe = pipelinesLite.find((p) => p.id === firstDealPipelineId);
    return pipe?.stages ?? [];
  }, [pipelinesLite, firstDealPipelineId]);

  // Monta funnelSegments e stageDropdownSlot para o primeiro deal.
  // Os demais deals ficam com fallback (sem barra + stageName estático).
  const firstDealFunnelSegments = boardStages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? "var(--brand-primary)",
    position: s.position,
  }));
  const firstDealStageId = firstDeal?.stageId ?? dealStage?.id ?? null;
  const firstDealStageName =
    boardStages.find((s) => s.id === firstDealStageId)?.name ??
    firstDeal?.stageName ??
    null;

  return {
    firstDeal,
    firstDealId,
    firstDealDetail,
    firstDealPipelineId,
    firstDealPipelineName,
    boardStages,
    firstDealFunnelSegments,
    firstDealStageId,
    firstDealStageName,
  };
}
