"use client";

import Link from "next/link";
import {
  IconAlertTriangle,
  IconBriefcase,
  IconCircleX,
  IconReceipt,
  IconTargetArrow,
  IconTrophy,
} from "@tabler/icons-react";

import { StatCard } from "@/components/crm/stat-card";
import { ChartCard } from "@/components/crm/chart-card";
import { EmptyState } from "@/components/crm/empty-state";
import { PipelineProgress } from "@/components/pipeline-progress";
import { formatCurrency, formatNumber, textMatchesQuery } from "@/features/dashboard-v2/format";
import type { DashboardData } from "@/features/dashboard-v2/api";
export function DealDashboardWidget({
  id,
  data,
  period,
  search,
}: {
  id: string;
  data: DashboardData;
  period?: { from: string; to: string };
  search: string;
}) {
  switch (id) {
    case "kpis":
      return <DealKpis data={data} />;
    case "funnel":
      return <DealFunnel data={data} period={period} search={search} />;
    case "stalled":
      return <DealStalled data={data} search={search} />;
    case "insights":
      return <DealInsights data={data} search={search} />;
    default:
      return null;
  }
}

function DealKpis({ data }: { data: DashboardData }) {
  const s = data.summary;
  return (
    <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
      <Link href="/pipeline" className="min-w-0 rounded-xl outline-none ring-primary focus-visible:ring-2">
        <StatCard
          icon={<IconBriefcase size={18} />}
          label="Em andamento"
          value={formatNumber(s.openDeals)}
          accent="teal"
          caption="negócios abertos"
        />
      </Link>
      <StatCard
        icon={<IconTrophy size={18} />}
        label="Ganhos"
        value={formatNumber(s.wonCount)}
        delta={s.deltas?.wonCount}
        accent="success"
        caption={`${formatCurrency(s.wonValue)} no período`}
      />
      <StatCard
        icon={<IconTargetArrow size={18} />}
        label="Taxa de ganho"
        value={`${s.winRate}%`}
        delta={s.deltas?.winRate}
        accent="brand"
        caption="vs. período anterior"
      />
      <StatCard
        icon={<IconReceipt size={18} />}
        label="Ticket médio"
        value={formatCurrency(s.avgTicket)}
        delta={s.deltas?.avgTicket}
        accent="purple"
        caption="por negócio ganho"
      />
    </div>
  );
}

function DealFunnel({
  data,
  period,
  search,
}: {
  data: DashboardData;
  period?: { from: string; to: string };
  search: string;
}) {
  const s = data.summary;
  const stages = (data.funnel ?? []).filter((stage) =>
    textMatchesQuery(stage.name, search),
  );
  return (
    <PipelineProgress
      stages={stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        count: stage.count,
        value: stage.value,
        entered: stage.entered,
        lost: stage.lost,
        href: `/pipeline?${new URLSearchParams({ pipeline: data.pipelineId, stage: stage.id }).toString()}`,
      }))}
      summary={{
        wonCount: s.wonCount,
        wonValue: s.wonValue,
        lostCount: s.lostCount,
        lostValue: s.lostValue,
        href: `/pipeline?pipeline=${encodeURIComponent(data.pipelineId)}`,
      }}
      cohort={data.newDeals}
      pipelineHref={`/pipeline?pipeline=${encodeURIComponent(data.pipelineId)}`}
      period={period}
    />
  );
}

function DealStalled({ data, search }: { data: DashboardData; search: string }) {
  const s = data.summary;
  const stalled = (data.stalled ?? []).filter((row) =>
    textMatchesQuery(row.name, search),
  );
  return (
    <ChartCard
      title="Leads parados"
      subtitle="Sem movimento além do prazo da etapa"
      action={
        <div className="flex items-center gap-3">
          <Link
            href="/pipeline?owner=none"
            className="font-display text-[11px] font-semibold text-[var(--color-warning)] hover:underline"
          >
            {formatNumber(s.leadsWithoutOwner)} sem dono
          </Link>
          <Link
            href="/pipeline"
            className="font-display text-[11px] font-semibold text-[var(--brand-primary)] hover:underline"
          >
            Pipeline
          </Link>
        </div>
      }
      bodyClassName="p-0"
    >
      {stalled.length === 0 ? (
        <EmptyState
          icon={<IconAlertTriangle size={24} />}
          title={search.trim() ? "Nenhum lead neste recorte" : "Nenhum lead parado"}
          description={
            search.trim()
              ? "Nenhum estágio parado corresponde à busca."
              : "Os negócios abertos estão dentro do prazo."
          }
          className="py-10"
        />
      ) : (
        <ul className="divide-y divide-[var(--glass-border-subtle)]">
          {stalled.map((row) => (
            <li key={row.id}>
              <Link
                href="/pipeline"
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--glass-bg-subtle)]"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
                <span className="min-w-0 flex-1 truncate font-display text-[13px] font-semibold">
                  {row.name}
                </span>
                <span className="shrink-0 font-display text-[12px] font-bold text-[var(--color-warning)]">
                  {formatNumber(row.count)}
                </span>
                <span className="w-20 shrink-0 text-right font-body text-[11px] text-[var(--text-muted)]">
                  +{row.rottingDays}d
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

function DealInsights({ data, search }: { data: DashboardData; search: string }) {
  const owners = (data.byOwner ?? [])
    .filter((row) => textMatchesQuery(row.name, search))
    .slice(0, 5);
  const losses = (data.lossReasons ?? [])
    .filter((row) => textMatchesQuery(row.reason, search))
    .slice(0, 5);
  const lossTotal = losses.reduce((acc, r) => acc + r.count, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Top consultores" subtitle="Ganhos no período" bodyClassName="p-0">
        {owners.length === 0 ? (
          <EmptyState
            icon={<IconTrophy size={24} />}
            title="Sem ranking"
            description="Nenhum negócio atribuído no período."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-[var(--glass-border-subtle)]">
            {owners.map((row, i) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--glass-bg-subtle)] font-display text-[10px] font-bold text-[var(--text-muted)]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-display text-[13px] font-semibold">
                  {row.name}
                </span>
                <span className="shrink-0 font-body text-[12px] text-[var(--color-success)]">
                  {formatNumber(row.won)}
                </span>
                <span className="w-[4.5rem] shrink-0 text-right font-display text-[12px] font-bold">
                  {formatCurrency(row.wonValue)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      <ChartCard title="Por que perdemos" subtitle="Motivos de perda no período" bodyClassName="p-0">
        {losses.length === 0 ? (
          <EmptyState
            icon={<IconCircleX size={24} />}
            title="Sem perdas no período"
            description="Nenhum negócio perdido no recorte."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-[var(--glass-border-subtle)]">
            {losses.map((row) => (
              <li key={row.reason} className="flex items-center gap-2 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate font-body text-[12.5px]">{row.reason}</span>
                <span className="shrink-0 font-display text-[12px] font-bold">{row.count}</span>
                <span className="w-8 shrink-0 text-right font-body text-[11px] text-[var(--text-muted)]">
                  {lossTotal > 0 ? Math.round((row.count / lossTotal) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}
