"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Check, LayoutDashboard, Move, Plus } from "lucide-react";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRail } from "@/components/crm/nav-rail";
import { STUCK_TIMEOUT_MS } from "@/hooks/use-stuck-timeout";
import { HeaderTabs, SectionHeader } from "@/components/crm/section-header";
import { PeriodCalendarButton } from "@/components/crm/period-calendar-button";
import { PainelBlockError, PainelSkeleton } from "@/components/crm/dashboard/painel-block";
import { DealStageWidget, PainelDealWidget } from "@/components/crm/dashboard/painel-deals";
import {
  PainelAgoraWidget,
  PainelServiceWidget,
} from "@/components/crm/dashboard/painel-service";
import { OperatorDashboardWidget } from "@/components/crm/dashboard/operator-dashboard";
import { SystemUsageCard } from "@/components/crm/dashboard/system-usage-card";
import { CustomMetricCard } from "@/components/crm/dashboard/custom-metric-card";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import {
  TABULATION_WIDGET_LABELS,
  TabulationByUserWidget,
  TabulationKpiWidget,
  TabulationLogWidget,
  TabulationTopWidget,
} from "@/app/(app)/settings/tabulations/tabulations-dashboard";
import { useUserRole } from "@/hooks/use-user-role";
import { useDepartments } from "@/features/conversations-settings/hooks/use-departments";
import { listTeamUsers } from "@/features/pipeline-v2/api/users";

import { AddDashboardCardDialog } from "@/features/dashboard-v2/components/add-dashboard-card-dialog";
import { DashboardSearchFilterBar } from "@/features/dashboard-v2/components/dashboard-filters";
import { DashboardPeriodPanel } from "@/features/dashboard-v2/components/dashboard-period-panel";
import { FunnelPipelinePicker } from "@/features/dashboard-v2/components/funnel-pipeline-picker";
import { SortableWidgetGrid } from "@/features/dashboard-v2/components/sortable-widget-grid";
import { SortableWidgetStack } from "@/features/dashboard-v2/components/sortable-widget-stack";
import {
  useDashboardFilterOptions,
  useDashboardMe,
  usePainelAgora,
  usePainelCustomFields,
  usePainelDeals,
  usePainelEventCards,
  usePainelService,
  useSystemUsageToday,
} from "@/features/dashboard-v2/hooks";
import {
  periodToRangeISO,
  useDashboardFilters,
} from "@/features/dashboard-v2/use-dashboard-filters";
import {
  readDashboardUiState,
  useDashboardStorageScope,
  writeDashboardUiState,
} from "@/features/dashboard-v2/dashboard-persist";
import {
  DEAL_CORE_WIDGET_IDS,
  isStageWidgetId,
  parseStageWidgetId,
  useNegociosGrid,
  type DealCoreWidgetId,
} from "@/features/dashboard-v2/use-negocios-grid";
import {
  isTabulationWidgetId,
  OPERATOR_WIDGET_IDS,
  SERVICE_BOARD_WIDGET_IDS,
  SERVICE_WIDGET_IDS,
  TABULATION_WIDGET_IDS,
  useDashboardWidgetOrder,
  type OperatorWidgetId,
  type ServiceWidgetId,
} from "@/features/dashboard-v2/use-dashboard-widget-order";
import { useTabulationAnalytics } from "@/features/dashboard-v2/use-tabulation-analytics";
import { textMatchesQuery } from "@/features/dashboard-v2/format";

const DASHBOARD_TABS = [
  { key: "deals", label: "Negócios" },
  { key: "service", label: "Atendimentos" },
] as const;

type DashboardTabKey = (typeof DASHBOARD_TABS)[number]["key"];

const DEAL_LABELS: Record<string, string> = {
  kpis: "Indicadores",
  funnel: "Funil e progresso",
  stages: "Etapas",
  usage: "Uso do sistema hoje",
  evolution: "Evolução diária",
  agents: "Ganhos por agente",
  sources: "Origem",
  exceptions: "Exceções",
};

const SERVICE_LABELS: Record<string, string> = {
  agora: "Agora",
  volume: "Volume",
  heatmap: "Atendimentos e horário",
  tempo: "Tempo de resposta",
  summaries: "Por departamento e atendente",
  connections: "Conexão e plataforma",
  attendants: "Tabelas",
  channels: "Canal e motivo",
  exceptions: "Exceções",
  kpis: TABULATION_WIDGET_LABELS.kpis,
  top: TABULATION_WIDGET_LABELS.top,
  byUser: TABULATION_WIDGET_LABELS.byUser,
  log: TABULATION_WIDGET_LABELS.log,
};

