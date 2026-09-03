import type { PageTour } from "../tour-types";

/** Aba Estatísticas — volume do feed por tipo e ator. */
export const logsStatsTour: PageTour = {
  id: "logs-stats",
  skipMissingElement: false,
  steps: [
    {
      element: "logs-period",
      title: "Período",
      description:
        "As estatísticas usam o mesmo período da aba Eventos. Os presets 7, 30 e 90 dias ficam neste ícone.",
      side: "bottom",
      logsTab: 2,
    },
    {
      element: "logs-stats-panel",
      title: "Estatísticas da operação",
      description:
        "Os gráficos mostram o volume de eventos no período: o que mais acontece, quem mais agiu (humanos, IA, automações) e a movimentação por funil.",
      side: "top",
      logsTab: 2,
    },
  ],
};
