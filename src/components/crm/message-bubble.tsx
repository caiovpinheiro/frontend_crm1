import { memo, useState, useRef, useEffect, useCallback, useLayoutEffect, type ReactNode, type TouchEvent } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  isImmediateMediaSrc,
  LazyChatDocument,
  LazyChatImage,
  LazyChatVideo,
} from "@/components/crm/lazy-chat-media"
import { MetaSendErrorBalloon } from "@/components/crm/meta-send-error-balloon"
import { EmojiPicker } from "@/components/inbox/emoji-picker"
import { AudioWaveform } from "@/components/inbox/audio-waveform"
import { AutomationBotIcon } from "@/components/icons/automation-bot-icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { StatusTicks } from "@/components/crm/status-ticks"
import { UserAvatar } from "@/components/crm/user-avatar"
import { avatarInitials } from "@/lib/avatar"
import { apiUrl } from "@/lib/api"
import { EventRow, NoteRow } from "@/components/crm/chat-timeline"
import type { Message, MessageBubbleProps } from "./message-bubble/types"
import {
  AUTOMATION_ACCENT,
  AUTOMATION_BG,
  AUTOMATION_TEXT,
  CAMPAIGN_ACCENT,
  MENU_LONG_PRESS_MS,
  QUICK_REACTIONS,
} from "./message-bubble/constants"
import { useDeliveryStale } from "./message-bubble/delivery-stale"
import {
  detectMediaKind,
  documentLabel,
  formatWhatsapp,
  isPlaceholderContent,
  mediaFileLabel,
  resolveMediaUrl,
} from "./message-bubble/media-helpers"
import { templateBadgeInfo } from "./message-bubble/template-badge"

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
  IconFile,
  IconDownload,
  IconCopy,
  IconPlayerPlay,
  IconPlayerPause,
  IconLoader2,
  IconTextCaption,
  IconPin,
  IconPinFilled,
  IconArrowBackUp,
  IconShare2,
  IconMoodPlus,
  IconStar,
  IconStarFilled,
  IconSpeakerphone,
  IconPhone,
  IconClockExclamation,
  IconRefresh,
} from "@tabler/icons-react"


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
 * Botões de resposta rápida (interactive/template) — replicam o visual do
 * WhatsApp: cada opção é um card full-width com ícone de "responder" e o
 * rótulo centralizado, empilhados abaixo do corpo e separados por uma
 * divisória fina. Preview não-clicável no CRM (só reproduz o que o cliente
 * vê no WhatsApp), mas com feedback de hover para parecer interativo.
 * `onLightBg` = bolha clara (automação): botão branco com acento violeta;
 * caso contrário (bolha azul do agente): translúcido sobre o fundo.
 */
function MessageButtons({ buttons, onLightBg }: { buttons: string[]; onLightBg: boolean }) {
  const accent = onLightBg ? AUTOMATION_ACCENT : "#ffffff"
  const dividerStyle = onLightBg
    ? { background: `${AUTOMATION_ACCENT}24` }
    : { background: "rgba(255,255,255,0.22)" }
  const btnStyle = onLightBg
    ? {
        borderColor: `${AUTOMATION_ACCENT}2e`,
        background: "#ffffff",
        color: AUTOMATION_ACCENT,
      }
    : {
        borderColor: "rgba(255,255,255,0.32)",
        background: "rgba(255,255,255,0.14)",
        color: "#ffffff",
      }
  return (
    <div className="mt-2 -mx-1 flex flex-col gap-1">
      {/* Divisória fina separando o corpo da mensagem dos botões (ref. WhatsApp) */}
      <span className="mx-1 mb-1 h-px w-[calc(100%-0.5rem)]" style={dividerStyle} />
      {buttons.map((b, i) => (
        <span
          key={`${b}-${i}`}
          className={cn(
            "flex w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-center font-display text-[13px] font-semibold leading-snug shadow-[0_1px_2px_rgba(15,20,40,0.06)] transition-colors",
            onLightBg ? "hover:bg-[color-mix(in_srgb,var(--brand-primary)_6%,white)]" : "hover:bg-white/20",
          )}
          style={btnStyle}
          title={b}
        >
          <IconArrowBackUp size={14} stroke={2.1} className="shrink-0" style={{ color: accent, opacity: 0.85 }} />
          <span className="line-clamp-2 [overflow-wrap:anywhere]">{b}</span>
        </span>
      ))}
    </div>
  )
}

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
 * MP3 convertido pelo backend (`GET /api/media/audio-mp3?url=&name=`) —
 * formato universal: download que abre em qualquer player e fonte de
 * fallback quando o navegador não decodifica OGG/Opus (Safari/iOS).
 */
