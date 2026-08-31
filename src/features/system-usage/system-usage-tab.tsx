"use client";

import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import {
  IconActivity,
  IconChevronDown,
  IconChevronRight,
  IconClockPlay,
  IconLoader2 as Loader2,
  IconRefresh,
  IconUserCheck,
  IconUsers,
} from "@tabler/icons-react";

import { UserAvatar } from "@/components/crm/user-avatar";
import { EmptyState } from "@/components/crm/empty-state";
import { DataView, DataRow } from "@/components/automations/data-view";
import { ListHScroll } from "@/components/crm/list-hscroll";
import { ListColumnLabel } from "@/components/crm/sortable-header";
import type { CardsTableView } from "@/components/automations/view-toggle";
import { cn } from "@/lib/utils";
import type { DateRange } from "@/components/crm/date-range-picker";

import { fetchSystemUsageSessions, fetchSystemUsageSummary } from "./api";
import type {
  SystemUsageAggregateRow,
  SystemUsageSessionItem,
} from "./types";

// Colunas: usuário | ativo agora | último uso | tempo total | sessões | média | interações | expand
const USAGE_GRID =
  "grid-cols-[minmax(200px,1.7fr)_minmax(96px,0.7fr)_minmax(140px,1fr)_minmax(110px,0.8fr)_minmax(80px,0.5fr)_minmax(110px,0.7fr)_minmax(100px,0.6fr)_36px]";

function toISO(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function fmtDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 60) {
    return totalSeconds > 0 ? `${totalSeconds}s` : "—";
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return format(d, "dd/MM HH:mm", { locale: ptBR });
}

export function SystemUsageTab({
  view,
  range,
}: {
  view: CardsTableView;
  range: DateRange;
}) {
  const fromISO = toISO(range.from);
  const toISOStr = toISO(range.to ? endOfInclusiveDay(range.to) : null);

  const enabled = Boolean(fromISO && toISOStr);

  const summaryQuery = useQuery({
    queryKey: ["logs-system-usage-summary", fromISO, toISOStr],
    queryFn: () => fetchSystemUsageSummary(fromISO!, toISOStr!),
    enabled,
  });

  const items = React.useMemo(() => {
    const list = summaryQuery.data?.items ?? [];
    // Ordem: ativos primeiro, depois lastActivityAt desc, depois nome.
    return [...list].sort((a, b) => {
      if (a.activeNow !== b.activeNow) return a.activeNow ? -1 : 1;
      const la = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const lb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      if (la !== lb) return lb - la;
      return (a.userName ?? "").localeCompare(b.userName ?? "", "pt-BR");
    });
  }, [summaryQuery.data]);

  const kpis = React.useMemo(() => {
    let totalSeconds = 0;
    let sessionCount = 0;
    let activeUsers = 0;
    for (const r of items) {
      totalSeconds += r.totalSeconds;
      sessionCount += r.sessionCount;
      if (r.totalSeconds > 0) activeUsers += 1;
    }
    const avgPerUser =
      activeUsers > 0 ? Math.round(totalSeconds / activeUsers) : 0;
    const avgSession =
      sessionCount > 0 ? Math.round(totalSeconds / sessionCount) : 0;
    return { totalSeconds, activeUsers, avgPerUser, avgSession };
  }, [items]);

  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <UsageMiniDash
        activeUsers={kpis.activeUsers}
        totalSeconds={kpis.totalSeconds}
        avgPerUser={kpis.avgPerUser}
        avgSession={kpis.avgSession}
      />

      {summaryQuery.data?.pending && (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-4 py-3 font-body text-[12.5px] text-[var(--text-muted)]">
          Aguardando primeira coleta de atividade. Volte em instantes.
        </div>
      )}

      {summaryQuery.isLoading ? (
        <div className="h-[300px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]" />
      ) : summaryQuery.isError ? (
        <ErrorPanel onRetry={() => void summaryQuery.refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-md shadow-[var(--glass-shadow)]">
          <EmptyState
            icon={<IconActivity size={28} />}
            title="Sem atividade no período"
            description="Nenhum usuário registrou uso real no intervalo selecionado."
          />
        </div>
      ) : (
        <ListHScroll>
          <DataView
            view={view}
            columnClass={cn("grid items-center gap-3", USAGE_GRID)}
            className="min-w-[880px]"
            header={
              <>
                <ListColumnLabel>Usuário</ListColumnLabel>
                <ListColumnLabel>Estado</ListColumnLabel>
                <ListColumnLabel>Último uso</ListColumnLabel>
                <ListColumnLabel align="right">Tempo total</ListColumnLabel>
                <ListColumnLabel align="right">Sessões</ListColumnLabel>
                <ListColumnLabel align="right">Duração média</ListColumnLabel>
                <ListColumnLabel align="right">Interações</ListColumnLabel>
                <span />
              </>
            }
          >
            {items.map((row) => (
              <UsageRow
                key={row.userId}
                row={row}
                expanded={expanded === row.userId}
                onToggle={() =>
                  setExpanded((prev) => (prev === row.userId ? null : row.userId))
                }
                fromISO={fromISO!}
                toISO={toISOStr!}
              />
            ))}
          </DataView>
        </ListHScroll>
      )}
    </div>
  );
}

function endOfInclusiveDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function UsageRow({
  row,
  expanded,
  onToggle,
  fromISO,
  toISO,
}: {
  row: SystemUsageAggregateRow;
  expanded: boolean;
  onToggle: () => void;
  fromISO: string;
  toISO: string;
}) {
  return (
    <>
      <DataRow
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="cursor-pointer text-left"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar
            name={row.userName ?? row.userEmail ?? "—"}
            imageUrl={row.avatarUrl ?? null}
            size={28}
          />
          <div className="min-w-0">
            <p className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
              {row.userName ?? "Sem nome"}
            </p>
            <p className="truncate font-body text-[11px] text-[var(--text-muted)]">
              {row.userEmail ?? "—"}
            </p>
          </div>
        </div>
        <div>
          <StateBadge active={row.activeNow} />
        </div>
        <span className="font-mono tabular-nums text-[12px] text-[var(--text-secondary)]">
          {fmtRelative(row.lastActivityAt)}
        </span>
        <span className="text-right font-display text-[13px] font-bold tabular-nums text-[var(--text-primary)]">
          {fmtDuration(row.totalSeconds)}
        </span>
        <span className="text-right font-display text-[12px] tabular-nums text-[var(--text-secondary)]">
          {row.sessionCount}
        </span>
        <span className="text-right font-display text-[12px] tabular-nums text-[var(--text-secondary)]">
          {fmtDuration(row.averageSessionSeconds)}
        </span>
        <span className="text-right font-display text-[12px] tabular-nums text-[var(--text-secondary)]">
          {row.interactionCount.toLocaleString("pt-BR")}
        </span>
        <span className="flex justify-end text-[var(--text-muted)]">
          {expanded ? (
            <IconChevronDown size={16} />
          ) : (
            <IconChevronRight size={16} />
          )}
        </span>
      </DataRow>

      {expanded && (
        <UserSessionsPanel
          userId={row.userId}
          fromISO={fromISO}
          toISO={toISO}
        />
      )}
    </>
  );
}

function StateBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-display text-[10.5px] font-bold uppercase tracking-[0.05em]",
        active
          ? "bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)] text-[var(--color-success)]"
          : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active
            ? "bg-[var(--color-success)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-success)_18%,transparent)]"
            : "bg-[var(--text-muted)]",
        )}
      />
      {active ? "Ativo agora" : "Inativo"}
    </span>
  );
}

