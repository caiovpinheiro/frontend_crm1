"use client";

import { PainelCard, PainelEmpty } from "@/components/crm/dashboard/painel-block";
import { StatList } from "@/components/crm/dashboard/stat-list";
import { SystemUsageBars } from "@/components/crm/dashboard/system-usage-bars";
import { formatUsageHours } from "@/features/dashboard-v2/format";
import { usageSummary } from "@/features/dashboard-v2/usage-stats";
import type { SystemUsageAggregateRow } from "@/features/system-usage/types";

/**
 * Sempre em barras. O `chartType` que ficou salvo no layout remoto de quem já
 * escolheu outro estilo é tolerado (lido e ignorado): o seletor de estilo
 * continua nos cards personalizados.
 */
export function SystemUsageCard({ rows }: { rows: SystemUsageAggregateRow[] }) {
  if (rows.length === 0) {
    return (
      <PainelCard title="Uso do sistema hoje" subtitle="Tempo ativo por usuário">
        <PainelEmpty
          embedded
          title="Sem uso hoje"
          description="Nenhuma sessão registrada neste dia."
        />
      </PainelCard>
    );
  }

  const bars = rows.map((row) => ({
    id: row.userId,
    name: row.userName ?? "Usuário",
    seconds: row.totalSeconds,
  }));
  const { total, average, active, atOrAbove } = usageSummary(bars);

  return (
    <PainelCard
      title="Uso do sistema hoje"
      subtitle="Tempo ativo por usuário"
      className="flex flex-col"
    >
      <div data-dashboard-no-drag className="flex flex-col">
        <StatList
          ariaLabel="Totais do uso do sistema"
          items={[
            { label: "Total", value: formatUsageHours(total) },
            { label: "Média por usuário", value: formatUsageHours(average) },
            {
              label: "Usuários ativos",
              value: active,
              hint: `${atOrAbove} na média ou acima`,
            },
          ]}
        />
        <SystemUsageBars rows={bars} average={average} formatValue={formatUsageHours} />
      </div>
    </PainelCard>
  );
}
