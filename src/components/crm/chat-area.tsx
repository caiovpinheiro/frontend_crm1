"use client"

import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo, type FormEvent, Fragment } from "react"
import { useSession } from "next-auth/react"
import { useTeamUsers } from "@/features/inbox-v2/hooks/use-permissions"
import { cn } from "@/lib/utils"
import { useMobileChatChrome } from "@/hooks/use-mobile-chat-chrome"
import { TooltipGlass } from "@/components/crm/tooltip-glass"
import { isPreviewMode, PREVIEW_USER } from "@/lib/preview-mode"
import { AppLoading } from "@/components/crm/app-loading"
import { ConversationHistoryLoadRing, ConversationThreadSkeleton } from "@/components/crm/conversation-skeleton"
import { ChatAvatar } from "@/components/inbox/chat-avatar"
import { AVATAR_SIZE, avatarInitials } from "@/lib/avatar"
import { MessageBubble, ConnectionDivider, ConversationClosedMarker, TicketDivider, DaySeparator, formatChatDayLabel, StickyDayPill, useStickyDayLabel, type Message } from "./message-bubble"
import {
  EventRow,
  isConversationCloseEventText,
  isConversationOpenEventText,
  isHideableChatEvent,
  isRedundantOpenStatusEvent,
  useHideChatEvents,
} from "./chat-timeline"
import { SessionAlert } from "./session-alert"
import {
  formatConnectionLabel,
  type ConnectionRef,
} from "@/lib/connection-label"
import {
  IconPhone,
  IconVideo,
  IconDotsVertical,
  IconPaperclip,
  IconMoodSmile,
  IconSend,
  IconMessageCircle,
  IconChecklist,
  IconNote,
  IconClock,
  IconPinFilled,
  IconX,
  IconLock,
  IconChevronDown,
} from "@tabler/icons-react"

export type ChatTabId = "conversa" | "notas" | "atividades" | "timeline" | "chamadas"

const CHAT_TABS: { id: ChatTabId; label: string; icon: React.ComponentType<{ size?: number; stroke?: number }> }[] = [
  { id: "conversa", label: "Conversa", icon: IconMessageCircle },
  { id: "atividades", label: "Tarefas", icon: IconChecklist },
  { id: "notas", label: "Notas", icon: IconNote },
  { id: "timeline", label: "Timeline", icon: IconClock },
  // IB8: nova aba "Chamadas" no topo do inbox, espelhando a aba
  // homonima do DealDetailPanel para padronizar acesso aos logs de
  // telefonia entre os dois paineis.
  { id: "chamadas", label: "Chamadas", icon: IconPhone },
]

/**
 * Tipo legado mantido para retro-compatibilidade com `toChatContact`
 * em `features/inbox-v2/adapters.ts`. O novo header usa SOMENTE `name`
 * + `badge` + (opcional) `badgeLabel`; demais campos sao ignorados
 * visualmente mas continuam aceitos sem quebrar o consumidor.
 */
interface ChatContact {
  name: string
  badge?: "enterprise" | "lead" | "success"
  badgeLabel?: string
  initials?: string
  /** @deprecated — ChatAvatar usa sólido determinístico; mantido por compat. */
  avatarColor?: string
  status?: string
  phone?: string
  contactId?: string
  /** Canal — badge no canto inferior direito (padrão Inbox / ChatAvatar). */
  channel?: string | null
}

interface ChatAreaProps {
  contact: ChatContact
  messages: Message[]
  /** Mantido por compat — nao mais renderizado entre header e mensagens. */
  stages?: { label: string; status: "done" | "active" | "pending" }[]
  daySeparator?: string
  showSessionAlert?: boolean
  className?: string

  /**
   * Conexão ATUAL da conversa (qual WhatsApp/conta). Exibida como chip no
   * header — indica por qual canal a pessoa está conversando agora.
   */
  connection?: ConnectionRef | null
  /**
   * Mapa id→conexão de todos os canais referenciados nas mensagens. Usado
   * para inserir o marcador de troca de conexão na timeline quando a mesma
   * conversa alterna entre contas distintas do canal.
   */
  connections?: Record<string, ConnectionRef>

  // ── Composer controlado (opcional) ──────────────────────────────
  inputValue?: string
  onInputChange?: (value: string) => void
  onSendMessage?: (value: string) => void
  sending?: boolean
  onAttachClick?: () => void
  onEmojiClick?: () => void
  onRecordClick?: () => void
  onPhoneClick?: () => void
  onVideoClick?: () => void
  onMoreClick?: () => void
  inputPlaceholder?: string
  inputDisabled?: boolean

