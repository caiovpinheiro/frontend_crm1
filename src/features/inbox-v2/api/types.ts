/*
 * Tipos compartilhados pela camada de API do /inbox-v2.
 *
 * Espelham os DTOs do backend conforme documentado em
 * `frontend/docs/inbox-api-contract.md`. Sao tipos PROVISORIOS:
 * conforme o backend evoluir, a unica fonte de verdade do shape
 * continua sendo o backend — esses tipos sao mantidos em paridade
 * para o frontend tipar corretamente.
 */

export type InboxTab =
  | "todos"
  | "abertas"
  | "entrada"
  | "esperando"
  | "respondidas"
  | "ligar"
  | "agente_ia"
  | "automacao"
  | "resolvidos"
  | "finalizados"
  | "erro";

export type ConversationStatus = "OPEN" | "RESOLVED" | "PENDING" | "SNOOZED";

export type Channel =
  | "whatsapp"
  | "meta"
  | "instagram"
  | "email"
  | "webchat"
  | "telegram"
  | string;

/**
 * Direção da mensagem conforme retornado pelo backend.
 *
 * Backend (`src/app/api/conversations/[id]/messages/route.ts`) serializa
 * em minúsculas: `"in" | "out" | "system"`. Esses valores são o
 * contrato real — qualquer adapter deve comparar contra `"in"` /
 * `"out"`, NUNCA contra `"INBOUND" / "OUTBOUND"` (não existe na resposta).
 */
export type MessageDirection = "in" | "out" | "system";

export type MessageStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

export interface ConversationListRow {
  id: string;
  /**
   * ID amigavel sequencial por organizacao (comeca em 1 em cada org).
   * Usado como "ticket number" na UI (ex.: #1234). Padrao Contact/Deal.
   * Opcional aqui por compat: o backend legado pode ainda nao devolver
   * — nesse caso o card lateral esconde o "#N".
   */
  number?: number | null;
  channel: Channel;
  status: ConversationStatus;
  /**
   * Preenchido quando status = RESOLVED. Usado no card lateral para
   * exibir "Encerrada em ..." e no filtro de finalizados por data.
   */
  closedAt?: string | null;
  /** Encerrada em acompanhamento (aba Resolvendo). */
  followUpAt?: string | null;
  contact: {
    id: string;
    name: string;
    phone: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  };
  assignedToId: string | null;
  assignedTo: {
    id: string;
    name: string;
    email?: string;
    avatarUrl?: string | null;
    /** HUMAN | AI | … — usado para Assumir / Devolver à IA. */
    type?: string | null;
  } | null;
  /**
   * Reply humano já ocorreu (`Conversation.hasHumanReply`).
   * Sem isto, assignee+inbound parece Aguardando mas ainda é Entrada.
   */
  hasHumanReply?: boolean | null;
  /** Reply de agente/automação (`Conversation.hasAgentReply`). */
  hasAgentReply?: boolean | null;
  /**
   * Fila de origem quando a lista veio de fetch por aba (multi-queue).
   * Tem prioridade sobre heurística ao montar seções.
   */
  queueTab?: InboxTab | null;
  lastInboundAt: string | null;
  /**
   * Coluna denormalizada (`Conversation.lastMessageDirection`).
   * Fonte da verdade das filas Aguardando/Respondidas no backend.
   */
  lastMessageDirection?: "in" | "out" | string | null;
  lastMessageAt?: string | null;
  lastMessage?: {
    preview: string;
    direction: MessageDirection;
    status?: MessageStatus;
  } | null;
  /**
   * Forma atual retornada pelo backend (services/conversations.ts).
   * Mantemos `lastMessage` acima como fallback semântico (caso o
   * backend padronize no futuro), e tratamos ambos no adapter.
   */
  lastMessagePreview?: {
    content: string;
    messageType: string;
    mediaUrl: string | null;
    direction: string;
    /** Ack de entrega (pending|sent|delivered|read|failed) — só out. */
    sendStatus?: string | null;
    /** Motivo quando sendStatus=failed. */
    sendError?: string | null;
  } | null;
  unreadCount?: number;
  tags?: { id: string; name: string; color: string | null }[];
  hasError?: boolean;
  pinnedNoteId?: string | null;
  /** Timestamp de criacao da conversa. Backend sempre serializa. */
  createdAt?: string | null;
  /** Ultima atualizacao (mensagem/status/atribuicao). */
  updatedAt?: string | null;
  /**
   * Departamento vinculado a conversa. Usado para checar
   * `requireTabulationOnClose` antes de encerrar.
   */
  departmentId?: string | null;
  department?: {
    id: string;
    name: string;
    requireTabulationOnClose: boolean;
  } | null;
  /** Tabulacao final escolhida ao encerrar (folha). Null enquanto OPEN. */
  tabulationId?: string | null;
  /**
   * Opt-in de voz WhatsApp, quando o backend serializar.
   * Sem este campo (e sem aba Ligar / SSE) o chip não pede calling-context.
   */
  whatsappCallConsentStatus?: string | null;
  hasCalling?: boolean;
}

