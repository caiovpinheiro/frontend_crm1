import type { PageTour } from "../tour-types";

export const distributionTour: PageTour = {
  id: "distribution",
  skipMissingElement: false,
  steps: [
    {
      element: "distribution-search",
      title: "Pesquisar e filtrar",
      description:
        "Busque o consultor pelo nome ou e-mail. Filtrar, à direita da pílula, recorta por presença, elegibilidade e tipo.",
      side: "bottom",
      distributionTab: "team",
    },
    {
      element: "distribution-view",
      title: "Cards ou tabela",
      description:
        "Alterne a lista da equipe, da fila e dos logs entre cards e tabela.",
      side: "bottom",
      distributionTab: "team",
    },
    {
      element: "distribution-tabs",
      title: "As quatro abas",
      description:
        "Equipe: quem recebe leads. Cobertura: expediente na grade. Fila de espera: o que ainda não foi atribuído. Logs: o histórico de cada distribuição. Cada aba tem o próprio tour: mude de aba e toque no ? dela.",
      side: "bottom",
      distributionTab: "team",
    },
    {
      element: "distribution-kpis",
      title: "Capacidade agora",
      description:
        "Elegíveis, indisponíveis, conversas aguardando resposta e o que está na fila de espera. Os percentuais mostram cobertura e taxa de sucesso.",
      side: "bottom",
      distributionTab: "team",
    },
    {
      element: "distribution-auto-inbound",
      title: "Distribuição automática",
      description:
        "Ligado: toda conversa nova sem responsável entra na fila. Desligado: só entra quem passar pelo passo de distribuição na automação ou pela redistribuição manual.",
      side: "bottom",
      distributionTab: "team",
      fallback: "auto-inbound",
    },
    {
      element: "distribution-list",
      title: "A equipe",
      description:
        "Cada linha é um consultor: identidade, presença, fila, limite de volume e se está elegível. Clique em Ficar online ou offline para mudar a disponibilidade.",
      side: "left",
      distributionTab: "team",
    },
    {
      element: "distribution-presence",
      title: "Presença",
      description:
        "Online, em pausa, offline ou inativo. Quem está em pausa ou offline não recebe lead até voltar.",
      side: "left",
      distributionTab: "team",
    },
    {
      element: "distribution-eligibility",
      title: "Elegibilidade",
      description:
        "Elegível recebe o próximo lead. Indisponível mostra o motivo: pausa, expediente, fila cheia ou bloqueio do admin.",
      side: "left",
      distributionTab: "team",
    },
    {
      element: "distribution-redistribute",
      title: "Redistribuir",
      description:
        "Move a fila deste consultor para colegas online, em partes iguais, ou devolve para a fila de espera.",
      side: "left",
      distributionTab: "team",
      fallback: "row-action",
      fallbackLabel: "Redistribuir",
    },
    {
      element: "distribution-edit",
      title: "Editar",
      description:
        "Abre expediente, pausa, limite de fila e departamentos. Abra o lápis e use o ? do modal para o tour da edição.",
      side: "left",
      distributionTab: "team",
      fallback: "row-action",
      fallbackLabel: "Editar",
    },
    {
      element: "distribution-actions",
      title: "Menu de ações",
      description:
        "Configurações da distribuição, reprocessar a fila, limpar filtros e testar quem receberia o próximo lead. Avance para ver cada opção.",
      side: "bottom",
      distributionTab: "team",
      openMenu: "distribution-actions",
    },
    {
      element: "distribution-settings",
      title: "Configurações",
      description:
        "Define se a distribuição respeita o departamento da conversa e quais áreas distribuem sozinhas.",
      side: "left",
      distributionTab: "team",
      fallback: "menu-item",
      fallbackLabel: "Configurações",
    },
    {
      element: "distribution-retry",
      title: "Reprocessar fila",
      description:
        "Tenta atribuir de novo tudo o que está na fila de espera, agora, com quem estiver elegível.",
      side: "left",
      distributionTab: "team",
      fallback: "menu-item",
      fallbackLabel: "Reprocessar fila",
    },
    {
      element: "distribution-test",
      title: "Testar distribuição",
      description:
        "Simula o próximo lead sem atribuir de verdade. O resultado aparece acima da lista.",
      side: "left",
      distributionTab: "team",
      fallback: "menu-item",
      fallbackLabel: "Testar distribuição",
    },
  ],
};
