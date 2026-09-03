import type { PageTour } from "../tour-types";

/** Aba Uso do sistema — consumo dos recursos da conta. */
export const logsUsageTour: PageTour = {
  id: "logs-usage",
  skipMissingElement: false,
  steps: [
    {
      element: "logs-usage-period",
      title: "Período",
      description:
        "Recorta o consumo pelos presets 7, 30 e 90 dias. O recorte vale só para esta aba.",
      side: "bottom",
      logsTab: 3,
    },
    {
      element: "logs-view",
      title: "Cards ou tabela",
      description:
        "Alterne a visão do consumo entre cards e tabela, do jeito que preferir analisar.",
      side: "bottom",
      logsTab: 3,
    },
    {
      element: "logs-usage-panel",
      title: "Uso do sistema",
      description:
        "Quanto a conta consumiu de cada recurso no período — mensagens, armazenamento, minutos de ligação e execuções de automação — para acompanhar limites e custos.",
      side: "top",
      logsTab: 3,
    },
  ],
};
