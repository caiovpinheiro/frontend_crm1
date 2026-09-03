import type { PageTour } from "../tour-types";

/** Aba Eventos — feed de atividade da operação. */
export const logsTour: PageTour = {
  id: "logs",
  skipMissingElement: false,
  steps: [
    {
      element: "logs-search",
      title: "Pesquisar e filtrar eventos",
      description:
        "Busque pelo texto do evento. Filtrar, à direita da pílula, recorta por entidade, por ator (humano, IA, automação…) e por mudança de fase no funil.",
      side: "bottom",
      logsTab: 0,
    },
    {
      element: "logs-period",
      title: "Período",
      description:
        "Limita quais eventos entram na lista. Os presets 7, 30 e 90 dias ficam neste ícone, fora da pílula de busca.",
      side: "bottom",
      logsTab: 0,
    },
    {
      element: "logs-view",
      title: "Cards ou tabela",
      description:
        "Alterne o feed entre cards e tabela. Na tabela, clique nos cabeçalhos para ordenar por evento, entidade, origem ou data.",
      side: "bottom",
      logsTab: 0,
    },
    {
      element: "logs-tabs",
      title: "As quatro abas",
      description:
        "Eventos: o feed da operação. Chamadas: histórico do softphone. Estatísticas: volume por tipo e ator. Uso do sistema: consumo dos recursos. Cada aba tem o próprio tour: mude de aba e toque no ? dela.",
      side: "bottom",
      logsTab: 0,
    },
    {
      element: "logs-kpis",
      title: "Resumo do lote",
      description:
        "Total de eventos carregados e quantos são mensagens, conversas e negócios. Os números acompanham os filtros aplicados.",
      side: "bottom",
      logsTab: 0,
    },
    {
      element: "logs-list",
      title: "O feed de eventos",
      description:
        "Cada linha é um evento: o que aconteceu, em qual entidade, a origem (canal, cliente ou agente), quem fez e quando. Na Entidade, copie o ID ou o link, ou abra o registro direto.",
      side: "left",
      logsTab: 0,
    },
    {
      element: "logs-actions",
      title: "Menu de ações",
      description:
        "Daqui você limpa os filtros ativos e liga o modo de demonstração. Avance para ver cada opção.",
      side: "bottom",
      logsTab: 0,
      openMenu: "logs-actions",
    },
    {
      element: "logs-clear-filters",
      title: "Limpar filtros",
      description:
        "Remove de uma vez busca, entidade, ator, período e transição de fase, voltando ao feed completo.",
      side: "left",
      logsTab: 0,
      fallback: "menu-item",
      fallbackLabel: "Limpar filtros",
    },
    {
      element: "logs-demo",
      title: "Modo demonstração",
      description:
        "Mostra um evento de cada tipo para você conhecer as variações visuais do feed, mesmo sem dados reais.",
      side: "left",
      logsTab: 0,
      fallback: "menu-item",
      fallbackLabel: "Ativar modo demo",
    },
  ],
};
