'use client';

// Exemplo de composição. Na sua tela, cada bloco pode virar um item do stack sortable.
import { AgentsScatter } from './AgentsScatter';
import { ChannelDonut } from './ChannelDonut';
import { DepartmentsTable } from './DepartmentsTable';
import { KpiCards, type Kpi } from './KpiCards';
import { ReasonsVolumeTime } from './ReasonsVolumeTime';
import { TabulationsByCategory } from './TabulationsByCategory';
import { UsersLollipop } from './UsersLollipop';
import { formatMinutes, pct, statusFor } from './theme';
import type {
  AgentStat, ChannelStat, DepartmentStat, ReasonStat, Tabulation, UserTabulationCount,
} from './types';

export type AtendimentosChartsData = {
  tabulations: Tabulation[];
  channels: ChannelStat[];
  departments: DepartmentStat[];
  agents: AgentStat[];
  users: UserTabulationCount[];
  reasons: ReasonStat[];
  /** Total real de tabulações no período (`tabulations` é o top 20). */
  tabulationsTotal?: number;
};

/** Os KPIs só dependem de departamentos e canais. */
export function buildKpis(d: Pick<AtendimentosChartsData, 'departments' | 'channels'>): Kpi[] {
  const finished = d.departments.reduce((s, x) => s + x.finished, 0);
  const open = d.departments.reduce((s, x) => s + x.open, 0);
  const totalCh = d.channels.reduce((s, x) => s + x.count, 0);
  const topCh = [...d.channels].sort((a, b) => b.count - a.count)[0];
  const slowCh = d.channels
    .filter((c): c is ChannelStat & { medianFirstResponseMin: number } =>
      c.medianFirstResponseMin != null)
    .sort((a, b) => b.medianFirstResponseMin - a.medianFirstResponseMin)[0];
  return [
    { label: 'Finalizados', value: String(finished), hint: `em ${d.departments.length} departamentos` },
    { label: 'Em aberto', value: String(open) },
    topCh && { label: 'Canal principal', value: `${pct(topCh.count, totalCh)}%`, hint: `das conversas vêm do ${topCh.channel}` },
    slowCh && {
      label: 'Pior 1ª resposta',
      value: formatMinutes(slowCh.medianFirstResponseMin),
      hint: slowCh.channel,
      status: statusFor('firstResponse', slowCh.medianFirstResponseMin) ?? undefined,
    },
  ].filter(Boolean) as Kpi[];
}

export function AtendimentosCharts({ data }: { data: AtendimentosChartsData }) {
  return (
    <div className="flex flex-col gap-6">
      <KpiCards items={buildKpis(data)} />
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <TabulationsByCategory data={data.tabulations} total={data.tabulationsTotal} />
        <ChannelDonut data={data.channels} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <AgentsScatter data={data.agents} />
        <DepartmentsTable data={data.departments} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <UsersLollipop data={data.users} />
        <ReasonsVolumeTime data={data.reasons} />
      </div>
    </div>
  );
}
