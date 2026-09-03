import type { PageTour } from "../tour-types";

/** Dashboard do operador — /dashboard “Sua fila”. */
export const dashboardOperatorTour: PageTour = {
  id: "dashboard-operator",
  skipMissingElement: false,
  steps: [
    {
      element: "dash-search",
      title: "Pesquisar na fila",
      description:
        "Filtra conversas, tarefas e negócios parados pelo texto do card.",
      side: "bottom",
    },
    {
      element: "dash-actions",
      title: "Ações",
      description:
        "Adicionar card devolve um bloco escondido. Organizar cards permite reordenar a sua fila.",
      side: "bottom",
      openMenu: "dash-actions",
    },
    {
      element: "dash-add-card",
      title: "Adicionar card",
      description: "Reabre Indicadores, Conversas, Tarefas ou Negócios parados.",
      side: "left",
      fallback: "menu-item",
      fallbackLabel: "Adicionar card",
      closeMenu: "dash-actions",
    },
    {
      element: "dash-op-kpis",
      title: "Indicadores da sua fila",
      description:
        "Aguardando você (Inbox), tarefas de hoje/atrasadas e negócios parados no seu nome. Cada card abre a tela correspondente.",
      side: "bottom",
      fallback: "generic",
      fallbackAnchor: "dash-search",
      fallbackLabel: "Indicadores da fila",
    },
    {
      element: "dash-op-queue",
      title: "Conversas, tarefas e parados",
      description:
        "Abaixo dos indicadores, as listas do que precisa da sua ação agora. A busca do cabeçalho recorta as três.",
      side: "top",
      fallback: "generic",
      fallbackAnchor: "dash-op-kpis",
      fallbackLabel: "Listas da sua fila",
    },
  ],
};
