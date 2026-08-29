import { useState, useRef, useEffect, useCallback, useLayoutEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ImageLightbox } from "@/components/crm/image-lightbox"
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
import { EventRow, NoteRow, type ConversationEventAction } from "@/components/crm/chat-timeline"
import { PhoneIncoming, PhoneOff, PhoneOutgoing } from "lucide-react"
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
  IconArrowsExchange,
  IconArrowBackUp,
  IconShare2,
  IconMoodPlus,
  IconStar,
  IconStarFilled,
  IconSpeakerphone,
  IconPhone,
} from "@tabler/icons-react"

type MediaKind = "image" | "audio" | "video" | "document" | null

/** Domínios da Meta/WhatsApp cujas URLs expiram — passam pelo proxy do backend. */
const META_MEDIA_DOMAINS = [
  "lookaside.fbsbx.com",
  "scontent.whatsapp.net",
  "graph.facebook.com",
]

/**
 * Normaliza a URL de mídia para um path servível pelo frontend.
 * URLs internas (/uploads, /api) passam direto; URLs da CDN da Meta
 * (que expiram) são roteadas pelo proxy autenticado do backend.
 */
function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith("blob:") || url.startsWith("data:")) return url
  if (url.startsWith("/uploads/") || url.startsWith("/api/")) return url
  try {
    const p = new URL(url, window.location.origin)
    if (p.pathname.startsWith("/uploads/")) return `${p.pathname}${p.search}`
    if (p.pathname.startsWith("/api/")) return `${p.pathname}${p.search}`
    if (META_MEDIA_DOMAINS.some((d) => p.hostname.endsWith(d))) {
      return `/api/media/proxy?url=${encodeURIComponent(url)}`
    }
  } catch {
    /* URL relativa malformada — cai no fallback abaixo */
  }
  if (url.includes("/uploads/")) return url.slice(url.indexOf("/uploads/"))
  return url
}