const OPERATOR_LABELS: Record<string, string> = {
  kpis: "Indicadores",
  conversations: "Conversas",
  tasks: "Tarefas",
  stalled: "Negócios parados",
};

interface DashboardV2ClientPageProps {
  navRail?: React.ReactNode;
}

function querySettled(query: { isFetched: boolean; isError: boolean }) {
  return query.isFetched || query.isError;
}

/** Liga uma vez (sucesso, erro ou timeout) e não desliga no refetch. */
function useLatchedReady(ready: boolean, timeoutMs = STUCK_TIMEOUT_MS) {
  const [released, setReleased] = useState(false);
  useEffect(() => {
    if (ready) setReleased(true);
  }, [ready]);
  useEffect(() => {
    if (released) return;
    const id = window.setTimeout(() => setReleased(true), timeoutMs);
    return () => window.clearTimeout(id);
  }, [released, timeoutMs]);
  return released;
}

export default function DashboardV2ClientPage({
  navRail,
}: DashboardV2ClientPageProps = {}) {
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";
  const { isManagerUp, ready } = useUserRole();

  if (!ready) {
    return (
      <Shell navRail={navRail} title="Dashboard">
        <AppLoading variant="inline" className="min-h-0 flex-1" timeoutMs={0} />
      </Shell>
    );
  }

  return isManagerUp ? (
    <ManagerHome navRail={navRail} isAuthenticated={isAuthenticated} />
  ) : (
    <OperatorHome navRail={navRail} isAuthenticated={isAuthenticated} />
  );
}

function OperatorHome({
  navRail,
  isAuthenticated,
}: {
  navRail?: React.ReactNode;
  isAuthenticated: boolean;
}) {
  const query = useDashboardMe(isAuthenticated);
  const [search, setSearch] = useState("");
  const [organizing, setOrganizing] = useState(false);
  const { order, reorder, hydrated: orderHydrated } = useDashboardWidgetOrder(
    "operator",
    OPERATOR_WIDGET_IDS,
  );
  const painted = useLatchedReady(
    !isAuthenticated || ((querySettled(query) || Boolean(query.error)) && orderHydrated),
  );

  if (!painted) {
    return (
      <Shell navRail={navRail} title="Sua fila">
        <AppLoading variant="inline" className="min-h-0 flex-1" timeoutMs={0} />
      </Shell>
    );
  }

  return (
    <Shell
      navRail={navRail}
      title="Sua fila"
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Pesquisar na fila..."
      menuSlot={
        <PageActionsMenu
          aria-label="Ações do dashboard"
          items={[
            {
              icon: organizing ? <Check className="size-4" /> : <Move className="size-4" />,
              label: organizing ? "Concluir organização" : "Organizar cards",
              onClick: () => setOrganizing((value) => !value),
              active: organizing,
            },
          ]}
        />
      }
    >
      <QueryState isLoading={query.isLoading} error={query.error} hasData={!!query.data}>
        {query.data ? (
          <SortableWidgetStack
            ids={order}
            labels={OPERATOR_LABELS}
            onReorder={reorder}
            organizing={organizing}
            droppableId="dashboard-fila"
            render={(id) => (
              <OperatorDashboardWidget
                id={id as OperatorWidgetId}
                data={query.data}
                search={search}
              />
            )}
          />
        ) : null}
      </QueryState>
    </Shell>
  );
}

