import type { PageTour } from "../tour-types";

export const distributionLogsTour: PageTour = {
  id: "distribution-logs",
  skipMissingElement: false,
  steps: [
    {
      element: "distribution-period",
      title: "Período dos logs",
      description:
        "Recorta o histórico pelos presets 7, 30 e 90 dias ou por um intervalo.",
      side: "bottom",
      distributionTab: "logs",
      fallback: "header-control",
    },
    {
      element: "distribution-view",
      title: "Cards ou tabela",
      description:
        "Alterne o histórico entre cards e tabela, do jeito que preferir revisar.",
      side: "bottom",
      distributionTab: "logs",
    },
    {
      element: "distribution-logs",
      title: "Logs de distribuição",
      description:
        "Cada evento: se o lead foi atribuído, para quem, de qual departamento e a origem (automático, IA ou manual). Filtrar recorta por resultado e origem.",
      side: "left",
      distributionTab: "logs",
    },
  ],
};
