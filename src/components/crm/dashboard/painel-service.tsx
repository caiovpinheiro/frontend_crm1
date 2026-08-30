"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Hourglass,
  Inbox,
  MessageCircle,
  MessageSquare,
  Timer,
  UserMinus,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { HeatmapGrid } from "@/components/crm/heatmap-grid";
import { KpiCard } from "@/components/crm/kpi-card";
import {
  LIST_CARD_HEAD_CLASS,
  LIST_CARD_ROW_CLASS,
  LIST_CARD_STACK_CLASS,
  ListColumnLabel,
  SortableHeader,
} from "@/components/crm/sortable-header";
import {
  PainelAgoraSkeleton,
  PainelBlockError,
  PainelCard,
  PainelEmpty,
  PainelSkeleton,
} from "@/components/crm/dashboard/painel-block";
import {
  formatDurationMs,
  formatNumber,
  textMatchesQuery,
} from "@/features/dashboard-v2/format";
import type {
  PainelAgora,
  PainelAttendantRow,
  PainelBlock,
  PainelConnectionBlock,
  PainelDelta,
  PainelDeptTableRow,
  PainelSeriesMeta,
  PainelServiceResult,
  PainelTimeStat,
} from "@/features/dashboard-v2/painel-api";
import type { ServiceWidgetId } from "@/features/dashboard-v2/use-dashboard-widget-order";
import { cn } from "@/lib/utils";

function blockPending<T>(block: PainelBlock<T> | undefined): boolean {
  return !block || (block.ok === false && block.error === "omitido");
}

