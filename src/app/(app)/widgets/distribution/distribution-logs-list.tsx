"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconBuilding,
  IconChevronDown,
  IconCircleCheck,
  IconClockExclamation,
  IconExternalLink,
  IconLoader2,
  IconSearch,
  IconSourceCode,
  IconTag,
  IconUserCheck,
} from "@tabler/icons-react";

import { DataView, DataRow } from "@/components/automations/data-view";
import type { CardsTableView } from "@/components/automations/view-toggle";
import { FilterChip } from "@/components/crm/filter-popover";
import { FilterCategoryColumn, FilterColumnsModal } from "@/components/crm/filter-columns-modal";
import { PaginationGlass } from "@/components/crm/pagination-glass";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import {
  LIST_CARD_ROW_CLASS,
  LIST_CARD_STACK_CLASS,
  ListColumnLabel,
} from "@/components/crm/sortable-header";
import { DistributionIcon } from "@/components/icons/distribution-icon";
import {
  useDistributionDepartmentStats,
  useDistributionLogs,
} from "@/features/distribution/hooks";
import { inboxConversationDeepLink } from "@/features/inbox-v2/hooks/use-inbox-url-sync";
import { cn } from "@/lib/utils";

function inboxConversationHref(
  number: number | null | undefined,
  fallbackId?: string | null,
  tab?: string | null,
) {
  return inboxConversationDeepLink({ number, id: fallbackId, tab });
}

// ── Logs de distribuição ────────────────────────────────────────────────

const DIST_REASON_LABELS: Record<string, string> = {
  ASSIGNED: "Distribuído",
  SMART_DISTRIBUTION_NOT_ENABLED: "Módulo desabilitado",
  DISTRIBUTION_DISABLED: "Distribuição desligada",
  NO_ELIGIBLE_RESPONSIBLE: "Sem responsável",
  NO_DEPARTMENT: "Sem departamento habilitado",
  RETIRED_WHATSAPP_CHANNEL: "Canal WhatsApp encerrado",
  QUEUED: "Na fila de espera",
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type LogResultFilter = "all" | "success" | "failure";

function logInIsoRange(createdAt: string, from: string, to: string): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return true;
  if (from) {
    const start = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(start) && t < start) return false;
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(end) && t > end) return false;
  }
  return true;
}

