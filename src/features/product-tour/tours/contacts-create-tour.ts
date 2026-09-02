import type { PageTour } from "../tour-types";

export const contactsCreateTour: PageTour = {
  id: "contacts-create",
  skipMissingElement: false,
  steps: [
    {
      element: "contact-create-name",
      title: "Nome",
      description:
        "Obrigatório. É o que aparece na lista, na Inbox e nos negócios vinculados.",
      side: "bottom",
    },
    {
      element: "contact-create-email",
      title: "E-mail",
      description:
        "Opcional. Serve para disparos, e-mail da linha e para localizar duplicadas pelo mesmo endereço.",
      side: "bottom",
    },
    {
      element: "contact-create-phone",
      title: "Telefone",
      description:
        "Opcional, mas necessário para WhatsApp, ligação e campanhas. Use o DDD completo.",
      side: "bottom",
    },
    {
      element: "contact-create-company",
      title: "Empresa",
      description:
        "Vincule o contato a uma empresa já cadastrada. Sem vínculo, o campo fica como Sem empresa vinculada.",
      side: "bottom",
    },
    {
      element: "contact-create-tags",
      title: "Tags",
      description:
        "Busque e marque as tags da organização. Elas filtram a lista, as campanhas e as automações.",
      side: "top",
    },
    {
      element: "contact-create-submit",
      title: "Criar",
      description:
        "Grava o contato na base. Cancelar descarta o formulário sem salvar.",
      side: "top",
    },
  ],
};
