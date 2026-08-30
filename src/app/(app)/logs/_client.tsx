"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import {
  IconAdjustmentsHorizontal,
  IconActivity,
  IconArrowsExchange,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconBriefcase,
  IconBuildingCommunity,
  IconCheck,
  IconChecklist,
  IconClipboardList,
  IconCopy,
  IconExternalLink,
  IconLink,
  IconMail,
  IconMessageCircle,
  IconPhone,
  IconPhoneCall,
  IconPhoneCheck,
  IconPhoneIncoming,
  IconPhoneOutgoing,
  IconRefresh,
  IconRotateClockwise,
  IconSearch,
  IconSettings,
  IconTestPipe,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { CallHistoryList } from "@/features/softphone/components/call-history-list";
import {
  CallsSearchFilterBar,
  type CallsFilterState,
} from "@/features/softphone/components/calls-search-filter-bar";
import { useCallsWidget } from "@/features/softphone/hooks/use-calls-widget";
import {
  getCallsStats,
  listCalls,
  syncCalls,
} from "@/features/softphone/api/extensions";
import type { ListCallsFilters } from "@/features/softphone/api/types";
import { RestrictedScreen } from "@/components/crm/restricted-screen";
import { useRequireManager } from "@/hooks/use-user-role";
import { DataView, DataRow } from "@/components/automations/data-view";
import { ViewToggle, useCardsTableView } from "@/components/automations/view-toggle";
import { PageChrome } from "@/components/crm/page-header";
import { HeaderTabs, SectionHeader } from "@/components/crm/section-header";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import {
  FilterChip,
  FilterPopoverBody,
  FilterPopoverHeader,
  FilterPopoverPanel,
  FilterSectionLabel,
  FilterSegmentedTabs,
} from "@/components/crm/filter-popover";
import {
  PeriodCalendarButton,
  PeriodIsoRangePanel,
  PeriodPresetPanel,
} from "@/components/crm/period-calendar-button";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { LIST_PAGE_PANE_CLASS, LIST_PAGE_STACK_CLASS, PaginationGlass } from "@/components/crm/pagination-glass";
import {
  SortableHeader,
  type SortDir,
} from "@/components/crm/sortable-header";
import { EmptyState } from "@/components/crm/empty-state";
import { KpiSquareScroll } from "@/components/crm/kpi-card";
import { PageDemoBanner } from "@/components/crm/page-demo-banner";
import {
  EVENT_CONFIG,
  FALLBACK_CONFIG,
  actorDisplay,
  eventDescription,
  type FeedEvent,
} from "@/components/crm/feed";
import { useActivityFeed } from "@/features/activity-feed/use-activity-feed";
import type { ActivityFeedFilters } from "@/features/activity-feed/api";
import { useActivityStats } from "@/features/activity-feed/use-activity-stats";
import { MOCK_FEED } from "@/features/activity-feed/mock-feed";
import { shouldAutoDemoEmpty } from "@/lib/page-mock-mode";
import { cn } from "@/lib/utils";
import { SystemUsageTab } from "@/features/system-usage/system-usage-tab";
import {
  defaultSystemUsagePeriod,
  type SystemUsagePeriodValue,
} from "@/features/system-usage/system-usage-period-filter";
import { LogsStatsPanel } from "./_stats-panel";

const LOG_TABS = [
  "Eventos",
  "Chamadas",
  "Estatísticas",
  "Uso do sistema",
] as const;

const ENTITY_OPTIONS = [
  { value: "ALL", label: "Todas as entidades" },
  { value: "DEAL", label: "Negócios" },
  { value: "CONTACT", label: "Contatos" },
  { value: "CONVERSATION", label: "Conversas" },
  { value: "MESSAGE", label: "Mensagens" },
  { value: "ACTIVITY", label: "Tarefas" },
  { value: "NOTE", label: "Notas" },
];

const ACTOR_OPTIONS = [
  { value: "ALL", label: "Todos os atores" },
  { value: "HUMAN", label: "Humanos" },
  { value: "AI", label: "Agentes IA" },
  { value: "AUTOMATION", label: "Automações" },
  { value: "INTEGRATION", label: "Integrações" },
  { value: "SYSTEM", label: "Sistema" },
];

const ENTITY_LABEL: Record<string, string> = {
  DEAL: "Negócio",
  CONTACT: "Contato",
  CONVERSATION: "Conversa",
  MESSAGE: "Mensagem",
  ACTIVITY: "Tarefa",
  NOTE: "Nota",
  TAG: "Tag",
};

const ACTOR_BADGE: Record<
  FeedEvent["actorType"] & string,
  { label: string; className: string }
> = {
  HUMAN: {
    label: "Humano",
    className:
      "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]",
  },
  AI: {
    label: "IA",
    className: "bg-fuchsia-500/10 text-[var(--color-fuchsia)] dark:text-[var(--color-fuchsia)]",
  },
  AUTOMATION: {
    label: "Automação",
    className: "bg-purple-500/10 text-[var(--color-lavender)] dark:text-[var(--color-lavender)]",
  },
  INTEGRATION: {
    label: "Integração",
    className: "bg-sky-500/10 text-[var(--color-sky)] dark:text-[var(--color-sky)]",
  },
  SYSTEM: {
    label: "Sistema",
    className: "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
  },
};

// 6 colunas: Evento | Detalhe | Entidade | Origem | Responsável | Data.
// minmax garante largura mínima legível mesmo ao rolar lateralmente.
const FEED_GRID =
  "grid-cols-[minmax(160px,1.4fr)_minmax(180px,1.7fr)_minmax(150px,1.5fr)_minmax(150px,1.5fr)_minmax(120px,0.9fr)_minmax(132px,0.85fr)]";

function endOfInclusiveDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

/** Detalhe da lista de Eventos: sem timestamp (a coluna Data já mostra data+hora). */
function eventListDetail(ev: FeedEvent): string {
  if (ev.type === "CREATED") return "";
  if (ev.type === "CONTACT_CREATED") {
    return String(
      ev.meta?.name ?? ev.meta?.preview ?? ev.entityLabel ?? "",
    ).trim();
  }
  return eventDescription(ev);
}

