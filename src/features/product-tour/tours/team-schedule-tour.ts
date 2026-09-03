import type { PageTour } from "../tour-types";

/** Aba Expediente de /settings/team. */
export const teamScheduleTour: PageTour = {
  id: "team-schedule",
  skipMissingElement: false,
  steps: [
    {
      element: "team-tabs",
      title: "Aba Expediente",
      description:
        "A disponibilidade de cada agente: status em tempo real, horário de trabalho e ligações. As demais abas têm tour próprio.",
      side: "bottom",
      teamTab: 1,
    },
    {
      element: "team-schedule-search",
      title: "Buscar agente",
      description: "Busque o agente por nome ou e-mail.",
      side: "bottom",
      teamTab: 1,
    },
    {
      element: "team-actions",
      title: "Ações",
      description: "O menu concentra a criação de expediente em massa.",
      side: "bottom",
      teamTab: 1,
      openMenu: "team-actions",
    },
    {
      element: "team-schedule-new-item",
      title: "Novo expediente",
      description:
        "Define um horário-modelo e aplica a vários usuários de uma vez. O ? do formulário tem um tour só dele.",
      side: "left",
      teamTab: 1,
      fallback: "menu-item",
      fallbackLabel: "Novo expediente",
      closeMenu: "team-actions",
    },
    {
      element: "team-schedule-kpis",
      title: "Quem está disponível",
      description:
        "Agentes, Online, Ausente, Offline e WA voz ativo. Clique num cartão para filtrar a lista.",
      side: "bottom",
      teamTab: 1,
    },
    {
      element: "team-schedule-list",
      title: "A lista de agentes",
      description:
        "O status cicla no clique (Online → Ausente → Offline); WA ativo libera ligações WhatsApp. O lápis edita o horário individual.",
      side: "top",
      teamTab: 1,
    },
  ],
};
