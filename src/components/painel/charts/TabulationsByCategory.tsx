'use client';

import { useMemo } from 'react';

import { categoricalColor } from '@/features/dashboard-v2/chart-types';

import { ChartCard, EmptyChart, LegendDot } from './ChartCard';
import { pct } from './theme';
import type { Tabulation } from './types';

type Props = {
  data: Tabulation[];
  limit?: number;
  /**
   * Total real do período. `data` é o ranking truncado pelo backend (top 20),
   * então somá-lo subestima o denominador dos percentuais.
   */
  total?: number;
};

export function TabulationsByCategory({ data, limit = 8, total: totalOverride }: Props) {
  const { total, groups, max } = useMemo(() => {
    const top = [...data].sort((a, b) => b.count - a.count).slice(0, limit);
    const total = totalOverride ?? data.reduce((s, t) => s + t.count, 0);
    const byCat = new Map<string, Tabulation[]>();
    for (const t of top) byCat.set(t.category, [...(byCat.get(t.category) ?? []), t]);
    const catTotals = new Map<string, number>();
    for (const t of data) catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.count);
    const groups = [...byCat.entries()]
      .map(([category, items]) => ({ category, items, total: catTotals.get(category) ?? 0 }))
      .sort((a, b) => b.total - a.total);
    return { total, groups, max: top[0]?.count ?? 1 };
  }, [data, limit, totalOverride]);

  // Cor por posição na paleta do painel; a ordem dos grupos é estável (volume).
  const colorByCategory = new Map(groups.map((g, i) => [g.category, categoricalColor(i)]));
  const colorOf = (c: string) => colorByCategory.get(c) ?? categoricalColor(0);

  if (!groups.length) {
    return (
      <ChartCard title="Principais tabulações">
        <EmptyChart message="Nenhuma tabulação registrada no período." />
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Principais tabulações" subtitle={`${total} tabulações, agrupadas por categoria`}>
      <div className="flex flex-col gap-2">
        <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" role="img"
          aria-label={groups.map((g) => `${g.category} ${pct(g.total, total)}%`).join(', ')}>
          {groups.map((g) => (
            <div key={g.category} style={{ width: `${pct(g.total, total)}%`, background: colorOf(g.category) }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-5">
          {groups.map((g) => (
            <LegendDot key={g.category} color={colorOf(g.category)}
              label={`${g.category} ${g.total} (${pct(g.total, total)}%)`} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.category} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground">{g.category}</h3>
            {g.items.map((t) => (
              <div key={t.reason} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_90px] items-center gap-4">
                <span className="truncate text-sm" title={t.reason}>{t.reason}</span>
                <div className="h-2.5 rounded-full bg-secondary">
                  <div className="h-2.5 rounded-full transition-[width] duration-500"
                    style={{ width: `${(t.count / max) * 100}%`, background: colorOf(g.category) }} />
                </div>
                <span className="text-right text-sm tabular-nums">
                  <strong className="font-semibold">{t.count}</strong>
                  <span className="text-muted-foreground"> ({pct(t.count, total)}%)</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
