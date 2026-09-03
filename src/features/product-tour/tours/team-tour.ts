import type { PageTour } from "../tour-types";

/** Aba Usuários de /settings/team. */
export const teamTour: PageTour = {
  id: "team",
  skipMissingElement: false,
  steps: [
    {
      element: "team-search",
      title: "Busca e filtro por função",
      description:
        "Busque por nome ou e-mail. Em Filtrar, recorte por função: Admin, Gerente ou Atendente.",
      side: "bottom",
      teamTab: 0,
    },
    {
      element: "team-tabs",
      title: "Usuários, Expediente e Departamentos",
      description:
        "As três abas da equipe. Cada uma tem o próprio tour — abra a aba e clique no ? do cabeçalho.",
      side: "bottom",
      teamTab: 0,
    },
    {
      element: "team-view",
      title: "Cartões ou tabela",
      description: "Alterne a visualização da lista entre cartões e tabela.",
      side: "bottom",
      teamTab: 0,
    },
    {
      element: "team-actions",
      title: "Ações",
      description: "O menu concentra a entrada de novos membros.",
      side: "bottom",
      teamTab: 0,
      openMenu: "team-actions",
    },
    {
      element: "team-invite-item",
      title: "Convidar",
      description:
        "Abre o formulário de convite — nome, e-mail, função e permissões. O ? do formulário tem um tour só dele.",
      side: "left",
      teamTab: 0,
      fallback: "menu-item",
      fallbackLabel: "Convidar",
      closeMenu: "team-actions",
    },
    {
      element: "team-kpis",
      title: "Indicadores",
      description: "Usuários ativos, administradores e demais funções.",
      side: "bottom",
      teamTab: 0,
    },
    {
      element: "team-list",
      title: "A lista de usuários",
      description:
        "Checkbox para seleção em massa, função editável no dropdown, telefonia e ações: editar, trocar senha e excluir. Nome e E-mail ordenam.",
      side: "top",
      teamTab: 0,
    },
    {
      element: "team-pagination",
      title: "Paginação",
      description: "Total de usuários, páginas e quantos por página (25, 50 ou 100).",
      side: "top",
      teamTab: 0,
      fallback: "generic",
      fallbackAnchor: "team-list",
      fallbackLabel: "Paginação da lista",
    },
  ],
};
