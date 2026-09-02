import type { PageTour } from "../tour-types";

export const pipelineTour: PageTour = {
  id: "pipeline",
  steps: [
    {
      element: "pipeline-switcher",
      title: "Funil atual",
      description:
        "Troque o funil por este seletor ao lado do título. Cada funil tem as próprias etapas e negócios.",
      side: "bottom",
    },
    {
      element: "pipeline-search",
      title: "Busca e filtros",
      description:
        "Pesquise negócios pelo título ou contato. O botão Filtrar, dentro da mesma pílula, abre filtros avançados.",
      side: "bottom",
    },
    {
      element: "pipeline-period",
      title: "Período",
      description:
        "Restrinja o quadro por data de criação ou de fechamento. Os atalhos 7, 30 e 90 dias ficam neste calendário — não no modal de filtros.",
      side: "bottom",
    },
    {
      element: "pipeline-views",
      title: "Visualização",
      description:
        "Alterne entre Kanban, Flow e Lista. A preferência fica nesta página; o tour explica o quadro Kanban.",
      side: "bottom",
    },
    {
      element: "pipeline-kanban",
      title: "Quadro Kanban",
      description:
        "Cada coluna é uma etapa. Arraste o card para mover o negócio, clique para abrir o detalhe e use o + da coluna para criar naquela fase.",
      side: "top",
    },
    {
      element: "pipeline-actions",
      title: "Ações do funil",
      description:
        "Neste menu você cria um negócio, importa, exporta e abre as configurações do funil. Nada é iniciado sozinho — só o que você escolher aqui.",
      side: "bottom",
    },
  ],
};
