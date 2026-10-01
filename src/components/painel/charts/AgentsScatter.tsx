'use client';

import {
  CartesianGrid, Cell, LabelList, ReferenceArea, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { ChartCard, EmptyChart, LegendDot } from './ChartCard';
import { chartColors, formatMinutes, mean } from './theme';
import type { AgentStat } from './types';

type Quadrant = 'best' | 'fastLow' | 'slowHigh' | 'worst';

const quadrantColor: Record<Quadrant, string> = {
  best: chartColors.status.good.fill,
  fastLow: chartColors.accent,
  slowHigh: chartColors.status.warn.fill,
  worst: chartColors.status.bad.fill,
};

const quadrantLabel: Record<Quadrant, string> = {
  best: 'Alto volume e rápido',
  fastLow: 'Rápido, pouco volume',
  slowHigh: 'Tempo acima da média',
  worst: 'Lento e pouco volume',
};

type Props = {
  data: AgentStat[];
  /** Se passar uma meta (min), a linha horizontal usa ela em vez da média. */
  targetFirstResponseMin?: number;
  height?: number;
};

/** Atendente sem amostra de 1ª resposta não tem eixo Y — fica fora do gráfico. */
type PlottableAgent = AgentStat & { avgFirstResponseMin: number };

export function AgentsScatter({ data, targetFirstResponseMin, height = 380 }: Props) {
  const plottable = data.filter(
    (d): d is PlottableAgent => d.avgFirstResponseMin != null,
  );
  const omitted = data.length - plottable.length;

  const mx = mean(plottable.map((d) => d.finished));
  const my = targetFirstResponseMin ?? mean(plottable.map((d) => d.avgFirstResponseMin));

  const xs = plottable.map((d) => d.finished);
  const ys = plottable.map((d) => d.avgFirstResponseMin);
  const pad = (a: number, b: number) => Math.max((b - a) * 0.15, 2);
  const xDom: [number, number] = [
    Math.max(0, Math.floor(Math.min(...xs) - pad(Math.min(...xs), Math.max(...xs)))),
    Math.ceil(Math.max(...xs) + pad(Math.min(...xs), Math.max(...xs))),
  ];
  const yDom: [number, number] = [
    Math.max(0, Math.floor(Math.min(...ys, my) - pad(Math.min(...ys), Math.max(...ys)))),
    Math.ceil(Math.max(...ys, my) + pad(Math.min(...ys), Math.max(...ys))),
  ];

  const points = plottable.map((d) => {
    const high = d.finished >= mx;
    const fast = d.avgFirstResponseMin <= my;
    const q: Quadrant = high && fast ? 'best' : fast ? 'fastLow' : high ? 'slowHigh' : 'worst';
    return { ...d, q };
  });

  if (!plottable.length) {
    return (
      <ChartCard title="Atendentes: volume e velocidade">
        <EmptyChart message="Nenhum atendimento com 1ª resposta medida no período." />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Atendentes: volume e velocidade"
      subtitle="Tamanho da bolha indica conversas em aberto. Mais rápido fica no topo."
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-4">
            {(Object.keys(quadrantColor) as Quadrant[]).map((q) => (
              <LegendDot key={q} round color={quadrantColor[q]} label={quadrantLabel[q]} />
            ))}
          </div>
          {omitted > 0 && (
            <span>
              {omitted} atendente(s) fora do gráfico por não ter 1ª resposta medida no período.
            </span>
          )}
        </div>
      }
    >
      <div style={{ height }} role="img"
        aria-label={points.map((p) => `${p.name}: ${p.finished} finalizados, ${formatMinutes(p.avgFirstResponseMin)}`).join('; ')}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 96, bottom: 24, left: 8 }}>
            {/* Os tokens `*.bg` do DS não são todos tinta suave, então o
                sombreado dos quadrantes vem da cor cheia com opacidade. */}
            <ReferenceArea x1={mx} x2={xDom[1]} y1={yDom[0]} y2={my} fill={chartColors.status.good.fill} fillOpacity={0.1} ifOverflow="hidden" />
            <ReferenceArea x1={xDom[0]} x2={mx} y1={my} y2={yDom[1]} fill={chartColors.status.bad.fill} fillOpacity={0.1} ifOverflow="hidden" />
            <CartesianGrid stroke={chartColors.grid} />
            <XAxis type="number" dataKey="finished" name="Finalizados" domain={xDom} allowDecimals={false}
              tick={{ fill: chartColors.axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: chartColors.grid }}
              label={{ value: 'Conversas finalizadas', position: 'insideBottom', offset: -14, fill: chartColors.axis, fontSize: 12 }} />
            <YAxis type="number" dataKey="avgFirstResponseMin" name="1ª resposta" domain={yDom} reversed
              tickFormatter={(v: number) => `${v} min`} width={64}
              tick={{ fill: chartColors.axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: chartColors.grid }} />
            <ZAxis type="number" dataKey="open" range={[120, 900]} name="Em aberto" />
            <ReferenceLine x={mx} stroke={chartColors.muted} strokeDasharray="4 4"
              label={{ value: `média ${Math.round(mx)}`, position: 'insideBottomRight', fill: chartColors.axis, fontSize: 11 }} />
            <ReferenceLine y={my} stroke={chartColors.muted} strokeDasharray="4 4"
              label={{ value: targetFirstResponseMin ? `meta ${my} min` : `média ${Math.round(my)} min`, position: 'insideTopRight', fill: chartColors.axis, fontSize: 11 }} />
            <Tooltip cursor={false} content={<AgentTooltip />} />
            <Scatter data={points} isAnimationActive={false}>
              {points.map((p) => (
                <Cell key={p.id} fill={quadrantColor[p.q]} stroke={chartColors.surface} strokeWidth={2} />
              ))}
              <LabelList dataKey="name" position="right" offset={14} style={{ fill: chartColors.text, fontSize: 13, fontWeight: 500 }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function AgentTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: AgentStat }> }) {
  if (!active || !payload?.length) return null;
  const a = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 text-sm font-semibold text-foreground">{a.name}</p>
      <p className="text-muted-foreground">{a.finished} finalizados, {a.open} em aberto</p>
      <p className="text-muted-foreground">1ª resposta: {formatMinutes(a.avgFirstResponseMin)}</p>
      <p className="text-muted-foreground">Duração média: {formatMinutes(a.avgDurationMin)}</p>
    </div>
  );
}
