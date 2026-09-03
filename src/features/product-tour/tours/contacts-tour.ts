import type { PageTour } from "../tour-types";

export const contactsTour: PageTour = {
  id: "contacts",
  skipMissingElement: false,
  steps: [
    {
      element: "contacts-search",
      title: "Pesquisar e filtrar",
      description:
        "Busque pelo nome, e-mail ou telefone. Filtrar, à direita da pílula, restringe por tags e ordenação.",
      side: "bottom",
    },
    {
      element: "contacts-period",
      title: "Período",
      description:
        "Filtre pela data de criação ou de modificação. Os presets 7, 30 e 90 dias ficam neste calendário, fora da busca.",
      side: "bottom",
    },
    {
      element: "contacts-view",
      title: "Escolha a visualização",
      description:
        "Alterne entre Cards e Tabela. Na tabela você escolhe as colunas no menu Configurações da lista.",
      side: "bottom",
    },
    {
      element: "contacts-kpis",
      title: "Segmentos da base",
      description:
        "Todos, Clientes, Leads e Sem responsável. Clique em um card para filtrar a lista; clique de novo para limpar o recorte.",
      side: "bottom",
    },
    {
      element: "contacts-list",
      title: "Sua lista de contatos",
      description:
        "Cada linha mostra identidade, telefone, empresa, tags e data. Clique na linha para editar. A caixa seleciona vários para exclusão em massa.",
      side: "left",
    },
    {
      element: "contacts-row-actions",
      title: "Ações do contato",
      description:
        "Abrir o lead na Inbox, ligar, enviar e-mail ou editar o cadastro. Ligar e e-mail só funcionam se o contato tiver telefone ou e-mail.",
      side: "left",
      skipIfMissing: true,
    },
    {
      element: "contacts-actions",
      title: "Menu de ações",
      description:
        "Daqui você adiciona um contato, exporta, importa, escolhe as colunas da tabela e localiza duplicadas. Avance para ver cada opção.",
      side: "bottom",
    },
    {
      element: "contacts-new",
      title: "Adicionar contato",
      description:
        "Abre o cadastro: nome, e-mail, telefone, empresa e tags. Depois de criar, o contato entra nesta lista.",
      side: "left",
      openMenu: "contacts-actions",
      skipIfMissing: true,
    },
    {
      element: "contacts-export",
      title: "Exportar",
      description:
        "Baixa a base em CSV para planilha ou outro sistema.",
      side: "left",
      openMenu: "contacts-actions",
      skipIfMissing: true,
    },
    {
      element: "contacts-import",
      title: "Importar",
      description:
        "Sobe um arquivo para criar vários contatos de uma vez, no mesmo fluxo de importação do CRM.",
      side: "left",
      openMenu: "contacts-actions",
      skipIfMissing: true,
    },
    {
      element: "contacts-columns-item",
      title: "Configurações da lista",
      description:
        "Escolha quais colunas aparecem na Tabela — nativas e campos personalizados. A escolha fica salva neste navegador. Abra o item e use o ? do modal para o tour das colunas.",
      side: "left",
      openMenu: "contacts-actions",
    },
    {
      element: "contacts-dupes-item",
      title: "Localizar duplicadas",
      description:
        "Agrupa contatos com o mesmo telefone ou e-mail para você escolher qual manter. Abra o item e use o ? do modal para o tour da mesclagem.",
      side: "left",
      openMenu: "contacts-actions",
    },
  ],
};
