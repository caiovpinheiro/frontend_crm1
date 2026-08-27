"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import {
  IconClock,
  IconPlus,
  IconChevronDown,
  IconCheck,
  IconMessages,
  IconInbox,
  IconCornerUpLeft,
  IconCircleCheck,
  IconRobot,
  IconSparkles,
  IconAlertCircle,
  IconRefresh,
  IconPhone,
  type Icon as TablerIcon,
} from "@tabler/icons-react"
import { AppLoading } from "@/components/crm/app-loading"
import { InputGlass } from "./input-glass"
import { type TabItem } from "./tabs-glass"
import { TooltipGlass } from "./tooltip-glass"
import { ConversationCard, type Conversation } from "./conversation-card"
import { CheckboxGlass } from "./checkbox-glass"

interface ConversationColumnProps {
  conversations: Conversation[]
  activeConversationId?: string
  onSelectConversation?: (id: string) => void
  className?: string
  // ── Props CONTROLADOS ───────────────────────────────────────────
  searchValue?: string
  onSearchChange?: (value: string) => void
  /**
   * Tabs do backend. Quando fornecido, controla a UI por completo
   * (sem filtro local). Quando ausente, usamos as 3 tabs do v0
   * (Todas/Não lidas/Atribuídas).
   */
  tabsOverride?: ReadonlyArray<TabItem>
  activeTabIndex?: number
  onTabChange?: (index: number) => void
  /** Badge de urgencia (relogio vermelho) no header. */
  urgencyCount?: number
  /** Acao do botao "+" no header (criar nova conversa). */
  onNewConversation?: () => void
  /**
   * Slot opcional renderizado no canto direito do header (ao lado do
   * título "Conversas"). Usado para o botão de filtros do inbox-v2.
   */
  filterSlot?: React.ReactNode
  /**
   * Slot opcional para um handle de redimensionamento (`ColumnResizer`).
   * O componente é renderizado dentro de um wrapper `position: relative`,
   * então um handle com `position: absolute right: -6px` se ancora bem.
   */
  resizerSlot?: React.ReactNode
  /**
   * Visual do header. Por default (`minimal`) só o título "Conversas".
   * Use `full` para exibir o badge de urgência e o botão "+" (legado v0).
   */
  headerVariant?: "minimal" | "full"
  /**
   * Esconde a linha de busca + filtro do topo da coluna. Usado quando
   * esses controles foram elevados para o header da página (layout
   * `/v2/inbox`), evitando duplicidade. O seletor de status (dropdown)
   * permanece como primeiro elemento.
   */
  hideSearch?: boolean
  /**
   * Renderiza slots específicos por card (assignee popover).
   * O callback recebe a conversation e devolve o node que será
   * injetado em `assigneeSlot` do `ConversationCard`.
   * Mantido fora dos dados pra evitar incluir JSX no objeto serializável
   * que sai do adapter.
   */
  renderCardSlots?: (conversation: Conversation) => {
    assigneeSlot?: React.ReactNode
  }
  /**
   * Infinite scroll: callback disparado quando o scroll chega perto do
   * fim e ainda há páginas pra carregar. Usado pelo `useConversations`
   * (useInfiniteQuery) — sem isso, o cap de 60 conversas iniciais
   * impede o operador de ver o resto da fila.
   */
  onLoadMore?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
  /**
   * Carga inicial da lista (sessão/prefs/query). Enquanto true, mostra
   * skeleton de cards — NÃO o empty "Nenhuma conversa encontrada".
   * Evita flash no F5 antes dos dados chegarem.
   */
  isLoading?: boolean
  /**
   * Modo de seleção múltipla (ações em massa). Quando ativo, exibe uma
   * barra "Selecionar todas" + `bulkActionsSlot` acima da lista e um
   * checkbox em cada `ConversationCard`.
   */
  selectionMode?: boolean
  selectedIds?: Set<string>
  onToggleSelectOne?: (id: string) => void
  /** Disparado pelo checkbox "selecionar todas" com a lista final de ids marcados (vazia = limpar). */
  onSelectAllChange?: (ids: string[]) => void
  /** Total de conversas do filtro atual (todas as páginas) — habilita "selecionar todas do filtro". */
  totalCount?: number
  /** true = modo "todas do filtro" ativo (encerra tudo, não só as carregadas). */
  selectAllFilter?: boolean
  /** Alterna o modo "todas do filtro". */
  onSelectAllFilterChange?: (value: boolean) => void
  /** Ações renderizadas ao lado do contador, na barra de seleção (ex.: Encerrar, Reabrir, Cancelar). */
  bulkActionsSlot?: React.ReactNode
  /**
   * Atualiza só a fila atual (lista + contadores), sem reload da página.
   * Renderiza um botão ↻ ao lado do seletor de status (Entrada/Aguardando/…).
   */
  onRefresh?: () => void
  /** true enquanto a atualização manual da fila está em curso (gira o ícone). */
  isRefreshing?: boolean
  /**
   * Quando a busca pinna um card no topo, volta o scroll da lista.
   */
  scrollToTopKey?: string
}

