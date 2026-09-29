"use client"

/**
 * Busca dentro da conversa — compartilhada pelo inbox (`ChatArea`), pelo
 * Flow (`SalesHubChat` → `ChatArea`) e pelo painel do negócio no Kanban
 * (`DealDetailPanel` + `messagesSlot`).
 *
 * Não depende de como as bolhas são renderizadas: varre o DOM do container
 * de mensagens procurando `[data-message-id] [data-message-text]` (span de
 * texto de `MessageBubble`) e marca as ocorrências com a CSS Custom
 * Highlight API (`::highlight(conversation-search)`, ver `ensureSearchStyle`).
 * Sem suporte da API, a navegação continua funcionando (scroll + anel na
 * bolha atual), só sem o grifo amarelo no texto.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react"
import { IconChevronDown, IconChevronUp, IconSearch, IconX } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

const HL_ALL = "conversation-search"
const HL_CURRENT = "conversation-search-current"

type Occurrence = { range: Range; host: HTMLElement }

type HighlightCtor = new (...ranges: Range[]) => unknown
type HighlightRegistry = {
  set: (name: string, hl: unknown) => void
  delete: (name: string) => void
}

// O parser de CSS do Next (lightningcss) recusa `::highlight()`, então o
// estilo entra por <style> em runtime em vez de `globals.css`.
const STYLE_ID = "conversation-search-style"
const STYLE_CSS = `
::highlight(${HL_ALL}) { background-color: rgba(251, 191, 36, 0.45); color: inherit; }
::highlight(${HL_CURRENT}) { background-color: #f59e0b; color: #fff; }
[data-message-id][data-search-current="true"] {
  box-shadow: 0 0 0 2px var(--brand-primary);
  border-radius: var(--radius-lg);
}
`

function ensureSearchStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return
  const el = document.createElement("style")
  el.id = STYLE_ID
  el.textContent = STYLE_CSS
  document.head.appendChild(el)
}

function highlightApi(): { H: HighlightCtor; reg: HighlightRegistry } | null {
  if (typeof CSS === "undefined") return null
  const reg = (CSS as unknown as { highlights?: HighlightRegistry }).highlights
  const H = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight
  if (!reg || typeof H !== "function") return null
  return { H, reg }
}

function collectOccurrences(container: HTMLElement, query: string): Occurrence[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: Occurrence[] = []
  const hosts = container.querySelectorAll<HTMLElement>("[data-message-id]")
  for (const host of Array.from(hosts)) {
    const scopes = host.querySelectorAll<HTMLElement>("[data-message-text]")
    for (const scope of Array.from(scopes)) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode() as Text | null
      while (node) {
        const data = node.data
        const lower = data.toLowerCase()
        // Lower-case pode mudar o tamanho em casos raros (ex.: "İ"); sem
        // alinhamento 1:1 não dá pra mapear o índice de volta.
        if (lower.length === data.length) {
          let from = 0
          let idx = lower.indexOf(q, from)
          while (idx !== -1) {
            const range = document.createRange()
            range.setStart(node, idx)
            range.setEnd(node, idx + q.length)
            out.push({ range, host })
            from = idx + q.length
            idx = lower.indexOf(q, from)
          }
        }
        node = walker.nextNode() as Text | null
      }
    }
  }
  return out
}

export type ConversationSearchState = {
  /** Total de ocorrências na conversa carregada. */
  total: number
  /** Posição 1-based contada a partir da mais recente (1 = última). */
  position: number
  /** Vai para a ocorrência anterior (mais antiga, seta pra cima). */
  goOlder: () => void
  /** Vai para a próxima ocorrência (mais recente, seta pra baixo). */
  goNewer: () => void
}

/**
 * Mantém as ocorrências em sincronia com o DOM do container (query,
 * mensagens novas, paginação de histórico) e cuida do grifo + scroll.
 */