type SortColumn = "evento" | "detalhe" | "entidade" | "origem" | "ator" | "data";

function resolveEntityId(ev: FeedEvent): string | null {
  const t = ev.entityType;
  if (t === "DEAL") return ev.dealId ?? ev.entityId ?? null;
  if (t === "CONTACT" || t === "MESSAGE")
    return ev.contactId ?? ev.entityId ?? null;
  if (t === "CONVERSATION") return ev.conversationId ?? ev.entityId ?? null;
  return ev.entityId ?? null;
}

function truncateId(id: string): string {
  if (id.length <= 10) return `#${id}`;
  return `#${id.slice(0, 8)}…`;
}

async function copyId(id: string) {
  try {
    await navigator.clipboard.writeText(id);
    toast.success("ID copiado", { description: id });
  } catch {
    toast.error("Não foi possível copiar o ID");
  }
}

interface OriginInfo {
  pill: "client" | "agent" | "channel" | null;
  primary: string | null;
  secondary: string | null;
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  manual: "Manual",
  webhook: "Webhook",
  api: "API",
  automation: "Automação",
};

function resolveChannelLabel(raw: string): string {
  return CHANNEL_LABEL[raw.toLowerCase()] ?? raw;
}

function resolveOrigin(ev: FeedEvent): OriginInfo {
  // Mensagens: direção (cliente enviou / agente enviou)
  if (ev.type === "MESSAGE_RECEIVED") {
    const name = ev.contactName ?? ev.entityLabel ?? null;
    return { pill: "client", primary: name, secondary: null };
  }
  if (
    ev.type === "MESSAGE_SENT" ||
    ev.type === "SCHEDULED_MESSAGE_SENT" ||
    ev.type === "MESSAGE_FAILED" ||
    ev.type === "MESSAGE_READ"
  ) {
    const agent = ev.actorUser?.name ?? ev.actorLabel ?? null;
    const client =
      ev.contactName ??
      (typeof ev.meta?.contactName === "string" ? ev.meta.contactName : null) ??
      ev.entityLabel ??
      null;
    return {
      pill: "agent",
      primary: agent,
      secondary: client ? `Cliente: ${client}` : null,
    };
  }
  // Todos os outros eventos: mostrar canal se disponível no meta
  const rawChannel =
    typeof ev.meta?.channel === "string" ? ev.meta.channel : null;
  if (rawChannel) {
    return { pill: "channel", primary: resolveChannelLabel(rawChannel), secondary: null };
  }
  return { pill: null, primary: null, secondary: null };
}

