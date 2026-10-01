import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  IconDownload,
  IconLoader2,
  IconPhone,
  IconPlayerPause,
  IconPlayerPlay,
  IconTextCaption,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { apiUrl } from "@/lib/api"
import { isImmediateMediaSrc } from "@/components/crm/lazy-chat-media"
import { AudioWaveform } from "@/components/inbox/audio-waveform"

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

export function AudioPlayer({
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
