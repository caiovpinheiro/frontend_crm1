import type { PageTour } from "../tour-types";

/** Aba Internos de /settings/message-models. */
export const messageModelsInternalTour: PageTour = {
  id: "message-models-internal",
  skipMissingElement: false,
  steps: [
    {
      element: "models-tabs",
      title: "Aba Internos",
      description:
        "Modelos de mensagem guardados no CRM, usados como atalho de resposta em qualquer canal.",
      side: "bottom",
      modelsTab: "internal",
    },
    {
      element: "models-internal-new",
      title: "Nova mensagem interna",
      description:
        "Abre o editor do modelo: nome, conteúdo com variáveis {{...}}, categoria, anexos e sequência de envio.",
      side: "bottom",
      fallback: "generic",
      fallbackAnchor: "models-tabs",
      fallbackLabel: "Nova mensagem interna",
      modelsTab: "internal",
    },
    {
      element: "models-internal-stats",
      title: "Indicadores de internos",
      description: "Total de modelos, categorias em uso, quantos usam variáveis e em quantos canais aparecem.",
      side: "bottom",
      modelsTab: "internal",
    },
    {
      element: "models-internal-list",
      title: "Lista de modelos internos",
      description: "Busque por nome ou conteúdo e filtre por categoria. Cada cartão abre a edição do modelo. O ? do formulário de criação tem um tour só dele.",
      side: "top",
      modelsTab: "internal",
    },
  ],
};