export default function LogsClientPage() {
  const { ready, isManagerUp } = useRequireManager();
  const { status: sessionStatus } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState(0);
  const [view, setView] = useCardsTableView();
  const isFeed = activeTab === 0;
  const isCalls = activeTab === 1;
  const isStats = activeTab === 2;
  const isUsage = activeTab === 3;

  // Filtro de período da aba "Uso do sistema" (30d default).
  const [usagePeriod, setUsagePeriod] = React.useState<SystemUsagePeriodValue>(
    () => defaultSystemUsagePeriod(),
  );

  // Aba Chamadas (histórico movido do ícone da nav rail para dentro de Logs).
  const callsWidget = useCallsWidget(sessionStatus === "authenticated");
  const queryClient = useQueryClient();
  const callsSyncMutation = useMutation({
    mutationFn: syncCalls,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      if (res?.reason === "no_api4com_token") return;
      const total = (res?.created ?? 0) + (res?.updated ?? 0);
      if (total > 0) {
        toast.success(
          `Chamadas sincronizadas (${res.created} nova(s), ${res.updated} atualizada(s)).`,
        );
      }
    },
    onError: () => {
      toast.error("Não foi possível sincronizar as chamadas agora.");
    },
  });
  const [callsSearch, setCallsSearch] = React.useState<string>("");
  const [callsSearchDebounced, setCallsSearchDebounced] = React.useState<string>("");
  const [callsFilters, setCallsFilters] = React.useState<CallsFilterState>({});
  const [callsPage, setCallsPage] = React.useState<number>(1);
  const [callsSortBy, setCallsSortBy] = React.useState<
    ListCallsFilters["sortBy"]
  >("startedAt");
  const [callsSortDir, setCallsSortDir] = React.useState<
    ListCallsFilters["sortDir"]
  >("desc");
  React.useEffect(() => {
    const t = setTimeout(() => setCallsSearchDebounced(callsSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [callsSearch]);
  // Reset da paginação quando busca/filtros mudam.
  React.useEffect(() => {
    setCallsPage(1);
  }, [
    callsSearchDebounced,
    callsFilters.direction,
    callsFilters.status,
    callsFilters.dateFrom,
    callsFilters.dateTo,
  ]);

  const callsListFilters = React.useMemo<ListCallsFilters>(
    () => ({
      page: callsPage,
      perPage: 25,
      search: callsSearchDebounced || undefined,
      direction: callsFilters.direction,
      status: callsFilters.status,
      dateFrom: callsFilters.dateFrom,
      dateTo: callsFilters.dateTo,
      sortBy: callsSortBy,
      sortDir: callsSortDir,
    }),
    [
      callsPage,
      callsSearchDebounced,
      callsFilters,
      callsSortBy,
      callsSortDir,
    ],
  );

  // Total de chamadas para o contador da aba — mesma queryKey da lista, então
  // o cache é compartilhado com o CallHistoryList (sem fetch duplicado).
  const { data: callsData } = useQuery({
    queryKey: ["calls", callsListFilters],
    queryFn: () => listCalls(callsListFilters),
    enabled: callsWidget.enabled === true,
  });
  const callsTotal = callsData?.total;

  // Mini-dash da aba Chamadas — respeita busca/período (não filtra por direção
  // ou status, pois é justamente o breakdown desses eixos).
  const callsStatsFilters = React.useMemo(
    () => ({
      search: callsSearchDebounced || undefined,
      dateFrom: callsFilters.dateFrom,
      dateTo: callsFilters.dateTo,
    }),
    [callsSearchDebounced, callsFilters.dateFrom, callsFilters.dateTo],
  );
  const { data: callsStats } = useQuery({
    queryKey: ["calls-stats", callsStatsFilters],
    queryFn: () => getCallsStats(callsStatsFilters),
    enabled: callsWidget.enabled === true && isCalls,
  });

  // Sincronização é manual via menu de ações (não dispara toast ao abrir a aba).

  const [entity, setEntity] = React.useState<string>("ALL");
  const [actor, setActor] = React.useState<string>("ALL");
  const [q, setQ] = React.useState<string>("");
  const [qDebounced, setQDebounced] = React.useState<string>("");
  const [demo, setDemo] = React.useState<boolean>(false);
  const [limit, setLimit] = React.useState<number>(25);
  const [page, setPage] = React.useState(1);
  const [cursors, setCursors] = React.useState<(string | null)[]>([null]);
  const [feedPeriod, setFeedPeriod] = React.useState<SystemUsagePeriodValue>(
    () => defaultSystemUsagePeriod(),
  );
  const [stagePipelineId, setStagePipelineId] = React.useState<string | null>(null);
  const [stageFrom, setStageFrom] = React.useState<string[]>([]);
  const [stageTo, setStageTo] = React.useState<string[]>([]);

  React.useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const filters = React.useMemo<ActivityFeedFilters>(
    () => ({
      entityType: entity === "ALL" ? undefined : [entity],
      actorType: actor === "ALL" ? undefined : [actor],
      q: qDebounced || undefined,
      dateFrom: feedPeriod.range.from
        ? feedPeriod.range.from.toISOString()
        : undefined,
      dateTo: feedPeriod.range.to
        ? endOfInclusiveDay(feedPeriod.range.to).toISOString()
        : undefined,
      stagePipelineId: stagePipelineId || undefined,
      stageFrom: stageFrom.length ? stageFrom : undefined,
      stageTo: stageTo.length ? stageTo : undefined,
      limit,
    }),
    [entity, actor, qDebounced, feedPeriod, stagePipelineId, stageFrom, stageTo, limit],
  );

  const filterKey = React.useMemo(
    () =>
      JSON.stringify({
        entityType: filters.entityType,
        actorType: filters.actorType,
        q: filters.q,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        stagePipelineId: filters.stagePipelineId,
        stageFrom: filters.stageFrom,
        stageTo: filters.stageTo,
      }),
    [filters],
  );

  React.useEffect(() => {
    setPage(1);
    setCursors([null]);
  }, [filterKey, limit]);

  const cursor = cursors[page - 1] ?? null;
  const { data, isLoading, isError } = useActivityFeed(filters, cursor);

  const realItems = data?.items ?? [];
  const nextCursor = data?.nextCursor ?? null;

  React.useEffect(() => {
    if (!nextCursor) return;
    setCursors((prev) => {
      if (prev[page] === nextCursor) return prev;
      const next = prev.slice(0, page);
      next[page] = nextCursor;
      return next;
    });
  }, [nextCursor, page]);

  const hasFilters =
    entity !== "ALL" ||
    actor !== "ALL" ||
    Boolean(q) ||
    feedPeriod.preset !== "30d" ||
    Boolean(stagePipelineId) ||
    stageFrom.length > 0 ||
    stageTo.length > 0;

  // Modo demonstração: ativo manualmente OU automaticamente quando não há
  // eventos reais e nenhum filtro aplicado (para visualizar todos os tipos).
  const isDemo =
    demo ||
    shouldAutoDemoEmpty({
      realCount: realItems.length,
      hasFilters,
      isLoading,
      isError,
    });

  const mockItems = React.useMemo(() => {
    const start = (page - 1) * limit;
    return MOCK_FEED.slice(start, start + limit);
  }, [page, limit]);

  const allItems = isDemo ? mockItems : realItems;
  const demoHasNext = isDemo && page * limit < MOCK_FEED.length;
  const canNextPage = isDemo ? demoHasNext : Boolean(nextCursor);

  const [sort, setSort] = React.useState<{ column: SortColumn; dir: Exclude<SortDir, null> }>(
    { column: "data", dir: "desc" },
  );

  const isDefaultSort = sort.column === "data" && sort.dir === "desc";

  const sortedFlat = React.useMemo(() => {
    if (isDefaultSort) return allItems;
    const arr = [...allItems];
    const dir = sort.dir === "asc" ? 1 : -1;
    const getKey = (ev: FeedEvent): string => {
      if (sort.column === "evento")
        return (EVENT_CONFIG[ev.type]?.label ?? ev.type).toLowerCase();
      if (sort.column === "detalhe") return eventListDetail(ev).toLowerCase();
      if (sort.column === "entidade")
        return [
          ENTITY_LABEL[ev.entityType ?? ""] ?? ev.entityType ?? "",
          ev.entityLabel ?? "",
        ]
          .join(" ")
          .toLowerCase();
      if (sort.column === "origem") {
        const o = resolveOrigin(ev);
        return [o.pill ?? "", o.primary ?? ""].join(" ").toLowerCase();
      }
      if (sort.column === "ator")
        return (actorDisplay(ev).label ?? "").toLowerCase();
      return ev.occurredAt;
    };
    arr.sort((a, b) => {
      const ka = getKey(a);
      const kb = getKey(b);
      if (sort.column === "data") {
        return (
          (new Date(ka).getTime() - new Date(kb).getTime()) * dir
        );
      }
      return ka.localeCompare(kb, "pt-BR") * dir;
    });
    return arr;
  }, [allItems, sort, isDefaultSort]);

  const toggleSort = (column: SortColumn) => {
    setSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: column === "data" ? "desc" : "asc" },
    );
  };

  const statsRange = React.useMemo(
    () => ({
      dateFrom: feedPeriod.range.from
        ? feedPeriod.range.from.toISOString()
        : undefined,
      dateTo: feedPeriod.range.to
        ? endOfInclusiveDay(feedPeriod.range.to).toISOString()
        : undefined,
    }),
    [feedPeriod],
  );

  // Estatísticas só devem carregar quando a aba correspondente estiver ativa.
  const { data: stats, isLoading: statsLoading } = useActivityStats(
    isStats,
    statsRange,
  );

  const feedBooting =
    isFeed && isLoading && realItems.length === 0 && !isError && !isDemo;
  const [feedChromeReady, setFeedChromeReady] = React.useState(false);
  React.useEffect(() => {
    if (!feedBooting) setFeedChromeReady(true);
  }, [feedBooting]);

  if (ready && !isManagerUp) return <RestrictedScreen />;

  if (feedBooting && !feedChromeReady) {
    return (
      <div className="v2-screen grid min-w-0 grid-cols-[var(--nav-rail-w,72px)_1fr] gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
        <NavRailSpacer />
        <main
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          aria-busy="true"
          aria-label="Carregando logs"
        />
      </div>
    );
  }

  return (
    <div className="v2-screen grid min-w-0 grid-cols-[var(--nav-rail-w,72px)_1fr] gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
      <NavRailSpacer />

      <PageChrome
        header={
        <SectionHeader
          icon={ClipboardList}
          title="Logs"
          search={isFeed || (isCalls && callsWidget.enabled === true)}
          searchSlot={
            isFeed ? (
              <FeedSearchFilterBar
                search={q}
                onSearch={setQ}
                entity={entity}
                onEntityChange={setEntity}
                actor={actor}
                onActorChange={setActor}
                stagePipelineId={stagePipelineId}
                onStagePipelineChange={setStagePipelineId}
                stageFrom={stageFrom}
                onStageFromChange={setStageFrom}
                stageTo={stageTo}
                onStageToChange={setStageTo}
              />
            ) : isCalls && callsWidget.enabled === true ? (
              <CallsSearchFilterBar
                search={callsSearch}
                onSearch={setCallsSearch}
                filters={callsFilters}
                onFiltersChange={setCallsFilters}
              />
            ) : undefined
          }
          period={
            isFeed || isStats ? (
              <PeriodCalendarButton active={feedPeriod.preset !== "30d"}>
                <PeriodPresetPanel value={feedPeriod} onChange={setFeedPeriod} />
              </PeriodCalendarButton>
            ) : isUsage ? (
              <PeriodCalendarButton active={usagePeriod.preset !== "30d"}>
                <PeriodPresetPanel value={usagePeriod} onChange={setUsagePeriod} />
              </PeriodCalendarButton>
            ) : isCalls && callsWidget.enabled === true ? (
              <PeriodCalendarButton
                active={!!(callsFilters.dateFrom || callsFilters.dateTo)}
              >
                <PeriodIsoRangePanel
                  from={callsFilters.dateFrom ?? ""}
                  to={callsFilters.dateTo ?? ""}
                  onChange={({ from, to }) =>
                    setCallsFilters((prev) => ({
                      ...prev,
                      dateFrom: from || undefined,
                      dateTo: to || undefined,
                    }))
                  }
                  allowClear
                />
              </PeriodCalendarButton>
            ) : undefined
          }
          actions={
            <>
              {isFeed || isCalls || isUsage ? (
                <ViewToggle value={view} onChange={setView} />
              ) : null}
              <HeaderTabs
                tabs={LOG_TABS.map((label, index) => ({
                  key: String(index),
                  label,
                  badge: index === 1 && typeof callsTotal === "number" ? callsTotal : undefined,
                }))}
                value={String(activeTab)}
                onChange={(v) => setActiveTab(Number(v))}
              />
            </>
          }
          menu={isFeed || (isCalls && callsWidget.enabled === true)}
          menuSlot={
            isFeed ? (
              <FeedActionsMenu
                demo={demo}
                onToggleDemo={() => setDemo((d) => !d)}
                hasFilters={hasFilters}
                onClearFilters={() => {
                  setEntity("ALL");
                  setActor("ALL");
                  setQ("");
                  setFeedPeriod(defaultSystemUsagePeriod());
                  setStagePipelineId(null);
                  setStageFrom([]);
                  setStageTo([]);
                }}
              />
            ) : isCalls && callsWidget.enabled === true ? (
              <CallsActionsMenu
                syncing={callsSyncMutation.isPending}
                onSync={() => callsSyncMutation.mutate()}
                onSettings={() => router.push("/widgets?configure=calls_history")}
              />
            ) : undefined
          }
        />
        }
        bodyClassName="gap-3 sm:gap-4"
      >

        {isFeed ? (
          <>
            <FeedMiniDash items={allItems} />

            {isDemo && (
              <PageDemoBanner>
                Dados de exemplo — um evento de cada tipo para visualizar as
                variações visuais. Os eventos reais aparecerão aqui assim que
                ocorrerem.
              </PageDemoBanner>
            )}

            <div className={LIST_PAGE_PANE_CLASS}>
            {isLoading && allItems.length === 0 && !isError ? (
              <div className="min-h-[12rem]" aria-busy="true" aria-label="Carregando eventos" />
            ) : isError && !isDemo ? (
              <div className="flex-1 rounded-[var(--radius-xl)] border border-[var(--color-danger)]/20 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-6 text-center font-body text-[13px] text-[var(--color-danger-text)]">
                Não foi possível carregar o feed.
              </div>
            ) : allItems.length === 0 ? (
              <div className="flex-1 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-md shadow-[var(--glass-shadow)]">
                <EmptyState
                  icon={<IconClipboardList size={28} />}
                  title="Nenhum evento encontrado"
                  description={
                    hasFilters
                      ? "Sem resultados para os filtros atuais."
                      : "Os eventos da operação aparecerão aqui."
                  }
                />
              </div>
            ) : (
              <div className={cn("min-w-0 overflow-x-auto", LIST_PAGE_STACK_CLASS)}>
              <DataView
                view={view}
                columnClass={`grid ${FEED_GRID} items-center gap-3.5`}
                className="min-w-[960px]"
                header={
                  <>
                    <SortableHeader
                      label="Evento"
                      sort={sort.column === "evento" ? sort.dir : null}
                      onSort={() => toggleSort("evento")}
                    />
                    <SortableHeader
                      label="Detalhe"
                      sort={sort.column === "detalhe" ? sort.dir : null}
                      onSort={() => toggleSort("detalhe")}
                    />
                    <SortableHeader
                      label="Entidade"
                      sort={sort.column === "entidade" ? sort.dir : null}
                      onSort={() => toggleSort("entidade")}
                    />
                    <SortableHeader
                      label="Origem"
                      sort={sort.column === "origem" ? sort.dir : null}
                      onSort={() => toggleSort("origem")}
                    />
                    <SortableHeader
                      label="Responsável"
                      sort={sort.column === "ator" ? sort.dir : null}
                      onSort={() => toggleSort("ator")}
                    />
                    <SortableHeader
                      label="Data"
                      sort={sort.column === "data" ? sort.dir : null}
                      onSort={() => toggleSort("data")}
                      align="right"
                    />
                  </>
                }
              >
                  {sortedFlat.map((ev) => (
                    <EventCard key={ev.id} event={ev} />
                  ))}
              </DataView>
              </div>
            )}

            {!isLoading && !isError && allItems.length > 0 && (
              <PaginationGlass
                label={`${allItems.length} eventos · página ${page}`}
                page={page}
                canPrev={page > 1}
                canNext={canNextPage}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
                perPage={limit}
                onPerPageChange={setLimit}
              />
            )}
            </div>
          </>
        ) : isUsage ? (
          <SystemUsageTab view={view} range={usagePeriod.range} />
        ) : isCalls ? (
          callsWidget.isLoading ? (
            <div className="min-h-0 flex-1" aria-busy="true" aria-label="Carregando chamadas" />
          ) : callsWidget.enabled !== true ? (
            <CallsNotEnabledState />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <CallsMiniDash stats={callsStats} />
              <CallHistoryList
                view={view}
                groupByDay
                filters={callsListFilters}
                onFiltersChange={(f) => {
                  if (f.page !== undefined) setCallsPage(f.page);
                  if (f.sortBy !== undefined) setCallsSortBy(f.sortBy);
                  if (f.sortDir !== undefined) setCallsSortDir(f.sortDir);
                }}
              />
            </div>
          )
        ) : (
          <div className="flex flex-col">
            {statsLoading || !stats ? (
              <div className="min-h-[12rem]" aria-busy="true" aria-label="Carregando estatísticas" />
            ) : (
              <LogsStatsPanel stats={stats} />
            )}
          </div>
        )}
      </PageChrome>
    </div>
  );
}

