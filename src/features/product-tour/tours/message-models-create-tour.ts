import type { PageTour } from "../tour-types";

/** Dialog "Novo modelo" — seletor do tipo de mensagem a criar. */
export const messageModelsCreateTour: PageTour = {
  id: "message-models-create",
  skipMissingElement: false,
  steps: [
    {
      element: "models-create-general",
      title: "Modelo geral",
      description:
        "Texto reutilizável dentro do CRM, válido para vários canais. Ao escolher, abre o editor de mensagem interna na aba Internos.",
      side: "bottom",
    },
    {
      element: "models-create-whatsapp",
      title: "Template WhatsApp",
      description:
        "Envio oficial pela conta comercial (WABA): o template passa pela análise da Meta antes de iniciar conversas. Ao escolher, abre o assistente na aba WhatsApp.",
      side: "bottom",
      fallback: "generic",
      fallbackAnchor: "models-create-general",
    },
    {
      element: "models-create-flow",
      title: "Novo WhatsApp Flow",
      description:
        "Formulário interativo criado no CRM e publicado na Meta — o lead responde sem sair da conversa. Cria o flow e abre o editor de telas.",
      side: "top",
      fallback: "generic",
      fallbackAnchor: "models-create-whatsapp",
    },
  ],
};
