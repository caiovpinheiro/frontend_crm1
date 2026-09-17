import type { PageTour } from "../tour-types";

export const bwipoKeepsInboxTour: PageTour = {
  id: "bwipo-keeps-inbox",
  skipMissingElement: false,
  steps: [
    {
      element: "inbox-list",
      title: "Keeps na caixa de entrada",
      description:
        "Abra uma conversa. No header do chat, a aba keeps é o mesmo mural da página Bwipo Keeps — scripts, preços e checklists ao lado do WhatsApp.",
      side: "right",
    },
    {
      element: "inbox-chat-tabs",
      title: "Aba keeps no ticket",
      description:
        "Conversa é o chat com o cliente. keeps não mistura com Nota interna: a nota interna fica no ticket; o Keeps é o seu mural, em qualquer atendimento.",
      side: "bottom",
      fallback: "inbox-chat",
    },
    {
      element: "keeps-chat-tab",
      title: "Abrir o mural",
      description:
        "Toque em keeps para ver as notas sem perder o contexto do contato.",
      side: "bottom",
      fallback: "generic",
      fallbackAnchor: "inbox-chat-tabs",
      fallbackLabel: "keeps",
    },
    {
      element: "keeps-peek-search",
      title: "Busca rápida",
      description:
        "Encontre a nota pelo título ou trecho. Categorias ajuda quando o mural está grande.",
      side: "bottom",
      keepsChatTab: "keeps",
      fallback: "keeps-peek",
      fallbackAnchor: "inbox-chat-tabs",
    },
    {
      element: "keeps-peek-copy",
      title: "Copiar o texto",
      description:
        "Copia o conteúdo da nota. Volte à aba Conversa, cole no campo de mensagem e envie. Para criar ou editar notas, use a página Bwipo Keeps na barra lateral.",
      side: "left",
      keepsChatTab: "keeps",
      skipIfMissing: true,
    },
    {
      element: "keeps-peek",
      title: "Consultar e copiar",
      description:
        "Pesquise, alterne Keeps e Categorias, abra a nota ou copie o texto e volte para Conversa para enviar. O que você cria na página do Keeps aparece aqui na hora.",
      side: "left",
      keepsChatTab: "keeps",
      fallback: "keeps-peek",
      fallbackAnchor: "inbox-chat-tabs",
    },
  ],
};
