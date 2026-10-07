"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { Check, LayoutDashboard, Move, Plus } from "lucide-react";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRail } from "@/components/crm/nav-rail";
import { STUCK_TIMEOUT_MS } from "@/hooks/use-stuck-timeout";
import { HeaderTabs, SectionHeader } from "@/components/crm/section-header";
import { PeriodCalendarButton } from "@/components/crm/period-calendar-button";
import {
  PainelBlockError,
  PainelSkeleton,
  PainelUnavailableNotice,
} from "@/components/crm/dashboard/painel-block";
import { DealStageWidget, PainelDealWidget } from "@/components/crm/dashboard/painel-deals";
import {
  PainelAgoraWidget,
  PainelServiceWidget,
} from "@/components/crm/dashboard/painel-service";
import {
  DeptHourHeatmapWidget,
  TeamRankingsWidget,
  isTeamWidgetId,
  type TeamWidgetId,
} from "@/components/crm/dashboard/painel-team";
import { TransfersWidget } from "@/components/crm/dashboard/painel-transfers";
import { OperatorDashboardWidget } from "@/components/crm/dashboard/operator-dashboard";
import { SystemUsageCard } from "@/components/crm/dashboard/system-usage-card";
import { CustomMetricCard, TaskInsightCard } from "@/components/crm/dashboard/custom-metric-card";
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
import { useTeamUsersQuery } from "@/features/shared/queries/team-users";

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
  usePainelInsights,
  usePainelService,
  usePainelTeam,
  usePipelineOptions,
  useSystemUsageToday,
} from "@/features/dashboard-v2/hooks";
import {
  dashboardPeriodLabel,
  periodToRangeISO,
  useDashboardFilters,
} from "@/features/dashboard-v2/use-dashboard-filters";
import {
  createRemoteSliceSaver,
  loadRemoteDashboard,
  readDashboardUiState,
  readSavedActorUserIds,
  readSavedDepartmentIds,
  resolveDashboardSlice,
  saveDashboardSlice,
  scopedKey,
  useDashboardStorageScope,
  writeDashboardUiState,
  DASHBOARD_UI_KEY_PREFIX,
  type DashboardUiState,
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
  useDashboardWidgetOrder,
  type OperatorWidgetId,
  type ServiceWidgetId,
} from "@/features/dashboard-v2/use-dashboard-widget-order";
import { useTabulationAnalytics } from "@/features/dashboard-v2/use-tabulation-analytics";
import { textMatchesQuery } from "@/features/dashboard-v2/format";
import { rangeClampedNotice } from "@/features/dashboard-v2/team-rankings";
import { isBlockUnavailable } from "@/features/dashboard-v2/service-availability";
import {
  countUnavailableSections,
  serviceSectionsFor,
  teamSectionsFor,
  unavailableServiceWidgets,
  type ServiceSection,
} from "@/features/dashboard-v2/visible-sections";

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
  deptHour: "Mapa de calor por departamento",
  teamRankings: "Rankings por atendente",
  transfers: "Transferências de conversas",
  kpis: TABULATION_WIDGET_LABELS.kpis,
  top: TABULATION_WIDGET_LABELS.top,
  byUser: TABULATION_WIDGET_LABELS.byUser,
  log: TABULATION_WIDGET_LABELS.log,
};

const OPERATOR_LABELS: Record<string, string> = {
  kpis: "Indicadores",
  inboundStages: "Mensagens recebidas",
  conversations: "Conversas",
  tasks: "Tarefas",
  stalled: "Negócios parados",
};

/** Quem já salvou a fila não ganha widget novo sozinho. Este entra para todo operador. */
function withOperatorInbound(order: string[], hidden: string[]): string[] {
  if (order.includes("inboundStages") || hidden.includes("inboundStages")) return order;
  const next = [...order];
  const at = next.indexOf("kpis");
  next.splice(at >= 0 ? at + 1 : 0, 0, "inboundStages");
  return next;
}

interface DashboardV2ClientPageProps {
  navRail?: React.ReactNode;
}

function querySettled(query: { isFetched: boolean; isError: boolean }) {
  return query.isFetched || query.isError;
}

/** Liga uma vez (sucesso, erro ou timeout) e não desliga no refetch. */
function useArmedAfter(ok: boolean, delayMs: number) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!ok) {
      setArmed(false);
      return;
    }
    const id = window.setTimeout(() => setArmed(true), delayMs);
    return () => window.clearTimeout(id);
  }, [ok, delayMs]);
  return armed;
}

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

