import type { PageTour } from "../tour-types";

export const campaignsCreateTour: PageTour = {
  id: "campaigns-create",
  skipMissingElement: false,
  steps: [
    {
      element: "campaign-create-stepper",
      title: "Três passos para criar",
      description:
        "O assistente pede o básico do disparo, a audiência e o conteúdo. No fim, a campanha abre em rascunho para você conferir e lançar.",
      side: "bottom",
      wizardStep: 1,
    },
    {
      element: "campaign-create-name",
      title: "Nome da campanha",
      description:
        "Escolha um nome claro, como os da lista. É o que a equipe vai reconhecer depois do envio.",
      side: "bottom",
      wizardStep: 1,
    },
    {
      element: "campaign-create-type",
      title: "Tipo de disparo",
      description:
        "Template Meta usa um modelo aprovado. Texto livre envia na janela de 24 horas. Automação coloca cada contato em um fluxo.",
      side: "bottom",
      wizardStep: 1,
    },
    {
      element: "campaign-create-channel",
      title: "Canal de envio",
      description:
        "Último canal conversado usa o WhatsApp da última conversa de cada contato. Ou escolha um canal fixo da organização.",
      side: "top",
      wizardStep: 1,
    },
    {
      element: "campaign-create-next",
      title: "Continuar",
      description:
        "Com nome e canal definidos, avance para escolher quem recebe o disparo.",
      side: "top",
      wizardStep: 1,
    },
    {
      element: "campaign-create-audience",
      title: "Audiência",
      description:
        "Monte o público com filtros (tags, responsável, funil) ou use um segmento já salvo. A prévia mostra quantos contatos entram.",
      side: "bottom",
      wizardStep: 2,
    },
    {
      element: "campaign-create-content",
      title: "Conteúdo",
      description:
        "No último passo você escolhe o template, o texto ou a automação que cada contato vai receber.",
      side: "bottom",
      wizardStep: 3,
    },
    {
      element: "campaign-create-send",
      title: "Velocidade e agendamento",
      description:
        "A velocidade limita mensagens por segundo. O agendamento é opcional: vazio envia assim que você lançar a campanha.",
      side: "top",
      wizardStep: 3,
    },
    {
      element: "campaign-create-submit",
      title: "Criar campanha",
      description:
        "Isso grava o rascunho e abre o painel da campanha. Lá você confere destinatários e lança o disparo.",
      side: "top",
      wizardStep: 3,
    },
  ],
};
