import { cn } from "@/lib/utils"

interface InboundPreviewProps {
  /** Texto da última mensagem do cliente (ou a nossa, se `ours`). */
  text: string
  /** Não lidas — com > 0 o texto vai num balão suave + contador. */
  unread: number
  /** Mensagem acabou de chegar. Os cards ainda passam; a prévia não pulsa. */
  glow?: boolean
  /** Cliente ainda não escreveu: mostra a nossa última, apagada. */
  ours?: boolean
  className?: string
}

/**
 * Prévia dos cards (inbox, kanban e Flow) enquanto o cliente espera
 * resposta. Não lida = balão suave (fundo azul claro, texto escuro, até 2
 * linhas) com contador azul; lida = texto cinza sem balão; sem mensagem
 * do cliente = a nossa última em cinza itálico. Quem já respondeu não
 * monta este balão.
 */
export function InboundPreview({ text, unread, ours = false, className }: InboundPreviewProps) {
  if (ours) {
    return (
      <span className={cn("line-clamp-1 min-w-0 flex-1 italic text-[var(--text-muted)]", className)}>
        {text}
      </span>
    )
  }
  if (unread > 0) {
    return (
      <span className={cn("flex min-w-0 flex-1 items-end gap-1.5", className)}>
        <span className="bw-inbound-bubble line-clamp-2 min-w-0 break-words rounded-[12px_12px_12px_4px] px-2.5 py-1 not-italic leading-snug">
          {text}
        </span>
        <span
          className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#2F54EB] px-1 font-display text-[10px] font-bold leading-none text-white tabular-nums"
          aria-label={`${unread} mensagens não lidas`}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      </span>
    )
  }
  return (
    <span className={cn("flex min-w-0 flex-1", className)}>
      <span className="line-clamp-2 min-w-0 break-words not-italic leading-snug text-[var(--text-secondary)]">
        {text}
      </span>
    </span>
  )
}