export interface ConversationListResponse {
  items: ConversationListRow[];
  /** COUNT real do filtro (mesmo das badges). Nunca pageSize+1. */
  total?: number;
  page?: number;
  perPage?: number;
  /** Há mais páginas no servidor. Independente do `total`. */
  hasMore?: boolean;
  /** Keyset `${sortValMs}_${id}` — scroll infinito prefere isto a `page`. */
  nextCursor?: string | null;
}

export interface TabCounts {
  todos: number;
  abertas: number;
  entrada: number;
  esperando: number;
  respondidas: number;
  ligar: number;
  agente_ia: number;
  automacao: number;
  resolvidos: number;
  finalizados: number;
  erro: number;
}

export interface InboxFilters {
  /** @deprecated Preferir `ownerIds`. Mantido para localStorage antigo. */
  ownerId?: string;
  /** Multi-seleção de responsáveis. */
  ownerIds?: string[];
  /** true = só conversas sem responsável (`assignedToId` null). */
  withoutOwner?: boolean;
  /** @deprecated Tipo de plataforma (whatsapp, instagram…). Preferir `channelIds`. */
  channel?: string;
  /** IDs de instância de canal (Channel.id ou sentinela de canal excluído). */
  channelIds?: string[];
  /** @deprecated Preferir `stageIds`. Mantido para localStorage antigo. */
  stageId?: string;
  /** Multi-seleção de etapas do negócio. */
  stageIds?: string[];
  tagIds?: string[];
  /** Origens do contato (Contact.source). Pode incluir `__none__` para "Sem origem". */
  sources?: string[];
  /** Sessões Meta ainda abertas que expiram entre agora e agora + X horas. */
  sessionExpiresWithinHours?: number;
  /**
   * Ordenação é client-side. `windowState` (Sessão da Meta: Aberta/Fechada
   * = janela 24h WhatsApp Cloud) vai ao backend — lista, badges e bulk
   * usam o mesmo recorte. Não é status RESOLVED. `sortBy` aceita
   * "lastInboundAt" (padrão) ou "unreadCount".
   */
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  windowState?: "open" | "closed";
  /** Direção da última mensagem, aplicada client-side na lista do Inbox. */
  lastMessageDirection?: "in" | "out";
  /** YYYY-MM-DD — última mensagem (`lastMessageAt` ?? `lastInboundAt`). Client-side. */
  lastMessageFrom?: string;
  lastMessageTo?: string;
  /** YYYY-MM-DD — `createdAt` da conversa. Client-side. */
  createdFrom?: string;
  createdTo?: string;
  /** Recorte extra do Painel (AND com a aba). */
  painelException?: "no_reply" | "open_24h" | "unassigned" | "send_failure";
}

