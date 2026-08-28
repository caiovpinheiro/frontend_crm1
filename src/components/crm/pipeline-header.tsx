"use client"

import { useState } from "react"
import { Kanban, List, MessagesSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { HeaderPillToggle, SectionHeader } from "@/components/crm/section-header"
import { SearchInput } from "@/components/crm/search-input"
import type { PageHeaderBack } from "@/components/crm/page-header"
import {
  IconClock,
  IconCircleCheck,
  IconCircleX,
  IconGridDots,
} from "@tabler/icons-react"

type TabId = "abertos" | "ganhos" | "perdidos" | "todos"
type ViewType = "kanban" | "flow" | "list"

/**
 * Itens do seletor de visão — mesmo padrão do /contacts
 * (`PageSegmentedControl size="compact"` com ícone + rótulo).
 * Ordem: Kanban · Flow · Lista (Flow ao lado do Kanban).
 */
const VIEW_OPTIONS = [
  { key: "kanban" as const, label: "Kanban", icon: Kanban },
  { key: "flow" as const, label: "Flow", icon: MessagesSquare },
  { key: "list" as const, label: "Lista", icon: List },
]

interface PipelineHeaderProps {
  activeTab?: TabId
  onTabChange?: (tab: TabId) => void
  activeView?: ViewType
  onViewChange?: (view: ViewType) => void
  /**
   * Slot renderizado ao lado do título ("Pipeline") no PageHeader.
   * Usado para o dropdown de troca de funil no padrão Contatos.
   */
  titleAccessory?: React.ReactNode
  /**
   * @deprecated Antes usado na faixa secundária. Preferir `titleAccessory`.
   * Se ainda passado, é renderizado na faixa secundária (compat Settings).
   */
  pipelineNameSlot?: React.ReactNode
  /** Counts dinamicos por aba. Quando undefined, mantem o "14" mock do v0. */
  tabCounts?: Partial<Record<TabId, number>>
  /** Valor da busca. Sem `onSearchChange` a barra padrao nao renderiza. */
  search?: string
  /** Handler da busca padrao (SearchInput). */
  onSearchChange?: (value: string) => void
  /** Placeholder da busca padrao. */
  searchPlaceholder?: string
  /**
   * Substitui a barra de busca padrão por um nó arbitrário — usado no kanban
   * para plugar a `PipelineSearchFilterBar` (busca + filtros segmentados).
   */
  searchSlot?: React.ReactNode
  /**
   * Calendário de período — depois da busca+Filtrar, antes de Kanban/Flow/Lista.
   * Criação e fechamento vivem aqui, não no modal Filtros do funil.
   */
  period?: React.ReactNode
  /**
   * Slot livre à direita das ações, exibido após o toggle Kanban/Lista e
   * antes do botão "+ Novo". Padrão do kanban: hambúrguer azul.
   */
  menuSlot?: React.ReactNode
  /**
   * Substitui toda a faixa de abas de status (Abertos/Ganhos/Perdidos/Todos)
   * por um nó arbitrário. Útil para reutilizar o shell do PipelineHeader em
   * telas que não usam o conceito de status (ex.: /settings/pipeline).
   */
  tabsOverride?: React.ReactNode
  /**
   * Slot para ícone/botão de configurações — renderizado na faixa secundária,
   * após o separador do pipelineNameSlot. Continua disponível para Settings.
   */
  settingsSlot?: React.ReactNode
  /**
   * Quando true, suprime os botões de ação do header (toggle kanban/lista e
   * +Novo). Útil em telas de configuração.
   */
  hideActions?: boolean
  /**
   * Voltar ao hub/pai — chevron à esquerda do título (mesmo padrão de
   * SettingsV2Shell / SETTINGS_HUB_BACK). Usado em /settings/pipeline.
   */
  back?: PageHeaderBack
  /** Handler do botao "Novo". Sem ele o botao fica desabilitado. */
  onNewDeal?: () => void
}

export function PipelineHeader({
  activeTab = "abertos",
  onTabChange,
  activeView = "kanban",
  onViewChange,
  titleAccessory,
  pipelineNameSlot,
  tabCounts,
  search,
  onSearchChange,
  searchPlaceholder = "Buscar por título, contato, CPF, RGM…",
  searchSlot,
  period,
  menuSlot,
  tabsOverride,
  settingsSlot,
  hideActions = false,
  back,
  onNewDeal,
}: PipelineHeaderProps) {
  const [tab, setTab] = useState<TabId>(activeTab)
  const [view, setView] = useState<ViewType>(activeView)

  const handleTabChange = (newTab: TabId) => {
    setTab(newTab)
    onTabChange?.(newTab)
  }

  const handleViewChange = (newView: ViewType) => {
    setView(newView)
    onViewChange?.(newView)
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "abertos", label: "Abertos", icon: <IconClock size={14} />, count: tabCounts?.abertos ?? 14 },
    { id: "ganhos", label: "Ganhos", icon: <IconCircleCheck size={14} />, count: tabCounts?.ganhos },
    { id: "perdidos", label: "Perdidos", icon: <IconCircleX size={14} />, count: tabCounts?.perdidos },
    { id: "todos", label: "Todos", icon: <IconGridDots size={14} />, count: tabCounts?.todos },
  ]

  // `onNewDeal` continua na API por compat; hoje a ação "Novo" vive dentro
  // do hambúrguer (menuSlot), então o botão dedicado foi removido.
  void onNewDeal
  const actionButtons = !hideActions ? (
    <HeaderPillToggle
      options={VIEW_OPTIONS}
      value={view}
      onChange={(v) => handleViewChange(v)}
    />
  ) : null

  // Se tabsOverride não foi fornecido, renderizamos as tabs padrão.
  // Se veio como `<></>` (kanban), tratamos como "sem tabs".
  const overrideProvided = tabsOverride !== undefined
  const overrideEmpty =
    overrideProvided &&
    typeof tabsOverride === "object" &&
    tabsOverride !== null &&
    (tabsOverride as { props?: { children?: unknown } }).props?.children === undefined

  const defaultTabs = (
    <div className="flex shrink-0 items-center gap-0.5">
      {tabs.map((t) => {
        const isActive = tab === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            className={cn(
              "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 bg-transparent px-3.5 py-2 font-display text-[12px] font-bold tracking-[0.04em] transition-all",
              isActive
                ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px font-display text-[10px] font-bold",
                  isActive
                    ? "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                    : "bg-black/[0.06] text-[var(--text-muted)]",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  const secondaryTabs = overrideProvided ? tabsOverride : defaultTabs
  const hasTabs = overrideProvided ? !overrideEmpty : true
  const hasSecondary = Boolean(pipelineNameSlot || settingsSlot || hasTabs)

  const center = searchSlot ??
    (onSearchChange ? (
      <SearchInput
        value={search ?? ""}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
      />
    ) : undefined)

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader
        icon={Kanban}
        title="Pipeline"
        back={back}
        titleAccessory={titleAccessory}
        search={Boolean(center)}
        searchSlot={center}
        period={period}
        actions={actionButtons}
        menu={Boolean(menuSlot)}
        menuSlot={menuSlot}
      />

      {hasSecondary && (
        <div className="toolbar-hscroll flex flex-nowrap items-center gap-2 px-1">
          {pipelineNameSlot && (
            <div className="mr-1.5 flex shrink-0 items-center gap-1.5 border-r border-black/[0.06] pr-2.5">
              {pipelineNameSlot}
              {settingsSlot}
            </div>
          )}
          {secondaryTabs}
        </div>
      )}
    </div>
  )
}
