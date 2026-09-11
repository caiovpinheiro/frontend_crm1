import type { AttendanceScope } from "@/lib/ai-agents/steering";

export type AiHandoffDeal = {
  pipelineId?: string | null;
  stageId?: string | null;
  pipelineName?: string | null;
  stageName?: string | null;
};

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Bloqueia "devolver à IA" com a policy do agente (escopo + aliases),
 * não com regex de tenant no inbox.
 */
export function shouldBlockReturnToAi(input: {
  deals: readonly AiHandoffDeal[];
  departmentName?: string | null;
  scope?: AttendanceScope | null;
  acolhimentoAliases?: string[] | null;
}): boolean {
  const scope = input.scope;
  if (scope) {
    for (const deal of input.deals) {
      if (deal.pipelineId && scope.blockedPipelineIds.includes(deal.pipelineId)) {
        return true;
      }
      if (deal.stageId && scope.blockedStageIds.includes(deal.stageId)) {
        return true;
      }
    }
  }

  const configured = (input.acolhimentoAliases ?? []).map(fold).filter(Boolean);
  const aliases = configured.length > 0 ? configured : ["acolhimento"];
  const labels = [
    ...input.deals.flatMap((d) => [d.pipelineName, d.stageName]),
    input.departmentName,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map(fold);

  return labels.some((label) =>
    aliases.some((alias) => label === alias || label.includes(alias)),
  );
}