/** Normaliza filtros legados (`ownerId`/`stageId`) para arrays multi. */
export function normalizeInboxFilters(raw: InboxFilters): InboxFilters {
  const ownerIds = Array.from(
    new Set([...(raw.ownerIds ?? []), ...(raw.ownerId ? [raw.ownerId] : [])].filter(Boolean)),
  );
  const stageIds = Array.from(
    new Set([...(raw.stageIds ?? []), ...(raw.stageId ? [raw.stageId] : [])].filter(Boolean)),
  );
  const channelIds = Array.from(
    new Set((raw.channelIds ?? []).filter(Boolean)),
  );
  const sessionHours = Number(raw.sessionExpiresWithinHours);
  const sessionExpiresWithinHours =
    Number.isFinite(sessionHours) && sessionHours > 0 && sessionHours < 24
      ? sessionHours
      : undefined;
  const { ownerId: _o, stageId: _s, ...rest } = raw;
  return {
    ...rest,
    ownerIds: ownerIds.length ? ownerIds : undefined,
    channelIds: channelIds.length ? channelIds : undefined,
    stageIds: stageIds.length ? stageIds : undefined,
    sessionExpiresWithinHours,
  };
}

/** Filtros enviados ao GET /api/conversations (exclui só ordenação/direção local). */
export function hasInboxServerFilters(
  f: InboxFilters | null | undefined,
): boolean {
  if (!f) return false;
  const n = normalizeInboxFilters(f);
  const {
    sortBy: _sb,
    sortOrder: _so,
    lastMessageDirection: _lmd,
    lastMessageFrom: _lmf,
    lastMessageTo: _lmt,
    createdFrom: _cf,
    createdTo: _ct,
    ...server
  } = n;
  return (
    (server.ownerIds?.length ?? 0) > 0 ||
    Boolean(server.withoutOwner) ||
    Boolean(server.channel) ||
    (server.channelIds?.length ?? 0) > 0 ||
    (server.stageIds?.length ?? 0) > 0 ||
    (server.tagIds?.length ?? 0) > 0 ||
    (server.sources?.length ?? 0) > 0 ||
    server.sessionExpiresWithinHours != null ||
    server.windowState === "open" ||
    server.windowState === "closed" ||
    Boolean(server.painelException)
  );
}

/**
 * Entrada individual do JSON `Message.reactions` — espelha o formato
 * gravado pelo webhook Meta (`applyIncomingReaction`). Uma linha por
 * reator. WhatsApp 1:1 permite apenas uma reação por pessoa por
 * mensagem; em canais 1:N (futuros) o array pode ter múltiplas entradas.
 */
export interface ReactionDto {
  emoji: string;
  from: string;
  at?: string;
}

