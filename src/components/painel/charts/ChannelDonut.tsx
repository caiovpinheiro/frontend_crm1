'use client';

import { Cell, Label, Pie, PieChart, Tooltip } from 'recharts';

import { categoricalColor } from '@/features/dashboard-v2/chart-types';

import { ChartCard, EmptyChart, LegendDot } from './ChartCard';
import { chartColors, formatMinutes, pct, slaMinutes } from './theme';
import type { ChannelStat } from './types';

export function ChannelDonut({ data }: { data: ChannelStat[] }) {
  const rows = [...data].sort((a, b) => b.count - a.count);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const maxTime = Math.max(
    ...rows.map((r) => r.medianFirstResponseMin ?? 0),
    1,
  );
  const colorAt = (i: number) => categoricalColor(i);

  if (!rows.length) {
    return (
      <ChartCard title="Por canal">
        <EmptyChart message="Nenhuma conversa no período selecionado." />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Por canal"
      subtitle="Participação no volume e mediana de 1ª resposta"
      footer="A barra fina mostra a mediana de 1ª resposta. Vermelho indica canal fora da meta."
    >
      <div className="flex flex-col items-center gap-7 sm:flex-row">
        <PieChart width={170} height={170}>
          <Pie data={rows} dataKey="count" nameKey="channel" innerRadius={58} outerRadius={82}
            startAngle={90} endAngle={-270} paddingAngle={1} stroke="none" isAnimationActive={false}>
            {rows.map((r, i) => <Cell key={r.channel} fill={colorAt(i)} />)}
            <Label position="center" content={() => (
              <text x={85} y={85} textAnchor="middle">
                <tspan x={85} dy="-2" fontSize={28} fontWeight={700} fill={chartColors.text}>{total}</tspan>
                <tspan x={85} dy="20" fontSize={12} fill={chartColors.axis}>conversas</tspan>
              </text>
            )} />
          </Pie>
          <Tooltip formatter={(v, name) => [`${v} (${pct(Number(v), total)}%)`, String(name)]} />
        </PieChart>

        <ul className="flex w-full flex-1 flex-col gap-3.5">
          {rows.map((r, i) => {
            const median = r.medianFirstResponseMin;
            const late = median != null && median > slaMinutes.firstResponse.warn;
            const tColor = late ? chartColors.status.bad.fill : chartColors.muted;
            return (
              <li key={r.channel} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <LegendDot color={colorAt(i)} label={r.channel} />
                  <span className="tabular-nums">
                    <strong className="font-semibold">{r.count}</strong>
                    <span className="text-muted-foreground"> ({pct(r.count, total)}%)</span>
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-1.5 flex-1 rounded-full bg-secondary">
                    <div className="h-1.5 rounded-full"
                      style={{ width: `${((median ?? 0) / maxTime) * 100}%`, background: tColor }} />
                  </div>
                  <span className="w-14 text-right text-xs font-semibold tabular-nums"
                    style={{ color: median == null ? chartColors.axis : tColor }}>
                    {formatMinutes(median)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartCard>
  );
}
