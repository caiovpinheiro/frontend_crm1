"use client"

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  IconMessages,
  IconClockBolt,
  IconClock,
  IconCircleCheck,
} from "@tabler/icons-react"
import { StatCard } from "@/components/crm/stat-card"
import { ChartCard } from "@/components/crm/chart-card"
import { HeatmapGrid } from "@/components/crm/heatmap-grid"
import { AvatarGlass } from "@/components/crm/avatar-glass"
import type { DonutDatum, ServiceOverview as ServiceOverviewData } from "@/features/dashboard-v2/api"
import { textMatchesQuery } from "@/features/dashboard-v2/format"

const AVATAR_COLORS: Array<"pink" | "blue" | "teal" | "orange" | "purple" | "coral"> = [
  "pink",
  "blue",
  "teal",
  "orange",
  "purple",
  "coral",
]

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--tooltip-bg)] px-3 py-2 shadow-[var(--glass-shadow)]">
      {label && (
        <p className="mb-1 font-display text-[11px] font-bold text-[var(--tooltip-text)]">{label}</p>
      )}
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="flex items-center gap-1.5 font-body text-[11px] text-[var(--tooltip-text)]">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color || entry.fill }} />
          <span className="capitalize">{entry.name}:</span>
          <span className="font-bold">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

const EMPTY_SUMMARY: ServiceOverviewData["summary"] = {
  total: { value: "0", delta: 0 },
  firstResponse: { value: "—", delta: 0 },
  resolutionTime: { value: "—", delta: 0 },
  resolutionRate: { value: "0%", delta: 0 },
}