export function DistributionLogsList({
  view,
  enabled,
  dateFrom,
  dateTo,
}: {
  view: CardsTableView;
  enabled: boolean;
  dateFrom: string;
  dateTo: string;
}) {
  const q = useDistributionLogs(enabled);
  const deptStatsQ = useDistributionDepartmentStats(enabled);
  const items = useMemo(
    () => q.data?.pages.flatMap((p) => p.items) ?? [],
    [q.data],
  );
  const deptStats = deptStatsQ.data?.departments ?? [];
  const loading = q.isLoading;
  const [logSearch, setLogSearch] = useState("");
  const [result, setResult] = useState<LogResultFilter>("all");
  const [origin, setOrigin] = useState("all");
  const [department, setDepartment] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logPage, setLogPage] = useState(1);
  const [logPerPage, setLogPerPage] = useState(25);

  const origins = useMemo(() => {
    const set = new Set<string>();
    for (const log of items) {
      const raw = log.triggerSource?.trim();
      if (!raw) continue;
      // Logs juntados ("AUTOMATION+SYSTEM") entram nos filtros base.
      for (const part of raw.split("+")) {
        const p = part.trim();
        if (p) set.add(p);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const departmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of deptStats) {
      map.set(row.departmentId ?? "__none__", row.departmentName);
    }
    for (const log of items) {
      const key = log.departmentId ?? "__none__";
      if (!map.has(key)) {
        map.set(key, log.departmentName ?? "Sem departamento");
      }
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [deptStats, items]);

  const filteredItems = useMemo(() => {
    const query = logSearch.trim().toLocaleLowerCase("pt-BR");

    return items.filter((log) => {
      const searchable = [
        log.contactPhone,
        log.contactName,
        log.selectedUserName,
        log.departmentName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      if (query && !searchable.includes(query)) return false;
      if (result === "success" && !log.success) return false;
      if (result === "failure" && log.success) return false;
      if (department !== "all") {
        const key = log.departmentId ?? "__none__";
        if (key !== department) return false;
      }
      if (origin !== "all") {
        const parts = (log.triggerSource || "")
          .split("+")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!parts.includes(origin) && log.triggerSource !== origin) return false;
      }
      if (!logInIsoRange(log.createdAt, dateFrom, dateTo)) return false;
      return true;
    });
  }, [dateFrom, dateTo, department, items, logSearch, origin, result]);

  useEffect(() => {
    setLogPage(1);
  }, [logSearch, result, origin, department, dateFrom, dateTo, logPerPage]);

  const pagedLogs = useMemo(() => {
    const start = (logPage - 1) * logPerPage;
    return filteredItems.slice(start, start + logPerPage);
  }, [filteredItems, logPage, logPerPage]);

  const fetchMoreLogs = q.fetchNextPage;
  const logsHaveMore = q.hasNextPage;
  const logsFetchingMore = q.isFetchingNextPage;

  useEffect(() => {
    if (pagedLogs.length >= logPerPage) return;
    if (!logsHaveMore || logsFetchingMore) return;
    void fetchMoreLogs();
  }, [pagedLogs.length, logPerPage, logsHaveMore, logsFetchingMore, fetchMoreLogs]);

  const distLogLastPage = Math.max(1, Math.ceil(filteredItems.length / logPerPage));
  const distCanNext = logPage < distLogLastPage || q.hasNextPage;

  const clearFilters = () => {
    setLogSearch("");
    setResult("all");
    setOrigin("all");
    setDepartment("all");
  };

  const visibleDeptStats = useMemo(() => {
    if (department === "all") return deptStats;
    return deptStats.filter(
      (row) => (row.departmentId ?? "__none__") === department,
    );
  }, [department, deptStats]);

  return (
    <section className="flex flex-col">
      <div className="mb-2.5 flex shrink-0 flex-col gap-2.5 px-1 sm:gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-9">
            <DistributionIcon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">
              Logs de distribuição
            </h2>
            <p className="hidden text-pretty text-xs leading-snug text-muted-foreground sm:mt-0.5 sm:block">
              Histórico operacional com departamento, resultado, responsável, origem e horário.
            </p>
          </div>
          {!loading && items.length > 0 && (
            <span className="shrink-0 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2.5 py-1 font-body text-[10.5px] font-semibold tabular-nums text-[var(--text-muted)]">
              {filteredItems.length} de {items.length}
            </span>
          )}
        </div>

        {!loading && items.length > 0 && (
          <LogsSearchFilterBar
                search={logSearch}
                onSearch={setLogSearch}
                result={result}
                origin={origin}
                department={department}
                origins={origins}
                departmentOptions={departmentOptions}
                activeCount={
                  (result !== "all" ? 1 : 0) +
                  (origin !== "all" ? 1 : 0) +
                  (department !== "all" ? 1 : 0)
                }
                onClear={clearFilters}
                onApply={({ result: r, origin: o, department: d }) => {
                  setResult(r);
                  setOrigin(o);
                  setDepartment(d);
                }}
              />
        )}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center px-4 py-16 text-center">
          <IconLoader2 size={22} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : q.error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <IconAlertTriangle size={24} className="text-[var(--color-warn)]" />
          <p className="font-body text-[12px] text-[var(--text-muted)]">
            {q.error instanceof Error ? q.error.message : "Erro ao carregar logs."}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-[var(--glass-bg-strong)] text-[var(--text-muted)]">
            <DistributionIcon size={24} />
          </div>
          <p className="font-display text-[14px] font-bold text-[var(--text-primary)]">
            Nenhuma distribuição registrada
          </p>
          <p className="font-body text-[12px] text-muted-foreground">
            Assim que a Distribuição Inteligente rodar, o histórico aparece aqui.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <IconSearch size={24} className="text-[var(--text-muted)]" />
          <p className="font-display text-[14px] font-bold text-[var(--text-primary)]">
            Nenhum log encontrado
          </p>
          <p className="font-body text-[12px] text-muted-foreground">
            Ajuste os filtros ou limpe a busca para ver outros registros.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-1 font-display text-[12px] font-bold text-[var(--brand-primary)] hover:underline"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Contadores por dept. dentro do scroll — chips horizontais no mobile */}
          {(deptStats.length > 0 || deptStatsQ.isLoading) && (
            <div className="sticky top-0 z-[5] border-b border-[var(--glass-border)] bg-[var(--glass-bg-base)]/95 px-3 py-2 backdrop-blur-sm sm:px-4 md:static md:bg-transparent md:backdrop-blur-none">
              <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visibleDeptStats.length === 0 && !deptStatsQ.isLoading ? (
                  <p className="font-body text-[11.5px] text-[var(--text-muted)]">
                    Sem contadores por departamento ainda.
                  </p>
                ) : (
                  visibleDeptStats.map((row) => (
                    <button
                      key={row.departmentId ?? "__none__"}
                      type="button"
                      onClick={() =>
                        setDepartment(
                          department === (row.departmentId ?? "__none__")
                            ? "all"
                            : (row.departmentId ?? "__none__"),
                        )
                      }
                      className={cn(
                        "w-[168px] shrink-0 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-left transition-colors",
                        department === (row.departmentId ?? "__none__")
                          ? "border-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_10%,transparent)]"
                          : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] hover:bg-[var(--glass-bg-strong)]",
                      )}
                    >
                      <p className="truncate font-display text-[11px] font-bold text-[var(--text-primary)]">
                        {row.departmentName}
                      </p>
                      <p className="mt-0.5 truncate font-body text-[10px] tabular-nums text-[var(--text-muted)]">
                        <span className="font-semibold text-[var(--color-success)]">
                          {row.distributed}
                        </span>
                        {row.distributedByAi > 0 ? (
                          <span> · {row.distributedByAi} IA</span>
                        ) : null}
                        <span className="text-[var(--text-muted)]"> · </span>
                        <span className="font-semibold text-[var(--color-warn)]">
                          {row.pending}
                        </span>
                        <span> ag.</span>
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Mobile / APK: cards */}
          <ul className={cn(LIST_CARD_STACK_CLASS, "md:hidden")}>
            {pagedLogs.map((log) => {
              const resultLabel =
                DIST_REASON_LABELS[log.reason] ??
                (log.success ? "Distribuído" : log.reason);
              return (
                <LogMobileCard
                  key={log.id}
                  log={log}
                  resultLabel={resultLabel}
                  expanded={expandedId === log.id}
                  onToggle={() =>
                    setExpandedId(expandedId === log.id ? null : log.id)
                  }
                />
              );
            })}
          </ul>

          <div className="hidden min-w-[820px] flex-col md:flex">
            <DataView
              view={view}
              columnClass="grid items-center gap-4 lg:grid-cols-[minmax(160px,1.2fr)_minmax(140px,1fr)_minmax(160px,1fr)_minmax(160px,1.1fr)_minmax(120px,0.8fr)_140px]"
              header={
                <>
                  <ListColumnLabel>Contato</ListColumnLabel>
                  <ListColumnLabel>Departamento</ListColumnLabel>
                  <ListColumnLabel>Resultado</ListColumnLabel>
                  <ListColumnLabel>Responsável / motivo</ListColumnLabel>
                  <ListColumnLabel>Origem</ListColumnLabel>
                  <ListColumnLabel>Quando</ListColumnLabel>
                </>
              }
            >
              {pagedLogs.map((log) => {
                const expanded = expandedId === log.id;
                const resultLabel =
                  DIST_REASON_LABELS[log.reason] ??
                  (log.success ? "Distribuído" : log.reason);
                return (
                  <LogTableRows
                    key={log.id}
                    log={log}
                    expanded={expanded}
                    resultLabel={resultLabel}
                    onToggle={() => setExpandedId(expanded ? null : log.id)}
                  />
                );
              })}
            </DataView>
          </div>

          <PaginationGlass
            label={`${pagedLogs.length} logs · página ${logPage}`}
            page={logPage}
            canPrev={logPage > 1}
            canNext={distCanNext}
            onPrev={() => setLogPage((p) => Math.max(1, p - 1))}
            onNext={() => setLogPage((p) => p + 1)}
            perPage={logPerPage}
            onPerPageChange={setLogPerPage}
            totalCapped={q.hasNextPage}
          />
        </div>
      )}
    </section>
  );
}

type LogsFilterDraft = {
  result: LogResultFilter;
  origin: string;
  department: string;
};

/**
 * Busca + painel de filtros — mesmo padrão Contatos/Chamadas:
 * input pill com botão de ajustes à direita e popover segmentado.
 */
function LogsSearchFilterBar({
  search,
  onSearch,
  result,
  origin,
  department,
  origins,
  departmentOptions,
  activeCount,
  onClear,
  onApply,
}: {
  search: string;
  onSearch: (v: string) => void;
  result: LogResultFilter;
  origin: string;
  department: string;
  origins: string[];
  departmentOptions: { value: string; label: string }[];
  activeCount: number;
  onClear: () => void;
  onApply: (next: LogsFilterDraft) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LogsFilterDraft>({
    result,
    origin,
    department,
  });

  useEffect(() => {
    if (open) setDraft({ result, origin, department });
  }, [open, result, origin, department]);

  const draftCount =
    (draft.result !== "all" ? 1 : 0) +
    (draft.origin !== "all" ? 1 : 0) +
    (draft.department !== "all" ? 1 : 0);

  function handleClear() {
    const empty: LogsFilterDraft = {
      result: "all",
      origin: "all",
      department: "all",
    };
    setDraft(empty);
    onClear();
  }

  function handleApply() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative w-full">
      <SearchFilterBar
        value={search}
        onChange={onSearch}
        placeholder="Pesquisar e filtrar..."
        ariaLabel="Buscar e filtrar logs"
        filterOpen={open}
        activeCount={activeCount}
        onFilterClick={() => setOpen((o) => !o)}
        chips={[
          ...(result !== "all"
            ? [{
                id: "result",
                title: "Resultado",
                count: 1,
                onRemove: () => onApply({ result: "all", origin, department }),
              }]
            : []),
          ...(origin !== "all"
            ? [{
                id: "origin",
                title: "Origem",
                count: 1,
                onRemove: () => onApply({ result, origin: "all", department }),
              }]
            : []),
          ...(department !== "all"
            ? [{
                id: "dept",
                title: "Departamento",
                count: 1,
                onRemove: () => onApply({ result, origin, department: "all" }),
              }]
            : []),
        ]}
      />

      <FilterColumnsModal
        open={open}
        onClose={() => setOpen(false)}
        onClear={handleClear}
        onApply={handleApply}
        count={draftCount || activeCount}
        clearDisabled={draftCount === 0 && activeCount === 0 && !search}
        title="Filtros"
        labelledBy="Filtros de logs"
      >
        <FilterCategoryColumn title="Resultado" icon={<IconCircleCheck size={16} stroke={2.2} />}>
          {(
            [
              { value: "all", label: "Todos" },
              { value: "success", label: "Sucesso" },
              { value: "failure", label: "Falha" },
            ] as const
          ).map((opt) => (
            <FilterChip
              key={opt.value}
              tone="fill"
              selected={draft.result === opt.value}
              onClick={() => setDraft((prev) => ({ ...prev, result: opt.value }))}
            >
              {opt.label}
            </FilterChip>
          ))}
        </FilterCategoryColumn>
        <FilterCategoryColumn title="Origem" icon={<IconSourceCode size={16} stroke={2.2} />}>
          <FilterChip
            tone="fill"
            selected={draft.origin === "all"}
            onClick={() => setDraft((prev) => ({ ...prev, origin: "all" }))}
          >
            Todas
          </FilterChip>
          {origins.map((value) => (
            <FilterChip
              key={value}
              tone="fill"
              selected={draft.origin === value}
              onClick={() => setDraft((prev) => ({ ...prev, origin: value }))}
            >
              {value}
            </FilterChip>
          ))}
        </FilterCategoryColumn>
        <FilterCategoryColumn title="Departamento" icon={<IconBuilding size={16} stroke={2.2} />}>
          <FilterChip
            tone="fill"
            selected={draft.department === "all"}
            onClick={() => setDraft((prev) => ({ ...prev, department: "all" }))}
          >
            Todos
          </FilterChip>
          {departmentOptions.map((opt) => (
            <FilterChip
              key={opt.value}
              tone="fill"
              selected={draft.department === opt.value}
              onClick={() => setDraft((prev) => ({ ...prev, department: opt.value }))}
            >
              {opt.label}
            </FilterChip>
          ))}
        </FilterCategoryColumn>
      </FilterColumnsModal>
    </div>
  );
}


function LogMobileCard({
  log,
  resultLabel,
  expanded,
  onToggle,
}: {
  log: {
    id: string;
    createdAt: string;
    success: boolean;
    reason: string;
    triggerSource: string;
    selectedUserName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    conversationId: string | null;
    conversationNumber?: number | null;
    departmentName: string | null;
  };
  resultLabel: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "w-full text-left",
          LIST_CARD_ROW_CLASS,
          expanded && "border-primary/40 bg-secondary/40",
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
              log.success
                ? "bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]"
                : "bg-[color-mix(in_srgb,var(--color-warn)_12%,transparent)] text-[var(--color-warn)]",
            )}
          >
            {log.success ? <IconUserCheck size={15} /> : <IconClockExclamation size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                  {log.contactName || log.contactPhone || "Atendimento"}
                </p>
                {log.contactName && log.contactPhone ? (
                  <p className="truncate font-body text-[12px] text-muted-foreground">
                    {log.contactPhone}
                  </p>
                ) : null}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 font-body text-[12px] tabular-nums text-muted-foreground">
                {fmtDateTime(log.createdAt)}
                <IconChevronDown
                  size={13}
                  className={cn(
                    "transition-transform duration-200",
                    expanded && "rotate-180",
                  )}
                />
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[10px] font-bold",
                  log.success
                    ? "bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]"
                    : "bg-[color-mix(in_srgb,var(--color-warn)_12%,transparent)] text-[var(--color-warn)]",
                )}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {resultLabel}
              </span>
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-[var(--glass-border)] px-2 py-0.5 font-body text-[10px] font-semibold text-[var(--text-secondary)]">
                <IconTag size={11} className="shrink-0 opacity-70" />
                <span className="truncate">
                  {log.departmentName || "Sem departamento"}
                </span>
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-body text-[12px]">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">
                  Responsável
                </p>
                <p className="truncate font-semibold text-foreground">
                  {log.success
                    ? log.selectedUserName ?? "Responsável"
                    : resultLabel}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">
                  Origem
                </p>
                <p className="truncate font-semibold text-foreground">
                  {log.triggerSource || "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-1.5 grid gap-2 rounded-xl border border-border bg-card p-3">
          <LogDetail
            label="Departamento"
            value={log.departmentName || "Sem departamento"}
          />
          <LogDetail label="Motivo técnico" value={log.reason} mono />
          <LogDetail label="Origem / trigger" value={log.triggerSource || "—"} />
          <LogDetail label="ID do log" value={log.id} mono />
          {log.conversationId ? (
            <Link
              href={inboxConversationHref(log.conversationNumber, log.conversationId)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 font-display text-[12px] font-bold text-[var(--brand-primary)] transition-colors hover:bg-[var(--glass-bg-strong)]"
            >
              Abrir conversa
              <IconExternalLink size={13} />
            </Link>
          ) : (
            <LogDetail label="Conversa" value="Não vinculada" />
          )}
        </div>
      )}
    </li>
  );
}

