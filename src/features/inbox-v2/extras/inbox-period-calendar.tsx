"use client"

import {
  PeriodCalendarButton,
  PeriodIsoRangePanel,
} from "@/components/crm/period-calendar-button"
import type { InboxFilters } from "@/features/inbox-v2/api/types"

export function isInboxPeriodActive(f: InboxFilters): boolean {
  return Boolean(f.lastMessageFrom || f.lastMessageTo || f.createdFrom || f.createdTo)
}

/**
 * Período do Inbox no ícone canônico do header (fora da pílula Filtrar).
 * Última mensagem → `lastMessageAt` / `lastInboundAt`; criação → `createdAt`.
 */
export function InboxPeriodCalendar({
  filters,
  onChange,
}: {
  filters: InboxFilters
  onChange: (next: InboxFilters) => void
}) {
  return (
    <div data-tour="inbox-period" className="flex shrink-0">
    <PeriodCalendarButton active={isInboxPeriodActive(filters)}>
      <PeriodIsoRangePanel
        from={filters.lastMessageFrom ?? ""}
        to={filters.lastMessageTo ?? ""}
        onChange={({ from, to }) =>
          onChange({
            ...filters,
            lastMessageFrom: from || undefined,
            lastMessageTo: to || undefined,
          })
        }
        rangeLabel="Última mensagem"
        secondary={{
          label: "Criação",
          from: filters.createdFrom ?? "",
          to: filters.createdTo ?? "",
          onChange: ({ from, to }) =>
            onChange({
              ...filters,
              createdFrom: from || undefined,
              createdTo: to || undefined,
            }),
        }}
        allowClear
        onClear={() =>
          onChange({
            ...filters,
            lastMessageFrom: undefined,
            lastMessageTo: undefined,
            createdFrom: undefined,
            createdTo: undefined,
          })
        }
      />
    </PeriodCalendarButton>
    </div>
  )
}
