import type { ReactNode } from "react"
import { resolveChatMediaUrl } from "@/lib/chat-media-url"

export type MediaKind = "image" | "audio" | "video" | "document" | null

/** Normaliza a URL de mídia para o host da API (mesmo critério do `fetch`). */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  return resolveChatMediaUrl(url)
}

/** Deriva o tipo de mídia a partir do messageType e, como fallback, da extensão da URL. */
export function detectMediaKind(messageType: string | undefined, mediaUrl: string | null | undefined): MediaKind {
  const mt = String(messageType ?? "").toLowerCase()
  if ((mt === "whatsapp_call_recording" || mt === "sip_call") && mediaUrl) return "audio"
  if (mt === "image" || mt === "sticker") return "image"
  if (mt === "audio" || mt === "ptt" || mt === "voice") return "audio"
  if (mt === "video") return "video"
  if (mt === "document") return "document"
  const u = mediaUrl ?? ""
  if (/\.(jpg|jpeg|png|gif|webp)($|\?)/i.test(u)) return "image"
  if (/\.(webm|ogg|mp3|wav|m4a|aac|amr|opus)($|\?)/i.test(u)) return "audio"
  if (/\.(mp4|mov|avi|3gp)($|\?)/i.test(u)) return "video"
  if (mediaUrl) return "document"
  return null
}

/**
 * Renderiza a formatação inline do WhatsApp em nós React:
 *   *negrito*  _itálico_  ~tachado~  `monoespaçado`
 * Usado para que a assinatura do agente (`*Nome*:`) e qualquer mensagem
 * formatada apareçam como o cliente vê no WhatsApp — sem asteriscos crus.
 */
export function formatWhatsapp(text: string): ReactNode {
  if (!text) return text
  const tokenRe = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    const inner = tok.slice(1, -1)
    switch (tok[0]) {
      case "*":
        parts.push(<strong key={key++} className="font-semibold">{inner}</strong>)
        break
      case "_":
        parts.push(<em key={key++}>{inner}</em>)
        break
      case "~":
        parts.push(<s key={key++}>{inner}</s>)
        break
      default:
        parts.push(
          <code key={key++} className="rounded bg-black/10 px-1 font-mono text-[0.92em]">
            {inner}
          </code>,
        )
    }
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : text
}

/** Texto-placeholder do backend (ex.: "[video]", "[image] 👁") não deve virar legenda. */
export function isPlaceholderContent(content: string): boolean {
  const c = content.trim()
  if (!c) return true
  return /^\[[^\]]+\]\s*(👁)?$/.test(c)
}

/** Nome do arquivo para documentos: tira o prefixo "📎" e o sufixo view-once. */
export function documentLabel(content: string): string {
  const c = content
    .replace(/^📎\s*/, "")
    .replace(/\s*👁\s*$/, "")
    .trim()
  return c || "Documento"
}

export function mediaFileLabel(content: string, fallback: string): string {
  if (content && !isPlaceholderContent(content)) {
    const named = documentLabel(content)
    if (named && named !== "Documento") return named
  }
  return fallback
}