  /**
   * Slot opcional que substitui INTEIRAMENTE o footer (input bar).
   * Quando provido, ignora todos os outros props do composer.
   */
  composerSlot?: React.ReactNode
  /** Slot opcional que substitui os botoes do canto direito do header. */
  headerActionsSlot?: React.ReactNode
  /** Handler do botao "Usar Template" do SessionAlert. */
  onUseTemplate?: () => void

  /**
   * Conteudo das abas opcionais do card. Quando ao menos um e' provido, o
   * card ganha uma barra de abas (Conversa / Atividades / Notas / Timeline).
   * "Conversa" mostra as mensagens + composer; as demais mostram o slot.
   * Sem nenhum slot, o card mantem o comportamento legado (sem abas).
   */
  notesSlot?: React.ReactNode
  activitiesSlot?: React.ReactNode
  timelineSlot?: React.ReactNode
  /** IB8: conteudo da aba "Chamadas" (logs de telefonia). Quando ausente,
   *  a aba "Chamadas" nao aparece. */
  callsSlot?: React.ReactNode
  /** Contagens opcionais exibidas como badge em cada aba. */
  tabCounts?: Partial<Record<ChatTabId, number>>

  // ── Ações nas mensagens recebidas (menu WhatsApp-like) ───────────
  // Passa através para MessageBubble. Se nenhum handler for provido,
  // o menu ainda aparece com "Copiar" (que é interno).
  onReplyMessage?: (message: Message) => void
  onForwardMessage?: (message: Message) => void
  onReactMessage?: (message: Message, emoji: string | null) => void
  onPinMessage?: (message: Message) => void
  onFavoriteMessage?: (message: Message) => void

  /**
   * Mensagens fixadas no topo da conversa (banner estilo WhatsApp). Podem
   * ser várias (máx. 3). O banner exibe uma por vez; clicar cicla para a
   * próxima e ROLA a lista até ela (com highlight). `onUnpinMessage(id)`
   * desafixa a mensagem exibida no momento.
   */
  pinnedMessages?: Array<{ id: string; content: string; senderName?: string | null }>
  onUnpinMessage?: (id: string) => void

  /**
   * ID amigavel sequencial da conversa (Contact/Deal-like #N por
   * organizacao). Quando presente, renderiza um chip mono minimalista
   * no header (ao lado do nome), sem alterar o layout — o operador
   * consegue referenciar o "ticket" em conversa/log sem sair do chat.
   * Numero e' opcional pra manter compat com callers antigos.
   */
  conversationNumber?: number | null
  /** Id da conversa — usado para não resetar o scroll em refetch de histórico. */
  conversationId?: string | null

  /**
   * Sinaliza que a conversa foi encerrada (`status = RESOLVED`). Quando
   * true, renderiza um `ConversationClosedMarker` no fim da lista de
   * mensagens — mesmo padrao visual do DaySeparator/ConnectionDivider,
   * bem discreto. `conversationClosedAt` complementa com data/hora.
   */
  conversationResolved?: boolean
  conversationClosedAt?: string | null

  /**
   * Slot flutuante (canto inferior direito, ao lado da composer) — usado
   * para o botão "Robôs ativos". Renderizado como overlay absoluto dentro
   * do `<main>` (que agora é `relative`); o próprio slot cuida da posição.
   */
  activeBotsSlot?: React.ReactNode
  /**
   * Slot do FAB de ligação (DealCallButton). O botão se posiciona no
   * viewport (portal + `fixed`); aqui só montamos o node.
   */
  floatingCallSlot?: React.ReactNode

  /** Scroll-up: pede a próxima fatia (ticket atual ou histórico). */
  onLoadOlder?: () => void
  hasOlder?: boolean
  /** Tickets anteriores (não dispara sozinho — botão no topo). */
  hasOlderTickets?: boolean
  isLoadingOlder?: boolean
  /** Primeira página ainda em voo — skeleton no painel, não coluna branca. */
  messagesLoading?: boolean
  /** GET da primeira página falhou e não há cache. */
  messagesError?: boolean
}

