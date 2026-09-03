import type { PageTour } from "../tour-types";

/** Aba Negócios de /dashboard (gestor). */
export const dashboardTour: PageTour = {
  id: "dashboard",
  skipMissingElement: false,
  steps: [
    {
      element: "dash-search",
      title: "Pesquisar e filtrar",
      description:
        "Busca recorta textos dos cards. Filtrar, na pílula, recorta funil, etapa, responsável e origem. O período fica no calendário ao lado — não dentro do Filtrar.",
      side: "bottom",
      dashboardTab: "deals",
    },
    {
      element: "dash-period",
      title: "Período",
      description:
        "Todos os números desta aba usam este intervalo. Presets 7 / 30 / 90 ou um intervalo livre. O padrão é os últimos 30 dias.",
      side: "bottom",
      dashboardTab: "deals",
    },
    {
      element: "dash-tabs",
      title: "Negócios e Atendimentos",
      description:
        "Negócios: funil, receita e origem. Atendimentos: fila ao vivo, volume e tabulações. Cada aba tem o próprio tour — mude e clique no ?.",
      side: "bottom",
      dashboardTab: "deals",
    },
    {
      element: "dash-actions",
      title: "Ações",
      description:
        "Adicionar card traz indicadores prontos, por fase ou por campo. Organizar cards permite arrastar, redimensionar e esconder. Concluir organização trava o layout.",
      side: "bottom",
      dashboardTab: "deals",
      openMenu: "dash-actions",
    },
    {
      element: "dash-add-card",
      title: "Adicionar card",
      description:
        "Reabre um card escondido ou cria um métrica (evento, campo personalizado, fase). Some do menu o que já está no quadro.",
      side: "left",
      dashboardTab: "deals",
      fallback: "menu-item",
      fallbackLabel: "Adicionar card",
    },
    {
      element: "dash-organize",
      title: "Organizar cards",
      description:
        "Liga o modo de edição do quadro. Arraste pelo canto, reordene e remova o que não usa. Concluir organização sai do modo.",
      side: "left",
      dashboardTab: "deals",
      fallback: "menu-item",
      fallbackLabel: "Organizar cards",
      closeMenu: "dash-actions",
    },
    {
      element: "dash-kpis",
      title: "Indicadores de negócios",
      description:
        "Receita ganha, negócios ganhos, ticket médio, taxa de conversão e valor em aberto hoje — sempre no período e nos filtros do cabeçalho.",
      side: "bottom",
      dashboardTab: "deals",
      fallback: "generic",
      fallbackAnchor: "dash-tabs",
      fallbackLabel: "Indicadores (receita, ganhos, ticket, conversão…)",
    },
    {
      element: "dash-funnel",
      title: "Funil e progresso",
      description:
        "Escolha o funil à esquerda (ex.: Acadêmico). A barra mostra a distribuição; cada coluna é uma etapa (estoque, valor, entradas e perdas). À direita, ganhos e perdidos do período.",
      side: "top",
      dashboardTab: "deals",
      fallback: "generic",
      fallbackAnchor: "dash-kpis",
      fallbackLabel: "Funil e progresso por etapa",
    },
    {
      element: "dash-usage",
      title: "Uso do sistema hoje",
      description:
        "Tempo total e médio das sessões de hoje, por pessoa. Não usa o período do calendário — é sempre o dia corrente.",
      side: "top",
      dashboardTab: "deals",
      fallback: "generic",
      fallbackAnchor: "dash-funnel",
      fallbackLabel: "Uso do sistema hoje",
    },
    {
      element: "dash-evolution",
      title: "Evolução diária",
      description:
        "Estoque aberto por etapa ao longo dos dias do período. Cada cor é uma fase do funil selecionado.",
      side: "top",
      dashboardTab: "deals",
      fallback: "generic",
      fallbackAnchor: "dash-usage",
      fallbackLabel: "Evolução diária do estoque",
    },
    {
      element: "dash-sources",
      title: "Origem",
      description:
        "De onde vieram os ganhos no período (campanha, canal, indicação…). Sem ganho com origem, o card fica vazio.",
      side: "top",
      dashboardTab: "deals",
      fallback: "generic",
      fallbackAnchor: "dash-evolution",
      fallbackLabel: "Origem dos ganhos",
    },
  ],
};
