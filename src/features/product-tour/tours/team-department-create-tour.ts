import type { PageTour } from "../tour-types";

/** Dialog "Novo departamento" da aba Departamentos. */
export const teamDepartmentCreateTour: PageTour = {
  id: "team-department-create",
  skipMissingElement: false,
  steps: [
    {
      element: "dept-create-name",
      title: "Nome",
      description: "Como o departamento aparece nas listas e na distribuição — Suporte, Vendas, Financeiro…",
      side: "bottom",
    },
    {
      element: "dept-create-icon",
      title: "Ícone",
      description: "Identificação visual do departamento. O rótulo aparece abaixo da grade.",
      side: "bottom",
    },
    {
      element: "dept-create-color",
      title: "Cor",
      description: "A cor do selo do departamento nas listas.",
      side: "top",
    },
    {
      element: "dept-create-submit",
      title: "Criar",
      description:
        "Cria o departamento. Membros, suporte e distribuição automática se ajustam depois, editando o departamento.",
      side: "top",
    },
  ],
};
