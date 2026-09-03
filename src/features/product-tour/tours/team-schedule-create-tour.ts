import type { PageTour } from "../tour-types";

/** Dialog "Novo expediente" da aba Expediente (template em massa). */
export const teamScheduleCreateTour: PageTour = {
  id: "team-schedule-create",
  skipMissingElement: false,
  steps: [
    {
      element: "schedule-create-fields",
      title: "O expediente",
      description:
        "Horário de entrada e saída, intervalo de almoço e os dias da semana trabalhados.",
      side: "bottom",
    },
    {
      element: "schedule-create-users",
      title: "Aplicar a",
      description:
        "Marque os usuários que recebem este expediente. “Selecionar todos” aplica na equipe inteira de uma vez.",
      side: "top",
    },
    {
      element: "schedule-create-submit",
      title: "Aplicar expediente",
      description:
        "Grava o horário em todos os selecionados. O ajuste individual fica no lápis da lista.",
      side: "top",
    },
  ],
};
