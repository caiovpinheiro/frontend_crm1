"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  IconChartBar,
  IconClipboardList,
  IconLoader2,
  IconRefresh,
  IconTrophy,
  IconUsers,
} from "@tabler/icons-react";

import { GlassCard } from "@/components/crm/glass-card";
import { KpiCard } from "@/components/crm/kpi-card";
import { KpiStrip } from "@/components/crm/kpi-strip";
import { DateRangePicker, type DateRange } from "@/components/crm/date-range-picker";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { EmptyState } from "@/components/crm/empty-state";
import { ButtonGlass } from "@/components/crm/button-glass";
import { apiUrl } from "@/lib/api";
import { listTeamUsers } from "@/features/pipeline-v2/api/users";
import { useDepartments } from "@/features/conversations-settings/hooks/use-departments";
import { cn } from "@/lib/utils";
import { textMatchesQuery } from "@/features/dashboard-v2/format";
import { SortableWidgetStack } from "@/features/dashboard-v2/components/sortable-widget-stack";
import {
  TABULATION_WIDGET_IDS,
  useDashboardWidgetOrder,
} from "@/features/dashboard-v2/use-dashboard-widget-order";

type AnalyticsResponse = {
  total: number;
  page: number;
  perPage: number;
  // Cardinalidade real — byTabulation/byUser são rankings top 20.
  distinctTabulations: number;
  distinctUsers: number;
  byTabulation: Array<{
    tabulationId: string;
    name: string;
    number?: number | null;
    path: string;
    // A mesma folha existe em vários departamentos ("Sem Resposta"); sem isto
    // o ranking mostra linhas de texto idêntico. O id serve ao atalho de
    // filtro na própria linha.
    departmentId: string | null;
    departmentName: string | null;
    count: number;
  }>;
  byUser: Array<{ userId: string; name: string; count: number }>;
  items: Array<{
    id: string;
    occurredAt: string;
    conversationId: string | null;
    contactName: string | null;
    actorName: string | null;
    tabulationPath: string | null;
    tabulationNumber?: number | null;
    departmentName: string | null;
  }>;
};

// Abre sempre no dia corrente: a leitura do dia é o uso diário do painel, e
// os presets do seletor cobrem o histórico em um clique.
function defaultRange(): DateRange {
  const today = startOfDay(new Date());
  return { from: today, to: today };
}

