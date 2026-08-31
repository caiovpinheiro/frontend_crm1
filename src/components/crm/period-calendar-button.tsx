"use client"

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { format, isSameDay, parseISO, startOfDay, subDays } from "date-fns"
import { Calendar } from "lucide-react"

import { DATE_PICKER_PORTAL_SELECTOR, DatePicker } from "@/components/ui/date-picker"
import { cn } from "@/lib/utils"

import type { DateRange } from "@/components/crm/date-range-picker"

export type SystemUsagePreset = "7d" | "30d" | "90d" | "custom"

export interface SystemUsagePeriodValue {
  preset: SystemUsagePreset
  range: DateRange
}

const PRESETS: { id: Exclude<SystemUsagePreset, "custom">; label: string; days: number }[] = [
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "30 dias", days: 30 },
  { id: "90d", label: "90 dias", days: 90 },
]

const DATE_TRIGGER_CLASS =
  "h-9 rounded-xl border-border bg-[var(--dropdown-solid-bg)] text-foreground shadow-none hover:bg-secondary hover:text-foreground"

export function rangeFromDays(days: number): DateRange {
  return {
    from: startOfDay(subDays(new Date(), days - 1)),
    to: startOfDay(new Date()),
  }
}

export function defaultSystemUsagePeriod(): SystemUsagePeriodValue {
  return {
    preset: "30d",
    range: rangeFromDays(30),
  }
}

export function isoRangeFromDays(days: number): { from: string; to: string } {
  const range = rangeFromDays(days)
  return {
    from: range.from ? format(range.from, "yyyy-MM-dd") : "",
    to: range.to ? format(range.to, "yyyy-MM-dd") : "",
  }
}

export function isoToday(): string {
  return format(startOfDay(new Date()), "yyyy-MM-dd")
}

export function detectIsoDaysPreset(
  from: string,
  to: string,
): Exclude<SystemUsagePreset, "custom"> | "custom" | null {
  if (!from && !to) return null
  for (const p of PRESETS) {
    const next = isoRangeFromDays(p.days)
    if (next.from === from && next.to === to) return p.id
  }
  return "custom"
}

function toYmd(d: Date | null | undefined): string {
  if (!d) return ""
  return format(d, "yyyy-MM-dd")
}

function fromYmd(value: string): Date | null {
  if (!value) return null
  const parsed = parseISO(value)
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed)
}

/**
 * Gatilho canônico de período: ícone de calendário fora da barra de Filtrar.
 * O popover (`rounded-2xl`) cai **abaixo** do ícone (`side="bottom"`),
 * ancorado à esquerda do gatilho (`align="start"`) — cresce para a direita.
 * Altura `size-10` casa com a pílula de busca `/settings` (`h-10`).
 * `align="end"` é do hamburger (`PageActionsMenu`), não deste calendário.
 */
export function PeriodCalendarButton({
  active = false,
  align = "start",
  "aria-label": ariaLabel = "Filtrar por período",
  children,
}: {
  active?: boolean
  align?: "start" | "center" | "end"
  "aria-label"?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const updateCoords = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const panel = panelRef.current
    const ch = panel?.offsetHeight ?? 0
    const cw = panel?.offsetWidth ?? 448
    const margin = 8
    const vh = window.innerHeight
    const spaceBelow = vh - r.bottom
    const openUp = ch > 0 && spaceBelow < ch + margin && r.top > spaceBelow
    const top = openUp
      ? Math.max(8, r.top - ch - margin)
      : Math.min(r.bottom + margin, Math.max(8, vh - Math.max(ch, 1) - 8))
    const vw = document.documentElement.clientWidth
    const desiredLeft =
      align === "end"
        ? r.right - cw
        : align === "center"
          ? r.left + r.width / 2 - cw / 2
          : r.left
    const left = Math.min(Math.max(8, desiredLeft), Math.max(8, vw - cw - 8))
    setCoords((prev) =>
      prev && prev.top === top && prev.left === left ? prev : { top, left },
    )
  }, [align])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    updateCoords()
    const raf = requestAnimationFrame(updateCoords)
    const panel = panelRef.current
    const ro = panel ? new ResizeObserver(updateCoords) : null
    if (panel && ro) ro.observe(panel)
    window.addEventListener("resize", updateCoords)
    window.addEventListener("scroll", updateCoords, true)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener("resize", updateCoords)
      window.removeEventListener("scroll", updateCoords, true)
    }
  }, [open, updateCoords])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      const el = t instanceof Element ? t : t.parentElement
      if (el?.closest(DATE_PICKER_PORTAL_SELECTOR)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-pressed={active}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors",
          active || open
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        <Calendar className="size-4" aria-hidden="true" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-labelledby={labelId}
              style={{
                position: "fixed",
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                visibility: coords ? "visible" : "hidden",
              }}
              className="z-(--z-popover) w-[min(100vw-1.5rem,28rem)] overflow-visible rounded-2xl border border-border bg-[var(--dropdown-solid-bg)] p-4 text-foreground shadow-lg opacity-100 backdrop-blur-none"
            >
              <p id={labelId} className="mb-3 text-sm font-semibold text-foreground">
                Período
              </p>
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function PeriodChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
        pressed
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-[color-mix(in_srgb,white_8%,var(--dropdown-solid-bg))] text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function PresetPills({
  activeId,
  onSelect,
  allPeriod,
  showToday,
  onAllPeriod,
  onToday,
}: {
  activeId: SystemUsagePreset | "all" | "today" | null
  onSelect: (id: Exclude<SystemUsagePreset, "custom">, days: number) => void
  allPeriod?: string
  showToday?: boolean
  onAllPeriod?: () => void
  onToday?: () => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {allPeriod ? (
        <PeriodChip pressed={activeId === "all"} onClick={() => onAllPeriod?.()}>
          {allPeriod}
        </PeriodChip>
      ) : null}
      {showToday ? (
        <PeriodChip pressed={activeId === "today"} onClick={() => onToday?.()}>
          Hoje
        </PeriodChip>
      ) : null}
      {PRESETS.map((p) => (
        <PeriodChip key={p.id} pressed={activeId === p.id} onClick={() => onSelect(p.id, p.days)}>
          {p.label}
        </PeriodChip>
      ))}
    </div>
  )
}

function FromToFields({
  from,
  to,
  onFrom,
  onTo,
  label,
}: {
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  label?: string
}) {
  const filled = Boolean(from || to)
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        filled
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-[color-mix(in_srgb,white_8%,var(--dropdown-solid-bg))]",
      )}
    >
      {label ? (
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <DatePicker
          value={from || null}
          onChange={onFrom}
          placeholder="De"
          className="min-w-0"
          triggerClassName={DATE_TRIGGER_CLASS}
        />
        <span className="shrink-0 text-sm text-muted-foreground">até</span>
        <DatePicker
          value={to || null}
          onChange={onTo}
          placeholder="Até"
          className="min-w-0"
          triggerClassName={DATE_TRIGGER_CLASS}
        />
      </div>
    </div>
  )
}

