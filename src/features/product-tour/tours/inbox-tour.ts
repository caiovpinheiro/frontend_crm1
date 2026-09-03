import type { PageTour } from "../tour-types";

export const inboxTour: PageTour = {
  id: "inbox",
  skipMissingElement: false,
  steps: [
    {
      element: "inbox-search",
      title: "Pesquisar e filtrar",
      description:
        "Busque conversas e negócios pelo nome, telefone ou ticket. Filtrar, à direita da pílula, recorta por canal, responsável, departamento e tags.",
      side: "bottom",
    },
    {
      element: "inbox-period",
      title: "Período",
      description:
        "Filtre pela última mensagem ou pela data de criação. Os presets 7, 30 e 90 dias ficam neste calendário, fora da busca.",
      side: "bottom",
    },
    {
      element: "inbox-queues",
      title: "Filas da caixa",
      description:
        "Aqui você escolhe o recorte da lista. Avance para ver cada grupo de status — dá para marcar várias filas ao mesmo tempo.",
      side: "bottom",
      openMenu: "inbox-queues",
    },
    {
      element: "inbox-queue-todos",
      title: "Todas as conversas",
      description:
        "Visão completa, sem recorte de fila. O número é a soma de tudo o que você tem permissão de ver.",
      side: "right",
      fallback: "menu-item",
      fallbackLabel: "Todas as conversas",
    },
    {
      element: "inbox-queue-group-action",
      title: "Precisa de ação",
      description:
        "Entrada: novas, ainda sem responsável. Cliente respondeu: o contato aguarda você. Ligação autorizada: o WhatsApp já permitiu ligar.",
      side: "right",
      fallback: "menu-item",
      fallbackLabel: "Precisa de ação",
    },
    {
      element: "inbox-queue-group-serving",
      title: "Em atendimento",
      description:
        "Em atendimento: você (ou o time) já respondeu. Resolvendo: conversa aberta em acompanhamento, sem automação rodando.",
      side: "right",
      fallback: "menu-item",
      fallbackLabel: "Em atendimento",
    },
    {
      element: "inbox-queue-group-automation",
      title: "Automação",
      description:
        "Agente IA: o atendimento está com o agente de inteligência. Automação: chatbot ou fluxo em execução.",
      side: "right",
      fallback: "menu-item",
      fallbackLabel: "Automação",
    },
    {
      element: "inbox-queue-group-done",
      title: "Finalizadas",
      description:
        "Encerradas: conversas resolvidas. Elas saem das filas de ação, mas o histórico continua acessível aqui.",
      side: "right",
      fallback: "menu-item",
      fallbackLabel: "Finalizadas",
    },
    {
      element: "inbox-queue-group-attention",
      title: "Atenção",
      description:
        "Erro: falha de envio, canal ou sessão. Vale abrir o ticket e conferir a mensagem vermelha no chat.",
      side: "right",
      fallback: "menu-item",
      fallbackLabel: "Atenção",
    },
    {
      element: "inbox-refresh",
      title: "Atualizar a fila",
      description:
        "Recarrega as conversas e as contagens das filas sem sair da página.",
      side: "bottom",
      closeMenu: "inbox-queues",
    },
    {
      element: "inbox-list-more",
      title: "Mais opções da lista",
      description:
        "Liga ou desliga o aviso sonoro de mensagem nova e entra no modo de seleção em massa — encerrar, reabrir ou reatribuir várias de uma vez.",
      side: "bottom",
    },
    {
      element: "inbox-list",
      title: "Lista de conversas",
      description:
        "Cada card mostra o contato, a última mensagem e o canal. Clique para abrir o chat à direita. Sem conversa aberta, o tour da conversa é pulado.",
      side: "right",
    },
    {
      element: "inbox-chat-tabs",
      title: "Abas da conversa",
      description:
        "Conversa é o chat. Tarefas, Notas, Timeline e Chamadas ficam no mesmo card, sem sair do atendimento.",
      side: "bottom",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-chat-actions",
      title: "Ações do ticket",
      description:
        "Ligar pelo WhatsApp (quando houver permissão) e o menu ⋮: buscar na conversa, favoritas, copiar link, encerrar, devolver à IA e distribuir.",
      side: "left",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-chat-thread",
      title: "Histórico",
      description:
        "Bolhas do cliente e do time, templates, notas internas e eventos. Role para cima para carregar mensagens mais antigas.",
      side: "left",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-composer-bar",
      title: "Como você responde",
      description:
        "Mensagem vai ao cliente; Nota interna fica só no CRM. Ao lado: transferir, canal de envio, assinatura e Encerrar ou Reabrir.",
      side: "top",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-composer-input",
      title: "Campo de mensagem",
      description:
        "Escreva o texto. Digite / para abrir modelos internos e templates do WhatsApp. Sessão encerrada pede template para retomar.",
      side: "top",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-composer-plus",
      title: "Mais no envio",
      description:
        "O + anexa arquivo, tira foto, dispara template, agenda, cria tarefa e pede permissão de ligação. Ao lado, o sorriso insere emoji.",
      side: "top",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-composer-tools",
      title: "Emoji, áudio, IA e enviar",
      description:
        "Microfone para áudio, o robô das automações ativas neste contato, e o avião para enviar (ou salvar a nota).",
      side: "top",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-aside-deal",
      title: "Negócio do contato",
      description:
        "Título, etapa do funil, origem e responsável. Com vários negócios, toque no card para expandir o que você está atendendo.",
      side: "left",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-aside-tabs",
      title: "Perfil e produto",
      description:
        "Perfil mostra o cadastro. Produto lista o que está no negócio. O ícone ao lado alterna visão focada ou compacta.",
      side: "left",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-aside-contact",
      title: "Dados do contato",
      description:
        "Nome, telefone, e-mail e campos da organização. O lápis edita; a engrenagem escolhe quais campos aparecem neste painel.",
      side: "left",
      fallback: "inbox-chat",
    },
    {
      element: "inbox-aside-fields",
      title: "Campos do negócio",
      description:
        "CPF, curso, datas e o que a organização cadastrou no funil. Adicionar preenche o lead sem abrir outra tela.",
      side: "left",
      fallback: "inbox-chat",
    },
  ],
};