const DASH_ROLE_CACHE_KEY = "crm:dash-manager-up";

function readCachedManagerUp(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DASH_ROLE_CACHE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* sessionStorage indisponível */
  }
  return null;
}

function DashboardWarmup({
  canFetch,
  manager,
}: {
  canFetch: boolean;
  manager: boolean | null;
}) {
  // Gestor não usa /me — só aquece enquanto o papel ainda é desconhecido.
  useDashboardMe(canFetch && manager !== true);
  // Lista de funis (resolve `?pipeline=7` → CUID). As opções de filtro
  // (tags/usuários/origens) só saem ao abrir o painel.
  usePipelineOptions(canFetch);
  return null;
}

export default function DashboardV2ClientPage({
  navRail,
}: DashboardV2ClientPageProps = {}) {
  const { status: sessionStatus } = useSession();
  const canFetch = sessionStatus !== "unauthenticated";
  const { isManagerUp, ready } = useUserRole();
  const [cachedManager, setCachedManager] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    setCachedManager(readCachedManagerUp());
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.sessionStorage.setItem(DASH_ROLE_CACHE_KEY, isManagerUp ? "1" : "0");
    } catch {
      /* sessionStorage indisponível */
    }
    setCachedManager(isManagerUp);
  }, [ready, isManagerUp]);

  const manager = ready ? isManagerUp : cachedManager;

  return (
    <>
      <DashboardWarmup canFetch={canFetch} manager={manager} />
      {manager == null ? (
        <Shell navRail={navRail} title="Dashboard">
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        </Shell>
      ) : manager ? (
        <ManagerHome navRail={navRail} canFetch={canFetch} />
      ) : (
        <OperatorHome navRail={navRail} canFetch={canFetch} />
      )}
    </>
  );
}

