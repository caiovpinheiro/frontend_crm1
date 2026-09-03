import type { PageTour } from "../tour-types";

/** Aba Permissões de /settings/security — papéis, pessoas e acesso. */
export const securityTour: PageTour = {
  id: "security",
  skipMissingElement: false,
  steps: [
    {
      element: "security-tabs",
      title: "Abas de Segurança",
      description:
        "Três áreas: Permissões (quem pode o quê), API e Webhooks (chaves de integração) e Feature flags (ligar recursos da org). Cada uma tem o próprio tour — abra a aba e clique no ?.",
      side: "bottom",
      securityTab: "permissions",
    },
    {
      element: "sec-access",
      title: "Acessos",
      description:
        "A coluna da esquerda é o inventário. Papéis definem o que um cargo pode fazer no CRM. Pessoas são os usuários: você atribui papéis e, se a flag de escopo estiver ativa, recorta funis e canais.",
      side: "right",
      securityTab: "permissions",
      securityAccess: "role",
    },
    {
      element: "sec-access-tabs",
      title: "Papéis e Pessoas",
      description:
        "Papéis: cargos (Administrador, Gestor, Operador e os que você criar). Pessoas: cada conta da equipe. O número no canto é o total daquele contexto.",
      side: "right",
      securityTab: "permissions",
      securityAccess: "role",
    },
    {
      element: "sec-access-search",
      title: "Busca e novo papel",
      description:
        "Filtra a lista. Em Papéis, “+ Papel” cria um cargo personalizado. Pessoas não se criam aqui — o convite é em Equipe.",
      side: "bottom",
      securityTab: "permissions",
      securityAccess: "role",
      fallback: "generic",
      fallbackAnchor: "sec-access-tabs",
      fallbackLabel: "Buscar e + Papel",
    },
    {
      element: "sec-role-list",
      title: "Lista de papéis",
      description:
        "Cada linha mostra quantas permissões o cargo tem e quantas pessoas o usam. BASE/sistema são os papéis padrão — dá para ajustar, mas o Admin não perde o acesso total. Clique num papel para editar à direita.",
      side: "right",
      securityTab: "permissions",
      securityAccess: "role",
      fallback: "generic",
      fallbackAnchor: "sec-access",
      fallbackLabel: "Papéis (Administrador, Gestor, Operador…)",
    },
    {
      element: "sec-role-detail",
      title: "Permissões do papel",
      description:
        "O que aquele cargo pode fazer em cada módulo (inbox, negócios, configurações…). Salvar aplica a todas as pessoas com esse papel. Depois refine por pessoa, se precisar.",
      side: "left",
      securityTab: "permissions",
      securityAccess: "role",
      fallback: "generic",
      fallbackAnchor: "sec-access",
      fallbackLabel: "Editor do papel selecionado",
    },
    {
      element: "sec-people-list",
      title: "Pessoas",
      description:
        "Todas as contas da organização. Clique em alguém para ver papéis efetivos e o recorte de funis/canais. Não substitui Equipe: aqui só se configura acesso, não convite nem senha.",
      side: "right",
      securityTab: "permissions",
      securityAccess: "user",
      fallback: "generic",
      fallbackAnchor: "sec-access",
      fallbackLabel: "Lista de pessoas",
    },
    {
      element: "sec-people-roles",
      title: "Papéis da pessoa",
      description:
        "A pessoa herda as permissões dos papéis. Dá para atribuir mais de um (ex.: Operador + um papel extra) e remover com o X. “Adicionar” aplica na hora.",
      side: "left",
      securityTab: "permissions",
      securityAccess: "user",
      fallback: "generic",
      fallbackAnchor: "sec-access",
      fallbackLabel: "Papéis atribuídos à pessoa",
    },
    {
      element: "sec-people-scope",
      title: "Acesso a funis e canais",
      description:
        "Além do papel, recorte o que a pessoa vê: todos os funis ou só alguns; em cada canal, ver / responder / iniciar conversa / administrar. Canais bloqueados (SENSÍVEL) negam tudo, salvo se ela administrar o canal. Salvar acesso grava só este recorte — vale de verdade com a feature flag de escopo granular ligada.",
      side: "left",
      securityTab: "permissions",
      securityAccess: "user",
      fallback: "generic",
      fallbackAnchor: "sec-people-roles",
      fallbackLabel: "Funis, canais e Salvar acesso",
    },
  ],
};