function ManagerHome({
  navRail,
  isAuthenticated,
}: {
  navRail?: React.ReactNode;
  isAuthenticated: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DashboardTabKey>("deals");
  const [search, setSearch] = useState("");
  const [clock, setClock] = useState<"business" | "elapsed">("business");
  const [tabActorUserId, setTabActorUserId] = useState("");
  const [tabDepartmentId, setTabDepartmentId] = useState("");
  const uiScope = useDashboardStorageScope();
  const [uiHydrated, setUiHydrated] = useState(false);
  const isDeals = activeTab === "deals";
  const isService = activeTab === "service";

  const optionsQuery = useDashboardFilterOptions(isAuthenticated);
  const options = optionsQuery.data;
  const { filters, patch } = useDashboardFilters(options?.pipelines);
  const dealsQuery = usePainelDeals(filters, isAuthenticated && isDeals);
  const agoraQuery = usePainelAgora(clock, isAuthenticated && isService);
  const serviceQuery = usePainelService(filters, clock, isAuthenticated && isService);
  const period = useMemo(() => periodToRangeISO(filters), [filters]);
  const effectivePipelineId = filters.pipelineIds[0] ?? filters.pipelineId;
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [tabLogPage, setTabLogPage] = useState(1);
  const grid = useNegociosGrid();
  const fieldIds = useMemo(
    () => grid.cards.filter((c) => c.type === "customField" && c.fieldId).map((c) => c.fieldId!),
    [grid.cards],
  );
  const customFieldsQuery = usePainelCustomFields(filters, fieldIds, isAuthenticated && isDeals);
  const eventCards = usePainelEventCards(filters, grid.cards, isAuthenticated && isDeals);
  const usageQuery = useSystemUsageToday(isAuthenticated && isDeals);

  const departmentsQuery = useDepartments();
  const usersQuery = useQuery({
    queryKey: ["team-users-tabulations"],
    queryFn: () => listTeamUsers(),
    staleTime: 60_000,
    enabled: isAuthenticated && isService,
  });

  const serviceOrder = useDashboardWidgetOrder("service", SERVICE_BOARD_WIDGET_IDS, {
    allowHide: true,
    pinnedIds: SERVICE_WIDGET_IDS,
  });
  const hasServiceTabWidgets = serviceOrder.order.some((id) => isTabulationWidgetId(id));
  const tabAnalyticsQuery = useTabulationAnalytics({
    fromIso: period.from,
    toIso: period.to,
    actorUserId: tabActorUserId,
    departmentId: tabDepartmentId,
    page: tabLogPage,
    enabled: isAuthenticated && isService && hasServiceTabWidgets,
  });

  useEffect(() => {
    setTabLogPage(1);
  }, [period.from, period.to, tabActorUserId, tabDepartmentId]);

  useEffect(() => {
    if (!uiScope.ready || !uiScope.keyPart || !uiScope.userId) return;
    const saved = readDashboardUiState(uiScope.keyPart, uiScope.userId);
    if (saved) {
      if (saved.tab === "tabulations") {
        setActiveTab("service");
      } else if (saved.tab === "deals" || saved.tab === "service") {
        setActiveTab(saved.tab);
      }
      if (saved.clock === "business" || saved.clock === "elapsed") setClock(saved.clock);
      if (typeof saved.tabActorUserId === "string") setTabActorUserId(saved.tabActorUserId);
      if (typeof saved.tabDepartmentId === "string") setTabDepartmentId(saved.tabDepartmentId);
    }
    setUiHydrated(true);
  }, [uiScope.ready, uiScope.keyPart, uiScope.userId]);

  useEffect(() => {
    if (!uiHydrated || !uiScope.keyPart) return;
    writeDashboardUiState(uiScope.keyPart, {
      tab: activeTab,
      clock,
      tabActorUserId,
      tabDepartmentId,
    });
  }, [uiHydrated, uiScope.keyPart, activeTab, clock, tabActorUserId, tabDepartmentId]);

  const optionsSettled = !isAuthenticated || querySettled(optionsQuery);
  const dealsSettled = !isAuthenticated || querySettled(dealsQuery);
  const usageSettled = !isAuthenticated || querySettled(usageQuery);
  const customSettled =
    fieldIds.length === 0 || !isAuthenticated || querySettled(customFieldsQuery);
  const serviceSettled =
    !isAuthenticated || (querySettled(serviceQuery) && querySettled(agoraQuery));
  const dealsReady = dealsSettled && usageSettled && customSettled && grid.hydrated;
  const serviceReady = serviceSettled && serviceOrder.hydrated;
  const primarySettled = !uiHydrated
    ? false
    : isDeals
      ? dealsReady && optionsSettled
      : serviceReady && optionsSettled;
  const pagePainted = useLatchedReady(primarySettled);

  const [tabPainted, setTabPainted] = useState<Partial<Record<DashboardTabKey, boolean>>>(
    {},
  );
  const tabReady = isDeals ? dealsReady : serviceReady;

  useEffect(() => {
    if (!pagePainted || !tabReady) return;
    setTabPainted((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }, [pagePainted, tabReady, activeTab]);

  useEffect(() => {
    if (!pagePainted || tabPainted[activeTab]) return;
    const id = window.setTimeout(() => {
      setTabPainted((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
    }, STUCK_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [pagePainted, tabPainted, activeTab]);

  const liveUserOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of options?.users ?? []) map.set(u.id, u.name);
    if (dealsQuery.data?.funnel.ok) {
      for (const stage of dealsQuery.data.funnel.data.stages) {
        for (const row of stage.byUser ?? []) map.set(row.id, row.name);
      }
    }
    if (dealsQuery.data?.agents.ok) {
      for (const row of dealsQuery.data.agents.data) map.set(row.id, row.name);
    }
    for (const row of usageQuery.data?.items ?? []) {
      if (row.userId) map.set(row.userId, row.userName ?? row.userId);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [options?.users, dealsQuery.data, usageQuery.data]);

  const periodActive = filters.period !== "last_30";

  const filterBar = (
    <DashboardSearchFilterBar
      search={search}
      onSearch={setSearch}
      filters={filters}
      onPatch={patch}
      options={options}
      effectivePipelineId={effectivePipelineId}
      variant={isService ? "service" : "deals"}
      actorUserId={tabActorUserId}
      onActorUserIdChange={setTabActorUserId}
      departmentId={tabDepartmentId}
      onDepartmentIdChange={setTabDepartmentId}
      userOptions={
        isService
          ? (usersQuery.data ?? []).map((u) => ({ value: u.id, label: u.name }))
          : (options?.users ?? []).map((u) => ({ value: u.id, label: u.name }))
      }
      liveUserOptions={liveUserOptions}
      departmentOptions={(departmentsQuery.data ?? []).map((d) => ({
        value: d.id,
        label: d.name,
      }))}
    />
  );

  const usageRows = (usageQuery.data?.items ?? []).filter((row) => {
    if (filters.userIds.length && !filters.userIds.includes(row.userId)) return false;
    return true;
  });

  const funnelStages = dealsQuery.data?.funnel.ok ? dealsQuery.data.funnel.data.stages : [];
  const stageIdsKey = funnelStages.map((s) => s.id).join("\0");

  useEffect(() => {
    if (!grid.hydrated || !stageIdsKey) return;
    grid.syncStages(stageIdsKey.split("\0"));
  }, [grid.hydrated, grid.syncStages, stageIdsKey]);

  const cardLabels = {
    ...DEAL_LABELS,
    ...Object.fromEntries(grid.cards.map((c) => [`card:${c.id}`, c.title])),
    ...Object.fromEntries(funnelStages.map((s) => [`stage:${s.id}`, s.name])),
  };

  const showTabLoader = !pagePainted || (!tabPainted[activeTab] && !tabReady);

  return (
    <Shell
      navRail={navRail}
      title="Dashboard"
      searchSlot={filterBar}
      period={
        <PeriodCalendarButton active={periodActive} align="start">
          <DashboardPeriodPanel filters={filters} onPatch={patch} />
        </PeriodCalendarButton>
      }
      actions={
        <HeaderTabs
          tabs={DASHBOARD_TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
          value={activeTab}
          onChange={setActiveTab}
        />
      }
      menuSlot={
        <PageActionsMenu
          aria-label="Ações do dashboard"
          items={[
            {
              icon: <Plus className="size-4" />,
              label: "Adicionar card",
              onClick: () => setAddCardOpen(true),
              primary: true as const,
            },
            {
              icon: organizing ? <Check className="size-4" /> : <Move className="size-4" />,
              label: organizing ? "Concluir organização" : "Organizar cards",
              onClick: () => setOrganizing((value) => !value),
              active: organizing,
            },
          ]}
        />
      }
    >
      {showTabLoader ? (
        <AppLoading variant="inline" className="min-h-0 flex-1" timeoutMs={0} />
      ) : isDeals ? (
        <>
          <SortableWidgetGrid
            layout={grid.layout}
            onLayoutChange={grid.setLayout}
            persistEnabled={grid.hydrated}
            organizing={organizing}
            labels={cardLabels}
            onRemove={grid.removeWidget}
            render={(id) => {
              if (id === "usage") {
                return (
                  <SystemUsageCard
                    rows={usageRows}
                    chartType={grid.usageChartType}
                  />
                );
              }
              if (isStageWidgetId(id)) {
                const stageId = parseStageWidgetId(id);
                const stage = funnelStages.find((s) => s.id === stageId);
                if (!stage) return <PainelSkeleton className="min-h-32" />;
                return (
                  <DealStageWidget
                    stage={stage}
                    search={search}
                    userIds={filters.userIds}
                  />
                );
              }
              if (id.startsWith("card:")) {
                const cardId = id.slice(5);
                const def = grid.cards.find((c) => c.id === cardId);
                if (!def) return <PainelSkeleton className="min-h-32" />;
                if (def.type === "event") {
                  const hit = eventCards.find((e) => e.card.id === def.id);
                  const data = hit?.data;
                  const rows = (data?.byUser ?? []).filter((r) =>
                    filters.userIds.length ? filters.userIds.includes(r.id) : true,
                  );
                  return (
                    <CustomMetricCard
                      def={def}
                      value={data?.value ?? null}
                      unit={data?.unit ?? "count"}
                      rows={rows.map((r) => ({ id: r.id, name: r.name, value: r.value }))}
                      href={data?.href}
                    />
                  );
                }
                const field = customFieldsQuery.data?.find((f) => f.fieldId === def.fieldId);
                const unit = def.agg === "sum" ? "money" : "count";
                const value =
                  def.agg === "sum" ? (field?.sum ?? null) : (field?.count ?? null);
                const rows = (field?.byUser ?? [])
                  .filter((r) => (filters.userIds.length ? filters.userIds.includes(r.id) : true))
                  .map((r) => ({
                    id: r.id,
                    name: r.name,
                    value: def.agg === "sum" ? (r.sum ?? 0) : r.count,
                  }));
                return (
                  <CustomMetricCard
                    def={def}
                    value={value}
                    unit={unit}
                    rows={rows}
                  />
                );
              }
              return renderDealWidget(
                id as DealCoreWidgetId,
                search,
                dealsQuery,
                period,
                effectivePipelineId,
                filters.pipelineIds,
                filters.userIds,
                <FunnelPipelinePicker
                  pipelines={(options?.pipelines ?? []).map((p) => ({ id: p.id, name: p.name }))}
                  selectedIds={filters.pipelineIds}
                  onChange={(ids) => patch({ pipelineIds: ids, stageIds: [] })}
                />,
              );
            }}
          />
          <AddDashboardCardDialog
            open={addCardOpen && isDeals}
            onOpenChange={setAddCardOpen}
            fields={options?.dealCustomFields ?? []}
            stages={funnelStages.map((s) => ({ id: s.id, name: s.name }))}
            presentIds={grid.widgetIds}
            presets={DEAL_CORE_WIDGET_IDS.map((id) => ({ id, label: DEAL_LABELS[id] ?? id }))}
            onAddPreset={(id, chartType) => grid.restoreWidget(id, chartType)}
            onAddStage={(stageId) => grid.restoreWidget(`stage:${stageId}`)}
            onCreate={grid.addCard}
          />
        </>
      ) : (
        <>
          <SortableWidgetStack
            ids={serviceOrder.order}
            labels={SERVICE_LABELS}
            onReorder={serviceOrder.reorder}
            organizing={organizing}
            droppableId="dashboard-atendimento"
            onRemove={serviceOrder.hide}
            canRemove={isTabulationWidgetId}
            render={(id) =>
              isTabulationWidgetId(id)
                ? renderTabBoardWidget(
                    id,
                    tabAnalyticsQuery,
                    search,
                    tabActorUserId,
                    tabDepartmentId,
                    setTabDepartmentId,
                    tabLogPage,
                    setTabLogPage,
                  )
                : renderServiceWidget(
                    id as ServiceWidgetId,
                    search,
                    clock,
                    setClock,
                    agoraQuery,
                    serviceQuery,
                  )
            }
          />
          <AddDashboardCardDialog
            open={addCardOpen && isService}
            onOpenChange={setAddCardOpen}
            fields={[]}
            stages={[]}
            presentIds={serviceOrder.order}
            presets={TABULATION_WIDGET_IDS.map((id) => ({
              id,
              label: TABULATION_WIDGET_LABELS[id],
            }))}
            presetsOnly
            onAddPreset={(id) => serviceOrder.restore(id)}
            onAddStage={() => undefined}
            onCreate={() => undefined}
          />
        </>
      )}
    </Shell>
  );
}

function renderTabBoardWidget(
  id: string,
  query: ReturnType<typeof useTabulationAnalytics>,
  search: string,
  _actorUserId: string,
  departmentId: string,
  setDepartmentId: (id: string) => void,
  page: number,
  setPage: (page: number) => void,
) {
  const data = query.data;
  const loadingValue = query.isLoading ? "…" : "—";
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
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  if (id === "kpis") return <TabulationKpiWidget data={data} loadingValue={loadingValue} />;
  if (id === "top") {
    return (
      <TabulationTopWidget
        rows={byTabulation}
        departmentId={departmentId}
        onToggleDepartment={(next) => {
          setDepartmentId(departmentId === next ? "" : next);
          setPage(1);
        }}
      />
    );
  }
  if (id === "byUser") return <TabulationByUserWidget rows={byUser} />;
  if (id === "log") {
    return (
      <TabulationLogWidget
        data={data}
        items={logItems}
        page={page}
        totalPages={totalPages}
        isLoading={query.isLoading}
        onPage={setPage}
      />
    );
  }
  return null;
}

function renderDealWidget(
  id: DealCoreWidgetId,
  search: string,
  query: ReturnType<typeof usePainelDeals>,
  period: { from: string; to: string },
  pipelineId?: string,
  pipelineIds?: string[],
  userIds?: string[],
  funnelPicker?: ReactNode,
) {
  if (id === "usage") return null;
  if (query.error && !query.data) {
    if (id !== "kpis") return <PainelSkeleton className="min-h-48" />;
    return (
      <PainelBlockError
        message={query.error instanceof Error ? query.error.message : "Erro ao carregar negócios."}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <PainelDealWidget
      id={id}
      data={query.data}
      search={search}
      period={period}
      pipelineId={pipelineId}
      pipelineIds={pipelineIds}
      userIds={userIds}
      funnelPicker={funnelPicker}
      onRetry={(section) => void query.retrySection(section)}
    />
  );
}

function renderServiceWidget(
  id: ServiceWidgetId,
  search: string,
  clock: "business" | "elapsed",
  onClock: (next: "business" | "elapsed") => void,
  agoraQuery: ReturnType<typeof usePainelAgora>,
  serviceQuery: ReturnType<typeof usePainelService>,
) {
  if (id === "agora") {
    return (
      <PainelAgoraWidget
        data={agoraQuery.data}
        error={agoraQuery.error}
        onRetry={() => void agoraQuery.refetch()}
      />
    );
  }
  if (serviceQuery.error && !serviceQuery.data) {
    if (id !== "volume") return <PainelSkeleton className="min-h-48" />;
    return (
      <PainelBlockError
        message={
          serviceQuery.error instanceof Error
            ? serviceQuery.error.message
            : "Erro ao carregar atendimentos."
        }
        onRetry={() => void serviceQuery.refetch()}
      />
    );
  }
  return (
    <PainelServiceWidget
      id={id}
      data={serviceQuery.data}
      search={search}
      clock={clock}
      onClock={onClock}
      onRetry={(section) => void serviceQuery.retrySection(section)}
    />
  );
}

function Shell({
  navRail,
  title,
  search,
  onSearch,
  searchPlaceholder,
  searchSlot,
  period,
  actions,
  menuSlot,
  children,
}: {
  navRail?: React.ReactNode;
  title: string;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  searchSlot?: React.ReactNode;
  period?: React.ReactNode;
  actions?: React.ReactNode;
  menuSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      {navRail ?? <NavRail />}
      <main className="flex min-w-0 flex-col gap-4 overflow-hidden">
        <SectionHeader
          icon={LayoutDashboard}
          title={title}
          search
          searchPlaceholder={searchPlaceholder}
          searchValue={search}
          onSearchChange={onSearch}
          searchSlot={searchSlot}
          withFilter={Boolean(searchSlot)}
          period={period}
          actions={actions}
          menu={Boolean(menuSlot)}
          menuSlot={menuSlot}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">{children}</div>
      </main>
    </div>
  );
}

function QueryState({
  isLoading,
  error,
  hasData,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  hasData: boolean;
  children: React.ReactNode;
}) {
  if (isLoading && !hasData) {
    return <AppLoading variant="inline" className="min-h-0 flex-1" />;
  }
  if (error) return <QueryError error={error} />;
  return <>{children}</>;
}

function QueryError({ error }: { error: unknown }) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center text-[13px] text-destructive">
      {error instanceof Error ? error.message : "Erro ao carregar o dashboard."}
    </div>
  );
}
