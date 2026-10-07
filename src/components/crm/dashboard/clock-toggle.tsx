"use client";

import { SegmentedToggle } from "@/components/crm/dashboard/segmented-toggle";
import { CLOCK_OPTIONS, type DashboardClock } from "@/features/dashboard-v2/clock-label";

/**
 * Relógio dos tempos (comercial/corrido), global da aba Atendimentos: fica junto
 * do seletor de período, no cabeçalho, e vale para todos os cards que medem tempo.
 */
export function ClockToggle({
  value,
  onChange,
}: {
  value: DashboardClock;
  onChange: (next: DashboardClock) => void;
}) {
  return (
    <div
      className="shrink-0"
      title="Relógio dos tempos: comercial conta só o horário de atendimento; corrido conta as 24h."
    >
      <SegmentedToggle
        label="Relógio dos tempos"
        value={value}
        onChange={onChange}
        options={CLOCK_OPTIONS}
      />
    </div>
  );
}
