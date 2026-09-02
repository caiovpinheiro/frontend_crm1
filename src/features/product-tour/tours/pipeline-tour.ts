import type { PageTour } from "../tour-types";

export const pipelineTour: PageTour = {
  id: "pipeline",
  steps: [
    {
      element: "pipeline-switcher",
      title: "Seu Pipeline",
      description:
        "Os negócios ficam organizados nas etapas do seu processo comercial. Troque de funil aqui — cada um tem o próprio fluxo, responsáveis e volume.",
      side: "bottom",
    },
    {
      element: "pipeline-search",
      title: "Pesquisar e filtrar",
      description:
        "Busque por título, contato ou número. O botão Filtrar, na mesma pílula, abre dono, tags, status e filtros salvos.",
      side: "bottom",
    },
    {
      element: "pipeline-period",
      title: "Período",
      description:
        "Veja só o que entrou ou fechou em um intervalo. Use 7, 30 ou 90 dias, ou escolha as datas de criação e de fechamento.",
      side: "bottom",
    },
    {
      element: "pipeline-views",
      title: "Kanban, Flow e Lista",
      description:
        "Kanban é o quadro por etapa. Flow junta a fila com o chat do negócio. Lista é a tabela para revisar e editar em lote.",
      side: "bottom",
    },
    {
      element: "pipeline-kanban",
      title: "Quadro Kanban",
      description:
        "Cada coluna é uma etapa do funil. Arraste o card para avançar, clique para abrir conversa e detalhes, e use o + da coluna para criar já naquela fase.",
      side: "top",
    },
    {
      element: "pipeline-actions",
      title: "Ações do funil",
      description:
        "Daqui você cria um negócio, importa planilha, exporta o quadro, liga canais e abre as configurações do funil.",
      side: "bottom",
    },
  ],
};
