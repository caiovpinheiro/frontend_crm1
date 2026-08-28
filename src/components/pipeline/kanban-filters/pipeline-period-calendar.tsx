"use client"

import {
  PeriodCalendarButton,
  PeriodIsoRangePanel,
} from "@/components/crm/period-calendar-button"

import {
  isPeriodFilterActive,
  type AdvancedDealFilters,
  type DateRangeValue,
} from "./types"

function isoSide(value: string | null | undefined): string {
  return value ?? ""
}

function rangeFromIso(from: string, to: string): DateRangeValue | undefined {
  if (!from && !to) return undefined
  return { from: from || null, to: to || null }
}

/**
 * Período do funil no ícone canônico do header (Criação + Fechamento).
 * Escreve os mesmos `createdAt` / `closedAt` que a aba Período do modal usava.
 */
export function PipelinePeriodCalendar({
  filters,
  onPatch,
}: {
  filters: AdvancedDealFilters
  onPatch: (partial: Partial<AdvancedDealFilters>) => void
}) {
  const createdFrom = isoSide(filters.createdAt?.from)
  const createdTo = isoSide(filters.createdAt?.to)
  const closedFrom = isoSide(filters.closedAt?.from)
  const closedTo = isoSide(filters.closedAt?.to)
  const active = isPeriodFilterActive(filters)

  return (
    <PeriodCalendarButton active={active}>
      <PeriodIsoRangePanel
        from={createdFrom}
        to={createdTo}
        onChange={({ from, to }) => onPatch({ createdAt: rangeFromIso(from, to) })}
        rangeLabel="Criação"
        secondary={{
          label: "Fechamento",
          from: closedFrom,
          to: closedTo,
          onChange: ({ from, to }) => onPatch({ closedAt: rangeFromIso(from, to) }),
        }}
        allowClear
        onClear={() => onPatch({ createdAt: undefined, closedAt: undefined })}
      />
    </PeriodCalendarButton>
  )
}
