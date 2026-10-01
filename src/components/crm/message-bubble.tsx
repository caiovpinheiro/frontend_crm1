import { memo, useState, useRef, useEffect, useCallback, type TouchEvent } from "react"
import { IconPinFilled, IconRefresh } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { NoteRow } from "@/components/crm/chat-timeline"
import type { MessageBubbleProps } from "./message-bubble/types"
import {
  AUTOMATION_BG,
  AUTOMATION_TEXT,
  MENU_LONG_PRESS_MS,
} from "./message-bubble/constants"
import { BubbleBadges } from "./message-bubble/bubble-badges"
import { BubbleMeta } from "./message-bubble/bubble-meta"
import { MessageButtons, QuotedPreview, ReactionBadge } from "./message-bubble/bubble-parts"
import { useDeliveryStale } from "./message-bubble/delivery-stale"
import { MessageContent, MetaReserve } from "./message-bubble/message-content"
import { MessageActionsMenu } from "./message-bubble/message-actions-menu"
import { SenderAvatar } from "./message-bubble/sender-avatar"
import {
  detectMediaKind,
  isPlaceholderContent,
} from "./message-bubble/media-helpers"
import {
  CatalogOrderBubble,
  FormBubble,
  VoiceCallEventRow,
  isVoiceCallEvent,
} from "./message-bubble/variants"

export { audioMp3Url, nextAudioSourceAfterError } from "./message-bubble/audio-player"
export { STALE_DELIVERY_MS, isDeliveryStale } from "./message-bubble/delivery-stale"
export { templateBadgeInfo } from "./message-bubble/template-badge"

export type { FormField, Message, MessageBubbleProps } from "./message-bubble/types"

