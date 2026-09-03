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

import { AppLoading } from "@/components/crm/app-loading";
import { GlassCard } from "@/components/crm/glass-card";
import { STUCK_TIMEOUT_MS } from "@/hooks/use-stuck-timeout";
import { KpiCard } from "@/components/crm/kpi-card";
import { KpiStrip } from "@/components/crm/kpi-strip";
import { DateRangePicker, type DateRange } from "@/components/crm/date-range-picker";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { EmptyState } from "@/components/crm/empty-state";
import { ButtonGlass } from "@/components/crm/button-glass";
import { RankBarList } from "@/components/crm/dashboard/rank-bar-list";
import { listTeamUsers } from "@/features/pipeline-v2/api/users";
import { useDepartments } from "@/features/conversations-settings/hooks/use-departments";
import { cn } from "@/lib/utils";
import { textMatchesQuery } from "@/features/dashboard-v2/format";
import { SortableWidgetStack } from "@/features/dashboard-v2/components/sortable-widget-stack";
import {
  TABULATION_WIDGET_IDS,
  useDashboardWidgetOrder,
  type TabulationWidgetId,
} from "@/features/dashboard-v2/use-dashboard-widget-order";
import {
  useTabulationAnalytics,
  type TabulationAnalyticsResponse,
} from "@/features/dashboard-v2/use-tabulation-analytics";

function defaultRange(): DateRange {
  const today = startOfDay(new Date());
  return { from: today, to: today };
}

export const TABULATION_WIDGET_LABELS: Record<TabulationWidgetId, string> = {
  kpis: "Tabulações",
  top: "Principais tabulações",
  byUser: "Por usuário",
  log: "Log de tabulações",
};

export function TabulationKpiWidget({
  data,
  loadingValue,
}: {
  data?: TabulationAnalyticsResponse;
  loadingValue: string;
}) {
  return (
    <KpiStrip
      aria-label="Indicadores de tabulações"
      cardMinWidth={168}
      gridClassName="grid grid-cols-2 gap-2.5 xl:grid-cols-4"
    >
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
            ? [`${data.byTabulation[0].count}×`, data.byTabulation[0].departmentName]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        icon={<IconTrophy size={20} stroke={2.2} />}
      />
    </KpiStrip>
  );
}

export function TabulationTopWidget({
  rows,
  departmentId,
  departmentIds,
  onToggleDepartment,
}: {
  rows: TabulationAnalyticsResponse["byTabulation"];
  /** Um departamento (página de tabulações). Preferir `departmentIds`. */
  departmentId?: string;
  departmentIds?: string[];
  onToggleDepartment: (id: string) => void;
}) {
  const selectedDeptIds = departmentIds ?? (departmentId ? [departmentId] : []);
  return (
    <GlassCard className="min-w-0 overflow-hidden p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-foreground">Principais tabulações</h3>
      {!rows.length ? (
        <EmptyState
          icon={<IconChartBar size={22} />}
          title="Sem tabulações no período"
          description="Encerramentos manuais com tabulação aparecerão aqui."
          className="py-6"
        />
      ) : (
        <RankBarList
          rows={rows.map((row) => ({
            id: row.tabulationId,
            label: row.number != null ? `${row.path} (#${row.number})` : row.path,
            title: row.departmentName ? `${row.path} / ${row.departmentName}` : row.path,
            value: row.count,
            labelExtra:
              row.departmentId && row.departmentName ? (
                <button
                  type="button"
                  aria-pressed={selectedDeptIds.includes(row.departmentId)}
                  aria-label={
                    selectedDeptIds.includes(row.departmentId)
                      ? `Limpar filtro de ${row.departmentName}`
                      : `Filtrar por ${row.departmentName}`
                  }
                  title={
                    selectedDeptIds.includes(row.departmentId)
                      ? `Limpar filtro de ${row.departmentName}`
                      : `Filtrar por ${row.departmentName}`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDepartment(row.departmentId as string);
                  }}
                  className="mt-0.5 truncate text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {row.departmentName}
                </button>
              ) : undefined,
          }))}
        />
      )}
    </GlassCard>
  );
}

