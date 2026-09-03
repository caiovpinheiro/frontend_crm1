import type { PageTour } from "../tour-types";

export const settingsTour: PageTour = {
  id: "settings",
  skipMissingElement: false,
  steps: [
    {
      element: "settings-nav",
      title: "Menu de configurações",
      description:
        "Todas as seções em ordem alfabética, filtradas pela sua permissão. Clique para abrir — e arraste pelo ⠿ para deixar na sua ordem.",
      side: "right",
    },
    {
      element: "settings-search",
      title: "Buscar uma seção",
      description:
        "Digite “equipe”, “canal”, “tag”… e a lista filtra na hora.",
      side: "right",
    },
    {
      element: "settings-pin",
      title: "Fixar o menu",
      description:
        "Com o pin, o menu fica sempre aberto. Sem ele, o menu abre ao passar o mouse na engrenagem do menu lateral.",
      side: "bottom",
    },
    {
      element: "settings-panel",
      title: "A seção abre aqui",
      description:
        "Cada configuração abre neste painel, com cabeçalho próprio: busca, filtro por período e ações da página.",
      side: "left",
      fallback: "generic",
      fallbackAnchor: "settings-nav",
      fallbackLabel: "Painel da seção (Equipe, Canais, Tags…)",
    },
  ],
};
