import type { PageTour } from "../tour-types";

/** Aba WhatsApp de /settings/message-models (templates WABA). */
export const messageModelsWhatsappTour: PageTour = {
  id: "message-models-whatsapp",
  skipMissingElement: false,
  steps: [
    {
      element: "models-tabs",
      title: "Aba WhatsApp",
      description:
        "Templates oficiais da conta comercial (WABA): passam por análise da Meta antes de poderem iniciar conversas.",
      side: "bottom",
      modelsTab: "whatsapp",
    },
    {
      element: "models-wa-new",
      title: "Novo template",
      description:
        "Abre o assistente de criação: categoria, idioma, corpo, botões rápidos (quick reply) e botão WhatsApp Flow. Ao salvar, o template segue para análise automática da Meta.",
      side: "bottom",
      fallback: "generic",
      fallbackAnchor: "models-tabs",
      fallbackLabel: "Novo template",
      modelsTab: "whatsapp",
    },
    {
      element: "models-wa-list",
      title: "Templates da WABA",
      description:
        "A tabela mostra status da análise, categoria e idioma de cada template. Dá para clonar entre canais, atualizar a lista e excluir. O ? do assistente de criação tem um tour só dele.",
      side: "top",
      modelsTab: "whatsapp",
    },
  ],
};