function deltaHint(delta: PainelDelta | undefined) {
  if (!delta || delta.hidden) return undefined;
  const sign = delta.value > 0 ? "+" : "";
  return `${sign}${delta.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatAsOf(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function PainelAgoraWidget({
  data,
  error,
  onRetry,
}: {
  data: PainelAgora | undefined;
  error: unknown;
  onRetry: () => void;
}) {
  if (error && !data) {
    const message = error instanceof Error ? error.message : "Erro ao carregar Agora.";
    return <PainelBlockError message={message} onRetry={onRetry} />;
  }
  if (!data) return <PainelAgoraSkeleton />;

  const wait = data.longestWait;
  return (
    <PainelCard
      title="Agora"
      subtitle={`agora · atualizado às ${formatAsOf(data.asOf)}`}
    >
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-6">
        <KpiCard
          icon={<Inbox className="size-5" />}
          label="Aguardando resposta"
          value={formatNumber(data.awaitingReply)}
          tone="orange"
        />
        <KpiCard
          icon={<MessageSquare className="size-5" />}
          label="Em atendimento"
          value={formatNumber(data.inService)}
          tone="brand"
        />
        <div
          className={cn(
            "rounded-xl border p-4 lg:col-span-3",
            wait.overSla
              ? "border-destructive/40 bg-destructive/5"
              : "border-border bg-card",
          )}
        >
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">
            Maior espera atual
          </p>
          <p
            className={cn(
              "mt-1 text-4xl font-bold tabular-nums tracking-tight",
              wait.overSla ? "text-destructive" : "text-foreground",
            )}
          >
            {wait.ms > 0 ? formatDurationMs(wait.ms) : "—"}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {wait.contactName ?? "Ninguém aguardando"}
            {wait.agentName ? ` · ${wait.agentName}` : ""}
          </p>
        </div>
        <KpiCard
          icon={<Users className="size-5" />}
          label="Atendentes disponíveis"
          value={`${data.agents.online}/${data.agents.total}`}
          hint="online / total"
          tone="success"
        />
      </div>
    </PainelCard>
  );
}

export function PainelServiceWidget({
  id,
  data,
  search,
  clock,
  onClock,
  onRetry,
}: {
  id: Exclude<ServiceWidgetId, "agora">;
  data: PainelServiceResult | undefined;
  search: string;
  clock: "business" | "elapsed";
  onClock: (next: "business" | "elapsed") => void;
  onRetry: (section: string) => void;
}) {
  if (!data) return <PainelSkeleton className="min-h-48" />;

  switch (id) {
    case "volume":
      return <ServiceVolume block={data.volume} onRetry={() => onRetry("volume")} />;
    case "heatmap":
      return (
        <ServiceDeptAndHour
          heatmap={data.heatmap}
          byDepartment={data.byDepartment}
          onRetryHeatmap={() => onRetry("heatmap")}
          onRetryDept={() => onRetry("byDepartment")}
        />
      );
    case "tempo":
      return (
        <ServiceTempo
          block={data.tempo}
          clock={clock}
          onClock={onClock}
          onRetry={() => onRetry("tempo")}
        />
      );
    case "summaries":
      return (
        <ServiceSummaries
          dept={data.byDepartment}
          attendants={data.attendants}
          search={search}
          onRetryDept={() => onRetry("byDepartment")}
          onRetryAttendants={() => onRetry("attendants")}
        />
      );
    case "connections":
      return (
        <ServiceConnections block={data.connections} onRetry={() => onRetry("connections")} />
      );
    case "attendants":
      return (
        <ServiceTables
          dept={data.byDepartment}
          attendants={data.attendants}
          search={search}
          onRetryDept={() => onRetry("byDepartment")}
          onRetryAttendants={() => onRetry("attendants")}
        />
      );
    case "channels":
      return (
        <ServiceChannels
          block={data.channels}
          search={search}
          onRetry={() => onRetry("channels")}
        />
      );
    case "exceptions":
      return (
        <ServiceExceptions block={data.exceptions} onRetry={() => onRetry("exceptions")} />
      );
  }
}

function ServiceVolume({
  block,
  onRetry,
}: {
  block: PainelServiceResult["volume"];
  onRetry: () => void;
}) {
  if (blockPending(block)) return <PainelSkeleton className="min-h-48" />;
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const v = block.data;
  if (v.empty) {
    return (
      <PainelCard title="Volume" subtitle="Conversas do período">
        <PainelEmpty
          embedded
          title="Não há dados no período"
          description="Nenhuma conversa neste recorte. Amplie o período."
        />
      </PainelCard>
    );
  }
  const chartData = v.byDay.map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <KpiCard
          icon={<Inbox className="size-5" />}
          label="Total de atendimentos"
          badge="período"
          value={formatNumber(v.started.value)}
          hint={deltaHint(v.started.delta)}
          tone="brand"
        />
        <KpiCard
          icon={<CheckCircle2 className="size-5" />}
          label="Atendimentos finalizados"
          badge="período"
          value={formatNumber(v.finished.value)}
          hint={deltaHint(v.finished.delta)}
          tone="success"
        />
        <KpiCard
          icon={<MessageCircle className="size-5" />}
          label="Em aberto — Iniciados"
          badge="período"
          value={formatNumber(v.openStarted.value)}
          hint={deltaHint(v.openStarted.delta)}
          tone="violet"
        />
        <KpiCard
          icon={<Hourglass className="size-5" />}
          label="Em aberto — Aguardando"
          badge="período"
          value={formatNumber(v.openWaiting.value)}
          hint={deltaHint(v.openWaiting.delta)}
          tone="orange"
        />
      </div>
      <PainelCard
        title="Iniciadas vs finalizadas"
        subtitle={
          v.messagesIn > 0 || v.messagesOut > 0
            ? `Barras por dia · ${formatNumber(v.messagesIn)} msgs in · ${formatNumber(v.messagesOut)} out`
            : "Barras por dia"
        }
        info="Acúmulo aparece quando iniciadas superam finalizadas por vários dias. Mensagens e volume respeitam o calendário — diferente do bloco Agora."
      >
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              <Bar dataKey="started" name="Iniciadas" fill="var(--color-primary)" radius={[4, 4, 0, 0]}>
                {chartData.map((d) => (
                  <Cell
                    key={d.date}
                    fill="var(--color-primary)"
                    fillOpacity={d.incomplete ? 0.45 : 1}
                  />
                ))}
              </Bar>
              <Bar dataKey="finished" name="Finalizadas" fill="var(--color-success)" radius={[4, 4, 0, 0]}>
                {chartData.map((d) => (
                  <Cell
                    key={`${d.date}-f`}
                    fill="var(--color-success)"
                    fillOpacity={d.incomplete ? 0.45 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {chartData.some((d) => d.incomplete) ? (
          <p className="mt-2 text-xs text-muted-foreground">O dia de hoje está incompleto.</p>
        ) : null}
      </PainelCard>
    </div>
  );
}

function TimeKpi({
  label,
  icon,
  stat,
}: {
  label: string;
  icon: ReactNode;
  stat: PainelTimeStat;
}) {
  return (
    <KpiCard
      icon={icon}
      label={label}
      value={formatDurationMs(stat.medianMs)}
      hint={stat.sample ? `média ${formatDurationMs(stat.meanMs)}` : undefined}
      tone="brand"
    />
  );
}

function ServiceTempo({
  block,
  clock,
  onClock,
  onRetry,
}: {
  block: PainelServiceResult["tempo"];
  clock: "business" | "elapsed";
  onClock: (next: "business" | "elapsed") => void;
  onRetry: () => void;
}) {
  if (blockPending(block)) return <PainelSkeleton className="min-h-48" />;
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const t = block.data;
  return (
    <PainelCard
      title="Tempo de resposta"
      subtitle="Mediana em destaque · média ao lado. Primeira resposta = até a primeira mensagem humana."
      action={
        <div className="flex rounded-xl border border-border bg-card p-0.5 text-xs">
          <button
            type="button"
            className={cn(
              "rounded-lg px-2.5 py-1",
              clock === "business"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => onClock("business")}
          >
            Comercial
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg px-2.5 py-1",
              clock === "elapsed"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => onClock("elapsed")}
          >
            Corrido
          </button>
        </div>
      }
    >
      {t.empty ? (
        <PainelEmpty
          embedded
          title="Não há dados no período"
          description="Nenhuma resposta humana neste recorte."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <TimeKpi
              label="Primeira resposta"
              icon={<Timer className="size-5" />}
              stat={t.firstResponse}
            />
            <TimeKpi
              label="Resposta subsequente"
              icon={<Clock className="size-5" />}
              stat={t.subsequent}
            />
            <TimeKpi
              label="Até finalização"
              icon={<Hourglass className="size-5" />}
              stat={t.untilClose}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MsDayChart
              title="Tempo de resposta"
              subtitle="Tempo médio das respostas dentro do período"
              points={t.responseByDay}
              color="var(--color-primary)"
            />
            <MsDayChart
              title="Tempo para iniciar atendimento"
              subtitle="Tempo médio para iniciar atendimento no período"
              points={t.startByDay}
              color="var(--color-warning)"
            />
          </div>
        </div>
      )}
    </PainelCard>
  );
}

function SeriesLegend({ series }: { series: PainelSeriesMeta[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function msToMinutes(ms: number | null): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return Math.round((ms / 60_000) * 10) / 10;
}

function MsDayChart({
  title,
  subtitle,
  points,
  color,
}: {
  title: string;
  subtitle: string;
  points: { date: string; ms: number | null; incomplete: boolean }[];
  color: string;
}) {
  const hasData = points.some((p) => p.ms != null && p.ms > 0);
  const chartData = points.map((p) => ({
    label: p.date.slice(5),
    minutes: msToMinutes(p.ms),
    incomplete: p.incomplete,
  }));
  return (
    <PainelCard title={title} subtitle={subtitle}>
      {!hasData ? (
        <PainelEmpty
          embedded
          title="Não há dados no período"
          description="Nenhuma amostra neste recorte. Amplie o período."
        />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={36}
                tickFormatter={(v) => `${v}m`}
              />
              <Tooltip formatter={(v) => [`${v} min`, title]} />
              <Area
                type="monotone"
                dataKey="minutes"
                name={title}
                stroke={color}
                fill={color}
                fillOpacity={0.18}
                strokeWidth={2}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </PainelCard>
  );
}

function DailySeriesChart({
  title,
  subtitle,
  series,
  points,
  empty,
  useBars,
  variant,
}: {
  title: string;
  subtitle: string;
  series: PainelSeriesMeta[];
  points: { date: string; incomplete: boolean; values: Record<string, number> }[];
  empty: boolean;
  useBars?: boolean;
  variant: "stack" | "line";
}) {
  const chartData = points.map((p) => ({
    label: p.date.slice(5),
    incomplete: p.incomplete,
    ...p.values,
  }));
  const hasValue = points.some((p) => series.some((s) => (p.values[s.key] ?? 0) > 0));
  return (
    <PainelCard title={title} subtitle={subtitle}>
      {empty || !hasValue ? (
        <PainelEmpty
          embedded
          title="Não há dados no período"
          description="Nenhuma conversa iniciada neste recorte."
        />
      ) : (
        <>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {variant === "line" ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  {series.map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              ) : useBars ? (
                <BarChart data={chartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  {series.map((s, i) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stackId="a"
                      fill={s.color}
                      radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              ) : (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  {series.map((s) => (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stackId="a"
                      stroke={s.color}
                      fill={s.color}
                      fillOpacity={0.55}
                    />
                  ))}
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          <SeriesLegend series={series} />
          {chartData.some((d) => d.incomplete) ? (
            <p className="mt-2 text-xs text-muted-foreground">O dia de hoje está incompleto.</p>
          ) : null}
        </>
      )}
    </PainelCard>
  );
}

function RankList({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: { key: string; label: string; color?: string; started: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.started));
  return (
    <PainelCard title={title} subtitle={subtitle}>
      {rows.length === 0 ? (
        <PainelEmpty embedded title="Não há dados no período" />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.key} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-semibold">{row.label}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatNumber(row.started)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((row.started / max) * 100)}%`,
                    background: row.color ?? "var(--color-primary)",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </PainelCard>
  );
}