// Mini-dash de chamadas — 4 KPIs (feitas, recebidas, atendidas %, completadas %)
type CallsStatsSnapshot = {
  total: number;
  inbound: number;
  outbound: number;
  answered: number;
  completed: number;
};

function CallsMiniDash({ stats }: { stats: CallsStatsSnapshot | undefined }) {
  const s = stats ?? { total: 0, inbound: 0, outbound: 0, answered: 0, completed: 0 };
  const pct = (n: number) =>
    s.total > 0 ? Math.round((n / s.total) * 100) : 0;

  const cards: {
    key: string;
    label: string;
    shortLabel: string;
    value: number;
    percent?: number;
    accent: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "outbound",
      label: "Ligações feitas",
      shortLabel: "Feitas",
      value: s.outbound,
      accent: "var(--brand-primary)",
      icon: <IconPhoneOutgoing size={16} />,
    },
    {
      key: "inbound",
      label: "Ligações recebidas",
      shortLabel: "Recebidas",
      value: s.inbound,
      accent: "var(--color-success)",
      icon: <IconPhoneIncoming size={16} />,
    },
    {
      key: "answered",
      label: "Atendidas",
      shortLabel: "Atendidas",
      value: s.answered,
      percent: pct(s.answered),
      accent: "var(--color-warning)",
      icon: <IconPhoneCall size={16} />,
    },
    {
      key: "completed",
      label: "Completadas",
      shortLabel: "Completadas",
      value: s.completed,
      percent: pct(s.completed),
      accent: "var(--brand-secondary, #a78bfa)",
      icon: <IconPhoneCheck size={16} />,
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
          accent: c.accent,
          percent: c.percent,
        }))}
      />
      <div className="hidden gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-4">
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
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[22px] font-bold leading-none tabular-nums text-[var(--text-primary)]">
                  {c.value.toLocaleString("pt-BR")}
                </span>
                {c.percent !== undefined && (
                  <span
                    className="font-display text-[12px] font-bold tabular-nums"
                    style={{ color: c.accent }}
                  >
                    {c.percent}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CallsNotEnabledState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-12 text-center shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
      <IconPhone size={36} className="text-[var(--text-muted)]" />
      <p className="font-display text-[16px] font-bold text-[var(--text-primary)]">
        Módulo de Telefonia não habilitado
      </p>
      <p className="max-w-md font-body text-[13px] text-[var(--text-muted)]">
        O histórico de chamadas, o softphone integrado e o botão de ligar nos
        cards fazem parte do widget de Telefonia. Ative-o na Central de Widgets
        para liberar esta área.
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

function EventCard({ event }: { event: FeedEvent }) {
  const cfg = EVENT_CONFIG[event.type] ?? FALLBACK_CONFIG;
  const Icon = cfg.Icon;
  const detail = eventListDetail(event);
  const actor = actorDisplay(event);
  const badge = ACTOR_BADGE[actor.type] ?? ACTOR_BADGE.SYSTEM;

  // Evita duplicar o nome do contato: quando o rótulo da entidade é o
  // mesmo do ator (ex.: "Mensagem recebida" → entidade e ator são o
  // contato), mostramos só o TIPO da entidade na coluna Entidade.
  const actorNorm = (actor.label ?? "").trim().toLowerCase();
  const entityLabelText =
    event.entityLabel && event.entityLabel.trim().toLowerCase() !== actorNorm
      ? event.entityLabel
      : null;

  const entityId = resolveEntityId(event);
  const origin = resolveOrigin(event);

  return (
    <DataRow>
      {/* Coluna: Evento */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${cfg.ring} ${cfg.bg}`}
        >
          <Icon size={14} />
        </span>
        <span className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
          {cfg.label}
        </span>
      </div>

      {/* Coluna: Detalhe */}
      <span className="block truncate font-display text-[12.5px] text-[var(--text-secondary)]">
        {detail || "—"}
      </span>

      {/* Coluna: Entidade — pill clicável (quando há link) + copy ID + copy link */}
      <div className="min-w-0">
        <EntityCell
          entityType={event.entityType ?? null}
          entityLabel={entityLabelText}
          entityId={entityId}
        />
      </div>

      {/* Coluna: Origem — canal em pill com ícone dedicado (WhatsApp, IG, etc.) */}
      <div className="min-w-0">
        <OriginCell origin={origin} />
      </div>

      {/* Coluna: Responsável */}
      <div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-display text-[11px] font-semibold ${badge.className}`}
        >
          {actor.label}
        </span>
      </div>

      {/* Coluna: Data */}
      <div className="text-right">
        <EventDate iso={event.occurredAt} />
      </div>
    </DataRow>
  );
}

// ── Célula de Entidade ──────────────────────────────────────────────────────
// Padrão: pill do tipo + nome truncável. Quando há link canônico (DEAL,
// CONTACT, CONVERSATION, MESSAGE) a pill vira Link e ganha um botão de
// "copiar link" ao lado do "copiar ID".

function entityHref(entityType: string | null, entityId: string): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "DEAL":
      return `/deals/${entityId}`;
    case "CONTACT":
      return `/contacts/${entityId}`;
    case "CONVERSATION":
    case "MESSAGE":
      return `/inbox?c=${encodeURIComponent(entityId)}`;
    case "ACTIVITY":
      return `/activities/${entityId}`;
    default:
      return null;
  }
}