function UserSessionsPanel({
  userId,
  fromISO,
  toISO,
}: {
  userId: string;
  fromISO: string;
  toISO: string;
}) {
  const query = useInfiniteQuery({
    queryKey: ["logs-system-usage-sessions", userId, fromISO, toISO],
    queryFn: ({ pageParam }) =>
      fetchSystemUsageSessions(userId, fromISO, toISO, pageParam ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? null,
  });

  const rows: SystemUsageSessionItem[] = React.useMemo(() => {
    return (query.data?.pages ?? []).flatMap((p) => p.items);
  }, [query.data]);

  return (
    <div className="border-t border-[var(--glass-border-subtle)] px-4 py-3">
      {query.isLoading ? (
        <div className="flex items-center gap-2 py-2 font-body text-[12px] text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando sessões…
        </div>
      ) : query.isError ? (
        <div className="flex items-center gap-3 py-2 font-body text-[12px] text-[var(--color-danger-text)]">
          <span>Não foi possível carregar as sessões deste usuário.</span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-primary)] px-3 py-1 font-display text-[11.5px] font-bold text-white"
          >
            <IconRefresh size={12} /> Tentar de novo
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-2 font-body text-[12px] text-[var(--text-muted)]">
          Sem sessões no período.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[1fr_1fr_120px_110px] gap-3 pb-1 font-display text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--text-muted)]">
            <span>Início</span>
            <span>Fim</span>
            <span className="text-right">Duração</span>
            <span className="text-right">Interações</span>
          </div>
          {rows.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[1fr_1fr_120px_110px] items-center gap-3 rounded-[10px] bg-[var(--glass-bg-strong)] px-3 py-2"
            >
              <span className="font-mono tabular-nums text-[12px] text-[var(--text-secondary)]">
                {fmtRelative(s.startedAt)}
              </span>
              <span className="font-mono tabular-nums text-[12px] text-[var(--text-secondary)]">
                {s.isOpen ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                    Em curso
                  </span>
                ) : (
                  fmtRelative(s.endedAt)
                )}
              </span>
              <span className="text-right font-display text-[12px] font-bold tabular-nums text-[var(--text-primary)]">
                {fmtDuration(s.durationSeconds)}
              </span>
              <span className="text-right font-display text-[12px] tabular-nums text-[var(--text-secondary)]">
                {s.interactionCount.toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
          {query.hasNextPage && (
            <button
              type="button"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="mt-1 self-start rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 py-1 font-display text-[11.5px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
            >
              {query.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-danger)]/20 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-8 text-center">
      <p className="font-body text-[13px] text-[var(--color-danger-text)]">
        Não foi possível carregar o uso do sistema.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[12.5px] font-bold text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)]"
      >
        <IconRefresh size={14} /> Recarregar
      </button>
    </div>
  );
}

function UsageMiniDash({
  activeUsers,
  totalSeconds,
  avgPerUser,
  avgSession,
}: {
  activeUsers: number;
  totalSeconds: number;
  avgPerUser: number;
  avgSession: number;
}) {
  const cards: {
    key: string;
    label: string;
    value: string;
    accent: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "users",
      label: "Usuários com atividade",
      value: activeUsers.toLocaleString("pt-BR"),
      accent: "var(--brand-primary)",
      icon: <IconUsers size={16} />,
    },
    {
      key: "total",
      label: "Tempo total de uso",
      value: fmtDuration(totalSeconds),
      accent: "var(--color-success)",
      icon: <IconClockPlay size={16} />,
    },
    {
      key: "avg-user",
      label: "Média por usuário",
      value: fmtDuration(avgPerUser),
      accent: "var(--color-info)",
      icon: <IconUserCheck size={16} />,
    },
    {
      key: "avg-session",
      label: "Duração média da sessão",
      value: fmtDuration(avgSession),
      accent: "var(--brand-secondary, #a78bfa)",
      icon: <IconActivity size={16} />,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.key}
          className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `color-mix(in srgb, ${c.accent} 14%, transparent)`,
              color: c.accent,
            }}
          >
            {c.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              {c.label}
            </div>
            <div className="font-display text-[22px] font-bold leading-none text-[var(--text-primary)] tabular-nums">
              {c.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
