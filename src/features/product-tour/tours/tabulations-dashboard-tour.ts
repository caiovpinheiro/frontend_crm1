import type { PageTour } from "../tour-types";

/** Aba Dashboard de /settings/tabulations. */
export const tabulationsDashboardTour: PageTour = {
  id: "tabulations-dashboard",
  skipMissingElement: false,
  steps: [
    {
      element: "tab-views",
      title: "Dashboard",
      description:
        "Números do que os agentes tabularam ao encerrar — não a estrutura da árvore. Volte para Árvore para criar ou editar níveis.",
      side: "bottom",
      tabulationsView: "dashboard",
    },
    {
      element: "tab-dash-filters",
      title: "Período, usuário e departamento",
      description:
        "Recorte o que entra nas métricas. Sem filtro de departamento, soma todas as árvores. Atualizar busca de novo.",
      side: "bottom",
      tabulationsView: "dashboard",
      fallback: "generic",
      fallbackAnchor: "tab-views",
      fallbackLabel: "Filtros do dashboard",
    },
    {
      element: "tab-dash-kpis",
      title: "Tabulações no período",
      description:
        "Quantos encerramentos tiveram tabulação, motivos distintos, agentes que tabularam e o motivo mais usado.",
      side: "bottom",
      tabulationsView: "dashboard",
      fallback: "generic",
      fallbackAnchor: "tab-dash-filters",
      fallbackLabel: "Indicadores do período",
    },
    {
      element: "tab-dash-top",
      title: "Principais tabulações",
      description:
        "Ranking dos caminhos (raiz › subnível). Encerramentos sem tabulação não entram. O departamento no ranking também filtra.",
      side: "top",
      tabulationsView: "dashboard",
      fallback: "generic",
      fallbackAnchor: "tab-dash-kpis",
      fallbackLabel: "Principais tabulações",
    },
    {
      element: "tab-dash-users",
      title: "Por usuário",
      description:
        "Quem mais tabulou no recorte. Combine com o filtro de usuário acima para isolar uma pessoa.",
      side: "top",
      tabulationsView: "dashboard",
      fallback: "generic",
      fallbackAnchor: "tab-dash-top",
      fallbackLabel: "Tabulações por usuário",
    },
    {
      element: "tab-dash-log",
      title: "Log de tabulações",
      description:
        "Cada linha é um encerramento: agente, contato, caminho da tabulação e horário. Páginas embaixo quando o período é grande.",
      side: "top",
      tabulationsView: "dashboard",
      fallback: "generic",
      fallbackAnchor: "tab-dash-users",
      fallbackLabel: "Log de tabulações",
    },
  ],
};
