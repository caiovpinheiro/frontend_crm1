/** Dados do negócio no quadro Kanban (API `/board`). */
export type BoardDeal = {
  id: string;
  number?: number;
  title: string;
  value: number | string;
  status: string;
  position: number;
  expectedClose: string | null;
  createdAt: string;
  updatedAt: string;
  isRotting: boolean;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    /** Número sequencial do contato, quando a API manda. */
    number?: number | null;
  } | null;
  /** Motivo de perda (deal LOST), quando a API manda. */
  lostReason?: string | null;
  /**
   * Responsável único do deal. Por regra de herança, o mesmo
   * usuário também é o responsável do contato (Contact.assignedTo)
   * e das conversas do contato (Conversation.assignedTo) — ver
   * `propagateOwnerToContactAndChat` no service.
   */
  owner: { id: string; name: string; avatarUrl?: string | null } | null;
  lastMessage: {
    content: string;
    createdAt: string;
    direction: string;
    sendStatus?: string | null;
    sendError?: string | null;
  } | null;
  /** Inbounds aguardando resposta (preview em balões no tooltip). */
  awaitingMessages?: Array<{ content: string; createdAt: string }> | null;
  /**
   * Canal da conversa "ativa" do contato (ex.: "whatsapp", "instagram").
   * Usado pelo `ChatAvatar` no card pra exibir o badge correto. `null`
   * quando o contato ainda não tem nenhuma conversa registrada.
   */
  channel?: string | null;
  productName?: string | null;
  productType?: "PRODUCT" | "SERVICE" | null;
  tags?: { id: string; name: string; color: string }[];
  pendingActivities?: number;
  hasOverdueActivity?: boolean;
  unreadCount?: number;
};
