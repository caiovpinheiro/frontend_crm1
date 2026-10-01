import { memo, useState, useRef, useEffect, useCallback, type TouchEvent } from "react"
import { cn } from "@/lib/utils"
import { MetaSendErrorBalloon } from "@/components/crm/meta-send-error-balloon"
import { AutomationBotIcon } from "@/components/icons/automation-bot-icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { StatusTicks } from "@/components/crm/status-ticks"
import { UserAvatar } from "@/components/crm/user-avatar"
import { avatarInitials } from "@/lib/avatar"
import { EventRow, NoteRow } from "@/components/crm/chat-timeline"
import type { Message, MessageBubbleProps } from "./message-bubble/types"
import {
  AUTOMATION_ACCENT,
  AUTOMATION_BG,
  AUTOMATION_TEXT,
  CAMPAIGN_ACCENT,
  MENU_LONG_PRESS_MS,
} from "./message-bubble/constants"
import { MessageButtons, QuotedPreview, ReactionBadge } from "./message-bubble/bubble-parts"
import { useDeliveryStale } from "./message-bubble/delivery-stale"
import { MessageContent, MetaReserve } from "./message-bubble/message-content"
import { MessageActionsMenu } from "./message-bubble/message-actions-menu"
import {
  detectMediaKind,
  isPlaceholderContent,
} from "./message-bubble/media-helpers"
import { templateBadgeInfo } from "./message-bubble/template-badge"

export { audioMp3Url, nextAudioSourceAfterError } from "./message-bubble/audio-player"
export { STALE_DELIVERY_MS, isDeliveryStale } from "./message-bubble/delivery-stale"
export { templateBadgeInfo } from "./message-bubble/template-badge"

export type { FormField, Message, MessageBubbleProps } from "./message-bubble/types"
import { PhoneIncoming, PhoneOff, PhoneOutgoing, ShoppingBag } from "lucide-react"

function formatOrderMoney(amount: number, currency: string): string {
  const code = currency?.trim() || "BRL"
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${code}`
  }
}

function CatalogOrderBubble({
  order,
  time,
  className,
}: {
  order: NonNullable<Message["catalogOrder"]>
  time: string
  className?: string
}) {
  const lineTotal = (price: number, qty: number) => price * qty
  return (
    <div className={cn("flex w-full justify-start", className)}>
      <div className="w-full max-w-[22rem] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <ShoppingBag className="size-4 text-primary" aria-hidden />
          <p className="text-sm font-semibold">Pedido do catálogo</p>
        </div>
        {order.text ? (
          <p className="px-3 pt-2 text-sm text-muted-foreground">{order.text}</p>
        ) : null}
        <ul className="flex flex-col gap-2 px-3 py-2">
          {order.items.map((item) => (
            <li key={`${item.productRetailerId}-${item.productId ?? "x"}`} className="flex min-w-0 items-center gap-2">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-[10px] text-muted-foreground">
                  {item.productId ? "SKU" : "?"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} × {formatOrderMoney(item.itemPrice, item.currency)}
                  {!item.productId ? ` · ${item.productRetailerId}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm tabular-nums">
                {formatOrderMoney(lineTotal(item.itemPrice, item.quantity), item.currency)}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm">
          <span className="text-muted-foreground">{time}</span>
          <span className="font-semibold tabular-nums">
            Total {formatOrderMoney(order.total, order.currency)}
          </span>
        </div>
      </div>
    </div>
  )
}

import {
  IconRobot,
  IconClipboardList,
  IconChevronDown,
  IconPinFilled,
  IconStarFilled,
  IconSpeakerphone,
  IconClockExclamation,
  IconRefresh,
} from "@tabler/icons-react"








