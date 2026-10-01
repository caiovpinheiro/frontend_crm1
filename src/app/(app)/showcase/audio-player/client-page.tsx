"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
  IconMicrophone,
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
} from "@tabler/icons-react"

// ─── Hook ────────────────────────────────────────────────────────────────────
const DEMO_SRC = null // substitua por uma URL real de áudio para testar

function useAudioPlayer(src: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!src) return
    const audio = new Audio(src)
    audioRef.current = audio
    audio.onloadedmetadata = () => setDuration(audio.duration || 0)
    audio.ontimeupdate = () => {
      setCurrent(audio.currentTime)
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
    }
    audio.onended = () => { setPlaying(false); setProgress(0); setCurrent(0) }
    return () => { audio.pause(); audio.src = "" }
  }, [src])

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play().catch(() => {}); setPlaying(true) }
  }, [playing])

  const seek = useCallback((ratio: number) => {
    const a = audioRef.current
    if (!a || !a.duration) return
    a.currentTime = ratio * a.duration
    setProgress(ratio)
  }, [])

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`

  return { playing, progress, duration, current, toggle, seek, fmt }
}

// ─── Waveform estática ────────────────────────────────────────────────────────
const BARS = [3,5,9,13,8,15,11,6,12,16,10,7,13,15,9,11,6,10,14,12,5,8,11,7]

// ══════════════════════════════════════════════════════════════════════════════
// VARIANTE A — Pill compacto: avatar mic + play + waveform clicável + tempo
// Inspiração: WhatsApp / Telegram PTT
// ══════════════════════════════════════════════════════════════════════════════
function AudioPlayerA({ isOutgoing }: { isOutgoing: boolean }) {
  const { playing, progress, toggle, seek, fmt } = useAudioPlayer(DEMO_SRC)
  const trackRef = useRef<HTMLDivElement>(null)

  // Simula progresso para demo sem áudio real
  const [demoProgress, setDemoProgress] = useState(0.38)
  const [demoTime] = useState(62) // 1:02

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = (e.clientX - rect.left) / rect.width
    setDemoProgress(Math.max(0, Math.min(1, ratio)))
    seek(ratio)
  }

  const p = DEMO_SRC ? progress : demoProgress

  return (
    <div
      className={cn(
        "flex w-[260px] items-center gap-2.5 rounded-[var(--radius-full)] px-3 py-2.5",
        isOutgoing
          ? "bg-[var(--brand-primary)]"
          : "border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]",
      )}
    >
      {/* Avatar mic */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isOutgoing ? "bg-white/20" : "bg-[var(--brand-primary)]/10",
        )}
      >
        <IconMicrophone
          size={15}
          className={isOutgoing ? "text-white" : "text-[var(--brand-primary)]"}
        />
      </div>

      {/* Play/Pause */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80",
          isOutgoing ? "bg-white text-[var(--brand-primary)]" : "bg-[var(--brand-primary)] text-white",
        )}
      >
        {playing
          ? <IconPlayerPauseFilled size={12} />
          : <IconPlayerPlayFilled  size={12} />}
      </button>

      {/* Waveform clicável */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        role="slider"
        aria-label="Progresso do áudio"
        aria-valuenow={Math.round(p * 100)}
        className="flex flex-1 cursor-pointer items-end gap-[2px]"
        style={{ height: 18 }}
      >
        {BARS.map((h, i) => {
          const ratio = i / BARS.length
          return (
            <span
              key={i}
              className={cn(
                "w-[2.5px] rounded-full transition-colors duration-100",
                ratio <= p
                  ? isOutgoing ? "bg-white"                    : "bg-[var(--brand-primary)]"
                  : isOutgoing ? "bg-white/30"                 : "bg-[var(--brand-primary)]/20",
              )}
              style={{ height: h }}
            />
          )
        })}
      </div>

      {/* Tempo */}
      <span
        className={cn(
          "shrink-0 font-display text-[10px] tabular-nums",
          isOutgoing ? "text-white/70" : "text-[var(--text-muted)]",
        )}
      >
        {fmt(demoTime)}
      </span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// VARIANTE B — Card glass: avatar redondo + waveform + tempo à direita
// Inspiração: iMessage / Slack audio
// ══════════════════════════════════════════════════════════════════════════════
function AudioPlayerB({ isOutgoing }: { isOutgoing: boolean }) {
  const { playing, progress, toggle, seek, fmt } = useAudioPlayer(DEMO_SRC)
  const trackRef = useRef<HTMLDivElement>(null)
  const [demoProgress, setDemoProgress] = useState(0.38)
  const [demoTime] = useState(62)

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = (e.clientX - rect.left) / rect.width
    setDemoProgress(Math.max(0, Math.min(1, ratio)))
    seek(ratio)
  }

  const p = DEMO_SRC ? progress : demoProgress

  return (
    <div
      className={cn(
        "flex w-[270px] items-center gap-3 rounded-[var(--radius-xl)] px-3.5 py-3",
        isOutgoing
          ? "bg-[var(--brand-primary)]"
          : "border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]",
      )}
    >
      {/* Botão play grande circular */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-opacity hover:opacity-85",
          isOutgoing
            ? "bg-white/20 text-white"
            : "bg-[var(--brand-primary)] text-white",
        )}
      >
        {playing
          ? <IconPlayerPauseFilled size={16} />
          : <IconPlayerPlayFilled  size={16} />}
      </button>

      {/* Coluna: waveform + linha de info */}
      <div className="flex flex-1 flex-col gap-1.5 min-w-0">
        {/* Waveform clicável */}
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          role="slider"
          aria-label="Progresso do áudio"
          aria-valuenow={Math.round(p * 100)}
          className="flex cursor-pointer items-end gap-[2px]"
          style={{ height: 22 }}
        >
          {BARS.map((h, i) => {
            const ratio = i / BARS.length
            return (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors duration-100",
                  ratio <= p
                    ? isOutgoing ? "bg-white"    : "bg-[var(--brand-primary)]"
                    : isOutgoing ? "bg-white/25" : "bg-[var(--brand-primary)]/18",
                )}
                style={{ height: Math.max(3, h * 1.1) }}
              />
            )
          })}
        </div>

        {/* Tempo + label mic */}
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "font-display text-[10px] tabular-nums",
              isOutgoing ? "text-white/65" : "text-[var(--text-muted)]",
            )}
          >
            {fmt(demoTime)}
          </span>
          <div className="flex items-center gap-1">
            <IconMicrophone
              size={10}
              className={isOutgoing ? "text-white/50" : "text-[var(--text-muted)]/60"}
            />
            <span
              className={cn(
                "font-display text-[9px] uppercase tracking-wider",
                isOutgoing ? "text-white/50" : "text-[var(--text-muted)]/60",
              )}
            >
              Áudio
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// VARIANTE C — Minimalista: sem container extra, play + barra fina + bolinha + tempo
// Inspiração: players minimalistas de podcast / Notion
// ══════════════════════════════════════════════════════════════════════════════
function AudioPlayerC({ isOutgoing }: { isOutgoing: boolean }) {
  const { playing, progress, toggle, seek, fmt } = useAudioPlayer(DEMO_SRC)
  const trackRef = useRef<HTMLDivElement>(null)
  const [demoProgress, setDemoProgress] = useState(0.38)
  const [demoTime] = useState(62)

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = (e.clientX - rect.left) / rect.width
    setDemoProgress(Math.max(0, Math.min(1, ratio)))
    seek(ratio)
  }

  const p = DEMO_SRC ? progress : demoProgress

  return (
    <div
      className={cn(
        "flex w-[240px] items-center gap-2.5 rounded-[var(--radius-lg)] px-3 py-2.5",
        isOutgoing
          ? "bg-[var(--brand-primary)]"
          : "border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]",
      )}
    >
      {/* Mic pequeno */}
      <IconMicrophone
        size={13}
        className={cn("shrink-0", isOutgoing ? "text-white/70" : "text-[var(--brand-primary)]")}
      />

      {/* Play/Pause */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        className={cn(
          "shrink-0 transition-opacity hover:opacity-75",
          isOutgoing ? "text-white" : "text-[var(--brand-primary)]",
        )}
      >
        {playing
          ? <IconPlayerPauseFilled size={18} />
          : <IconPlayerPlayFilled  size={18} />}
      </button>

      {/* Barra + bolinha de seek */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        role="slider"
        aria-label="Progresso do áudio"
        aria-valuenow={Math.round(p * 100)}
        className="relative flex flex-1 cursor-pointer items-center"
        style={{ height: 18 }}
      >
        {/* Trilho */}
        <div
          className={cn(
            "h-[2.5px] w-full rounded-full",
            isOutgoing ? "bg-white/25" : "bg-[var(--brand-primary)]/18",
          )}
        />
        {/* Preenchido */}
        <div
          className={cn(
            "absolute left-0 top-1/2 h-[2.5px] -translate-y-1/2 rounded-full",
            isOutgoing ? "bg-white/80" : "bg-[var(--brand-primary)]",
          )}
          style={{ width: `${p * 100}%` }}
        />
        {/* Bolinha */}
        <div
          className={cn(
            "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm",
            isOutgoing ? "bg-white" : "bg-[var(--brand-primary)]",
          )}
          style={{ left: `${p * 100}%` }}
        />
      </div>

      {/* Tempo */}
      <span
        className={cn(
          "shrink-0 font-display text-[10px] tabular-nums",
          isOutgoing ? "text-white/65" : "text-[var(--text-muted)]",
        )}
      >
        {fmt(demoTime)}
      </span>
    </div>
  )
}

// ─── Showcase page ────────────────────────────────────────────────────────────
export default function AudioPlayerShowcasePage() {
  const variants = [
    {
      id: "A",
      name: "Pill + Waveform",
      description: "Pill arredondado com avatar mic, botão play compacto e barras de waveform clicáveis. Fiel à referência WhatsApp/Telegram.",
    },
    {
      id: "B",
      name: "Card + Waveform tall",
      description: "Container maior com botão play circular proeminente, waveform com barras mais altas e label de áudio. Mais legível em conversas densas.",
    },
    {
      id: "C",
      name: "Minimalista linear",
      description: "Sem container extra — mic + play + barra fina com bolinha de seek + tempo. Ocupa menos espaço vertical, ideal para históricos longos.",
    },
  ] as const

  const players = {
    A: AudioPlayerA,
    B: AudioPlayerB,
    C: AudioPlayerC,
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-12 bg-[var(--color-bg-canvas)] px-6 py-16">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Audio Player — 3 Variantes
        </h1>
        <p className="max-w-sm font-body text-sm text-[var(--text-muted)]">
          Todas sem {"<audio controls>"} nativo. Escolha uma para usar em{" "}
          <code className="rounded bg-[var(--glass-bg-strong)] px-1 py-0.5 text-[11px]">
            AudioPlayerBubble
          </code>
          .
        </p>
      </div>

      <div className="flex flex-col gap-10 w-full max-w-2xl">
        {variants.map(({ id, name, description }) => {
          const Player = players[id]
          return (
            <div key={id} className="flex flex-col gap-4">
              {/* Header da variante */}
              <div className="flex items-baseline gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-primary)] font-display text-[11px] font-bold text-white">
                  {id}
                </span>
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  {name}
                </h2>
                <p className="ml-1 font-body text-sm text-[var(--text-muted)]">{description}</p>
              </div>

              {/* Preview: recebida + enviada */}
              <div className="flex flex-col gap-6 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] px-8 py-6 shadow-[var(--glass-shadow-sm)]">
                {/* Recebida (incoming) */}
                <div className="flex flex-col gap-1.5">
                  <span className="font-display text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Recebida
                  </span>
                  <div className="flex items-end gap-2">
                    <Player isOutgoing={false} />
                    <span className="mb-1 font-display text-[10px] text-[var(--text-muted)]">06:20</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-[var(--glass-border-subtle)]" />

                {/* Enviada (outgoing) */}
                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-display text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Enviada
                  </span>
                  <div className="flex items-end gap-2">
                    <span className="mb-1 font-display text-[10px] text-[var(--text-muted)]">06:20</span>
                    <Player isOutgoing={true} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="font-body text-xs text-[var(--text-muted)]">
        Para ativar uma variante em produção, edite{" "}
        <code className="rounded bg-[var(--glass-bg-strong)] px-1 py-0.5">
          AudioPlayerBubble
        </code>{" "}
        em{" "}
        <code className="rounded bg-[var(--glass-bg-strong)] px-1 py-0.5">
          src/components/crm/message-bubble.tsx
        </code>
      </p>
    </div>
  )
}
