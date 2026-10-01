import { IconArrowBackUp } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { AUTOMATION_ACCENT } from "./constants"
import type { Message } from "./types"

/**
 * Botões de resposta rápida (interactive/template) — replicam o visual do
 * WhatsApp: cada opção é um card full-width com ícone de "responder" e o
 * rótulo centralizado, empilhados abaixo do corpo e separados por uma
 * divisória fina. Preview não-clicável no CRM (só reproduz o que o cliente
 * vê no WhatsApp), mas com feedback de hover para parecer interativo.
 * `onLightBg` = bolha clara (automação): botão branco com acento violeta;
 * caso contrário (bolha azul do agente): translúcido sobre o fundo.
 */
export function MessageButtons({ buttons, onLightBg }: { buttons: string[]; onLightBg: boolean }) {
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

/**
 * Cabeçalho de citação (reply) — aparece dentro da bolha, acima do
 * conteúdo. Renderiza barra vertical colorida à esquerda + trecho curto.
 * A cor da barra e do texto dependem do fundo da bolha para garantir
 * contraste em qualquer variação (azul, indigo, cinza claro).
 */
export function QuotedPreview({
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
export function ReactionBadge({
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
