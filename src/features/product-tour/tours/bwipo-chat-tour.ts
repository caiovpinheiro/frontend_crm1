import type { PageTour } from "../tour-types";

export const bwipoChatTour: PageTour = {
  id: "bwipo-chat",
  skipMissingElement: false,
  steps: [
    {
      element: "bwipo-chat-search",
      title: "Pesquisar conversas",
      description:
        "Busque pelo nome do colega ou do grupo e pelo conteúdo da última mensagem.",
      side: "bottom",
    },
    {
      element: "bwipo-chat-filters",
      title: "Tudo, não lidas e favoritas",
      description:
        "Recortes rápidos da lista. O número ao lado mostra quantas conversas entram em cada um.",
      side: "bottom",
    },
    {
      element: "bwipo-chat-list",
      title: "Suas conversas",
      description:
        "Cada linha é uma conversa: colega ou grupo, última mensagem, horário e não lidas. A estrela favorita; “Digitando…” mostra quem está escrevendo agora. Clique para abrir.",
      side: "right",
    },
    {
      element: "bwipo-chat-new",
      title: "Nova conversa",
      description:
        "Comece uma conversa direta com um colega ou monte um grupo com vários. O menu ⋯ ao lado leva ao mesmo lugar.",
      side: "bottom",
    },
    {
      element: "bwipo-chat-header",
      title: "O cabeçalho da conversa",
      description:
        "Presença do colega, busca dentro do chat, favorito, notas internas e — em grupos — adicionar membros.",
      side: "bottom",
      fallback: "bwipo-chat-thread",
    },
    {
      element: "bwipo-chat-messages",
      title: "Mensagens",
      description:
        "O histórico da conversa. Reaja com emoji, fixe o que é importante e responda citando a mensagem original.",
      side: "left",
      fallback: "bwipo-chat-thread",
    },
    {
      element: "bwipo-chat-composer",
      title: "Escrever e enviar",
      description:
        "Texto com *negrito*, _itálico_ e ==destaque==, emojis e figurinhas, imagem ou documento anexo, e áudio pelo microfone. Enter envia.",
      side: "top",
      fallback: "bwipo-chat-thread",
    },
  ],
};
