"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { buildMonthGrid, dateKey, isSameDay, monthPeriodTitle } from "@/lib/tasks-data"

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"] as const

export function MiniCalendar({
  selectedDate,
  onSelectDate,
  markedDates,
}: {
  selectedDate: Date
  onSelectDate: (date: Date) => void
  markedDates?: Set<string>
}) {
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  )

  useEffect(() => {
    setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [selectedDate])

  const today = new Date()
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])

  const goMonth = (delta: number) => {
    setViewMonth(new Date(year, month + delta, 1))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold capitalize text-foreground">
          {monthPeriodTitle(viewMonth)}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => goMonth(-1)}
            className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onSelectDate(today)}
            className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Hoje
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => goMonth(1)}
            className="flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d, i) => (
          <span key={`${d}-${i}`} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((day) => {
          const inMonth = day.getMonth() === month
          const isToday = isSameDay(day, today)
          const isSelected = isSameDay(day, selectedDate)
          const hasTask = markedDates?.has(dateKey(day)) ?? false
          return (
            <button
              key={dateKey(day)}
              type="button"
              onClick={() => onSelectDate(day)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1 text-sm",
                !inMonth && "text-muted-foreground/40",
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full",
                  isToday && "bg-primary font-semibold text-primary-foreground",
                  isSelected && !isToday && "bg-primary/10 font-semibold text-primary",
                  !isToday && !isSelected && inMonth && "text-foreground hover:bg-secondary",
                )}
              >
                {day.getDate()}
              </span>
              <span
                className={cn(
                  "size-1 rounded-full",
                  hasTask ? "bg-primary" : "bg-transparent",
                )}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
