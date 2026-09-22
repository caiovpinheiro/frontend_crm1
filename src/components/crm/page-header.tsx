/**
 * Cabeçalho canônico das páginas do app (`/settings` é a referência visual).
 * Identidade à esquerda; busca + Filtrar + calendário + hamburger à direita.
 */
"use client"

import { useLayoutEffect, useRef, type RefObject } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Sticky chrome height marker — sem fundo próprio.
 * Canvas `.v2-screen` já é `--bg-base`. Fundo no header + `zoom` do
 * `.v2-root` gerava hairline/contorno (lido como “quadrado” em Contatos).
 */
export const PAGE_HEADER_STICKY_CLASS = "bg-transparent"

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
      {/* Acima do list-col-head sticky (z-30) — Filtrar/período sobrepõem a lista.
          Sem fundo próprio: o canvas `.v2-screen` já é `--bg-base`. Fundo aqui
          + zoom do `.v2-root` pintava um retângulo com hairline no header. */}
      <div className="relative z-40 w-full min-w-0 shrink-0 bg-transparent">{header}</div>
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
 * Desktop: identidade à esquerda, cluster à direita na mesma faixa.
 * Mobile (< md): identidade em linha própria; busca + ações na linha de
 * baixo (`basis-full`) para o título/ícone não serem recortados.
 *
 * Um único mount (sem duplicar desktop `lg:flex` + mobile `lg:hidden`) para
 * portais de menu no `actions` / `menuSlot` não duplicarem.
 * Descrições de página foram removidas do padrão NavRail.
 */

/** Cluster de busca + ações. No mobile ocupa a 2ª linha inteira. */
export const PAGE_HEADER_CONTROLS_CLASS =
  "flex w-full min-w-0 basis-full items-center justify-start gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:ml-auto md:w-auto md:flex-1 md:basis-auto md:justify-end md:overflow-visible"

/** Slot da busca — até 32rem; no mobile cede espaço às ações, sem encobrir o título. */
export const PAGE_HEADER_SEARCH_SLOT_CLASS =
  "min-w-[7.5rem] flex-1 w-full max-w-[32rem] [&_.relative]:w-full"

interface PageHeaderProps {
  icon: React.ReactNode
  title: React.ReactNode
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
  title: React.ReactNode
  back?: PageHeaderBack
  titleAccessory?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-0 bg-transparent shadow-none outline-none">
      {back ? (
        <Link
          href={back.href}
          aria-label={`Voltar para ${back.label}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </Link>
      ) : null}

      {/* Glifo solto — sem slot/tile/borda/fundo. */}
      <span className="inline-flex shrink-0 border-0 bg-transparent text-primary shadow-none outline-none ring-0 [&>svg]:size-[22px]">
        {icon}
      </span>

      <div className="flex min-w-0 items-center gap-2">
        <div
          role="heading"
          aria-level={1}
          className="truncate font-display text-[22px] font-bold leading-tight tracking-tight text-[var(--text-primary)]"
        >
          {title}
        </div>
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
      <div className="min-w-0 max-md:w-full md:shrink-0">
        <Identity icon={icon} title={title} back={back} titleAccessory={titleAccessory} />
      </div>
      {hasControls ? (
        <div className={PAGE_HEADER_CONTROLS_CLASS}>
          {center ? <div className={PAGE_HEADER_SEARCH_SLOT_CLASS}>{center}</div> : null}
          {actions ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 md:shrink-0 md:flex-none">{actions}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
