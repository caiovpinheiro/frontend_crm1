import type { ReactNode } from "react"
import { IconDownload, IconFile, IconPlayerPlay, IconStarFilled } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import {
  LazyChatDocument,
  LazyChatImage,
  LazyChatVideo,
} from "@/components/crm/lazy-chat-media"
import { StatusTicks } from "@/components/crm/status-ticks"
import { AudioPlayer } from "./audio-player"
import {
  detectMediaKind,
  documentLabel,
  formatWhatsapp,
  isPlaceholderContent,
  mediaFileLabel,
  resolveMediaUrl,
} from "./media-helpers"
import type { Message } from "./types"

/** Card compacto no lugar de preview preto/quebrado (vídeo/imagem). */
function MediaFallback({
  kind,
  isOutgoing,
  label,
  href,
}: {
  kind: "image" | "video" | "document"
  isOutgoing: boolean
  label: string
  href?: string | null
}) {
  const Icon = kind === "video" ? IconPlayerPlay : IconFile
  const body = (
    <>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
          isOutgoing ? "bg-[var(--glass-bg-subtle)]" : "bg-[var(--brand-primary)]/10",
        )}
      >
        <Icon
          size={18}
          className={cn(
            kind === "video" && "translate-x-px",
            isOutgoing ? "text-white" : "text-[var(--brand-primary)]",
          )}
        />
      </div>
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-body text-[12.5px] font-medium",
          isOutgoing ? "text-white" : "text-[var(--text-primary)]",
        )}
      >
        {label}
      </span>
      {href ? (
        <IconDownload
          size={15}
          className={cn("shrink-0", isOutgoing ? "text-white/70" : "text-[var(--text-muted)]")}
        />
      ) : null}
    </>
  )
  const cls = cn(
    "flex min-w-[200px] max-w-[280px] items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2",
    isOutgoing ? "bg-[var(--glass-bg-subtle)]" : "bg-[var(--glass-bg-strong)]",
  )
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(cls, "transition-colors", isOutgoing ? "hover:bg-[var(--glass-bg)]" : "hover:bg-[var(--glass-bg-overlay)]")}
      >
        {body}
      </a>
    )
  }
  return <div className={cls}>{body}</div>
}

/**
 * Reserva no fim do texto (padrão WhatsApp Web): float à direita com a
 * mesma largura do horário+ticks. O texto envolve o float; se a última
 * linha não cabe, o float desce e o overlay não cobre a mensagem.
 * `flow-root` no wrapper contém o float (sem o hack de leading-0, que
 * colapsava a linha extra e gerava overlap).
 */
export function MetaReserve({
  time,
  isOutgoing,
  status,
  isFavorited,
}: {
  time: string
  isOutgoing: boolean
  status?: Message["status"]
  isFavorited?: boolean
}) {
  return (
    <span
      aria-hidden
      className="invisible float-right ml-2 inline-flex h-[15px] items-center gap-0.5 whitespace-nowrap text-[10.5px] leading-none"
    >
      {isFavorited && <IconStarFilled size={10} />}
      {time}
      {isOutgoing && status ? <StatusTicks status={status} onLightBg={false} /> : null}
    </span>
  )
}

function TextWithMeta({
  children,
  metaReserve,
  className,
}: {
  children: ReactNode
  metaReserve?: ReactNode
  className?: string
}) {
  return (
    <span className={cn("block flow-root break-words [overflow-wrap:anywhere]", className)}>
      {/* `data-message-text`: escopo varrido pela busca na conversa
          (`conversation-search.tsx`) — só o texto, sem hora/meta. */}
      <span data-message-text className="whitespace-pre-wrap leading-[1.45]">{children}</span>
      {metaReserve}
    </span>
  )
}

