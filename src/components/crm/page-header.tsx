/**
 * Cabeçalho canônico das páginas do app (`/settings` é a referência visual).
 * Identidade à esquerda; busca + Filtrar + calendário + hamburger à direita.
 */
"use client"

import { useLayoutEffect, useRef, type RefObject } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"

/** Page title/search stay outside the Y-scroller (zoom breaks `sticky`). */
export const PAGE_HEADER_STICKY_CLASS = "bg-[var(--bg-base)]"

export const PAGE_HEADER_STICKY_ATTR = "data-sticky-page-header"

/**
 * Header fora do overflow. O miolo (`data-page-scroll`) é o único
 * scrollport — KPIs, linhas e rodapé rolam por baixo do chrome.
 */
export function PageChrome({
  header,
  children,
  className,
  bodyClassName,
  scroll = "body",
}: {
  header: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  /**
   * `body`: header fixo, miolo rola (listas / painéis).
   * `page`: a página inteira rola — só quando o canvas não pode usar overflow.
   */
  scroll?: "body" | "page"
}) {
  const page = scroll === "page"
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col",
        page ? "min-h-min flex-1" : "min-h-0 flex-1 overflow-hidden",
        className,
      )}
    >
      {/* Acima do list-col-head sticky (z-30) — Filtrar/período sobrepõem a lista. */}
      <div className="relative z-40 w-full shrink-0 bg-[var(--bg-base)]">{header}</div>
      <div
        data-page-scroll={page ? undefined : ""}
        className={cn(
          "flex w-full min-w-0 flex-col",
          page
            ? "min-h-min"
            : "min-h-0 flex-1 overflow-auto overscroll-contain",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Publishes `--page-header-sticky-h` on the nearest page scrollport so
 * list column heads can pin just below this chrome.
 */
export function usePublishStickyChromeHeight(
  ref: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.parentElement?.closest(`[${PAGE_HEADER_STICKY_ATTR}]`)) return

    const target = () =>
      (el.closest(".v2-page-scroll, [data-page-scroll]") as HTMLElement | null) ?? el

    const publish = () => {
      target().style.setProperty("--page-header-sticky-h", `${el.offsetHeight}px`)
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      target().style.removeProperty("--page-header-sticky-h")
    }
  }, [])
}

export type PageHeaderBack = {
  href: string
  /** Nome da rota pai — ex.: "Contatos", "Campanhas". */
  label: string
}

/**
 * Cabeçalho de página DS v2 — identidade (ícone tile 44px + título 22px bold)
 * à esquerda; busca + Filtrar + calendário + hamburger sempre à direita.
 *
 * Uma única faixa `flex-wrap`: se o cluster não couber, ele desce para a
 * segunda linha alinhado ao fim (`ml-auto` / `justify-end`) — não como bloco
 * `w-full` à esquerda sob o título. A pílula tem altura `h-10` e largura
 * canônica `32rem` (encolhe antes de recortar as ações).
 *
 * Um único mount (sem duplicar desktop `lg:flex` + mobile `lg:hidden`) para
 * portais de menu no `actions` / `menuSlot` não duplicarem.
 * Descrições de página foram removidas do padrão NavRail.
 */

/** Cluster de busca + ações — sempre à direita, wrap alinhado ao fim. */
export const PAGE_HEADER_CONTROLS_CLASS =
  "ml-auto flex min-w-0 w-max max-w-full flex-wrap items-center justify-end gap-2"

/** Slot da pílula — largura canônica 32rem; `h-10` vem do input. */
export const PAGE_HEADER_SEARCH_SLOT_CLASS =
  "min-w-0 w-[32rem] max-w-full [&_.relative]:w-full"

interface PageHeaderProps {
  icon: React.ReactNode
  title: string
  /** @deprecated Ignorado — NavRail não exibe mais descrição sob o título. */
  description?: string
  /** Voltar à lista pai — botão quadrado ghost à esquerda do ícone. */
  back?: PageHeaderBack
  /** Elemento renderizado ao lado do título (ex.: dropdown de funis). */
  titleAccessory?: React.ReactNode
  /**
   * Busca — à DIREITA, no cluster com calendário e hamburger.
   * Tipicamente um `<SearchFilterBar />` (`h-10 rounded-full`).
   */
  center?: React.ReactNode
  /**
   * Calendário, switchers e hamburger — à DIREITA, depois da busca.
   */
  actions?: React.ReactNode
  className?: string
}

function Identity({
  icon,
  title,
  back,
  titleAccessory,
}: {
  icon: React.ReactNode
  title: string
  back?: PageHeaderBack
  titleAccessory?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {back ? (
        <Link
          href={back.href}
          aria-label={`Voltar para ${back.label}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </Link>
      ) : null}

      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-border bg-card text-primary shadow-none">
        {icon}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate font-display text-[22px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {titleAccessory ? <div className="flex shrink-0 items-center">{titleAccessory}</div> : null}
      </div>
    </div>
  )
}

export function PageHeader({
  icon,
  title,
  back,
  titleAccessory,
  center,
  actions,
  className,
}: PageHeaderProps) {
  const hasControls = Boolean(center || actions)
  const ref = useRef<HTMLDivElement>(null)
  usePublishStickyChromeHeight(ref)

  return (
    <div
      ref={ref}
      data-sticky-page-header=""
      className={cn(
        PAGE_HEADER_STICKY_CLASS,
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pb-2",
        className,
      )}
    >
      <div className="min-w-0 shrink">
        <Identity icon={icon} title={title} back={back} titleAccessory={titleAccessory} />
      </div>
      {hasControls ? (
        <div className={PAGE_HEADER_CONTROLS_CLASS}>
          {center ? <div className={PAGE_HEADER_SEARCH_SLOT_CLASS}>{center}</div> : null}
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
