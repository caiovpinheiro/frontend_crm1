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