const DEFAULT_TABS: TabItem[] = [
  { label: "Todas" },
  { label: "Não lidas" },
  { label: "Atribuídas" },
]

/**
 * Mapeia o label do status (normalizado) para ícone + cores do
 * "selo" da pílula. Permite que o ícone reflita a escolha atual em
 * vez de um relógio fixo. Cai num default neutro quando não casa.
 */
function statusVisual(label: string | undefined): {
  Icon: TablerIcon
  bg: string
  fg: string
} {
  const l = (label ?? "").toLowerCase()
  if (l.includes("todas") || l.includes("todos"))
    return {
      Icon: IconMessages,
      bg: "var(--color-enterprise-bg)",
      fg: "var(--brand-primary)",
    }
  if (l.includes("aguard") || l.includes("esperando"))
    return { Icon: IconClock, bg: "var(--color-lead-bg)", fg: "var(--color-lead)" }
  if (l.includes("entrada"))
    return {
      Icon: IconInbox,
      bg: "rgba(59,130,246,0.14)",
      fg: "var(--color-info)",
    }
  if (l.includes("respond"))
    return {
      Icon: IconCornerUpLeft,
      bg: "var(--color-enterprise-bg)",
      fg: "var(--brand-primary)",
    }
  if (l === "ligar")
    return {
      Icon: IconPhone,
      bg: "rgba(16,185,129,0.14)",
      fg: "rgb(5,150,105)",
    }
  // Antes de "automa": a fila do Agente IA é distinta da de Automação.
  if (l.includes("agente"))
    return {
      Icon: IconSparkles,
      bg: "rgba(236,72,153,0.14)",
      fg: "rgb(219,39,119)",
    }
  if (l.includes("automa"))
    return {
      // Mesmo IconRobot da NavRail / página Automações (sidebar-catalog).
      Icon: IconRobot,
      bg: "rgba(139,92,246,0.14)",
      fg: "rgb(124,58,237)",
    }
  if (l.includes("resolv") || l.includes("finaliz") || l.includes("encerr"))
    return {
      Icon: IconCircleCheck,
      bg: "var(--color-success-bg)",
      fg: "var(--color-success)",
    }
  if (l.includes("erro") || l.includes("error") || l.includes("falha"))
    return {
      Icon: IconAlertCircle,
      bg: "var(--color-danger-bg)",
      fg: "var(--color-danger)",
    }
  return { Icon: IconClock, bg: "var(--color-lead-bg)", fg: "var(--color-lead)" }
}

