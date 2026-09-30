import { cn } from "@/lib/utils"

interface InboundPreviewProps {
  /** Texto da última mensagem do cliente (ou a nossa, se `ours`). */
  text: string
  /** Não lidas — com > 0 o balão fica no gradiente + bolinha com o número. */
  unread: number
  /** Mensagem acabou de chegar: o balão pulsa alguns segundos. */
  glow?: boolean
  /** Cliente ainda não escreveu: mostra a nossa última, apagada. */
  ours?: boolean
  className?: string
}

/**
 * Prévia dos cards (inbox, kanban e Flow): só a última mensagem do
 * cliente. Não lida = balão no gradiente Bwipo com contador vermelho e
 * brilho na chegada; lida = balão neutro; sem mensagem do cliente = a
 * nossa última em cinza itálico, só como contexto.
 */
export function InboundPreview({ text, unread, glow = false, ours = false, className }: InboundPreviewProps) {
  if (ours) {
    return (
      <span className={cn("line-clamp-1 min-w-0 flex-1 italic text-[var(--text-muted)]", className)}>
        {text}
      </span>
    )
  }
  if (unread > 0) {
    return (
      <span className={cn("flex min-w-0 flex-1 items-center gap-1.5", className)}>
        <span
          className={cn(
            "bw-inbound-bubble min-w-0 truncate rounded-[12px_12px_12px_3px] px-2.5 py-[3px] font-semibold not-italic",
            glow && "bw-inbound-glow",
          )}
        >
          {text}
        </span>
        <span
          className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#E24B4A] px-1 font-display text-[10px] font-bold leading-none text-white tabular-nums"
          aria-label={`${unread} mensagens não lidas`}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      </span>
    )
  }
  return (
    <span className={cn("flex min-w-0 flex-1", className)}>
      <span className="min-w-0 truncate rounded-[12px_12px_12px_3px] bg-[var(--glass-bg-overlay)] px-2.5 py-[3px] not-italic text-[var(--text-secondary)]">
        {text}
      </span>
    </span>
  )
}
