import type { PageTour } from "../tour-types";

/** Aba API e Webhooks de /settings/security. */
export const securityApiTour: PageTour = {
  id: "security-api",
  skipMissingElement: false,
  steps: [
    {
      element: "security-tabs",
      title: "API e Webhooks",
      description:
        "Nesta aba você emite chaves para sistemas externos falarem com o CRM. Webhooks de entrada da Meta (WhatsApp) não se cadastram aqui — eles já chegam nas rotas internas do produto.",
      side: "bottom",
      securityTab: "api",
    },
    {
      element: "sec-api-create",
      title: "Criar nova chave",
      description:
        "Gera um token Bearer. Nomeie pela integração (ERP, BI…) e, se quiser, defina expiração. A chave completa aparece uma vez — copie na hora.",
      side: "left",
      securityTab: "api",
    },
    {
      element: "sec-api-list",
      title: "Tokens ativos",
      description:
        "Só o prefixo fica visível. Use o header Authorization: Bearer com o token. Limite: 400 requisições por minuto. Revogar corta a integração na hora, sem desfazer.",
      side: "top",
      securityTab: "api",
      fallback: "generic",
      fallbackAnchor: "sec-api-create",
      fallbackLabel: "Lista de tokens (vazia até criar a primeira chave)",
    },
  ],
};
