import type { PageTour } from "../tour-types";

/** Dialog "Nova tabulação". */
export const tabulationsCreateTour: PageTour = {
  id: "tabulations-create",
  skipMissingElement: false,
  steps: [
    {
      element: "tab-create-root",
      title: "Nível raiz",
      description:
        "O primeiro nível daquele motivo neste departamento (ex.: Acesso). Sem nome, não grava. Vale só para o departamento que estava selecionado na Árvore.",
      side: "bottom",
    },
    {
      element: "tab-create-children",
      title: "Subníveis",
      description:
        "Adicionar subnível cria o segundo nível (e o + de cada linha desce mais). Folha sem filhos vira nível final — o agente seleciona ela ao encerrar. Sem subníveis, a raiz já é final.",
      side: "top",
      fallback: "generic",
      fallbackAnchor: "tab-create-root",
      fallbackLabel: "Subníveis e Adicionar subnível",
    },
    {
      element: "tab-create-submit",
      title: "Criar tabulação",
      description:
        "Grava a árvore de rascunho neste departamento, na ordem. Cancelar descarta sem salvar. Depois você ainda pode ligar, editar ou acrescentar filhos na Árvore.",
      side: "top",
    },
  ],
};
