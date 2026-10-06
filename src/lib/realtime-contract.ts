/**
 * Contrato dos eventos de tempo real (SSE `/api/sse/messages`) — espelho
 * de `src/lib/realtime-events.ts` do backend, no formato que chega ao
 * navegador (datas já em ISO, mais os campos que o barramento acrescenta:
 * `card`/`cardOmitted` e, em `new_message`, `pipelineIds`/`dealIds`).
 *
 * Regras
 * ──────
 * - Nome de evento e campo existente não mudam; campo novo é aditivo.
 * - O backend em produção pode ser MAIS ANTIGO que este arquivo (ou o
 *   evento pode chegar redigido para quem não lista a conversa). Os
 *   handlers recebem `Loose<…>`: todo campo é opcional e precisa de
 *   fallback. Campo ausente nunca é erro.
 *
 * Escopo do board em `new_message`
 * ────────────────────────────────
 * `pipelineIds`: funis onde o contato da mensagem tem negócio — só esses
 * boards mudam; lista vazia = nenhum. `dealIds`: os cards afetados (pode
 * faltar quando a lista é grande). Sem `pipelineIds` (backend antigo, ou
 * o servidor não conseguiu resolver) o cliente usa o caminho antigo: casa
 * o card pelo `contactId` e, se não acha, refaz o board paginado.
 * O servidor resolve o escopo de um cache de até 60 s: um negócio criado
 * há menos tempo pode não estar na lista — por isso o cliente continua
 * casando o card também pelo contato.
 */

// ── Mensagens ───────────────────────────────────────────────────────────

export type NewMessageEvent<TCard = unknown> = {
  organizationId: string;
  conversationId: string;
  contactId?: string | null;
  direction: "in" | "out";
  content?: string | null;
  /** ISO; ausente = use a chegada do evento. */
  timestamp?: string;
  /** `text` implícito; `note`, `ai_draft`, `whatsapp_call_recording`, `event_*`… */
  messageType?: string | null;
  mediaUrl?: string | null;
  /** Agente remetente em saída manual — evita avatar "?". */
  senderName?: string | null;
  senderUserId?: string | null;
  assignedToId?: string | null;
  catalogOrder?: unknown;
  /** Referral do anúncio Meta desta mensagem inbound. */
  referral?: unknown;
  /** Linha da lista do inbox montada pelo barramento. */
  card?: TCard;
  /**
   * Por que veio sem `card`: `"hidden"` = este usuário não lista a
   * conversa (o servidor também tira texto/mídia do evento); `"budget"` =
   * o barramento não montou o snapshot a tempo.
   */
  cardOmitted?: "hidden" | "budget";
  /** Escopo do board — ver cabeçalho. */
  pipelineIds?: string[];
  dealIds?: string[];
};

export type MessageStatusEvent = {
  organizationId: string;
  conversationId: string;
  /** Id da bolha (= externalId/wamid no Meta). */
  messageId: string;
  /** UUID interno — fallback para payloads antigos. */
  internalId?: string;
  /** `pending` | `sent` | `delivered` | `read` | `failed`. */
  status: string;
  error?: string | null;
};

export type MessageUpdatedEvent = {
  organizationId: string;
  conversationId: string;
  messageId: string;
  status: "approved";
};

export type MessageDeletedEvent = {
  organizationId: string;
  conversationId: string;
  messageId: string;
};

// ── Conversas ───────────────────────────────────────────────────────────

/** Só vêm os campos que mudaram. */
export type ConversationUpdatedEvent<TCard = unknown> = {
  organizationId: string;
  conversationId: string;
  contactId?: string | null;
  status?: string;
  closedAt?: string | null;
  followUpAt?: string | null;
  assignedToId?: string | null;
  assignedTo?: { type?: string | null } | null;
  unreadCount?: number;
  whatsappCallConsentStatus?: string;
  card?: TCard;
  cardOmitted?: "hidden" | "budget";
};

export type ConversationTimelineUpdatedEvent = {
  organizationId: string;
  conversationId: string;
  /** Tipo do evento de timeline: `CONVERSATION_CLOSED`, `ASSIGNEE_CHANGED`… */
  type: string;
};

/** `conversation_assigned` (com responsável) / `conversation_unassigned`. */
export type ConversationAssignmentEvent = {
  organizationId: string;
  conversationId: string;
  contactId?: string | null;
  assignedToId: string | null;
  reason?: string | null;
};

export type TypingEvent = {
  organizationId: string;
  conversationId: string;
  contactId: string | null;
  userId: string | null;
  userName: string | null;
  source: "agent" | "contact";
  /** ISO: esconder o indicador ao passar deste instante. */
  until: string;
};

export type ScheduledMessageUpdatedEvent = {
  organizationId: string;
  conversationId: string;
  scheduledMessageId: string | null;
  status: "PENDING" | "CANCELLED" | "SENT" | "FAILED";
};

// ── Contato, chamadas, automação, canal ─────────────────────────────────

export type ContactUpdatedEvent = {
  organizationId: string;
  contactId: string;
  reason?: string;
  oldPhone?: string | null;
  newPhone?: string | null;
  avatarUrl?: string | null;
};

export type WhatsappCallEvent = {
  organizationId: string;
  conversationId: string;
  contactId?: string | null;
  callId: string;
  event?: string;
  direction?: string;
  signalingStatus?: string;
  contactName?: string | null;
  fromWa?: string | null;
  assignedToId?: string;
  session?: unknown;
};

