import type { PageTour } from "../tour-types";

export const bwipoKeepsTour: PageTour = {
  id: "bwipo-keeps",
  skipMissingElement: false,
  steps: [
    {
      element: "keeps-search",
      title: "Pesquisar notas",
      description:
        "Busque pelo título ou pelo texto da nota. Se houver cores em uso, Filtrar, à direita da pílula, recorta o mural por cor.",
      side: "bottom",
    },
    {
      element: "keeps-folders",
      title: "Notas, arquivo e lixeira",
      description:
        "Notas é o mural ativo. Arquivo guarda o que você tirou do caminho sem apagar. Lixeira é exclusão — dá para restaurar ou apagar de vez.",
      side: "bottom",
    },
    {
      element: "keeps-actions",
      title: "Importar do Google Keep",
      description:
        "Neste menu você importa o ZIP exportado do Google Keep e abre o tutorial de como gerar esse arquivo. Avance para ver cada opção.",
      side: "bottom",
      openMenu: "keeps-actions",
    },
    {
      element: "keeps-import",
      title: "Importar Keeps",
      description:
        "Escolhe o ZIP do Google Keep. As notas entram no mural desta organização, na sua conta.",
      side: "left",
      openMenu: "keeps-actions",
      fallback: "menu-item",
      fallbackLabel: "Importar Keeps",
    },
    {
      element: "keeps-import-help",
      title: "Como importar",
      description:
        "Abre o passo a passo para exportar no Google Keep e gerar o ZIP certo.",
      side: "left",
      openMenu: "keeps-actions",
      fallback: "menu-item",
      fallbackLabel: "Como importar Keeps",
    },
    {
      element: "keeps-composer",
      title: "Criar uma nota",
      description:
        "Clique em “Criar uma nota...” para abrir título e texto. Os ícones ao lado já começam uma lista de tarefas ou anexam uma imagem.",
      side: "bottom",
      closeMenu: "keeps-actions",
      keepsComposer: "closed",
      keepsFolder: "notes",
      keepsView: "normal",
    },
    {
      element: "keeps-composer-list",
      title: "Lista de tarefas",
      description:
        "Abre a nota já em checklist: itens para marcar, no estilo de uma lista do Keep.",
      side: "bottom",
      keepsComposer: "closed",
    },
    {
      element: "keeps-composer-attach",
      title: "Imagem ou arquivo",
      description:
        "Anexa um arquivo na nota nova. Depois de salvar, a imagem aparece no card do mural.",
      side: "bottom",
      keepsComposer: "closed",
    },
    {
      element: "keeps-composer-title",
      title: "Título e texto",
      description:
        "O campo de cima é o título. Embaixo você escreve a nota com formatação. Salvar coloca o card no mural.",
      side: "bottom",
      keepsComposer: "note",
    },
    {
      element: "keeps-composer-open",
      title: "Salvar a nota",
      description:
        "A nota aberta tem título, texto e os botões embaixo: Salvar (azul) grava no mural; Fechar descarta o rascunho sem criar card.",
      side: "right",
      keepsComposer: "note",
    },
    {
      element: "keeps-view-mode",
      title: "Modo Keeps",
      description:
        "Este interruptor escolhe a visualização. Keeps (ligado agora) é o mural livre: cards na grade, cores, fixadas no topo e arrastar para reordenar — como o Google Keep.",
      side: "bottom",
      keepsComposer: "closed",
      keepsFolder: "notes",
      keepsView: "normal",
    },
    {
      element: "keeps-view-mode",
      title: "Modo Categorias",
      description:
        "Categorias junta as notas em pastas com nome e cor. Use quando o mural cresce: uma pasta por assunto (scripts, preços, checklist). O próximo passo mostra como criar uma pasta.",
      side: "bottom",
      keepsView: "categories",
      keepsComposer: "closed",
    },
    {
      element: "keeps-new-category",
      title: "Nova categoria",
      description:
        "Cria uma pasta (nome e cor). O + da seção abre uma nota já dentro daquela categoria. Volte para Keeps quando quiser o mural livre de novo.",
      side: "bottom",
      keepsView: "categories",
      keepsComposer: "closed",
      fallback: "generic",
      fallbackAnchor: "keeps-view-mode",
      fallbackLabel: "Nova categoria",
    },
    {
      element: "keeps-card",
      title: "Seu mural",
      description:
        "Cada card é uma nota. Clique para abrir e editar. Nos ícones: cor, fixar, arquivo e lixeira. Arraste o card para mudar a ordem.",
      side: "right",
      keepsView: "normal",
      keepsFolder: "notes",
      keepsComposer: "closed",
      fallback: "keeps-card",
      fallbackAnchor: "keeps-composer",
      fallbackLabel: "Card da nota",
    },
    {
      element: "keeps-demo-pipeline",
      title: "No pipeline",
      description:
        "Isto é uma simulação do painel do negócio. No funil, abra um card: ao lado de Conversa, Tarefas, Notas e Timeline aparece keeps — o mesmo mural desta página, para consultar na hora do atendimento.",
      side: "bottom",
      keepsView: "normal",
      keepsFolder: "notes",
      keepsComposer: "closed",
      keepsScene: "pipeline",
    },
    {
      element: "keeps-demo-pipeline",
      title: "Aba keeps no card",
      description:
        "keeps não é a nota interna do ticket. É o seu mural pessoal. Toque na aba para trocar o chat pelo mural, sem sair do negócio. O ícone de copiar pega o texto da nota para colar no compositor.",
      side: "bottom",
      keepsScene: "pipeline",
    },
    {
      element: "keeps-demo-inbox",
      title: "Na caixa de entrada",
      description:
        "Simulação de um ticket aberto. No header do chat, a aba keeps mostra o mesmo mural — scripts, preços e checklists ao lado do WhatsApp.",
      side: "bottom",
      keepsComposer: "closed",
      keepsScene: "inbox",
    },
    {
      element: "keeps-demo-inbox",
      title: "Copiar e enviar",
      description:
        "Conversa é o chat com o cliente; keeps é o mural em qualquer atendimento. Copie o texto, volte à aba Conversa, cole no campo de mensagem e envie. O que você cria nesta página aparece na hora.",
      side: "bottom",
      keepsScene: "inbox",
    },
  ],
};