/** Renderiza o corpo da bolha: player de mídia quando houver, senão texto. */
export function MessageContent({
  message,
  isOutgoing,
  metaReserve,
}: {
  message: Message
  isOutgoing: boolean
  metaReserve?: ReactNode
}) {
  const kind = detectMediaKind(message.messageType, message.mediaUrl)
  const url = resolveMediaUrl(message.mediaUrl)
  const content = message.content ?? ""
  // Legenda só aparece se for texto real (não o placeholder "[video]" etc.).
  const caption = isPlaceholderContent(content) ? "" : content

  // ── Áudio / voz / PTT ──────────────────────────────────────────
  if (kind === "audio") {
    const isCallRec =
      String(message.messageType ?? "").toLowerCase() === "whatsapp_call_recording"
    return (
      <AudioPlayer
        url={url}
        isOutgoing={isOutgoing}
        variant={isCallRec ? "call" : "voice"}
      />
    )
  }

  // ── Imagem / sticker ───────────────────────────────────────────
  if (kind === "image" && url) {
    return (
      <LazyChatImage
        url={url}
        fileName={mediaFileLabel(content, "Imagem")}
        caption={
          caption ? (
            <CaptionText caption={caption} isOutgoing={isOutgoing} metaReserve={metaReserve} />
          ) : undefined
        }
      />
    )
  }

  // ── Vídeo ──────────────────────────────────────────────────────
  if (kind === "video" && url) {
    return (
      <LazyChatVideo
        url={url}
        fileName={mediaFileLabel(content, "Vídeo")}
        caption={
          caption ? (
            <CaptionText caption={caption} isOutgoing={isOutgoing} metaReserve={metaReserve} />
          ) : undefined
        }
      />
    )
  }

  // ── Documento ──────────────────────────────────────────────────
  if (kind === "document" && url) {
    const lines = content.split("\n")
    const fileLine = lines.find((line) => line.trim().startsWith("📎"))
    const lead = fileLine
      ? lines.filter((line) => line !== fileLine).join("\n").trim()
      : ""
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        {lead ? (
          <span className="whitespace-pre-wrap break-words">{formatWhatsapp(lead)}</span>
        ) : null}
        <LazyChatDocument url={url} fileName={documentLabel(fileLine ?? content)} />
      </div>
    )
  }

  // ── Mídia sem URL (download falhou) — placeholder amigável ──────
  // Áudio sem URL já cai no AudioPlayer acima (`url` é nullable), então
  // `kind` aqui é só image | video | document.
  if (kind && !url) {
    const labels = {
      image: "Imagem indisponível",
      video: "Vídeo indisponível",
      document: "Documento indisponível",
    } as const
    return (
      <MediaFallback
        kind={kind}
        isOutgoing={isOutgoing}
        label={mediaFileLabel(content, labels[kind])}
      />
    )
  }

  // ── Unsupported (Meta Cloud API) ───────────────────────────────
  // Webhook type=unsupported: conteúdo nunca chega. Mensagens antigas
  // ficaram com "[unsupported]"; as novas já vêm com rótulo em PT.
  const unsupportedText =
    message.messageType === "unsupported" || /^\s*\[unsupported\]\s*$/i.test(content)
      ? content.replace(/^\s*\[unsupported\]\s*$/i, "Tipo de mensagem não suportado pela API da Meta")
      : null
  if (unsupportedText) {
    return (
      <TextWithMeta
        metaReserve={metaReserve}
        className={cn("italic", isOutgoing ? "text-white/80" : "text-[var(--text-muted)]")}
      >
        {unsupportedText}
      </TextWithMeta>
    )
  }

  // ── Texto ──────────────────────────────────────────────────────
  return (
    <TextWithMeta metaReserve={metaReserve}>
      {formatWhatsapp(content)}
    </TextWithMeta>
  )
}

/** Legenda exibida abaixo de imagem/vídeo, com espaço reservado pro timestamp. */
function CaptionText({
  caption,
  isOutgoing,
  metaReserve,
}: {
  caption: string
  isOutgoing: boolean
  metaReserve?: ReactNode
}) {
  return (
    <TextWithMeta
      metaReserve={metaReserve}
      className={cn(
        "text-[13px]",
        !isOutgoing && "text-[var(--chat-bubble-received-text)]",
      )}
    >
      {formatWhatsapp(caption)}
    </TextWithMeta>
  )
}