function OperatorHome({
  navRail,
  canFetch,
}: {
  navRail?: React.ReactNode;
  canFetch: boolean;
}) {
  const query = useDashboardMe(canFetch);
  const [search, setSearch] = useState("");
  const [organizing, setOrganizing] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const { order, hidden, reorder, hide, restore } = useDashboardWidgetOrder(
    "operator",
    OPERATOR_WIDGET_IDS,
    { allowHide: true },
  );
  const visibleOrder = useMemo(() => withOperatorInbound(order, hidden), [order, hidden]);
  const painted = useLatchedReady(
    !canFetch || querySettled(query) || Boolean(query.error),
  );

  if (!painted) {
    return (
      <Shell navRail={navRail} title="Sua fila">
        <AppLoading variant="inline" className="min-h-0 flex-1" />
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
      <QueryState isLoading={query.isLoading} error={query.error} hasData={!!query.data}>
        {query.data ? (
          <>
            <SortableWidgetStack
              ids={visibleOrder}
              labels={OPERATOR_LABELS}
              onReorder={reorder}
              organizing={organizing}
              droppableId="dashboard-fila"
              onRemove={hide}
              render={(id) => (
                <OperatorDashboardWidget
                  id={id as OperatorWidgetId}
                  data={query.data}
                  search={search}
                />
              )}
            />
            <AddDashboardCardDialog
              open={addCardOpen}
              onOpenChange={setAddCardOpen}
              fields={[]}
              stages={[]}
              presentIds={visibleOrder}
              presets={OPERATOR_WIDGET_IDS.map((id) => ({
                id,
                label: OPERATOR_LABELS[id] ?? id,
              }))}
              presetsOnly
              onAddPreset={(id) => restore(id)}
              onAddStage={() => undefined}
              onCreate={() => undefined}
            />
          </>
        ) : null}
      </QueryState>
    </Shell>
  );
}

function ManagerHome({
  navRail,
  canFetch,
}: {
  navRail?: React.ReactNode;
  canFetch: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DashboardTabKey>("deals");
  const [search, setSearch] = useState("");
  const [clock, setClock] = useState<"business" | "elapsed">("business");
  const [tabActorUserIds, setTabActorUserIds] = useState<string[]>([]);
  const [tabDepartmentIds, setTabDepartmentIds] = useState<string[]>([]);
  const uiScope = useDashboardStorageScope();
  const [uiHydrated, setUiHydrated] = useState(false);
  const uiSaverRef = useRef(createRemoteSliceSaver("ui"));
  const skipUiRemoteEcho = useRef(true);
  const uiHydratedKeyRef = useRef<string | null>(null);

  useEffect(() => () => uiSaverRef.current.flush(), []);
  const isDeals = activeTab === "deals";
  const isService = activeTab === "service";

  // Funis (com etapas) da lista do shell: resolve `?pipeline=7` → CUID e
  // alimenta o seletor/painel. As opções de filtro (`filter-options`, rota
  // cara) ficam para quando o painel ou o diálogo de card abre.
  const pipelinesQuery = usePipelineOptions(canFetch);
  const pipelines = pipelinesQuery.data;
  const { filters, patch, settled: filtersSettled } = useDashboardFilters(pipelines);
  // Painéis só com os filtros assentados (funil da URL/localStorage já
  // resolvido para CUID e restore feito). `isFetched` não bastava: no mesmo
  // render em que a lista chegava, `pipelineIds` ainda era [] e o efeito de
  // funil padrão reescrevia os filtros → 7 GETs abortados e refeitos.
  // Se a lista de funis falhar, libera mesmo assim (backend usa o padrão).
  const tabReady = canFetch && (filtersSettled || pipelinesQuery.isError);
  const dealsQuery = usePainelDeals(filters, tabReady && isDeals);
  // Ordem/visibilidade salva da aba Atendimentos: só se busca o que está visível.
  const serviceOrder = useDashboardWidgetOrder("service", SERVICE_BOARD_WIDGET_IDS, {
    allowHide: true,
  });
  // Espera o layout salvo chegar (senão buscaria tudo pela ordem padrão); se
  // demorar, segue com o padrão.
  const serviceLayoutReady = useLatchedReady(serviceOrder.hydrated, 3_000);
  const serviceFetch = tabReady && isService && serviceLayoutReady;
  const serviceSections = useMemo(() => serviceSectionsFor(serviceOrder.order), [serviceOrder.order]);
  const teamSections = useMemo(() => teamSectionsFor(serviceOrder.order), [serviceOrder.order]);
  const agoraQuery = usePainelAgora(clock, serviceFetch && serviceOrder.order.includes("agora"));
  const serviceQuery = usePainelService(filters, clock, serviceFetch, "full", serviceSections);
  // Seções que o ambiente não serve (sem réplica de leitura): o card some e um
  // aviso único conta quantas ficaram de fora.
  const serviceData = serviceQuery.data;
  const serviceGone = useMemo(() => {
    const gone = (section: ServiceSection) => isBlockUnavailable(serviceData?.[section]);
    return {
      hiddenIds: new Set(unavailableServiceWidgets(serviceOrder.order, gone)),
      count: countUnavailableSections(serviceOrder.order, gone),
    };
  }, [serviceData, serviceOrder.order]);
  const teamScope = useMemo(
    () => ({ departmentIds: tabDepartmentIds, userIds: tabActorUserIds }),
    [tabDepartmentIds, tabActorUserIds],
  );
  const period = useMemo(
    () => ({ ...periodToRangeISO(filters), label: dashboardPeriodLabel(filters) }),
    [filters],
  );
  const effectivePipelineId = filters.pipelineIds[0] ?? filters.pipelineId;
  const [addCardOpen, setAddCardOpen] = useState(false);
  // Campos personalizados do diálogo "adicionar card": só quando ele abre.
  const { data: options } = useDashboardFilterOptions(canFetch && addCardOpen && isDeals);
  const [organizing, setOrganizing] = useState(false);
  const [tabLogPage, setTabLogPage] = useState(1);
  const grid = useNegociosGrid();
  const fieldIds = useMemo(
    () => grid.cards.filter((c) => c.type === "customField" && c.fieldId).map((c) => c.fieldId!),
    [grid.cards],
  );
  const customFieldsQuery = usePainelCustomFields(filters, fieldIds, tabReady && isDeals);
  const eventCards = usePainelEventCards(filters, grid.cards, tabReady && isDeals);
  const insightsQuery = usePainelInsights(filters, grid.cards, tabReady && isDeals);
  // O card de uso do sistema pode estar oculto: sem ele, sem GET.
  const usageVisible = grid.hydrated && grid.widgetIds.includes("usage");
  const usageQuery = useSystemUsageToday(tabReady && isDeals && usageVisible);

  const departmentsQuery = useDepartments(tabReady && isService);
  const usersQuery = useTeamUsersQuery(tabReady && isService);

  const hasServiceTabWidgets = serviceOrder.order.some((id) => isTabulationWidgetId(id));
  const tabulationsArmed = useArmedAfter(serviceFetch && serviceQuery.volumeReady, 2_500);
  const teamQuery = usePainelTeam(
    filters,
    clock,
    teamScope,
    tabulationsArmed && teamSections.length > 0,
    teamSections,
  );
  const tabAnalyticsQuery = useTabulationAnalytics({
    fromIso: period.from,
    toIso: period.to,
    actorUserIds: tabActorUserIds,
    departmentIds: tabDepartmentIds,
    page: tabLogPage,
    enabled: tabReady && isService && hasServiceTabWidgets && tabulationsArmed,
  });

  useEffect(() => {
    setTabLogPage(1);
  }, [period.from, period.to, tabActorUserIds, tabDepartmentIds]);

  useEffect(() => {
    if (!uiScope.ready || !uiScope.keyPart || !uiScope.userId) return;
    let cancelled = false;
    const keyPart = uiScope.keyPart;
    const userId = uiScope.userId;
    skipUiRemoteEcho.current = true;
    void (async () => {
      const local = readDashboardUiState(keyPart, userId);
      const remote = await loadRemoteDashboard();
      if (cancelled) return;
      const picked = resolveDashboardSlice(remote, "ui", local);
      const saved =
        picked.value && typeof picked.value === "object"
          ? (picked.value as DashboardUiState)
          : null;
      if (saved) {
        if (saved.tab === "tabulations") {
          setActiveTab("service");
        } else if (saved.tab === "deals" || saved.tab === "service") {
          setActiveTab(saved.tab);
        }
        if (saved.clock === "business" || saved.clock === "elapsed") setClock(saved.clock);
        setTabActorUserIds(readSavedActorUserIds(saved));
        setTabDepartmentIds(readSavedDepartmentIds(saved));
      }
      if (picked.source === "remote" && saved) {
        writeDashboardUiState(keyPart, saved);
      } else if (picked.migrate && local) {
        await saveDashboardSlice({
          storageKey: scopedKey(DASHBOARD_UI_KEY_PREFIX, keyPart),
          metaKey: "ui",
          value: local,
        });
      }
      if (!cancelled) {
        uiHydratedKeyRef.current = keyPart;
        setUiHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uiScope.ready, uiScope.keyPart, uiScope.userId]);

  useEffect(() => {
    if (!uiHydrated || !uiScope.keyPart) return;
    if (uiHydratedKeyRef.current !== uiScope.keyPart) return;
    const value: DashboardUiState = {
      tab: activeTab,
      clock,
      tabActorUserIds,
      tabDepartmentIds,
      tabActorUserId: tabActorUserIds[0] ?? "",
      tabDepartmentId: tabDepartmentIds[0] ?? "",
    };
    writeDashboardUiState(uiScope.keyPart, value);
    if (skipUiRemoteEcho.current) {
      skipUiRemoteEcho.current = false;
      return;
    }
    uiSaverRef.current.schedule({
      storageKey: scopedKey(DASHBOARD_UI_KEY_PREFIX, uiScope.keyPart),
      value,
    });
  }, [uiHydrated, uiScope.keyPart, activeTab, clock, tabActorUserIds, tabDepartmentIds]);

  // Chrome + widgets as soon as the saved tab hydrates. Painel/service
  // can take minutes — widgets already skeleton; do not hold the page.
  const pagePainted = useLatchedReady(uiHydrated || canFetch, 1_500);

  const liveUserOptions = useMemo(() => {
    const map = new Map<string, string>();
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
  }, [dealsQuery.data, usageQuery.data]);

  const periodActive = filters.period !== "today";

  const filterBar = (
    <DashboardSearchFilterBar
      search={search}
      onSearch={setSearch}
      filters={filters}
      onPatch={patch}
      pipelines={pipelines}
      canFetch={canFetch}
      effectivePipelineId={effectivePipelineId}
      variant={isService ? "service" : "deals"}
      actorUserIds={tabActorUserIds}
      onActorUserIdsChange={setTabActorUserIds}
      departmentIds={tabDepartmentIds}
      onDepartmentIdsChange={setTabDepartmentIds}
      userOptions={
        isService
          ? (usersQuery.data ?? []).map((u) => ({ value: u.id, label: u.name }))
          : []
      }
      liveUserOptions={liveUserOptions}
      departmentOptions={(Array.isArray(departmentsQuery.data)
        ? departmentsQuery.data
        : []
      ).map((d) => ({
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

  const showTabLoader = !pagePainted;

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
        <AppLoading variant="inline" className="min-h-0 flex-1" />
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
                  <SystemUsageCard rows={usageRows} />
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
                if (def.type === "inboundOwners" || def.type === "inboundStage") {
                  const data = insightsQuery.data;
                  const block =
                    def.type === "inboundOwners"
                      ? data?.inboundOwners
                      : data?.stages.find((s) => s.stageId === def.stageId);
                  const rows = (block && "byUser" in block ? block.byUser : []).filter((r) =>
                    filters.userIds.length ? filters.userIds.includes(r.id) : true,
                  );
                  return (
                    <CustomMetricCard
                      def={def}
                      value={block?.total ?? null}
                      unit="count"
                      rows={rows}
                    />
                  );
                }
                if (def.type === "tasks") {
                  const block = insightsQuery.data?.tasks.find(
                    (t) => t.group === (def.taskGroup ?? "user"),
                  );
                  return (
                    <TaskInsightCard
                      title={def.title}
                      total={block?.total ?? 0}
                      groups={block?.groups ?? []}
                      chartType={def.chartType}
                    />
                  );
                }
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
                  pipelines={(pipelines ?? []).map((p) => ({ id: p.id, name: p.name }))}
                  selectedId={effectivePipelineId}
                  onSelect={(id) =>
                    patch({ pipelineIds: [id], pipelineId: id, stageIds: [] })
                  }
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
            onAddPreset={(id) => grid.restoreWidget(id)}
            onAddStage={(stageId) => grid.restoreWidget(`stage:${stageId}`)}
            onCreate={grid.addCard}
          />
        </>
      ) : (
        <>
          <PainelUnavailableNotice count={serviceGone.count} />
          <SortableWidgetStack
            ids={serviceOrder.order}
            labels={SERVICE_LABELS}
            hiddenIds={serviceGone.hiddenIds}
            onReorder={serviceOrder.reorder}
            organizing={organizing}
            droppableId="dashboard-atendimento"
            onRemove={serviceOrder.hide}
            render={(id) =>
              isTabulationWidgetId(id)
                ? renderTabBoardWidget(
                    id,
                    tabAnalyticsQuery,
                    search,
                    tabActorUserIds,
                    tabDepartmentIds,
                    setTabDepartmentIds,
                    tabLogPage,
                    setTabLogPage,
                  )
                : isTeamWidgetId(id)
                  ? renderTeamWidget(id, {
                      query: teamQuery,
                      search,
                      filtered: teamScope.departmentIds.length + teamScope.userIds.length > 0,
                      clock,
                      onClock: setClock,
                    })
                  : renderServiceWidget(
                      id as Exclude<ServiceWidgetId, TeamWidgetId>,
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
            presets={SERVICE_BOARD_WIDGET_IDS.map((id) => ({
              id,
              label: SERVICE_LABELS[id] ?? id,
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
  _actorUserIds: string[],
  departmentIds: string[],
  setDepartmentIds: (ids: string[]) => void,
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
        departmentIds={departmentIds}
        onToggleDepartment={(next) => {
          setDepartmentIds(
            departmentIds.includes(next)
              ? departmentIds.filter((id) => id !== next)
              : [...departmentIds, next],
          );
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

function renderTeamWidget(
  id: TeamWidgetId,
  ctx: {
    query: ReturnType<typeof usePainelTeam>;
    search: string;
    filtered: boolean;
    clock: "business" | "elapsed";
    onClock: (next: "business" | "elapsed") => void;
  },
) {
  const { query, search, filtered } = ctx;
  if (query.error && !query.data) {
    return (
      <PainelBlockError
        message={query.error instanceof Error ? query.error.message : "Erro ao carregar a equipe."}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const retry = () => void query.refetch();
  const notice = rangeClampedNotice(query.data?.rangeClamped, query.data?.effectiveFrom);
  if (id === "deptHour") {
    return (
      <DeptHourHeatmapWidget
        block={query.data?.deptHour}
        search={search}
        filtered={filtered}
        notice={notice}
        onRetry={retry}
      />
    );
  }
  if (id === "transfers") {
    return (
      <TransfersWidget
        block={query.data?.transfers}
        search={search}
        filtered={filtered}
        notice={notice}
        onRetry={retry}
      />
    );
  }
  return (
    <TeamRankingsWidget
      block={query.data?.ranking}
      search={search}
      filtered={filtered}
      notice={notice}
      clock={ctx.clock}
      onClock={ctx.onClock}
      onRetry={retry}
    />
  );
}

function renderServiceWidget(
  id: Exclude<ServiceWidgetId, TeamWidgetId>,
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
    if (id !== "volume") return <PainelSkeleton className="min-h-[72px]" />;
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
          stackSearchOnMobile
        />
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">{children}</div>
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