function ServiceDeptAndHour({
  heatmap,
  byDepartment,
  onRetryHeatmap,
  onRetryDept,
}: {
  heatmap: PainelServiceResult["heatmap"];
  byDepartment: PainelServiceResult["byDepartment"];
  onRetryHeatmap: () => void;
  onRetryDept: () => void;
}) {
  const [deptKey, setDeptKey] = useState<string>("all");
  const h = heatmap.ok ? heatmap.data : null;
  const activeCells =
    deptKey === "all" || !h
      ? h?.cells
      : (h.series.find((s) => s.key === deptKey)?.cells ?? h.cells);
  const activeColor =
    deptKey === "all"
      ? "var(--brand-primary)"
      : (h?.series.find((s) => s.key === deptKey)?.color ?? "var(--brand-primary)");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {blockPending(byDepartment) ? (
        <PainelSkeleton className="min-h-48" />
      ) : !byDepartment.ok ? (
        <PainelBlockError message={byDepartment.error} onRetry={onRetryDept} />
      ) : (
        <DailySeriesChart
          title="Atendimentos"
          subtitle="Atendimentos iniciados no período"
          series={byDepartment.data.series}
          points={byDepartment.data.points}
          empty={byDepartment.data.empty}
          useBars={byDepartment.data.useBars}
          variant="stack"
        />
      )}
      {blockPending(heatmap) ? (
        <PainelSkeleton className="min-h-48" />
      ) : !heatmap.ok ? (
        <PainelBlockError message={heatmap.error} onRetry={onRetryHeatmap} />
      ) : !h || h.empty ? (
        <PainelCard
          title="Atendimentos iniciados por hora"
          subtitle="Média de atendimentos iniciados por hora no período"
        >
          <PainelEmpty
            embedded
            title="Não há dados no período"
            description="Nenhuma conversa iniciada neste recorte."
          />
        </PainelCard>
      ) : (
        <PainelCard
          title="Atendimentos iniciados por hora"
          subtitle="Média de atendimentos iniciados por hora no período"
          info="Células vazias são ausência naquele horário. Filtre pela legenda para ver um departamento."
        >
          <HeatmapGrid
            data={activeCells ?? []}
            xLabels={h.xLabels}
            yLabels={h.yLabels}
            baseColor={activeColor}
            formatValue={(v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} iniciadas`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDeptKey("all")}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                deptKey === "all"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground",
              )}
            >
              Todos
            </button>
            {h.series.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setDeptKey(s.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  deptKey === s.key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground",
                )}
              >
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </PainelCard>
      )}
    </div>
  );
}

function ServiceSummaries({
  dept,
  attendants,
  search,
  onRetryDept,
  onRetryAttendants,
}: {
  dept: PainelServiceResult["byDepartment"];
  attendants: PainelServiceResult["attendants"];
  search: string;
  onRetryDept: () => void;
  onRetryAttendants: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {blockPending(dept) ? (
        <PainelSkeleton className="min-h-48" />
      ) : !dept.ok ? (
        <PainelBlockError message={dept.error} onRetry={onRetryDept} />
      ) : (
        <RankList
          title="Atendimentos por departamento"
          subtitle="Atendimentos iniciados por departamento no período"
          rows={dept.data.summaries.filter((r) => textMatchesQuery(r.label, search))}
        />
      )}
      {blockPending(attendants) ? (
        <PainelSkeleton className="min-h-48" />
      ) : !attendants.ok ? (
        <PainelBlockError message={attendants.error} onRetry={onRetryAttendants} />
      ) : (
        <RankList
          title="Atendimentos por atendentes"
          subtitle="Atendimentos iniciados por atendentes no período"
          rows={attendants.data.rows
            .filter((r) => textMatchesQuery(r.name, search))
            .map((r) => ({
              key: r.id,
              label: r.name,
              color: "var(--color-primary)",
              started: r.attended,
            }))}
        />
      )}
    </div>
  );
}

function ServiceConnections({
  block,
  onRetry,
}: {
  block: PainelServiceResult["connections"];
  onRetry: () => void;
}) {
  if (blockPending(block)) return <PainelSkeleton className="min-h-48" />;
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const c = block.data;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <LineBlock
        title="Atendimentos por conexão"
        subtitle="Média de atendimentos iniciados por conexão"
        block={c.connections}
      />
      <LineBlock
        title="Atendimentos por plataforma"
        subtitle="Média de atendimentos iniciados por plataforma"
        block={c.platforms}
      />
    </div>
  );
}

function LineBlock({
  title,
  subtitle,
  block,
}: {
  title: string;
  subtitle: string;
  block: PainelConnectionBlock;
}) {
  return (
    <DailySeriesChart
      title={title}
      subtitle={subtitle}
      series={block.series}
      points={block.points}
      empty={block.empty}
      variant="line"
    />
  );
}

type TableSort = "finished" | "open" | "response" | "start" | "service";

function ServiceTables({
  dept,
  attendants,
  search,
  onRetryDept,
  onRetryAttendants,
}: {
  dept: PainelServiceResult["byDepartment"];
  attendants: PainelServiceResult["attendants"];
  search: string;
  onRetryDept: () => void;
  onRetryAttendants: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {blockPending(dept) ? (
        <PainelSkeleton className="min-h-48" />
      ) : !dept.ok ? (
        <PainelBlockError message={dept.error} onRetry={onRetryDept} />
      ) : (
        <DeptMetricsTable rows={dept.data.table} search={search} />
      )}
      {blockPending(attendants) ? (
        <PainelSkeleton className="min-h-48" />
      ) : !attendants.ok ? (
        <PainelBlockError message={attendants.error} onRetry={onRetryAttendants} />
      ) : (
        <AttendantMetricsTable
          rows={attendants.data.rows}
          search={search}
          attribution={attendants.data.attribution}
        />
      )}
    </div>
  );
}

const TABLE_COLS =
  "lg:grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(0,1fr))]";

function DeptMetricsTable({
  rows,
  search,
}: {
  rows: PainelDeptTableRow[];
  search: string;
}) {
  const [sort, setSort] = useState<TableSort>("finished");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const list = useMemo(() => {
    const filtered = rows.filter((r) => textMatchesQuery(r.label, search));
    const mul = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => (tableVal(a, sort) - tableVal(b, sort)) * mul);
  }, [rows, search, sort, dir]);

  return (
    <PainelCard
      title="Departamentos"
      subtitle="Finalizados, em aberto e tempos médios no período"
    >
      {list.length === 0 ? (
        <PainelEmpty embedded title="Não há dados no período" />
      ) : (
        <MetricsTable
          nameLabel="Departamentos"
          sort={sort}
          dir={dir}
          onToggle={(next) => {
            if (sort === next) setDir((d) => (d === "asc" ? "desc" : "asc"));
            else {
              setSort(next);
              setDir("desc");
            }
          }}
        >
          {list.map((row) => (
            <li
              key={row.key}
              className={cn(
                LIST_CARD_ROW_CLASS,
                "grid grid-cols-1 items-center gap-2",
                TABLE_COLS,
                "lg:gap-3",
              )}
            >
              <span className="truncate font-semibold">{row.label}</span>
              <span className="text-sm tabular-nums lg:text-right">{formatNumber(row.finished)}</span>
              <span className="text-sm tabular-nums lg:text-right">{formatNumber(row.stillOpen)}</span>
              <span className="text-sm tabular-nums lg:text-right">
                {formatDurationMs(row.responseMeanMs)}
              </span>
              <span className="text-sm tabular-nums lg:text-right">
                {formatDurationMs(row.startMeanMs)}
              </span>
              <span className="text-sm tabular-nums lg:text-right">
                {formatDurationMs(row.serviceMeanMs)}
              </span>
            </li>
          ))}
        </MetricsTable>
      )}
    </PainelCard>
  );
}

function AttendantMetricsTable({
  rows,
  search,
  attribution,
}: {
  rows: PainelAttendantRow[];
  search: string;
  attribution: string;
}) {
  const [sort, setSort] = useState<TableSort>("finished");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const list = useMemo(() => {
    const filtered = rows.filter((r) => textMatchesQuery(r.name, search));
    const mul = dir === "asc" ? 1 : -1;
    return [...filtered].sort(
      (a, b) =>
        (attVal(a, sort) - attVal(b, sort)) * mul || a.name.localeCompare(b.name, "pt-BR"),
    );
  }, [rows, search, sort, dir]);

  return (
    <PainelCard title="Atendentes" subtitle={attribution}>
      {list.length === 0 ? (
        <PainelEmpty
          embedded
          title="Não há dados no período"
          description="Nenhum atendimento atribuído neste recorte."
        />
      ) : (
        <MetricsTable
          nameLabel="Atendentes"
          sort={sort}
          dir={dir}
          onToggle={(next) => {
            if (sort === next) setDir((d) => (d === "asc" ? "desc" : "asc"));
            else {
              setSort(next);
              setDir("desc");
            }
          }}
        >
          {list.map((row) => (
            <li
              key={row.id}
              className={cn(
                LIST_CARD_ROW_CLASS,
                "grid grid-cols-1 items-center gap-2",
                TABLE_COLS,
                "lg:gap-3",
              )}
            >
              <span className="truncate font-semibold">{row.name}</span>
              <span className="text-sm tabular-nums lg:text-right">{formatNumber(row.finished)}</span>
              <span className="text-sm tabular-nums lg:text-right">{formatNumber(row.stillOpen)}</span>
              <span className="text-sm tabular-nums lg:text-right">
                {formatDurationMs(row.responseMeanMs)}
              </span>
              <span className="text-sm tabular-nums lg:text-right">
                {formatDurationMs(row.startMeanMs)}
              </span>
              <span className="text-sm tabular-nums lg:text-right">
                {formatDurationMs(row.serviceMeanMs)}
              </span>
            </li>
          ))}
        </MetricsTable>
      )}
    </PainelCard>
  );
}

function tableVal(row: PainelDeptTableRow, sort: TableSort): number {
  if (sort === "finished") return row.finished;
  if (sort === "open") return row.stillOpen;
  if (sort === "response") return row.responseMeanMs ?? -1;
  if (sort === "start") return row.startMeanMs ?? -1;
  return row.serviceMeanMs ?? -1;
}

function attVal(row: PainelAttendantRow, sort: TableSort): number {
  if (sort === "finished") return row.finished;
  if (sort === "open") return row.stillOpen;
  if (sort === "response") return row.responseMeanMs ?? -1;
  if (sort === "start") return row.startMeanMs ?? -1;
  return row.serviceMeanMs ?? -1;
}

function MetricsTable({
  nameLabel,
  sort,
  dir,
  onToggle,
  children,
}: {
  nameLabel: string;
  sort: TableSort;
  dir: "asc" | "desc";
  onToggle: (next: TableSort) => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className={cn(LIST_CARD_HEAD_CLASS, "hidden lg:grid", TABLE_COLS)}>
        <ListColumnLabel>{nameLabel}</ListColumnLabel>
        <SortableHeader
          label="Finalizados"
          align="right"
          sort={sort === "finished" ? dir : null}
          onSort={() => onToggle("finished")}
        />
        <SortableHeader
          label="Em aberto"
          align="right"
          sort={sort === "open" ? dir : null}
          onSort={() => onToggle("open")}
        />
        <SortableHeader
          label="Tempo médio resposta"
          align="right"
          sort={sort === "response" ? dir : null}
          onSort={() => onToggle("response")}
        />
        <SortableHeader
          label="Tempo médio iniciar"
          align="right"
          sort={sort === "start" ? dir : null}
          onSort={() => onToggle("start")}
        />
        <SortableHeader
          label="Tempo médio atendimento"
          align="right"
          sort={sort === "service" ? dir : null}
          onSort={() => onToggle("service")}
        />
      </div>
      <ul className={cn(LIST_CARD_STACK_CLASS, "mt-2")}>{children}</ul>
    </>
  );
}

function ServiceChannels({
  block,
  search,
  onRetry,
}: {
  block: PainelServiceResult["channels"];
  search: string;
  onRetry: () => void;
}) {
  if (blockPending(block)) return <PainelSkeleton className="min-h-48" />;
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const channels = block.data.channels.filter((r) => textMatchesQuery(r.label, search));
  const motivos = block.data.motivos.filter((r) => textMatchesQuery(r.label, search));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ShortList
        title="Por canal"
        emptyTitle="Não há dados no período"
        rows={channels}
      />
      <ShortList
        title="Por motivo"
        emptyTitle="Não há tabulações no período"
        rows={motivos}
      />
    </div>
  );
}

function ShortList({
  title,
  emptyTitle,
  rows,
}: {
  title: string;
  emptyTitle: string;
  rows: { key: string; label: string; count: number; firstResponseMedianMs: number | null }[];
}) {
  return (
    <PainelCard title={title} subtitle="Volume e mediana de primeira resposta">
      {rows.length === 0 ? (
        <PainelEmpty embedded title={emptyTitle} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5"
            >
              <span className="min-w-0 truncate font-semibold">{row.label}</span>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {formatNumber(row.count)} · {formatDurationMs(row.firstResponseMedianMs)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PainelCard>
  );
}

const SERVICE_EX_COPY = {
  no_reply: { label: "Sem resposta há mais de 1h comercial", icon: <Timer className="size-5" /> },
  open_24h: { label: "Abertas há mais de 24h", icon: <Hourglass className="size-5" /> },
  unassigned: { label: "Sem atendente", icon: <UserMinus className="size-5" /> },
  send_failure: { label: "Falha de envio", icon: <AlertTriangle className="size-5" /> },
} as const;

function ServiceExceptions({
  block,
  onRetry,
}: {
  block: PainelServiceResult["exceptions"];
  onRetry: () => void;
}) {
  if (blockPending(block)) return <PainelSkeleton className="min-h-48" />;
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  return (
    <PainelCard title="Exceções" subtitle="Clique para abrir a inbox filtrada">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {block.data.map((row) => {
          const copy = SERVICE_EX_COPY[row.key];
          return (
            <Link
              key={row.key}
              href={row.href}
              data-painel-exception={row.key}
              className="block min-w-0 rounded-xl outline-none ring-primary focus-visible:ring-2"
            >
              <KpiCard
                icon={copy.icon}
                label={copy.label}
                value={formatNumber(row.count)}
                tone={row.count > 0 ? "warning" : "neutral"}
                className="cursor-pointer hover:border-primary/30 hover:bg-secondary/50"
              />
            </Link>
          );
        })}
      </div>
    </PainelCard>
  );
}
