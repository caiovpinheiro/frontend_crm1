import type { PageTour } from "../tour-types";

/** Aba Atendimentos de /dashboard (gestor). */
export const dashboardServiceTour: PageTour = {
  id: "dashboard-service",
  skipMissingElement: false,
  steps: [
    {
      element: "dash-search",
      title: "Filtros de atendimento",
      description:
        "A busca recorta os cards. Em Filtrar, responsável e departamento da operação — além do que já vale no período do calendário.",
      side: "bottom",
      dashboardTab: "service",
    },
    {
      element: "dash-period",
      title: "Período",
      description:
        "Volume, tempos e tabulações usam este intervalo. O card Agora é ao vivo e não espera o calendário.",
      side: "bottom",
      dashboardTab: "service",
    },
    {
      element: "dash-tabs",
      title: "Atendimentos",
      description:
        "Fila em tempo real, volume por horário e as tabulações da operação. O tour de Negócios fica na outra aba.",
      side: "bottom",
      dashboardTab: "service",
    },
    {
      element: "dash-agora",
      title: "Agora",
      description:
        "Quem está na fila, em atendimento e online neste instante. Relógio comercial vs decorrido troca a conta de espera.",
      side: "bottom",
      dashboardTab: "service",
      fallback: "generic",
      fallbackAnchor: "dash-tabs",
      fallbackLabel: "Agora — fila ao vivo",
    },
    {
      element: "dash-volume",
      title: "Volume",
      description:
        "Quantas conversas entraram, foram resolvidas e ficaram pendentes no período.",
      side: "top",
      dashboardTab: "service",
      fallback: "generic",
      fallbackAnchor: "dash-agora",
      fallbackLabel: "Volume de atendimentos",
    },
    {
      element: "dash-heatmap",
      title: "Atendimentos e horário",
      description:
        "Mapa de calor: em quais dias e horas a operação mais atende. Serve para dimensionar turno.",
      side: "top",
      dashboardTab: "service",
      fallback: "generic",
      fallbackAnchor: "dash-volume",
      fallbackLabel: "Mapa de horário",
    },
    {
      element: "dash-svc-tabulations",
      title: "Tabulações neste quadro",
      description:
        "Os mesmos indicadores da página Tabulações (volume, ranking, por usuário e log), filtrados pelo cabeçalho. Se o card estiver escondido, Adicionar card devolve.",
      side: "top",
      dashboardTab: "service",
      fallback: "generic",
      fallbackAnchor: "dash-heatmap",
      fallbackLabel: "Cards de tabulação (se estiverem no quadro)",
    },
  ],
};
