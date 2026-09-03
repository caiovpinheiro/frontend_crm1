import type { PageTour } from "../tour-types";

/** Aba Chamadas — histórico do softphone. */
export const logsCallsTour: PageTour = {
  id: "logs-calls",
  skipMissingElement: false,
  steps: [
    {
      element: "logs-calls-search",
      title: "Pesquisar e filtrar chamadas",
      description:
        "Busque por número ou nome. Filtrar, à direita da pílula, recorta por direção (feitas, recebidas) e por status (atendidas, perdidas…).",
      side: "bottom",
      logsTab: 1,
    },
    {
      element: "logs-calls-period",
      title: "Período das chamadas",
      description:
        "Recorta o histórico por um intervalo de datas. Limpe para ver tudo.",
      side: "bottom",
      logsTab: 1,
    },
    {
      element: "logs-view",
      title: "Cards ou tabela",
      description:
        "Alterne o histórico entre cards e tabela, do jeito que preferir revisar.",
      side: "bottom",
      logsTab: 1,
    },
    {
      element: "logs-calls-kpis",
      title: "Resumo das ligações",
      description:
        "Ligações feitas, recebidas, atendidas e completadas, com os percentuais sobre o total do período filtrado.",
      side: "bottom",
      logsTab: 1,
    },
    {
      element: "logs-calls-list",
      title: "Histórico de chamadas",
      description:
        "Cada linha é uma ligação: contato, direção, duração, status e gravação quando disponível, agrupadas por dia.",
      side: "left",
      logsTab: 1,
    },
    {
      element: "logs-calls-actions",
      title: "Menu de ações",
      description:
        "Daqui você sincroniza o histórico com a telefonia e abre as configurações do widget. Avance para ver cada opção.",
      side: "bottom",
      logsTab: 1,
      openMenu: "logs-calls-actions",
    },
    {
      element: "logs-calls-sync",
      title: "Sincronizar",
      description:
        "Busca agora as ligações mais recentes na operadora e atualiza esta lista.",
      side: "left",
      logsTab: 1,
      fallback: "menu-item",
      fallbackLabel: "Sincronizar",
    },
    {
      element: "logs-calls-settings",
      title: "Configurações",
      description:
        "Abre a Central de Widgets já na configuração do histórico de chamadas.",
      side: "left",
      logsTab: 1,
      fallback: "menu-item",
      fallbackLabel: "Configurações",
    },
  ],
};