export function useConversationSearch({
  containerRef,
  query,
  enabled,
}: {
  containerRef: RefObject<HTMLElement | null>
  query: string
  enabled: boolean
}): ConversationSearchState {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([])
  const [index, setIndex] = useState(0)
  const lastQueryRef = useRef("")
  const pendingScrollRef = useRef(false)
  const active = enabled && query.trim().length > 0

  const recollect = useCallback(() => {
    const container = containerRef.current
    if (!container || !active) {
      setOccurrences([])
      return
    }
    const occ = collectOccurrences(container, query)
    const queryChanged = lastQueryRef.current !== query
    lastQueryRef.current = query
    setOccurrences(occ)
    setIndex((cur) => {
      const last = Math.max(0, occ.length - 1)
      if (queryChanged) {
        pendingScrollRef.current = true
        return last
      }
      return Math.min(cur, last)
    })
  }, [containerRef, query, active])

  // Query mudou → recoleta já. Mensagens mudaram (nova, histórico, re-render
  // de bolha) → recoleta no próximo frame via MutationObserver.
  useEffect(() => {
    recollect()
    if (!active) return
    const container = containerRef.current
    if (!container) return
    let raf = 0
    const observer = new MutationObserver(() => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        recollect()
      })
    })
    observer.observe(container, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [recollect, active, containerRef])

  useEffect(() => {
    if (!active) lastQueryRef.current = ""
  }, [active])

  // Grifo no texto (CSS Custom Highlight API) + anel na bolha atual.
  useEffect(() => {
    if (occurrences.length > 0) ensureSearchStyle()
    const api = highlightApi()
    const current = occurrences[index]
    if (api) {
      if (occurrences.length > 0) {
        api.reg.set(HL_ALL, new api.H(...occurrences.map((o) => o.range)))
      } else {
        api.reg.delete(HL_ALL)
      }
      if (current) api.reg.set(HL_CURRENT, new api.H(current.range))
      else api.reg.delete(HL_CURRENT)
    }
    if (current) current.host.setAttribute("data-search-current", "true")
    return () => {
      if (api) {
        api.reg.delete(HL_ALL)
        api.reg.delete(HL_CURRENT)
      }
      if (current) current.host.removeAttribute("data-search-current")
    }
  }, [occurrences, index])

  // Scroll só quando o usuário navegou ou mudou a busca — nunca por causa
  // de mensagem nova chegando enquanto ele lê outra parte.
  useEffect(() => {
    if (!pendingScrollRef.current) return
    const current = occurrences[index]
    if (!current) return
    pendingScrollRef.current = false
    const el = current.range.startContainer.parentElement ?? current.host
    el.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [occurrences, index])

  const goOlder = useCallback(() => {
    setIndex((cur) => {
      if (cur <= 0) return cur
      pendingScrollRef.current = true
      return cur - 1
    })
  }, [])

  const goNewer = useCallback(() => {
    setIndex((cur) => {
      if (cur >= occurrences.length - 1) return cur
      pendingScrollRef.current = true
      return cur + 1
    })
  }, [occurrences.length])

  const total = active ? occurrences.length : 0
  return {
    total,
    position: total > 0 ? total - index : 0,
    goOlder,
    goNewer,
  }
}

/**
 * Barra de busca inline: input + caixinha "N/M" + setas ↑ ↓ + fechar.
 * Enter = anterior (mais antiga), Shift+Enter = próxima, Esc = fechar.
 */
export function ConversationSearchBar({
  query,
  onQueryChange,
  search,
  onClose,
  inputRef,
  className,
}: {
  query: string
  onQueryChange: (q: string) => void
  search: ConversationSearchState
  onClose: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  className?: string
}) {
  const localRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? localRef
  const hasQuery = query.trim().length > 0
  const { total, position, goOlder, goNewer } = search

  useEffect(() => {
    ref.current?.focus()
  }, [ref])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (e.shiftKey) goNewer()
      else goOlder()
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      goOlder()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      goNewer()
    }
  }

  const navBtn =
    "flex size-6 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"

  return (
    <div
      role="search"
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-1.5",
        className,
      )}
    >
      <IconSearch size={13} className="shrink-0 text-[var(--text-muted)]" />
      <input
        ref={ref}
        type="text"
        placeholder="Buscar na conversa…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Buscar na conversa"
        className="min-w-0 flex-1 bg-transparent font-display text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
      />
      {hasQuery && (
        <span
          aria-live="polite"
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 font-display text-[10.5px] font-bold tabular-nums",
            total > 0
              ? "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
              : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
          )}
        >
          {total > 0 ? `${position}/${total}` : "0 resultados"}
        </span>
      )}
      <button
        type="button"
        aria-label="Resultado anterior"
        title="Anterior (Enter)"
        onClick={goOlder}
        disabled={total === 0 || position >= total}
        className={navBtn}
      >
        <IconChevronUp size={14} />
      </button>
      <button
        type="button"
        aria-label="Próximo resultado"
        title="Próximo (Shift+Enter)"
        onClick={goNewer}
        disabled={total === 0 || position <= 1}
        className={navBtn}
      >
        <IconChevronDown size={14} />
      </button>
      <button
        type="button"
        aria-label="Fechar busca"
        onClick={onClose}
        className="ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
      >
        <IconX size={12} />
      </button>
    </div>
  )
}
