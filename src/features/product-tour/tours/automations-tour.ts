import type { PageTour } from "../tour-types";

export const automationsTour: PageTour = {
  id: "automations",
  skipMissingElement: false,
  steps: [
    {
      element: "automations-search",
      title: "Pesquisar e filtrar",
      description:
        "Encontre uma automação pelo nome ou filtre entre automações ativas e pausadas.",
      side: "bottom",
    },
    {
      element: "automations-kpis",
      title: "Acompanhe suas automações",
      description:
        "Veja rapidamente quantas automações estão ativas, execuções realizadas hoje, taxa de sucesso e automações pausadas. Você também pode clicar em Ativas ou Pausadas para filtrar a lista.",
      side: "bottom",
    },
    {
      element: "automations-view",
      title: "Escolha a visualização",
      description:
        "Alterne entre Cards e Tabela para ver suas automações do jeito que preferir.",
      side: "bottom",
    },
    {
      element: "automations-section-switcher",
      title: "Automações e campanhas",
      description:
        "Alterne rapidamente entre a gestão das suas automações e campanhas.",
      side: "bottom",
    },
    {
      element: "automations-list",
      title: "Suas automações",
      description:
        "Aqui você acompanha o gatilho, fluxo, taxa de sucesso, execuções, última execução e status de cada automação. Clique em uma automação para abrir e editar seu fluxo.",
      side: "left",
    },
    {
      element: "automations-status",
      title: "Ativar ou desativar",
      description:
        "Use o interruptor na coluna Status para ativar ou desativar uma automação sem abrir o editor.",
      side: "left",
    },
    {
      element: "automations-actions",
      title: "Criar ou importar",
      description:
        "Este menu reúne as formas de criar uma automação. Clique em Criar automação para abrir e ver cada opção.",
      side: "bottom",
    },
    {
      element: "automations-new",
      title: "Criar manualmente",
      description:
        "Nova automação abre o assistente: nome, gatilho e opções. Depois o fluxo é montado no editor.",
      side: "left",
      openMenu: "automations-actions",
    },
    {
      element: "automations-import",
      title: "Importar .json",
      description:
        "Se você já exportou um fluxo, importe o arquivo .json para recriar a automação sem montar do zero.",
      side: "left",
      openMenu: "automations-actions",
    },
  ],
  ctas: [
    {
      label: "Criar automação",
      onElement: "automations-actions",
      openMenu: "automations-actions",
      continueTour: true,
    },
    {
      label: "Abrir assistente",
      onElement: "automations-import",
      href: "/automations/new",
      startTourId: "automations-create",
    },
  ],
};
