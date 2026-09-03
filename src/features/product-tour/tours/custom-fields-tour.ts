import type { PageTour } from "../tour-types";

export const customFieldsTour: PageTour = {
  id: "custom-fields",
  skipMissingElement: false,
  steps: [
    {
      element: "custom-fields-search",
      title: "Busca e filtros",
      description:
        "Busque pelo nome ou slug. Em Filtrar, recorte por exibição no painel, obrigatoriedade e tipo de campo.",
      side: "bottom",
    },
    {
      element: "custom-fields-modes",
      title: "Campos ou grupos, Negócio ou Contato",
      description:
        "Campos lista o cadastro; Grupos organiza os campos nos painéis laterais. Ao lado, escolha a entidade: Negócio ou Contato.",
      side: "bottom",
    },
    {
      element: "custom-fields-actions",
      title: "Ações",
      description:
        "O menu concentra a criação de campo e a organização dos grupos.",
      side: "bottom",
      openMenu: "custom-fields-actions",
    },
    {
      element: "custom-fields-new",
      title: "Novo campo",
      description:
        "Abre o formulário de criação — entidade, tipo, nome e visibilidade. O ? do formulário tem um tour só dele.",
      side: "left",
      fallback: "menu-item",
      fallbackLabel: "Novo campo",
    },
    {
      element: "custom-fields-groups-item",
      title: "Organizar grupos",
      description:
        "Agrupa os campos para os painéis laterais da Inbox e do Negócio.",
      side: "left",
      fallback: "menu-item",
      fallbackLabel: "Organizar grupos",
      closeMenu: "custom-fields-actions",
    },
    {
      element: "custom-fields-kpis",
      title: "Indicadores",
      description:
        "Total de campos, quantos aparecem na Inbox e no Negócio e quantos são obrigatórios. Clique num cartão para filtrar a lista.",
      side: "bottom",
    },
    {
      element: "custom-fields-list",
      title: "A lista de campos",
      description:
        "Cada linha é um campo: tipo, slug e onde ele aparece. Arraste pelo ⠿ para reordenar o painel da Inbox; no hover da linha, editar e excluir.",
      side: "top",
      fallback: "generic",
      fallbackAnchor: "custom-fields-kpis",
      fallbackLabel: "A lista de campos aparece aqui",
    },
  ],
};
