import type { PageTour } from "../tour-types";

/** Aba Feature flags de /settings/security. */
export const securityFlagsTour: PageTour = {
  id: "security-flags",
  skipMissingElement: false,
  steps: [
    {
      element: "security-tabs",
      title: "Feature flags",
      description:
        "Interruptores da organização: ligam comportamentos novos sem deploy. Errar aqui muda o que a equipe vê — leia o aviso amarelo antes de ativar.",
      side: "bottom",
      securityTab: "flags",
    },
    {
      element: "sec-flags-list",
      title: "As flags da org",
      description:
        "Cada cartão tem nome, status (Ativo/Inativo) e o que muda no produto. Permissões v2 e escopo granular de RBAC controlam se papéis e o recorte de funis/canais realmente valem.",
      side: "top",
      securityTab: "flags",
      fallback: "generic",
      fallbackAnchor: "security-tabs",
      fallbackLabel: "Lista de feature flags",
    },
    {
      element: "sec-flags-toggle",
      title: "Ativar ou desativar",
      description:
        "O botão aplica na hora para toda a org. Ative o escopo granular só depois de configurar papéis e o acesso das pessoas — senão alguém perde visão de negócios ou conversas.",
      side: "left",
      securityTab: "flags",
      fallback: "generic",
      fallbackAnchor: "sec-flags-list",
      fallbackLabel: "Ativar / Desativar",
    },
  ],
};
