"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import {
  IconClock,
  IconPlus,
  IconChevronDown,
  IconMessages,
  IconInbox,
  IconCornerUpLeft,
  IconCircleCheck,
  IconRobot,
  IconSparkles,
  IconAlertTriangle,
  IconInfoCircle,
  IconRefresh,
  IconPhone,
  IconCheck,
  type Icon as TablerIcon,
} from "@tabler/icons-react"
import {
  INBOX_QUEUE_ITEMS,
  inboxQueueSelectedCount,
  inboxQueueTriggerLabel,
} from "@/features/inbox-v2/inbox-queue-catalog"
import { AppLoading } from "@/components/crm/app-loading"
import { InputGlass } from "./input-glass"
import { type TabItem } from "./tabs-glass"
import { TooltipGlass } from "./tooltip-glass"
import { ConversationCard, type Conversation } from "./conversation-card"
import { CheckboxGlass } from "./checkbox-glass"
import { QueueSection } from "@/features/inbox-v2/extras/queue-section"
import { PageSegmentedControl } from "@/components/crm/page-toolbar"

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
  /** Filas selecionadas (multi). Quando presente, o clique na linha alterna. */
  selectedTabIds?: readonly string[]
  onToggleTab?: (id: string) => void
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
    menuSlot?: React.ReactNode
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
function statusVisual(tab: { id?: string; label?: string } | string | undefined): {
  Icon: TablerIcon
  bg: string
  fg: string
} {
  const id = typeof tab === "string" ? undefined : tab?.id
  const l = (typeof tab === "string" ? tab : tab?.label ?? "").toLowerCase()
  if (id === "todos" || l.includes("todas") || l.includes("todos"))
    return {
      Icon: IconMessages,
      bg: "var(--color-enterprise-bg)",
      fg: "var(--brand-primary)",
    }
  if (id === "entrada" || l === "entrada")
    return {
      Icon: IconInbox,
      bg: "var(--color-info-bg)",
      fg: "var(--color-info)",
    }
  if (id === "esperando" || l.includes("cliente respondeu") || l.includes("aguard"))
    return {
      Icon: IconCornerUpLeft,
      bg: "var(--color-warn-subtle)",
      fg: "var(--color-warning)",
    }
  if (id === "ligar" || l.includes("liga"))
    return {
      Icon: IconPhone,
      bg: "var(--color-success-bg)",
      fg: "var(--color-success)",
    }
  if (id === "respondidas" || l === "em atendimento" || l.includes("respond"))
    return {
      Icon: IconMessages,
      bg: "var(--color-lavender-soft)",
      fg: "var(--color-lavender)",
    }
  if (id === "resolvidos" || l.includes("resolvendo") || l.includes("acompanh"))
    return {
      Icon: IconClock,
      bg: "var(--color-warn-subtle)",
      fg: "var(--color-warning)",
    }
  if (id === "agente_ia" || l.includes("agente"))
    return {
      Icon: IconSparkles,
      bg: "var(--color-chip-violet-soft)",
      fg: "var(--color-chip-violet)",
    }
  if (id === "automacao" || l.includes("automa"))
    return {
      Icon: IconRobot,
      bg: "var(--color-chip-violet-soft)",
      fg: "var(--color-chip-violet)",
    }
  if (id === "finalizados" || l.includes("finaliz") || l.includes("encerr"))
    return {
      Icon: IconCircleCheck,
      bg: "var(--color-success-bg)",
      fg: "var(--color-success)",
    }
  if (id === "erro" || l.includes("erro") || l.includes("error") || l.includes("falha"))
    return {
      Icon: IconAlertTriangle,
      bg: "var(--color-danger-bg)",
      fg: "var(--color-danger)",
    }
  return { Icon: IconClock, bg: "var(--color-lead-bg)", fg: "var(--color-lead)" }
}

type QueueListSection = {
  id: string | null
  label: string | null
  items: Conversation[]
}

/**
 * 0 filas → sem seções (empty state no caller).
 * 1 fila → lista plana (sem header).
 * 2+ filas → uma seção por fila, na ordem do seletor (`selectedIds`).
 */
