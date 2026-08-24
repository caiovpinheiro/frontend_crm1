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

export type TimelineItemKind = "message" | "note" | "event";

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
};
