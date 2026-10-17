import { IconArrowsExchange } from "@tabler/icons-react"
import { EventRow } from "@/components/crm/chat-timeline"
import { ChannelTypeIcon } from "@/components/inbox/channel-type-icon"
import { channelTypeLabel } from "@/lib/connection-label"
import { cn } from "@/lib/utils"

/** `"messenger"`/`"meta"` → tipo do enum (`FACEBOOK`/`WHATSAPP`) p/ ícone e rótulo. */
function channelStringToType(channel: string): string {
  const c = channel.trim().toLowerCase()
  if (c === "messenger" || c === "facebook") return "FACEBOOK"
  if (c === "meta") return "WHATSAPP"
  return c.toUpperCase()
}

/**
 * Selo do canal no início de cada bloco de mensagens do histórico unificado
 * (ex.: o lead falou no WhatsApp e depois no Webchat). Alinha com a bolha.
 */
export function MessageChannelSeal({
  channel,
  align,
}: {
  channel: string
  align: "in" | "out"
}) {
  const type = channelStringToType(channel)
  const label = channelTypeLabel(type)
  return (
    <span
      className={cn(
        "mb-0.5 mt-1 inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2 py-0.5 font-display text-[10.5px] font-semibold text-[var(--text-secondary)]",
        align === "out" ? "self-end" : "self-start",
      )}
      title={`Mensagens via ${label}`}
      data-testid="message-channel-seal"
    >
      <ChannelTypeIcon type={type} size={11} />
      {label === "Canal" ? channel : label}
    </span>
  )
}

interface ConnectionDividerProps {
  /** Rótulo completo da conexão (ex.: "WhatsApp · Vendas SP · +55 (11) 9..."). */
  label: string
}

/**
 * Marcador na timeline indicando que, a partir daqui, a conversa passou a
 * trafegar por OUTRA conexão (ex.: o contato escreveu para outro número de
 * WhatsApp da empresa). Inserido pelo chat quando o `channelId` da mensagem
 * muda em relação à anterior.
 */
export function ConnectionDivider({ label }: ConnectionDividerProps) {
  return (
    <div className="my-1 flex items-center justify-center gap-2 self-center">
      <span className="h-px w-6 bg-[var(--glass-border)]" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 py-1 font-display text-[10.5px] font-semibold text-[var(--text-secondary)]">
        <IconArrowsExchange size={12} className="text-[var(--brand-primary)]" />
        via {label}
      </span>
      <span className="h-px w-6 bg-[var(--glass-border)]" />
    </div>
  )
}

interface TicketDividerProps {
  /** Número sequencial do ticket (#N). */
  number: number
  /** ISO do encerramento — null para o ticket atual (em andamento). */
  closedAt: string | null
  /** Ticket em andamento (mais recente) — estilo ligeiramente diferente. */
  isCurrent?: boolean
  openedAt?: string | null
  openedByName?: string | null
  openedByUserId?: string | null
  closedByName?: string | null
  closedByUserId?: string | null
}

/**
 * Separador de ticket na linha do tempo contínua do contato.
 * Aparece no início de cada ticket quando `history=1` está ativo,
 * distinguindo ciclos de atendimento distintos sem esconder o histórico.
 */
function closedEventTime(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${dd}/${mm} ${hh}:${mi}`
}

export function TicketDivider({
  number,
  closedAt,
  isCurrent,
  openedAt,
  openedByName,
  openedByUserId,
  closedByName,
  closedByUserId,
}: TicketDividerProps) {
  if (isCurrent) {
    return (
      <EventRow
        action="entrada"
        text={`Conversa #${number} aberta`}
        actor={openedByName ?? ""}
        actorId={openedByUserId}
        time={closedEventTime(openedAt ?? null)}
      />
    )
  }
  return (
    <EventRow
      action="saida"
      text={`Conversa #${number} encerrada`}
      actor={closedByName ?? ""}
      actorId={closedByUserId}
      time={closedEventTime(closedAt)}
    />
  )
}

interface ConversationClosedMarkerProps {
  /** ISO da data de encerramento — quando ausente, mostra so "Conversa encerrada". */
  closedAt?: string | null
  conversationNumber?: number | null
  closedByName?: string | null
  closedByUserId?: string | null
}

/**
 * Marcador no fim da timeline indicando que a conversa foi encerrada.
 * Mesmo padrão visual de `EventRow` (linha de evento, sem pill).
 * Usado no inbox (via ChatArea) e no pipeline (via DealChatBinding).
 */
export function ConversationClosedMarker({
  closedAt,
  conversationNumber,
  closedByName,
  closedByUserId,
}: ConversationClosedMarkerProps) {
  const label =
    typeof conversationNumber === "number" && conversationNumber > 0
      ? `Conversa #${conversationNumber} encerrada`
      : "Conversa encerrada"
  return (
    <EventRow
      action="saida"
      text={label}
      actor={closedByName ?? ""}
      actorId={closedByUserId}
      time={closedEventTime(closedAt ?? null)}
    />
  )
}
