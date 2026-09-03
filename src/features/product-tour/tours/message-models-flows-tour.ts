import type { PageTour } from "../tour-types";

/** Aba Flows de /settings/message-models (formulários interativos). */
export const messageModelsFlowsTour: PageTour = {
  id: "message-models-flows",
  skipMissingElement: false,
  steps: [
    {
      element: "models-tabs",
      title: "Aba Flows",
      description:
        "Formulários interativos do WhatsApp: o lead responde dentro da conversa e cada resposta pode ser mapeada para um campo do lead.",
      side: "bottom",
      modelsTab: "flows",
    },
    {
      element: "models-flows-search",
      title: "Busca de flows",
      description: "Busque por nome ou Meta flow id. Em Filtrar, recorte por publicados ou rascunhos.",
      side: "bottom",
      modelsTab: "flows",
    },
    {
      element: "models-actions",
      title: "Ações de flows",
      description: "Criar um flow novo no CRM ou importar um já publicado na WABA.",
      side: "bottom",
      modelsTab: "flows",
      openMenu: "models-actions",
    },
    {
      element: "models-flow-new-item",
      title: "Novo flow",
      description: "Cria o flow no CRM já com uma tela de exemplo e abre o editor visual de telas e campos.",
      side: "left",
      modelsTab: "flows",
      fallback: "menu-item",
      fallbackLabel: "Novo flow",
    },
    {
      element: "models-flow-import-item",
      title: "Importar da Meta",
      description:
        "Traz para o CRM um flow já publicado na WABA — depois é só configurar o mapeamento das respostas no lead.",
      side: "left",
      modelsTab: "flows",
      fallback: "menu-item",
      fallbackLabel: "Importar da Meta",
      closeMenu: "models-actions",
    },
    {
      element: "models-flows-kpis",
      title: "Indicadores de flows",
      description: "Total de flows, publicados, rascunhos e quantos já têm Meta flow id vinculado.",
      side: "bottom",
      modelsTab: "flows",
    },
    {
      element: "models-flows-list",
      title: "Lista de flows",
      description: "Cada card mostra o estado (publicado ou rascunho). Editar abre o editor; a lixeira exclui o flow.",
      side: "top",
      modelsTab: "flows",
      fallback: "generic",
      fallbackAnchor: "models-flows-kpis",
      fallbackLabel: "A lista de flows aparece aqui",
    },
  ],
};