export function TabulationByUserWidget({
  rows,
}: {
  rows: TabulationAnalyticsResponse["byUser"];
}) {
  return (
    <GlassCard className="min-w-0 overflow-hidden p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-foreground">Por usuário</h3>
      {!rows.length ? (
        <EmptyState
          icon={<IconUsers size={22} />}
          title="Nenhum usuário no filtro"
          description="Ajuste o período ou remova o filtro de usuário."
          className="py-6"
        />
      ) : (
        <RankBarList
          rows={rows.map((row) => ({
            id: row.userId,
            label: row.name,
            title: row.name,
            value: row.count,
          }))}
        />
      )}
    </GlassCard>
  );
}

export function TabulationLogWidget({
  data,
  items,
  page,
  totalPages,
  isLoading,
  onPage,
}: {
  data?: TabulationAnalyticsResponse;
  items: TabulationAnalyticsResponse["items"];
  page: number;
  totalPages: number;
  isLoading: boolean;
  onPage: (next: number) => void;
}) {
  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-[13px] font-semibold text-foreground">Log de tabulações</h3>
        <span className="text-[11px] text-muted-foreground">
          {data ? `${data.total} registro(s)` : "—"}
        </span>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
          <IconLoader2 size={16} className="animate-spin" />
          Carregando…
        </div>
      ) : !items.length ? (
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
            <thead className="bg-secondary/50 text-[13px] font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">Quando</th>
                <th className="px-4 py-2 font-semibold">Agente</th>
                <th className="px-4 py-2 font-semibold">Contato</th>
                <th className="px-4 py-2 font-semibold">Tabulação</th>
                <th className="px-4 py-2 font-semibold">Depto</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-border text-foreground">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {format(parseISO(row.occurredAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </td>
                  <td className="px-4 py-2">{row.actorName ?? "—"}</td>
                  <td className="px-4 py-2">{row.contactName ?? "—"}</td>
                  <td
                    className="max-w-[280px] truncate px-4 py-2"
                    title={
                      row.tabulationNumber != null && row.tabulationPath
                        ? `${row.tabulationPath} (#${row.tabulationNumber})`
                        : (row.tabulationPath ?? "")
                    }
                  >
                    {row.tabulationPath ?? "—"}
                    {row.tabulationNumber != null ? ` (#${row.tabulationNumber})` : ""}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{row.departmentName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > data.perPage ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(Math.max(1, page - 1))}
            className="text-[12px] text-primary disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-[11px] text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            className="text-[12px] text-primary disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      ) : null}
    </GlassCard>
  );
}

