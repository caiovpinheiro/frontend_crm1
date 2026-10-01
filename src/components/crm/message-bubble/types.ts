import type {
  ConsentVerdict,
  ConversationEventAction,
  TimelineItemKind,
} from "@/components/crm/chat-timeline"

export interface FormField {
  label: string
  value: string
}

export interface Message {
  id: string
  content: string
  time: string
  /** ISO da data de criação — usado para agrupar mensagens por dia. */
  createdAt?: string
  type: "incoming" | "outgoing"
  senderInitials?: string
  /** Foto de perfil do agente remetente (resolvida no backend). */
  senderImageUrl?: string | null
  /** Nome completo do agente ou automação que enviou a mensagem. */
  senderName?: string
  /** User.id do agente no EVENT — fallback quando senderName é "Agente". */
  senderUserId?: string | null
  /** Mensagem enviada por bot/automação — exibe badge "AUTOMAÇÃO" */
  isBot?: boolean
  /**
   * Mensagem de campanha (TEMPLATE/TEXT). Bolha teal + pill "Campanha" e
   * `campaignName` no topo. Mantém `isBot` para caminho de avatar/bot.
   */
  isCampaign?: boolean
  /** Nome da campanha (sem o prefixo "Campanha:"). */
  campaignName?: string
  /**
   * Confirmação de automação disparada MANUALMENTE pela conversa. Renderiza
   * o cartão de automação com badge "Manual" e o avatar (iniciais) do agente
   * que acionou sobreposto ao robô — estilo colaboração.
   */
  isAutomationRun?: boolean
  /** Nome do agente que disparou a automação manual (tooltip do avatar colab). */
  automationAgentName?: string
  /** Iniciais do agente que disparou — chip sobre o robô. */
  automationAgentInitials?: string
  /** Campos parseados de resposta de formulário Meta Flow */
  formFields?: FormField[]
  /** Título do formulário (ex: "form_estag") */
  formTitle?: string
  /**
   * Botões de resposta rápida enviados numa mensagem interativa/template
   * (WhatsApp). Renderizados como cards empilhados abaixo do corpo —
   * separados do texto pelo adapter (marcador `[Botões: ...]` do backend).
   */
  buttons?: string[]
  /** Tipo de mídia: "audio", "image", "document", "video", "text" etc. */
  messageType?: string
  /**
   * Discriminante da timeline do chat: mensagem, nota humana, evento
   * automático (sistema/IA), evento de sistema da Meta, resposta de
   * permissão de ligação ou rascunho de IA. Quando ausente, `isNote`
   * continua valendo. (`TimelineItemKind` em chat-timeline/types.)
   */
  kind?: TimelineItemKind
  /**
   * Ação do evento (ícone). Só relevante quando `kind === "event"`.
   */
  eventAction?: ConversationEventAction
  /** Veredito da permissão de ligação — só quando `kind === "consent"`. */
  consentVerdict?: ConsentVerdict
  /**
   * Nome/categoria do template WABA (extraídos do conteúdo bruto pelo
   * adapter). Alimenta o badge "Marketing / Utility / Autenticação".
   */
  templateMeta?: { name: string | null; category: string | null } | null
  /**
   * Nota interna — não enviada ao cliente. Quando true, a bolha é
   * renderizada com estilo diferenciado (fundo amarelo, borda lateral,
   * badge "Nota"). Independe de `type` (sempre tratada como outgoing).
   */
  isNote?: boolean
  /** URL da mídia para áudio, imagem, documento */
  mediaUrl?: string | null
  /**
   * Status de entrega (apenas mensagens outgoing) — exibe ticks estilo
   * WhatsApp: enviando (relógio), enviada (✓), entregue (✓✓ cinza),
   * lida (✓✓ azul), falha (alerta vermelho).
   */
  status?: "pending" | "sent" | "delivered" | "read" | "failed"
  /**
   * Texto do erro de envio (traduzido do Meta quando disponível). Exibido
   * em tooltip ao passar o mouse sobre o ícone de falha (status `failed`).
   */
  sendError?: string
  /**
   * Conexão (Channel) por onde esta mensagem trafegou. Usado para inserir um
   * marcador na timeline quando a conversa alterna de conexão (ex.: dois
   * WhatsApps). `null`/undefined = herda a conexão anterior (sem marcador).
   */
  channelId?: string | null
  /**
   * Citação (reply): quando o cliente responde uma mensagem específica,
   * mostramos o snippet da mensagem citada no topo da bolha. `snippet` é
   * um preview curto (~120 chars); `direction` orienta a cor da barra
   * lateral (verde p/ nossa mensagem, cinza p/ mensagem do cliente).
   */
  replyTo?: {
    /** Id da bolha citada (`externalId ?? id`) — mesmo espaço de `message.id`. */
    messageId?: string | null
    snippet: string
    direction?: "in" | "out"
    senderName?: string | null
  } | null
  /**
   * Reações do cliente nesta mensagem (WhatsApp permite uma reação por
   * pessoa, mas persistimos como array para suportar múltiplos reatores
   * em grupos futuramente). Renderiza como badge flutuante na base.
   */
  reactions?: Array<{ emoji: string; from: string; at?: string }>
  catalogOrder?: {
    catalogId: string
    text: string | null
    currency: string
    total: number
    items: Array<{
      productRetailerId: string
      quantity: number
      itemPrice: number
      currency: string
      productId: string | null
      name: string
      imageUrl: string | null
    }>
  } | null
  /**
   * Favoritada pelo agente LOGADO (marcador pessoal — outros agentes não
   * veem essa marcação). Alimenta a estrela preenchida no menu e o label
   * dinâmico "Favoritar"/"Desfavoritar".
   */
  isFavorited?: boolean
  /**
   * Mensagem atualmente fixada no topo da conversa (banner estilo
   * WhatsApp). Vem de `Conversation.pinnedMessageId` — diferente de
   * `isPinned` (usado só para notas na aba "Notas").
   */
  isPinnedMessage?: boolean
  /**
   * Metadados de separador de ticket (messageType === "ticket-separator").
   * Presente apenas nos itens sintéticos injetados pelo backend quando
   * `?history=1` para marcar o início de cada ticket na linha do tempo.
   */
  ticketInfo?: {
    number: number
    closedAt: string | null
    isCurrent?: boolean
    openedAt?: string | null
    openedByName?: string | null
    openedByUserId?: string | null
    closedByName?: string | null
    closedByUserId?: string | null
  }
}