function FormBubble({ message, className }: { message: Message; className?: string }) {
  const [open, setOpen] = useState(false)
  const fields = message.formFields!
  const count = fields.length

  return (
    <div className={cn("flex max-w-[72%] flex-col gap-1", className)}>
      <div
        className="overflow-hidden rounded-[var(--radius-lg)] rounded-bl border border-[var(--glass-border)] shadow-[0_2px_8px_rgba(100,130,180,0.08)]"
        style={{ background: "var(--chat-bubble-received-bg)" }}
      >
        {/* Cabeçalho clicável — sempre visível */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--brand-primary)]/[0.04]"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--brand-primary)]/10">
            <IconClipboardList size={13} className="text-[var(--brand-primary)]" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-[var(--brand-primary)]/70 leading-none mb-0.5">
              Formulário
            </p>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="truncate font-display text-[13px] font-bold leading-tight text-[var(--text-primary)]">
                {message.formTitle || "Resposta"}
              </p>
              {/* Contador de campos como pill preenchida (ref. V0) */}
              <span className="shrink-0 rounded-md bg-[var(--brand-primary)]/12 px-2 py-0.5 font-display text-[10.5px] font-semibold text-[var(--brand-primary)]">
                {count} {count === 1 ? "campo" : "campos"}
              </span>
              {/* Timestamp inline no estado recolhido — padrão WhatsApp */}
              {!open && (
                <span className="ml-auto shrink-0 font-body text-[10px] leading-none text-[var(--text-muted)]">
                  {message.time}
                </span>
              )}
            </div>
          </div>
          <IconChevronDown
            size={14}
            className={cn(
              "shrink-0 text-[var(--text-muted)] transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>

        {/* Campos — só visíveis quando aberto */}
        {open && (
          <div className="border-t border-[var(--glass-border)]/60">
            {fields.map((f, i) => {
              const isLast = i === fields.length - 1
              return (
                <div
                  key={i}
                  className={cn(
                    "px-3 py-1.5",
                    !isLast && "border-b border-[var(--glass-border)]/40",
                    isLast && "pb-2",
                  )}
                >
                  <p className="font-display text-[9.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)] leading-none mb-0.5">
                    {f.label}
                  </p>
                  {/* Último campo: spacer flutuante reserva só a largura do horário
                      (padrão WhatsApp) — sem padding-right fixo que abre um vão. */}
                  <div className="relative">
                    <p className="flow-root font-body text-[12.5px] leading-snug text-[var(--text-primary)]">
                      {f.value}
                      {isLast && (
                        <span
                          aria-hidden
                          className="invisible float-right ml-1.5 font-body text-[10px] leading-none"
                        >
                          {message.time}
                        </span>
                      )}
                    </p>
                    {isLast && (
                      <span className="pointer-events-none absolute bottom-0 right-0 select-none font-body text-[10px] leading-none text-[var(--text-muted)]">
                        {message.time}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}




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
  const callType = String(message.messageType ?? "").toLowerCase()
  const isVoiceCallEvent =
    (callType === "sip_call" && !message.mediaUrl) ||
    callType === "whatsapp_call" ||
    (callType === "whatsapp_call_recording" && !message.mediaUrl)
  if (isVoiceCallEvent) {
    const inbound = message.type === "incoming"
    const body = message.content ?? ""
    const missed = /n[ãa]o atendida|n[ãa]o completada|falhou/i.test(body)
    const ended = /\bfim\b|encerrada/i.test(body)
    const fallback =
      callType === "sip_call"
        ? inbound
          ? "Ligação recebida"
          : "Ligação realizada"
        : inbound
          ? "Chamada recebida pelo WhatsApp"
          : missed
            ? "Chamada WhatsApp não completada"
            : ended
              ? "Chamada WhatsApp encerrada"
              : "Chamada realizada pelo WhatsApp"
    const dirIcon = inbound ? PhoneIncoming : PhoneOutgoing
    return (
      <EventRow
        icon={missed ? PhoneOff : dirIcon}
        iconClassName={
          missed
            ? "text-[var(--color-danger)]"
            : ended
              ? "text-[var(--color-ink-soft)]"
              : "text-[var(--color-success)]"
        }
        text={fallback}
        actor=""
        time={message.time}
        className={className}
      />
    )
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
          message.isAutomationRun && message.automationAgentInitials ? (
            <div className="relative flex shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex h-9 w-9 cursor-default items-center justify-center rounded-full font-display text-[10px] font-bold text-white"
                    style={{ background: AUTOMATION_ACCENT }}
                  >
                    <IconRobot size={20} aria-label="Automação" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="font-medium text-[11px]">
                  Automação
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="absolute -bottom-1 -right-1 flex h-[21px] min-w-[21px] cursor-default items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] px-0.5 font-display text-[10px] font-bold leading-none text-white shadow-[0_1px_3px_rgba(15,20,40,0.28)]">
                    {message.automationAgentInitials}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="font-medium text-[11px]">
                  Disparada por {message.automationAgentName || "agente"}
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                {isBot ? (
                  <div
                    className="flex h-9 w-9 shrink-0 cursor-default items-center justify-center overflow-hidden rounded-full font-display text-[11px] font-bold text-white"
                    style={{
                      background: isCampaign ? CAMPAIGN_ACCENT : AUTOMATION_ACCENT,
                    }}
                  >
                    {isCampaign ? (
                      <IconSpeakerphone size={18} aria-label="Campanha" />
                    ) : (
                      <IconRobot size={19} aria-label="Automação" />
                    )}
                  </div>
                ) : (
                  <span className="inline-flex shrink-0">
                    <UserAvatar
                      name={senderName}
                      initials={
                        message.senderInitials ||
                        avatarInitials(senderName) ||
                        "?"
                      }
                      imageUrl={
                        message.senderImageUrl ||
                        (senderPhotoByName && senderName
                          ? senderPhotoByName.get(
                              senderName.trim().toLowerCase(),
                            ) ?? null
                          : null) ||
                        null
                      }
                      size={36}
                    />
                  </span>
                )}
              </TooltipTrigger>
              {senderName && (
                <TooltipContent side="left" className="font-medium text-[11px]">
                  {senderName}
                </TooltipContent>
              )}
            </Tooltip>
          )
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
          {/* Badge CAMPANHA — pill + nome da campanha (sem duplicar
              "Campanha: …" no pill genérico de bot). */}
          {isCampaign && (
            <div className="mb-1.5 flex flex-col gap-0.5">
              <span
                className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 font-display text-[9.5px] font-bold uppercase tracking-widest"
                style={{
                  background: "var(--chat-bubble-campaign-badge-bg)",
                  color: "var(--chat-bubble-campaign-badge-text)",
                }}
                title={senderName || "Campanha"}
              >
                <IconSpeakerphone size={11} />
                Campanha
              </span>
              {message.campaignName ? (
                <span className="font-display text-[11.5px] font-semibold leading-snug">
                  {message.campaignName}
                </span>
              ) : null}
            </div>
          )}
          {/* Badge AUTOMAÇÃO — pill escuro em cima do card claro tintado.
              Exibe o nome da automação (senderName) quando o backend envia;
              caso contrário cai no rótulo genérico "Automação". */}
          {isBot && !isCampaign && (
            <div className="mb-1.5 flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[9.5px] font-bold uppercase tracking-widest"
                style={{ background: "rgba(199,210,254,0.18)", color: "#e0e7ff" }}
                title={
                  message.isAutomationRun
                    ? "Automação disparada manualmente"
                    : senderName || "Automação"
                }
              >
                <AutomationBotIcon size={11} />
                {message.isAutomationRun ? "Manual" : senderName || "Automação"}
              </span>
            </div>
          )}
          {/* Badge TEMPLATE — identifica visualmente quando a mensagem
              foi enviada usando um template pré-aprovado da Meta. Pode
              coexistir com o badge AUTOMAÇÃO (automação disparando um
              template) ou aparecer sozinho (agente enviando template
              manualmente). Usa cor accent que contrasta com ambos os
              fundos (bolha azul regular e bolha automação tintada). */}
          {message.messageType === "template" && (() => {
            const tpl = templateBadgeInfo(message.templateMeta)
            const TplIcon = tpl.icon
            return (
              <div className={cn("mb-1.5 flex items-center gap-1.5", isBot && "-mt-0.5")}>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[9.5px] font-bold uppercase tracking-widest",
                    isOutgoing && !isBot
                      ? "bg-white/22 text-white ring-1 ring-inset ring-white/25"
                      : "bg-[color-mix(in_srgb,#0ea5e9_14%,white)] text-[#0369a1] ring-1 ring-inset ring-[color-mix(in_srgb,#0ea5e9_35%,transparent)]",
                  )}
                  title={tpl.title}
                  data-template-category={tpl.category ?? undefined}
                >
                  <TplIcon size={10} />
                  {tpl.label}
                </span>
              </div>
            )
          })()}
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
          <span
            className={cn(
              "pointer-events-none select-none items-center gap-0.5 whitespace-nowrap text-[10.5px] leading-none",
              hasButtons
                ? "mt-1.5 flex w-full justify-end"
                : "absolute bottom-2 right-3 inline-flex",
              timeOverMedia &&
                "rounded px-1 py-0.5 text-white shadow-[0_1px_2px_rgba(0,0,0,0.55)] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)] bg-black/35",
              !timeOverMedia && isOutgoing && isBot && !isCampaign && "text-white/70",
              !timeOverMedia && isOutgoing && isCampaign && "opacity-65",
              !timeOverMedia && !isOutgoing && "text-[var(--text-muted)]",
            )}
            style={
              !timeOverMedia && isOutgoing && !isBot && !isCampaign
                ? { color: "var(--chat-bubble-sent-time)" }
                : undefined
            }
          >
            {message.isFavorited && (
              <IconStarFilled size={10} className="text-amber-400" aria-label="Favoritada" />
            )}
            {message.time}
            {isOutgoing && message.status === "failed" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="pointer-events-auto inline-flex cursor-help">
                    <StatusTicks status="failed" onLightBg={false} />
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="end"
                  className="border-0 bg-transparent p-0 shadow-none"
                >
                  <MetaSendErrorBalloon sendError={message.sendError} />
                </TooltipContent>
              </Tooltip>
            ) : isOutgoing && deliveryStale ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="pointer-events-auto inline-flex cursor-help text-amber-300"
                    aria-label="Entrega não confirmada"
                    data-delivery-stale
                  >
                    <IconClockExclamation size={13} stroke={2.4} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="max-w-[240px] text-left leading-tight">
                  Entrega não confirmada após 5 min — o número pode estar
                  pausado, sinalizado ou com qualidade rebaixada na Meta.
                </TooltipContent>
              </Tooltip>
            ) : isOutgoing && message.status ? (
              <StatusTicks status={message.status} onLightBg={false} />
            ) : null}
          </span>
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
