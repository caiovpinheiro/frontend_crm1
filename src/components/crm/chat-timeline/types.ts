export type ConversationEventAction =
  | "distribuicao"
  | "atribuicao"
  | "transferencia"
  | "status"
  | "tabulacao"
  | "tag"
  | "entrada"
  | "saida"
  | "ia"
  | "template";

/**
 * - message: bolha comum
 * - note: anotação humana
 * - event: log automático (sistema / IA / distribuição…)
 * - system: evento de sistema da Meta (ex.: cliente trocou de número)
 * - consent: resposta ao pedido de permissão de ligação (Meta Calling)
 * - draft: rascunho de agente IA em modo DRAFT (aprovar/descartar)
 */
export type TimelineItemKind =
  | "message"
  | "note"
  | "event"
  | "system"
  | "consent"
  | "draft";

/** Veredito da resposta de consentimento de ligação (Meta Calling API). */
export type ConsentVerdict =
  | "granted_temp"
  | "granted_perm"
  | "denied"
  | "unknown";

export type TimelineClassifyInput = {
  messageType?: string | null;
  isPrivate?: boolean | null;
  private?: boolean | null;
  authorType?: string | null;
  senderName?: string | null;
  content?: string | null;
  direction?: string | null;
};

export type ClassifiedTimelineItem = {
  kind: TimelineItemKind;
  action?: ConversationEventAction;
  /** Só quando `kind === "consent"`. */
  consentVerdict?: ConsentVerdict;
};
