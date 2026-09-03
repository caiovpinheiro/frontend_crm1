import type { PageTour } from "../tour-types";

export const automationsCreateTour: PageTour = {
  id: "automations-create",
  skipMissingElement: false,
  steps: [
    {
      element: "create-stepper",
      title: "Três passos para criar",
      description:
        "O assistente pede identificação, gatilho e opções. No fim, a automação abre no editor de fluxo — ainda inativa — para você montar as ações.",
      side: "bottom",
      wizardStep: 1,
    },
    {
      element: "create-name",
      title: "Nome da automação",
      description:
        "Escolha um nome claro, como os que você já vê na lista. É o único campo obrigatório deste primeiro passo.",
      side: "bottom",
      wizardStep: 1,
    },
    {
      element: "create-description",
      title: "Descrição",
      description:
        "Opcional: explique o que o fluxo faz, para a equipe reconhecer a automação depois.",
      side: "bottom",
      wizardStep: 1,
    },
    {
      element: "create-next",
      title: "Avançar",
      description:
        "Com o nome preenchido, use Próximo para escolher o evento que dispara o fluxo.",
      side: "top",
      wizardStep: 1,
    },
    {
      element: "create-trigger",
      title: "Gatilho",
      description:
        "O gatilho é o evento que inicia a automação — estágio alterado, mensagem recebida, tag, negócio ganho e outros. Escolha um na lista; o restante do fluxo você monta no builder.",
      side: "bottom",
      wizardStep: 2,
    },
    {
      element: "create-options",
      title: "Opções e resumo",
      description:
        "Decida se o agente pode disparar o fluxo manualmente na conversa e confira o resumo antes de criar.",
      side: "bottom",
      wizardStep: 3,
    },
    {
      element: "create-submit",
      title: "Criar e abrir o builder",
      description:
        "Isso grava a automação inativa e abre o editor. Lá você encadeia ações, condições e mensagens. Só então ligue o interruptor de Status na lista.",
      side: "top",
      wizardStep: 3,
    },
  ],
};
