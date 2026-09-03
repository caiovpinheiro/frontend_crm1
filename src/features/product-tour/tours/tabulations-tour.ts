import type { PageTour } from "../tour-types";

/** Aba Árvore de /settings/tabulations. */
export const tabulationsTour: PageTour = {
  id: "tabulations",
  skipMissingElement: false,
  steps: [
    {
      element: "tab-search",
      title: "Buscar tabulação",
      description:
        "Filtra a árvore do departamento aberto pelo nome do nível. Ancestrais de um resultado continuam visíveis para você não perder o caminho.",
      side: "bottom",
      tabulationsView: "tree",
    },
    {
      element: "tab-views",
      title: "Árvore e Dashboard",
      description:
        "Árvore monta os motivos que o agente escolhe ao encerrar. Dashboard mostra o que foi tabulado no período. Cada visão tem o próprio tour — abra a aba e clique no ?.",
      side: "bottom",
      tabulationsView: "tree",
    },
    {
      element: "tab-actions",
      title: "Ações",
      description:
        "Nova tabulação abre o assistente de criação. Importar e exportar CSV levam a árvore inteira deste departamento.",
      side: "bottom",
      tabulationsView: "tree",
      openMenu: "tab-actions",
    },
    {
      element: "tab-new-item",
      title: "Nova tabulação",
      description:
        "Abre o formulário para montar raiz e subníveis antes de gravar. O ? do diálogo explica a criação passo a passo.",
      side: "left",
      tabulationsView: "tree",
      fallback: "menu-item",
      fallbackLabel: "Nova tabulação",
      closeMenu: "tab-actions",
    },
    {
      element: "tab-depts",
      title: "Departamento",
      description:
        "Cada departamento tem a própria árvore. O que você criar, editar ou importar vale só para o selecionado — não mistura Acolhimento com SAC.",
      side: "bottom",
      tabulationsView: "tree",
      fallback: "generic",
      fallbackAnchor: "tab-views",
      fallbackLabel: "Abas de departamento (Acolhimento, SAC…)",
    },
    {
      element: "tab-rules",
      title: "Regras ao encerrar",
      description:
        "Exigir tabulação: o agente só resolve a conversa depois de escolher um nível final. Encerramento automático (IA/automação) não vê o modal — escolha uma folha ou deixe “Não tabular”. Sem folha, some do dashboard.",
      side: "top",
      tabulationsView: "tree",
      fallback: "generic",
      fallbackAnchor: "tab-depts",
      fallbackLabel: "Exigir tabulação e encerramento automático",
    },
    {
      element: "tab-kpis",
      title: "Indicadores da árvore",
      description:
        "Total de níveis, ativos, inativos, quantos são finais (selecionáveis pelo agente) e se a exigência está ligada neste departamento.",
      side: "bottom",
      tabulationsView: "tree",
      fallback: "generic",
      fallbackAnchor: "tab-rules",
      fallbackLabel: "KPIs da árvore",
    },
    {
      element: "tab-tree-add",
      title: "Novo nível raiz",
      description:
        "Atalho na própria árvore: nome + Adicionar cria um nível raiz na hora, sem o assistente. Use o assistente (Nova tabulação) quando quiser já nascer com subníveis.",
      side: "bottom",
      tabulationsView: "tree",
      fallback: "generic",
      fallbackAnchor: "tab-kpis",
      fallbackLabel: "Campo Novo nível raiz + Adicionar",
    },
    {
      element: "tab-tree-list",
      title: "A árvore",
      description:
        "Pastas têm subníveis; o ponto é nível final — é o que o agente seleciona. Liga/desliga o nível, edita o nome, adiciona filho ou exclui. Inativo não aparece no encerramento.",
      side: "top",
      tabulationsView: "tree",
      fallback: "generic",
      fallbackAnchor: "tab-tree-add",
      fallbackLabel: "Níveis da árvore (ex.: Acesso › Dificuldade…)",
    },
  ],
};
