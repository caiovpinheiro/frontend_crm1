"use client"

import * as React from "react"
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu"
import { IconCheck, IconChevronDown } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { useModalPortalContainer } from "@/components/ui/modal-portal-context"

export interface DropdownOption {
  value: string
  label: React.ReactNode
  /** Ícone exibido à esquerda do item */
  icon?: React.ReactNode
  /** Texto auxiliar exibido abaixo do label */
  description?: string
  /** Estilo de ação destrutiva */
  danger?: boolean
  disabled?: boolean
  /**
   * Texto usado no filtro quando `searchable`. Se ausente, cai no `label`
   * (quando string), `description` e `value`.
   */
  searchText?: string
  /** Conteúdo à direita do item (ex.: contador), antes do check. */
  trailing?: React.ReactNode
}

/**
 * Gatilho padrão de campos de filtro / segmento
 * (referência: "+ Escolher campo…" em Personalizado do funil).
 *
 * Idle: fundo sólido + contorno leve · Hover/open: primary-soft + texto brand.
 */
export const FILTER_FIELD_TRIGGER_CLASS = cn(
  "group inline-flex h-9 w-full items-center gap-2 rounded-lg px-3",
  "border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] shadow-none",
  "font-display text-[12.5px] font-semibold transition-colors",
  "text-[var(--text-muted)]",
  "hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40",
  "data-[state=open]:bg-[var(--color-primary-soft)] data-[state=open]:text-[var(--brand-primary)] data-[state=open]:ring-2 data-[state=open]:ring-[var(--brand-primary)]/40",
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
)

/** Input de texto/número/data nativo nos painéis de filtro. */
export const FILTER_FIELD_INPUT_CLASS = cn(
  "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] px-3",
  "font-body text-[13px] text-[var(--text-primary)] shadow-none outline-none transition-colors",
  "placeholder:text-[var(--text-muted)]",
  "hover:bg-[var(--color-primary-soft)]",
  "focus:border-[var(--brand-primary)]/40 focus:ring-2 focus:ring-[var(--brand-primary)]/20",
)

/** Painel da lista do dropdown (filtros / segmentos). */
export const FILTER_FIELD_MENU_CLASS = cn(
  "z-50 overflow-hidden rounded-xl border border-[var(--glass-border)] p-1.5",
  "bg-[var(--dropdown-solid-bg,var(--glass-bg-modal,#fff))] shadow-[0_8px_28px_rgba(15,23,42,0.13)]",
  "max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto",
)

/** Item da lista — hover azul como o hambúrguer da Pipeline. */
export const FILTER_FIELD_ITEM_CLASS = cn(
  "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2",
  "font-display text-[13px] font-semibold outline-none transition-colors",
  "text-[var(--text-secondary)]",
  "data-[highlighted]:bg-[var(--color-primary-soft)] data-[highlighted]:text-[var(--brand-primary)]",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
)

type Align = "start" | "center" | "end"
type Side = "top" | "right" | "bottom" | "left"

interface DropdownGlassProps {
  options: DropdownOption[]
  value?: string
  onValueChange?: (value: string) => void
  /** Gatilho customizado (asChild). Quando omitido, usa o gatilho padrão estilo select. */
  trigger?: React.ReactElement
  /** Placeholder do gatilho padrão quando não há valor selecionado */
  placeholder?: string
  align?: Align
  side?: Side
  sideOffset?: number
  /** Largura do painel acompanha a largura do gatilho */
  matchTriggerWidth?: boolean
  /** Rótulo opcional no topo do painel */
  menuLabel?: string
  className?: string
  triggerClassName?: string
  /** Classes adicionais para cada item da lista */
  itemClassName?: string
  disabled?: boolean
  /** Exibe um campo de busca no topo e filtra as opções client-side. */
  searchable?: boolean
  /** Placeholder do campo de busca (quando `searchable`). */
  searchPlaceholder?: string
  /** Nome + detalhe em duas linhas, sem cortar com reticências. */
  wrapLabels?: boolean
}

/**
 * Dropdown / Select do Design System (glass claro).
 *
 * Uso como select:
 *   <DropdownGlass options={opts} value={v} onValueChange={setV} />
 *
 * Uso com gatilho customizado:
 *   <DropdownGlass options={opts} value={v} onValueChange={setV} trigger={<button>...</button>} />
 */