export function ConversationColumn({
  conversations,
  activeConversationId,
  onSelectConversation,
  className,
  searchValue,
  onSearchChange,
  tabsOverride,
  activeTabIndex,
  onTabChange,
  urgencyCount,
  onNewConversation,
  resizerSlot,
  headerVariant = "minimal",
  renderCardSlots,
  filterSlot,
  hideSearch = false,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  isLoading = false,
  selectionMode = false,
  selectedIds,
  totalCount,
  selectAllFilter = false,
  onSelectAllFilterChange,
  onToggleSelectOne,
  onSelectAllChange,
  bulkActionsSlot,
  onRefresh,
  isRefreshing = false,
  scrollToTopKey,
}: ConversationColumnProps) {
  // Sentinela invisível no fim da lista. Quando entra no viewport
  // (com 200px de margem), dispara `onLoadMore`. IntersectionObserver
  // é a forma mais confiável — onScroll perde frame em listas longas
  // e tem que recalcular thresholds manualmente.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!scrollToTopKey) return
    listScrollRef.current?.scrollTo({ top: 0 })
  }, [scrollToTopKey])
  useEffect(() => {
    if (!onLoadMore || !hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            onLoadMore()
            break
          }
        }
      },
      { rootMargin: "200px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [onLoadMore, hasMore])
  const [internalTab, setInternalTab] = useState(0)
  const isControlledTabs = tabsOverride !== undefined
  const tabs: ReadonlyArray<TabItem> = isControlledTabs ? tabsOverride : DEFAULT_TABS
  const activeTab = isControlledTabs ? (activeTabIndex ?? 0) : internalTab
  const handleTabChange = (index: number) => {
    if (isControlledTabs) onTabChange?.(index)
    else setInternalTab(index)
  }

  const isControlledSearch = onSearchChange !== undefined
  const [internalSearch, setInternalSearch] = useState("")
  const searchVal = isControlledSearch ? (searchValue ?? "") : internalSearch
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (isControlledSearch) onSearchChange?.(e.target.value)
    else setInternalSearch(e.target.value)
  }

  const displayed = isControlledTabs
    ? conversations
    : conversations.filter((conv) => {
        if (activeTab === 1) return conv.urgent
        if (activeTab === 2) return conv.assignee
        return true
      })

  const urgency = urgencyCount ?? conversations.filter((c) => c.urgent).length

  const currentTabLabel = tabs[activeTab]?.label ?? "Todas"
  const currentTabCount = tabs[activeTab]?.count
  const currentVisual = statusVisual(currentTabLabel)

  // ── Dropdown de status ──────────────────────────────────────────
  const dropdownBtnRef = useRef<HTMLButtonElement>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const el = dropdownBtnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setDropdownPos({ top: r.bottom + 6, left: r.left, width: r.width })
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (el && el.contains(target)) return
      setDropdownOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [dropdownOpen])

  return (
    <section
      aria-label="Lista de conversas"
      className={cn(
        "@container relative flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] px-2 pb-2 pt-1.5 backdrop-blur-md shadow-[var(--glass-shadow)]",
        className,
      )}
    >
      {resizerSlot}
      {/* Busca + filtros inline (título "Conversas" removido). A variante
          `full` mantém o badge de urgência e o botão "+" do design v0.
          Quando `hideSearch`, esses controles vivem no header da página. */}
      {!hideSearch && (
        <div className="mb-2 flex items-center gap-2">
          <InputGlass
            withSearch
            placeholder="Buscar conversa..."
            className="flex-1"
            value={searchVal}
            onChange={handleSearchChange}
          />
          {headerVariant === "full" && urgency > 0 && (
            <span className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/12 px-2.5 font-display text-[11px] font-bold text-[var(--color-danger-text)]">
              <IconClock size={12} />
              {urgency}
            </span>
          )}
          {headerVariant === "full" && (
            <TooltipGlass label="Nova conversa" side="top">
              <button
                type="button"
                aria-label="Nova conversa"
                onClick={onNewConversation}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)] hover:text-white"
              >
                <IconPlus size={18} />
              </button>
            </TooltipGlass>
          )}
        </div>
      )}

      {/* Seletor de status + toggle de filtro na mesma linha */}
      <div className="mb-2 flex items-center gap-2 @max-[240px]:gap-1">
      <button
        ref={dropdownBtnRef}
        type="button"
        onClick={() => setDropdownOpen((v) => !v)}
        title={tabs[activeTab]?.title}
        aria-haspopup="listbox"
        aria-expanded={dropdownOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-2 py-1.5 pr-3 text-left shadow-[0_2px_10px_rgba(100,130,180,0.12)] backdrop-blur-sm transition-shadow hover:shadow-[0_3px_14px_rgba(100,130,180,0.20)] @max-[240px]:gap-1.5 @max-[240px]:pr-2"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: currentVisual.bg, color: currentVisual.fg }}
        >
          <currentVisual.Icon size={15} stroke={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 @max-[240px]:hidden">
          <span className="min-w-0 truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
            {currentTabLabel}
          </span>
          {currentTabCount != null && (
            <span className="shrink-0 rounded-full bg-[var(--brand-primary)] px-1.5 py-px text-[10.5px] font-bold tabular-nums text-white">
              {currentTabCount.toLocaleString("pt-BR")}
            </span>
          )}
        </span>
        <IconChevronDown
          size={15}
          className={cn(
            "shrink-0 text-[var(--text-muted)] transition-transform",
            dropdownOpen && "rotate-180",
          )}
        />
      </button>
      {onRefresh ? (
        <TooltipGlass label="Atualizar fila" side="bottom">
          <button
            type="button"
            aria-label="Atualizar fila"
            onClick={() => onRefresh()}
            disabled={isRefreshing}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] transition-colors hover:text-[var(--brand-primary)] disabled:opacity-60",
              isRefreshing && "text-[var(--brand-primary)]",
            )}
          >
            <IconRefresh
              size={17}
              stroke={2}
              className={cn(isRefreshing && "animate-spin")}
            />
          </button>
        </TooltipGlass>
      ) : null}
      {filterSlot}
      </div>

      {dropdownOpen &&
        dropdownPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="listbox"
            className="fixed z-(--z-above) flex flex-col gap-0.5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)] backdrop-blur-xl"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: Math.max(dropdownPos.width, 220),
              isolation: "isolate",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {tabs.map((tab, idx) => {
              const isActive = activeTab === idx
              const v = statusVisual(tab.label)
              return (
                <button
                  key={`${tab.label}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  title={tab.title}
                  onClick={() => {
                    handleTabChange(idx)
                    setDropdownOpen(false)
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left font-display text-[13px] font-semibold transition-colors",
                    isActive
                      ? "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)]",
                  )}
                >
                  <span className="flex flex-1 items-center gap-2">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: v.bg, color: v.fg }}
                    >
                      <v.Icon size={12} stroke={2.2} />
                    </span>
                    <span>{tab.label}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {isActive && (
                      <IconCheck size={14} className="text-[var(--brand-primary)]" />
                    )}
                    {tab.count !== undefined && tab.count !== null && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums",
                          isActive
                            ? "bg-[var(--brand-primary)] text-white"
                            : "bg-black/[0.06] text-[var(--text-muted)]",
                        )}
                      >
                        {tab.count.toLocaleString("pt-BR")}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}

      {/* Barra de seleção em massa — "selecionar todas" + ações (Encerrar/Reabrir/Cancelar). */}
      {selectionMode && (() => {
        const allDisplayedSelected =
          displayed.length > 0 && displayed.every((c) => selectedIds?.has(c.id))
        const filterTotal =
          typeof totalCount === "number" && totalCount >= 0
            ? totalCount
            : displayed.length
        const hasMoreThanLoaded = filterTotal > displayed.length
        // Oferece "todas do filtro" quando a página está toda marcada e há
        // mais conversas além das carregadas (ou o modo já está ativo).
        const showFilterSelect =
          !!onSelectAllFilterChange && (selectAllFilter || (allDisplayedSelected && hasMoreThanLoaded))
        const selectedLabel = selectAllFilter
          ? `${filterTotal.toLocaleString("pt-BR")} de ${filterTotal.toLocaleString("pt-BR")} selecionada${filterTotal !== 1 ? "s" : ""}`
          : selectedIds?.size
            ? `${selectedIds.size} de ${filterTotal.toLocaleString("pt-BR")} selecionada${selectedIds.size > 1 ? "s" : ""}`
            : `Selecionar todas (${displayed.length})`
        return (
        <div className="@container mb-2.5 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2">
          <div className="flex items-center justify-between gap-2 @max-[520px]:flex-col @max-[520px]:items-stretch">
            <label className="flex min-w-0 items-center gap-2 cursor-pointer">
              <CheckboxGlass
                checked={selectAllFilter || allDisplayedSelected}
                indeterminate={
                  !selectAllFilter &&
                  !!selectedIds?.size &&
                  selectedIds.size < displayed.length &&
                  displayed.some((c) => selectedIds?.has(c.id))
                }
                onChange={() => {
                  onSelectAllChange?.(allDisplayedSelected ? [] : displayed.map((c) => c.id))
                }}
                aria-label="Selecionar todas as conversas"
              />
              <span className="truncate font-display text-[12px] font-semibold text-[var(--text-secondary)]">
                {selectedLabel}
              </span>
            </label>
            {bulkActionsSlot}
          </div>
          {showFilterSelect && (
            <button
              type="button"
              onClick={() => onSelectAllFilterChange?.(!selectAllFilter)}
              className="self-start rounded px-1 text-left font-display text-[12px] font-semibold text-[var(--brand-primary)] hover:underline"
            >
              {selectAllFilter
                ? "Limpar seleção do filtro"
                : `Selecionar todas as ${filterTotal.toLocaleString("pt-BR")} conversas do filtro`}
            </button>
          )}
        </div>
        )
      })()}

      {/* Lista — gutter lateral vem do section (`px-2`, mesmo mx-2 do aside
          direito). Ring do card ativo continua inset. */}
      {/* Scroller NÃO é flex-col: filhos diretos em flex-col + overflow-y
          encolhem (flex-shrink:1) e viram barras cinza. Espelho do DealQueue. */}
      <div
        ref={listScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-0.5 [-webkit-overflow-scrolling:touch]"
      >
        <div className="flex flex-col gap-1.5">
        {isLoading ? (
          <AppLoading variant="inline" className="min-h-[280px]" />
        ) : (
          <>
            {displayed.map((conversation) => {
              const slots = renderCardSlots?.(conversation)
              return (
                <ConversationCard
                  key={conversation.id}
                  conversation={{
                    ...conversation,
                    active: conversation.id === activeConversationId,
                  }}
                  onClick={() => onSelectConversation?.(conversation.id)}
                  assigneeSlot={slots?.assigneeSlot}
                  selectionMode={selectionMode}
                  selected={selectedIds?.has(conversation.id) ?? false}
                  onToggleSelect={() => onToggleSelectOne?.(conversation.id)}
                />
              )
            })}
            {displayed.length === 0 && !isLoadingMore && (
              <div className="px-2 py-6 text-center text-xs text-[var(--text-muted)]">
                Nenhuma conversa encontrada.
              </div>
            )}

            {/* Sentinela do infinite scroll. Fica vazia mas é observada pelo
                IntersectionObserver acima. Quando aparece no viewport, pede
                a próxima página. */}
            {hasMore && (
              <div
                ref={sentinelRef}
                aria-hidden="true"
                className="h-1 w-full shrink-0"
              />
            )}

            {isLoadingMore && (
              <div className="flex shrink-0 items-center justify-center py-3 text-[11.5px] text-[var(--text-muted)]">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
                <span className="ml-2">Carregando mais...</span>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </section>
  )
}
