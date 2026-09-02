import type { PageTour } from "../tour-types";

export const contactsDuplicatesTour: PageTour = {
  id: "contacts-duplicates",
  skipMissingElement: false,
  steps: [
    {
      element: "contact-dupes-intro",
      title: "Por que mesclar",
      description:
        "O CRM agrupa quem tem o mesmo telefone ou o mesmo e-mail. Você escolhe um registro para manter; conversas, negócios e notas dos outros passam para ele.",
      side: "bottom",
    },
    {
      element: "contact-dupes-summary",
      title: "Grupos encontrados",
      description:
        "Cada grupo é um telefone ou e-mail repetido. Se não houver grupos, a base já está sem duplicata nesse critério.",
      side: "bottom",
      skipIfMissing: true,
    },
    {
      element: "contact-dupes-group",
      title: "Um grupo",
      description:
        "O cabeçalho mostra se o critério é telefone ou e-mail, o valor repetido e quantos contatos caíram no grupo.",
      side: "bottom",
      skipIfMissing: true,
    },
    {
      element: "contact-dupes-keep",
      title: "Manter este",
      description:
        "O contato que você mantém vira o registro principal. Os demais do grupo são mesclados nele e saem da lista.",
      side: "left",
      skipIfMissing: true,
    },
  ],
};
