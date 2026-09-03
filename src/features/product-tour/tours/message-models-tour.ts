import type { PageTour } from "../tour-types";

/** Visão geral do hub de modelos (internos + WhatsApp + Flows). */
export const messageModelsTour: PageTour = {
  id: "message-models",
  skipMissingElement: false,
  steps: [
    {
      element: "models-tabs",
      title: "Abas de modelos",
      description:
        "Visão geral, Internos, WhatsApp e Flows. Cada aba tem um tour próprio — clique nela e abra o ? no topo.",
      side: "bottom",
      modelsTab: "overview",
    },
    {
      element: "models-search",
      title: "Busca e filtro por canal",
      description:
        "Busque por nome, conteúdo ou variável ({{nome}}). Em Filtrar, recorte a visão por canal: interno, WhatsApp ou Flow.",
      side: "bottom",
      modelsTab: "overview",
    },
    {
      element: "models-actions",
      title: "Ações de modelos",
      description: "Criação e manutenção: novo modelo, importação/exportação em CSV e reparo de mídias.",
      side: "bottom",
      modelsTab: "overview",
      openMenu: "models-actions",
    },
    {
      element: "models-new-item",
      title: "Novo modelo",
      description:
        "Abre o seletor de tipo: Modelo geral, Template WhatsApp ou WhatsApp Flow. O ? do seletor tem um tour explicando cada tipo.",
      side: "left",
      modelsTab: "overview",
      fallback: "menu-item",
      fallbackLabel: "Novo modelo",
    },
    {
      element: "models-import-item",
      title: "Importar CSV",
      description: "Importa modelos internos em lote a partir de uma planilha CSV.",
      side: "left",
      modelsTab: "overview",
      fallback: "menu-item",
      fallbackLabel: "Importar CSV",
    },
    {
      element: "models-export-item",
      title: "Exportar CSV",
      description: "Baixa os modelos internos em CSV — útil para backup ou migração entre organizações.",
      side: "left",
      modelsTab: "overview",
      fallback: "menu-item",
      fallbackLabel: "Exportar CSV",
      closeMenu: "models-actions",
    },
    {
      element: "models-kpis",
      title: "Indicadores",
      description:
        "Total de modelos, internos, templates aprovados e aguardando análise da Meta, e flows publicados.",
      side: "bottom",
      modelsTab: "overview",
    },
    {
      element: "models-list",
      title: "Todos os modelos",
      description:
        "A visão geral agrupa os modelos por canal: Internos, WhatsApp e Flows. Clique num card para abrir a aba correspondente.",
      side: "top",
      modelsTab: "overview",
      fallback: "generic",
      fallbackAnchor: "models-kpis",
      fallbackLabel: "A lista de modelos aparece aqui",
    },
  ],
};
