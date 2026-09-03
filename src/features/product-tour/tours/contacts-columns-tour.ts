import type { PageTour } from "../tour-types";

export const contactsColumnsTour: PageTour = {
  id: "contacts-columns",
  skipMissingElement: false,
  steps: [
    {
      element: "contact-columns-intro",
      title: "Colunas da tabela",
      description:
        "Só a visão em Tabela usa estas colunas. A coluna de nome e e-mail é fixa. O restante você liga ou desliga.",
      side: "bottom",
    },
    {
      element: "contact-columns-native",
      title: "Colunas nativas",
      description:
        "Telefone, empresa, tags, responsável e datas. Azul com check está visível; o mais cinza está oculto. Clique para alternar.",
      side: "bottom",
    },
    {
      element: "contact-columns-reset",
      title: "Restaurar padrão",
      description:
        "Volta para Telefone, Empresa, Tags e Criado em — o recorte original desta lista.",
      side: "left",
    },
    {
      element: "contact-columns-custom",
      title: "Campos personalizados",
      description:
        "Campos que a organização criou em Configurações. Também entram como coluna se você marcar o chip.",
      side: "top",
      skipIfMissing: true,
    },
    {
      element: "contact-columns-done",
      title: "Concluído",
      description:
        "Fecha o painel. A escolha fica salva neste navegador, não na conta de outro computador.",
      side: "top",
    },
  ],
};