function groupConversationsByQueue(
  conversations: Conversation[],
  selectedIds: readonly string[],
): QueueListSection[] {
  if (selectedIds.length === 0) return []
  if (selectedIds.length === 1) {
    return [{ id: null, label: null, items: conversations }]
  }

  const buckets = new Map<string, Conversation[]>()
  for (const c of conversations) {
    const key = c.queueTab || "_other"
    const list = buckets.get(key) ?? []
    list.push(c)
    buckets.set(key, list)
  }

  const sections: QueueListSection[] = []
  // Ordem do catálogo (= seletor), não a ordem interna de `INBOX_TAB_IDS`.
  for (const item of INBOX_QUEUE_ITEMS) {
    if (item.id === "todos") continue
    if (!selectedIds.includes(item.id)) continue
    sections.push({
      id: item.id,
      label: item.label,
      items: buckets.get(item.id) ?? [],
    })
  }
  return sections
}

const COLLAPSED_QUEUES_KEY = "inbox:collapsed-queues"
const MULTI_QUEUE_VIEW_KEY = "inbox:multi-queue-view"

type MultiQueueView = "by-queue" | "by-time"

function readCollapsedQueues(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(COLLAPSED_QUEUES_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === "string"))
  } catch {
    return new Set()
  }
}

function writeCollapsedQueues(ids: Set<string>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      COLLAPSED_QUEUES_KEY,
      JSON.stringify([...ids]),
    )
  } catch {
    /* localStorage indisponível */
  }
}

function readMultiQueueView(): MultiQueueView {
  if (typeof window === "undefined") return "by-queue"
  try {
    const raw = window.localStorage.getItem(MULTI_QUEUE_VIEW_KEY)
    if (raw === "by-time" || raw === "by-queue") return raw
  } catch {
    /* localStorage indisponível */
  }
  return "by-queue"
}

function writeMultiQueueView(mode: MultiQueueView) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(MULTI_QUEUE_VIEW_KEY, mode)
  } catch {
    /* localStorage indisponível */
  }
}

/** Mesmo critério de `_v2-client` / `activityTs`: lastMessageAt ?? lastInboundAt. */
function conversationActivityTs(c: Conversation): number {
  return c.lastActivityAt ? Date.parse(c.lastActivityAt) || 0 : 0
}

function sortConversationsOldestFirst(items: Conversation[]): Conversation[] {
  return [...items].sort(
    (a, b) => conversationActivityTs(a) - conversationActivityTs(b),
  )
}

