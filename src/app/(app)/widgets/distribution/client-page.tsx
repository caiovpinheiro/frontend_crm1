"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  IconAlertTriangle,
  IconArrowsShuffle,
  IconBuilding,
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconClockExclamation,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconPencil,
  IconPhone,
  IconPlayerPlay,
  IconRefresh,
  IconRotateClockwise,
  IconSearch,
  IconSettings,
  IconTag,
  IconUserCheck,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { Shuffle } from "lucide-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { UserAvatar } from "@/components/crm/user-avatar";
import { AgentStatusDot } from "@/components/crm/agent-status-dot";
import type { AgentOnlineStatus } from "@/components/crm/agent-status";
import {
  SystemPresenceIndicator,
  sortByPresence,
} from "@/components/crm/system-presence-indicator";
import { DistributionIcon } from "@/components/icons/distribution-icon";
import { RestrictedScreen } from "@/components/crm/restricted-screen";
import { useRequireManager } from "@/hooks/use-user-role";
import { DataView, DataRow } from "@/components/automations/data-view";
import { ViewToggle, useCardsTableView, type CardsTableView } from "@/components/automations/view-toggle";
import { PageChrome } from "@/components/crm/page-header";
import { HeaderTabs, SectionHeader } from "@/components/crm/section-header";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { FilterChip } from "@/components/crm/filter-popover";
import { FilterCategoryColumn, FilterColumnsModal } from "@/components/crm/filter-columns-modal";
import {
  PeriodCalendarButton,
  PeriodIsoRangePanel,
} from "@/components/crm/period-calendar-button";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { PageDemoBanner } from "@/components/crm/page-demo-banner";
import { Chip } from "@/components/crm/chip";
import { EmptyState } from "@/components/crm/empty-state";
import { LIST_PAGE_PANE_CLASS, LIST_PAGE_STACK_CLASS, PaginationGlass } from "@/components/crm/pagination-glass";
import { ListHScroll } from "@/components/crm/list-hscroll";
import { ListColumnLabel, CARD_SURFACE_CLASS, LIST_ACTIONS_CELL_CLASS, LIST_CARD_ROW_CLASS, LIST_CARD_STACK_CLASS, SortableHeader, type SortDir } from "@/components/crm/sortable-header";
import { ChatAvatar } from "@/components/inbox/chat-avatar";
import { AVATAR_SIZE } from "@/lib/avatar";
import {
  colorForQueueDepartment,
  pendingToQueueItem,
  queueItems,
  sortQueueItems,
  type QueueSortKey,
} from "@/lib/distribution-data";
import { KpiCard, KpiSquareScroll, type KpiTone } from "@/components/crm/kpi-card";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
} from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";
import { useWidgets } from "@/features/widgets/hooks";
import {
  useDistributionQueueRealtime,
  useDistributionResponsibles,
  PENDING_PAGE_SIZE,
  usePendingDistributions,
  useRedistributeResponsible,
  useRetryPending,
  useSetAgentStatus,
  useSimulateDistribution,
  useUpdateResponsible,
} from "@/features/distribution/hooks";
import {
  AutoOnInboundToggle,
  DepartmentsDistributionPanel,
  DistributionEnabledToggle,
} from "@/features/distribution/settings-panel";
import {
  BLOCK_REASON_LABELS,
  type DistributionResponsibleDto,
  type DistributionResult,
  type PendingDistributionDto,
  type RedistributeMode,
  type RedistributeQueueScope,
} from "@/features/distribution/types";
import { useDepartments } from "@/features/conversations-settings/hooks/use-departments";
import { LeadsDistributionView, type LeadsPane } from "./leads-view";
import {
  MOCK_DISTRIBUTION_PENDING,
  MOCK_DISTRIBUTION_RESPONSIBLES,
} from "@/features/distribution/mock";
import {
  PageTourButton,
  registerDistributionTourBridge,
} from "@/features/product-tour";
import { CoverageSearchFilterBar } from "@/features/settings/coverage/search-filter-bar";
import { isPageMockMode, shouldAutoDemoEmpty } from "@/lib/page-mock-mode";
import { inboxConversationDeepLink } from "@/features/inbox-v2/hooks/use-inbox-url-sync";

const CoverageBoard = dynamic(
  () =>
    import("@/features/settings/coverage/coverage-board").then((m) => ({
      default: m.CoverageBoard,
    })),
  { ssr: false },
);
const DistributionLogsList = dynamic(
  () => import("./distribution-logs-list"),
  { ssr: false },
);

const SMART_DISTRIBUTION_SLUG = "smart_distribution";
const DIST_SMART_INSTALLED_KEY = "crm:dist-smart-installed";
const DIST_PENDING_TOTAL_KEY = "crm:dist-pending-total";

function readSessionFlag(key: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* sessionStorage indisponível */
  }
  return null;
}

function writeSessionFlag(key: string, value: boolean) {
  try {
    window.sessionStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* sessionStorage indisponível */
  }
}

function readSessionInt(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function writeSessionInt(key: string, value: number) {
  try {
    window.sessionStorage.setItem(key, String(value));
  } catch {
    /* sessionStorage indisponível */
  }
}

function inboxConversationHref(
  number: number | null | undefined,
  fallbackId?: string | null,
  tab?: string | null,
) {
  return inboxConversationDeepLink({ number, id: fallbackId, tab });
}

/**
 * Ambiente onde os dados de exemplo (EduIT ilustrativo) PODEM aparecer:
 * localhost, host de DEV (`crm-dev-*`) ou modo mock/preview explícito. Em
 * PRODUÇÃO retorna sempre false — lá a tela mostra dados reais ou o erro real,
 * nunca consultores fictícios. Nunca casa o host de produção.
 */
function isDevDemoEnv(): boolean {
  if (isPageMockMode()) return true;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.startsWith("127.") ||
    h.includes("crm-dev") ||
    h.includes("-dev.")
  );
}

type DistributionView = "team" | "coverage" | "queue" | "logs";

/**
 * Deep-link de aba (`?tab=coverage`). Usado pelo redirect da rota antiga
 * `/settings/coverage`, que virou a aba "Cobertura" aqui ao lado de "Equipe".
 */
function parseViewParam(raw: string | null): DistributionView | null {
  if (raw === "team" || raw === "coverage" || raw === "queue" || raw === "logs") {
    return raw;
  }
  return null;
}

/** Presença efetiva de um responsável (para badge + filtro). */
type PresenceKey = "ONLINE" | "AWAY" | "OFFLINE" | "INACTIVE";
function classifyPresence(r: DistributionResponsibleDto): PresenceKey {
  if (!r.participates) return "INACTIVE";
  if (r.paused) return "AWAY";
  return (r.status ?? "OFFLINE") === "ONLINE" ? "ONLINE" : r.status === "AWAY" ? "AWAY" : "OFFLINE";
}

interface DistributionClientPageProps {
  navRail?: React.ReactNode;
}

