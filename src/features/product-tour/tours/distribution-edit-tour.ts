import type { PageTour } from "../tour-types";

export const distributionEditTour: PageTour = {
  id: "distribution-edit",
  skipMissingElement: false,
  steps: [
    {
      element: "dist-edit-active",
      title: "Ativo na distribuição",
      description:
        "Desligado, o consultor fica inativo e não entra no rodízio. Ligado, volta a concorrer aos leads.",
      side: "bottom",
    },
    {
      element: "dist-edit-paused",
      title: "Em pausa",
      description:
        "Pausa temporária: não recebe leads enquanto estiver ligada, sem tirar o consultor da equipe.",
      side: "bottom",
    },
    {
      element: "dist-edit-schedule",
      title: "Expediente e almoço",
      description:
        "Início e saída do dia, intervalo de almoço e quantos minutos antes o consultor para de receber (padrão 30).",
      side: "bottom",
    },
    {
      element: "dist-edit-saturday",
      title: "Sábado",
      description:
        "Ligado, o consultor fica elegível no sábado no horário abaixo, sem almoço. Desligado, sábado fica fora do expediente.",
      side: "bottom",
    },
    {
      element: "dist-edit-limit",
      title: "Limite de fila",
      description:
        "Máximo de conversas Entrada + Aguardando. Ao atingir, para de receber até a fila cair. 0 = não recebe.",
      side: "top",
    },
    {
      element: "dist-edit-type",
      title: "Tipo / segmento",
      description:
        "Opcional. Rótulo interno (inbound, vendas, suporte) usado nos filtros da lista.",
      side: "top",
    },
    {
      element: "dist-edit-depts",
      title: "Departamentos",
      description:
        "O consultor só recebe leads roteados para as áreas marcadas. Sem marca, não entra no recorte por departamento.",
      side: "top",
    },
    {
      element: "dist-edit-submit",
      title: "Salvar",
      description:
        "Grava expediente, pausa, limite e áreas. Cancelar fecha sem alterar.",
      side: "top",
    },
  ],
};
