"use client"

import { cn } from "@/lib/utils"
import { TooltipGlass } from "@/components/crm/tooltip-glass"
import {
  IconPlus,
  IconSquare,
  IconSquareCheckFilled,
  IconSquareMinus,
} from "@tabler/icons-react"
import type { HTMLAttributes, ReactNode } from "react"
import { useEffect, useRef } from "react"
import { DealCard, type Deal } from "./deal-card"

export type ColumnColor = "novo" | "quali" | "proposta" | "nego" | "fecha"

/**
 * Estado de seleção em massa por coluna. Quando passado, a coluna
 * exibe um checkbox no header (3 estados: vazio / parcial / cheio) que
 * permite marcar/desmarcar todos os deals JÁ CARREGADOS daquele estágio.
 * Comportamento idêntico ao kanban antigo (`/old/pipeline`).
 */
export interface KanbanColumnSelection {
  allSelected: boolean
  someSelected: boolean
  selectedCount: number
  totalInColumn: number
  onToggleAll: () => void
  /**
   * Quando `false`, o checkbox "selecionar todos" do header NÃO é
   * renderizado — alinhando com o "modo seleção" global do kanban.
   * Default: `true` (mantém compat com kanban antigo).
   */
  enabled?: boolean
}

interface KanbanColumnProps {
  title: string
  color: ColumnColor
  /**
   * Cor hex opcional (ex.: `#ec4899`) do backend `stage.color`.
   * Quando fornecida, sobrepõe o preset de `color` na strip do topo
   * e no badge de contagem — devolve identidade por estágio em vez
   * de forçar a paleta fixa de 5 slugs.
   */
  stageColor?: string
  count: number
  total: string
  deals: Deal[]
  onDealClick?: (dealId: string) => void
  onAddDeal?: () => void
  showAddButton?: boolean
  /**
   * Render custom de cada deal — usado pelo `/pipeline/kanban-v2`
   * para envolver cada DealCard num `<Draggable>` do
   * `@hello-pangea/dnd`. Quando ausente, comportamento default
   * (renderiza `<DealCard>` direto).
   */
  renderDeal?: (deal: Deal, index: number) => ReactNode
  /** Ref + handlers aplicados no container scrollavel dos cards (Droppable). */
  dealsContainerRef?: (el: HTMLElement | null) => void
  dealsContainerProps?: HTMLAttributes<HTMLDivElement>
  /** Slot do `provided.placeholder` do react-dnd. */
  placeholderSlot?: ReactNode
  /** Estado de seleção em massa. Sem passar, o checkbox de "selecionar todos" não aparece. */
  selection?: KanbanColumnSelection
  /** Formulário inline de criação de deal — renderizado acima do botão "Adicionar negócio". */
  addFormSlot?: ReactNode
  /**
   * Botão "Carregar mais" ao fim da lista — exibido quando o board pagina
   * (10/coluna) e a etapa tem mais deals no servidor (`hasMore`).
   */
  loadMore?: {
    remaining: number
    loading: boolean
    onClick: () => void
  }
}

const colorMap: Record<ColumnColor, string> = {
  novo: "var(--col-novo)",
  quali: "var(--col-quali)",
  proposta: "var(--col-proposta)",
  nego: "var(--col-nego)",
  fecha: "var(--col-fecha)",
}

const colorBgMap: Record<ColumnColor, string> = {
  novo:     "color-mix(in srgb, var(--col-novo) 10%, transparent)",
  quali:    "color-mix(in srgb, var(--col-quali) 10%, transparent)",
  proposta: "color-mix(in srgb, var(--col-proposta) 10%, transparent)",
  nego:     "color-mix(in srgb, var(--col-nego) 10%, transparent)",
  fecha:    "color-mix(in srgb, var(--col-fecha) 10%, transparent)",
}