export interface MessageBubbleProps {
  message: Message
  /** @deprecated Não usar para avatar — a bolha identifica o REMETENTE
   *  (`senderName` / `senderImageUrl`), nunca o usuário da sessão. */
  agentInitials?: string
  /** @deprecated Idem `agentInitials`. Mantido por compat com callers. */
  agentName?: string | null
  /** @deprecated Nunca cair na foto da sessão / "me". Foto só do agente
   *  que enviou (`senderImageUrl` ou lookup por `senderName`). */
  agentImageUrl?: string | null
  /** Mapa fresco `nome (lowercase) → avatarUrl` (GET /api/users). Foto
   *  DESTE agente quando `senderImageUrl` vem nulo. Sem foto → iniciais. */
  senderPhotoByName?: Map<string, string | null> | null
  className?: string
  /** Esta nota está fixada na conversa? Exibe indicador âmbar. */
  isPinned?: boolean
  /** Callback para fixar (messageId) ou desafixar (null). */
  onPinNote?: (messageId: string | null) => void
  /** Callback para adicionar conteúdo da nota ao log/timeline do deal. */
  onAddToLog?: (content: string) => void
  /** Editar o texto de uma nota interna. */
  onEditNote?: (noteId: string, content: string) => void | Promise<unknown>
  /** Excluir uma nota interna. */
  onDeleteNote?: (noteId: string) => void

  // ── Ações de mensagem (menu estilo WhatsApp, recebidas e enviadas) ──
  // Todos opcionais: se não passados, o item some do menu. "Copiar" é
  // interno (usa navigator.clipboard) e sempre aparece p/ mensagens
  // com conteúdo textual — não depende de callback.
  /** Ao clicar em "Responder": abre citação da mensagem no composer. */
  onReplyMessage?: (message: Message) => void
  /** Ao clicar em "Encaminhar": abre modal de seleção de conversa. */
  onForwardMessage?: (message: Message) => void
  /** Ao clicar em uma reação rápida (👍/❤️/…) ou "Reagir". */
  onReactMessage?: (message: Message, emoji: string | null) => void
  /** Ao clicar em "Fixar": fixa a mensagem no topo da conversa. */
  onPinMessage?: (message: Message) => void
  /** Ao clicar em "Favoritar": adiciona à lista de favoritas do agente. */
  onFavoriteMessage?: (message: Message) => void
  /** Ao clicar na citação: rola até a mensagem original no thread. */
  onJumpToQuotedMessage?: (messageId: string) => void
  /** "Reenviar" numa mensagem enviada com `status: "failed"`. */
  onResendMessage?: (message: Message) => void
}
