export type QuickReplyCatalogItem = {
  id: string;
  title: string;
  content: string;
  group: string;
  attachmentUrl?: string | null;
};

/** Grupos na ordem do atendimento. */
export const QUICK_REPLY_GROUP_ORDER = [
  "Saudação",
  "Aguardando",
  "Pedindo informações",
  "Acadêmico",
  "Financeiro",
  "Comercial",
  "Encaminhamento",
  "Retorno",
  "Encerramento",
] as const;

/** Frases do dia a dia — sempre disponíveis no composer (2 cliques + envio). */
export const DEFAULT_QUICK_REPLIES: QuickReplyCatalogItem[] = [
  { id: "qr-1", group: "Saudação", title: "Olá! Como posso ajudar?", content: "Olá! Como posso ajudar?" },
  { id: "qr-2", group: "Saudação", title: "Oi! Tudo bem?", content: "Oi! Tudo bem? Como posso te ajudar?" },
  { id: "qr-3", group: "Saudação", title: "Já vou te ajudar", content: "Olá! Já vou te ajudar. 😊" },
  { id: "qr-4", group: "Saudação", title: "Seja bem-vindo(a)", content: "Seja bem-vindo(a)! Em que posso ajudar?" },
  { id: "qr-5", group: "Saudação", title: "Que bom falar com você", content: "Que bom falar com você! Como posso ajudar?" },

  { id: "qr-6", group: "Aguardando", title: "Só um momento", content: "Só um momento, por favor. Vou verificar para você." },
  { id: "qr-7", group: "Aguardando", title: "Vou conferir e já retorno", content: "Vou conferir essa informação e já retorno." },
  { id: "qr-8", group: "Aguardando", title: "Já estou verificando", content: "Já estou verificando para você." },
  { id: "qr-9", group: "Aguardando", title: "Um instante", content: "Um instante, por favor. Vou confirmar essa informação." },
  { id: "qr-10", group: "Aguardando", title: "Obrigado por aguardar", content: "Obrigado por aguardar! Já estou verificando." },

  { id: "qr-11", group: "Pedindo informações", title: "Nome completo", content: "Pode me informar seu nome completo, por favor?" },
  { id: "qr-12", group: "Pedindo informações", title: "CPF", content: "Pode me enviar seu CPF para eu localizar seu cadastro?" },
  { id: "qr-13", group: "Pedindo informações", title: "Matrícula", content: "Pode me informar o número da matrícula?" },
  { id: "qr-14", group: "Pedindo informações", title: "Enviar print", content: "Pode me enviar um print para eu verificar o que aconteceu?" },
  { id: "qr-15", group: "Pedindo informações", title: "Data de nascimento", content: "Pode me confirmar a data de nascimento, por favor?" },
  { id: "qr-16", group: "Pedindo informações", title: "O que aconteceu?", content: "Para eu te ajudar melhor, pode me explicar o que aconteceu?" },
  { id: "qr-17", group: "Pedindo informações", title: "Melhor forma de ajudar", content: "Qual é a melhor forma de te ajudar neste momento?" },
  { id: "qr-18", group: "Pedindo informações", title: "Mais detalhes", content: "Pode me enviar mais detalhes sobre o que você precisa?" },

  { id: "qr-19", group: "Acadêmico", title: "Verificar informação acadêmica", content: "Vou verificar essa informação acadêmica para você." },
  { id: "qr-20", group: "Acadêmico", title: "Confirmar com o setor", content: "Vou confirmar essa informação com o setor responsável." },
  { id: "qr-21", group: "Acadêmico", title: "Situação da matrícula", content: "Vou verificar a situação da sua matrícula." },
  { id: "qr-22", group: "Acadêmico", title: "Situação do acesso", content: "Vou consultar a situação do seu acesso e já retorno." },
  { id: "qr-23", group: "Acadêmico", title: "O que aconteceu com o acesso", content: "Vou verificar o que aconteceu com seu acesso." },
  { id: "qr-24", group: "Acadêmico", title: "Informações do curso", content: "Vou conferir as informações do seu curso para você." },
  { id: "qr-25", group: "Acadêmico", title: "Situação da solicitação", content: "Vou verificar a situação dessa solicitação e te retorno." },

  { id: "qr-26", group: "Financeiro", title: "Situação financeira", content: "Vou verificar a situação financeira do seu cadastro." },
  { id: "qr-27", group: "Financeiro", title: "Conferir pagamento", content: "Vou conferir esse pagamento para você." },
  { id: "qr-28", group: "Financeiro", title: "Pagamento identificado", content: "Vou verificar se o pagamento já foi identificado." },
  { id: "qr-29", group: "Financeiro", title: "Condições disponíveis", content: "Vou confirmar as condições disponíveis para você." },
  { id: "qr-30", group: "Financeiro", title: "Opções de pagamento", content: "Vou verificar as opções de pagamento e já retorno." },
  { id: "qr-31", group: "Financeiro", title: "Valores atualizados", content: "Vou consultar os valores atualizados para você." },

  { id: "qr-32", group: "Comercial", title: "Explicar opções", content: "Posso te explicar as opções disponíveis." },
  { id: "qr-33", group: "Comercial", title: "Condições do curso", content: "Vou verificar as condições disponíveis para o seu curso." },
  { id: "qr-34", group: "Comercial", title: "Melhor opção", content: "Posso te ajudar a encontrar a melhor opção para você." },
  { id: "qr-35", group: "Comercial", title: "Informações do curso", content: "Vou consultar as informações do curso e já te retorno." },
  { id: "qr-36", group: "Comercial", title: "Como funciona a matrícula", content: "Se quiser, posso te explicar como funciona a matrícula." },
  { id: "qr-37", group: "Comercial", title: "Opções de curso", content: "Posso verificar as opções de curso disponíveis para você." },

  { id: "qr-38", group: "Encaminhamento", title: "Encaminhar ao setor", content: "Vou encaminhar seu atendimento para o setor responsável." },
  { id: "qr-39", group: "Encaminhamento", title: "Direcionar à equipe", content: "Vou direcionar sua solicitação para a equipe que pode te ajudar." },
  { id: "qr-40", group: "Encaminhamento", title: "Transferir atendimento", content: "Só um momento, vou transferir seu atendimento." },
  { id: "qr-41", group: "Encaminhamento", title: "Verificar com mais detalhes", content: "Vou encaminhar essa solicitação para verificarmos com mais detalhes." },
  { id: "qr-42", group: "Encaminhamento", title: "Envolver a equipe", content: "Vou envolver a equipe responsável para conseguirmos resolver isso." },

  { id: "qr-43", group: "Retorno", title: "Entrar em contato", content: "Podemos entrar em contato com você para dar continuidade?" },
  { id: "qr-44", group: "Retorno", title: "Melhor horário", content: "Qual é o melhor horário para falarmos com você?" },
  { id: "qr-45", group: "Retorno", title: "Solicitar retorno", content: "Vou solicitar um retorno da equipe responsável." },
  { id: "qr-46", group: "Retorno", title: "Te aviso por aqui", content: "Assim que eu tiver a confirmação, te aviso por aqui." },

  { id: "qr-47", group: "Encerramento", title: "Posso ajudar em algo mais?", content: "Posso ajudar em algo mais?" },
  { id: "qr-48", group: "Encerramento", title: "Por nada!", content: "Por nada! Qualquer dúvida, estamos por aqui. 😊" },
  { id: "qr-49", group: "Encerramento", title: "Foi um prazer ajudar", content: "Foi um prazer ajudar! Se precisar, é só chamar." },
  { id: "qr-50", group: "Encerramento", title: "Tudo certo por aqui?", content: "Tudo certo por aqui? Precisando de algo, é só me chamar." },
];

/** Atalhos no topo do popover — 2 cliques sem rolar o catálogo. */
export const QUICK_REPLY_PINNED_IDS = ["qr-1", "qr-6", "qr-47", "qr-48"] as const;

export function normalizeQuickReplyKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
