import type { PageTour } from "../tour-types";

/** Dialog "Novo template na Meta" — Template WhatsApp. */
export const messageModelsWhatsappCreateTour: PageTour = {
  id: "message-models-whatsapp-create",
  skipMissingElement: false,
  steps: [
    {
      element: "wa-create-name",
      title: "Nome interno",
      description:
        "Identificador em snake_case na WABA. Depois de criado, a Meta não deixa trocar o nome.",
      side: "bottom",
    },
    {
      element: "wa-create-category",
      title: "Categoria",
      description:
        "UTILITY (transacional), MARKETING ou AUTHENTICATION (OTP). Define as regras de aprovação e o que o template pode conter.",
      side: "bottom",
    },
    {
      element: "wa-create-body",
      title: "Corpo",
      description:
        "O texto oficial. Variáveis {{1}} (POSITIONAL) ou nomes (NAMED). Cabeçalho, rodapé e botões ficam abaixo.",
      side: "top",
      fallback: "generic",
      fallbackAnchor: "wa-create-category",
      fallbackLabel: "Corpo da mensagem (modo assistido)",
    },
    {
      element: "wa-create-quick-replies",
      title: "Botões rápidos (quick reply)",
      description:
        "Até três respostas curtas que o contato toca sem digitar — um texto por linha. “+ Quick reply” adiciona outro botão. Não aparece em templates AUTHENTICATION (OTP).",
      side: "top",
      fallback: "generic",
      fallbackAnchor: "wa-create-body",
      fallbackLabel: "Botões rápidos (quick reply) — UTILITY e MARKETING",
    },
    {
      element: "wa-create-flow",
      title: "Botão WhatsApp Flow",
      description:
        "Marque “Botão WhatsApp Flow (assistido)” para o contato abrir um formulário interativo na conversa. Escolha um flow já publicado na aba Flows, o texto do botão e o flow_action (NAVIGATE ou DATA_EXCHANGE).",
      side: "top",
      fallback: "generic",
      fallbackAnchor: "wa-create-body",
      fallbackLabel: "Botão WhatsApp Flow (assistido)",
    },
    {
      element: "wa-create-preview",
      title: "Pré-visualização",
      description: "O balão como o contato vê no WhatsApp, atualizado enquanto você edita.",
      side: "left",
      fallback: "generic",
      fallbackAnchor: "wa-create-body",
      fallbackLabel: "Pré-visualização do WhatsApp",
    },
    {
      element: "wa-create-submit",
      title: "Criar na Meta",
      description:
        "Envia o template para análise automática da Meta. Só depois de aprovado ele inicia conversas.",
      side: "top",
    },
  ],
};