export default function DistributionClientPage({
  navRail,
}: DistributionClientPageProps = {}) {
  const { data: session, status: sessionStatus } = useSession();
  const { ready: roleReady, isManagerUp } = useRequireManager();
  const canFetch = sessionStatus !== "unauthenticated";
  const currentUserId = session?.user?.id ?? null;
  const currentUserImage = session?.user?.image ?? null;
  const role = session?.user?.role;
  const canManage = role === "ADMIN" || role === "MANAGER";

  const widgetsQuery = useWidgets(canFetch);
  const [cachedInstalled, setCachedInstalled] = useState<boolean | null>(null);
  const [cachedPendingTotal, setCachedPendingTotal] = useState<number | null>(null);

  useLayoutEffect(() => {
    setCachedInstalled(readSessionFlag(DIST_SMART_INSTALLED_KEY));
    setCachedPendingTotal(readSessionInt(DIST_PENDING_TOTAL_KEY));
  }, []);

  const widgetFromApi = widgetsQuery.data?.items.find(
    (w) => w.slug === SMART_DISTRIBUTION_SLUG,
  )?.installed;

  useEffect(() => {
    if (widgetFromApi === undefined) return;
    writeSessionFlag(DIST_SMART_INSTALLED_KEY, widgetFromApi);
    setCachedInstalled(widgetFromApi);
  }, [widgetFromApi]);

  // Sem cache: dispara equipe em paralelo com /widgets. Com cache "off":
  // não busca. A fila pending só na aba Fila.
  const queueLive =
    canFetch &&
    (isPageMockMode() ||
      widgetFromApi === true ||
      (widgetFromApi === undefined && cachedInstalled !== false));

  const searchParams = useSearchParams();
  const viewFromUrl = parseViewParam(searchParams.get("tab"));
  const [view, setView] = useState<DistributionView>(viewFromUrl ?? "team");

  const respQuery = useDistributionResponsibles(queueLive, {
    poll: view === "team",
  });
  const pendingLive = queueLive && view === "queue";
  const pendingQuery = usePendingDistributions(pendingLive, null, {
    poll: true,
  });
  useDistributionQueueRealtime(queueLive, { pending: view === "queue" });
  const simulateMut = useSimulateDistribution();
  const retryMut = useRetryPending();

  const [editing, setEditing] = useState<DistributionResponsibleDto | null>(null);
  const [redistributing, setRedistributing] =
    useState<DistributionResponsibleDto | null>(null);
  const [simResult, setSimResult] = useState<DistributionResult | null>(null);
  const [deptConfigOpen, setDeptConfigOpen] = useState(false);

  // Seletor de página: "Distribuição Inteligente" (smart) × "Distribuição por
  // Leads" (leads). APENAS alterna a visualização — não muda motor nem
  // automações. Deep link: ?mode=leads. A query é lida só APÓS o mount:
  // ler searchParams no estado inicial diverge do SSR (hydration mismatch).
  const [pageMode, setPageMode] = useState<"smart" | "leads">("smart");
  useEffect(() => {
    if (searchParams.get("mode") === "leads") setPageMode("leads");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A URL acompanha o modo (deep link ?mode=leads), preservando ?tab= e
  // demais params. replaceState: sem navegação/re-render — o estado já mudou.
  const changePageMode = (m: "smart" | "leads") => {
    setPageMode(m);
    const params = new URLSearchParams(window.location.search);
    if (m === "leads") params.set("mode", "leads");
    else params.delete("mode");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  };
  useEffect(() => {
    registerDistributionTourBridge(setView);
    return () => registerDistributionTourBridge(null);
  }, []);
  // ── Estado de UI: busca, filtros ──
  const [listView, setListView] = useCardsTableView();
  const [search, setSearch] = useState("");
  const [presence, setPresence] = useState<PresenceKey[]>([]);
  const [eligibility, setEligibility] = useState<("eligible" | "blocked")[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  /** ADMINs ficam ocultos na lista por padrão (não poluem a equipe). */
  const [showAdmins, setShowAdmins] = useState(false);
  const [coverageSearch, setCoverageSearch] = useState("");
  const [coverageDeptIds, setCoverageDeptIds] = useState<string[]>([]);
  const [coverageShowHidden, setCoverageShowHidden] = useState(false);
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [leadsPane, setLeadsPane] = useState<LeadsPane>("consultants");
  const [leadsDateFrom, setLeadsDateFrom] = useState("");
  const [leadsDateTo, setLeadsDateTo] = useState("");

  const realResponsibles = respQuery.data?.responsibles ?? [];
  const realPending = pendingQuery.data?.pending ?? [];
  const livePendingTotal =
    pendingQuery.data != null
      ? (pendingQuery.data.total ?? realPending.length)
      : cachedPendingTotal;

  useEffect(() => {
    if (pendingQuery.data == null) return;
    const total = pendingQuery.data.total ?? pendingQuery.data.pending.length;
    writeSessionInt(DIST_PENDING_TOTAL_KEY, total);
    setCachedPendingTotal(total);
  }, [pendingQuery.data]);
  // Dados de exemplo (EduIT ilustrativo) SÓ em DEV/mock. Em PRODUÇÃO nunca
  // exibimos dados fictícios: mostramos os dados reais (ou o erro/estado real).
  // `isDevDemoEnv` casa localhost / host de DEV (crm-dev-*) / mock explícito
  // (v0, ?mock=1, NEXT_PUBLIC_MOCK_PAGES) — nunca o host de produção.
  const useDemo =
    isDevDemoEnv() &&
    (isPageMockMode() ||
      shouldAutoDemoEmpty({
        realCount: realResponsibles.length,
        hasFilters: false,
        isLoading:
          (widgetsQuery.isLoading && cachedInstalled !== true && !respQuery.data) ||
          ((isPageMockMode() || queueLive) && respQuery.isLoading),
        isError: !!respQuery.error,
      }) ||
      (widgetsQuery.isFetched && widgetFromApi === false));

  const smartInstalled =
    useDemo ||
    widgetFromApi === true ||
    (widgetFromApi !== false &&
      (cachedInstalled === true || Boolean(respQuery.data)));

  const responsibles = useDemo
    ? MOCK_DISTRIBUTION_RESPONSIBLES.responsibles
    : realResponsibles;
  const pending = useDemo ? MOCK_DISTRIBUTION_PENDING.pending : realPending;
  const pendingTotal = useDemo
    ? (MOCK_DISTRIBUTION_PENDING.total ?? pending.length)
    : (livePendingTotal ?? 0);
  const pendingBadge = useDemo
    ? queueItems.length
    : (livePendingTotal ?? undefined);

  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set(responsibles.map((r) => r.type).filter((t): t is string => !!t)),
      ).sort(),
    [responsibles],
  );

  const adminCount = useMemo(
    () => responsibles.filter((r) => r.role === "ADMIN").length,
    [responsibles],
  );
  const teamListCount = showAdmins
    ? responsibles.length
    : Math.max(0, responsibles.length - adminCount);

  const hasFilters =
    search.trim().length > 0 ||
    presence.length > 0 ||
    eligibility.length > 0 ||
    types.length > 0;

  const filteredResponsibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = responsibles.filter((r) => {
      if (!showAdmins && r.role === "ADMIN") return false;
      if (q) {
        const hay = `${r.name ?? ""} ${r.email ?? ""} ${r.type ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (presence.length > 0 && !presence.includes(classifyPresence(r))) return false;
      if (eligibility.length === 1) {
        if (eligibility[0] === "eligible" && !r.eligible) return false;
        if (eligibility[0] === "blocked" && r.eligible) return false;
      }
      if (types.length > 0 && (!r.type || !types.includes(r.type))) return false;
      return true;
    });
    // Ordena por presença de USO (CRM aberto) — quem está no sistema agora sobe.
    // Não interfere na elegibilidade da Distribuição — é só ordem de exibição.
    return sortByPresence(filtered);
  }, [responsibles, search, presence, eligibility, types, showAdmins]);

  const clearFilters = () => {
    setSearch("");
    setPresence([]);
    setEligibility([]);
    setTypes([]);
  };

  const handleRetry = () => {
    retryMut.mutate(undefined, {
      onSuccess: (res) => {
        writeSessionInt(DIST_PENDING_TOTAL_KEY, res.pending);
        setCachedPendingTotal(res.pending);
        if (res.resolved > 0) {
          toast.success(`${res.resolved} lead(s) distribuído(s).`);
        } else if (res.pending > 0) {
          toast.warning(
            res.skipMessage ||
              "Ainda não há responsável elegível para a fila.",
          );
        } else {
          toast.info("Fila de espera vazia.");
        }
      },
      onError: (e) => toast.error(e.message || "Erro ao reprocessar a fila."),
    });
  };

  const handleTest = () => {
    simulateMut.mutate(undefined, {
      onSuccess: (res) => {
        setSimResult(res);
        if (res.success) {
          toast.success(
            `Distribuição apontaria para ${res.selectedUserName ?? "um responsável"}.`,
          );
        } else if (res.reason === "NO_ELIGIBLE_RESPONSIBLE") {
          toast.warning("Nenhum responsável elegível no momento.");
        } else {
          toast.error("Módulo de Distribuição não habilitado.");
        }
      },
      onError: (e) => toast.error(e.message || "Erro ao simular distribuição."),
    });
  };

  if (roleReady && !isManagerUp) return <RestrictedScreen />;

  const widgetsBlocking =
    widgetsQuery.isLoading && cachedInstalled !== true && !respQuery.data;
  const showContent =
    !widgetsBlocking &&
    smartInstalled &&
    !(!useDemo && respQuery.isLoading) &&
    !(!useDemo && respQuery.error);

  return (
    <div className="v2-screen grid min-w-0 grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] gap-4 overflow-hidden p-4">
      {navRail ?? <NavRailSpacer />}

      <PageChrome
        header={
        <SectionHeader
          icon={Shuffle}
          title="Distribuição"
          titleAccessory={
            smartInstalled ? (
              /* Seletor de página: só alterna a visualização (smart × leads).
                 Não altera motor nem automações. Fica junto ao título para não
                 competir por espaço com as abas na linha de ações. */
              <div
                data-tour="distribution-mode"
                className="ml-2 flex shrink-0 items-center rounded-full border border-border bg-card p-0.5"
                role="tablist"
                aria-label="Modo de distribuição"
              >
                {(
                  [
                    { key: "smart", label: "Inteligente" },
                    { key: "leads", label: "Por Leads" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                      aria-selected={pageMode === m.key}
                      onClick={() => changePageMode(m.key)}
                    className={cn(
                      "h-7 cursor-pointer rounded-full px-3 text-[12px] font-semibold whitespace-nowrap transition-colors",
                      pageMode === m.key
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ) : undefined
          }
          search={
            pageMode === "smart" &&
            ((smartInstalled && view === "team") || view === "coverage")
          }
          searchSlot={
            smartInstalled && view === "team" ? (
              <DistributionSearchFilterBar
                search={search}
                onSearch={setSearch}
                presence={presence}
                onPresenceChange={setPresence}
                eligibility={eligibility}
                onEligibilityChange={setEligibility}
                types={types}
                onTypesChange={setTypes}
                typeOptions={typeOptions}
                onClearAll={clearFilters}
              />
            ) : view === "coverage" ? (
              <CoverageSearchFilterBar
                search={coverageSearch}
                onSearch={setCoverageSearch}
                deptIds={coverageDeptIds}
                onDeptIdsChange={setCoverageDeptIds}
                showHidden={coverageShowHidden}
                onShowHiddenChange={setCoverageShowHidden}
              />
            ) : undefined
          }
          period={
            pageMode === "leads" ? (
              <div className="flex shrink-0">
                <PeriodCalendarButton active={Boolean(leadsDateFrom || leadsDateTo)}>
                  <PeriodIsoRangePanel
                    from={leadsDateFrom}
                    to={leadsDateTo}
                    onChange={({ from, to }) => {
                      setLeadsDateFrom(from);
                      setLeadsDateTo(to);
                    }}
                    allPeriodLabel="Todo o período"
                    showToday
                  />
                </PeriodCalendarButton>
              </div>
            ) : pageMode === "smart" && view === "logs" ? (
              <div data-tour="distribution-period" className="flex shrink-0">
              <PeriodCalendarButton active={Boolean(logDateFrom || logDateTo)}>
                <PeriodIsoRangePanel
                  from={logDateFrom}
                  to={logDateTo}
                  onChange={({ from, to }) => {
                    setLogDateFrom(from);
                    setLogDateTo(to);
                  }}
                  allPeriodLabel="Todo o período"
                  showToday
                />
              </PeriodCalendarButton>
              </div>
            ) : undefined
          }
          actions={
            smartInstalled || view === "coverage" ? (
              <div className="flex min-w-0 w-full flex-nowrap items-center gap-2">
                {((pageMode === "smart" && view !== "coverage") || pageMode === "leads") &&
                smartInstalled ? (
                  <div data-tour="distribution-view" className="flex shrink-0">
                    <ViewToggle value={listView} onChange={setListView} />
                  </div>
                ) : null}
                {adminCount > 0 && pageMode === "smart" && (
                  <button
                    type="button"
                    onClick={() => setShowAdmins((v) => !v)}
                    className={cn(
                      "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors",
                      showAdmins
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                    title={
                      showAdmins
                        ? `Ocultar ${adminCount} admin(s)`
                        : `Mostrar ${adminCount} admin(s) oculto(s)`
                    }
                    aria-label={
                      showAdmins ? "Ocultar administradores" : "Mostrar administradores"
                    }
                    aria-pressed={showAdmins}
                  >
                    {showAdmins ? <IconEye size={16} /> : <IconEyeOff size={16} />}
                  </button>
                )}
              </div>
            ) : undefined
          }
          menu={pageMode === "smart" && (smartInstalled || view === "coverage")}
          menuSlot={
            pageMode === "smart" ? (
            <div className="flex items-center gap-2">
              <PageTourButton
                tourId={
                  view === "coverage"
                    ? "distribution-coverage"
                    : view === "queue"
                      ? "distribution-queue"
                      : view === "logs"
                        ? "distribution-logs"
                        : "distribution"
                }
              />
              <div data-tour="distribution-actions" className="flex shrink-0">
            <DistributionActionsMenu
              onTest={handleTest}
              testing={simulateMut.isPending}
              onRetry={handleRetry}
              retrying={retryMut.isPending}
              canRetry={pendingTotal > 0}
              hasFilters={hasFilters}
              onClearFilters={clearFilters}
              onDepartmentsConfig={
                canManage && !useDemo
                  ? () => setDeptConfigOpen(true)
                  : undefined
              }
            />
              </div>
            </div>
            ) : undefined
          }
        >
          {/* Abas em linha própria abaixo do header — nunca colapsam por
              falta de espaço na linha de ações. Leads não tem fila; as abas
              cobrem consultores, ranking e histórico. */}
          {pageMode === "leads" && smartInstalled ? (
            <div className="w-full min-w-0">
              <HeaderTabs
                tabs={[
                  { key: "consultants", label: "Consultores" },
                  { key: "ranking", label: "Ranking" },
                  { key: "history", label: "Histórico" },
                ]}
                value={leadsPane}
                onChange={setLeadsPane}
              />
            </div>
          ) : pageMode === "smart" && (smartInstalled || view === "coverage") ? (
            <div data-tour="distribution-tabs" className="w-full min-w-0">
              <HeaderTabs
                tabs={[
                  { key: "team", label: "Equipe", badge: teamListCount },
                  { key: "coverage", label: "Cobertura" },
                  { key: "queue", label: "Fila de espera", badge: pendingBadge },
                  { key: "logs", label: "Logs" },
                ]}
                value={view}
                onChange={(v) => setView(v)}
              />
            </div>
          ) : null}
        </SectionHeader>
        }
        bodyClassName="gap-3 sm:gap-4"
      >

        {/* Modo "leads": página própria (config de consultores, indicadores,
            ranking e histórico). Sem fila de espera. O seletor do topo apenas
            alterna a visualização — motor e automações não mudam. */}
        {pageMode === "leads" ? (
          widgetsQuery.isLoading ? (
            <SkeletonState />
          ) : !smartInstalled ? (
            <NotEnabledState />
          ) : (
            <LeadsDistributionView
              canManage={canManage}
              view={listView}
              pane={leadsPane}
              from={leadsDateFrom}
              to={leadsDateTo}
            />
          )
        ) : /* Cobertura não depende do widget `smart_distribution`: a grade
            de expedientes valia para qualquer org quando morava em
            /settings/coverage. Fica fora do gating pra não perder acesso. */
        view === "coverage" ? (
          <CoverageBoard
            search={coverageSearch}
            deptIds={coverageDeptIds}
            showHidden={coverageShowHidden}
            onShowHiddenChange={setCoverageShowHidden}
          />
        ) : widgetsBlocking ? (
          <SkeletonState />
        ) : !smartInstalled ? (
          <NotEnabledState />
        ) : !useDemo && respQuery.isLoading ? (
          <SkeletonState />
        ) : !useDemo && respQuery.error ? (
          <ErrorState message={respQuery.error.message} />
        ) : (
          showContent && (
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 sm:gap-4">
              {useDemo && (
                <PageDemoBanner>
                  Dados de exemplo — equipe, fila e elegibilidade ilustrativas para o módulo de distribuição.
                </PageDemoBanner>
              )}

              <section
                data-tour="distribution-kpis"
                className="w-full shrink-0"
                aria-label="Indicadores de distribuição"
              >
                <DistributionMiniDash
                  responsibles={responsibles}
                  pending={pending}
                  waitingCount={useDemo ? queueItems.length : (livePendingTotal ?? undefined)}
                />
              </section>

              {/* Toggles reais do motor smart — também visíveis em demo
                  (settings mockados em memória) para paridade local×DEV. */}
              {canManage && view === "team" && (
                <>
                  <DistributionEnabledToggle />
                  <AutoOnInboundToggle showTour />
                </>
              )}

              {simResult && (
                <SimulationPanel result={simResult} onClose={() => setSimResult(null)} />
              )}

              {view === "team" ? (
                <div data-tour="distribution-list" className={LIST_PAGE_PANE_CLASS}>
                <ResponsiblesCardList
                  view={listView}
                  responsibles={filteredResponsibles}
                  total={teamListCount}
                  hasFilters={hasFilters}
                  onClearFilters={clearFilters}
                  currentUserId={currentUserId}
                  currentUserImage={currentUserImage}
                  canManage={canManage}
                  onEdit={(r) => setEditing(r)}
                  onRedistribute={(r) => setRedistributing(r)}
                />
                </div>
              ) : view === "queue" ? (
                <PendingQueueCards
                  view={listView}
                  pending={pending}
                  total={pendingTotal}
                  nextCursor={useDemo ? null : (pendingQuery.data?.nextCursor ?? null)}
                  illustrative={useDemo}
                  onRetry={handleRetry}
                  retrying={retryMut.isPending}
                  loading={pendingQuery.isLoading}
                  live={!useDemo && queueLive}
                />
              ) : (
                <DistributionLogsList
                  view={listView}
                  enabled={canFetch && (isPageMockMode() || smartInstalled)}
                  dateFrom={logDateFrom}
                  dateTo={logDateTo}
                />
              )}
            </div>
          )
        )}
      </PageChrome>

      {editing && (
        <EditResponsibleDialog
          responsible={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {redistributing && (
        <RedistributeDialog
          source={redistributing}
          candidates={responsibles.filter((r) => r.userId !== redistributing.userId)}
          onClose={() => setRedistributing(null)}
        />
      )}

      <FormDialog
        open={deptConfigOpen}
        onOpenChange={setDeptConfigOpen}
        title="Departamentos · distribuição automática"
        description="Configure se a distribuição respeita o departamento da conversa e quais departamentos distribuem automaticamente."
        icon={<IconUsers size={20} />}
        size="lg"
        className="bg-card border-border backdrop-blur-none"
      >
        <DepartmentsDistributionPanel />
      </FormDialog>
    </div>
  );
}

// ── Mini-dash ────────────────────────────────────────────────────────────

function DistributionMiniDash({
  responsibles,
  pending,
  waitingCount,
}: {
  responsibles: DistributionResponsibleDto[];
  pending: PendingDistributionDto[];
  waitingCount?: number;
}) {
  const stats = useMemo(() => {
    const participating = responsibles.filter((r) => r.participates);
    const eligible = responsibles.filter((r) => r.eligible).length;
    const blocked = participating.length - eligible;
    const inService = responsibles.reduce((acc, r) => acc + (r.queueCount ?? 0), 0);
    const waitingKnown = waitingCount !== undefined || pending.length > 0;
    const waiting = waitingCount ?? pending.length;
    // Taxa de cobertura: elegíveis / participantes (capacidade de receber agora).
    const coverage =
      participating.length > 0
        ? Math.round((eligible / participating.length) * 100)
        : 0;
    // Sem total da fila (aba Equipe, 1ª visita) não inventa 100%.
    const successRate = !waitingKnown
      ? undefined
      : inService + waiting > 0
        ? Math.round((inService / (inService + waiting)) * 100)
        : 100;
    return { eligible, blocked, inService, waiting, coverage, successRate };
  }, [responsibles, pending, waitingCount]);

  const cards: {
    key: string;
    label: string;
    shortLabel: string;
    value: number;
    percent?: number;
    tone: KpiTone;
    icon: React.ReactNode;
  }[] = [
    {
      key: "eligible",
      label: "Elegíveis agora",
      shortLabel: "Elegíveis",
      value: stats.eligible,
      percent: stats.coverage,
      tone: "success",
      icon: <IconUserCheck size={20} stroke={2.2} />,
    },
    {
      key: "blocked",
      label: "Indisponíveis",
      shortLabel: "Indisponíveis",
      value: stats.blocked,
      tone: "red",
      icon: <IconAlertTriangle size={20} stroke={2.2} />,
    },
    {
      key: "inService",
      label: "Na fila dos consultores",
      shortLabel: "Fila consultores",
      value: stats.inService,
      tone: "brand",
      icon: <IconUsers size={20} stroke={2.2} />,
    },
    {
      key: "waiting",
      label: "Aguardando · taxa de sucesso",
      shortLabel: "Na fila",
      value: stats.waiting,
      percent: stats.successRate,
      tone: "warning",
      icon: <IconClockExclamation size={20} stroke={2.2} />,
    },
  ];

  return (
    <>
      <KpiSquareScroll
        items={cards.map((c) => ({
          key: c.key,
          label: c.shortLabel,
          value: c.value.toLocaleString("pt-BR"),
          icon: c.icon,
          tone: c.tone,
          percent: c.percent,
        }))}
      />
      <div className="hidden w-full gap-2.5 sm:gap-3.5 lg:grid lg:grid-cols-4">
        {cards.map((c) => (
          <KpiCard
            key={c.key}
            label={c.label}
            value={c.value.toLocaleString("pt-BR")}
            hint={c.percent !== undefined ? `${c.percent}%` : undefined}
            icon={c.icon}
            tone={c.tone}
          />
        ))}
      </div>
    </>
  );
}

// ── Lista de responsáveis em cards ───────────────────────────────────────

// 6 colunas: responsável, presença, fila, volume, elegibilidade, ações (13rem = LIST_ACTIONS_TRACK)
const RESP_GRID =
  "grid-cols-[minmax(220px,2.2fr)_minmax(132px,1fr)_3.5rem_3.5rem_minmax(148px,1.15fr)_13rem]";

function ResponsiblesCardList({
  view,
  responsibles,
  total,
  hasFilters,
  onClearFilters,
  currentUserId,
  currentUserImage,
  canManage,
  onEdit,
  onRedistribute,
}: {
  view: CardsTableView;
  responsibles: DistributionResponsibleDto[];
  total: number;
  hasFilters: boolean;
  onClearFilters: () => void;
  currentUserId: string | null;
  currentUserImage: string | null;
  canManage: boolean;
  onEdit: (r: DistributionResponsibleDto) => void;
  onRedistribute: (r: DistributionResponsibleDto) => void;
}) {
  if (total === 0) {
    return (
      <div className={CARD_SURFACE_CLASS}>
        <EmptyState
          icon={<DistributionIcon size={28} />}
          title="Nenhum responsável disponível"
          description="Adicione consultores à organização para distribuir leads."
        />
      </div>
    );
  }

  if (responsibles.length === 0) {
    return (
      <div className={CARD_SURFACE_CLASS}>
        <EmptyState
          icon={<IconSearch size={28} />}
          title="Nenhum responsável encontrado"
          description="Sem resultados para a busca e filtros atuais."
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 font-display text-[13px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
              >
                <IconRotateClockwise size={14} /> Limpar filtros
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <>
      {/* Mobile / APK: lista de cards empilhados — sem scroll horizontal forçado. */}
      <ul className={cn(LIST_CARD_STACK_CLASS, "md:hidden")}>
          {responsibles.map((r, i) => (
            <ResponsibleMobileCard
              key={r.userId}
              r={r}
              isCurrentUser={r.userId === currentUserId}
              currentUserImage={currentUserImage}
              canManage={canManage}
              onEdit={onEdit}
              onRedistribute={onRedistribute}
              tourAnchor={i === 0}
            />
          ))}
      </ul>

      <div className="hidden w-full md:block">
        <ListHScroll>
        <DataView
          view={view}
          columnClass={cn("grid w-full items-center gap-4", RESP_GRID)}
          className={LIST_PAGE_STACK_CLASS}
          header={
            <>
              <ListColumnLabel>Responsável</ListColumnLabel>
              <ListColumnLabel>Presença</ListColumnLabel>
              <ListColumnLabel>Fila</ListColumnLabel>
              <ListColumnLabel>Limite de fila</ListColumnLabel>
              <ListColumnLabel>Elegibilidade</ListColumnLabel>
              <ListColumnLabel align="right">Ações</ListColumnLabel>
            </>
          }
        >
          {responsibles.map((r, i) => (
            <ResponsibleCard
              key={r.userId}
              r={r}
              isCurrentUser={r.userId === currentUserId}
              currentUserImage={currentUserImage}
              canManage={canManage}
              onEdit={onEdit}
              onRedistribute={onRedistribute}
              tourAnchor={i === 0}
            />
          ))}
        </DataView>
        </ListHScroll>
      </div>
    </>
  );
}

function InlineQueueLimit({
  userId,
  value,
  canEdit,
}: {
  userId: string;
  value: number;
  canEdit: boolean;
}) {
  const updateMut = useUpdateResponsible();
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const next = Math.max(0, Math.floor(Number(draft) || 0));
    setDraft(String(next));
    if (next === value) return;
    updateMut.mutate(
      { userId, input: { queueLimit: next } },
      {
        onSuccess: () => toast.success("Limite de fila atualizado."),
        onError: (err) => toast.error(err.message || "Erro ao salvar limite de fila."),
      },
    );
  };

  if (!canEdit) {
    return (
      <span className="block w-full font-display text-[15px] font-bold tabular-nums text-foreground">
        {value}
      </span>
    );
  }

  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      value={draft}
      disabled={updateMut.isPending}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(String(value));
          setFocused(false);
          e.currentTarget.blur();
        }
      }}
      aria-label="Limite de fila"
      title="Editar limite de fila"
      className="w-full min-w-0 rounded-[var(--radius-md)] border border-transparent bg-transparent px-0 py-0.5 text-left font-display text-[15px] font-bold tabular-nums text-foreground outline-none transition-colors hover:border-border hover:bg-secondary focus:border-primary focus:bg-secondary disabled:opacity-60"
    />
  );
}

function ResponsibleCard({
  r,
  isCurrentUser,
  currentUserImage,
  canManage,
  onEdit,
  onRedistribute,
  tourAnchor = false,
}: {
  r: DistributionResponsibleDto;
  isCurrentUser: boolean;
  currentUserImage: string | null;
  canManage: boolean;
  onEdit: (r: DistributionResponsibleDto) => void;
  onRedistribute: (r: DistributionResponsibleDto) => void;
  tourAnchor?: boolean;
}) {
  const statusMut = useSetAgentStatus();
  const isOnline = (r.status ?? "OFFLINE") === "ONLINE";
  // Próprio usuário ou admin/manager — mesmo botão simples de produção.
  const canTogglePresence = isCurrentUser || canManage;

  const togglePresence = () => {
    statusMut.mutate(
      { userId: r.userId, status: isOnline ? "OFFLINE" : "ONLINE" },
      { onError: (e) => toast.error(e.message || "Erro ao alterar status.") },
    );
  };

  return (
    <DataRow>
      {/* Responsável */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative isolate shrink-0">
          <UserAvatar
            name={r.name ?? r.email}
            imageUrl={r.avatarUrl ?? (isCurrentUser ? currentUserImage : null)}
            size={36}
          />
          <AgentStatusDot
            status={
              (!r.participates
                ? "OFFLINE"
                : r.paused || r.status === "AWAY"
                  ? "AWAY"
                  : isOnline
                    ? "ONLINE"
                    : "OFFLINE") satisfies AgentOnlineStatus
            }
            size={12}
            borderWidth={2}
            borderColor="var(--glass-bg-base)"
          />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="flex items-center gap-1.5 truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
            <span className="truncate">{r.name ?? "Sem nome"}</span>
            {/* Bolinha azul = CRM aberto (não confundir com Online da Distribuição). */}
            <SystemPresenceIndicator
              systemOnline={r.systemOnline}
              lastSeenAt={r.lastSeenAt}
            />
          </p>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 whitespace-nowrap font-body text-[12px] leading-tight text-muted-foreground">
            <span className="min-w-0 truncate">
              {r.email ?? "—"}
            </span>
            <span className="shrink-0">
              · {r.role}
            </span>
            <span
              className="min-w-0 truncate border-l border-border pl-1.5 font-semibold"
              title={
                r.departments && r.departments.length > 0
                  ? r.departments.map((d) => d.name).join(", ")
                  : "Sem departamento"
              }
            >
              {r.departments && r.departments.length > 0
                ? r.departments.map((d) => d.name).join(", ")
                : "Sem departamento"}
            </span>
          </div>
        </div>
      </div>

      <div
        className="flex min-w-0 flex-col items-start gap-1"
        data-tour={tourAnchor ? "distribution-presence" : undefined}
      >
        <PresenceBadge status={r.status} paused={r.paused} participates={r.participates} />
        {canTogglePresence && r.participates && (
          <button
            type="button"
            onClick={togglePresence}
            disabled={statusMut.isPending}
            className="cursor-pointer font-display text-[12px] font-semibold text-primary transition-colors hover:underline disabled:opacity-50"
          >
            {statusMut.isPending ? "…" : isOnline ? "Ficar offline" : "Ficar online"}
          </button>
        )}
        <SchedulePresenceHint schedule={r.schedule} preLunchStopMinutes={r.preLunchStopMinutes} />
      </div>

      <div className="w-full font-display text-[15px] font-bold tabular-nums text-foreground">
        {r.queueCount}
      </div>

      <div className="w-full leading-none">
        <InlineQueueLimit userId={r.userId} value={r.queueLimit} canEdit={canManage} />
      </div>

      {/* Elegibilidade */}
      <div
        className="flex min-w-0 flex-col gap-0.5"
        data-tour={tourAnchor ? "distribution-eligibility" : undefined}
      >
        {r.eligible ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-display text-[12px] font-bold text-success">
            <IconCircleCheck size={13} /> Elegível
          </span>
        ) : (
          <>
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-chip-red-soft px-2 py-0.5 font-display text-[12px] font-bold text-chip-red">
              <IconAlertTriangle size={13} /> Indisponível
            </span>
            {r.blockedReasons.length > 0 && (
              <span
                className="min-w-0 truncate pl-0.5 font-body text-[12px] leading-tight text-muted-foreground"
                title={r.blockedReasons.map((b) => BLOCK_REASON_LABELS[b]).join(" · ")}
              >
                {r.blockedReasons.map((b) => BLOCK_REASON_LABELS[b]).join(" · ")}
              </span>
            )}
          </>
        )}
      </div>

      {/* Ações */}
      <div className={cn(LIST_ACTIONS_CELL_CLASS, "gap-1.5")}>
        {canManage && r.queueCount > 0 && (
          <button
            type="button"
            onClick={() => onRedistribute(r)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 font-display text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Redistribuir fila deste consultor"
            data-tour={tourAnchor ? "distribution-redistribute" : undefined}
          >
            <IconArrowsShuffle size={13} /> Redistribuir
          </button>
        )}
        {canManage && (
          <button
            type="button"
            onClick={() => onEdit(r)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 font-display text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10"
            data-tour={tourAnchor ? "distribution-edit" : undefined}
          >
            <IconPencil size={13} /> Editar
          </button>
        )}
      </div>
    </DataRow>
  );
}

function ResponsibleMobileCard({
  r,
  isCurrentUser,
  currentUserImage,
  canManage,
  onEdit,
  onRedistribute,
  tourAnchor = false,
}: {
  r: DistributionResponsibleDto;
  isCurrentUser: boolean;
  currentUserImage: string | null;
  canManage: boolean;
  onEdit: (r: DistributionResponsibleDto) => void;
  onRedistribute: (r: DistributionResponsibleDto) => void;
  tourAnchor?: boolean;
}) {
  const statusMut = useSetAgentStatus();
  const isOnline = (r.status ?? "OFFLINE") === "ONLINE";
  const canTogglePresence = isCurrentUser || canManage;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const togglePresence = () => {
    statusMut.mutate(
      { userId: r.userId, status: isOnline ? "OFFLINE" : "ONLINE" },
      { onError: (e) => toast.error(e.message || "Erro ao alterar status.") },
    );
  };

  const deptLabel =
    r.departments && r.departments.length > 0
      ? r.departments.map((d) => d.name).join(", ")
      : "Sem departamento";
  const metaLine = [r.email ?? "—", r.role, deptLabel].filter(Boolean).join(" · ");

  const blockedText =
    !r.eligible && r.blockedReasons.length > 0
      ? r.blockedReasons.map((b) => BLOCK_REASON_LABELS[b]).join(" · ")
      : null;
  const scheduleAlert = r.schedule
    ? resolveSchedulePresenceAlert({
        schedule: r.schedule,
        preMinutes: r.preLunchStopMinutes ?? 30,
        now,
      })
    : null;
  const hintParts = [blockedText, scheduleAlert?.label].filter(Boolean) as string[];
  const hintTitle = [blockedText, scheduleAlert?.title].filter(Boolean).join(" · ");

  const toggleLabel = isOnline ? "Offline" : "Online";
  const toggleAria = isOnline ? "Ficar offline" : "Ficar online";

  return (
    <li className={LIST_CARD_ROW_CLASS}>
      {/* Cabeçalho: identidade + presença/toggle + ações */}
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="relative isolate mt-0.5 shrink-0">
          <UserAvatar
            name={r.name ?? r.email}
            imageUrl={r.avatarUrl ?? (isCurrentUser ? currentUserImage : null)}
            size={36}
          />
          <AgentStatusDot
            status={
              (!r.participates
                ? "OFFLINE"
                : r.paused || r.status === "AWAY"
                  ? "AWAY"
                  : isOnline
                    ? "ONLINE"
                    : "OFFLINE") satisfies AgentOnlineStatus
            }
            size={12}
            borderWidth={2}
            borderColor="var(--glass-bg-base)"
          />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
              {r.name ?? "Sem nome"}
            </p>
            <SystemPresenceIndicator
              systemOnline={r.systemOnline}
              lastSeenAt={r.lastSeenAt}
            />
            {isCurrentUser && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px font-display text-[10px] font-bold uppercase tracking-wider text-primary">
                Você
              </span>
            )}
          </div>
          <p
            className="mt-0.5 truncate font-body text-[12px] text-muted-foreground"
            title={metaLine}
          >
            {metaLine}
          </p>
          <div
            className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5"
            data-tour={tourAnchor ? "distribution-presence" : undefined}
          >
            <PresenceBadge status={r.status} paused={r.paused} participates={r.participates} />
            {canTogglePresence && r.participates && (
              <button
                type="button"
                onClick={togglePresence}
                disabled={statusMut.isPending}
                title={toggleAria}
                aria-label={toggleAria}
                className="touch-target shrink-0 cursor-pointer rounded-full border border-border bg-card px-2 py-0.5 font-display text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-primary disabled:opacity-50"
              >
                {statusMut.isPending ? "…" : toggleLabel}
              </button>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-0.5">
            {r.queueCount > 0 && (
              <button
                type="button"
                onClick={() => onRedistribute(r)}
                className="touch-target inline-flex size-8 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                title="Redistribuir fila deste consultor"
                aria-label="Redistribuir fila deste consultor"
                data-tour={tourAnchor ? "distribution-redistribute" : undefined}
              >
                <IconArrowsShuffle size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit(r)}
              className="touch-target inline-flex size-8 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
              title="Editar responsável"
              aria-label="Editar responsável"
              data-tour={tourAnchor ? "distribution-edit" : undefined}
            >
              <IconPencil size={14} />
            </button>
          </div>
        )}
      </div>

      {hintParts.length > 0 && (
        <p
          className="mt-1.5 truncate font-body text-[12px] leading-tight text-muted-foreground"
          title={hintTitle}
        >
          {hintParts.join(" · ")}
        </p>
      )}

      {/* Métricas — faixa full-width centralizada */}
      <div className="mt-2 grid w-full grid-cols-3 divide-x divide-border rounded-xl border border-border bg-secondary/40 py-2">
        <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-center">
          <p className="text-xs font-semibold text-muted-foreground">
            Fila
          </p>
          <p className="font-display text-[14px] font-bold leading-none text-[var(--text-primary)]">
            {r.queueCount}
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-center">
          <p className="text-xs font-semibold text-muted-foreground">
            Limite
          </p>
          <InlineQueueLimit userId={r.userId} value={r.queueLimit} canEdit={canManage} />
        </div>
        <div
          className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-center"
          data-tour={tourAnchor ? "distribution-eligibility" : undefined}
        >
          <p className="text-xs font-semibold text-muted-foreground">
            Elegibilidade
          </p>
          {r.eligible ? (
            <span className="inline-flex max-w-full items-center justify-center gap-0.5 font-display text-[12px] font-bold leading-none text-success">
              <IconCircleCheck size={12} className="shrink-0" />
              <span className="truncate">Elegível</span>
            </span>
          ) : (
            <span className="inline-flex max-w-full items-center justify-center gap-0.5 font-display text-[12px] font-bold leading-none text-chip-red">
              <IconAlertTriangle size={12} className="shrink-0" />
              <span className="truncate">Indisp.</span>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function SchedulePresenceHint({
  schedule,
  preLunchStopMinutes,
}: {
  schedule: DistributionResponsibleDto["schedule"];
  preLunchStopMinutes?: number;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!schedule) return null;

  const alert = resolveSchedulePresenceAlert({
    schedule,
    preMinutes: preLunchStopMinutes ?? 30,
    now,
  });
  if (!alert) return null;

  return (
    <span
      className="min-w-0 truncate font-body text-[12px] font-semibold leading-tight text-primary"
      title={alert.title}
    >
      {alert.label}
    </span>
  );
}

type SchedulePresenceAlert = { label: string; title: string };

/**
 * Mostra aviso só perto do pré-corte:
 * - 10 min antes do pré-almoço → "N min para o almoço"
 * - dentro do pré-corte/almoço → "N min almoço"
 * - 10 min antes do pré-fim → "N min para a saída"
 * - dentro do pré-fim → "N min para a saída"
 * Fora dessas janelas: oculto (lista fica limpa).
 */
function resolveSchedulePresenceAlert(input: {
  schedule: NonNullable<DistributionResponsibleDto["schedule"]>;
  preMinutes: number;
  now: Date;
}): SchedulePresenceAlert | null {
  const { schedule, now } = input;
  const pre = Math.max(0, Math.floor(input.preMinutes));
  const WARN_AHEAD = 10;

  const current = localMinutesInTimezone(schedule.timezone, now);
  if (current == null) return null;
  if (!isScheduleWeekday(schedule, now)) return null;

  const lunchStart = parseHhmmToMinutes(schedule.lunchStart);
  const lunchEnd = parseHhmmToMinutes(schedule.lunchEnd);
  const endTime = parseHhmmToMinutes(schedule.endTime);
  if (lunchStart == null || lunchEnd == null || endTime == null) return null;

  const lunchPreStart = lunchStart - pre;
  const lunchWarnStart = lunchPreStart - WARN_AHEAD;
  const endPreStart = endTime - pre;
  const endWarnStart = endPreStart - WARN_AHEAD;

  // Almoço tem prioridade sobre fim do expediente.
  if (pre > 0 && current >= lunchWarnStart && current < lunchPreStart) {
    const left = lunchPreStart - current;
    return {
      label: `${left} min para o almoço`,
      title: `Pré-corte de ${pre} min começa em ${left} min (almoço ${hhmm(schedule.lunchStart)}–${hhmm(schedule.lunchEnd)})`,
    };
  }
  if (current >= lunchPreStart && current < lunchEnd) {
    if (pre > 0 && current < lunchStart) {
      return {
        label: `${pre} min almoço`,
        title: `Pré-corte ativo — para de receber leads até o fim do almoço (${hhmm(schedule.lunchEnd)})`,
      };
    }
    return {
      label: "Pausa almoço",
      title: `Em almoço até ${hhmm(schedule.lunchEnd)} — sem receber leads`,
    };
  }

  if (pre > 0 && current >= endWarnStart && current < endPreStart) {
    const left = endPreStart - current;
    return {
      label: `${left} min para a saída`,
      title: `Pré-corte de ${pre} min antes do fim (${hhmm(schedule.endTime)}) começa em ${left} min`,
    };
  }
  if (pre > 0 && current >= endPreStart && current < endTime) {
    return {
      label: `${pre} min para a saída`,
      title: `Pré-fim de expediente ativo — para de receber leads até ${hhmm(schedule.endTime)}`,
    };
  }

  return null;
}

function hhmm(v: string): string {
  return (v || "").slice(0, 5);
}

function parseHhmmToMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((v || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function localMinutesInTimezone(timezone: string, now: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "NaN");
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    // Intl pode devolver "24" em alguns engines à meia-noite.
    const h = hour === 24 ? 0 : hour;
    return h * 60 + minute;
  } catch {
    return null;
  }
}

function isScheduleWeekday(
  schedule: NonNullable<DistributionResponsibleDto["schedule"]>,
  now: Date,
): boolean {
  try {
    const weekdayStr = new Intl.DateTimeFormat("en-US", {
      timeZone: schedule.timezone || "America/Sao_Paulo",
      weekday: "short",
    }).format(now);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const day = map[weekdayStr];
    if (day == null) return true;
    return (schedule.weekdays ?? []).includes(day);
  } catch {
    return true;
  }
}

function PresenceBadge({
  status,
  paused,
  participates,
}: {
  status: DistributionResponsibleDto["status"];
  paused: boolean;
  participates: boolean;
}) {
  if (!participates) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--text-muted)]/12 px-2 py-0.5 text-[11.5px] font-semibold text-[var(--text-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" /> Inativo
      </span>
    );
  }
  const effective = paused ? "AWAY" : (status ?? "OFFLINE");
  const map = {
    ONLINE: { label: "Online", color: "var(--color-online)" },
    AWAY: { label: paused ? "Em pausa" : "Ausente", color: "#d9a514" },
    OFFLINE: { label: "Offline", color: "var(--text-muted)" },
  } as const;
  const cfg = map[effective];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
      style={{ backgroundColor: `${cfg.color}1f`, color: cfg.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}

// ── Busca + popover de filtros (padrão Logs/Contatos) ────────────────────

const PRESENCE_OPTIONS: { value: PresenceKey; label: string; dot: string }[] = [
  { value: "ONLINE", label: "Online", dot: "bg-emerald-500" },
  { value: "AWAY", label: "Em pausa / ausente", dot: "bg-amber-500" },
  { value: "OFFLINE", label: "Offline", dot: "bg-muted-foreground" },
  { value: "INACTIVE", label: "Inativo", dot: "bg-muted-foreground" },
];

const ELIGIBILITY_OPTIONS: { value: "eligible" | "blocked"; label: string }[] = [
  { value: "eligible", label: "Elegível" },
  { value: "blocked", label: "Indisponível" },
];

function DistributionSearchFilterBar({
  search,
  onSearch,
  presence,
  onPresenceChange,
  eligibility,
  onEligibilityChange,
  types,
  onTypesChange,
  typeOptions,
  onClearAll,
}: {
  search: string;
  onSearch: (v: string) => void;
  presence: PresenceKey[];
  onPresenceChange: (v: PresenceKey[]) => void;
  eligibility: ("eligible" | "blocked")[];
  onEligibilityChange: (v: ("eligible" | "blocked")[]) => void;
  types: string[];
  onTypesChange: (v: string[]) => void;
  typeOptions: string[];
  onClearAll: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const activeCount =
    presence.length + (eligibility.length === 1 ? 1 : 0) + types.length;

  const toggle = <T,>(current: T[], val: T, setter: (v: T[]) => void) => {
    setter(current.includes(val) ? current.filter((x) => x !== val) : [...current, val]);
  };

  return (
    <div ref={ref} data-tour="distribution-search" className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar responsáveis..."
        ariaLabel="Buscar e filtrar responsáveis"
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
        chips={[
          ...(presence.length
            ? [{ id: "presence", title: "Presença", count: presence.length, onRemove: () => onPresenceChange([]) }]
            : []),
          ...(eligibility.length === 1
            ? [{ id: "elig", title: "Elegibilidade", count: 1, onRemove: () => onEligibilityChange([]) }]
            : []),
          ...(types.length
            ? [{ id: "type", title: "Tipo", count: types.length, onRemove: () => onTypesChange([]) }]
            : []),
        ]}
      />

      <FilterColumnsModal
        open={open}
        onClose={() => setOpen(false)}
        onClear={onClearAll}
        onApply={() => setOpen(false)}
        count={activeCount}
        clearDisabled={activeCount === 0 && !search}
        title="Filtrar responsáveis"
        labelledBy="Filtros de responsáveis"
      >
        <FilterCategoryColumn title="Presença" hint="Disponibilidade" icon={<IconUsers size={16} stroke={2.2} />}>
          {PRESENCE_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              tone="fill"
              dot={opt.dot}
              selected={presence.includes(opt.value)}
              onClick={() => toggle(presence, opt.value, onPresenceChange)}
            >
              {opt.label}
            </FilterChip>
          ))}
        </FilterCategoryColumn>
        <FilterCategoryColumn title="Elegibilidade" hint="Aptidão à fila" icon={<IconUserCheck size={16} stroke={2.2} />}>
          {ELIGIBILITY_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              tone="fill"
              selected={eligibility.includes(opt.value)}
              onClick={() => {
                onEligibilityChange(eligibility.includes(opt.value) ? [] : [opt.value]);
              }}
            >
              {opt.label}
            </FilterChip>
          ))}
        </FilterCategoryColumn>
        <FilterCategoryColumn title="Tipo" hint="Categoria do responsável" icon={<IconTag size={16} stroke={2.2} />}>
          {typeOptions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-secondary px-3 py-3 text-sm text-muted-foreground">
              Nenhum tipo/segmento cadastrado nos responsáveis.
            </p>
          ) : (
            typeOptions.map((t) => (
              <FilterChip
                key={t}
                tone="fill"
                selected={types.includes(t)}
                onClick={() => toggle(types, t, onTypesChange)}
              >
                {t}
              </FilterChip>
            ))
          )}
        </FilterCategoryColumn>
      </FilterColumnsModal>
    </div>
  );
}

// ── Menu hamburger (CTAs da página) ──────────────────────────────────────

function DistributionActionsMenu({
  onTest,
  testing,
  onRetry,
  retrying,
  canRetry,
  hasFilters,
  onClearFilters,
  onDepartmentsConfig,
}: {
  onTest: () => void;
  testing: boolean;
  onRetry: () => void;
  retrying: boolean;
  canRetry: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
  onDepartmentsConfig?: () => void;
}) {
  return (
    <PageActionsMenu
      items={[
        ...(onDepartmentsConfig
          ? [
              {
                icon: <IconSettings size={13} />,
                label: "Configurações",
                onClick: onDepartmentsConfig,
                primary: true as const,
                tourId: "distribution-settings",
              },
            ]
          : []),
        {
          icon: retrying ? (
            <IconLoader2 size={13} className="animate-spin" />
          ) : (
            <IconRefresh size={13} />
          ),
          label: retrying ? "Reprocessando…" : "Reprocessar fila",
          onClick: onRetry,
          disabled: retrying || !canRetry,
          primary: !onDepartmentsConfig,
          tourId: "distribution-retry",
        },
        {
          icon: <IconX size={13} />,
          label: "Limpar filtros",
          onClick: onClearFilters,
          disabled: !hasFilters,
          divider: true,
        },
        {
          icon: testing ? (
            <IconLoader2 size={13} className="animate-spin" />
          ) : (
            <IconPlayerPlay size={13} />
          ),
          label: testing ? "Testando…" : "Testar distribuição",
          onClick: onTest,
          disabled: testing,
          tourId: "distribution-test",
        },
      ]}
    />
  );
}

// ── Painel de simulação ─────────────────────────────────────────────────

function SimulationPanel({
  result,
  onClose,
}: {
  result: DistributionResult;
  onClose: () => void;
}) {
  return (
    <div className="shrink-0 rounded-[var(--radius-xl)] border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/[0.06] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconPlayerPlay size={18} className="text-[var(--brand-primary)]" />
          <div>
            <p className="font-display text-[14px] font-bold text-[var(--text-primary)]">
              Resultado da simulação
            </p>
            <p className="font-body text-[13px] text-[var(--text-secondary)]">
              {result.success
                ? `O lead seria atribuído a ${result.selectedUserName ?? "—"}.`
                : result.reason === "NO_ELIGIBLE_RESPONSIBLE"
                  ? "Nenhum responsável elegível no momento."
                  : "Módulo de Distribuição não habilitado."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)]"
          aria-label="Fechar"
        >
          <IconX size={16} />
        </button>
      </div>
      {result.evaluated.length > 0 && (
        <p className="mt-2 font-body text-[12px] text-[var(--text-muted)]">
          {result.evaluated.filter((e) => e.eligible).length} de{" "}
          {result.evaluated.length} responsáveis elegíveis (simulação não atribui
          nem registra log).
        </p>
      )}
    </div>
  );
}

// ── Fila de espera (aba complementar) ────────────────────────────────────

const QUEUE_COLUMN_CLASS =
  "grid items-center gap-3 grid-cols-[minmax(240px,1.6fr)_minmax(160px,1fr)_110px_minmax(140px,0.9fr)_minmax(160px,1.2fr)]";

function PendingQueueCards({
  view,
  pending,
  total: totalProp,
  nextCursor: nextCursorProp = null,
  illustrative = false,
  onRetry,
  retrying,
  loading = false,
  live = false,
}: {
  view: CardsTableView;
  pending: PendingDistributionDto[];
  total?: number;
  nextCursor?: string | null;
  illustrative?: boolean;
  onRetry: () => void;
  retrying: boolean;
  loading?: boolean;
  live?: boolean;
}) {
  const [sortKey, setSortKey] = useState<QueueSortKey>("waitingMin");
  const [sortDir, setSortDir] = useState<Exclude<SortDir, null>>("desc");
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const pageCursor = cursors[page - 1] ?? null;
  const extraQuery = usePendingDistributions(live && !!pageCursor, pageCursor);
  const pagePending = pageCursor
    ? (extraQuery.data?.pending ?? [])
    : pending;
  const pageNextCursor = pageCursor
    ? (extraQuery.data?.nextCursor ?? null)
    : nextCursorProp;
  const reportedTotal = extraQuery.data?.total ?? totalProp;
  const pageTotal =
    typeof reportedTotal === "number"
      ? Math.max(reportedTotal, pagePending.length)
      : pagePending.length;
  const pageLoading = Boolean(pageCursor) && extraQuery.isLoading;
  const lastPage = Math.max(1, Math.ceil(pageTotal / PENDING_PAGE_SIZE));

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  const deptsQuery = useDepartments();
  const departments = deptsQuery.data ?? [];

  const hrefById = useMemo(() => {
    const map = new Map<string, string>();
    if (illustrative) return map;
    for (const p of pagePending) {
      map.set(p.id, inboxConversationHref(p.number, p.id, "entrada"));
    }
    return map;
  }, [pagePending, illustrative]);

  const rows = useMemo(() => {
    if (illustrative) return queueItems;
    if (pagePending.length > 0) return pagePending.map((p) => pendingToQueueItem(p));
    return [];
  }, [illustrative, pagePending]);

  const sorted = useMemo(
    () => sortQueueItems(rows, sortKey, sortDir),
    [rows, sortKey, sortDir],
  );

  const dirFor = (key: QueueSortKey): SortDir => (sortKey === key ? sortDir : null);

  function toggleSort(key: QueueSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "contact" || key === "department" ? "asc" : "desc");
  }

  function goPrev() {
    setPage((p) => Math.max(1, p - 1));
  }

  function goNext() {
    if (!pageNextCursor) return;
    setCursors((prev) => {
      const next = prev.slice();
      next[page] = pageNextCursor;
      return next;
    });
    setPage((p) => p + 1);
  }

  const listLoading = loading || pageLoading;

  return (
    <section data-tour="distribution-queue" className={LIST_PAGE_PANE_CLASS}>
      <div className="mb-2.5 flex shrink-0 flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
            <IconClockExclamation size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              Aguardando distribuição
              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold tabular-nums text-warning">
                {illustrative ? rows.length : pageTotal}
              </span>
            </h2>
            <p className="mt-0.5 text-pretty text-xs leading-snug text-muted-foreground">
              Atendimentos sem responsável elegível. Redistribuídos automaticamente quando alguém fica elegível, libera capacidade ou pelo job de segurança.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying || (illustrative ? pending.length === 0 : pageTotal === 0)}
          className="inline-flex w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 self-start rounded-full border border-warning/50 bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning transition-colors hover:opacity-90 disabled:opacity-50 sm:w-auto sm:self-auto"
        >
          {retrying ? (
            <IconLoader2 size={14} className="animate-spin" />
          ) : (
            <IconRefresh size={14} />
          )}
          Reprocessar agora
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <IconPhone size={24} />
          </div>
          <p className="font-display text-[14px] font-bold text-foreground">
            {listLoading ? "Carregando fila…" : "Nenhum atendimento na fila"}
          </p>
          <p className="font-body text-[12px] text-muted-foreground">
            {listLoading
              ? "Buscando atendimentos sem responsável."
              : "Tudo distribuído. Novos contatos aparecerão aqui."}
          </p>
        </div>
      ) : (
        <ListHScroll scrollerClassName="pb-1">
          <DataView
            view={view}
            columnClass={QUEUE_COLUMN_CLASS}
            className={LIST_PAGE_STACK_CLASS}
            header={
              <>
                <SortableHeader
                  label="Contato"
                  sort={dirFor("contact")}
                  onSort={() => toggleSort("contact")}
                />
                <SortableHeader
                  label="Departamento"
                  sort={dirFor("department")}
                  onSort={() => toggleSort("department")}
                />
                <SortableHeader
                  label="Espera"
                  sort={dirFor("waitingMin")}
                  onSort={() => toggleSort("waitingMin")}
                />
                <SortableHeader
                  label="Entrou em"
                  sort={dirFor("enteredAt")}
                  onSort={() => toggleSort("enteredAt")}
                />
                <ListColumnLabel>Motivo</ListColumnLabel>
              </>
            }
          >
            {sorted.map((item) => {
              const href = hrefById.get(item.id);
              const waitTone =
                item.waitingMin >= 30
                  ? "bg-chip-red-soft text-chip-red"
                  : "bg-chip-orange-soft text-chip-orange";
              const deptColor = colorForQueueDepartment(item, departments);
              const cells = (
                <>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ChatAvatar
                      user={{ id: item.id, name: item.contact }}
                      phone={item.phone || null}
                      channel={item.phone ? "whatsapp" : null}
                      size={AVATAR_SIZE.md}
                    />
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                        {item.contact}
                      </p>
                      <div className="truncate font-body text-[12px] tabular-nums text-[var(--text-muted)]">
                        {item.phone || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <Chip color={deptColor} className="max-w-full">
                      {item.department}
                    </Chip>
                  </div>
                  <span
                    className={cn(
                      "inline-flex w-fit items-center rounded-full px-2 py-0.5 font-display text-[12px] font-bold tabular-nums",
                      waitTone,
                    )}
                  >
                    {item.waitingMin} min
                  </span>
                  <span className="block truncate font-display text-[13px] tabular-nums text-[var(--text-secondary)]">
                    {item.enteredLabel}
                  </span>
                  <span className="block truncate font-display text-[13px] text-[var(--text-secondary)]">
                    {item.reason}
                  </span>
                </>
              );
              return (
                <DataRow
                  key={item.id}
                  className={href ? "cursor-pointer" : undefined}
                >
                  {href ? (
                    <Link href={href} className="contents" title="Abrir conversa no inbox">
                      {cells}
                    </Link>
                  ) : (
                    cells
                  )}
                </DataRow>
              );
            })}
          </DataView>
        </ListHScroll>
      )}

      {!illustrative && pageTotal > 0 ? (
        <PaginationGlass
          total={pageTotal}
          entityLabel="atendimentos"
          page={page}
          lastPage={lastPage}
          canPrev={page > 1}
          canNext={Boolean(pageNextCursor)}
          onPrev={goPrev}
          onNext={goNext}
        />
      ) : null}
    </section>
  );
}

// ── Diálogo de edição (admin/manager) ───────────────────────────────────

function RedistributeDialog({
  source,
  candidates,
  onClose,
}: {
  source: DistributionResponsibleDto;
  candidates: DistributionResponsibleDto[];
  onClose: () => void;
}) {
  const mut = useRedistributeResponsible();
  const [mode, setMode] = useState<RedistributeMode>("equal");
  const [queueScope, setQueueScope] = useState<RedistributeQueueScope>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");

  const onlineCandidates = useMemo(
    () =>
      candidates.filter(
        (c) =>
          c.participates &&
          !c.paused &&
          (c.status ?? "OFFLINE") === "ONLINE",
      ),
    [candidates],
  );

  const filteredCandidates = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    const list = [...candidates].sort((a, b) => {
      const aOn = (a.status ?? "OFFLINE") === "ONLINE" ? 0 : 1;
      const bOn = (b.status ?? "OFFLINE") === "ONLINE" ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", "pt-BR");
    });
    if (!q) return list;
    return list.filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [candidates, recipientSearch]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const toggleRecipient = (id: string) =>
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );

  const canSubmit =
    source.queueCount > 0 &&
    (mode === "equal"
      ? onlineCandidates.length > 0
      : mode === "to_pending"
        ? true
        : selectedIds.length > 0) &&
    !mut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mut.mutate(
      {
        userId: source.userId,
        input: {
          mode,
          queueScope,
          ...(mode === "specific" ? { recipientUserIds: selectedIds } : {}),
        },
      },
      {
        onSuccess: ({ result }) => {
          if (result.moved === 0) {
            toast.message("Nenhum lead movido.", {
              description:
                result.total === 0
                  ? "Não havia conversas na fila selecionada."
                  : `${result.skipped} conversa(s) não puderam ser reatribuídas.`,
            });
          } else if (mode === "to_pending") {
            toast.success(
              `${result.moved} lead(s) enviados para a Fila de espera.`,
              {
                description:
                  "Serão distribuídos automaticamente quando um consultor ficar online.",
              },
            );
          } else {
            const detail = result.recipients
              .filter((r) => r.received > 0)
              .map((r) => `${r.name ?? "Consultor"}: ${r.received}`)
              .join(" · ");
            toast.success(
              `${result.moved} lead(s) redistribuído(s).`,
              detail ? { description: detail } : undefined,
            );
          }
          onClose();
        },
        onError: (err) => toast.error(err.message || "Erro ao redistribuir."),
      },
    );
  };

  const scopeOptions: { value: RedistributeQueueScope; label: string; hint: string }[] = [
    {
      value: "all",
      label: "Fila completa",
      hint: `${source.queueCount} lead(s) na fila atual`,
    },
    {
      value: "entrada",
      label: "Entrada",
      hint: "Sem resposta humana ainda",
    },
    {
      value: "aguardando",
      label: "Aguardando",
      hint: "Cliente falou por último",
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[17px] font-bold text-[var(--text-primary)]">
              Redistribuir fila
            </h2>
            <p className="font-body text-[13px] text-[var(--text-muted)]">
              De {source.name ?? source.email ?? "consultor"} · {source.queueCount}{" "}
              na fila
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)]"
            aria-label="Fechar"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <fieldset>
            <legend className="mb-2 font-display text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Qual fila mover
            </legend>
            <div className="grid gap-2">
              {scopeOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors",
                    queueScope === opt.value
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/8"
                      : "border-[var(--glass-border)] hover:bg-[var(--glass-bg-overlay)]",
                  )}
                >
                  <input
                    type="radio"
                    name="queueScope"
                    className="mt-0.5"
                    checked={queueScope === opt.value}
                    onChange={() => setQueueScope(opt.value)}
                  />
                  <span>
                    <span className="block font-display text-[13px] font-bold text-[var(--text-primary)]">
                      {opt.label}
                    </span>
                    <span className="block font-body text-[12px] text-[var(--text-muted)]">
                      {opt.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-display text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Destino
            </legend>
            <div className="grid gap-2">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors",
                  mode === "equal"
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/8"
                    : "border-[var(--glass-border)] hover:bg-[var(--glass-bg-overlay)]",
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  className="mt-0.5"
                  checked={mode === "equal"}
                  onChange={() => setMode("equal")}
                />
                <span>
                  <span className="block font-display text-[13px] font-bold text-[var(--text-primary)]">
                    Distribuir por igual (online)
                  </span>
                  <span className="block font-body text-[12px] text-[var(--text-muted)]">
                    {onlineCandidates.length > 0
                      ? `${onlineCandidates.length} consultor(es) online elegível(is)`
                      : "Nenhum consultor online no momento"}
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors",
                  mode === "specific"
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/8"
                    : "border-[var(--glass-border)] hover:bg-[var(--glass-bg-overlay)]",
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  className="mt-0.5"
                  checked={mode === "specific"}
                  onChange={() => setMode("specific")}
                />
                <span>
                  <span className="block font-display text-[13px] font-bold text-[var(--text-primary)]">
                    Escolher consultor(es)
                  </span>
                  <span className="block font-body text-[12px] text-[var(--text-muted)]">
                    Um ou mais destinatários específicos (round-robin)
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors",
                  mode === "to_pending"
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/8"
                    : "border-[var(--glass-border)] hover:bg-[var(--glass-bg-overlay)]",
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  className="mt-0.5"
                  checked={mode === "to_pending"}
                  onChange={() => setMode("to_pending")}
                />
                <span>
                  <span className="block font-display text-[13px] font-bold text-[var(--text-primary)]">
                    Enviar para Fila de espera
                  </span>
                  <span className="block font-body text-[12px] text-[var(--text-muted)]">
                    Remove o responsável e deixa aguardando o próximo consultor online
                    {onlineCandidates.length === 0
                      ? " (útil quando ninguém está ativo)"
                      : ""}
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {mode === "specific" && (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <IconSearch
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  type="search"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Buscar consultor…"
                  className="w-full rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] py-2 pl-8 pr-3 font-body text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--glass-border)]">
                {filteredCandidates.length === 0 ? (
                  <p className="px-3 py-4 text-center font-body text-[12px] text-[var(--text-muted)]">
                    Nenhum consultor encontrado.
                  </p>
                ) : (
                  filteredCandidates.map((c) => {
                    const checked = selectedIds.includes(c.userId);
                    const presence = classifyPresence(c);
                    return (
                      <label
                        key={c.userId}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 border-b border-[var(--glass-border-subtle)] px-3 py-2 last:border-b-0 hover:bg-[var(--glass-bg-overlay)]",
                          checked && "bg-[var(--brand-primary)]/6",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRecipient(c.userId)}
                        />
                        <UserAvatar
                          name={c.name ?? c.email}
                          imageUrl={c.avatarUrl}
                          size={28}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-[12.5px] font-bold text-[var(--text-primary)]">
                            {c.name ?? c.email ?? "—"}
                          </span>
                          <span className="block truncate font-body text-[11px] text-[var(--text-muted)]">
                            {presence === "ONLINE"
                              ? "Online"
                              : presence === "AWAY"
                                ? "Ausente"
                                : presence === "INACTIVE"
                                  ? "Inativo"
                                  : "Offline"}
                            {" · "}
                            fila {c.queueCount}/{c.queueLimit}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedIds.length > 0 && (
                <p className="font-body text-[12px] text-[var(--text-muted)]">
                  {selectedIds.length} selecionado(s)
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 py-2 font-display text-[12.5px] font-bold text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-3.5 py-2 font-display text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mut.isPending ? (
                <>
                  <IconLoader2 size={14} className="animate-spin" /> Redistribuindo…
                </>
              ) : (
                <>
                  <IconArrowsShuffle size={14} /> Confirmar
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function EditResponsibleDialog({
  responsible,
  onClose,
}: {
  responsible: DistributionResponsibleDto;
  onClose: () => void;
}) {
  const updateMut = useUpdateResponsible();
  const deptsQuery = useDepartments();
  const [participates, setParticipates] = useState(responsible.participates);
  const [paused, setPaused] = useState(responsible.paused);
  const [queueLimit, setQueueLimit] = useState(String(responsible.queueLimit));
  const [volume, setVolume] = useState(String(responsible.volume ?? 1));
  const [type, setType] = useState(responsible.type ?? "");
  const [lunchStart, setLunchStart] = useState(
    responsible.schedule?.lunchStart ?? "12:00",
  );
  const [lunchEnd, setLunchEnd] = useState(
    responsible.schedule?.lunchEnd ?? "13:00",
  );
  const [startTime, setStartTime] = useState(
    responsible.schedule?.startTime ?? "08:00",
  );
  const [endTime, setEndTime] = useState(
    responsible.schedule?.endTime ?? "18:00",
  );
  const [preLunchStop, setPreLunchStop] = useState(
    String(responsible.preLunchStopMinutes ?? 30),
  );
  const [saturdayEnabled, setSaturdayEnabled] = useState(
    responsible.schedule?.saturdayEnabled ?? false,
  );
  const [satStart, setSatStart] = useState(
    responsible.schedule?.saturdayStart ?? "09:00",
  );
  const [satEnd, setSatEnd] = useState(
    responsible.schedule?.saturdayEnd ?? "13:00",
  );
  const [deptIds, setDeptIds] = useState<string[]>(
    responsible.departments?.map((d) => d.id) ?? [],
  );

  const toggleDept = (id: string) =>
    setDeptIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const limit = Math.max(0, Math.floor(Number(queueLimit) || 0));
    const weight = Math.max(0, Math.floor(Number(volume) || 0));
    const preMins = Math.min(
      180,
      Math.max(0, Math.floor(Number(preLunchStop) || 0)),
    );
    const toHhmm = (v: string) => v.slice(0, 5);
    updateMut.mutate(
      {
        userId: responsible.userId,
        input: {
          participates,
          paused,
          queueLimit: limit,
          volume: weight,
          type: type.trim() || null,
          departmentIds: deptIds,
          preLunchStopMinutes: preMins,
          schedule: {
            lunchStart: toHhmm(lunchStart),
            lunchEnd: toHhmm(lunchEnd),
            startTime: toHhmm(startTime),
            endTime: toHhmm(endTime),
            timezone: responsible.schedule?.timezone ?? "America/Sao_Paulo",
            weekdays: responsible.schedule?.weekdays ?? [1, 2, 3, 4, 5],
            saturdayEnabled,
            saturdayStart: toHhmm(satStart),
            saturdayEnd: toHhmm(satEnd),
          },
        },
      },
      {
        onSuccess: () => {
          toast.success("Responsável atualizado.");
          onClose();
        },
        onError: (err) => toast.error(err.message || "Erro ao atualizar."),
      },
    );
  };

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Editar responsável"
      description={responsible.name ?? responsible.email ?? "—"}
      icon={
        <FormDialogIcon>
          <IconPencil className="size-4" />
        </FormDialogIcon>
      }
      size="md"
      className="bg-card border-border backdrop-blur-none"
      busy={updateMut.isPending}
      headerAccessory={<PageTourButton tourId="distribution-edit" size="sm" />}
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={onClose}
            disabled={updateMut.isPending}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="submit"
            form="edit-responsible-form"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={updateMut.isPending}
            data-tour="dist-edit-submit"
          >
            {updateMut.isPending ? "Salvando…" : "Salvar"}
          </ButtonGlass>
        </>
      }
    >
      <form
        id="edit-responsible-form"
        onSubmit={handleSave}
        className="flex flex-col gap-4"
      >
          <div data-tour="dist-edit-active">
          <ToggleField
            label="Ativo na distribuição"
            hint="Desligado = inativo (não recebe leads)."
            checked={participates}
            onChange={setParticipates}
          />
          </div>
          <div data-tour="dist-edit-paused">
          <ToggleField
            label="Em pausa"
            hint="Pausa temporária — não recebe leads enquanto ativa."
            checked={paused}
            onChange={setPaused}
          />
          </div>

          <div
            className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/50 p-3"
            data-tour="dist-edit-schedule"
          >
            <span className="font-body text-[12px] font-semibold text-muted-foreground">
              Expediente
            </span>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--text-muted)]">Início</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={formControlClass}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--text-muted)]">Saída</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={formControlClass}
                  required
                />
              </label>
            </div>
            <span className="font-body text-[12px] font-semibold text-[var(--text-secondary)]">
              Almoço
            </span>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--text-muted)]">Início</span>
                <input
                  type="time"
                  value={lunchStart}
                  onChange={(e) => setLunchStart(e.target.value)}
                  className={formControlClass}
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--text-muted)]">Fim</span>
                <input
                  type="time"
                  value={lunchEnd}
                  onChange={(e) => setLunchEnd(e.target.value)}
                  className={formControlClass}
                  required
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--text-muted)]">
                Parar de receber leads (min antes do almoço e da saída)
              </span>
              <input
                type="number"
                min={0}
                max={180}
                value={preLunchStop}
                onChange={(e) => setPreLunchStop(e.target.value)}
                className={formControlClass}
              />
              <span className="text-[11px] text-[var(--text-muted)]">
                Default 30. Ex.: almoço 12:00 e saída 18:00 com 30 min → para às
                11:30 e às 17:30. 0 = só no intervalo de almoço (sem pré-corte).
              </span>
            </label>
          </div>

          <div
            className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/50 p-3"
            data-tour="dist-edit-saturday"
          >
            <ToggleField
              label="Trabalha no sábado"
              hint="Ligado = fica elegível no sábado dentro do horário abaixo (sem almoço). Desligado = sábado fora do expediente."
              checked={saturdayEnabled}
              onChange={setSaturdayEnabled}
            />
            <div
              className={cn(
                "grid grid-cols-2 gap-2 transition-opacity",
                saturdayEnabled ? "" : "pointer-events-none opacity-50",
              )}
            >
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--text-muted)]">Início</span>
                <input
                  type="time"
                  value={satStart}
                  onChange={(e) => setSatStart(e.target.value)}
                  className={formControlClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-[var(--text-muted)]">Saída</span>
                <input
                  type="time"
                  value={satEnd}
                  onChange={(e) => setSatEnd(e.target.value)}
                  className={formControlClass}
                />
              </label>
            </div>
          </div>

          <label className="flex flex-col gap-1" data-tour="dist-edit-limit">
            <span className="font-body text-[12px] font-semibold text-[var(--text-secondary)]">
              Limite de fila (conversas aguardando resposta)
            </span>
            <input
              type="number"
              min={0}
              value={queueLimit}
              onChange={(e) => setQueueLimit(e.target.value)}
              className={formControlClass}
            />
            <span className="text-[11px] text-[var(--text-muted)]">
              Máximo de cards Entrada + Aguardando. Ao atingir, para de receber
              até a fila cair. 0 = não recebe.
            </span>
          </label>

          <label className="flex flex-col gap-1" data-tour="dist-edit-type">
            <span className="font-body text-[12px] font-semibold text-[var(--text-secondary)]">
              Peso (volume)
            </span>
            <input
              type="number"
              min={0}
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2 font-body text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
            />
            <span className="text-[11px] text-[var(--text-muted)]">
              Peso no rateio entre consultores elegíveis. Maior = recebe mais.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-body text-[12px] font-semibold text-[var(--text-secondary)]">
              Tipo / segmento (opcional)
            </span>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="ex.: inbound, vendas, suporte"
              className={formControlClass}
            />
          </label>

          <div className="flex flex-col gap-1.5" data-tour="dist-edit-depts">
            <span className="font-body text-[12px] font-semibold text-[var(--text-secondary)]">
              Departamentos (o que este consultor recebe)
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              O consultor só recebe leads roteados para os departamentos marcados.
            </span>
            {deptsQuery.isLoading ? (
              <p className="py-1 text-[12px] text-[var(--text-muted)]">Carregando…</p>
            ) : (deptsQuery.data?.length ?? 0) === 0 ? (
              <p className="py-1 text-[12px] text-[var(--text-muted)]">
                Nenhum departamento cadastrado.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {deptsQuery.data?.map((d) => {
                  const on = deptIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDept(d.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12px] font-bold transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {on && <IconCheck size={12} stroke={2.4} />}
                      {d.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
      </form>
    </FormDialog>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-body text-[13px] font-semibold text-[var(--text-primary)]">{label}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors",
          checked
            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
            : "border-[var(--text-muted)]/40 bg-[var(--text-muted)]/25",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-black/10 bg-white shadow-sm transition-all",
            checked ? "right-0.5" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

// ── Estados auxiliares ──────────────────────────────────────────────────

function NotEnabledState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-12 text-center shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
      <DistributionIcon size={36} className="text-[var(--text-muted)]" />
      <p className="font-display text-[16px] font-bold text-[var(--text-primary)]">
        Módulo de Distribuição não habilitado
      </p>
      <p className="max-w-md font-body text-[13px] text-[var(--text-muted)]">
        A Distribuição Inteligente é um módulo instalável. Ative-o na Central de
        Widgets para liberar esta área.
      </p>
      <Link
        href="/widgets"
        className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[13px] font-bold text-white transition-all hover:-translate-y-px"
      >
        Ir para a Central de Widgets
      </Link>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-danger)]/20 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-6 text-center font-body text-[13px] text-[var(--color-danger-text)]">
      {message || "Erro ao carregar a distribuição."}
    </div>
  );
}

function SkeletonState() {
  return (
    <AppLoading />
  );
}
