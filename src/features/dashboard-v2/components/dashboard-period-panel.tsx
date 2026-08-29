"use client";

import { format, startOfDay } from "date-fns";

import { PeriodChoiceList } from "@/components/crm/period-calendar-button";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import type { DashboardFiltersState, PeriodKey } from "@/features/dashboard-v2/api";

const NAMED_PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "last_7", label: "Últimos 7 dias" },
  { value: "last_30", label: "Últimos 30 dias" },
  { value: "this_month", label: "Mês atual" },
];

function todayISODate(): string {
  return format(startOfDay(new Date()), "yyyy-MM-dd");
}

export function DashboardPeriodPanel({
  filters,
  onPatch,
}: {
  filters: DashboardFiltersState;
  onPatch: (partial: Partial<DashboardFiltersState>) => void;
}) {
  function handleChoice(value: PeriodKey) {
    if (value === "custom") {
      onPatch({
        period: "custom",
        startDate: filters.startDate ?? todayISODate(),
        endDate: filters.endDate ?? todayISODate(),
      });
      return;
    }
    onPatch({ period: value, startDate: undefined, endDate: undefined });
  }

  return (
    <div className="flex flex-col gap-3">
      <PeriodChoiceList<PeriodKey>
        options={[
          ...NAMED_PERIODS,
          { value: "custom", label: "Personalizado" },
        ]}
        value={filters.period}
        onChange={handleChoice}
      />
      {filters.period === "custom" ? (
        <div
          className={cn(
            "rounded-xl border p-3",
            filters.startDate || filters.endDate
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-card",
          )}
        >
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Intervalo
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <DatePicker
              value={filters.startDate ?? null}
              onChange={(v) => onPatch({ startDate: v || undefined })}
              placeholder="De"
              className="min-w-0"
              triggerClassName="h-9 rounded-xl border-border bg-card text-foreground shadow-none hover:bg-secondary hover:text-foreground"
            />
            <span className="shrink-0 text-sm text-muted-foreground">até</span>
            <DatePicker
              value={filters.endDate ?? null}
              onChange={(v) => onPatch({ endDate: v || undefined })}
              placeholder="Até"
              className="min-w-0"
              triggerClassName="h-9 rounded-xl border-border bg-card text-foreground shadow-none hover:bg-secondary hover:text-foreground"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