/** Presets 7/30/90 + intervalo customizado (Logs Eventos / Uso do sistema). */
export function PeriodPresetPanel({
  value,
  onChange,
}: {
  value: SystemUsagePeriodValue
  onChange: (v: SystemUsagePeriodValue) => void
}) {
  function setPreset(preset: Exclude<SystemUsagePreset, "custom">, days: number) {
    onChange({ preset, range: rangeFromDays(days) })
  }

  function setCustom(next: DateRange) {
    const matches = PRESETS.find((p) => {
      const r = rangeFromDays(p.days)
      return (
        !!next.from &&
        !!next.to &&
        !!r.from &&
        !!r.to &&
        isSameDay(next.from, r.from) &&
        isSameDay(next.to, r.to)
      )
    })
    onChange({
      preset: matches?.id ?? "custom",
      range: next,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <PresetPills activeId={value.preset} onSelect={setPreset} />
      <FromToFields
        from={toYmd(value.range.from)}
        to={toYmd(value.range.to)}
        onFrom={(v) => setCustom({ from: fromYmd(v), to: value.range.to })}
        onTo={(v) => setCustom({ from: value.range.from, to: fromYmd(v) })}
      />
    </div>
  )
}

type IsoRange = { from: string; to: string }

/** Presets 7/30/90 + de/até em YYYY-MM-DD (Contatos, Empresas, Chamadas). */
export function PeriodIsoRangePanel({
  from,
  to,
  onChange,
  rangeLabel,
  secondary,
  allowClear = false,
  onClear,
  allPeriodLabel,
  showToday = false,
}: {
  from: string
  to: string
  onChange: (next: IsoRange) => void
  rangeLabel?: string
  secondary?: {
    label: string
    from: string
    to: string
    onChange: (next: IsoRange) => void
  }
  allowClear?: boolean
  onClear?: () => void
  /** Preset vazio (ex.: Distribuição — “Todo o período”). */
  allPeriodLabel?: string
  showToday?: boolean
}) {
  const today = isoToday()
  const isAll = !from && !to
  const isToday = from === today && to === today
  const dayPreset = detectIsoDaysPreset(from, to)
  const activeId: SystemUsagePreset | "all" | "today" | null = allPeriodLabel && isAll
    ? "all"
    : showToday && isToday
      ? "today"
      : dayPreset

  return (
    <div className="flex flex-col gap-3">
      <PresetPills
        activeId={activeId}
        onSelect={(_id, days) => onChange(isoRangeFromDays(days))}
        allPeriod={allPeriodLabel}
        showToday={showToday}
        onAllPeriod={() => onChange({ from: "", to: "" })}
        onToday={() => onChange({ from: today, to: today })}
      />
      <FromToFields
        label={rangeLabel}
        from={from}
        to={to}
        onFrom={(v) => onChange({ from: v, to })}
        onTo={(v) => onChange({ from, to: v })}
      />
      {secondary ? (
        <FromToFields
          label={secondary.label}
          from={secondary.from}
          to={secondary.to}
          onFrom={(v) => secondary.onChange({ from: v, to: secondary.to })}
          onTo={(v) => secondary.onChange({ from: secondary.from, to: v })}
        />
      ) : null}
      {allowClear ? (
        <button
          type="button"
          onClick={() => {
            onChange({ from: "", to: "" })
            secondary?.onChange({ from: "", to: "" })
            onClear?.()
          }}
          className="self-start text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Limpar período
        </button>
      ) : null}
    </div>
  )
}

/** Lista de opções nomeadas (ex.: Dashboard — este mês / ontem / personalizado). */
export function PeriodChoiceList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5" role="listbox" aria-label="Período">
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition-colors",
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                selected ? "border-primary" : "border-border",
              )}
            >
              {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
