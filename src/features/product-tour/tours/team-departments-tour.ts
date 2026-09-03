import type { PageTour } from "../tour-types";

/** Aba Departamentos de /settings/team. */
export const teamDepartmentsTour: PageTour = {
  id: "team-departments",
  skipMissingElement: false,
  steps: [
    {
      element: "team-tabs",
      title: "Aba Departamentos",
      description:
        "Os times da operação: membros, conversas abertas e distribuição. As demais abas têm tour próprio.",
      side: "bottom",
      teamTab: 2,
    },
    {
      element: "team-dept-search",
      title: "Busca e filtro",
      description:
        "Busque pelo nome e filtre por departamentos com ou sem membros.",
      side: "bottom",
      teamTab: 2,
    },
    {
      element: "team-dept-actions",
      title: "Ações",
      description: "O menu concentra a criação de departamento.",
      side: "bottom",
      teamTab: 2,
      openMenu: "team-dept-actions",
    },
    {
      element: "team-dept-new-item",
      title: "Criar departamento",
      description:
        "Abre o formulário — nome, ícone e cor. O ? do formulário tem um tour só dele.",
      side: "left",
      teamTab: 2,
      fallback: "menu-item",
      fallbackLabel: "Criar departamento",
      closeMenu: "team-dept-actions",
    },
    {
      element: "team-dept-kpis",
      title: "Indicadores",
      description:
        "Departamentos, membros vinculados, conversas abertas, com e sem membros — os dois últimos filtram a lista no clique.",
      side: "bottom",
      teamTab: 2,
    },
    {
      element: "team-dept-list",
      title: "A lista de departamentos",
      description:
        "Checkbox para exclusão em massa. Clique no nome para editar membros, ícone, cor e distribuição por departamento.",
      side: "top",
      teamTab: 2,
    },
  ],
};
