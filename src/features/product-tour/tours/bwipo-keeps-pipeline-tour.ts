import type { PageTour } from "../tour-types";

export const bwipoKeepsPipelineTour: PageTour = {
  id: "bwipo-keeps-pipeline",
  skipMissingElement: false,
  steps: [
    {
      element: "pipeline-kanban",
      title: "Keeps no negócio",
      description:
        "Abra um card do funil. No painel da conversa, a aba keeps mostra o mesmo mural de notas — para consultar e copiar texto na hora do atendimento, sem sair do negócio.",
      side: "top",
    },
    {
      element: "pipeline-chat-tabs",
      title: "Aba keeps",
      description:
        "Ao lado de Conversa, Tarefas, Notas e Timeline está keeps. Não é a nota interna do ticket: é o Bwipo Keeps, o mural pessoal.",
      side: "bottom",
      fallback: "generic",
      fallbackAnchor: "pipeline-kanban",
      fallbackLabel: "Aba keeps",
    },
    {
      element: "keeps-chat-tab",
      title: "Abrir o mural",
      description:
        "Toque em keeps para trocar o chat pelo mural. O próximo passo mostra o painel.",
      side: "bottom",
      fallback: "generic",
      fallbackAnchor: "pipeline-chat-tabs",
      fallbackLabel: "keeps",
    },
    {
      element: "keeps-peek-search",
      title: "Buscar na conversa",
      description:
        "Filtra o mural sem ir à página do Keeps. Útil quando você já sabe o título da nota de script ou de preço.",
      side: "bottom",
      keepsChatTab: "keeps",
      fallback: "keeps-peek",
      fallbackAnchor: "pipeline-chat-tabs",
    },
    {
      element: "keeps-peek-copy",
      title: "Copiar para enviar",
      description:
        "O ícone de copiar pega o texto da nota. Cole no compositor da conversa. A edição completa continua na página Bwipo Keeps.",
      side: "left",
      keepsChatTab: "keeps",
      skipIfMissing: true,
    },
    {
      element: "keeps-peek",
      title: "Notas na conversa",
      description:
        "As mesmas notas da página Bwipo Keeps. Pesquise, alterne Keeps e Categorias, abra um card ou copie o texto para colar no WhatsApp.",
      side: "left",
      keepsChatTab: "keeps",
      fallback: "keeps-peek",
      fallbackAnchor: "pipeline-chat-tabs",
    },
  ],
  ctas: [
    {
      label: "Ver na caixa de entrada",
      onElement: "keeps-peek",
      href: "/inbox",
      startTourId: "bwipo-keeps-inbox",
    },
  ],
};