const ENTITY_PILL_STYLE: Record<
  string,
  { className: string; icon: React.ReactNode }
> = {
  DEAL: {
    className:
      "bg-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] text-[var(--brand-primary-dark)]",
    icon: <IconBriefcase size={11} />,
  },
  CONTACT: {
    className:
      "bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)] text-[var(--color-info)]",
    icon: <IconUsers size={11} />,
  },
  CONVERSATION: {
    className:
      "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]",
    icon: <IconMessageCircle size={11} />,
  },
  MESSAGE: {
    className:
      "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]",
    icon: <IconMessageCircle size={11} />,
  },
  ACTIVITY: {
    className:
      "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)]",
    icon: <IconChecklist size={11} />,
  },
  NOTE: {
    className: "bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
    icon: <IconClipboardList size={11} />,
  },
  TAG: {
    className: "bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
    icon: null,
  },
};

async function copyEntityLink(path: string) {
  try {
    const url = new URL(path, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado", { description: url });
  } catch {
    toast.error("Não foi possível copiar o link");
  }
}

function EntityCell({
  entityType,
  entityLabel,
  entityId,
}: {
  entityType: string | null;
  entityLabel: string | null;
  entityId: string | null;
}) {
  if (!entityType && !entityLabel) {
    return (
      <span className="font-display text-[12.5px] text-[var(--text-muted)]">
        —
      </span>
    );
  }

  const style = (entityType && ENTITY_PILL_STYLE[entityType]) || {
    className: "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]",
    icon: null as React.ReactNode,
  };
  const label = entityType ? ENTITY_LABEL[entityType] ?? entityType : null;
  const href = entityType && entityId ? entityHref(entityType, entityId) : null;

  const pill = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.04em] transition-transform",
        style.className,
        href && "hover:-translate-y-px hover:brightness-95",
      )}
    >
      {style.icon}
      {label}
      {href && <IconExternalLink size={9} className="opacity-70" />}
    </span>
  );

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1.5">
        {href ? (
          <Link
            href={href}
            title={`Abrir ${label?.toLowerCase()}`}
            className="shrink-0"
          >
            {pill}
          </Link>
        ) : (
          pill
        )}
        {entityLabel && (
          <span className="min-w-0 truncate font-display text-[12.5px] text-[var(--text-secondary)]">
            {entityLabel}
          </span>
        )}
      </span>
      {entityId && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void copyId(entityId)}
            title={`Copiar ID: ${entityId}`}
            className="inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-secondary)]"
          >
            <span>{truncateId(entityId)}</span>
            <IconCopy size={10} />
          </button>
          {href && (
            <button
              type="button"
              onClick={() => void copyEntityLink(href)}
              title="Copiar link"
              className="inline-flex items-center rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)]"
            >
              <IconLink size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Célula de Origem ────────────────────────────────────────────────────────
// Pill com ícone dedicado por canal (WhatsApp, IG, Facebook, etc). Para
// mensagens (cliente/agente) mantém a pill neutra existente.

const CHANNEL_STYLE: Record<
  string,
  { icon: React.ReactNode; className: string }
> = {
  whatsapp: {
    icon: <IconBrandWhatsapp size={11} />,
    className:
      "bg-[color-mix(in_srgb,#25D366_16%,transparent)] text-[#128C4A]",
  },
  instagram: {
    icon: <IconBrandInstagram size={11} />,
    className:
      "bg-[color-mix(in_srgb,#DD2A7B_14%,transparent)] text-[#C13584]",
  },
  facebook: {
    icon: <IconBrandFacebook size={11} />,
    className:
      "bg-[color-mix(in_srgb,#1877F2_14%,transparent)] text-[#1877F2]",
  },
  telegram: {
    icon: <IconBrandTelegram size={11} />,
    className:
      "bg-[color-mix(in_srgb,#0088CC_14%,transparent)] text-[#0088CC]",
  },
  email: {
    icon: <IconMail size={11} />,
    className:
      "bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)] text-[var(--color-info)]",
  },
  webhook: {
    icon: <IconActivity size={11} />,
    className: "bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
  },
  api: {
    icon: <IconActivity size={11} />,
    className: "bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
  },
  manual: {
    icon: null,
    className: "bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
  },
  automation: {
    icon: <IconActivity size={11} />,
    className:
      "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)]",
  },
};

function OriginCell({ origin }: { origin: OriginInfo }) {
  if (!origin.pill) {
    return (
      <span className="font-display text-[12.5px] text-[var(--text-muted)]">
        —
      </span>
    );
  }

  let pillNode: React.ReactNode = null;
  if (origin.pill === "client") {
    pillNode = (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-display text-[10px] font-bold bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)] text-[var(--color-info)]">
        Cliente
      </span>
    );
  } else if (origin.pill === "agent") {
    pillNode = (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-display text-[10px] font-bold bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]">
        Agente
      </span>
    );
  } else {
    const key = (origin.primary ?? "").toLowerCase();
    const style = CHANNEL_STYLE[key] ?? {
      icon: <IconActivity size={11} />,
      className: "bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
    };
    pillNode = (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-display text-[10px] font-bold",
          style.className,
        )}
      >
        {style.icon}
        {origin.primary}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1.5">
        {pillNode}
        {origin.pill !== "channel" && origin.primary && (
          <span className="min-w-0 truncate font-display text-[12.5px] text-[var(--text-secondary)]">
            {origin.primary}
          </span>
        )}
      </span>
      {origin.secondary && (
        <span className="truncate font-display text-[11px] text-[var(--text-muted)]">
          {origin.secondary}
        </span>
      )}
    </div>
  );
}

