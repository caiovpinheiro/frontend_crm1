import type { PageTour } from "../tour-types";

export const distributionCoverageTour: PageTour = {
  id: "distribution-coverage",
  skipMissingElement: false,
  steps: [
    {
      element: "distribution-coverage-search",
      title: "Busca da cobertura",
      description:
        "Filtra a grade por nome e por área. Filtrar também mostra quem foi ocultado da lista.",
      side: "bottom",
      distributionTab: "coverage",
    },
    {
      element: "distribution-coverage-kpis",
      title: "Indicadores de cobertura",
      description:
        "Quantos agentes estão na grade, quem está online, gaps sem expediente e o pico de almoço.",
      side: "bottom",
      distributionTab: "coverage",
    },
    {
      element: "distribution-coverage-controls",
      title: "Dia e presença",
      description:
        "Escolha o dia da semana, recorte por online/ausente e veja o expediente de cada área.",
      side: "bottom",
      distributionTab: "coverage",
    },
    {
      element: "distribution-coverage-grid",
      title: "A grade de expediente",
      description:
        "Cada linha é um agente; as barras mostram horário de trabalho e almoço. Clique na linha para editar o expediente. Marque vários para aplicar o mesmo horário em lote.",
      side: "top",
      distributionTab: "coverage",
    },
  ],
};
