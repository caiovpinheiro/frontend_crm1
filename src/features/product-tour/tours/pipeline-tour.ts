import type { PageTour } from "../tour-types";

export const pipelineTour: PageTour = {
  id: "pipeline",
  steps: [
    {
      element: "pipeline-switcher",
      title: "Seu Pipeline",
      description:
        "Visualize os negócios organizados pelas etapas do seu processo comercial. Troque de funil por este seletor.",
      side: "bottom",
    },
    {
      element: "pipeline-search",
      title: "Pesquisar e filtrar",
      description:
        "Encontre negócios rapidamente ou filtre os resultados exibidos.",
      side: "bottom",
    },
    {
      element: "pipeline-period",
      title: "Período",
      description:
        "Restrinja o quadro por data de criação ou de fechamento. Os atalhos 7, 30 e 90 dias ficam neste calendário.",
      side: "bottom",
    },
    {
      element: "pipeline-views",
      title: "Kanban, Flow e Lista",
      description:
        "Alterne a forma de ver o funil. Este tour apresenta o quadro Kanban.",
      side: "bottom",
    },
    {
      element: "pipeline-kanban",
      title: "Quadro Kanban",
      description:
        "Cada coluna é uma etapa. Arraste o card para mover, clique para abrir o detalhe.",
      side: "top",
    },
    {
      element: "pipeline-actions",
      title: "Ações do funil",
      description:
        "Crie um negócio, importe, exporte ou abra as configurações do funil.",
      side: "bottom",
    },
  ],
};
