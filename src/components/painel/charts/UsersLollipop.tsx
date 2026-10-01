'use client';

import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ChartCard, EmptyChart, LegendDot } from './ChartCard';
import { chartColors, mean } from './theme';
import type { UserTabulationCount } from './types';

type ShapeProps = { x?: number; y?: number; width?: number; height?: number; fill?: string };

/** Haste fina + ponto na ponta, no lugar da barra cheia. */
function Lollipop({ x = 0, y = 0, width = 0, height = 0, fill }: ShapeProps) {
  const cy = y + height / 2;
  return (
    <g>
      <line x1={x} x2={x + width} y1={cy} y2={cy} stroke={fill} strokeWidth={2} strokeLinecap="round" />
      <circle cx={x + width} cy={cy} r={6} fill={fill} stroke={chartColors.surface} strokeWidth={2} />
    </g>
  );
}

export function UsersLollipop({ data }: { data: UserTabulationCount[] }) {
  const rows = [...data].sort((a, b) => b.count - a.count);
  const avg = mean(rows.map((r) => r.count));
  const max = Math.max(...rows.map((r) => r.count), 1);
  const rowH = 30;

  if (!rows.length) {
    return (
      <ChartCard title="Tabulações por usuário">
        <EmptyChart message="Nenhuma tabulação registrada no período." />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Tabulações por usuário"
      subtitle="Quantas tabulações cada pessoa registrou (diferente de conversas finalizadas)"
      footer={
        <div className="flex flex-wrap gap-4">
          <LegendDot round color={chartColors.accent} label={`Na média ou acima (${avg.toFixed(1).replace('.', ',')})`} />
          <LegendDot round color={chartColors.muted} label="Abaixo da média" />
        </div>
      }
    >
      <div style={{ height: rows.length * rowH + 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={0}>
            <XAxis type="number" hide domain={[0, max * 1.05]} />
            <YAxis type="category" dataKey="name" width={140} tickLine={false} axisLine={false}
              tick={{ fill: chartColors.text, fontSize: 14 }} interval={0} />
            <ReferenceLine x={avg} stroke={chartColors.grid} strokeDasharray="3 3" />
            <Bar dataKey="count" shape={<Lollipop />} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.id} fill={r.count >= avg ? chartColors.accent : chartColors.muted} />
              ))}
              <LabelList dataKey="count" position="right" offset={14}
                style={{ fill: chartColors.text, fontSize: 13, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