function LogTableRows({
  log,
  expanded,
  resultLabel,
  onToggle,
}: {
  log: {
    id: string;
    createdAt: string;
    success: boolean;
    reason: string;
    triggerSource: string;
    selectedUserName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    conversationId: string | null;
    conversationNumber?: number | null;
    departmentId: string | null;
    departmentName: string | null;
  };
  expanded: boolean;
  resultLabel: string;
  onToggle: () => void;
}) {
  const primaryName = log.contactName || log.contactPhone || "Atendimento";
  const showPhoneUnderName = Boolean(log.contactName && log.contactPhone);

  return (
    <>
      <DataRow
        role="button"
        tabIndex={0}
        className={cn(
          "cursor-pointer",
          expanded && "border-primary/40 bg-secondary/40",
        )}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={expanded}
      >
        <div className="min-w-0">
            <p className="max-w-[220px] truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
              {primaryName}
            </p>
            {showPhoneUnderName ? (
              <p className="mt-0.5 max-w-[220px] truncate font-body text-[12px] text-muted-foreground">
                {log.contactPhone}
              </p>
            ) : null}
        </div>
        <span className="inline-flex max-w-[160px] items-center gap-1 truncate rounded-md border border-border bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">
            <IconTag size={12} className="shrink-0 opacity-60" />
            <span className="truncate">
              {log.departmentName || "Sem departamento"}
            </span>
        </span>
        <span
            className={cn(
              "inline-flex max-w-[200px] items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
              log.success
                ? "border-success/30 bg-success-soft text-success"
                : "border-border bg-secondary text-muted-foreground",
            )}
          >
            {log.success ? (
              <IconUserCheck size={13} className="shrink-0" />
            ) : (
              <IconClockExclamation size={13} className="shrink-0 opacity-70" />
            )}
            <span className="truncate">{resultLabel}</span>
        </span>
        <span className="block max-w-[220px] truncate text-sm text-foreground">
            {log.success
              ? log.selectedUserName ?? "Responsável"
              : "—"}
        </span>
        <span className="block max-w-[160px] truncate text-xs text-muted-foreground">
            {log.triggerSource || "—"}
        </span>
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {fmtDateTime(log.createdAt)}
            <IconChevronDown
              size={13}
              className={cn(
                "transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
        </span>
      </DataRow>
      {expanded && (
        <div className="px-5 py-3 text-sm">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_auto]">
              <LogDetail
                label="Departamento"
                value={log.departmentName || "Sem departamento"}
              />
              <LogDetail label="Motivo técnico" value={log.reason} mono />
              <LogDetail
                label="Origem / trigger"
                value={log.triggerSource || "—"}
              />
              <LogDetail label="ID do log" value={log.id} mono />
              {log.conversationId ? (
                <Link
                  href={inboxConversationHref(log.conversationNumber, log.conversationId)}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 font-display text-[11.5px] font-bold text-[var(--brand-primary)] transition-colors hover:bg-[var(--glass-bg-strong)]"
                >
                  Abrir conversa
                  <IconExternalLink size={13} />
                </Link>
              ) : (
                <LogDetail label="Conversa" value="Não vinculada" />
              )}
            </div>
        </div>
      )}
    </>
  );
}

function LogDetail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 py-2">
      <p className="text-[9.5px] font-semibold tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-[12px] font-semibold text-[var(--text-primary)]",
          mono ? "font-mono" : "font-body",
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}


export default DistributionLogsList;
