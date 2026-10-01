import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import {
  IconArrowBackUp,
  IconCopy,
  IconMoodPlus,
  IconPin,
  IconPinFilled,
  IconShare2,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { EmojiPicker } from "@/components/inbox/emoji-picker"
import { QUICK_REACTIONS } from "./constants"
import type { Message } from "./types"

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
export function MessageActionsMenu({
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