export function TabulationsDashboard({
  period,
  search = "",
  hideLocalFilters = false,
  reorderable = false,
  organizing = false,
  widgetOrder,
  onReorderWidgets,
  onHideWidget,
  actorUserId: actorUserIdProp,
  onActorUserIdChange,
  departmentId: departmentIdProp,
  onDepartmentIdChange,
}: {
  period?: { from: string; to: string };
  search?: string;
  hideLocalFilters?: boolean;
  reorderable?: boolean;
  organizing?: boolean;
  widgetOrder?: string[];
  onReorderWidgets?: (ids: string[]) => void;
  onHideWidget?: (id: string) => void;
  actorUserId?: string;
  onActorUserIdChange?: (id: string) => void;
  departmentId?: string;
  onDepartmentIdChange?: (id: string) => void;
} = {}) {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [actorUserIdLocal, setActorUserIdLocal] = useState<string>("");
  const [departmentIdLocal, setDepartmentIdLocal] = useState<string>("");
  const [page, setPage] = useState(1);
  const localOrder = useDashboardWidgetOrder("tabulations", TABULATION_WIDGET_IDS, {
    allowHide: reorderable && !widgetOrder,
    enabled: !widgetOrder,
  });
  const order = widgetOrder ?? localOrder.order;
  const reorder = onReorderWidgets ?? localOrder.reorder;
  const hide = onHideWidget ?? localOrder.hide;

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

  const analyticsQuery = useTabulationAnalytics({
    fromIso,
    toIso,
    actorUserIds: actorUserId ? [actorUserId] : [],
    departmentIds: departmentId ? [departmentId] : [],
    page,
  });

  useEffect(() => {
    setPage(1);
  }, [fromIso, toIso, actorUserId, departmentId]);

  const [analyticsPainted, setAnalyticsPainted] = useState(false);
  const analyticsSettled = analyticsQuery.isFetched || analyticsQuery.isError;
  useEffect(() => {
    if (analyticsSettled) setAnalyticsPainted(true);
  }, [analyticsSettled]);
  useEffect(() => {
    if (analyticsPainted) return;
    const id = window.setTimeout(() => setAnalyticsPainted(true), STUCK_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [analyticsPainted]);

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
  const byUser = (data?.byUser ?? []).filter((row) => textMatchesQuery(row.name, search));
  const logItems = (data?.items ?? []).filter(
    (row) =>
      textMatchesQuery(row.actorName, search) ||
      textMatchesQuery(row.contactName, search) ||
      textMatchesQuery(row.tabulationPath, search) ||
      textMatchesQuery(row.departmentName, search),
  );

  const ids = reorderable ? order : [...TABULATION_WIDGET_IDS];

  function renderWidget(id: string) {
    if (id === "kpis") {
      return <TabulationKpiWidget data={data} loadingValue={loadingValue} />;
    }
    if (id === "top") {
      return (
        <TabulationTopWidget
          rows={byTabulation}
          departmentId={departmentId}
          onToggleDepartment={toggleDepartment}
        />
      );
    }
    if (id === "byUser") {
      return <TabulationByUserWidget rows={byUser} />;
    }
    if (id === "log") {
      return (
        <TabulationLogWidget
          data={data}
          items={logItems}
          page={page}
          totalPages={totalPages}
          isLoading={analyticsQuery.isLoading}
          onPage={setPage}
        />
      );
    }
    return null;
  }

  if (hideLocalFilters && !analyticsPainted) {
    return <AppLoading variant="inline" className="min-h-0 flex-1" timeoutMs={0} />;
  }

  const compactGrid = (
    <div className="grid grid-cols-12 gap-2.5">
      {ids.map((id) => (
        <div
          key={id}
          className={cn(
            "min-w-0",
            id === "top" || id === "byUser" ? "col-span-12 lg:col-span-6" : "col-span-12",
          )}
        >
          {renderWidget(id)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {!hideLocalFilters ? (
        <GlassCard className="relative z-30 flex min-w-0 flex-col gap-3 overflow-visible p-3.5 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex w-full min-w-0 flex-col gap-1 sm:min-w-[220px] sm:flex-1">
            <span className="text-[11px] font-medium text-muted-foreground">Período</span>
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
            <span className="text-[11px] font-medium text-muted-foreground">Usuário</span>
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
            <span className="text-[11px] font-medium text-muted-foreground">Departamento</span>
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

      {analyticsQuery.isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 font-body text-[12.5px] text-destructive">
          {(analyticsQuery.error as Error).message} — os números abaixo não refletem o período.
        </div>
      )}

      {reorderable ? (
        organizing ? (
          <SortableWidgetStack
            organizing
            droppableId="dashboard-tabulations"
            ids={ids}
            labels={TABULATION_WIDGET_LABELS}
            onReorder={reorder}
            onRemove={hide}
            render={renderWidget}
          />
        ) : (
          compactGrid
        )
      ) : (
        compactGrid
      )}
    </div>
  );
}

export { TABULATION_WIDGET_IDS };
export type { TabulationWidgetId };
