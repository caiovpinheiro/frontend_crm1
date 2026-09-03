import type { PageTour } from "../tour-types";

export const campaignsDetailTour: PageTour = {
  id: "campaigns-detail",
  skipMissingElement: false,
  steps: [
    {
      element: "campaign-detail-header",
      title: "Esta campanha",
      description:
        "Nome e status atual — rascunho, enviando, pausada, concluída ou encerrada.",
      side: "bottom",
    },
    {
      element: "campaign-detail-actions",
      title: "Lançar, pausar ou encerrar",
      description:
        "Em rascunho, Lançar inicia o disparo. Durante o envio você pode pausar. Encerrar cancela o que ainda não saiu.",
      side: "bottom",
    },
    {
      element: "campaign-detail-kpis",
      title: "Resultados do disparo",
      description:
        "Total da audiência, enviados, entregues, lidos, respostas e falhas. As porcentagens usam o que já foi enviado.",
      side: "bottom",
    },
    {
      element: "campaign-detail-funnel",
      title: "Funil de conversão",
      description:
        "Enviado, lido, respondido e falha no mesmo disparo. A caixa de falhas destaca mensagens que não chegaram.",
      side: "right",
    },
    {
      element: "campaign-detail-recipients",
      title: "Destinatários",
      description:
        "A lista de contatos com o status de cada um. Filtre por enviado, entregue, lido, falhou ou pendente. Clique no nome para abrir o lead.",
      side: "left",
    },
    {
      element: "campaign-detail-meta",
      title: "Detalhes do disparo",
      description:
        "Quando a campanha foi criada, a velocidade de envio e a tag ou o segmento usados na audiência.",
      side: "top",
    },
  ],
};
