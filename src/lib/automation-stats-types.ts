/**
 * Período dos contadores do canvas (`?period=`). Dias de Brasília, calculados
 * no backend (`automation-stats-period`). `all` = sem filtro.
 */
export type StatsPeriod = "all" | "today" | "yesterday" | "7d" | "30d";

export const STATS_PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "all", label: "Tudo" },
];

export type StepStats = {
  stepType: string;
  success: number;
  failed: number;
  skipped: number;
};

export type AutomationStats = {
  trigger: Record<string, number>;
  steps: Record<string, StepStats>;
  /**
   * Saída tomada por passo: `routes[stepId][chave]`. A chave é a do handle no
   * canvas (`btn_0`, `else`, `timeout`, `next`, `failure`…) ou `to:<stepId>`
   * para desvios por destino. Só existe a partir do deploy que passou a gravar
   * `ROUTED`; backend antigo não manda o campo.
   */
  routes?: Record<string, Record<string, number>>;
};