// ── Mini-dash de Eventos ────────────────────────────────────────────────────
// Mesmo padrão do mini-dash de Chamadas: 4 KPIs derivados do lote carregado.

function FeedMiniDash({ items }: { items: FeedEvent[] }) {
  const stats = React.useMemo(() => {
    let messages = 0;
    let conversations = 0;
    let deals = 0;
    for (const ev of items) {
      const t = ev.entityType;
      if (t === "MESSAGE") messages++;
      else if (t === "CONVERSATION") conversations++;
      else if (t === "DEAL") deals++;
    }
    return { total: items.length, messages, conversations, deals };
  }, [items]);

  const cards: {
    key: string;
    label: string;
    shortLabel: string;
    value: number;
    accent: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: "total",
      label: "Total de eventos",
      shortLabel: "Eventos",
      value: stats.total,
      accent: "var(--brand-primary)",
      icon: <IconActivity size={16} />,
    },
    {
      key: "messages",
      label: "Mensagens",
      shortLabel: "Mensagens",
      value: stats.messages,
      accent: "var(--color-success)",
      icon: <IconMessageCircle size={16} />,
    },
    {
      key: "conversations",
      label: "Conversas",
      shortLabel: "Conversas",
      value: stats.conversations,
      accent: "var(--color-info)",
      icon: <IconUsers size={16} />,
    },
    {
      key: "deals",
      label: "Negócios",
      shortLabel: "Negócios",
      value: stats.deals,
      accent: "var(--brand-secondary, #a78bfa)",
      icon: <IconBriefcase size={16} />,
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
          accent: c.accent,
        }))}
      />
      <div className="hidden gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-4">
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
              <div className="font-display text-[22px] font-bold leading-none tabular-nums text-[var(--text-primary)]">
                {c.value.toLocaleString("pt-BR")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function EventDate({ iso }: { iso: string }) {
  const d = parseISO(iso);
  return (
    <span className="font-display tabular-nums text-[12.5px] text-[var(--text-muted)]">
      {format(d, "dd/MM/yyyy HH:mm", { locale: ptBR })}
    </span>
  );
}

// ── Feed: busca + popover de filtros (padrão Contatos/Empresas) ─────────────

type FeedFilterTab = "entidade" | "ator" | "transicao";

const FEED_FILTER_TABS: {
  id: FeedFilterTab;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "entidade",
    label: "Entidade",
    icon: <IconBuildingCommunity size={14} stroke={2.2} />,
  },
  { id: "ator", label: "Ator", icon: <IconUsers size={14} stroke={2.2} /> },
  {
    id: "transicao",
    label: "Fase",
    icon: <IconArrowsExchange size={14} stroke={2.2} />,
  },
];

