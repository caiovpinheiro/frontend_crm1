import type { PageTour } from "../tour-types";

export const distributionQueueTour: PageTour = {
  id: "distribution-queue",
  skipMissingElement: false,
  steps: [
    {
      element: "distribution-view",
      title: "Cards ou tabela",
      description:
        "Alterne a fila de espera entre cards e tabela, do jeito que preferir revisar.",
      side: "bottom",
      distributionTab: "queue",
    },
    {
      element: "distribution-kpis",
      title: "Capacidade agora",
      description:
        "Elegíveis, indisponíveis, conversas aguardando resposta e o que está na fila de espera. Os percentuais mostram cobertura e taxa de sucesso.",
      side: "bottom",
      distributionTab: "queue",
    },
    {
      element: "distribution-queue",
      title: "Fila de espera",
      description:
        "Atendimentos sem responsável elegível. Reprocessar agora tenta distribuir de novo. Clique no contato para abrir na Inbox.",
      side: "left",
      distributionTab: "queue",
    },
  ],
};
