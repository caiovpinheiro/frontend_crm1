import type { PageTour } from "../tour-types";

export const tasksTour: PageTour = {
  id: "tasks",
  skipMissingElement: false,
  steps: [
    {
      element: "tasks-search",
      title: "Pesquisar e filtrar",
      description:
        "Busque pelo título da tarefa. Filtrar, à direita da pílula, recorta por tipo (tarefa, reunião, ligação…) e por situação (vencidas, hoje, concluídas).",
      side: "bottom",
    },
    {
      element: "tasks-period",
      title: "Período da agenda",
      description:
        "Limita quais tarefas entram na busca e no calendário. Os presets 7, 30 e 90 dias ficam neste ícone, fora da pílula de busca.",
      side: "bottom",
    },
    {
      element: "tasks-mini-cal",
      title: "Mini calendário",
      description:
        "Pula o mês, volta para hoje e escolhe o dia. Pontos marcam os dias que já têm compromisso.",
      side: "right",
    },
    {
      element: "tasks-agendas",
      title: "Minhas agendas",
      description:
        "Liga ou desliga Tarefa, Reunião, Ligação, Evento e E-mail. O número ao lado é quantos itens daquele tipo existem no período visível.",
      side: "right",
    },
    {
      element: "tasks-cal-nav",
      title: "Navegar o período",
      description:
        "Hoje centra a agenda no dia atual. As setas avançam ou voltam um dia, uma semana ou um mês, conforme a visão.",
      side: "bottom",
    },
    {
      element: "tasks-scope",
      title: "Quem aparece",
      description:
        "Todas: a organização. Minhas: só o que é seu. Departamento: o recorte do seu time.",
      side: "bottom",
    },
    {
      element: "tasks-view",
      title: "Dia, semana, mês e agenda",
      description:
        "Grade por horário (dia ou semana), mês em células ou lista Agenda. Clique num horário vazio para criar naquele momento.",
      side: "bottom",
    },
    {
      element: "tasks-calendar",
      title: "A grade",
      description:
        "Colunas são dias; linhas, horários. A linha vermelha marca agora. Arraste um card para remarcar. Clique no compromisso para abrir o detalhe.",
      side: "left",
    },
    {
      element: "tasks-actions",
      title: "Menu de ações",
      description:
        "Daqui você cria um compromisso na agenda. Avance para ver cada opção.",
      side: "bottom",
      openMenu: "tasks-actions",
    },
    {
      element: "tasks-new",
      title: "Nova tarefa",
      description:
        "Abre o cadastro com tipo Tarefa. Depois de salvar, o item entra nesta grade. Abra o modal e use o ? para o tour da criação.",
      side: "left",
      fallback: "menu-item",
      fallbackLabel: "Nova tarefa",
    },
    {
      element: "tasks-new-activity",
      title: "Nova atividade",
      description:
        "O mesmo cadastro, pensado para reunião, ligação, evento ou e-mail. O tipo você escolhe no modal.",
      side: "left",
      fallback: "menu-item",
      fallbackLabel: "Nova atividade",
    },
  ],
};
