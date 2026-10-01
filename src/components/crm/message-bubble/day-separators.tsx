import { useEffect, useRef, useState } from "react"
import { IconArrowsExchange } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { formatPhoneDisplay } from "@/lib/phone"
import type { ConnectionRef } from "@/features/inbox-v2/api/types"

interface DaySeparatorProps {
  date: string
  /** Gruda no topo do container rolável até o próximo dia empurrar (WhatsApp). */
  sticky?: boolean
  /** Reserva altura mas some — o `StickyDayPill` ocupa o mesmo slot. */
  occluded?: boolean
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

export const DAY_PILL_CLASS =
  "inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold capitalize text-foreground"

const DAY_SEP_WRAP_CLASS = "flex justify-center py-1.5"

export function DaySeparator({ date, sticky = false, occluded = false }: DaySeparatorProps) {
  return (
    <div
      data-day-sep={date}
      className={cn(
        DAY_SEP_WRAP_CLASS,
        sticky && "sticky top-1 z-10",
        occluded && "invisible",
      )}
    >
      <span className={DAY_PILL_CLASS}>{date}</span>
    </div>
  )
}

function channelLabel(type: string): string {
  const t = String(type ?? "").toLowerCase()
  if (t.includes("whatsapp")) return "WhatsApp"
  if (t.includes("instagram") || t.includes("facebook") || t.includes("messenger")) return "Instagram"
  if (t.includes("email") || t.includes("smtp")) return "E-mail"
  return type || "Canal"
}

export function ChannelSeparator({
  channel,
}: {
  channel: ConnectionRef | null | undefined
}) {
  if (!channel) return null
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <div className="h-px flex-1 bg-border/60" />
      <div className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm"
      )}>
        <IconArrowsExchange className="size-3.5 shrink-0 text-blue-500" />
        <span>via {channelLabel(channel.type)}</span>
        <span className="text-muted-foreground">·</span>
        <span className="max-w-[10rem] truncate">{channel.name}</span>
        {channel.phoneNumber ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{formatPhoneDisplay(channel.phoneNumber)}</span>
          </>
        ) : null}
      </div>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  )
}

/** Chip discreto de canal — usado no rodapé de cada mensagem quando a
 *  conversa tem mensagens de mais de uma conta (WABA/página). */
export function ChannelLabel({
  channel,
  className,
}: {
  channel: ConnectionRef | null | undefined
  className?: string
}) {
  if (!channel) return null
  return (
    <span
      className={cn(
        "inline-flex max-w-[8rem] items-center gap-1 truncate text-[10px] font-medium text-[var(--color-ink-muted)]",
        className,
      )}
      title={`via ${channelLabel(channel.type)} · ${channel.name}${channel.phoneNumber ? ` · ${formatPhoneDisplay(channel.phoneNumber)}` : ""}`}
    >
      <IconArrowsExchange className="size-2.5 shrink-0 text-blue-500" />
      <span className="truncate">{channel.name}</span>
    </span>
  )
}

/** Atributo nas linhas da timeline p/ o pill sticky rastrear o dia visível. */
export const DAY_LABEL_ATTR = "data-day-label"

/** Separador in-flow — único alvo do `useStickyDayLabel`. */
export const DAY_SEP_ATTR = "data-day-sep"

/**
 * Overlay no topo do scroller (altura 0). A pill in-flow do dia atual
 * reserva o slot; esta só pinta o rótulo. Loader fica fora da pill.
 */
export function StickyDayPill({
  date,
}: {
  date: string | null
  /** @deprecated — loader não mora mais na pill. */
  loading?: boolean
  /** @deprecated — a pill não pausa no pin inicial. */
  paused?: boolean
}) {
  const lastDateRef = useRef<string | null>(null)
  if (date) lastDateRef.current = date
  const shown = date ?? lastDateRef.current

  return (
    <div
      data-sticky-day-bar
      className="pointer-events-none sticky top-0 z-[15] h-0 w-full shrink-0 overflow-visible"
      aria-hidden
    >
      <div className={cn(DAY_SEP_WRAP_CLASS, "absolute inset-x-0 top-0 justify-center")}>
        <span className={cn(DAY_PILL_CLASS, !shown && "invisible")}>{shown ?? "Hoje"}</span>
      </div>
    </div>
  )
}

function resolveStickyRoot(
  root: { current: HTMLElement | null } | (() => HTMLElement | null),
): HTMLElement | null {
  return typeof root === "function" ? root() : root.current
}

/** Dia cuja pill in-flow já cruzou por completo a barra sticky. */
export function useStickyDayLabel(
  root: { current: HTMLElement | null } | (() => HTMLElement | null),
  resetKey: unknown,
): string | null {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let observer: IntersectionObserver | null = null
    let mutations: MutationObserver | null = null
    let scrollRoot: HTMLElement | null = null
    let retryId = 0
    let rafId = 0
    let attempts = 0
    let onScroll: (() => void) | null = null
    const seen = new Set<Element>()

    const stickyLine = () => {
      if (!scrollRoot) return 0
      const bar = scrollRoot.querySelector<HTMLElement>("[data-sticky-day-bar]")
      const slot = bar?.firstElementChild as HTMLElement | null
      return slot
        ? slot.getBoundingClientRect().bottom
        : scrollRoot.getBoundingClientRect().top
    }

    const pickLabel = () => {
      if (!scrollRoot) return null
      const items = scrollRoot.querySelectorAll<HTMLElement>(`[${DAY_SEP_ATTR}]`)
      if (items.length === 0) return null
      const line = stickyLine()
      let current = items[0].getAttribute(DAY_SEP_ATTR)
      for (const el of items) {
        if (el.getBoundingClientRect().bottom <= line + 0.5) {
          current = el.getAttribute(DAY_SEP_ATTR)
        } else {
          break
        }
      }
      return current
    }

    const apply = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const next = pickLabel()
        if (next) setLabel((prev) => (prev === next ? prev : next))
      })
    }

    const watchSeps = () => {
      if (!scrollRoot || !observer) return
      scrollRoot.querySelectorAll<HTMLElement>(`[${DAY_SEP_ATTR}]`).forEach((el) => {
        if (seen.has(el)) return
        seen.add(el)
        observer!.observe(el)
      })
    }

    const bind = () => {
      if (cancelled) return
      scrollRoot = resolveStickyRoot(root)
      if (!scrollRoot) {
        if (attempts++ < 16) retryId = requestAnimationFrame(bind)
        return
      }

      const slotH = Math.max(
        (scrollRoot.querySelector("[data-sticky-day-bar]")?.firstElementChild as HTMLElement | null)
          ?.offsetHeight ?? 0,
        28,
      )
      const band = Math.max(scrollRoot.clientHeight - slotH - 2, 0)
      observer = new IntersectionObserver(apply, {
        root: scrollRoot,
        rootMargin: `-${slotH}px 0px -${band}px 0px`,
        threshold: [0, 1],
      })
      watchSeps()
      mutations = new MutationObserver(() => {
        watchSeps()
      })
      mutations.observe(scrollRoot, { childList: true, subtree: true })
      onScroll = apply
      scrollRoot.addEventListener("scroll", apply, { passive: true })
      requestAnimationFrame(() => requestAnimationFrame(apply))
    }

    bind()

    return () => {
      cancelled = true
      if (retryId) cancelAnimationFrame(retryId)
      if (rafId) cancelAnimationFrame(rafId)
      observer?.disconnect()
      mutations?.disconnect()
      if (scrollRoot && onScroll) {
        scrollRoot.removeEventListener("scroll", onScroll)
      }
    }
  }, [root, resetKey])

  return label
}