export function KanbanColumn({
  title,
  color,
  stageColor,
  count,
  total,
  deals,
  onDealClick,
  onAddDeal,
  renderDeal,
  dealsContainerRef,
  dealsContainerProps,
  placeholderSlot,
  selection,
  addFormSlot,
  loadMore,
}: KanbanColumnProps) {
  const showSelectAll =
    !!selection &&
    selection.totalInColumn > 0 &&
    selection.enabled !== false

  // Auto-load: sentinel no fim da lista dispara o "Carregar mais" ao
  // entrar no viewport (200px de margem). O botão manual permanece como
  // fallback acessível. Refs evitam recriar o observer a cada render
  // (onClick é inline no pai) e bloqueiam double-fire durante o fetch.
  const loadMoreOnClickRef = useRef(loadMore?.onClick)
  loadMoreOnClickRef.current = loadMore?.onClick
  const loadMoreLoadingRef = useRef(loadMore?.loading ?? false)
  loadMoreLoadingRef.current = loadMore?.loading ?? false
  const hasLoadMore = !!loadMore && loadMore.remaining > 0
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasLoadMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadMoreLoadingRef.current) {
          loadMoreOnClickRef.current?.()
        }
      },
      { root: el.parentElement, rootMargin: "200px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasLoadMore])

  // Cor efetiva do estágio: hex do backend > preset. Badge usa
  // color-mix inline para gerar background 15% da cor do estágio
  // (opacidade um pouco maior que o preset 10% p/ melhorar contraste
  // sobre lavanda do mesh).
  const effectiveColor = stageColor ?? colorMap[color]
  const effectiveBg = stageColor
    ? `color-mix(in srgb, ${stageColor} 15%, transparent)`
    : colorBgMap[color]

  return (
    <section
      aria-label={`Coluna ${title}`}
      className="kanban-col flex w-[300px] shrink-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md"
    >
      {/* Header — reproduz a estrutura do kanban legado (surface forte + border-b) */}
      <header className="relative shrink-0 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-strong)] px-3 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {showSelectAll && selection ? (
            <TooltipGlass
              label={
                selection.allSelected
                  ? `Limpar seleção desta etapa (${selection.selectedCount})`
                  : selection.someSelected
                    ? `Selecionar todos os ${selection.totalInColumn} (já marcados: ${selection.selectedCount})`
                    : `Selecionar todos os ${selection.totalInColumn} desta etapa`
              }
              side="top"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  selection.onToggleAll()
                }}
                aria-label={
                  selection.allSelected
                    ? "Limpar seleção desta etapa"
                    : "Selecionar todos desta etapa"
                }
                aria-pressed={selection.someSelected}
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
                  selection.someSelected
                    ? "text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10"
                    : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]",
                )}
              >
                {selection.allSelected ? (
                  <IconSquareCheckFilled size={16} />
                ) : selection.someSelected ? (
                  <IconSquareMinus size={16} />
                ) : (
                  <IconSquare size={16} />
                )}
              </button>
            </TooltipGlass>
          ) : null}

          <h3 className="font-display text-[14px] font-bold tracking-tight text-[var(--text-primary)]">
            {title}
          </h3>

          {/* Badge de contagem — círculo colorido simples, sem background */}
          <span
            className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 font-display text-[11px] font-bold text-white"
            style={{ background: effectiveColor }}
          >
            {count}
          </span>
          </div>

          <TooltipGlass label="Adicionar negócio" side="top">
            <button
              type="button"
              onClick={onAddDeal}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:text-white"
              onMouseEnter={(e) => {
                const btn = e.currentTarget
                btn.style.background = effectiveColor
                btn.style.color = "#fff"
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget
                btn.style.background = ""
                btn.style.color = ""
              }}
            >
              <IconPlus size={15} />
            </button>
          </TooltipGlass>
        </div>

        {/* Faixa de cor — abaixo do título (igual ao legado) */}
        {effectiveColor ? (
          <div
            className="mt-1.5 h-[2px] w-full rounded-full opacity-90"
            style={{ backgroundColor: effectiveColor }}
            aria-hidden
          />
        ) : null}

        {/* Total */}
        <p className="mt-1.5 text-[11px] tabular-nums text-[var(--text-muted)]">{total}</p>
      </header>

      {/* Deals — container respeita Droppable (ref + props do react-dnd).
          min-h-0 e' OBRIGATORIO: este e' o no onde o scroll-Y precisa
          ativar. Sem min-h-0, flex-1 em flex-col calcula min-content
          (= soma dos filhos) e estoura. Com min-h-0, ele respeita o
          espaco restante e o overflow-y-auto passa a funcionar. */}
      <div
        ref={dealsContainerRef}
        {...dealsContainerProps}
        // pt extra: hover -translate-y do 1º card não clipa no header da coluna.
        className="kanban-scroll flex min-h-[120px] flex-1 flex-col gap-1.5 overflow-x-clip overflow-y-auto px-2 pb-2 pt-3"
      >
        {/* Formulário inline de criação — renderizado no TOPO da fase,
            acima dos cards. Disparado pelo "+" no header da coluna. */}
        {addFormSlot}

        {deals.map((deal, index) =>
          renderDeal ? (
            renderDeal(deal, index)
          ) : (
            <DealCard key={deal.id} deal={deal} onClick={() => onDealClick?.(deal.id)} />
          ),
        )}
        {placeholderSlot}

        {hasLoadMore ? (
          <div ref={sentinelRef} aria-hidden className="h-px shrink-0" />
        ) : null}

        {loadMore && loadMore.remaining > 0 ? (
          <button
            type="button"
            disabled={loadMore.loading}
            onClick={loadMore.onClick}
            className="mt-0.5 flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 py-2 text-[11px] font-medium text-[var(--brand-primary)] transition-colors hover:border-[var(--brand-primary)]/50 hover:bg-[var(--brand-primary)]/10 disabled:opacity-60"
          >
            {loadMore.loading ? "Carregando..." : `Carregar mais (${loadMore.remaining})`}
          </button>
        ) : null}
      </div>
    </section>
  )
}
// DEBUG ONLY
