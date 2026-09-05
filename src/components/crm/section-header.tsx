"use client"

import { isValidElement, type ReactNode } from "react"
import { Menu, type LucideIcon } from "lucide-react"

import { PageHeader } from "@/components/crm/page-header"
import { SearchFilterBar } from "@/components/crm/search-filter-bar"
import { pageActionsMenuTriggerClass } from "@/components/crm/page-toolbar"

/**
 * Lucide 1.x icons are forwardRef objects — never `typeof icon === "function"`.
 * Already-rendered nodes (Settings / Inbox) pass through as-is.
 */
function renderHeaderIcon(icon: LucideIcon | ReactNode) {
  if (isValidElement(icon)) return icon
  if (icon == null || typeof icon === "string" || typeof icon === "number") return icon
  const Icon = icon as LucideIcon
  return <Icon size={22} aria-hidden="true" />
}

/**
 * SectionHeader — mesmo DNA de `/settings` (`PageHeader` + pílula `h-10`).
 *
 * Identidade à esquerda; busca + Filtrar + calendário + hamburger `size-12`
 * sempre à direita (`PageHeader` / `PAGE_HEADER_CONTROLS_CLASS`). A pílula
 * tem `h-10` e largura `w-[32rem] max-w-full`. Wrap estreito alinhado ao fim.
 *
 * Busca: `SearchFilterBar` (`h-10 rounded-full`, Filtrar DENTRO da pílula).
 * Período: `PeriodCalendarButton` FORA da pílula, no cluster de ações.
 */
export function SectionHeader({
  icon,
  title,
  back,
  onTitleClick,
  titleAccessory,
  search = true,
  searchPlaceholder = "Pesquisar e filtrar...",
  searchValue,
  onSearchChange,
  searchSlot,
  withFilter = true,
  filterSlot,
  period,
  actions,
  menu = true,
  menuSlot,
  children,
}: {
  icon: LucideIcon | ReactNode
  title: string
  back?: { href: string; label: string }
  onTitleClick?: () => void
  titleAccessory?: ReactNode
  search?: boolean
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchSlot?: ReactNode
  withFilter?: boolean
  filterSlot?: ReactNode
  /** Calendário de período — fora da pílula, antes do hamburger. */
  period?: ReactNode
  actions?: ReactNode
  menu?: boolean
  menuSlot?: ReactNode
  children?: ReactNode
}) {
  const iconNode = renderHeaderIcon(icon)
  void onTitleClick

  const center =
    search
      ? searchSlot ?? (
          <SearchFilterBar
            value={searchValue}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            withFilter={withFilter || Boolean(filterSlot)}
            filterSlot={filterSlot}
          />
        )
      : undefined

  const menuNode = menu
    ? (menuSlot ?? (
        <button type="button" aria-label="Menu" className={pageActionsMenuTriggerClass}>
          <Menu className="size-5" aria-hidden="true" />
        </button>
      ))
    : null

  const actionsNode =
    period || actions || menuNode ? (
      <>
        {period}
        {actions}
        {menuNode}
      </>
    ) : undefined

  return (
    <header className="flex flex-col gap-2">
      <PageHeader
        icon={iconNode}
        title={title}
        back={back}
        titleAccessory={titleAccessory}
        center={center}
        actions={actionsNode}
      />
      {children}
    </header>
  )
}

/**
 * HeaderTabs — variação canônica de navegação por abas dentro do header
 * (usada por Distribuição e Logs). Mantém o mesmo formato de pílula.
 */
export function HeaderTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; badge?: number }[]
  value: T
  onChange: (t: T) => void
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-card p-1">
      {tabs.map(({ key, label, badge }) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {badge !== undefined && (
              <span
                className={`flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

/**
 * HeaderPillToggle — variação canônica de alternância segmentada
 * (usada por Automações/Campanhas e Pipeline). Ícone opcional por opção.
 */
export function HeaderPillToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; icon?: LucideIcon }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center rounded-full border border-border bg-card p-1 shadow-none">
      {options.map(({ key, label, icon: Icon }) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
            {label}
          </button>
        )
      })}
    </div>
  )
}