export function DropdownGlass({
  options,
  value,
  onValueChange,
  trigger,
  placeholder = "Selecione",
  align = "start",
  side = "bottom",
  sideOffset = 6,
  matchTriggerWidth = true,
  menuLabel,
  className,
  triggerClassName,
  itemClassName,
  disabled,
  searchable,
  searchPlaceholder,
  wrapLabels,
}: DropdownGlassProps) {
  const selected = options.find((o) => o.value === value)
  // Quando dentro de um <dialog> modal (top-layer), portamos o menu pra dentro
  // dele — senão o conteúdo cai no body, atrás do backdrop, e fica inclicável.
  const portalContainer = useModalPortalContainer()

  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState("")

  const filteredOptions = React.useMemo(() => {
    if (!searchable || !q.trim()) return options
    const needle = q.trim().toLowerCase()
    return options.filter((o) => {
      const base =
        o.searchText ?? (typeof o.label === "string" ? o.label : o.value)
      const hay = `${base ?? ""} ${o.description ?? ""} ${o.value}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [options, q, searchable])

  return (
    <DropdownPrimitive.Root
      modal={false}
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ("")
      }}
    >
      {/*
       * suppressHydrationWarning: o Radix usa useId internamente para
       * o atributo id="radix-..." do trigger. Em árvores onde algo acima
       * (ex.: useSession do NextAuth, queries que resolvem entre SSR e
       * mount) reordena os contadores de useId do React 19, o servidor
       * e o cliente geram IDs diferentes — atributos não-determinísticos
       * são exatamente o caso de uso recomendado p/ suppressHydrationWarning.
       * Nenhum impacto funcional: o ID final é o do cliente.
       */}
      <DropdownPrimitive.Trigger asChild disabled={disabled} suppressHydrationWarning>
        {trigger ?? (
          <button
            type="button"
            suppressHydrationWarning
            className={cn(
              FILTER_FIELD_TRIGGER_CLASS,
              selected && "text-[var(--text-primary)]",
              triggerClassName,
            )}
          >
            {selected?.icon && <span className="shrink-0">{selected.icon}</span>}
            <span
              className={cn(
                "min-w-0 flex-1 text-left",
                wrapLabels ? "whitespace-normal" : "truncate",
              )}
            >
              <span className={wrapLabels ? "block leading-tight" : undefined}>
                {selected?.label ?? placeholder}
              </span>
            </span>
            <IconChevronDown
              size={15}
              className="ml-auto shrink-0 text-current opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </button>
        )}
      </DropdownPrimitive.Trigger>

      <DropdownPrimitive.Portal container={portalContainer ?? undefined}>
        <DropdownPrimitive.Content
          align={align}
          side={side}
          sideOffset={sideOffset}
          className={cn(
            FILTER_FIELD_MENU_CLASS,
            // Largura = gatilho (min+max): evita lista "esticar" além da tela no mobile.
            matchTriggerWidth &&
              "w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[min(100vw-1.5rem,var(--radix-dropdown-menu-trigger-width))]",
            "origin-(--radix-dropdown-menu-content-transform-origin)",
            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
            className,
          )}
        >
          {menuLabel && (
            <DropdownPrimitive.Label className="px-2.5 py-1.5 font-display text-[11px] font-bold text-[var(--text-muted)]">
              {menuLabel}
            </DropdownPrimitive.Label>
          )}
          {searchable && (
            <div className="sticky top-0 z-10 bg-[var(--dropdown-solid-bg,var(--glass-bg-modal,#fff))] p-1 pb-1.5">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                // Deixa Radix cuidar de navegação (setas/enter/esc); as demais
                // teclas ficam no input (senão o typeahead do menu rouba).
                onKeyDown={(e) => {
                  if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key))
                    e.stopPropagation()
                }}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder={searchPlaceholder ?? "Buscar…"}
                className={cn(FILTER_FIELD_INPUT_CLASS, "nodrag nopan")}
              />
            </div>
          )}
          {filteredOptions.length === 0 && (
            <div className="px-2.5 py-3 text-center font-body text-[12px] text-[var(--text-muted)]">
              Nenhum resultado
            </div>
          )}
          {filteredOptions.map((option) => {
            const isSelected = option.value === value
            return (
              <DropdownPrimitive.Item
                key={option.value}
                disabled={option.disabled}
                onSelect={() => onValueChange?.(option.value)}
                className={cn(
                  FILTER_FIELD_ITEM_CLASS,
                  isSelected && "bg-[var(--color-primary-soft)] text-[var(--brand-primary)]",
                  option.danger &&
                    "text-[var(--color-danger)] data-[highlighted]:bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] data-[highlighted]:text-[var(--color-danger)]",
                  itemClassName,
                )}
              >
                {option.icon && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {option.icon}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={wrapLabels ? "whitespace-normal break-words leading-tight" : "truncate"}>
                    {option.label}
                  </span>
                  {option.description && (
                    <span
                      className={cn(
                        "font-body text-[11px] font-normal text-[var(--text-muted)]",
                        wrapLabels ? "mt-0.5 whitespace-normal break-words" : "truncate",
                      )}
                    >
                      {option.description}
                    </span>
                  )}
                </span>
                {option.trailing}
                {isSelected && !option.danger && (
                  <IconCheck size={15} strokeWidth={2.5} className="shrink-0 text-[var(--brand-primary)]" />
                )}
              </DropdownPrimitive.Item>
            )
          })}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  )
}
