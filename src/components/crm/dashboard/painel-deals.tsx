"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CircleHelp,
  Handshake,
  ListTodo,
  Percent,
  Receipt,
  Trophy,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { KpiCard } from "@/components/crm/kpi-card";
import { PipelineProgress } from "@/components/pipeline-progress";
import {
  LIST_CARD_HEAD_CLASS,
  LIST_CARD_ROW_CLASS,
  LIST_CARD_STACK_CLASS,
  ListColumnLabel,
} from "@/components/crm/sortable-header";
import {
  PainelBlockError,
  PainelCard,
  PainelEmpty,
  PainelKpiSkeleton,
  PainelSkeleton,
} from "@/components/crm/dashboard/painel-block";
import {
  formatBRL,
  formatNumber,
  formatPct,
  textMatchesQuery,
} from "@/features/dashboard-v2/format";
import type {
  PainelAgentRow,
  PainelDealsResult,
  PainelDelta,
  PainelFunnelStage,
  PainelKpi,
} from "@/features/dashboard-v2/painel-api";
import type { DealCoreWidgetId } from "@/features/dashboard-v2/use-negocios-grid";
import { cn } from "@/lib/utils";
import { StageMetricCard } from "@/components/crm/dashboard/stage-metric-card";

function deltaHint(delta: PainelDelta | undefined, asOf?: string) {
  if (asOf) return asOf;
  if (!delta || delta.hidden) return undefined;
  const sign = delta.value > 0 ? "+" : "";
  return `${sign}${delta.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function kpiValue(kpi: PainelKpi, kind: "money" | "count" | "pct") {
  if (kpi.value == null) return "—";
  if (kind === "money") return formatBRL(kpi.value);
  if (kind === "pct") return formatPct(kpi.value);
  return formatNumber(kpi.value);
}

export function PainelDealWidget({
  id,
  data,
  search,
  period,
  pipelineId,
  pipelineIds,
  userIds,
  funnelPicker,
  onRetry,
}: {
  id: DealCoreWidgetId | "stages";
  data: PainelDealsResult | undefined;
  search: string;
  period?: { from: string; to: string };
  pipelineId?: string;
  pipelineIds?: string[];
  userIds?: string[];
  funnelPicker?: ReactNode;
  onRetry: (section: string) => void;
}) {
  if (!data) {
    if (id === "kpis") return <PainelKpiSkeleton />;
    return <PainelSkeleton className="min-h-48" />;
  }

  switch (id) {
    case "kpis":
      return <DealKpis block={data.kpis} onRetry={() => onRetry("kpis")} />;
    case "funnel":
      return (
        <DealFunnel
          block={data.funnel}
          kpis={data.kpis}
          search={search}
          period={period}
          pipelineId={pipelineId}
          pipelineIds={pipelineIds}
          funnelPicker={funnelPicker}
          onRetry={() => onRetry("funnel")}
        />
      );
    case "stages":
      return (
        <DealStageCards
          block={data.funnel}
          search={search}
          userIds={userIds}
          onRetry={() => onRetry("funnel")}
        />
      );
    case "evolution":
      return <DealEvolution block={data.evolution} onRetry={() => onRetry("evolution")} />;
    case "agents":
      return (
        <DealAgents
          block={data.agents}
          search={search}
          userIds={userIds}
          onRetry={() => onRetry("agents")}
        />
      );
    case "sources":
      return <DealSources block={data.sources} search={search} onRetry={() => onRetry("sources")} />;
    case "exceptions":
      return (
        <DealExceptions block={data.exceptions} onRetry={() => onRetry("exceptions")} />
      );
    case "usage":
      return null;
  }
}

function DealKpis({
  block,
  onRetry,
}: {
  block: PainelDealsResult["kpis"];
  onRetry: () => void;
}) {
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const k = block.data;
  return (
    <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-5">
      <KpiCard
        icon={<Banknote className="size-5" />}
        label="Receita ganha"
        value={kpiValue(k.receitaGanha, "money")}
        hint={deltaHint(k.receitaGanha.delta)}
        tone="success"
      />
      <KpiCard
        icon={<Trophy className="size-5" />}
        label="Negócios ganhos"
        value={kpiValue(k.negociosGanhos, "count")}
        hint={deltaHint(k.negociosGanhos.delta)}
        tone="brand"
      />
      <KpiCard
        icon={<Receipt className="size-5" />}
        label="Ticket médio"
        value={kpiValue(k.ticketMedio, "money")}
        hint={deltaHint(k.ticketMedio.delta)}
        tone="violet"
      />
      <KpiCard
        icon={<Percent className="size-5" />}
        label="Taxa de conversão"
        value={kpiValue(k.taxaConversao, "pct")}
        hint={deltaHint(k.taxaConversao.delta)}
        tone="orange"
      />
      <KpiCard
        icon={<Handshake className="size-5" />}
        label="Valor em aberto"
        value={kpiValue(k.valorEmAberto, "money")}
        badge="hoje"
        tone="neutral"
      />
    </div>
  );
}

function DealFunnel({
  block,
  kpis,
  search,
  period,
  pipelineId,
  pipelineIds,
  funnelPicker,
  onRetry,
}: {
  block: PainelDealsResult["funnel"];
  kpis: PainelDealsResult["kpis"];
  search: string;
  period?: { from: string; to: string };
  pipelineId?: string;
  pipelineIds?: string[];
  funnelPicker?: ReactNode;
  onRetry: () => void;
}) {
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const funnel = block.data;
  const stages = funnel.stages.filter((s) => textMatchesQuery(s.name, search));
  const single = pipelineIds?.length === 1 ? pipelineIds[0] : pipelineId;
  const pipelineHref = single
    ? `/pipeline?pipeline=${encodeURIComponent(single)}`
    : "/pipeline";
  const wonCount = kpis.ok ? (kpis.data.negociosGanhos.value ?? 0) : 0;
  const wonValue = kpis.ok ? (kpis.data.receitaGanha.value ?? 0) : 0;

  if (funnel.empty) {
    return (
      <PainelCard
        title="Funil e progresso"
        subtitle="Estoque aberto, entradas e perdas por etapa"
        action={
          <Link
            href={pipelineHref}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            Pipeline
          </Link>
        }
      >
        <div className={funnelPicker ? "flex min-h-0 items-stretch" : undefined}>
          {funnelPicker ? (
            <aside className="w-[196px] shrink-0 border-r border-border py-2">
              {funnelPicker}
            </aside>
          ) : null}
          <div className="min-w-0 flex-1">
            <PainelEmpty
              embedded
              title="Não há dados no período"
              description="Nenhum negócio entrou em etapa neste recorte. Amplie o período ou escolha outro funil."
            />
          </div>
        </div>
      </PainelCard>
    );
  }

  return (
    <PipelineProgress
      stages={stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        count: stage.count,
        value: stage.value,
        entered: stage.entered ?? stage.count,
        lost: stage.lost ?? 0,
        passThrough: stage.passThrough,
        href: single
          ? `/pipeline?${new URLSearchParams({ pipeline: single, stage: stage.id }).toString()}`
          : "/pipeline",
      }))}
      summary={{
        wonCount,
        wonValue,
        lostCount: 0,
        lostValue: 0,
        href: pipelineHref,
      }}
      pipelineHref={pipelineHref}
      period={period}
      novos={funnel.novos}
      sidebar={funnelPicker}
    />
  );
}

export function DealStageWidget({
  stage,
  search,
  userIds,
}: {
  stage: PainelFunnelStage;
  search: string;
  userIds?: string[];
}) {
  const users = (stage.byUser ?? []).filter((u) => {
    if (userIds?.length && !userIds.includes(u.id)) return false;
    return textMatchesQuery(u.name, search);
  });
  return <StageMetricCard stage={stage} users={users} />;
}

function DealStageCards({
  block,
  search,
  userIds,
  onRetry,
}: {
  block: PainelDealsResult["funnel"];
  search: string;
  userIds?: string[];
  onRetry: () => void;
}) {
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const stages = block.data.stages.filter((s) => textMatchesQuery(s.name, search));
  if (stages.length === 0) {
    return (
      <PainelCard title="Etapas" subtitle="Leads e valor por responsável">
        <PainelEmpty embedded title="Não há etapas no período" description="Amplie o período ou selecione outro funil." />
      </PainelCard>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {stages.map((stage) => (
        <div key={stage.id} className="min-w-[240px] max-w-full flex-1 basis-[calc(33.333%-7px)]">
          <DealStageWidget stage={stage} search={search} userIds={userIds} />
        </div>
      ))}
    </div>
  );
}

function DealEvolution({
  block,
  onRetry,
}: {
  block: PainelDealsResult["evolution"];
  onRetry: () => void;
}) {
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const evo = block.data;

  if (!evo.available) {
    const beyond = evo.reason === "beyond_retention";
    return (
      <PainelCard title="Evolução diária" subtitle="Negócios abertos por etapa">
        <PainelEmpty
          embedded
          title={
            beyond
              ? "Período além da retenção"
              : "Histórico ainda não gravado"
          }
          description={
            beyond
              ? `Snapshots são guardados por ${evo.retentionDays} dias${evo.retainedFrom ? ` (desde ${evo.retainedFrom})` : ""}. Escolha um período mais recente.`
              : "Começamos a gravar o estoque diário agora. Não dá para reconstruir o passado — volte amanhã para ver a série."
          }
        />
      </PainelCard>
    );
  }

  const chartData = evo.points.map((p) => ({
    date: p.date.slice(5),
    incomplete: p.incomplete,
    ...p.byStage,
  }));

  return (
    <PainelCard
      title="Evolução diária"
      subtitle={
        evo.useBars
          ? "Barras empilhadas · estoque aberto por etapa"
          : "Área empilhada · estoque aberto por etapa"
      }
      action={
        evo.reason === "beyond_retention" ? (
          <span className="text-xs text-muted-foreground">
            Retenção {evo.retentionDays}d
          </span>
        ) : null
      }
    >
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {evo.useBars ? (
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              {evo.stages.map((s, i) => (
                <Bar
                  key={s.id}
                  dataKey={s.id}
                  name={s.name}
                  stackId="a"
                  fill={s.color}
                  radius={i === evo.stages.length - 1 ? [4, 4, 0, 0] : 0}
                >
                  {chartData.map((d) => (
                    <Cell
                      key={`${s.id}-${d.date}`}
                      fill={s.color}
                      fillOpacity={d.incomplete ? 0.45 : 1}
                    />
                  ))}
                </Bar>
              ))}
            </BarChart>
          ) : (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              {evo.stages.map((s) => (
                <Area
                  key={s.id}
                  type="monotone"
                  dataKey={s.id}
                  name={s.name}
                  stackId="a"
                  stroke={s.color}
                  fill={s.color}
                  fillOpacity={0.55}
                  strokeDasharray={undefined}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      {evo.incompleteLast ? (
        <p className="mt-2 text-xs text-muted-foreground">
          O último ponto (hoje) está incompleto.
        </p>
      ) : null}
    </PainelCard>
  );
}

function DealAgents({
  block,
  search,
  userIds,
  onRetry,
}: {
  block: PainelDealsResult["agents"];
  search: string;
  userIds?: string[];
  onRetry: () => void;
}) {
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const rows = block.data.filter((r) => {
    if (userIds?.length && !userIds.includes(r.id)) return false;
    return textMatchesQuery(r.name, search);
  });
  if (rows.length === 0) {
    return (
      <PainelCard title="Ganhos por agente">
        <PainelEmpty
          embedded
          title="Não há dados no período"
          description="Nenhum agente no recorte. Amplie o período."
        />
      </PainelCard>
    );
  }
  return (
    <PainelCard
      title="Ganhos por agente"
      subtitle="Ordenado por receita ganha · sem ranking por cor"
    >
      <div className={LIST_CARD_HEAD_CLASS + " grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]"}>
        <ListColumnLabel>Agente</ListColumnLabel>
        <ListColumnLabel align="right">Receita ganha</ListColumnLabel>
        <ListColumnLabel align="right">Ganhos</ListColumnLabel>
        <ListColumnLabel align="right">Conversão</ListColumnLabel>
        <ListColumnLabel align="right">Ticket médio</ListColumnLabel>
        <ListColumnLabel align="right">Ativos hoje</ListColumnLabel>
      </div>
      <ul className={cn(LIST_CARD_STACK_CLASS, "mt-2")}>
        {rows.map((row) => (
          <AgentRow key={row.id} row={row} />
        ))}
      </ul>
    </PainelCard>
  );
}

function AgentRow({ row }: { row: PainelAgentRow }) {
  return (
    <li
      className={cn(
        LIST_CARD_ROW_CLASS,
        "grid grid-cols-1 items-center gap-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] lg:gap-4",
        row.zeroActivity && "opacity-70",
      )}
    >
      <span className="truncate font-semibold">{row.name}</span>
      <span className="text-sm tabular-nums lg:text-right">{formatBRL(row.wonValue)}</span>
      <span className="text-sm tabular-nums lg:text-right">{formatNumber(row.wonCount)}</span>
      <span className="text-sm tabular-nums lg:text-right">{formatPct(row.conversion)}</span>
      <span className="text-sm tabular-nums lg:text-right">{formatBRL(row.ticket)}</span>
      <span className="text-sm tabular-nums lg:text-right">{formatNumber(row.openToday)}</span>
    </li>
  );
}

function DealSources({
  block,
  search,
  onRetry,
}: {
  block: PainelDealsResult["sources"];
  search: string;
  onRetry: () => void;
}) {
  if (!block.ok) return <PainelBlockError message={block.error} onRetry={onRetry} />;
  const rows = block.data.filter((r) => textMatchesQuery(r.label, search));
  const max = Math.max(1, ...rows.map((r) => r.wonValue));
  if (rows.length === 0) {
    return (
      <PainelCard title="Origem">
        <PainelEmpty
          embedded
          title="Não há dados no período"
          description="Nenhum ganho com origem neste recorte."
        />
      </PainelCard>
    );
  }
  return (
    <PainelCard title="Origem" subtitle="Ganhos e receita · máximo 8 + Outras">
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-semibold">{row.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatNumber(row.wonCount)} · {formatBRL(row.wonValue)}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, (row.wonValue / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </PainelCard>
  );
}

const EXCEPTION_COPY: Record<
  "no_task" | "stalled" | "overdue" | "empty_value",
  { label: string; icon: React.ReactNode }
> = {
  no_task: { label: "Sem próxima tarefa", icon: <ListTodo className="size-5" /> },
  stalled: { label: "Parados há mais de N dias", icon: <AlertTriangle className="size-5" /> },
  overdue: { label: "Fechamento previsto vencido", icon: <CalendarClock className="size-5" /> },
  empty_value: { label: "Sem valor preenchido", icon: <CircleHelp className="size-5" /> },
};

function DealExceptions({
  block,
  onRetry,
}: {
  block: PainelDealsResult["exceptions"];
  onRetry: () => void;
}) {
  if (!block.ok) {
    return (
      <PainelCard title="Exceções" subtitle="Clique para abrir a lista filtrada">
        <PainelBlockError message={block.error} onRetry={onRetry} />
      </PainelCard>
    );
  }
  return (
    <PainelCard title="Exceções" subtitle="Clique para abrir a lista filtrada">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {block.data.map((row) => {
          const copy = EXCEPTION_COPY[row.key];
          const label =
            row.key === "stalled"
              ? `Parados há mais de ${row.stalledDays ?? 7} dias`
              : copy.label;
          return (
            <Link
              key={row.key}
              href={row.href}
              data-painel-exception={row.key}
              className="block min-w-0 rounded-xl outline-none ring-primary focus-visible:ring-2"
            >
              <KpiCard
                icon={copy.icon}
                label={label}
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