export function ServiceDashboardWidget({
  id,
  data,
  search,
}: {
  id: string
  data: ServiceOverviewData
  search: string
}) {
  const summary = data?.summary ?? EMPTY_SUMMARY
  const volumeByDay = data?.volumeByDay ?? []
  const responseTimeSeries = data?.responseTimeSeries ?? []
  const byConnection = (data?.byConnection ?? []).filter((d) =>
    textMatchesQuery(d.name, search),
  )
  const byAttendant = (data?.byAttendant ?? []).filter((d) =>
    textMatchesQuery(d.name, search),
  )
  const byPlatform = data?.byPlatform ?? { rows: [], platforms: [] }
  const heatmap = data?.heatmap ?? { cells: [], xLabels: [], yLabels: [] }
  const attendantRanking = (data?.attendantRanking ?? []).filter(
    (row) =>
      textMatchesQuery(row.name, search) ||
      textMatchesQuery(row.avgResponse, search),
  )

  switch (id) {
    case "kpis":
      return (
    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          icon={<IconMessages size={18} />}
          label="Atendimentos"
          value={summary.total.value}
          delta={summary.total.delta}
          accent="brand"
          caption="no período"
        />
        <StatCard
          icon={<IconClockBolt size={18} />}
          label="1ª resposta"
          value={summary.firstResponse.value}
          delta={summary.firstResponse.delta}
          invertDelta
          accent="success"
          caption="tempo médio"
        />
        <StatCard
          icon={<IconClock size={18} />}
          label="Tempo de resolução"
          value={summary.resolutionTime.value}
          delta={summary.resolutionTime.delta}
          invertDelta
          accent="teal"
          caption="média por ticket"
        />
        <StatCard
          icon={<IconCircleCheck size={18} />}
          label="Taxa de resolução"
          value={summary.resolutionRate.value}
          delta={summary.resolutionRate.delta}
          accent="purple"
          caption="tickets resolvidos"
        />
      </div>
      )
    case "volume":
      return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Volume de mensagens"
          subtitle="Recebidas vs. enviadas por dia da semana"
          legend={[
            { label: "Recebidas", color: "var(--brand-primary)" },
            { label: "Enviadas", color: "#10D8D8" },
          ]}
        >
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeByDay} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={32} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--glass-bg-subtle)" }} />
                <Bar dataKey="recebidas" name="Recebidas" stackId="a" fill="var(--brand-primary)" />
                <Bar dataKey="enviadas" name="Enviadas" stackId="a" fill="#10D8D8" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Tempo de resposta"
          subtitle="Ao longo do dia (minutos)"
          legend={[
            { label: "Resposta", color: "var(--brand-primary)" },
            { label: "1ª resposta", color: "var(--color-lavender)" },
          ]}
        >
          <div className="h-[240px] w-full">
            {responseTimeSeries.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={responseTimeSeries}>
                  <defs>
                    <linearGradient id="grad-resposta" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-primeira" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-lavender)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--color-lavender)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
                  <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="resposta" name="Resposta" stroke="var(--brand-primary)" strokeWidth={2.5} fill="url(#grad-resposta)" />
                  <Area type="monotone" dataKey="primeira" name="1ª resposta" stroke="var(--color-lavender)" strokeWidth={2.5} fill="url(#grad-primeira)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>
      )
    case "heatmap":
      return (
      <ChartCard title="Atendimentos por horário" subtitle="Concentração por hora e dia da semana">
        <HeatmapGrid
          data={heatmap.cells}
          xLabels={heatmap.xLabels}
          yLabels={heatmap.yLabels}
          formatValue={(v) => `${v} msg`}
        />
      </ChartCard>
      )
    case "distribution":
      return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Por conexão" subtitle="Distribuição de atendimentos">
          <DonutChart data={byConnection} />
        </ChartCard>

        <ChartCard title="Por atendente" subtitle="Distribuição de atendimentos">
          <DonutChart data={byAttendant} />
        </ChartCard>

        <ChartCard
          title="Por plataforma"
          subtitle="Volume semanal por canal"
          legend={byPlatform.platforms.map((p) => ({ label: p.label, color: p.color }))}
        >
          <div className="h-[200px] w-full">
            {byPlatform.platforms.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byPlatform.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  {byPlatform.platforms.map((p) => (
                    <Line
                      key={p.key}
                      type="monotone"
                      dataKey={p.key}
                      name={p.label}
                      stroke={p.color}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>
      )
    case "ranking":
      return (
      <ChartCard title="Ranking de atendentes" subtitle="Desempenho no período" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-[var(--glass-border-subtle)]">
                <th className="px-4 py-2.5 text-left font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Atendente</th>
                <th className="px-4 py-2.5 text-right font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Atendimentos</th>
                <th className="px-4 py-2.5 text-right font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Tempo médio</th>
                <th className="px-4 py-2.5 text-right font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Resolução</th>
              </tr>
            </thead>
            <tbody>
              {attendantRanking.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center font-body text-[13px] text-[var(--text-muted)]">
                    Sem atendimentos atribuídos no período.
                  </td>
                </tr>
              ) : (
                attendantRanking.map((row, i) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--glass-border-subtle)] transition-colors last:border-0 hover:bg-[var(--glass-bg-subtle)]"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-4 shrink-0 font-display text-[12px] font-bold text-[var(--text-muted)]">
                          {i + 1}
                        </span>
                        <AvatarGlass initials={initialsOf(row.name)} size="sm" color={AVATAR_COLORS[i % AVATAR_COLORS.length]} />
                        <span className="font-display text-[13px] font-bold text-[var(--text-primary)]">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-display text-[13px] font-bold text-[var(--text-primary)]">
                      {row.attended.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-2.5 text-right font-body text-[13px] text-[var(--text-secondary)]">
                      {row.avgResponse}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[var(--glass-bg-subtle)] sm:block">
                          <span className="block h-full rounded-full bg-[var(--color-success)]" style={{ width: `${row.resolution}%` }} />
                        </span>
                        <span className="font-display text-[13px] font-bold text-[var(--text-primary)]">{row.resolution}%</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>
      )
    default:
      return null
  }
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center font-body text-[13px] text-[var(--text-muted)]">
      Sem dados no período.
    </div>
  )
}

function DonutChart({ data }: { data: DonutDatum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center font-body text-[13px] text-[var(--text-muted)]">
        Sem dados no período.
      </div>
    )
  }
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[18px] font-extrabold leading-none text-[var(--text-primary)]">
            {total.toLocaleString("pt-BR")}
          </span>
          <span className="font-body text-[10px] text-[var(--text-muted)]">total</span>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
              <span className="truncate font-body text-[12px] text-[var(--text-secondary)]">{entry.name}</span>
            </span>
            <span className="shrink-0 font-display text-[12px] font-bold text-[var(--text-primary)]">
              {Math.round((entry.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