export function ChatArea({
  contact,
  messages: messagesProp,
  daySeparator,
  showSessionAlert = false,
  className,
  connection,
  connections,
  inputValue,
  onInputChange,
  onSendMessage,
  sending = false,
  onAttachClick,
  onEmojiClick,
  onRecordClick,
  onPhoneClick,
  onVideoClick,
  onMoreClick,
  inputPlaceholder,
  inputDisabled,
  composerSlot,
  headerActionsSlot,
  conversationNumber,
  conversationId,
  onUseTemplate,
  notesSlot,
  activitiesSlot,
  timelineSlot,
  callsSlot,
  tabCounts,
  onReplyMessage,
  onForwardMessage,
  onReactMessage,
  onPinMessage,
  onFavoriteMessage,
  pinnedMessages,
  onUnpinMessage,
  conversationResolved,
  conversationClosedAt,
  activeBotsSlot,
  floatingCallSlot,
  onLoadOlder,
  hasOlder = false,
  hasOlderTickets = false,
  isLoadingOlder = false,
  messagesLoading = false,
  messagesError = false,
}: ChatAreaProps) {
  const messages = useMemo(() => {
    const seen = new Set<string>()
    return messagesProp.filter((m) => {
      if (!m.id) return true
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
  }, [messagesProp])
  const formRef = useRef<HTMLFormElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const stickyDayLabel = useStickyDayLabel(
    messagesRef,
    `${messages[0]?.id ?? ""}:${messages[messages.length - 1]?.id ?? ""}:${messages.length}`,
  )
  // Botão flutuante "descer" (estilo WhatsApp): aparece quando chega mensagem
  // do cliente enquanto o operador está lendo histórico mais acima. O badge
  // conta as novas mensagens não vistas; clicar rola suave até o fim.
  const [showScrollDown, setShowScrollDown] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  // Índice da fixada exibida no banner e id destacado após o scroll.
  const [activePinIndex, setActivePinIndex] = useState(0)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const pins = pinnedMessages ?? []

  // Mantém o índice válido quando a lista de fixadas muda (desafixar etc.).
  useEffect(() => {
    if (activePinIndex >= pins.length && pins.length > 0) {
      setActivePinIndex(0)
    }
  }, [pins.length, activePinIndex])

  // Rola até a mensagem fixada e a destaca por ~1.6s (estilo WhatsApp).
  const scrollToMessage = useCallback((messageId: string) => {
    const container = messagesRef.current
    if (!container) return
    const el = container.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    )
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setHighlightId(messageId)
    window.setTimeout(() => setHighlightId((cur) => (cur === messageId ? null : cur)), 1600)
  }, [])

  // Clique no banner: rola até a fixada atual e avança pra próxima (ciclo).
  const handleBannerClick = useCallback(() => {
    if (pins.length === 0) return
    const current = pins[Math.min(activePinIndex, pins.length - 1)]
    if (current) scrollToMessage(current.id)
    if (pins.length > 1) {
      setActivePinIndex((i) => (i + 1) % pins.length)
    }
  }, [pins, activePinIndex, scrollToMessage])
  const isControlled = onSendMessage !== undefined
  const { data: session } = useSession()

  // Abas opt-in: so aparecem quando ha conteudo para pelo menos uma aba
  // alem de "Conversa".
  const tabsEnabled = Boolean(
    notesSlot || activitiesSlot || timelineSlot || callsSlot,
  )
  const [activeTab, setActiveTab] = useState<ChatTabId>("conversa")

  // Nome/iniciais do agente logado — só contexto de sessão (composer etc.).
  // Avatar da bolha NÃO usa isso: identifica o remetente da mensagem.
  const [agentInitials, setAgentInitials] = useState("·")
  const agentName = useMemo(
    () =>
      session?.user?.name?.trim() ||
      (isPreviewMode() ? PREVIEW_USER.name : ""),
    [session],
  )
  useEffect(() => {
    const name = agentName || "Agente"
    setAgentInitials(avatarInitials(name) || "?")
  }, [agentName])

  // Foto do agente que enviou: lookup por nome (GET /api/users). Sem foto
  // → iniciais daquele agente. Nunca a foto do usuário logado.
  const { data: teamUsers } = useTeamUsers()
  const senderPhotoByName = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const u of teamUsers ?? []) {
      if (u.name) map.set(u.name.trim().toLowerCase(), u.avatarUrl ?? null)
    }
    return map
  }, [teamUsers])

  const NEAR_BOTTOM_PX = 160

  const isNearBottom = (el: HTMLElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX

  // Rola suave (ou instantâneo) até a última mensagem e zera o estado do
  // botão "descer".
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesRef.current
    if (!container) return
    const pin = () => {
      container.scrollTop = container.scrollHeight
    }
    if (behavior === "auto") {
      requestAnimationFrame(() => requestAnimationFrame(pin))
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior })
    }
    stickToBottomRef.current = true
    setShowScrollDown(false)
    setUnreadCount(0)
  }, [])

  const convKey = conversationId ?? (conversationNumber != null ? `n:${conversationNumber}` : "")
  const convKeyRef = useRef(convKey)
  const stickToBottomRef = useRef(true)
  const prevFirstIdRef = useRef<string | null>(null)
  const prevLastIdRef = useRef<string | null>(null)
  const prevScrollHeightRef = useRef(0)
  const onLoadOlderRef = useRef(onLoadOlder)
  onLoadOlderRef.current = onLoadOlder
  // Só true após wheel/touch UP do operador, depois do pin de abertura.
  // Open/prefetch nunca arma — ticket curto deixa scrollTop=0 e isso
  // virava loop de histórico.
  const [olderArmed, setOlderArmed] = useState(false)
  const pinSettledRef = useRef(false)
  const viewportPrefetchDoneRef = useRef<string | null>(null)

  const pinToBottom = (container: HTMLElement) => {
    container.scrollTop = container.scrollHeight - container.clientHeight
  }

  const listFillsViewport = (container: HTMLElement) => {
    const list = container.querySelector("ul")
    const listH = list instanceof HTMLElement ? list.getBoundingClientRect().height : 0
    return listH + 24 >= container.clientHeight
  }

  // Esconde o botão só quando o operador está no fim; mostra sempre que
  // sobe no histórico (não só quando chega inbound).
  useEffect(() => {
    const container = messagesRef.current
    if (!container) return
    const onScroll = () => {
      const near = isNearBottom(container)
      stickToBottomRef.current = near
      setShowScrollDown(!near)
      if (near) setUnreadCount(0)
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => container.removeEventListener("scroll", onScroll)
  }, [])

  // Preview de mídia pode crescer depois do pin (vídeo com metadata).
  // Re-pina só se o operador já estava no fim — thread curto (scrollTop=0) não muda.
  useEffect(() => {
    const container = messagesRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return
      pinToBottom(container)
    })
    const list = container.querySelector("ul")
    if (list) ro.observe(list)
    return () => ro.disconnect()
  }, [convKey, messages.length])

  // Troca de conversa: pin no fim. NUNCA arma older aqui — scrollTop fica 0
  // quando o ticket cabe na viewport, e isso virava loop de histórico.
  useLayoutEffect(() => {
    const switched = convKeyRef.current !== convKey
    convKeyRef.current = convKey
    if (switched) {
      setOlderArmed(false)
      pinSettledRef.current = false
      viewportPrefetchDoneRef.current = null
      stickToBottomRef.current = true
      setShowScrollDown(false)
      setUnreadCount(0)
      prevFirstIdRef.current = null
      prevLastIdRef.current = null
    }
    if (!switched && prevLastIdRef.current != null) return
    stickToBottomRef.current = true
    setShowScrollDown(false)
    setUnreadCount(0)
    prevFirstIdRef.current = messages[0]?.id ?? null
    prevLastIdRef.current = messages[messages.length - 1]?.id ?? null
    const container = messagesRef.current
    if (!container) return
    pinToBottom(container)
    requestAnimationFrame(() => {
      pinToBottom(container)
      if (messagesLoading || messages.length === 0) return
      if (viewportPrefetchDoneRef.current === convKey) {
        pinSettledRef.current = true
        return
      }
      // 1ª página já preenche a tela → sem GET extra. Ticket curto +
      // tickets anteriores → uma fatia, depois pin. Sem loop de fill.
      if (!hasOlderTickets || listFillsViewport(container)) {
        viewportPrefetchDoneRef.current = convKey
        pinSettledRef.current = true
        return
      }
      viewportPrefetchDoneRef.current = convKey
      onLoadOlderRef.current?.()
    })
  }, [convKey, messages, messagesLoading, hasOlderTickets])

  // Append no fim: gruda se o operador já estava no rodapé (ou mandou
  // mensagem). Eventos de sistema (permissão de ligação, distribuição)
  // não puxam a tela se ele estiver lendo histórico.
  useEffect(() => {
    const container = messagesRef.current
    if (!container) return
    const firstId = messages[0]?.id ?? null
    const last = messages[messages.length - 1]
    const lastId = last?.id ?? null
    const prevFirst = prevFirstIdRef.current
    const prevLast = prevLastIdRef.current
    prevFirstIdRef.current = firstId
    prevLastIdRef.current = lastId

    if (!lastId || lastId === prevLast) return
    if (prevLast == null) return

    const near = stickToBottomRef.current || isNearBottom(container)
    const ownChat =
      last.type === "outgoing" && last.kind !== "event" && last.kind !== "note"
    if (ownChat || near) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
      })
      setShowScrollDown(false)
      setUnreadCount(0)
    } else {
      setShowScrollDown(true)
      setUnreadCount((n) => n + 1)
    }
  }, [messages])

  // Prepend: prefetch (olderArmed ainda false) re-pina embaixo DEPOIS do
  // merge. Gesto do operador preserva o ponto de leitura.
  useLayoutEffect(() => {
    const container = messagesRef.current
    if (!container) return
    const firstId = messages[0]?.id ?? null
    const lastId = messages[messages.length - 1]?.id ?? null
    const prepended =
      prevFirstIdRef.current != null &&
      firstId !== prevFirstIdRef.current &&
      lastId === prevLastIdRef.current
    if (prepended) {
      if (!olderArmed) {
        pinToBottom(container)
        requestAnimationFrame(() => {
          pinToBottom(container)
          pinSettledRef.current = true
        })
      } else {
        container.scrollTop += container.scrollHeight - prevScrollHeightRef.current
      }
    }
    prevScrollHeightRef.current = container.scrollHeight
  }, [messages, olderArmed])

  const canLoadOlder = hasOlder || hasOlderTickets
  // Só sinal — não carrega. Some no gesto (olderArmed) ou quando a API
  // já não tem fatia acima.
  const showOlderHint =
    canLoadOlder &&
    !olderArmed &&
    !isLoadingOlder &&
    messages.length > 0 &&
    !messagesLoading &&
    !messagesError
  useEffect(() => {
    if (!canLoadOlder || isLoadingOlder) return
    const root = messagesRef.current
    if (!root) return

    // Um gesto = uma fatia. scrollTop≈0 no open/prefetch NÃO conta.
    const loadFromGesture = () => {
      if (!pinSettledRef.current) return
      setOlderArmed(true)
      stickToBottomRef.current = false
      onLoadOlderRef.current?.()
    }

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && root.scrollTop <= 0) loadFromGesture()
    }
    const onTouch = (() => {
      let startY = 0
      return {
        start: (e: TouchEvent) => {
          startY = e.touches[0]?.clientY ?? 0
        },
        move: (e: TouchEvent) => {
          const y = e.touches[0]?.clientY ?? 0
          if (y - startY > 24 && root.scrollTop <= 0) loadFromGesture()
        },
      }
    })()
    root.addEventListener("wheel", onWheel, { passive: true })
    root.addEventListener("touchstart", onTouch.start, { passive: true })
    root.addEventListener("touchmove", onTouch.move, { passive: true })

    return () => {
      root.removeEventListener("wheel", onWheel)
      root.removeEventListener("touchstart", onTouch.start)
      root.removeEventListener("touchmove", onTouch.move)
    }
  }, [canLoadOlder, isLoadingOlder])

  const { hideEvents } = useHideChatEvents()

  const effectiveDisabled = inputDisabled ?? showSessionAlert
  const value = inputValue ?? ""

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!onSendMessage) return
    const trimmed = value.trim()
    if (!trimmed || sending || effectiveDisabled) return
    onSendMessage(trimmed)
  }

  // Mobile: esconde bottom nav global; composer fica fixo na base do chat.
  useMobileChatChrome(true)

  return (
    <main
      aria-label={`Conversa com ${contact.name}`}
      data-tour="inbox-chat"
      className={cn(
        // h-full min-h-0: o pai (inbox mobile) limita a altura; sem isso a
        // lista de mensagens estoura o viewport e o composer some abaixo
        // do clip em conversas longas.
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] backdrop-blur-md shadow-[var(--glass-shadow)]",
        className,
      )}
    >
      <header className="shrink-0 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)]">
        <div className="flex items-center gap-3 px-4 py-2">
          <TooltipGlass label={contact.name} side="bottom">
            <ChatAvatar
              user={{
                id: contact.contactId ?? contact.name,
                name: contact.name,
              }}
              phone={contact.phone}
              channel={contact.channel ?? connection?.type ?? null}
              size={AVATAR_SIZE.lg}
            />
          </TooltipGlass>

          {/* Header enxuto: sem badge de tipo (CLIENTE/LEAD) nem chip
              "Encerrada" (status resolvido vira faixa verde abaixo). O nº da
              conversa (ticket) foi movido pro canto inferior esquerdo, junto
              ao composer — estilo Kommo. */}
          {tabsEnabled && (
            <div data-tour="inbox-chat-tabs" className="min-w-0 flex-1">
              <ChatTabsBar
                activeTab={activeTab}
                onChange={setActiveTab}
                hiddenTabs={{
                  notas: !notesSlot,
                  atividades: !activitiesSlot,
                  timeline: !timelineSlot,
                  chamadas: !callsSlot,
                }}
              />
            </div>
          )}

          <div data-tour="inbox-chat-actions" className="ml-auto flex shrink-0 items-center gap-1">
            {headerActionsSlot ?? (
              <>
                {contact.phone && (
                  <IconBtn title={`Ligar para ${contact.phone}`} onClick={onPhoneClick}>
                    <IconPhone size={17} />
                  </IconBtn>
                )}
                <IconBtn title="Vídeo chamada" onClick={onVideoClick}>
                  <IconVideo size={17} />
                </IconBtn>
                <IconBtn title="Mais opções" onClick={onMoreClick}>
                  <IconDotsVertical size={17} />
                </IconBtn>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Botão flutuante "Robôs ativos" — overlay no canto inf. direito,
          ao lado da composer. O slot cuida do próprio posicionamento. */}
      {activeBotsSlot}

      {/* SIP FAB — posiciona-se no viewport (DealCallButton `fab`). */}
      {floatingCallSlot}

      {/* Faixa sutil de conversa resolvida — substitui o chip "ENCERRADA"
          do header. Verde suave, discreta, colada abaixo do header. */}
      {conversationResolved && (
        <div
          role="status"
          className="flex shrink-0 items-center justify-center gap-1.5 border-b border-emerald-500/15 bg-emerald-500/10 px-4 py-1 text-[11px] font-medium text-emerald-700 v2-dark:text-emerald-400"
        >
          <IconLock size={11} className="shrink-0" />
          Conversa resolvida
          {conversationClosedAt && (() => {
            const d = new Date(conversationClosedAt)
            if (Number.isNaN(d.getTime())) return null
            const dd = String(d.getDate()).padStart(2, "0")
            const mm = String(d.getMonth() + 1).padStart(2, "0")
            const hh = String(d.getHours()).padStart(2, "0")
            const mi = String(d.getMinutes()).padStart(2, "0")
            return <span className="text-emerald-700/70 v2-dark:text-emerald-400/70">· {dd}/{mm} às {hh}:{mi}</span>
          })()}
        </div>
      )}

      {tabsEnabled && activeTab !== "conversa" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {activeTab === "notas"
            ? notesSlot
            : activeTab === "atividades"
              ? activitiesSlot
              : activeTab === "chamadas"
                ? callsSlot
                : timelineSlot}
        </div>
      ) : (
        <>
      {/* PINNED MESSAGES BANNER — estilo WhatsApp: várias fixadas, clicar
          cicla e rola até a mensagem. Mostra 1 por vez + contador. */}
      {pins.length > 0 && (() => {
        const idx = Math.min(activePinIndex, pins.length - 1)
        const current = pins[idx]
        return (
          <div className="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-lg border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.06] px-3 py-2">
            <IconPinFilled size={14} className="shrink-0 text-[var(--brand-primary)]" />
            <button
              type="button"
              onClick={handleBannerClick}
              className="min-w-0 flex-1 cursor-pointer text-left"
              aria-label="Ir para a mensagem fixada"
            >
              <p className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-[var(--brand-primary)]">
                Mensagem fixada
                {pins.length > 1 && (
                  <span className="rounded-full bg-[var(--brand-primary)]/15 px-1.5 py-px text-[9px] tabular-nums">
                    {idx + 1}/{pins.length}
                  </span>
                )}
              </p>
              <p className="truncate text-[12.5px] text-[var(--text-secondary)]">
                {current.senderName ? `${current.senderName}: ` : ""}
                {current.content}
              </p>
            </button>
            {onUnpinMessage && (
              <button
                type="button"
                onClick={() => onUnpinMessage(current.id)}
                aria-label="Desafixar mensagem"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)]"
              >
                <IconX size={14} />
              </button>
            )}
          </div>
        )
      })()}
      <div className="flex min-h-0 flex-1 flex-col">
      {/* MESSAGES — única área rolável; min-h-0 permite encolher e manter
          o footer (composer) sempre visível na base. */}
      <div ref={messagesRef} data-tour="inbox-chat-thread" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain [overflow-anchor:none] px-3 pt-3 pb-8 max-md:px-2">
        {messages.length > 0 && !messagesLoading && !messagesError ? (
          <StickyDayPill date={stickyDayLabel} />
        ) : null}
        {messagesLoading ? (
          <ConversationThreadSkeleton />
        ) : messagesError ? (
          <AppLoading
            variant="inline"
            className="min-h-0 flex-1"
            error="Não foi possível carregar as mensagens."
          />
        ) : messages.length === 0 ? (
          <p className="m-auto text-center text-[13px] text-muted-foreground">
            Nenhuma mensagem nesta conversa.
          </p>
        ) : (
        <>
        {showOlderHint ? (
          <p
            className="pointer-events-none shrink-0 pb-1 pt-8 text-center text-[11px] font-medium text-muted-foreground"
            role="status"
          >
            ↑ Role para ver mensagens anteriores
          </p>
        ) : null}
        {isLoadingOlder && messages.length > 0 ? (
          <ConversationHistoryLoadRing />
        ) : null}
        {/* Sem spacer flex-1: thread curto preenche de cima. Thread longo
            continua pinado no fim via pinToBottom. */}
        <ul className="flex list-none flex-col gap-0.5">
        {(() => {
          // Pills de dia inline no fluxo. O dia no topo vem do overlay
          // `StickyDayPill` — a pill in-flow do dia atual fica invisible
          // (mantém altura). `data-day-sep` alimenta o sticky.
          const distinctChannels = new Set(
            messages.map((m) => m.channelId).filter(Boolean) as string[],
          )
          const showConnSwitches = distinctChannels.size >= 2
          let lastChannelId: string | null = null
          let lastDayLabel: string | null = null
          let lastLane: "in" | "out" | "other" | null = null
          const sectionHasEvent = (
            from: number,
            pred: (content: string) => boolean,
          ) => {
            for (let i = from + 1; i < messages.length; i++) {
              const m = messages[i]
              if (m.messageType === "ticket-separator") break
              if (m.kind === "event" && pred(m.content ?? "")) return true
            }
            return false
          }
          return messages.map((message, index) => {
            // Separador de ticket — item sintético injetado pelo backend
            // quando `?history=1`. Não é uma bolha; renderiza diretamente.
            if (message.messageType === "ticket-separator" && message.ticketInfo) {
              const info = message.ticketInfo
              const hideDivider = info.isCurrent
                ? sectionHasEvent(index, (c) =>
                    isConversationOpenEventText(c, info.number),
                  )
                : sectionHasEvent(index, isConversationCloseEventText)
              if (hideDivider) return null
              lastLane = null
              return (
                <li key={message.id || `sep-${index}`} className="list-none">
                  <TicketDivider
                    number={info.number}
                    closedAt={info.closedAt}
                    isCurrent={info.isCurrent}
                    openedAt={info.openedAt}
                    openedByName={info.openedByName}
                    openedByUserId={info.openedByUserId}
                    closedByName={info.closedByName}
                    closedByUserId={info.closedByUserId}
                  />
                </li>
              )
            }
            if (message.type !== "incoming" && message.type !== "outgoing") {
              return null
            }
            if (message.kind === "event" && isRedundantOpenStatusEvent(message.content)) {
              return null
            }
            if (hideEvents && isHideableChatEvent(message)) {
              return null
            }
            const dayLabel = formatChatDayLabel(message.createdAt)
            const isNewDay = Boolean(dayLabel && dayLabel !== lastDayLabel)
            if (isNewDay && dayLabel) lastDayLabel = dayLabel
            const showDay = isNewDay && Boolean(dayLabel)
            // Marcador de troca de conexão: aparece quando o channelId muda
            // em relação à última mensagem com canal conhecido.
            let connLabel: string | null = null
            if (showConnSwitches && message.channelId) {
              if (message.channelId !== lastChannelId) {
                const ref = connections?.[message.channelId]
                if (ref) connLabel = formatConnectionLabel(ref)
                lastChannelId = message.channelId
              }
            }
            const isEvent = message.kind === "event"
            const lane: "in" | "out" | "other" =
              isEvent || message.isNote ? "other" : message.type === "outgoing" ? "out" : "in"
            const clusterBreak = !isNewDay && lastLane !== null && lastLane !== lane
            lastLane = lane
            return (
              <Fragment key={`${message.id || "msg"}-${index}`}>
                {showDay && dayLabel ? (
                  <li className="pointer-events-none list-none">
                    <DaySeparator
                      date={dayLabel}
                      occluded={Boolean(stickyDayLabel) && dayLabel === stickyDayLabel}
                    />
                  </li>
                ) : null}
                <li
                  className={cn("list-none", clusterBreak && "mt-2")}
                  data-day-label={dayLabel || daySeparator || undefined}
                >
                {connLabel && <ConnectionDivider label={connLabel} />}
                <div
                  data-message-id={message.id}
                  className={cn(
                    "flex flex-col overflow-visible scroll-mt-24 rounded-[var(--radius-lg)] transition-[background-color,box-shadow] duration-500",
                    highlightId === message.id &&
                      "bg-[var(--brand-primary)]/10 shadow-[0_0_0_2px_var(--brand-primary)]",
                  )}
                >
                  {isEvent ? (
                    <EventRow
                      action={message.eventAction ?? "ia"}
                      text={message.content}
                      actor={message.senderName ?? ""}
                      actorId={message.senderUserId}
                      time={message.time}
                    />
                  ) : (
                    <MessageBubble
                      message={message}
                      agentInitials={agentInitials}
                      agentName={agentName}
                      senderPhotoByName={senderPhotoByName}
                      onReplyMessage={onReplyMessage}
                      onForwardMessage={onForwardMessage}
                      onReactMessage={onReactMessage}
                      onPinMessage={onPinMessage}
                      onFavoriteMessage={onFavoriteMessage}
                    />
                  )}
                </div>
                </li>
              </Fragment>
            )
          })
        })()}
        </ul>

        {/* Marcador de encerramento — ultimo item da lista, alinhado com
            o padrao visual do DaySeparator/ConnectionDivider. Fica visivel
            de dentro do proprio chat, sem card lateral, atendendo ao
            pedido "simples/minimalista dentro do chat". */}
        {conversationResolved &&
          !messages.some(
            (m) => m.kind === "event" && isConversationCloseEventText(m.content),
          ) && (
          <ConversationClosedMarker
            closedAt={conversationClosedAt ?? null}
            conversationNumber={conversationNumber}
          />
        )}
        </>
        )}
      </div>
      </div>

      {/* Botão flutuante "descer" (estilo WhatsApp) — só aparece quando o
          operador está lendo histórico e chega mensagem nova. Segue os tokens
          de vidro da página; badge reusa o estilo de não-lidas da lista. */}
      {showScrollDown && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label={
            unreadCount > 0
              ? `${unreadCount} mensagens não lidas — ir para o fim`
              : "Ir para a última mensagem"
          }
          className="absolute bottom-24 right-6 z-30 flex size-10 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-px hover:text-[var(--brand-primary)] active:scale-95"
        >
          <IconChevronDown size={20} />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[10px] font-bold leading-none text-primary-foreground shadow-[var(--shadow-sm)] tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Footer fixo: alerta + composer (Mensagem/Nota + input). No mobile a
          bottom nav some via useMobileChatChrome — bloco fica na base. */}
      <div
        data-chat-composer-footer
        className="shrink-0 border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)]/95 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] pt-0.5 backdrop-blur-md"
      >
      {showSessionAlert && <SessionAlert onUseTemplate={onUseTemplate} />}

      {composerSlot ?? (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="mx-6 mb-2 flex h-11 items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] pl-3 pr-1.5 shadow-[var(--glass-shadow-sm)] max-md:mx-3"
        >
          <TooltipGlass label="Anexar" side="top">
            <button
              type="button"
              onClick={onAttachClick}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-subtle)] hover:text-[var(--brand-primary)]"
            >
              <IconPaperclip size={17} />
            </button>
          </TooltipGlass>
          <input
            type="text"
            placeholder={inputPlaceholder ?? "Escreva sua mensagem..."}
            disabled={effectiveDisabled || sending}
            value={isControlled ? value : undefined}
            onChange={isControlled ? (e) => onInputChange?.(e.target.value) : undefined}
            className="min-w-0 flex-1 self-stretch border-none bg-transparent px-1 font-body text-[13.5px] leading-none text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <TooltipGlass label="Emoji" side="top">
            <button
              type="button"
              onClick={onEmojiClick}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-subtle)] hover:text-[var(--brand-primary)]"
            >
              <IconMoodSmile size={17} />
            </button>
          </TooltipGlass>
          {onRecordClick && (
            <TooltipGlass label="Áudio" side="top">
              <button
                type="button"
                onClick={onRecordClick}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-subtle)] hover:text-[var(--brand-primary)]"
              >
                <IconMoodSmile size={17} />
              </button>
            </TooltipGlass>
          )}
          <TooltipGlass label="Enviar mensagem" side="top">
            <button
              type={isControlled ? "submit" : "button"}
              disabled={isControlled && (!value.trim() || sending || effectiveDisabled)}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--brand-primary)] text-white shadow-[0_2px_8px_rgba(91,111,245,0.35)] transition-all hover:scale-[1.05] hover:bg-[var(--brand-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              <IconSend size={15} />
            </button>
          </TooltipGlass>
        </form>
      )}

      {/* Nº da conversa fica na barra do Composer (ao lado de Encerrar/Reabrir)
          quando há composerSlot — evita duplicar e libera altura do chat. */}
      {conversationNumber != null && !composerSlot && (
        <div
          className={cn(
            "px-6 pb-0.5 font-display text-[11px] font-semibold tabular-nums max-md:px-3",
            conversationResolved
              ? "text-[var(--text-muted)]"
              : "text-emerald-600 v2-dark:text-emerald-400",
          )}
        >
          Conversa Nº {conversationNumber}
        </div>
      )}
      </div>
        </>
      )}
    </main>
  )
}

/**
 * Barra de abas do card de conversa (Conversa / Atividades / Notas / Timeline).
 */
function ChatTabsBar({
  activeTab,
  onChange,
  hiddenTabs,
}: {
  activeTab: ChatTabId
  onChange: (id: ChatTabId) => void
  hiddenTabs?: Partial<Record<ChatTabId, boolean>>
}) {
  return (
    // Borda/radius no container do scroll — evita corte reto ao H-scroll
    // (overflow retangular sobre a pílula interna).
    <div className="toolbar-hscroll min-w-0 max-w-full rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-1">
      <div className="inline-flex w-max flex-nowrap items-center gap-1">
        {CHAT_TABS.filter((t) => t.id === "conversa" || !hiddenTabs?.[t.id]).map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-display text-xs font-bold transition-all",
                isActive
                  ? "bg-[var(--brand-primary)] text-white shadow-[var(--glass-shadow-sm)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
              )}
            >
              <Icon size={13} stroke={isActive ? 2.4 : 2} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode
  title?: string
  onClick?: () => void
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
    >
      {children}
    </button>
  )
  if (!title) return btn
  return <TooltipGlass label={title} side="bottom">{btn}</TooltipGlass>
}
