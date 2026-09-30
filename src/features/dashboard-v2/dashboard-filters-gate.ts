/**
 * Quando os filtros do dashboard estão "assentados" o bastante para
 * disparar os painéis.
 *
 * Os filtros vêm da URL (`?pipeline=8`) e só viram CUID depois que a lista
 * de funis carrega; sem funil na URL, um efeito escolhe o primeiro funil e
 * reescreve os filtros; e o restore do localStorage pode trocar período e
 * filtros logo após a sessão ficar pronta. Disparar os painéis antes disso
 * abortava 6–7 GETs e refazia tudo no tick seguinte.
 *
 * Regra: restore concluído + lista de funis carregada + exatamente um funil
 * válido selecionado (o mesmo estado estável que o efeito de funil padrão
 * deixa de alterar). Org sem funis conta como assentado.
 */
export function dashboardFiltersSettled(args: {
  restored: boolean;
  pipelines: ReadonlyArray<{ id: string }> | undefined;
  pipelineIds: readonly string[];
}): boolean {
  if (!args.restored || !args.pipelines) return false;
  if (args.pipelines.length === 0) return true;
  if (args.pipelineIds.length !== 1) return false;
  const id = args.pipelineIds[0];
  return args.pipelines.some((p) => p.id === id);
}
