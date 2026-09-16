export type QuickReplyCatalogItem = {
  id: string;
  title: string;
  content: string;
  group: string;
  attachmentUrl?: string | null;
};

/** Grupos na ordem do atendimento. */
export const QUICK_REPLY_GROUP_ORDER = [
  "👋 Encerramento",
  "⏳ Aguardando / verificando",
  "📋 Solicitação de informação",
  "🔧 Resolução",
  "📨 Encaminhamento",
  "😕 Problema / reclamação",
] as const;

/** Frases-padrão para importação em Modelos → Rápidas. */
export const DEFAULT_QUICK_REPLIES: QuickReplyCatalogItem[] = [
  { id: "qr-end-1", group: "👋 Encerramento", title: "Posso ajudar em algo mais?", content: "Posso ajudar em algo mais?" },
  { id: "qr-end-2", group: "👋 Encerramento", title: "Por nada!", content: "Por nada! Qualquer dúvida que tiver, pode contar conosco." },
  { id: "qr-end-3", group: "👋 Encerramento", title: "Fico à disposição!", content: "Fico à disposição!" },
  { id: "qr-end-4", group: "👋 Encerramento", title: "Espero ter ajudado", content: "Espero ter ajudado! 😊" },
  { id: "qr-end-5", group: "👋 Encerramento", title: "Tenha um ótimo dia", content: "Tenha um ótimo dia!" },

  { id: "qr-wait-1", group: "⏳ Aguardando / verificando", title: "Só um momento", content: "Só um momento, por favor. Vou verificar essa informação." },
  { id: "qr-wait-2", group: "⏳ Aguardando / verificando", title: "Obrigado por aguardar", content: "Obrigado por aguardar!" },
  { id: "qr-wait-3", group: "⏳ Aguardando / verificando", title: "Já estou verificando", content: "Já estou verificando para você." },
  { id: "qr-wait-4", group: "⏳ Aguardando / verificando", title: "Vou conferir", content: "Vou conferir essa situação e já retorno." },

  { id: "qr-info-1", group: "📋 Solicitação de informação", title: "Confirmar informação", content: "Pode me confirmar essa informação, por favor?" },
  { id: "qr-info-2", group: "📋 Solicitação de informação", title: "Enviar print", content: "Você consegue me enviar um print para verificarmos?" },
  { id: "qr-info-3", group: "📋 Solicitação de informação", title: "Dados necessários", content: "Pode me enviar os dados necessários para eu conferir?" },

  { id: "qr-fix-1", group: "🔧 Resolução", title: "Entendi", content: "Entendi o que aconteceu. Vou te orientar." },
  { id: "qr-fix-2", group: "🔧 Resolução", title: "Vamos resolver", content: "Vamos resolver isso juntos." },
  { id: "qr-fix-3", group: "🔧 Resolução", title: "Consegui verificar", content: "Pronto! Já consegui verificar." },
  { id: "qr-fix-4", group: "🔧 Resolução", title: "Tudo certo", content: "Tudo certo por aqui!" },

  { id: "qr-fwd-1", group: "📨 Encaminhamento", title: "Encaminhei", content: "Já encaminhei sua solicitação para o setor responsável." },
  { id: "qr-fwd-2", group: "📨 Encaminhamento", title: "Vou acompanhar", content: "Vou acompanhar sua solicitação por aqui." },
  { id: "qr-fwd-3", group: "📨 Encaminhamento", title: "Atualização", content: "Assim que tivermos uma atualização, avisaremos você." },

  { id: "qr-issue-1", group: "😕 Problema / reclamação", title: "Pedir desculpas", content: "Peço desculpas pelo transtorno. Vamos verificar o que aconteceu." },
  { id: "qr-issue-2", group: "😕 Problema / reclamação", title: "Sinto muito", content: "Sinto muito pelo ocorrido. Vou verificar uma solução para você." },
  { id: "qr-issue-3", group: "😕 Problema / reclamação", title: "Entendo", content: "Entendo sua situação e vou fazer o possível para ajudar." },
];

/** Atalhos no topo do popover. */
export const QUICK_REPLY_PINNED_IDS = ["qr-end-1", "qr-wait-1", "qr-fix-1", "qr-end-5"] as const;

export function normalizeQuickReplyKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
