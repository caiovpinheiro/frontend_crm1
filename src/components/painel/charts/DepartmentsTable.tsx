'use client';

import { useMemo, useState } from 'react';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';
import { ChartCard, EmptyChart, LegendDot } from './ChartCard';
import { chartColors, formatMinutes, noSampleStyle, statusFor, type SlaKey } from './theme';
import type { DepartmentStat } from './types';

type SortKey = 'finished' | 'open' | 'avgFirstResponseMin' | 'avgStartMin' | 'avgDurationMin';

const columns: Array<{ key: SortKey; label: string; sla?: SlaKey; width: string }> = [
  { key: 'finished', label: 'Finalizados', width: 'w-44' },
  { key: 'open', label: 'Em aberto', width: 'w-20' },
  { key: 'avgFirstResponseMin', label: '1ª resp.', sla: 'firstResponse', width: 'w-24' },
  { key: 'avgStartMin', label: 'Início', sla: 'start', width: 'w-20' },
  { key: 'avgDurationMin', label: 'Duração', sla: 'duration', width: 'w-24' },
];

export function DepartmentsTable({ data, title = 'Departamentos' }: { data: DepartmentStat[]; title?: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'finished', dir: 'desc' });
  const rows = useMemo(() => {
    // Linha sem amostra vai sempre para o fim, independente da direção.
    const compare = (a: DepartmentStat, b: DepartmentStat) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sort.dir === 'asc' ? av - bv : bv - av;
    };
    return [...data].sort(compare);
  }, [data, sort]);
  const maxFinished = Math.max(...data.map((d) => d.finished), 1);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  if (!rows.length) {
    return (
      <ChartCard title={title}>
        <EmptyChart message="Nenhum atendimento no período selecionado." />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={title}
      subtitle="Finalizados, em aberto e tempos médios no período"
      footer={
        <div className="flex flex-wrap gap-4">
          <LegendDot color={chartColors.status.good.fill} label="Dentro da meta" />
          <LegendDot color={chartColors.status.warn.fill} label="Atenção" />
          <LegendDot color={chartColors.status.bad.fill} label="Fora da meta" />
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="border-b border-border py-2 text-left font-medium">Nome</th>
              {columns.map((c) => {
                const active = sort.key === c.key;
                const Icon = !active ? IconSelector : sort.dir === 'asc' ? IconChevronUp : IconChevronDown;
                return (
                  <th key={c.key} scope="col" className={`border-b border-border py-2 font-medium ${c.width} ${c.key === 'finished' ? 'text-left' : 'text-right'}`}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => toggle(c.key)}
                      className={`inline-flex items-center gap-1 rounded px-1 py-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary ${active ? 'text-primary' : ''}`}>
                      {c.label}
                      <Icon size={12} strokeWidth={2.5} className="shrink-0" aria-hidden />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0">
                <th scope="row" className="max-w-[180px] truncate py-3.5 text-left font-semibold" title={d.name}>{d.name}</th>
                <td className="py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-2 w-28 rounded-full bg-secondary">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${(d.finished / maxFinished) * 100}%` }} />
                    </div>
                    <span className="font-semibold">{d.finished}</span>
                  </div>
                </td>
                <td className="py-3.5 text-right">{d.open}</td>
                {columns.filter((c) => c.sla).map((c) => {
                  const status = statusFor(c.sla!, d[c.key]);
                  const s = status ? chartColors.status[status] : noSampleStyle;
                  return (
                    <td key={c.key} className="py-3.5 text-right">
                      <span className="inline-block rounded-full px-2.5 py-1 font-semibold" style={{ background: s.bg, color: s.fg }}>
                        {formatMinutes(d[c.key])}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
