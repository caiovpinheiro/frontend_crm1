"use client";

import { CategoricalChart } from "@/components/crm/dashboard/categorical-chart";
import { PainelCard, PainelEmpty } from "@/components/crm/dashboard/painel-block";
import {
  DEFAULT_USAGE_CHART_TYPE,
  resolveChartType,
  type DashboardChartType,
} from "@/features/dashboard-v2/chart-types";
import { ChartTypePicker } from "@/features/dashboard-v2/components/chart-type-picker";
import { formatUsageHours } from "@/features/dashboard-v2/format";
import type { SystemUsageAggregateRow } from "@/features/system-usage/types";

export function SystemUsageCard({
  rows,
  chartType = DEFAULT_USAGE_CHART_TYPE,
  onChartTypeChange,
}: {
  rows: SystemUsageAggregateRow[];
  chartType?: DashboardChartType;
  onChartTypeChange?: (next: DashboardChartType) => void;
}) {
  const type = resolveChartType(chartType, DEFAULT_USAGE_CHART_TYPE);

  if (rows.length === 0) {
    return (
      <PainelCard title="Uso do sistema hoje" subtitle="Tempo ativo de todos os usuários">
        <PainelEmpty
          embedded
          title="Sem uso hoje"
          description="Nenhuma sessão registrada neste dia."
        />
      </PainelCard>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.totalSeconds, 0);
  const avg = Math.round(total / rows.length);

  return (
    <PainelCard
      title="Uso do sistema hoje"
      subtitle="Todos os usuários · sem corte"
      className="flex flex-col"
      action={
        <div className="flex items-center gap-3 text-right">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total
            </p>
            <p className="text-sm font-bold tabular-nums">{formatUsageHours(total)}</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Média
            </p>
            <p className="text-sm font-bold tabular-nums">{formatUsageHours(avg)}</p>
          </div>
        </div>
      }
    >
      <div data-dashboard-no-drag className="flex flex-col gap-3">
        <ChartTypePicker value={type} onChange={(next) => onChartTypeChange?.(next)} />
        <CategoricalChart
          type={type}
          rows={rows.map((row) => ({
            id: row.userId,
            name: row.userName ?? "Usuário",
            value: row.totalSeconds,
          }))}
          formatValue={formatUsageHours}
          average={avg}
        />
      </div>
    </PainelCard>
  );
}