export interface InboxMessageDto {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  content: string;
  messageType?: "text" | "note" | "event" | "image" | "audio" | "video" | "file" | "template" | string;
  // Backend serializa como `isPrivate` (Prisma). Mantemos `private` como
  // alias por compat com chamadas legadas — adapter consulta os dois.
  isPrivate?: boolean;
  private?: boolean;
  status?: MessageStatus;
  createdAt: string;
  readAt?: string | null;
  replyToId?: string | null;
  /** Snapshot curto (~120 chars) da mensagem citada. Backend popula
   *  via `resolveReplyContext` no webhook Meta. Renderiza como cabeçalho
   *  de citação (linha vertical + trecho) na bolha do reply. */
  replyToPreview?: string | null;
  reactions?: ReactionDto[];
  /** Campo plano enviado diretamente pelo backend (ex: "/uploads/audio.ogg"). */
  mediaUrl?: string | null;
  media?: {
    url: string;
    mimeType?: string;
    fileName?: string;
    duration?: number;
    transcript?: string | null;
  } | null;
  sender?: {
    id: string;
    name: string;
    kind: "AGENT" | "CONTACT" | "BOT" | "SYSTEM";
  } | null;
  /**
   * Nome do autor da mensagem out (agente ou "Automação"). O backend NÃO
   * envia o objeto `sender` acima — esse campo plano é a única chave de
   * autoria que o GET /messages serializa hoje. Convenção do
   * automation-executor: bot grava `senderName === "Automação"`.
   */
  senderName?: string | null;
  /** User.id do agente humano no EVENT (legado "Agente" resolve por este id). */
  senderUserId?: string | null;
  /**
   * Foto de perfil do agente que assinou a mensagem out (resolvida no
   * backend via match `senderName` → `User.avatarUrl`). NULL quando não
   * há match ou é inbound/bot. Preferida sobre a foto do usuário logado.
   */
  senderImageUrl?: string | null;
  /**
   * Autoria explícita da mensagem (`human` | `bot` | `system`). Setado
   * pelos serviços que criam mensagens outbound (automation-executor, AI
   * handler, whatsapp-flow-response). Preferido sobre a heurística de
   * `senderName === "Automação"` — permite que o backend grave o NOME
   * real da automação em `senderName` sem quebrar a detecção do bot na UI.
   */
  authorType?: "human" | "bot" | "system";
  /**
   * Nome do agente que disparou a automação MANUALMENTE (gatilho `manual`).
   * Presente nas mensagens `out` de bot enviadas por um disparo manual — o
   * inbox exibe o selo "Manual" + o avatar do agente ao lado do robô (colab).
   * NULL para envios automáticos/reativos.
   */
  triggeredByName?: string | null;
  /** Status bruto de envio (string livre do backend: sent/delivered/read/failed). */
  sendStatus?: string | null;
  /**
   * Texto do erro de envio (traduzido do Meta quando disponível). O GET de
   * mensagens serializa como `sendError`; o POST imediato usa `metaError`.
   * Consumir os dois no adapter (`sendError ?? metaError`).
   */
  sendError?: string | null;
  metaError?: string | null;
  /**
   * Conexão (Channel) por onde ESTA mensagem trafegou. Permite distinguir,
   * na mesma conversa, mensagens de contas distintas do mesmo canal (ex.: dois
   * WhatsApps da org). `null` = histórica/sem vínculo → o frontend trata como
   * "herda a conexão anterior" (sem marcador de troca). Resolver o label via
   * `MessagesResponse.channels[channelId]`.
   */
  channelId?: string | null;
  /** Mensagem favoritada pelo agente LOGADO (marcador pessoal — não
   *  compartilhado entre agentes). Alimenta a estrela preenchida no
   *  menu contextual e no bubble. */
  favoritedByMe?: boolean;
}

/** Resumo de uma conexão (Channel) — mesmo shape do ConnectionRefDto do backend. */
export interface ConnectionRef {
  id: string;
  name: string;
  type: string;
  phoneNumber: string | null;
}

export interface SessionInfo {
  lastInboundAt: string | null;
  active: boolean;
  expiresAt: string | null;
}

export interface MessagesResponse {
  messages: InboxMessageDto[];
  /** Ainda há mensagens mais antigas neste ticket (`?before=`). */
  hasMore?: boolean;
  /** Existem tickets anteriores do mesmo contato/canal (`?history=1`). */
  hasOlderTickets?: boolean;
  /** Client-only: já mesclou o histórico de tickets anteriores. */
  historyLoaded?: boolean;
  pinnedNoteId: string | null;
  /** Mensagens fixadas no topo da conversa (banner estilo WhatsApp) —
   *  várias por conversa (máx. 3), diferente de `pinnedNoteId` (só notas).
   *  Cada id já vem no formato de bolha (`externalId ?? id`). */
  pinnedMessageIds?: string[];
  channelProvider: string | null;
  /** Conexão ATUAL da conversa (último canal usado). Null se sem canal. */
  channel?: ConnectionRef | null;
  /** Mapa id→conexão de todos os canais referenciados (msgs + atual). */
  channels?: Record<string, ConnectionRef>;
  /**
   * Pode responder nesta conversa? Derivado de `channel.send` do
   * scope-grants (backend é fonte de verdade — POST messages aplica o mesmo
   * enforcement). Default `true` quando o backend não envia o campo (compat
   * com clients/backends antigos). Quando `false`, o composer deve entrar
   * em modo leitura com aviso de "sem permissão pra enviar".
   */
  canReply?: boolean;
  session?: SessionInfo;
}
