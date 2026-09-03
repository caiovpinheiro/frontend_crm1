import type { PageTour } from "../tour-types";

export const customFieldsCreateTour: PageTour = {
  id: "custom-fields-create",
  skipMissingElement: false,
  steps: [
    {
      element: "field-create-entity",
      title: "Entidade",
      description:
        "Onde o campo vale: Contato, Negócio ou Produto/Serviço. Não dá para trocar depois de criado.",
      side: "bottom",
    },
    {
      element: "field-create-type",
      title: "Tipo",
      description:
        "Texto, número, data, seleção… O tipo define o input que o agente vê. Seleção e multi-seleção pedem alternativas.",
      side: "bottom",
    },
    {
      element: "field-create-slug",
      title: "Identificador (slug)",
      description:
        "Chave única usada por API e automações. Deixe vazio para gerar automaticamente a partir do nome.",
      side: "bottom",
    },
    {
      element: "field-create-label",
      title: "Nome (exibição)",
      description:
        "O rótulo que aparece nos painéis, formulários e na lista de campos.",
      side: "bottom",
    },
    {
      element: "field-create-options",
      title: "Alternativas",
      description:
        "Para seleção e multi-seleção: as opções da lista. Digite e Enter (ou Adicionar) para incluir cada uma.",
      side: "top",
      fallback: "generic",
      fallbackAnchor: "field-create-label",
      fallbackLabel: "Alternativas — aparecem quando o tipo é Seleção ou Multi-seleção",
    },
    {
      element: "field-create-required",
      title: "Campo obrigatório",
      description:
        "Ligado, o registro não salva sem preencher este campo.",
      side: "top",
    },
    {
      element: "field-create-visibility",
      title: "Visibilidade nos painéis",
      description:
        "Mostrar no painel lateral da Inbox (ao atender) e no painel do Negócio (deal detail).",
      side: "top",
      fallback: "generic",
      fallbackAnchor: "field-create-required",
      fallbackLabel: "Visibilidade nos painéis — disponível para Contato e Negócio",
    },
    {
      element: "field-create-submit",
      title: "Criar campo",
      description:
        "Grava o campo — ele já aparece na lista e nos painéis marcados. Cancelar descarta sem salvar.",
      side: "top",
    },
  ],
};
