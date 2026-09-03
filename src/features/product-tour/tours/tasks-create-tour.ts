import type { PageTour } from "../tour-types";

export const tasksCreateTour: PageTour = {
  id: "tasks-create",
  skipMissingElement: false,
  steps: [
    {
      element: "task-create-title",
      title: "Título",
      description:
        "Obrigatório. É o nome que aparece na grade, na lista e no lembrete.",
      side: "bottom",
    },
    {
      element: "task-create-type",
      title: "Tipo",
      description:
        "Tarefa, reunião, ligação, evento ou e-mail. Reunião e evento pedem local; ligação, reunião e evento pedem duração.",
      side: "bottom",
    },
    {
      element: "task-create-when",
      title: "Quando",
      description:
        "Data e hora do compromisso. A duração em minutos aparece quando o tipo precisa de intervalo na grade.",
      side: "bottom",
    },
    {
      element: "task-create-contact",
      title: "Contato",
      description:
        "Opcional. Busque um cadastro da base para vincular a tarefa. Sem contato, fica como lembrete pessoal. Se o contato tiver negócio aberto, um campo extra aparece para ligar ao funil.",
      side: "bottom",
    },
    {
      element: "task-create-assignee",
      title: "Responsável",
      description:
        "Usuário: você ou um colega. Departamento: todos os membros veem e podem concluir. O padrão é Eu.",
      side: "top",
    },
    {
      element: "task-create-notes",
      title: "Notas",
      description:
        "Pauta, telefone de recado ou qualquer detalhe que não caiba no título.",
      side: "top",
    },
    {
      element: "task-create-submit",
      title: "Salvar",
      description:
        "Grava o compromisso na agenda. Cancelar fecha sem criar.",
      side: "top",
    },
  ],
};