/** Deriva o tipo de mídia a partir do messageType e, como fallback, da extensão da URL. */
function detectMediaKind(messageType: string | undefined, mediaUrl: string | null | undefined): MediaKind {
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
function formatWhatsapp(text: string): ReactNode {
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
function isPlaceholderContent(content: string): boolean {
  const c = content.trim()
  if (!c) return true
  return /^\[[^\]]+\]\s*(👁)?$/.test(c)
}

/** Nome do arquivo para documentos: tira o prefixo "📎" e o sufixo view-once. */
function documentLabel(content: string): string {
  const c = content
    .replace(/^📎\s*/, "")
    .replace(/\s*👁\s*$/, "")
    .trim()
  return c || "Documento"
}

export interface FormField {
  label: string
  value: string
}

export interface Message {
  id: string
  content: string
  time: string
  /** ISO da data de criação — usado para agrupar mensagens por dia. */
  createdAt?: string
  type: "incoming" | "outgoing"
  senderInitials?: string
  /** Foto de perfil do agente remetente (resolvida no backend). */
  senderImageUrl?: string | null
  /** Nome completo do agente ou automação que enviou a mensagem. */
  senderName?: string
  /** User.id do agente no EVENT — fallback quando senderName é "Agente". */
  senderUserId?: string | null
  /** Mensagem enviada por bot/automação — exibe badge "AUTOMAÇÃO" */
  isBot?: boolean
  /**
   * Mensagem de campanha (TEMPLATE/TEXT). Bolha teal + pill "Campanha" e
   * `campaignName` no topo. Mantém `isBot` para caminho de avatar/bot.
   */
  isCampaign?: boolean
  /** Nome da campanha (sem o prefixo "Campanha:"). */
  campaignName?: string
  /**
   * Confirmação de automação disparada MANUALMENTE pela conversa. Renderiza
   * o cartão de automação com badge "Manual" e o avatar (iniciais) do agente
   * que acionou sobreposto ao robô — estilo colaboração.
   */
  isAutomationRun?: boolean
  /** Nome do agente que disparou a automação manual (tooltip do avatar colab). */
  automationAgentName?: string
  /** Iniciais do agente que disparou — chip sobre o robô. */
  automationAgentInitials?: string
  /** Campos parseados de resposta de formulário Meta Flow */
  formFields?: FormField[]
  /** Título do formulário (ex: "form_estag") */
  formTitle?: string
  /**
   * Botões de resposta rápida enviados numa mensagem interativa/template
   * (WhatsApp). Renderizados como cards empilhados abaixo do corpo —
   * separados do texto pelo adapter (marcador `[Botões: ...]` do backend).
   */
  buttons?: string[]
  /** Tipo de mídia: "audio", "image", "document", "video", "text" etc. */
  messageType?: string
  /**
   * Discriminante da timeline do chat: mensagem, nota humana ou evento
   * automático (sistema/IA). Quando ausente, `isNote` continua valendo.
   */
  kind?: "message" | "note" | "event"
  /**
   * Ação do evento (ícone). Só relevante quando `kind === "event"`.
   */
  eventAction?: ConversationEventAction
  /**
   * Nota interna — não enviada ao cliente. Quando true, a bolha é
   * renderizada com estilo diferenciado (fundo amarelo, borda lateral,
   * badge "Nota"). Independe de `type` (sempre tratada como outgoing).
   */
  isNote?: boolean
  /** URL da mídia para áudio, imagem, documento */
  mediaUrl?: string | null
  /**
   * Status de entrega (apenas mensagens outgoing) — exibe ticks estilo
   * WhatsApp: enviando (relógio), enviada (✓), entregue (✓✓ cinza),
   * lida (✓✓ azul), falha (alerta vermelho).
   */
  status?: "pending" | "sent" | "delivered" | "read" | "failed"
  /**
   * Texto do erro de envio (traduzido do Meta quando disponível). Exibido
   * em tooltip ao passar o mouse sobre o ícone de falha (status `failed`).
   */
  sendError?: string
  /**
   * Conexão (Channel) por onde esta mensagem trafegou. Usado para inserir um
   * marcador na timeline quando a conversa alterna de conexão (ex.: dois
   * WhatsApps). `null`/undefined = herda a conexão anterior (sem marcador).
   */
  channelId?: string | null
  /**
   * Citação (reply): quando o cliente responde uma mensagem específica,
   * mostramos o snippet da mensagem citada no topo da bolha. `snippet` é
   * um preview curto (~120 chars); `direction` orienta a cor da barra
   * lateral (verde p/ nossa mensagem, cinza p/ mensagem do cliente).
   */
  replyTo?: {
    snippet: string
    direction?: "in" | "out"
    senderName?: string | null
  } | null
  /**
   * Reações do cliente nesta mensagem (WhatsApp permite uma reação por
   * pessoa, mas persistimos como array para suportar múltiplos reatores
   * em grupos futuramente). Renderiza como badge flutuante na base.
   */
  reactions?: Array<{ emoji: string; from: string; at?: string }>
  /**
   * Favoritada pelo agente LOGADO (marcador pessoal — outros agentes não
   * veem essa marcação). Alimenta a estrela preenchida no menu e o label
   * dinâmico "Favoritar"/"Desfavoritar".
   */
  isFavorited?: boolean
  /**
   * Mensagem atualmente fixada no topo da conversa (banner estilo
   * WhatsApp). Vem de `Conversation.pinnedMessageId` — diferente de
   * `isPinned` (usado só para notas na aba "Notas").
   */
  isPinnedMessage?: boolean
  /**
   * Metadados de separador de ticket (messageType === "ticket-separator").
   * Presente apenas nos itens sintéticos injetados pelo backend quando
   * `?history=1` para marcar o início de cada ticket na linha do tempo.
   */
  ticketInfo?: {
    number: number
    closedAt: string | null
    isCurrent?: boolean
    openedAt?: string | null
    openedByName?: string | null
    openedByUserId?: string | null
    closedByName?: string | null
    closedByUserId?: string | null
  }
}


export interface MessageBubbleProps {
  message: Message
  /** Iniciais do agente logado — exibidas no avatar das mensagens outgoing. */
  agentInitials?: string
  /** Nome do agente logado — usado para detectar "mensagem minha" por NOME
   *  (robusto: independe de iniciais, que divergem entre funções). */
  agentName?: string | null
  /** Foto do agente logado (User.avatarUrl). Sobrepõe as iniciais no token
   *  outgoing quando a bolha representa o próprio agente. */
  agentImageUrl?: string | null
  /** Mapa fresco `nome (lowercase) → avatarUrl` (GET /api/users). Fallback
   *  confiável quando `senderImageUrl` (match server-side) vem nulo ou a
   *  sessão está com a foto defasada — garante paridade com o avatar do
   *  kanban (que lê `avatarUrl` fresco por usuário). */
  senderPhotoByName?: Map<string, string | null> | null
  className?: string
  /** Esta nota está fixada na conversa? Exibe indicador âmbar. */
  isPinned?: boolean
  /** Callback para fixar (messageId) ou desafixar (null). */
  onPinNote?: (messageId: string | null) => void
  /** Callback para adicionar conteúdo da nota ao log/timeline do deal. */
  onAddToLog?: (content: string) => void

  // ── Ações de mensagem recebida (menu estilo WhatsApp) ────────────
  // Todos opcionais: se não passados, o item some do menu. "Copiar" é
  // interno (usa navigator.clipboard) e sempre aparece p/ mensagens
  // com conteúdo textual — não depende de callback.
  /** Ao clicar em "Responder": abre citação da mensagem no composer. */
  onReplyMessage?: (message: Message) => void
  /** Ao clicar em "Encaminhar": abre modal de seleção de conversa. */
  onForwardMessage?: (message: Message) => void
  /** Ao clicar em uma reação rápida (👍/❤️/…) ou "Reagir". */
  onReactMessage?: (message: Message, emoji: string | null) => void
  /** Ao clicar em "Fixar": fixa a mensagem no topo da conversa. */
  onPinMessage?: (message: Message) => void
  /** Ao clicar em "Favoritar": adiciona à lista de favoritas do agente. */
  onFavoriteMessage?: (message: Message) => void
}

/** Emojis exibidos na barra rápida de reações — padrão WhatsApp. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const

/**
 * Paleta da bolha de AUTOMAÇÃO: cinza escuro com texto claro. Hardcoded —
 * invariante ao data-chat-theme e ao modo dark/light, garantindo contraste
 * do texto, dos badges e dos ticks (inclusive o azul de "lida") em qualquer
 * tema. `ACCENT` (violeta) segue como cor do avatar do robô.
 */
const AUTOMATION_BG = "#374151"
const AUTOMATION_TEXT = "#f3f4f6"
const AUTOMATION_ACCENT = "#6c5ce7"
/** Accent do avatar de campanha (teal) — distinto do violeta de automação. */
const CAMPAIGN_ACCENT = "#0d9488"

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
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      el.play().catch(() => {})
    }
  }, [playing])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
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
  }, [url])

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
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = "ligacao-whatsapp"
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch {
      toast.error("Não foi possível baixar o áudio.")
    } finally {
      setDownloading(false)
    }
  }, [url, downloading])

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
      {url && <audio ref={audioRef} src={url} preload="none" aria-hidden="true" />}

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
      <span className="whitespace-pre-wrap leading-[1.45]">{children}</span>
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
      <ImageMedia
        url={url}
        caption={caption}
        isOutgoing={isOutgoing}
        metaReserve={metaReserve}
      />
    )
  }

  // ── Vídeo ──────────────────────────────────────────────────────
  if (kind === "video" && url) {
    return (
      <div className="flex flex-col gap-1.5">
        <video
          controls
          preload="none"
          src={url}
          className="max-h-[320px] w-full min-w-[220px] rounded-[var(--radius-md)] bg-black"
        />
        {caption && (
          <CaptionText caption={caption} isOutgoing={isOutgoing} metaReserve={metaReserve} />
        )}
      </div>
    )
  }

  // ── Documento ──────────────────────────────────────────────────
  if (kind === "document" && url) {
    const label = documentLabel(content)
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        download
        className={cn(
          "flex min-w-[200px] max-w-[280px] items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 transition-colors",
          isOutgoing ? "bg-[var(--glass-bg-subtle)] hover:bg-[var(--glass-bg)]" : "bg-[var(--glass-bg-strong)] hover:bg-[var(--glass-bg-overlay)]",
        )}
      >
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
          isOutgoing ? "bg-[var(--glass-bg-subtle)]" : "bg-[var(--brand-primary)]/10",
        )}>
          <IconFile size={18} className={isOutgoing ? "text-white" : "text-[var(--brand-primary)]"} />
        </div>
        <span className={cn(
          "min-w-0 flex-1 truncate font-body text-[12.5px] font-medium",
          isOutgoing ? "text-white" : "text-[var(--text-primary)]",
        )}>
          {label}
        </span>
        <IconDownload size={15} className={cn("shrink-0", isOutgoing ? "text-white/70" : "text-[var(--text-muted)]")} />
      </a>
    )
  }

  // ── Mídia sem URL (download falhou) — placeholder amigável ──────
  if (kind && !url) {
    const labels: Record<string, string> = {
      image: "Imagem indisponível",
      video: "Vídeo indisponível",
      document: "Documento indisponível",
    }
    return (
      <span className={cn(
        "font-body text-[12px] italic",
        isOutgoing ? "text-white/70" : "text-[var(--text-muted)]",
      )}>
        {labels[kind] ?? "Mídia indisponível"}
      </span>
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

/**
 * Renderiza imagem do chat com clique-para-abrir-lightbox (em vez de abrir
 * em nova aba do navegador — tira o operador do CRM).
 */
function ImageMedia({
  url,
  caption,
  isOutgoing,
  metaReserve,
}: {
  url: string
  caption: string
  isOutgoing: boolean
  metaReserve?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group block cursor-zoom-in overflow-hidden rounded-[var(--radius-md)] text-left"
          aria-label="Ampliar imagem"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={caption || "Imagem recebida"}
            className="max-h-[320px] w-auto max-w-full rounded-[var(--radius-md)] object-cover transition-opacity group-hover:opacity-[0.97]"
            loading="lazy"
          />
        </button>
        {caption && (
          <CaptionText caption={caption} isOutgoing={isOutgoing} metaReserve={metaReserve} />
        )}
      </div>
      <ImageLightbox src={url} alt={caption} open={open} onOpenChange={setOpen} />
    </>
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
 * Menu de contexto estilo WhatsApp para mensagens RECEBIDAS.
 *
 * Layout: barra horizontal de reações rápidas (6 emojis) + lista vertical
 * de ações (Responder / Reagir / Encaminhar / Fixar / Favoritar / Copiar).
 * Aparece via chevron no canto sup. direito da bolha (hover).
 *
 * Renderização: `createPortal` no <body> com `position: fixed`, para
 * escapar de qualquer ancestral com `overflow: hidden` (o chat-area e a
 * lista de mensagens são scrollables e clipam popovers absolutamente
 * posicionados). O `useLayoutEffect` computa o rect do chevron e aplica
 * auto-flip vertical (abre pra cima quando não cabe abaixo) e horizontal
 * (clampa à borda da viewport pra nunca cortar).
 *
 * Callbacks são opcionais. Sem handler, o item ainda aparece na UI para
 * manter o layout consistente entre todas as bolhas — só que fica como
 * stub "em breve". Copiar é sempre funcional (`navigator.clipboard`).
 */
function ReceivedMessageMenu({
  message,
  onReply,
  onForward,
  onReact,
  onPin,
  onFavorite,
}: {
  message: Message
  onReply?: (message: Message) => void
  onForward?: (message: Message) => void
  onReact?: (message: Message, emoji: string | null) => void
  onPin?: (message: Message) => void
  onFavorite?: (message: Message) => void
}) {
  const [open, setOpen] = useState(false)
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
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label="Ações da mensagem"
        aria-expanded={open}
        className={cn(
          "absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/5 shadow-[0_2px_6px_rgba(15,20,40,0.22)] transition-opacity",
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        style={{ background: "#ffffff", color: "#334155" }}
      >
        <IconChevronDown size={14} stroke={2.2} />
      </button>

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
                {/* "Encaminhar" removido do menu — o fluxo ainda nao tem
                    modal de selecao de conversa alvo (feature pendente
                    da lista original). Voltar aqui quando `onForward`
                    tiver UI real; a prop e o handler seguem intactos
                    no componente pra minimizar o diff quando reativar. */}
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

export function MessageBubble({
  message,
  agentInitials,
  agentName,
  agentImageUrl,
  senderPhotoByName,
  className,
  isPinned,
  onPinNote,
  onAddToLog,
  onReplyMessage,
  onForwardMessage,
  onReactMessage,
  onPinMessage,
  onFavoriteMessage,
}: MessageBubbleProps) {
  const isOutgoing = message.type === "outgoing"
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

  // Menu WhatsApp-like só entra nas RECEBIDAS. Nas outgoing/notas/forms
  // o layout já é usado por outras ações (avatar, badges, ações de nota).
  const hasReceivedMenu =
    !isOutgoing &&
    !isNote &&
    !hasForm &&
    message.messageType !== "sip_call" &&
    message.messageType !== "whatsapp_call" &&
    message.messageType !== "whatsapp_call_recording" &&
    // Sempre monta em mensagens recebidas de texto/mídia. Mesmo sem
    // callbacks plugados, o menu ainda oferece "Copiar" e mostra os
    // demais itens como stubs — melhor UX que sumir o chevron todo.
    !!(message.content && message.content.trim() || message.mediaUrl)

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

  return (
    <div
      className={cn(
        "flex w-fit max-w-[75%] flex-col gap-0.5 overflow-visible",
        isOutgoing ? "ml-auto items-end" : "items-start",
        hasReactions && "relative z-[2] mb-3",
        className,
      )}
    >
      <div className={cn("group flex max-w-full items-end gap-2.5 overflow-visible", isOutgoing && "flex-row-reverse")}>
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
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 cursor-default items-center justify-center overflow-hidden rounded-full font-display text-[11px] font-bold text-white",
                    !isBot && "bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)]",
                  )}
                  style={
                    isBot
                      ? { background: isCampaign ? CAMPAIGN_ACCENT : AUTOMATION_ACCENT }
                      : undefined
                  }
                >
                  {(() => {
                    // Prioridade: foto do remetente resolvida no backend
                    // (`senderImageUrl`, por agente) → foto do usuário logado
                    // quando a mensagem é dele (iniciais batem ou sem autoria).
                    // "É minha mensagem?" — detecta por NOME (robusto) ou por
                    // iniciais/ausência de autoria. O match por nome corrige o
                    // caso das iniciais divergirem entre funções (ex.: "Marcelo
                    // Pinha Dev" → getInitials "MP" ≠ avatarInitials "MD").
                    const norm = (s?: string | null) =>
                      (s ?? "").trim().toLowerCase()
                    const isSelf =
                      !message.senderInitials ||
                      message.senderInitials === agentInitials ||
                      (!!agentName &&
                        !!message.senderName &&
                        norm(message.senderName) === norm(agentName))
                    const selfPhoto = isSelf ? agentImageUrl : null
                    // Foto fresca por nome (mesma fonte do avatar do kanban):
                    // cobre casos em que o match server-side (`senderImageUrl`)
                    // falha ou a sessão está com a foto defasada.
                    const byName =
                      senderPhotoByName && message.senderName
                        ? senderPhotoByName.get(
                            message.senderName.trim().toLowerCase(),
                          ) ?? null
                        : null
                    const photo = message.senderImageUrl || byName || selfPhoto
                    if (isBot) {
                      return isCampaign ? (
                        <IconSpeakerphone size={18} aria-label="Campanha" />
                      ) : (
                        <IconRobot size={19} aria-label="Automação" />
                      )
                    }
                    if (photo) {
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo}
                          alt={agentInitials ?? "Você"}
                          className="size-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      )
                    }
                    return message.senderInitials || agentInitials || "?"
                  })()}
                </div>
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
          {message.messageType === "template" && (
            <div className={cn("mb-1.5 flex items-center gap-1.5", isBot && "-mt-0.5")}>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[9.5px] font-bold uppercase tracking-widest",
                  isOutgoing && !isBot
                    ? "bg-white/22 text-white ring-1 ring-inset ring-white/25"
                    : "bg-[color-mix(in_srgb,#0ea5e9_14%,white)] text-[#0369a1] ring-1 ring-inset ring-[color-mix(in_srgb,#0ea5e9_35%,transparent)]",
                )}
                title="Mensagem enviada usando um template aprovado da Meta"
              >
                <IconFile size={10} />
                Template
              </span>
            </div>
          )}
          {/* Menu WhatsApp-like nas mensagens recebidas: chevron que
              expande com reações rápidas + Responder/Encaminhar/Copiar/Reagir.
              Só monta quando há pelo menos uma ação (senão o hover fica vazio). */}
          {hasReceivedMenu && (
            <ReceivedMessageMenu
              message={message}
              onReply={onReplyMessage}
              onForward={onForwardMessage}
              onReact={onReactMessage}
              onPin={onPinMessage}
              onFavorite={onFavoriteMessage}
            />
          )}
          {/* Citação: cliente respondeu uma mensagem específica.
              Barra vertical + trecho curto, estilo WhatsApp. */}
          {message.replyTo?.snippet && (
            <QuotedPreview
              snippet={message.replyTo.snippet}
              direction={message.replyTo.direction ?? "out"}
              senderName={message.replyTo.senderName ?? null}
              onLightBg={!isOutgoing}
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
            />
          )}
        </div>
      </div>

      {/* Nome do remetente apenas no tooltip do avatar (acima) */}
    </div>
  )
}

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
}: {
  snippet: string
  direction: "in" | "out"
  senderName: string | null
  onLightBg: boolean
}) {
  const label = senderName || (direction === "out" ? "Você" : "Cliente")
  // Cores hardcoded p/ atravessar dark/light sem depender de --text-*.
  const bg = onLightBg ? "#f1f5f9" : "rgba(255,255,255,0.14)"
  const border = onLightBg ? "#5b6ff5" : "#ffffff"
  const labelColor = onLightBg ? "#4338ca" : "#e0e7ff"
  const textColor = onLightBg ? "#334155" : "rgba(255,255,255,0.88)"
  return (
    <div
      className="mb-1.5 overflow-hidden rounded-md pl-2"
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
}: {
  reactions: NonNullable<Message["reactions"]>
  anchor: "left" | "right"
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
      className={cn(
        // top-full -mt-1: pílula na frente da borda, ~4px sobre o card —
        // abaixo do horário (bottom-2) pra não cobrir time/ticks.
        "pointer-events-none absolute top-full z-20 -mt-1 flex items-center gap-0.5 overflow-visible rounded-full border border-black/5 bg-white px-1.5 py-0.5 shadow-[0_2px_6px_rgba(15,20,40,0.18)]",
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

interface DaySeparatorProps {
  date: string
  /** Gruda no topo do container rolável até o próximo dia empurrar (WhatsApp). */
  sticky?: boolean
}

/** Rótulo de dia no chat: Hoje, Ontem, weekday (últimos 7 dias) ou dd/mm/aaaa. */
export function formatChatDayLabel(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((start(new Date()) - start(d)) / 86_400_000)
  if (diffDays === 0) return "Hoje"
  if (diffDays === 1) return "Ontem"
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString("pt-BR", { weekday: "long" })
  }
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export function DaySeparator({ date, sticky = false }: DaySeparatorProps) {
  return (
    <div
      className={cn(
        "flex justify-center py-2",
        sticky && "sticky top-1 z-10",
      )}
    >
      <span className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--dropdown-solid-bg)]/95 px-3 py-0.5 font-display text-[11px] font-semibold capitalize text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
        {date}
      </span>
    </div>
  )
}

/** Atributo nas linhas da timeline p/ o pill sticky rastrear o dia visível. */
export const DAY_LABEL_ATTR = "data-day-label"

const PILL_IDLE_MS = 2200
const PILL_ARM_MS = 450

/**
 * Pill fixo no topo da lista rolável (estilo WhatsApp). `h-0` para não
 * empurrar as bolhas; o texto atualiza via `useStickyDayLabel`.
 * Só aparece enquanto o usuário rola; some com fade após idle.
 */
export function StickyDayPill({
  date,
  loading = false,
  paused = false,
}: {
  date: string | null
  /** Mesmo slot da data — evita overlap com "Carregando histórico...". */
  loading?: boolean
  /** Pin inicial / troca de conversa — não mostra a pill (evita "Hoje" duplicado). */
  paused?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [scrolling, setScrolling] = useState(false)
  const lastDateRef = useRef<string | null>(null)
  if (date) lastDateRef.current = date
  const shown = date ?? lastDateRef.current

  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    let scrollRoot: HTMLElement | null = node.parentElement
    while (scrollRoot) {
      const oy = getComputedStyle(scrollRoot).overflowY
      if (oy === "auto" || oy === "scroll") break
      scrollRoot = scrollRoot.parentElement
    }
    if (!scrollRoot) return

    let idleTimer = 0
    let armed = false
    const armTimer = window.setTimeout(() => {
      armed = true
    }, PILL_ARM_MS)

    const onScroll = () => {
      if (!armed) return
      setScrolling(true)
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => setScrolling(false), PILL_IDLE_MS)
    }

    scrollRoot.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.clearTimeout(armTimer)
      window.clearTimeout(idleTimer)
      scrollRoot.removeEventListener("scroll", onScroll)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="pointer-events-none sticky top-0 z-[15] h-0 min-h-0 w-full shrink-0 overflow-visible"
      aria-hidden
    >
      {loading || shown ? (
        <div
          className={cn(
            "flex justify-center transition-opacity duration-300 ease-out",
            !paused && (loading || scrolling) ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--dropdown-solid-bg)]/92 px-2.5 py-0.5 font-display text-[10px] font-semibold text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
            {loading ? (
              <>
                <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
                Carregando histórico...
              </>
            ) : (
              shown
            )}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function resolveStickyRoot(
  root: { current: HTMLElement | null } | (() => HTMLElement | null),
): HTMLElement | null {
  return typeof root === "function" ? root() : root.current
}

/** Dia da primeira mensagem visível no container rolável. */
export function useStickyDayLabel(
  root: { current: HTMLElement | null } | (() => HTMLElement | null),
  resetKey: unknown,
): string | null {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let observer: IntersectionObserver | null = null
    let scrollRoot: HTMLElement | null = null
    let retryId = 0
    let rafId = 0
    let attempts = 0
    let onScroll: (() => void) | null = null

    const pickLabel = (items: NodeListOf<HTMLElement>) => {
      if (!scrollRoot || items.length === 0) return null
      const top = scrollRoot.getBoundingClientRect().top + 2
      for (const el of items) {
        if (el.getBoundingClientRect().bottom > top) {
          return el.getAttribute(DAY_LABEL_ATTR)
        }
      }
      return items[items.length - 1]?.getAttribute(DAY_LABEL_ATTR) ?? null
    }

    const bind = () => {
      if (cancelled) return
      scrollRoot = resolveStickyRoot(root)
      if (!scrollRoot) {
        if (attempts++ < 16) retryId = requestAnimationFrame(bind)
        return
      }
      const items = scrollRoot.querySelectorAll<HTMLElement>(`[${DAY_LABEL_ATTR}]`)
      if (items.length === 0) {
        setLabel(null)
        return
      }

      const apply = () => {
        if (rafId) return
        rafId = requestAnimationFrame(() => {
          rafId = 0
          const next = pickLabel(items)
          if (next) setLabel(next)
        })
      }
      onScroll = apply

      observer = new IntersectionObserver(apply, {
        root: scrollRoot,
        threshold: [0, 0.01],
      })
      items.forEach((el) => observer!.observe(el))
      scrollRoot.addEventListener("scroll", apply, { passive: true })
      // Depois do auto-scroll ao fim (deal usa 2 rAFs).
      requestAnimationFrame(() => requestAnimationFrame(apply))
    }

    bind()

    return () => {
      cancelled = true
      if (retryId) cancelAnimationFrame(retryId)
      if (rafId) cancelAnimationFrame(rafId)
      observer?.disconnect()
      if (scrollRoot && onScroll) {
        scrollRoot.removeEventListener("scroll", onScroll)
      }
    }
  }, [root, resetKey])

  return label
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