function groupQueueTabs(tabs: ReadonlyArray<TabItem>) {
  const groups: {
    key: string
    label: string | null
    tone: string
    items: Array<{ tab: TabItem; idx: number }>
  }[] = []
  tabs.forEach((tab, idx) => {
    const key = tab.group ?? `__row-${idx}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.items.push({ tab, idx })
      return
    }
    groups.push({
      key,
      label: tab.groupLabel ?? null,
      tone: tab.groupTone ?? "",
      items: [{ tab, idx }],
    })
  })
  return groups
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
  selectedTabIds,
  onToggleTab,
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
  // Sentinela no fim da lista. Callback via ref para o observer
  // não remountar a cada render (onLoadMore inline + sentinela
  // visível = cascata de páginas). Pausa enquanto carrega.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  useEffect(() => {
    if (!scrollToTopKey) return
    listScrollRef.current?.scrollTo({ top: 0 })
  }, [scrollToTopKey])
  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onLoadMoreRef.current?.()
        }
      },
      { root: listScrollRef.current, rootMargin: "80px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, isLoading, isLoadingMore])

  // Seções recolhidas (2+ filas). Default = todas expandidas.
  // Toggle só por seção; persistido como as demais prefs do inbox.
  const [collapsedQueues, setCollapsedQueues] = useState<Set<string>>(
    () => new Set(),
  )
  // Visão multi-fila: seções (default) vs lista plana cronológica.
  // Só afeta apresentação — não refetch.
  const [multiQueueView, setMultiQueueView] = useState<MultiQueueView>("by-queue")
  useEffect(() => {
    setCollapsedQueues(readCollapsedQueues())
    setMultiQueueView(readMultiQueueView())
  }, [])
  const persistCollapsed = (next: Set<string>) => {
    setCollapsedQueues(next)
    writeCollapsedQueues(next)
  }
  const toggleQueueCollapsed = (queueId: string) => {
    const next = new Set(collapsedQueues)
    if (next.has(queueId)) next.delete(queueId)
    else next.add(queueId)
    persistCollapsed(next)
  }
  const setAndPersistMultiQueueView = (mode: MultiQueueView) => {
    setMultiQueueView(mode)
    writeMultiQueueView(mode)
  }

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

  const selectedQueueIds = selectedTabIds ?? (tabs[activeTab]?.id ? [tabs[activeTab]!.id!] : [])
  const selectedItems = tabs.filter((t) => t.id && selectedQueueIds.includes(t.id))
  const isMulti = selectedQueueIds.length > 1
  const noQueuesSelected = selectedQueueIds.length === 0
  // 2+ filas: "Por fila" = seções; "Por tempo" = lista plana (mais antigas primeiro).
  // 0–1 fila: lista plana na ordem já carregada (toggle oculto).
  const useQueueSections = isMulti && multiQueueView === "by-queue"
  const queueSections = useQueueSections
    ? groupConversationsByQueue(displayed, selectedQueueIds)
    : [
        {
          id: null,
          label: null,
          items:
            isMulti && multiQueueView === "by-time"
              ? sortConversationsOldestFirst(displayed)
              : displayed,
        },
      ]
  const currentTab = selectedItems[0] ?? tabs[activeTab]
  const queueCounts: Record<string, number> = {}
  for (const t of tabs) {
    if (t.id && typeof t.count === "number") queueCounts[t.id] = t.count
  }
  const currentTabLabel = inboxQueueTriggerLabel(
    selectedQueueIds,
    INBOX_QUEUE_ITEMS,
  )
  const selectedQueueSum = inboxQueueSelectedCount(selectedQueueIds, queueCounts)
  // 1 fila: badge daquela fila. 2+: "N Filas" + soma das parcelas — nunca list.total.
  const currentTabCount = selectedQueueSum
  const currentVisual = isMulti
    ? { Icon: IconMessages, bg: "var(--color-enterprise-bg)", fg: "var(--brand-primary)" }
    : statusVisual(currentTab)
  const triggerTitle = isMulti
    ? selectedItems.map((t) => t.label).join(", ")
    : (currentTab?.title ?? currentTab?.label)

  // ── Dropdown de status ──────────────────────────────────────────
  const dropdownBtnRef = useRef<HTMLButtonElement>(null)
  const dropdownMenuRef = useRef<HTMLDivElement>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const el = dropdownBtnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const top = r.bottom + 6
    const width = Math.max(r.width, 400)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    setDropdownPos({
      top,
      left,
      width,
      maxHeight: Math.max(220, window.innerHeight - top - 12),
    })
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (el?.contains(target)) return
      if (dropdownMenuRef.current?.contains(target)) return
      if (
        target instanceof Element &&
        target.closest(".driver-overlay, .driver-popover")
      ) {
        return
      }
      setDropdownOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false)
    }
    // capture: o menu é portal em document.body — stopPropagation no React
    // não impede o listener nativo e o painel fechava no 1º clique.
    document.addEventListener("mousedown", onDocClick, true)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick, true)
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

      {/* Esquerda: Filas + visão; direita: refresh + mais. Toggle cola no seletor. */}
      <div className="mb-2 flex flex-wrap items-center gap-2 @max-[240px]:gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <div
            data-tour="inbox-queues"
            className="min-w-0 max-w-[min(100%,16rem)] shrink"
          >
            <button
              ref={dropdownBtnRef}
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              title={triggerTitle}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              className="flex h-10 min-w-0 w-full items-center gap-2.5 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-2 pr-3 text-left shadow-[0_2px_10px_rgba(100,130,180,0.12)] backdrop-blur-sm transition-shadow hover:shadow-[0_3px_14px_rgba(100,130,180,0.20)] @max-[240px]:gap-1.5 @max-[240px]:pr-2"
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
          </div>
          {isMulti ? (
            <PageSegmentedControl
              aria-label="Visão das filas selecionadas"
              size="compact"
              value={multiQueueView}
              onChange={(v) => setAndPersistMultiQueueView(v as MultiQueueView)}
              items={[
                { value: "by-queue", label: "Por fila" },
                { value: "by-time", label: "Por tempo" },
              ]}
              className="shrink-0"
            />
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 @max-[240px]:gap-1">
          {onRefresh ? (
            <TooltipGlass label="Atualizar fila" side="bottom">
              <button
                type="button"
                aria-label="Atualizar fila"
                onClick={() => onRefresh()}
                disabled={isRefreshing}
                data-tour="inbox-refresh"
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
      </div>

      {dropdownOpen &&
        dropdownPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownMenuRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Filas da caixa de entrada"
            className="fixed z-(--z-above) flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[0_12px_32px_rgba(15,23,42,0.18)] backdrop-blur-xl"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              maxHeight: dropdownPos.maxHeight,
              isolation: "isolate",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--glass-border-subtle)] px-3 py-1.5">
              <span className="font-display text-[13px] font-semibold text-[var(--text-primary)]">
                Caixa de entrada
              </span>
              <IconChevronDown size={15} className="rotate-180 text-[var(--text-muted)]" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-0.5">
              {groupQueueTabs(tabs).map((group) => (
                <div
                  key={group.key}
                  {...(group.key !== "__row-0"
                    ? { "data-tour": `inbox-queue-group-${group.key}` }
                    : {})}
                  className="mb-0.5 last:mb-0"
                >
                  {group.label ? (
                    <p
                      className={cn(
                        "px-2 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider",
                        group.tone || "text-[var(--text-muted)]",
                      )}
                    >
                      {group.label}
                    </p>
                  ) : null}
                  {group.items.map(({ tab, idx }) => {
                    const tabId = tab.id
                    const isActive = tabId
                      ? selectedQueueIds.includes(tabId)
                      : activeTab === idx
                    const v = statusVisual(tab)
                    return (
                      <button
                        key={`${tab.id ?? tab.label}-${idx}`}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        title={tab.title ?? tab.description}
                        {...(tab.id === "todos" ? { "data-tour": "inbox-queue-todos" } : {})}
                        onClick={() => {
                          if (tabId && onToggleTab) {
                            onToggleTab(tabId)
                            if (tabId === "todos") setDropdownOpen(false)
                            return
                          }
                          handleTabChange(idx)
                          setDropdownOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1 text-left transition-colors",
                          isActive
                            ? "bg-[var(--color-info-bg)]"
                            : "hover:bg-[var(--glass-bg-strong)]",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-[18px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border",
                            isActive
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-transparent",
                          )}
                        >
                          <IconCheck size={13} stroke={3} />
                        </span>
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-full"
                          style={{ background: v.bg, color: v.fg }}
                        >
                          <v.Icon size={14} stroke={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate font-display text-[13px] font-semibold leading-tight",
                              isActive
                                ? "text-[var(--color-info)]"
                                : "text-[var(--text-primary)]",
                            )}
                          >
                            {tab.label}
                          </span>
                          {tab.description ? (
                            <span className="block truncate font-body text-[11px] leading-snug text-[var(--text-muted)]">
                              {tab.description}
                            </span>
                          ) : null}
                        </span>
                        {tab.count !== undefined && tab.count !== null ? (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums",
                              isActive
                                ? "bg-[var(--color-info)] text-[var(--color-info-foreground)]"
                                : "bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]",
                            )}
                          >
                            {tab.count.toLocaleString("pt-BR")}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
            <p className="flex shrink-0 items-start gap-1.5 border-t border-[var(--glass-border-subtle)] px-3 py-2 font-body text-[11px] leading-snug text-[var(--text-muted)]">
              <IconInfoCircle size={13} className="mt-px shrink-0" />
              <span>Marque várias filas para ver juntas. Contagens por fila.</span>
            </p>
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
        data-tour="inbox-list"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-0.5 [-webkit-overflow-scrolling:touch]"
      >
        <div className="flex min-h-full flex-col gap-1.5">
        {isLoading ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : noQueuesSelected ? (
          <div className="px-2 py-6 text-center text-xs text-[var(--text-muted)]">
            Selecione ao menos uma fila para ver as conversas
          </div>
        ) : (
          <>
            {queueSections.map((section) => {
              const renderCards = (items: Conversation[]) =>
                items.map((conversation) => {
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
                      menuSlot={slots?.menuSlot}
                      selectionMode={selectionMode}
                      selected={selectedIds?.has(conversation.id) ?? false}
                      onToggleSelect={() => onToggleSelectOne?.(conversation.id)}
                    />
                  )
                })

              if (!section.id || !section.label) {
                return (
                  <div key="flat" className="flex flex-col gap-1.5">
                    {renderCards(section.items)}
                  </div>
                )
              }

              const visual = statusVisual({ id: section.id, label: section.label })
              const collapsed = collapsedQueues.has(section.id)
              return (
                <QueueSection
                  key={section.id}
                  id={section.id}
                  label={section.label}
                  count={section.items.length}
                  collapsed={collapsed}
                  onToggle={() => toggleQueueCollapsed(section.id!)}
                  Icon={visual.Icon}
                  iconBg={visual.bg}
                  iconFg={visual.fg}
                >
                  {renderCards(section.items)}
                </QueueSection>
              )
            })}
            {displayed.length === 0 && !isLoadingMore && (!isMulti || multiQueueView === "by-time") && (
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
