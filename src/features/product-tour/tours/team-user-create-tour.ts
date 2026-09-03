import type { PageTour } from "../tour-types";

/** Dialog "Convidar membro" da aba Usuários. */
export const teamUserCreateTour: PageTour = {
  id: "team-user-create",
  skipMissingElement: false,
  steps: [
    {
      element: "team-invite-name",
      title: "Nome",
      description: "Nome completo do membro, como aparece na equipe e nos atendimentos.",
      side: "bottom",
    },
    {
      element: "team-invite-email",
      title: "E-mail",
      description:
        "O convite chega neste endereço com o link para criar a senha. O usuário só entra depois de aceitar.",
      side: "bottom",
    },
    {
      element: "team-invite-role",
      title: "Função",
      description:
        "Administrador ou os papéis de Permissões (Gestor, Operador e personalizados).",
      side: "bottom",
    },
    {
      element: "team-invite-perms",
      title: "Permissões iniciais",
      description:
        "O que o membro pode fazer no CRM. Admin vem com tudo liberado; as demais ajustam depois em Configurações → Permissões.",
      side: "top",
    },
    {
      element: "team-invite-submit",
      title: "Enviar convite",
      description:
        "Dispara o e-mail de convite. Se o envio falhar, dá para convidar de novo para reenviar.",
      side: "top",
    },
  ],
};