export function audioMp3Url(url: string, name: string): string {
  const params = new URLSearchParams({ url, name })
  return apiUrl(`/api/media/audio-mp3?${params.toString()}`)
}

/**
 * Fonte seguinte após `error` no <audio>: original → MP3 convertido; já
 * no MP3 (ou sem URL) → null, para não entrar em loop.
 */
export function nextAudioSourceAfterError(
  current: string | null,
  original: string | null,
): string | null {
  if (!original) return null
  const mp3 = audioMp3Url(original, "audio")
  return current === mp3 ? null : mp3
}

function audioExtensionFromUrl(url: string): string | null {
  const m = url.split("?")[0].match(/\.(ogg|oga|opus|webm|mp3|wav|m4a|aac|amr)$/i)
  return m ? m[1].toLowerCase() : null
}

/** Formata segundos em mm:ss */
function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

/**
 * Player de áudio minimalista — sem controles nativos do browser.
 * Botão play/pause + barra de progresso clicável + timer.
 */
/** Estados possíveis da transcrição. */
type TranscriptState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "error"; message: string }

function AudioPlayer({
  url,
  isOutgoing,
  variant = "voice",
}: {
  url: string | null
  isOutgoing: boolean
  variant?: "voice" | "call"
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptState>({ status: "idle" })
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const [rate, setRate] = useState(1)
  const [downloading, setDownloading] = useState(false)
  const [armed, setArmed] = useState(() => isImmediateMediaSrc(url))
  const pendingPlayRef = useRef(false)
  // Fonte efetiva do <audio>: começa na URL original; no primeiro erro de
  // decodificação (Safari/iOS × OGG/Opus) troca pelo MP3 do backend. O
  // fallback fica atado à URL que o gerou — URL nova volta ao original
  // sem effect.
  const [fallback, setFallback] = useState<{ forUrl: string | null; src: string } | null>(null)
  const src = fallback && fallback.forUrl === url ? fallback.src : url
  const handleAudioError = useCallback(() => {
    const next = nextAudioSourceAfterError(src, url)
    if (!next) return
    pendingPlayRef.current = playing
    setPlaying(false)
    setFallback({ forUrl: url, src: next })
  }, [src, url, playing])

  const SPEEDS = [0.5, 1, 1.5, 2] as const
  const cycleSpeed = useCallback(() => {
    setRate((prev) => {
      const idx = SPEEDS.indexOf(prev as (typeof SPEEDS)[number])
      const next = SPEEDS[(idx + 1) % SPEEDS.length]
      const el = audioRef.current
      if (el) el.playbackRate = next
      return next
    })
  }, [])

  // Reaplica a velocidade sempre que a fonte carrega (mantém a taxa ao tocar).
  useEffect(() => {
    const el = audioRef.current
    if (el) el.playbackRate = rate
  }, [rate])

  const toggle = useCallback(() => {
    if (!url) return
    if (!armed) {
      pendingPlayRef.current = true
      setArmed(true)
      return
    }
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      el.play().catch(() => {})
    }
  }, [playing, armed, url])

  useEffect(() => {
    if (!armed || !pendingPlayRef.current) return
    const el = audioRef.current
    if (!el) return
    pendingPlayRef.current = false
    el.load()
    el.play().catch(() => {})
  }, [armed, src])

  useEffect(() => {
    const el = audioRef.current
    if (!el || !armed) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => { setPlaying(false); setCurrent(0) }
    const onTimeUpdate = () => setCurrent(el.currentTime)

    // [jul/26] Correção do progresso/duração de áudios de voz.
    // Áudios gravados em streaming (WhatsApp Voice / MediaRecorder) chegam
    // em OGG/WebM sem o campo "Duration" no header, então o browser retorna
    // `el.duration === Infinity` no `loadedmetadata`. Isso zerava o cálculo
    // de progresso (`currentTime / Infinity = 0` → barra nunca andava) e
    // fazia a duração aparecer como "0:00".
    // Truque conhecido: forçar o seek pro fim (`currentTime` gigante) faz o
    // browser baixar o arquivo e calcular a duração real; no `timeupdate`
    // seguinte lemos o valor correto e resetamos `currentTime` pra 0.
    let durationFixed = false
    const applyDuration = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration)
        return true
      }
      return false
    }
    const onLoaded = () => {
      if (applyDuration()) return
      if (durationFixed) return
      durationFixed = true
      const onSeekTime = () => {
        el.removeEventListener("timeupdate", onSeekTime)
        el.currentTime = 0
        setCurrent(0)
      }
      el.addEventListener("timeupdate", onSeekTime)
      el.currentTime = 1e101
    }
    const onDurationChange = () => { applyDuration() }

    el.addEventListener("play", onPlay)
    el.addEventListener("pause", onPause)
    el.addEventListener("ended", onEnded)
    el.addEventListener("timeupdate", onTimeUpdate)
    el.addEventListener("loadedmetadata", onLoaded)
    el.addEventListener("durationchange", onDurationChange)
    // Metadata pode já ter carregado antes do effect (remount na mesma URL):
    // `loadedmetadata` não dispara de novo, então chamamos o handler à mão.
    if (el.readyState >= 1) onLoaded()

    return () => {
      el.removeEventListener("play", onPlay)
      el.removeEventListener("pause", onPause)
      el.removeEventListener("ended", onEnded)
      el.removeEventListener("timeupdate", onTimeUpdate)
      el.removeEventListener("loadedmetadata", onLoaded)
      el.removeEventListener("durationchange", onDurationChange)
    }
  }, [src, armed])

  const handleTranscribe = useCallback(async () => {
    if (!url || transcript.status === "loading") return
    setTranscript({ status: "loading" })
    let res: Response
    try {
      res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
    } catch {
      setTranscript({ status: "error", message: "Servidor indisponível." })
      return
    }
    let data: { transcript?: string; error?: string } = {}
    try {
      data = (await res.json()) as { transcript?: string; error?: string }
    } catch {
      setTranscript({ status: "error", message: `Erro HTTP ${res.status}.` })
      return
    }
    if (!res.ok || data.error) {
      setTranscript({ status: "error", message: data.error ?? `Erro ${res.status}.` })
    } else {
      setTranscript({ status: "done", text: data.transcript ?? "" })
    }
  }, [url, transcript.status])

  const timeColor = isOutgoing
    ? "text-[color:var(--chat-bubble-sent-time)]"
    : "text-[var(--text-muted)]"
  const transcriptBg = isOutgoing
    ? "border-current/15 bg-current/10"
    : "bg-[var(--brand-primary)]/5 text-[var(--text-secondary)] border-[var(--glass-border-subtle)]"
  const btnBase = isOutgoing
    ? "bg-current/10 hover:bg-current/15"
    : "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/20"

  const isCall = variant === "call"

  const downloadAudio = useCallback(async () => {
    if (!url || downloading) return
    setDownloading(true)
    try {
      const baseName = isCall ? "ligacao-whatsapp" : "audio-whatsapp"
      // MP3 universal (o backend converte OGG/Opus/WebM). Se a rota falhar,
      // baixa o arquivo original no formato em que está.
      let blob: Blob | null = null
      let ext = "mp3"
      try {
        const res = await fetch(audioMp3Url(url, baseName))
        const ctype = res.headers.get("content-type") ?? ""
        if (res.ok && !ctype.includes("application/json") && !ctype.includes("text/html")) {
          blob = await res.blob()
        }
      } catch {
        /* cai no original */
      }
      if (!blob) {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        blob = await res.blob()
        ext = audioExtensionFromUrl(url) ?? "ogg"
      }
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `${baseName}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch {
      toast.error("Não foi possível baixar o áudio.")
    } finally {
      setDownloading(false)
    }
  }, [url, downloading, isCall])

  return (
    <div
      className={cn(
        "flex w-[min(320px,74vw)] flex-col gap-1 py-0.5",
        transcript.status === "done" ? "pb-2" : "pb-1",
        isCall && "px-0.5",
      )}
    >
      {isCall ? (
        <p className={cn(
          "flex items-center gap-1 font-display text-[10px] font-semibold",
          isOutgoing ? "text-current/75" : "text-[var(--text-muted)]",
        )}>
          <IconPhone size={11} />
          Ligação WhatsApp
        </p>
      ) : null}
      <audio
        ref={audioRef}
        src={armed && src ? src : undefined}
        preload="none"
        aria-hidden="true"
        onError={handleAudioError}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!url}
          aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full shadow-sm transition-all active:scale-95",
            isCall
              ? isOutgoing
                ? "bg-white/18 hover:bg-white/25"
                : "bg-emerald-800 text-white hover:bg-emerald-900"
              : isOutgoing
                ? "bg-current/15 hover:bg-current/20"
                : "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-dark)]",
            !url && "cursor-not-allowed opacity-40",
          )}
        >
          {playing
            ? <IconPlayerPause size={14} fill="currentColor" />
            : <IconPlayerPlay size={14} className="translate-x-px" fill="currentColor" />
          }
        </button>

        <div className="min-w-0 flex-1">
          <AudioWaveform
            currentTime={current}
            duration={duration}
            outgoing={isOutgoing}
            disabled={!url || duration <= 0}
            onSeek={(nextTime) => {
              const el = audioRef.current
              if (!el) return
              el.currentTime = nextTime
              setCurrent(nextTime)
            }}
          />
          <div className={cn("-mt-px flex items-center justify-between text-[9px] leading-none tabular-nums", timeColor)}>
            <span>{fmtTime(current)}</span>
            <span>{duration > 0 ? fmtTime(duration) : "--:--"}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={cycleSpeed}
          disabled={!url}
          aria-label="Velocidade de reprodução"
          className={cn(
            "flex h-6 shrink-0 items-center justify-center rounded-full px-1.5 font-display text-[9px] font-bold tabular-nums transition-colors",
            isOutgoing
              ? "bg-current/10 hover:bg-current/15"
              : "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/20",
            !url && "cursor-not-allowed opacity-40",
          )}
        >
          {rate}x
        </button>
        {url ? (
          <button
            type="button"
            onClick={downloadAudio}
            disabled={downloading}
            aria-label="Baixar áudio"
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-60",
              isOutgoing
                ? "text-current/70 hover:bg-current/10"
                : "text-[var(--color-ink-muted)] hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)]",
            )}
          >
            {downloading ? (
              <IconLoader2 size={12} className="animate-spin" />
            ) : (
              <IconDownload size={12} />
            )}
          </button>
        ) : null}
      </div>

      {url && !isCall && transcript.status !== "done" && (
        <button
          type="button"
          disabled={transcript.status === "loading"}
          onClick={handleTranscribe}
          className={cn(
            "flex h-4 items-center gap-1 self-start rounded-full px-1.5 transition-colors",
            btnBase,
            transcript.status === "loading" && "cursor-wait",
          )}
        >
          {transcript.status === "loading"
            ? <IconLoader2 size={10} className="animate-spin" />
            : <IconTextCaption size={10} />
          }
          <span className="font-display text-[9px] font-semibold leading-none">
            {transcript.status === "loading" ? "Transcrevendo…" : "Transcrever"}
          </span>
        </button>
      )}

      {/* Resultado da transcrição — colapsável */}
      {transcript.status === "done" && transcript.text && (
        <div className={cn("rounded-md border px-2.5 py-1.5 text-[11px] leading-relaxed", transcriptBg)}>
          <p className={cn(
            "transition-all",
            transcriptExpanded ? "" : "line-clamp-2",
          )}>
            {transcript.text}
          </p>
          {transcript.text.length > 80 && (
            <button
              type="button"
              onClick={() => setTranscriptExpanded((v) => !v)}
              className={cn(
                "mt-0.5 font-display text-[9px] font-semibold opacity-60 hover:opacity-100",
                isOutgoing ? "text-current" : "text-[var(--brand-primary)]",
              )}
            >
              {transcriptExpanded ? "Ver menos" : "Ver mais"}
            </button>
          )}
        </div>
      )}
      {transcript.status === "done" && !transcript.text && (
        <p className={cn("text-[10px] italic", timeColor)}>
          Áudio sem fala detectada.
        </p>
      )}
      {transcript.status === "error" && (
        <p className={cn("text-[10px]", isOutgoing ? "text-[color:var(--chat-bubble-sent-time)]" : "text-[var(--color-danger)]")}>
          {transcript.message}
        </p>
      )}
    </div>
  )
}

/**
 * Reserva no fim do texto (padrão WhatsApp Web): float à direita com a
 * mesma largura do horário+ticks. O texto envolve o float; se a última
 * linha não cabe, o float desce e o overlay não cobre a mensagem.
 * `flow-root` no wrapper contém o float (sem o hack de leading-0, que
 * colapsava a linha extra e gerava overlap).
 */
function MetaReserve({
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
function MessageContent({
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
    return <LazyChatDocument url={url} fileName={documentLabel(content)} />
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

/**
 * Menu de contexto estilo WhatsApp — qualquer bolha não-nota (recebidas
 * E enviadas, como no ChatWindow legado).
 *
 * Layout: barra horizontal de reações rápidas (6 emojis) + lista vertical
 * de ações (Responder / Reagir / Encaminhar / Fixar / Favoritar / Copiar).
 * A carinha só aparece no mouse over da bolha (`group-hover`). Fica ao
 * lado (direita nas recebidas, esquerda nas enviadas), numa faixa de
 * hover que cobre o vão até o botão — senão o `group-hover` cai no
 * caminho do mouse e a carinha some. Menu aberto ou toque longo / clique
 * direito também mostram o gatilho.
 *
 * Renderização: `createPortal` no <body> com `position: fixed`, para
 * escapar de qualquer ancestral com `overflow: hidden` (o chat-area e a
 * lista de mensagens são scrollables e clipam popovers absolutamente
 * posicionados). O `useLayoutEffect` computa o rect do gatilho e aplica
 * auto-flip vertical (abre pra cima quando não cabe abaixo) e horizontal
 * (clampa à borda da viewport pra nunca cortar).
 *
 * Callbacks são opcionais. Sem handler, o item ainda aparece na UI para
 * manter o layout consistente entre todas as bolhas — só que fica como
 * stub "em breve". Copiar é sempre funcional (`navigator.clipboard`).
 */
function MessageActionsMenu({
  message,
  isOutgoing,
  open,
  onOpenChange,
  onReply,
  onForward,
  onReact,
  onPin,
  onFavorite,
}: {
  message: Message
  /** Enviada: gatilho à esquerda da bolha (o avatar ocupa a direita). */
  isOutgoing: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onReply?: (message: Message) => void
  onForward?: (message: Message) => void
  onReact?: (message: Message, emoji: string | null) => void
  onPin?: (message: Message) => void
  onFavorite?: (message: Message) => void
}) {
  const setOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      onOpenChange(typeof next === "function" ? next(open) : next)
    },
    [open, onOpenChange],
  )
  /** Expande o picker completo (ação "Reagir"), estilo WhatsApp. */
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Posicionamento responsivo: calcula o rect do chevron e escolhe se
  // abre pra baixo/cima + clampa horizontalmente pra não vazar viewport.
  // Duas passadas — a 1ª antes do content medir, a 2ª (rAF) já com a
  // dimensão real. Reposiciona em resize/scroll pra acompanhar o layout.
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      setEmojiPickerOpen(false)
      return
    }
    const trigger = triggerRef.current
    if (!trigger) return

    const update = () => {
      const r = trigger.getBoundingClientRect()
      const content = contentRef.current
      const ch = content?.offsetHeight ?? (emojiPickerOpen ? 420 : 280)
      const cw = content?.offsetWidth ?? (emojiPickerOpen ? 288 : 240)
      const margin = 6

      const spaceBelow = window.innerHeight - r.bottom
      const spaceAbove = r.top
      const openUp = spaceBelow < ch + margin && spaceAbove > spaceBelow
      const top = openUp
        ? Math.max(8, r.top - ch - margin)
        : r.bottom + margin

      // Ancora à direita do chevron por padrão, mas clampa se estourar.
      const desiredLeft = r.right - cw
      const maxLeft = window.innerWidth - cw - 8
      const left = Math.min(Math.max(8, desiredLeft), Math.max(8, maxLeft))

      setCoords({ top, left })
    }
    update()
    const raf = requestAnimationFrame(update)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open, emojiPickerOpen])

  // Click fora / Esc fecham. O contentRef está no portal (fora do DOM
  // do trigger), então checamos os dois.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (contentRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const canCopy = !!(message.content && message.content.trim())

  const handleCopy = useCallback(async () => {
    if (!canCopy) return
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* navegador antigo / sem HTTPS: silencioso */
    }
    setOpen(false)
  }, [canCopy, message.content])

  const handleReact = useCallback(
    (emoji: string) => {
      onReact?.(message, emoji)
      setEmojiPickerOpen(false)
      setOpen(false)
    },
    [message, onReact],
  )

  // Fallback comum para itens ainda não plugados. Sinaliza ao usuário
  // que o botão foi reconhecido mas a ação ainda não está disponível,
  // em vez de parecer bugado. Toast substituí quando o container
  // implementar o handler correspondente.
  const stub = useCallback((label: string) => {
    toast.info(`${label} — em breve`, {
      description: "Essa ação ainda não foi ativada nesta versão.",
      duration: 2200,
    })
    setOpen(false)
  }, [])

  return (
    <>
      {/* Ponte de hover: o botão fica fora da bolha (`left-full` nas
          recebidas, `right-full` nas enviadas). Sem esta faixa a margem
          não recebe eventos, o `group-hover` cai e o `pointer-events-none`
          esconde a carinha no caminho do mouse. */}
      <div
        className={cn(
          "absolute top-0 z-10 flex h-full min-h-8 w-10 items-start pt-1",
          isOutgoing ? "right-full justify-end" : "left-full",
        )}
        data-message-actions-side={isOutgoing ? "left" : "right"}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          aria-label="Reagir à mensagem"
          title="Reagir"
          aria-expanded={open}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border border-black/5 shadow-[0_2px_6px_rgba(15,20,40,0.22)] transition-opacity",
            isOutgoing ? "mr-1" : "ml-1",
            open
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100",
          )}
          style={{ background: "#ffffff", color: "#334155" }}
        >
          <IconMoodPlus size={16} stroke={2.1} />
        </button>
      </div>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={contentRef}
              role="menu"
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                background: "#ffffff",
                color: "#0f172a",
              }}
              className={cn(
                "z-[100] max-w-[calc(100vw-16px)] overflow-hidden rounded-[var(--radius-lg)] border border-black/5 shadow-[0_12px_32px_rgba(15,20,40,0.22)]",
                emojiPickerOpen ? "w-[288px]" : "w-[224px]",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Barra de reações rápidas — sempre visível. Se onReact
                  não estiver plugado, ainda mostramos, mas emoji clica
                  no stub (fecha menu) até o container implementar. */}
              <div
                className="flex items-center gap-0.5 border-b px-1.5 py-1"
                style={{ borderColor: "#e2e8f0", background: "#f8fafc" }}
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleReact(emoji)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-white"
                    aria-label={`Reagir com ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {emojiPickerOpen ? (
                <div className="max-h-[320px] overflow-y-auto p-1.5">
                  <EmojiPicker
                    open
                    onPick={handleReact}
                    className="border-0 shadow-none"
                  />
                </div>
              ) : null}

              <ul className={cn("py-1", emojiPickerOpen && "hidden")}>
                <MenuItem
                  icon={<IconArrowBackUp size={15} />}
                  label="Responder"
                  onClick={() => {
                    if (onReply) {
                      onReply(message)
                      setOpen(false)
                    } else {
                      stub("Responder")
                    }
                  }}
                />
                <MenuItem
                  icon={<IconMoodPlus size={15} />}
                  label="Reagir"
                  onClick={() => {
                    if (onReact) {
                      // Abre o picker completo (não envia reação vazia).
                      setEmojiPickerOpen(true)
                    } else {
                      stub("Reagir")
                    }
                  }}
                />
                {/* "Encaminhar" só aparece com handler (o ChatArea provê
                    o ForwardDialog quando conhece a conversa). */}
                {onForward ? (
                  <MenuItem
                    icon={<IconShare2 size={15} />}
                    label="Encaminhar"
                    onClick={() => {
                      onForward(message)
                      setOpen(false)
                    }}
                  />
                ) : null}
                <MenuItem
                  icon={
                    message.isPinnedMessage ? (
                      <IconPinFilled size={15} className="text-[var(--brand-primary)]" />
                    ) : (
                      <IconPin size={15} />
                    )
                  }
                  label={message.isPinnedMessage ? "Desafixar" : "Fixar"}
                  onClick={() => {
                    if (onPin) {
                      onPin(message)
                      setOpen(false)
                    } else {
                      stub("Fixar")
                    }
                  }}
                />
                <MenuItem
                  icon={
                    message.isFavorited ? (
                      <IconStarFilled size={15} className="text-amber-500" />
                    ) : (
                      <IconStar size={15} />
                    )
                  }
                  label={message.isFavorited ? "Desfavoritar" : "Favoritar"}
                  onClick={() => {
                    if (onFavorite) {
                      onFavorite(message)
                      setOpen(false)
                    } else {
                      stub("Favoritar")
                    }
                  }}
                />
                {canCopy && (
                  <MenuItem
                    icon={<IconCopy size={15} />}
                    label={copied ? "Copiado!" : "Copiar"}
                    onClick={handleCopy}
                  />
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        role="menuitem"
        // Cores hardcoded: em v2-dark, --text-primary flipa pra claro
        // e o item fica branco-sobre-branco (invisivel). Popover sempre
        // fundo branco + texto slate-900 pra manter contraste.
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-body text-[13px] transition-colors hover:bg-slate-50"
        style={{ color: "#0f172a" }}
      >
        <span
          className="flex h-5 w-5 items-center justify-center"
          style={{ color: "#475569" }}
        >
          {icon}
        </span>
        {label}
      </button>
    </li>
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

/**
 * Cabeçalho de citação (reply) — aparece dentro da bolha, acima do
 * conteúdo. Renderiza barra vertical colorida à esquerda + trecho curto.
 * A cor da barra e do texto dependem do fundo da bolha para garantir
 * contraste em qualquer variação (azul, indigo, cinza claro).
 */
function QuotedPreview({
  snippet,
  direction,
  senderName,
  onLightBg,
  messageId,
  onJump,
}: {
  snippet: string
  direction: "in" | "out"
  senderName: string | null
  onLightBg: boolean
  messageId?: string | null
  onJump?: (messageId: string) => void
}) {
  const label = senderName || (direction === "out" ? "Você" : "Cliente")
  // Cores hardcoded p/ atravessar dark/light sem depender de --text-*.
  const bg = onLightBg ? "#f1f5f9" : "rgba(255,255,255,0.14)"
  const border = onLightBg ? "#5b6ff5" : "#ffffff"
  const labelColor = onLightBg ? "#4338ca" : "#e0e7ff"
  const textColor = onLightBg ? "#334155" : "rgba(255,255,255,0.88)"
  const canJump = Boolean(messageId && onJump)
  return (
    <div
      role={canJump ? "button" : undefined}
      tabIndex={canJump ? 0 : undefined}
      aria-label={canJump ? "Ir para a mensagem citada" : undefined}
      onClick={
        canJump
          ? (e) => {
              e.stopPropagation()
              onJump!(messageId!)
            }
          : undefined
      }
      onKeyDown={
        canJump
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                e.stopPropagation()
                onJump!(messageId!)
              }
            }
          : undefined
      }
      className={cn(
        "mb-1.5 overflow-hidden rounded-md pl-2",
        canJump && "cursor-pointer transition-opacity hover:opacity-90",
      )}
      style={{ background: bg, borderLeft: `3px solid ${border}` }}
    >
      <div className="px-2 py-1">
        <div
          className="font-display text-[10.5px] font-bold leading-none"
          style={{ color: labelColor }}
        >
          {label}
        </div>
        <div
          className="mt-0.5 line-clamp-2 font-body text-[11.5px] leading-snug"
          style={{ color: textColor }}
        >
          {snippet}
        </div>
      </div>
    </div>
  )
}

/**
 * Badge circular com o(s) emoji(s) de reação, ancorado no canto inferior
 * da bolha. WhatsApp Web mostra até 2 emojis distintos + "+N" se houver
 * mais tipos. Sempre fundo branco com sombra para destacar sobre a bolha.
 */
function ReactionBadge({
  reactions,
  anchor,
  onClick,
}: {
  reactions: NonNullable<Message["reactions"]>
  anchor: "left" | "right"
  onClick?: () => void
}) {
  // Agrupa por emoji (contagem). WhatsApp 1:1 quase sempre entrega
  // apenas uma reação por bolha; a agregação é defensiva para grupos
  // futuros ou histórico duplicado.
  const groups = new Map<string, number>()
  for (const r of reactions) {
    groups.set(r.emoji, (groups.get(r.emoji) ?? 0) + 1)
  }
  const entries = Array.from(groups.entries())
  const total = reactions.length
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                e.stopPropagation()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        // top-full -mt-1: pílula na frente da borda, ~4px sobre o card —
        // abaixo do horário (bottom-2) pra não cobrir time/ticks.
        "absolute top-full z-20 -mt-1 flex items-center gap-0.5 overflow-visible rounded-full border border-black/5 bg-white px-1.5 py-0.5 shadow-[0_2px_6px_rgba(15,20,40,0.18)]",
        onClick ? "pointer-events-auto cursor-pointer" : "pointer-events-none",
        anchor === "left" ? "left-1" : "right-1",
      )}
      title={reactions.map((r) => r.emoji).join(" ")}
    >
      {entries.slice(0, 2).map(([emoji]) => (
        <span key={emoji} className="text-[13px] leading-none">
          {emoji}
        </span>
      ))}
      {total > 1 && (
        <span className="ml-0.5 font-display text-[10px] font-semibold text-slate-600">
          {total}
        </span>
      )}
    </div>
  )
}


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
