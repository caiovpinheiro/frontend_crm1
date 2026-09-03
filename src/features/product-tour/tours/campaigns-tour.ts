import type { PageTour } from "../tour-types";

export const campaignsTour: PageTour = {
  id: "campaigns",
  skipMissingElement: false,
  steps: [
    {
      element: "campaigns-search",
      title: "Pesquisar e filtrar",
      description:
        "Encontre uma campanha pelo nome ou filtre por status — rascunho, enviando, concluída e os demais.",
      side: "bottom",
    },
    {
      element: "campaigns-kpis",
      title: "Acompanhe os disparos",
      description:
        "Total de campanhas, quantas estão em envio agora, leitura, respostas e falhas. Os números somam todas as campanhas, não só a página atual.",
      side: "bottom",
    },
    {
      element: "campaigns-view",
      title: "Escolha a visualização",
      description:
        "Alterne entre Cards e Tabela para ver suas campanhas do jeito que preferir.",
      side: "bottom",
    },
    {
      element: "campaigns-section-switcher",
      title: "Automações e campanhas",
      description:
        "Alterne rapidamente entre a gestão das automações e das campanhas.",
      side: "bottom",
    },
    {
      element: "campaigns-list",
      title: "Suas campanhas",
      description:
        "Cada linha mostra o público, o status, leitura, respostas e falhas. Em envio, a barra de progresso substitui as métricas. Clique na linha para abrir o painel da campanha.",
      side: "left",
    },
    {
      element: "campaigns-status",
      title: "Status do disparo",
      description:
        "O badge indica se a campanha está em rascunho, enviando, pausada ou concluída. O triângulo vermelho marca falha ou anomalia.",
      side: "left",
    },
    {
      element: "campaigns-actions",
      title: "Nova campanha e segmentos",
      description:
        "Este menu cria um disparo novo ou abre os segmentos salvos. Avance para ver cada opção.",
      side: "bottom",
      openMenu: "campaigns-actions",
    },
    {
      element: "campaigns-new",
      title: "Nova campanha",
      description:
        "Abre o assistente em três passos: básico do disparo, audiência e conteúdo. A campanha nasce em rascunho até você lançar.",
      side: "left",
      fallback: "menu-item",
      fallbackLabel: "Nova campanha",
    },
    {
      element: "campaigns-segments",
      title: "Gerenciar segmentos",
      description:
        "Segmentos são públicos salvos. Você pode reutilizá-los no passo de audiência em vez de montar os filtros de novo.",
      side: "left",
      fallback: "menu-item",
      fallbackLabel: "Gerenciar segmentos",
    },
  ],
};