export type AutomationStateEvent = {
  organizationId: string;
  contactId: string | null;
  automationId: string | null;
  status: string | null;
  /** `status` é `RUNNING` ou `PAUSED`. */
  active: boolean;
  createdAt: string | null;
};

export type ChannelUpdatedEvent = {
  organizationId: string;
  channelId: string;
  status?: string;
};

// ── Presença ────────────────────────────────────────────────────────────

export type PresenceUpdateEvent = {
  organizationId: string;
  userId: string;
  status: string;
};

export type SystemPresenceUpdateEvent = {
  organizationId: string;
  userId: string;
  systemOnline: boolean;
  lastSeenAt: string;
};

export type EntityViewersEvent = {
  organizationId: string;
  entityType: string;
  entityId: string;
  viewers: Array<{ userId: string; name: string; avatarUrl: string | null }>;
};

// ── Suporte interno e chat da equipe ────────────────────────────────────

export type SupportTicketEvent = {
  organizationId: string;
  ticketId: string;
  status: string;
  requesterId?: string;
  assignedToId?: string | null;
  number?: number;
};

export type SupportMessageEvent = {
  organizationId: string;
  ticketId: string;
  requesterId: string;
  assignedToId: string | null;
  message: unknown;
};

export type TeamChatEvent = {
  organizationId: string;
  roomId?: string | null;
  memberIds: string[];
  [field: string]: unknown;
};

// ── União discriminada ──────────────────────────────────────────────────

export type RealtimeEventMap = {
  new_message: NewMessageEvent;
  message_status: MessageStatusEvent;
  message_updated: MessageUpdatedEvent;
  message_deleted: MessageDeletedEvent;
  conversation_updated: ConversationUpdatedEvent;
  conversation_timeline_updated: ConversationTimelineUpdatedEvent;
  conversation_assigned: ConversationAssignmentEvent;
  conversation_unassigned: ConversationAssignmentEvent;
  typing: TypingEvent;
  scheduled_message_updated: ScheduledMessageUpdatedEvent;
  contact_updated: ContactUpdatedEvent;
  whatsapp_call: WhatsappCallEvent;
  automation_state: AutomationStateEvent;
  channel_updated: ChannelUpdatedEvent;
  presence_update: PresenceUpdateEvent;
  system_presence_update: SystemPresenceUpdateEvent;
  entity_viewers: EntityViewersEvent;
  support_ticket_new: SupportTicketEvent;
  support_ticket_updated: SupportTicketEvent;
  support_message: SupportMessageEvent;
  team_chat_message: TeamChatEvent;
  team_chat_room_updated: TeamChatEvent;
  team_chat_typing: TeamChatEvent;
  team_chat_work_item_updated: TeamChatEvent;
  team_chat_forward_updated: TeamChatEvent;
};

export type RealtimeEventName = keyof RealtimeEventMap;

/** `{ event, data }` com `data` estreitado pelo nome do evento. */
export type RealtimeEvent = {
  [E in RealtimeEventName]: { event: E; data: RealtimeEventMap[E] };
}[RealtimeEventName];

/** Mesma lista (e ordem) de `REALTIME_EVENT_NAMES` no backend. */
export const REALTIME_EVENT_NAMES = [
  "new_message",
  "message_status",
  "message_updated",
  "message_deleted",
  "conversation_updated",
  "conversation_timeline_updated",
  "conversation_assigned",
  "conversation_unassigned",
  "typing",
  "scheduled_message_updated",
  "contact_updated",
  "whatsapp_call",
  "automation_state",
  "channel_updated",
  "presence_update",
  "system_presence_update",
  "entity_viewers",
  "support_ticket_new",
  "support_ticket_updated",
  "support_message",
  "team_chat_message",
  "team_chat_room_updated",
  "team_chat_typing",
  "team_chat_work_item_updated",
  "team_chat_forward_updated",
] as const satisfies readonly RealtimeEventName[];

/**
 * Payload como o handler deve tratá-lo: qualquer campo pode faltar
 * (backend mais antigo, evento redigido).
 */
export type Loose<T> = { [K in keyof T]?: T[K] };

/** Payload do evento `E`, com todo campo opcional. */
export type RealtimePayload<E extends RealtimeEventName> = Loose<RealtimeEventMap[E]>;

export type RealtimeHandlers = {
  [E in RealtimeEventName]?: (data: RealtimePayload<E>) => void;
};

/**
 * Mapa de handlers no formato que `subscribeSSEEvents` espera, com os
 * nomes de evento conferidos pelo contrato (nome errado não compila) e o
 * payload de cada handler tipado.
 */
export function realtimeHandlers(
  handlers: RealtimeHandlers,
): Record<string, (data: unknown) => void> {
  return handlers as Record<string, (data: unknown) => void>;
}

// ── Escopo do board ─────────────────────────────────────────────────────

export type BoardScope = {
  /** Funis cujo board o evento afeta. Vazio = nenhum. */
  pipelineIds: string[];
  /** Cards afetados; `null` = o evento não informou a lista. */
  dealIds: string[] | null;
};

function idList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Lê `pipelineIds`/`dealIds` do evento. `null` quando o evento não traz
 * escopo (backend antigo) — o chamador segue o comportamento anterior.
 * Aceita `pipelineId` (singular) de publicadores legados.
 */
export function readBoardScope(data: unknown): BoardScope | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const pipelineIds =
    idList(rec.pipelineIds) ??
    (typeof rec.pipelineId === "string" && rec.pipelineId
      ? [rec.pipelineId]
      : null);
  if (!pipelineIds) return null;
  return { pipelineIds, dealIds: idList(rec.dealIds) };
}