export function TabulationsDashboard({
  period,
  search = "",
  hideLocalFilters = false,
  reorderable = false,
  actorUserId: actorUserIdProp,
  onActorUserIdChange,
  departmentId: departmentIdProp,
  onDepartmentIdChange,
}: {
  period?: { from: string; to: string };
  search?: string;
  hideLocalFilters?: boolean;
  reorderable?: boolean;
  actorUserId?: string;
  onActorUserIdChange?: (id: string) => void;
  departmentId?: string;
  onDepartmentIdChange?: (id: string) => void;
} = {}) {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [actorUserIdLocal, setActorUserIdLocal] = useState<string>("");
  const [departmentIdLocal, setDepartmentIdLocal] = useState<string>("");
  const [page, setPage] = useState(1);
  const { order, reorder } = useDashboardWidgetOrder("tabulations", TABULATION_WIDGET_IDS);

  const actorUserId = actorUserIdProp ?? actorUserIdLocal;
  const departmentId = departmentIdProp ?? departmentIdLocal;
  const setActorUserId = onActorUserIdChange ?? setActorUserIdLocal;
  const setDepartmentId = onDepartmentIdChange ?? setDepartmentIdLocal;

  const departmentsQuery = useDepartments();
  const usersQuery = useQuery({
    queryKey: ["team-users-tabulations"],
    queryFn: () => listTeamUsers(),
    staleTime: 60_000,
  });

  // O seletor devolve os dois extremos à meia-noite (todos os presets usam
  // startOfDay, e clicar num dia no calendário também). Mandando o `to` cru,
  // o backend filtra `occurredAt <= dia 00:00` e o último dia do período fica
  // de fora — em "Hoje" isso zerava o painel inteiro.
  const fromIso = period?.from
    ? period.from
    : range.from
      ? startOfDay(range.from).toISOString()
      : "";
  const toIso = period?.to
    ? period.to
    : range.to
      ? endOfDay(range.to).toISOString()
      : "";

  const analyticsQuery = useQuery({
    queryKey: [
      "tabulation-analytics",
      fromIso,
      toIso,
      actorUserId,
      departmentId,
      page,
    ],
    queryFn: async (): Promise<AnalyticsResponse> => {
      const sp = new URLSearchParams();
      if (fromIso) sp.set("from", fromIso);
      if (toIso) sp.set("to", toIso);
      if (actorUserId) sp.set("actorUserId", actorUserId);
      if (departmentId) sp.set("departmentId", departmentId);
      sp.set("page", String(page));
      sp.set("perPage", "25");
      const res = await fetch(apiUrl(`/api/analytics/tabulations?${sp}`), {
        credentials: "include",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
          detail?: string;
        };
        throw new Error(
          [err.message ?? `Erro ao carregar dashboard (HTTP ${res.status})`, err.detail]
            .filter(Boolean)
            .join(" — "),
        );
      }
      return res.json();
    },
    enabled: Boolean(fromIso && toIso),
    staleTime: 15_000,
  });

  useEffect(() => {
    setPage(1);
  }, [fromIso, toIso, actorUserId, departmentId]);

  const data = analyticsQuery.data;
  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.perPage));
  }, [data]);

  const loadingValue = analyticsQuery.isLoading ? "…" : "—";

  const userOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...(usersQuery.data ?? []).map((u) => ({ value: u.id, label: u.name })),
    ],
    [usersQuery.data],
  );
  // Atalho do ranking. Clicar no departamento já selecionado limpa o filtro:
  // sem o toggle o operador entra no recorte e não acha a saída sem voltar ao
  // dropdown do topo.
  const toggleDepartment = (id: string) => {
    setDepartmentId(departmentId === id ? "" : id);
    setPage(1);
  };

  const departmentOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...(departmentsQuery.data ?? []).map((d) => ({
        value: d.id,
        label: d.name,
      })),
    ],
    [departmentsQuery.data],
  );

  const byTabulation = (data?.byTabulation ?? []).filter(
    (row) =>
      textMatchesQuery(row.path, search) ||
      textMatchesQuery(row.name, search) ||
      textMatchesQuery(row.departmentName, search),
  );
  const byUser = (data?.byUser ?? []).filter((row) =>
    textMatchesQuery(row.name, search),
  );
  const logItems = (data?.items ?? []).filter(
    (row) =>
      textMatchesQuery(row.actorName, search) ||
      textMatchesQuery(row.contactName, search) ||
      textMatchesQuery(row.tabulationPath, search) ||
      textMatchesQuery(row.departmentName, search),
  );
  const maxTab = byTabulation[0]?.count ?? 1;
  const maxUser = byUser[0]?.count ?? 1;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {!hideLocalFilters ? (
      <GlassCard className="relative z-30 flex min-w-0 flex-col gap-3 overflow-visible p-3.5 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex w-full min-w-0 flex-col gap-1 sm:min-w-[220px] sm:flex-1">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            Período
          </span>
          <DateRangePicker
            className="w-full"
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
          />
        </div>
        <div className="flex w-full min-w-0 flex-col gap-1 sm:min-w-[180px] sm:flex-1">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            Usuário
          </span>
          {/* DropdownGlass (não <select> nativo): no DevTools/mobile o popup
              nativo estoura a largura da tela; aqui a lista segue o gatilho. */}
          <DropdownGlass
            options={userOptions}
            value={actorUserId}
            placeholder="Todos"
            searchable
            searchPlaceholder="Buscar usuário…"
            matchTriggerWidth
            triggerClassName="w-full min-w-0"
            onValueChange={(next) => {
              setActorUserId(next);
              setPage(1);
            }}
          />
        </div>
        <div className="flex w-full min-w-0 flex-col gap-1 sm:min-w-[180px] sm:flex-1">
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            Departamento
          </span>
          <DropdownGlass
            options={departmentOptions}
            value={departmentId}
            placeholder="Todos"
            searchable
            searchPlaceholder="Buscar departamento…"
            matchTriggerWidth
            triggerClassName="w-full min-w-0"
            onValueChange={(next) => {
              setDepartmentId(next);
              setPage(1);
            }}
          />
        </div>
        <ButtonGlass
          type="button"
          variant="glass"
          size="sm"
          className="w-full sm:ml-auto sm:w-auto"
          onClick={() => analyticsQuery.refetch()}
          disabled={analyticsQuery.isFetching}
        >
          {analyticsQuery.isFetching ? (
            <IconLoader2 size={14} className="animate-spin" />
          ) : (
            <IconRefresh size={14} />
          )}
          Atualizar
        </ButtonGlass>
      </GlassCard>
      ) : null}

      {/* Sem isto uma falha na API fica idêntica a "período sem tabulação":
          os KPIs caem no traço e as listas mostram estado vazio. */}
      {analyticsQuery.isError && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/8 px-3.5 py-2.5 font-body text-[12.5px] text-[var(--color-danger)]">
          {(analyticsQuery.error as Error).message} — os números abaixo não
          refletem o período.
        </div>
      )}

      <SortableWidgetStack
        disabled={!reorderable}
        droppableId="dashboard-tabulations"
        ids={reorderable ? order : [...TABULATION_WIDGET_IDS]}
        labels={{
          kpis: "Indicadores",
          rankings: "Rankings",
          log: "Log de tabulações",
        }}
        onReorder={reorder}
        render={(id) => {
          if (id === "kpis") {
            return (
      <KpiStrip aria-label="Indicadores de tabulações" cardMinWidth={168}>
        <KpiCard
          label="Tabulações no período"
          value={data?.total ?? loadingValue}
          icon={<IconClipboardList size={20} stroke={2.2} />}
        />
        <KpiCard
          label="Motivos distintos"
          value={data?.distinctTabulations ?? loadingValue}
          icon={<IconChartBar size={20} stroke={2.2} />}
        />
        <KpiCard
          label="Agentes que tabularam"
          value={data?.distinctUsers ?? loadingValue}
          icon={<IconUsers size={20} stroke={2.2} />}
        />
        <KpiCard
          label="Top motivo"
          value={data?.byTabulation[0]?.name ?? loadingValue}
          hint={
            data?.byTabulation[0]
              ? [
                  `${data.byTabulation[0].count}×`,
                  data.byTabulation[0].departmentName,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
          icon={<IconTrophy size={20} stroke={2.2} />}
        />
      </KpiStrip>
            );
          }
          if (id === "rankings") {
            return (
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <GlassCard className="min-w-0 overflow-hidden p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">
            Principais tabulações
          </h3>
          {!byTabulation.length ? (
            <EmptyState
              icon={<IconChartBar size={22} />}
              title="Sem tabulações no período"
              description="Encerramentos manuais com tabulação aparecerão aqui."
              className="py-8"
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {byTabulation.map((row) => (
                <li key={row.tabulationId} className="flex min-w-0 flex-col gap-1">
                  <div className="flex min-w-0 items-baseline justify-between gap-2 text-[12.5px]">
                    <span
                      className="min-w-0 flex-1 truncate text-[var(--text-primary)]"
                      title={
                        row.departmentName
                          ? `${row.path} / ${row.departmentName}`
                          : row.path
                      }
                    >
                      {row.path}
                      {row.number != null ? ` (#${row.number})` : ""}
                      {row.departmentId && row.departmentName && (
                        <>
                          <span
                            className="mx-1 text-[var(--text-muted)]"
                            aria-hidden
                          >
                            /
                          </span>
                          {/* Só o nome do departamento é clicável — se a linha
                              ganhar comportamento próprio depois, o clique
                              daqui não escapa pra ela. */}
                          <button
                            type="button"
                            aria-pressed={departmentId === row.departmentId}
                            aria-label={
                              departmentId === row.departmentId
                                ? `Limpar filtro de ${row.departmentName}`
                                : `Filtrar por ${row.departmentName}`
                            }
                            title={
                              departmentId === row.departmentId
                                ? `Limpar filtro de ${row.departmentName}`
                                : `Filtrar por ${row.departmentName}`
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDepartment(row.departmentId as string);
                            }}
                            className="cursor-pointer text-[11px] text-[var(--text-muted)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline focus-visible:text-[var(--text-primary)] focus-visible:underline focus-visible:outline-none"
                          >
                            {row.departmentName}
                          </button>
                        </>
                      )}
                    </span>
                    <span className="shrink-0 font-medium text-[var(--text-muted)]">
                      {row.count}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--glass-bg-subtle)]">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${(row.count / maxTab) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="min-w-0 overflow-hidden p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">
            Por usuário
          </h3>
          {!byUser.length ? (
            <EmptyState
              icon={<IconUsers size={22} />}
              title="Nenhum usuário no filtro"
              description="Ajuste o período ou remova o filtro de usuário."
              className="py-8"
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {byUser.map((row) => (
                <li key={row.userId} className="flex min-w-0 flex-col gap-1">
                  <div className="flex min-w-0 items-baseline justify-between gap-2 text-[12.5px]">
                    <span
                      className="min-w-0 flex-1 truncate text-[var(--text-primary)]"
                      title={row.name}
                    >
                      {row.name}
                    </span>
                    <span className="shrink-0 font-medium text-[var(--text-muted)]">
                      {row.count}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--glass-bg-subtle)]">
                    <div
                      className="h-full rounded-full bg-violet-500/70"
                      style={{ width: `${(row.count / maxUser) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
            );
          }
          if (id === "log") {
            return (
      <GlassCard className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-4 py-3">
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
            Log de tabulações
          </h3>
          <span className="text-[11px] text-[var(--text-muted)]">
            {data ? `${data.total} registro(s)` : "—"}
          </span>
        </div>
        {analyticsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-[var(--text-muted)]">
            <IconLoader2 size={16} className="animate-spin" />
            Carregando…
          </div>
        ) : !logItems.length ? (
          <div className="p-6">
            <EmptyState
              icon={<IconClipboardList size={22} />}
              title="Nenhum registro"
              description="Quando um agente tabular ao encerrar, o evento aparece neste log."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-[var(--glass-bg-subtle)] text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Quando</th>
                  <th className="px-4 py-2.5 font-medium">Agente</th>
                  <th className="px-4 py-2.5 font-medium">Contato</th>
                  <th className="px-4 py-2.5 font-medium">Tabulação</th>
                  <th className="px-4 py-2.5 font-medium">Depto</th>
                </tr>
              </thead>
              <tbody>
                {logItems.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-[var(--glass-border)] text-[var(--text-primary)]"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">
                      {format(parseISO(row.occurredAt), "dd/MM/yy HH:mm", {
                        locale: ptBR,
                      })}
                    </td>
                    <td className="px-4 py-2.5">{row.actorName ?? "—"}</td>
                    <td className="px-4 py-2.5">{row.contactName ?? "—"}</td>
                    <td
                      className="max-w-[280px] truncate px-4 py-2.5"
                      title={
                        row.tabulationNumber != null && row.tabulationPath
                          ? `${row.tabulationPath} (#${row.tabulationNumber})`
                          : (row.tabulationPath ?? "")
                      }
                    >
                      {row.tabulationPath ?? "—"}
                      {row.tabulationNumber != null
                        ? ` (#${row.tabulationNumber})`
                        : ""}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">
                      {row.departmentName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.perPage ? (
          <div className="flex items-center justify-between border-t border-[var(--glass-border)] px-4 py-2.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={cn("text-[12px] text-primary disabled:opacity-40")}
            >
              Anterior
            </button>
            <span className="text-[11px] text-[var(--text-muted)]">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="text-[12px] text-primary disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        ) : null}
      </GlassCard>
            );
          }
          return null;
        }}
      />
    </div>
  );
}
