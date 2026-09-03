import type { PageTour } from "../tour-types";

/** Dialog "Novo Template" — modelo interno (Modelo geral). */
export const messageModelsInternalCreateTour: PageTour = {
  id: "message-models-internal-create",
  skipMissingElement: false,
  steps: [
    {
      element: "internal-create-name",
      title: "Nome do modelo",
      description: "Como o atalho aparece na lista e no composer da Inbox.",
      side: "bottom",
    },
    {
      element: "internal-create-meta",
      title: "Categoria e canal",
      description:
        "Categoria organiza a lista. Canal restringe o atalho a WhatsApp, Instagram, Facebook ou e-mail — ou deixa em todos.",
      side: "bottom",
    },
    {
      element: "internal-create-body",
      title: "Mensagem",
      description:
        "O texto enviado. Clique numa variável {{...}} para inserir no cursor — o CRM substitui pelo valor real na hora de enviar.",
      side: "top",
    },
    {
      element: "internal-create-files",
      title: "Anexos",
      description:
        "Imagem ou vídeo junto da mensagem. Com mais de um arquivo, dá para escrever um texto antes de cada um.",
      side: "top",
    },
    {
      element: "internal-create-submit",
      title: "Criar",
      description: "Grava o modelo interno. Ele já aparece na aba Internos e como atalho nas conversas.",
      side: "top",
    },
  ],
};
