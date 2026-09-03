import type { PageTour } from "../tour-types";

export const automationsBuilderTour: PageTour = {
  id: "automations-builder",
  skipMissingElement: false,
  steps: [
    {
      element: "builder-canvas",
      title: "Canvas do fluxo",
      description:
        "Aqui você monta a automação. Cada card é um passo. O gatilho fica no início; as linhas levam o contato para o próximo passo.",
      side: "left",
      focusTrigger: true,
    },
    {
      element: "builder-node",
      title: "Um passo do fluxo",
      description:
        "O card mostra o tipo do passo, o conteúdo e o número (#) usado nos logs. Clique no card para abrir a configuração.",
      side: "right",
      focusTrigger: true,
    },
    {
      element: "builder-node-stats",
      title: "Sucessos, alertas e erros",
      description:
        "Sucessos são execuções que passaram neste passo. Alertas são pulos ou esperas. Erros são falhas. Clique em um índice para abrir os logs daquele resultado.",
      side: "top",
      focusTrigger: true,
    },
    {
      element: "builder-node-actions",
      title: "Copiar ou excluir",
      description:
        "Duplicar copia o passo com a configuração. A lixeira remove o passo do fluxo. As conexões desse passo também saem.",
      side: "bottom",
      focusTrigger: true,
    },
    {
      element: "builder-node-connect",
      title: "Conectar passos",
      description:
        "Arraste a bolinha de saída até a entrada de outro card para ligar os passos. Solte no vazio do canvas para escolher um passo novo. Azul segue o fluxo; vermelho é erro ou sem resposta.",
      side: "right",
      focusTrigger: true,
    },
    {
      element: "builder-palette",
      title: "Painel de blocos",
      description:
        "A paleta lista os passos que você já pode usar. Arraste um bloco para o canvas ou clique para adicionar. Fixe a aba Blocos se quiser deixá-la sempre aberta.",
      side: "right",
      openPalette: true,
    },
    {
      element: "builder-picker",
      title: "O que deseja automatizar?",
      description:
        "Este catálogo abre quando você puxa uma conexão para um espaço vazio. É a lista completa de passos, agrupada por tipo.",
      side: "bottom",
      openPicker: true,
    },
    {
      element: "builder-picker-search",
      title: "Pesquisar passos",
      description:
        "Filtre pelo nome ou pela descrição — por exemplo template, tag ou WhatsApp — para achar o passo sem rolar a lista toda.",
      side: "bottom",
      openPicker: true,
    },
    {
      element: "builder-picker-groups",
      title: "Grupos de passos",
      description:
        "Mensagens, Salesbot, Ações, Lógica e o restante organizam o que o fluxo pode fazer. Escolha um card para inserir e conectar no canvas.",
      side: "left",
      openPicker: true,
    },
    {
      element: "builder-save",
      title: "Salvar e testar",
      description:
        "Salvar grava o fluxo. Simular percorre os passos sem enviar de verdade. No menu você ativa ou pausa a automação, alinha o canvas e exporta o JSON.",
      side: "bottom",
    },
  ],
};