/**
 * `memo`: o chat re-renderiza a cada tecla do composer / patch SSE. Com
 * `message` estável (adapter) e handlers estáveis (`useCallback` no
 * `ChatArea`/página), cada bolha só renderiza quando a própria mensagem
 * muda. Só o `memo` na exportação — sem refatorar o corpo.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  senderPhotoByName,
  className,
  isPinned,
  onPinNote,
  onAddToLog,
  onEditNote,
  onDeleteNote,
  onReplyMessage,
  onForwardMessage,
  onReactMessage,
  onPinMessage,
  onFavoriteMessage,
  onJumpToQuotedMessage,
  onResendMessage,
}: MessageBubbleProps) {
  const isOutgoing = message.type === "outgoing"
  const deliveryStale = useDeliveryStale(
    isOutgoing ? message.status : undefined,
    message.createdAt,
  )
  const isBot = message.isBot ?? false
  const isCampaign = message.isCampaign === true
  const isNote = message.isNote === true
  const hasForm = !!(message.formFields && message.formFields.length > 0)
  const hasButtons = !!(message.buttons && message.buttons.length > 0)
  const senderName = message.senderName
  // Imagem/vídeo sem legenda: o horário flutua sobre a mídia — precisa
  // contraste próprio (texto muted some em fundo escuro da foto).
  const mediaKind = detectMediaKind(message.messageType, message.mediaUrl)
  const timeOverMedia =
    !hasButtons &&
    !!message.mediaUrl &&
    (mediaKind === "image" || mediaKind === "video") &&
    isPlaceholderContent(message.content ?? "")

  // Menu WhatsApp-like em qualquer bolha não-nota — recebidas e enviadas
  // (citar/reagir/fixar/favoritar/encaminhar na própria mensagem, como o
  // ChatWindow). Notas têm as ações da NoteRow; forms e ligações não.
  const hasActionsMenu =
    !isNote &&
    !hasForm &&
    message.messageType !== "sip_call" &&
    message.messageType !== "whatsapp_call" &&
    message.messageType !== "whatsapp_call_recording"
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])
  useEffect(() => () => clearLongPress(), [clearLongPress])
  const startLongPress = useCallback(() => {
    if (!hasActionsMenu) return
    clearLongPress()
    longPressTimer.current = setTimeout(() => {
      setActionsMenuOpen(true)
    }, MENU_LONG_PRESS_MS)
  }, [hasActionsMenu, clearLongPress])

  if (hasForm) {
    return <FormBubble message={message} className={className} />
  }

  // Ligação SIP ou WhatsApp Calling: EventRow na conversa.
  // Gravação WhatsApp COM mediaUrl cai no fluxo de áudio (detectMediaKind).
  if (isVoiceCallEvent(message)) {
    return <VoiceCallEventRow message={message} className={className} />
  }

  // Nota interna humana — card com cadeado + rótulo "NOTA".
  // Eventos automáticos NÃO passam por aqui (`kind === "event"`).
  if (isNote) {
    return (
      <NoteRow
        className={className}
        content={<MessageContent message={message} isOutgoing={false} />}
        senderName={senderName}
        time={message.time}
        isPinned={isPinned}
        noteId={message.id}
        logContent={message.content}
        onPinNote={onPinNote}
        onAddToLog={onAddToLog}
        onEditNote={onEditNote}
        onDeleteNote={onDeleteNote}
      />
    )
  }

  if (
    String(message.messageType ?? "").toLowerCase() === "order" &&
    message.catalogOrder &&
    message.catalogOrder.items.length > 0
  ) {
    return (
      <CatalogOrderBubble
        order={message.catalogOrder}
        time={message.time}
        className={className}
      />
    )
  }

  const metaReserve =
    !hasButtons && !timeOverMedia ? (
      <MetaReserve
        time={message.time}
        isOutgoing={isOutgoing}
        status={isOutgoing ? message.status : undefined}
        isFavorited={message.isFavorited}
      />
    ) : null
  const hasReactions = !!(message.reactions && message.reactions.length > 0)
  const isCallRec =
    String(message.messageType ?? "").toLowerCase() === "whatsapp_call_recording" &&
    !!message.mediaUrl
  const actionsMenuHandlers = hasActionsMenu
    ? {
        onContextMenu: (e: { preventDefault: () => void }) => {
          e.preventDefault()
          setActionsMenuOpen(true)
        },
        onTouchStart: startLongPress,
        onTouchEnd: (e: TouchEvent<HTMLDivElement>) => {
          // Toque longo já abriu: não dispara o click sintético do browser.
          if (actionsMenuOpen) e.preventDefault()
          clearLongPress()
        },
        onTouchMove: clearLongPress,
        onTouchCancel: clearLongPress,
      }
    : {}

  return (
    <div
      className={cn(
        "flex w-fit max-w-[75%] flex-col gap-0.5 overflow-visible",
        isOutgoing ? "ml-auto items-end" : "items-start",
        hasReactions && "relative z-[2] mb-3",
        className,
      )}
    >
      <div
        className={cn(
          "group relative flex max-w-full overflow-visible",
          isOutgoing ? "flex-row-reverse items-end gap-2.5" : "items-start",
        )}
        {...actionsMenuHandlers}
      >
        {/* Avatar: robô para bot, iniciais para agente — com tooltip do nome.
            Automação manual (colab): robô + chip de iniciais do agente que
            acionou, sobreposto no canto inferior direito. */}
        {isOutgoing && (
          <SenderAvatar
            message={message}
            isBot={isBot}
            isCampaign={isCampaign}
            senderName={senderName}
            senderPhotoByName={senderPhotoByName}
          />
        )}
        <div
          className={cn(
            "relative min-w-0 overflow-visible rounded-[var(--radius-lg)] px-3 py-2 text-sm leading-[1.45]",
            hasReactions && "z-[2]",
            isOutgoing ? "chat-bubble-sent" : "chat-bubble-received",
            isOutgoing
              ? isCampaign
                ? "rounded-br border shadow-[0_3px_12px_rgba(13,148,136,0.18)]"
                : isBot
                // Bolha de AUTOMAÇÃO: cinza escuro com texto claro.
                // Cores hardcoded (não usar --text-primary) porque em v2-dark
                // o token flipa e some contra o fundo fixo desta bolha.
                ? "rounded-br border border-white/10 shadow-[0_3px_12px_rgba(15,20,40,0.28)]"
                : isCallRec
                ? "rounded-br shadow-[0_3px_12px_rgba(20,60,40,0.28)]"
                : "rounded-br shadow-[0_4px_16px_rgba(91,111,245,0.30)]"
              : isCallRec
                ? "rounded-bl text-[#d8f3dc] shadow-[0_2px_10px_rgba(20,60,40,0.16)]"
                : "rounded-bl text-[var(--text-primary)] shadow-[0_2px_12px_rgba(100,130,180,0.10)]",
          )}
          style={
            isCallRec
              ? isOutgoing
                ? { background: "#1b4332", color: "#e8f5e9" }
                : { background: "#245c3d", color: "#e8f5e9" }
              : isOutgoing
              ? isCampaign
                ? {
                    background: "var(--chat-bubble-campaign-bg)",
                    color: "var(--chat-bubble-campaign-text)",
                    borderColor: "var(--chat-bubble-campaign-border)",
                  }
                : isBot
                ? {
                    // Lavanda com texto violeta-escuro fixo — invariante ao
                    // data-chat-theme e ao modo dark/light (ref. V0).
                    background: AUTOMATION_BG,
                    color: AUTOMATION_TEXT,
                  }
                : {
                    background: "var(--chat-bubble-sent-bg)",
                    color: "var(--chat-bubble-sent-text)",
                  }
              : { background: "var(--chat-bubble-received-bg)", color: "var(--chat-bubble-received-text)" }
          }
        >
          {/* Indicador de mensagem fixada — banner no topo da conversa
              (Conversation.pinnedMessageId). Canto oposto ao chevron do
              menu (que fica em -right-2 nas recebidas) pra não colidir. */}
          {message.isPinnedMessage && (
            <span
              className="absolute -left-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-black/5 shadow-[0_2px_6px_rgba(15,20,40,0.18)]"
              style={{ background: "#ffffff" }}
              title="Mensagem fixada"
            >
              <IconPinFilled size={10} className="text-[var(--brand-primary)]" />
            </span>
          )}
          <BubbleBadges
            message={message}
            isOutgoing={isOutgoing}
            isBot={isBot}
            isCampaign={isCampaign}
            senderName={senderName}
          />
          {/* Citação: cliente respondeu uma mensagem específica.
              Barra vertical + trecho curto, estilo WhatsApp. */}
          {message.replyTo?.snippet && (
            <QuotedPreview
              snippet={message.replyTo.snippet}
              direction={message.replyTo.direction ?? "out"}
              senderName={message.replyTo.senderName ?? null}
              onLightBg={!isOutgoing}
              messageId={message.replyTo.messageId ?? null}
              onJump={onJumpToQuotedMessage}
            />
          )}
          {/* Conteúdo: mídia (áudio/imagem/vídeo/documento) ou texto */}
          <MessageContent message={message} isOutgoing={isOutgoing} metaReserve={metaReserve} />
          {/* Botões de resposta rápida (interactive/template) — cards
              empilhados abaixo do corpo, estilo WhatsApp/V0. */}
          {message.buttons && message.buttons.length > 0 && (
            <MessageButtons buttons={message.buttons} onLightBg={!isOutgoing} />
          )}
          {/* Horário + ticks. Sem botões, overlay no spacer do texto
              (canto inferior direito — padrão WhatsApp Web).
              `bottom`/`right` batem com py-2 / px-3.
              COM botões, entra em fluxo abaixo deles. */}
          <BubbleMeta
            message={message}
            isOutgoing={isOutgoing}
            isBot={isBot}
            isCampaign={isCampaign}
            hasButtons={hasButtons}
            timeOverMedia={timeOverMedia}
            deliveryStale={deliveryStale}
          />
          {/* Badge de reação: sobrepõe a borda inferior (não o horário, que
              fica à direita). z-index acima do card seguinte; o parent tem
              overflow visible + margem pra não clipar. */}
          {message.reactions && message.reactions.length > 0 && (
            <ReactionBadge
              reactions={message.reactions}
              anchor={isOutgoing ? "left" : "right"}
              onClick={
                hasActionsMenu ? () => setActionsMenuOpen(true) : undefined
              }
            />
          )}
        </div>
        {hasActionsMenu && (
          <MessageActionsMenu
            message={message}
            isOutgoing={isOutgoing}
            open={actionsMenuOpen}
            onOpenChange={setActionsMenuOpen}
            onReply={onReplyMessage}
            onForward={onForwardMessage}
            onReact={onReactMessage}
            onPin={onPinMessage}
            onFavorite={onFavoriteMessage}
          />
        )}
      </div>

      {/* Falha de envio: "Reenviar" cria uma NOVA mensagem com o mesmo
          conteúdo (texto ou reuse da mídia) — paridade com o ChatWindow. */}
      {isOutgoing && message.status === "failed" && onResendMessage ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onResendMessage(message)
          }}
          aria-label="Reenviar mensagem"
          className="mt-0.5 inline-flex items-center gap-1 self-end rounded-full px-2 py-0.5 font-display text-[11px] font-semibold text-[var(--color-danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]"
        >
          <IconRefresh size={12} stroke={2.4} aria-hidden />
          Reenviar
        </button>
      ) : null}

      {/* Nome do remetente apenas no tooltip do avatar (acima) */}
    </div>
  )
})

export {
  formatChatDayLabel,
  DAY_PILL_CLASS,
  DaySeparator,
  ChannelSeparator,
  ChannelLabel,
  DAY_LABEL_ATTR,
  DAY_SEP_ATTR,
  StickyDayPill,
  useStickyDayLabel,
} from "./message-bubble/day-separators"
export {
  ConnectionDivider,
  TicketDivider,
  ConversationClosedMarker,
} from "./message-bubble/dividers"
