"use client";

import Link from "next/link";
import {
  IconBriefcase,
  IconChecklist,
  IconChevronRight,
  IconHourglassHigh,
  IconMessage,
} from "@tabler/icons-react";

import { EmptyState } from "@/components/crm/empty-state";
import { StatCard } from "@/components/crm/stat-card";
import { ChartCard } from "@/components/crm/chart-card";
import { formatNumber, textMatchesQuery } from "@/features/dashboard-v2/format";
import type { DashboardMeData, DashboardMeItem } from "@/features/dashboard-v2/api";
import type { OperatorWidgetId } from "@/features/dashboard-v2/use-dashboard-widget-order";

export function OperatorDashboardWidget({
  id,
  data,
  search,
}: {
  id: OperatorWidgetId;
  data: DashboardMeData;
  search: string;
}) {
  const q = search;
  const conversations = data.conversations.items.filter(
    (item) =>
      textMatchesQuery(item.title, q) ||
      textMatchesQuery(item.subtitle, q) ||
      textMatchesQuery(item.meta, q),
  );
  const tasks = data.activities.items.filter(
    (item) =>
      textMatchesQuery(item.title, q) ||
      textMatchesQuery(item.subtitle, q) ||
      textMatchesQuery(item.meta, q),
  );
  const stalled = data.stalled.items.filter(
    (item) =>
      textMatchesQuery(item.title, q) ||
      textMatchesQuery(item.subtitle, q) ||
      textMatchesQuery(item.meta, q),
  );

  switch (id) {
    case "kpis":
      return (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <KpiLink href="/inbox?tab=esperando">
            <StatCard
              icon={<IconMessage size={18} />}
              label="Aguardando você"
              value={formatNumber(data.conversations.total)}
              accent="warning"
              caption="conversas sem resposta"
            />
          </KpiLink>
          <KpiLink href="/activities">
            <StatCard
              icon={<IconChecklist size={18} />}
              label="Tarefas"
              value={formatNumber(data.activities.overdue + data.activities.today)}
              accent="danger"
              caption={`${formatNumber(data.activities.overdue)} atrasadas · ${formatNumber(data.activities.today)} hoje`}
            />
          </KpiLink>
          <KpiLink href="/pipeline">
            <StatCard
              icon={<IconHourglassHigh size={18} />}
              label="Parados com você"
              value={formatNumber(data.stalled.total)}
              accent="teal"
              caption="negócios sem movimento"
            />
          </KpiLink>
        </div>
      );
    case "conversations":
      return (
        <WorkList
          title="Conversas"
          subtitle="Cliente falou por último"
          href="/inbox?tab=esperando"
          emptyTitle="Nada aguardando"
          emptyHint="Quando um contato responder, aparece aqui."
          icon={<IconMessage size={24} />}
          items={conversations}
        />
      );
    case "tasks":
      return (
        <WorkList
          title="Tarefas"
          subtitle="Atrasadas e do dia"
          href="/activities"
          emptyTitle="Sem tarefas pendentes"
          emptyHint="Sua fila de hoje está limpa."
          icon={<IconChecklist size={24} />}
          items={tasks}
        />
      );
    case "stalled":
      return (
        <WorkList
          title="Negócios parados"
          subtitle="Sem atualização além do prazo da etapa"
          href="/pipeline"
          emptyTitle="Nenhum negócio parado"
          emptyHint="Seus cards estão dentro do prazo."
          icon={<IconBriefcase size={24} />}
          items={stalled}
        />
      );
  }
}

function KpiLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block min-w-0 rounded-xl outline-none ring-primary focus-visible:ring-2">
      {children}
    </Link>
  );
}

function WorkList({
  title,
  subtitle,
  href,
  emptyTitle,
  emptyHint,
  icon,
  items,
}: {
  title: string;
  subtitle: string;
  href: string;
  emptyTitle: string;
  emptyHint: string;
  icon: React.ReactNode;
  items: DashboardMeItem[];
}) {
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      action={
        <Link
          href={href}
          className="font-display text-[11px] font-semibold text-[var(--brand-primary)] hover:underline"
        >
          Ver tudo
        </Link>
      }
      bodyClassName="p-0"
    >
      {items.length === 0 ? (
        <EmptyState icon={icon} title={emptyTitle} description={emptyHint} className="py-10" />
      ) : (
        <ul className="divide-y divide-[var(--glass-border-subtle)]">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--glass-bg-subtle)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                    {item.number != null ? `#${item.number} · ${item.title}` : item.title}
                  </p>
                  {item.subtitle ? (
                    <p className="truncate font-body text-[11px] text-[var(--text-muted)]">
                      {item.subtitle}
                    </p>
                  ) : null}
                </div>
                {item.meta ? (
                  <span className="shrink-0 font-body text-[11px] text-[var(--text-muted)]">
                    {item.meta}
                  </span>
                ) : null}
                <IconChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