type PipelineWithStagesLite = {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
};

function usePipelinesLite(enabled: boolean) {
  return useQuery<PipelineWithStagesLite[]>({
    queryKey: ["logs-pipelines-lite"],
    queryFn: async () => {
      const res = await fetch("/api/pipelines");
      if (!res.ok) throw new Error("Falha ao carregar pipelines");
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });
}

function FeedSearchFilterBar({
  search,
  onSearch,
  entity,
  onEntityChange,
  actor,
  onActorChange,
  stagePipelineId,
  onStagePipelineChange,
  stageFrom,
  onStageFromChange,
  stageTo,
  onStageToChange,
}: {
  search: string;
  onSearch: (v: string) => void;
  entity: string;
  onEntityChange: (v: string) => void;
  actor: string;
  onActorChange: (v: string) => void;
  stagePipelineId: string | null;
  onStagePipelineChange: (v: string | null) => void;
  stageFrom: string[];
  onStageFromChange: (v: string[]) => void;
  stageTo: string[];
  onStageToChange: (v: string[]) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<FeedFilterTab>("entidade");

  const stageTransitionActive =
    Boolean(stagePipelineId) || stageFrom.length > 0 || stageTo.length > 0;

  const activeCount =
    (entity !== "ALL" ? 1 : 0) +
    (actor !== "ALL" ? 1 : 0) +
    (stageTransitionActive ? 1 : 0);

  const { data: pipelines = [] } = usePipelinesLite(open && tab === "transicao");
  const currentPipeline = React.useMemo(
    () => pipelines.find((p) => p.id === stagePipelineId) ?? null,
    [pipelines, stagePipelineId],
  );

  const toggleStageId = (
    current: string[],
    id: string,
    setter: (v: string[]) => void,
  ) => {
    if (current.includes(id)) setter(current.filter((x) => x !== id));
    else setter([...current, id]);
  };

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const tabBadge = (id: FeedFilterTab) => {
    if (id === "entidade") return entity !== "ALL" ? 1 : 0;
    if (id === "ator") return actor !== "ALL" ? 1 : 0;
    if (id === "transicao")
      return (
        (stagePipelineId ? 1 : 0) +
        (stageFrom.length > 0 ? 1 : 0) +
        (stageTo.length > 0 ? 1 : 0)
      );
    return 0;
  };

  function clearAll() {
    onEntityChange("ALL");
    onActorChange("ALL");
    onStagePipelineChange(null);
    onStageFromChange([]);
    onStageToChange([]);
  }

  return (
    <div ref={ref} className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar eventos..."
        ariaLabel="Buscar e filtrar eventos"
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
      />

      {open ? (
        <FilterPopoverPanel className="w-[min(100vw-2rem,420px)]">
          <FilterPopoverHeader
            count={activeCount}
            onClear={clearAll}
            clearDisabled={activeCount === 0}
          />
          <FilterSegmentedTabs
            value={tab}
            onChange={setTab}
            tabs={FEED_FILTER_TABS.map((t) => ({
              id: t.id,
              label: t.label,
              icon: t.icon,
              badge: tabBadge(t.id),
            }))}
          />
          <FilterPopoverBody>
            {tab === "entidade" && (
              <div className="flex flex-wrap gap-1.5">
                {ENTITY_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    selected={entity === opt.value}
                    onClick={() => onEntityChange(opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            )}

            {tab === "ator" && (
              <div className="flex flex-wrap gap-1.5">
                {ACTOR_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    selected={actor === opt.value}
                    onClick={() => onActorChange(opt.value)}
                  >
                    {opt.label}
                  </FilterChip>
                ))}
              </div>
            )}

            {tab === "transicao" && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl border border-border bg-secondary px-3 py-2 text-sm leading-snug text-muted-foreground">
                  Filtra apenas eventos de <b className="text-foreground">mudança de fase</b>. Combina com
                  período e ator selecionados. Escolha o funil e, opcionalmente,
                  as fases de <b className="text-foreground">origem</b> e <b className="text-foreground">destino</b>.
                </div>

                <div>
                  <FilterSectionLabel>Funil</FilterSectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterChip
                      selected={!stagePipelineId}
                      onClick={() => {
                        onStagePipelineChange(null);
                        onStageFromChange([]);
                        onStageToChange([]);
                      }}
                    >
                      Todos
                    </FilterChip>
                    {pipelines.map((p) => (
                      <FilterChip
                        key={p.id}
                        selected={stagePipelineId === p.id}
                        onClick={() => {
                          onStagePipelineChange(p.id);
                          onStageFromChange([]);
                          onStageToChange([]);
                        }}
                      >
                        {p.name}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                {currentPipeline && (
                  <>
                    <StagePicker
                      label="De (fase de origem)"
                      hint="Vazio = qualquer fase de origem"
                      stages={currentPipeline.stages}
                      selected={stageFrom}
                      onToggle={(id) =>
                        toggleStageId(stageFrom, id, onStageFromChange)
                      }
                      onClear={() => onStageFromChange([])}
                    />
                    <StagePicker
                      label="Para (fase de destino)"
                      hint="Vazio = qualquer fase de destino"
                      stages={currentPipeline.stages}
                      selected={stageTo}
                      onToggle={(id) =>
                        toggleStageId(stageTo, id, onStageToChange)
                      }
                      onClear={() => onStageToChange([])}
                    />
                  </>
                )}

                {!currentPipeline && pipelines.length > 0 && (
                  <p className="rounded-xl border border-dashed border-border bg-secondary px-3 py-3 text-center text-sm text-muted-foreground">
                    Selecione um funil acima para escolher as fases de origem
                    e destino.
                  </p>
                )}
              </div>
            )}
          </FilterPopoverBody>
        </FilterPopoverPanel>
      ) : null}
    </div>
  );
}

function StagePicker({
  label,
  hint,
  stages,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  hint: string;
  stages: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            limpar ({selected.length})
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {stages.map((s) => (
          <FilterChip
            key={s.id}
            selected={selected.includes(s.id)}
            onClick={() => onToggle(s.id)}
          >
            {s.name}
          </FilterChip>
        ))}
      </div>
      <p className="mt-1 text-xs italic text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Menu hamburger do Feed — Limpar filtros + Modo demonstração. */
function FeedActionsMenu({
  demo,
  onToggleDemo,
  hasFilters,
  onClearFilters,
}: {
  demo: boolean;
  onToggleDemo: () => void;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  return (
    <PageActionsMenu
      items={[
        {
          icon: <IconX size={13} />,
          label: "Limpar filtros",
          onClick: onClearFilters,
          disabled: !hasFilters,
          primary: false,
        },
        {
          icon: <IconTestPipe size={13} />,
          label: demo ? "Desativar modo demo" : "Ativar modo demo",
          onClick: onToggleDemo,
          active: demo,
          divider: true,
        },
      ]}
    />
  );
}

/** Menu hamburger padrão Contatos/Empresas — Sincronizar + Configurações. */
function CallsActionsMenu({
  syncing,
  onSync,
  onSettings,
}: {
  syncing: boolean;
  onSync: () => void;
  onSettings: () => void;
}) {
  return (
    <PageActionsMenu
      items={[
        {
          icon: (
            <IconRefresh
              size={13}
              className={syncing ? "animate-spin" : undefined}
            />
          ),
          label: syncing ? "Sincronizando…" : "Sincronizar",
          onClick: onSync,
          disabled: syncing,
          primary: true,
        },
        {
          icon: <IconSettings size={13} />,
          label: "Configurações",
          onClick: onSettings,
          divider: true,
        },
      ]}
    />
  );
}
