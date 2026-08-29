"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconChartBar,
  IconCheck,
  IconClock,
  IconPhone,
  IconPhoneIncoming,
  IconPhoneOutgoing,
  IconPhoneX,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/crm/empty-state";
import { KpiCard } from "@/components/crm/kpi-card";
import { PaginationGlass } from "@/components/crm/pagination-glass";
import { listCalls } from "../api/extensions";
import type { CallRecord, ListCallsFilters } from "../api/types";
import type { CallsFilterState } from "./calls-search-filter-bar";
import { AudioPlayer } from "./call-history-list";

interface CallHistoryTimelineProps {
  /** Busca vinda do PageHeader (já com debounce). */
  search?: string;
  /** Filtros aplicados pelo painel da barra de busca. */
  filters?: CallsFilterState;
}

function formatDuration(sec: number | null) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isMissed(status: string) {
  return status === "MISSED" || status === "FAILED";
}

function statusMeta(status: string): { label: string; className: string } {
  switch (status) {
    case "COMPLETED":
      return {
        label: "Completada",
        className: "text-[var(--color-success-text)] bg-[var(--color-success-bg)]",
      };
    case "ANSWERED":
      return {
        label: "Atendida",
        className: "text-[var(--color-success-text)] bg-[var(--color-success-bg)]",
      };
    case "MISSED":
      return {
        label: "Perdida",
        className:
          "text-[var(--color-danger-text)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]",
      };
    case "BUSY":
      return {
        label: "Ocupado",
        className: "text-[var(--color-warning-text)] bg-[var(--color-warn-bg)]",
      };
    case "FAILED":
      return {
        label: "Falhou",
        className:
          "text-[var(--color-danger-text)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]",
      };
    case "RINGING":
      return {
        label: "Chamando",
        className: "text-[var(--text-muted)] bg-[var(--glass-bg-subtle)]",
      };
    default:
      return {
        label: status,
        className: "text-[var(--text-muted)] bg-[var(--glass-bg-subtle)]",
      };
  }
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Rótulo do grupo por dia: Hoje / Ontem / dd/mm. */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Hoje";
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function CallHistoryTimeline({
  search,
  filters: externalFilters = {},
}: CallHistoryTimelineProps) {
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Reset page when filters/search change.
  useEffect(() => {
    setPage(1);
  }, [
    search,
    externalFilters.direction,
    externalFilters.status,
    externalFilters.dateFrom,
    externalFilters.dateTo,
  ]);

  const filters: ListCallsFilters = useMemo(
    () => ({
      page,
      perPage,
      search: search?.trim() || undefined,
      direction: externalFilters.direction,
      status: externalFilters.status,
      dateFrom: externalFilters.dateFrom,
      dateTo: externalFilters.dateTo,
    }),
    [page, search, externalFilters],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["calls", filters],
    queryFn: () => listCalls(filters),
  });

  const calls = data?.calls ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  const stats = useMemo(() => {
    const answered = calls.filter(
      (c) => c.status === "ANSWERED" || c.status === "COMPLETED",
    );
    const missed = calls.filter((c) => isMissed(c.status));
    const durations = answered
      .map((c) => c.durationSeconds)
      .filter((d): d is number => typeof d === "number" && d > 0);
    const avg = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const rate = calls.length
      ? Math.round((answered.length / calls.length) * 100)
      : 0;
    return {
      total: calls.length,
      answered: answered.length,
      missed: missed.length,
      avg,
      rate,
    };
  }, [calls]);

  const groups = useMemo(() => {
    const map = new Map<string, CallRecord[]>();
    for (const c of calls) {
      const key = dayLabel(c.startedAt);
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    }
    return Array.from(map.entries());
  }, [calls]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <section
        className="grid shrink-0 grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-5"
        aria-label="Indicadores de chamadas"
      >
        <KpiCard
          label="No período"
          value={total}
          icon={<IconPhone size={20} stroke={2.2} />}
          tone="brand"
        />
        <KpiCard
          label="Atendidas"
          value={stats.answered}
          icon={<IconCheck size={20} />}
          tone="success"
        />
        <KpiCard
          label="Perdidas"
          value={stats.missed}
          icon={<IconPhoneX size={20} />}
          tone="warning"
        />
        <KpiCard
          label="Duração média"
          value={formatDuration(stats.avg)}
          icon={<IconClock size={20} />}
          tone="violet"
        />
        <KpiCard
          label="Taxa de atendimento"
          value={`${stats.rate}%`}
          icon={<IconChartBar size={20} />}
          tone="neutral"
        />
      </section>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
        {isLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[60px] animate-pulse rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-md"
              />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow)] backdrop-blur-md">
            <EmptyState
              icon={<IconPhone size={28} />}
              title="Nenhuma chamada encontrada"
              description="Sem chamadas para os filtros selecionados."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1 pb-3">
            {groups.map(([label, rows]) => (
              <div key={label} className="mb-1">
                <div className="mb-2.5 mt-4 flex items-center gap-2.5 first:mt-1">
                  <h3 className="font-display text-[13px] font-semibold text-[var(--text-muted)]">
                    {label}
                  </h3>
                  <span className="h-px flex-1 bg-[var(--glass-border-subtle)]" />
                  <span className="font-display text-[13px] text-[var(--text-muted)]">
                    {rows.length} ligaç{rows.length !== 1 ? "ões" : "ão"}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {rows.map((call) => (
                    <TimelineRow
                      key={call.id}
                      call={call}
                      isPlaying={playingId === call.id}
                      onPlay={() =>
                        setPlayingId(playingId === call.id ? null : call.id)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {total > perPage && (
        <PaginationGlass
          total={total}
          entityLabel="chamadas"
          page={page}
          lastPage={lastPage}
          canPrev={page > 1}
          canNext={page < lastPage}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
        />
      )}
    </div>
  );
}

interface TimelineRowProps {
  call: CallRecord;
  isPlaying: boolean;
  onPlay: () => void;
}

function TimelineRow({ call, isPlaying, onPlay }: TimelineRowProps) {
  const missed = isMissed(call.status);
  const inbound = call.direction === "INBOUND";
  const s = statusMeta(call.status);

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:shadow-[var(--glass-shadow)]">
      <div className="flex items-center gap-3 px-3 py-2.5 sm:gap-3.5 sm:px-3.5">
        {/* Hora — célula regular 13px (igual Telefone/datas em Contatos) */}
        <span className="w-11 shrink-0 text-center font-display text-[13px] tabular-nums text-[var(--text-secondary)]">
          {timeLabel(call.startedAt)}
        </span>

        {/* Ícone de direção/status */}
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            missed
              ? "bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]"
              : inbound
                ? "bg-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] text-[var(--brand-primary)]"
                : "bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
          )}
        >
          {missed ? (
            <IconPhoneX size={15} />
          ) : inbound ? (
            <IconPhoneIncoming size={15} />
          ) : (
            <IconPhoneOutgoing size={15} />
          )}
        </span>

        {/* Identidade — nome 14px bold + subtítulo 12px muted (padrão Contatos) */}
        <div className="min-w-0 flex-1 leading-tight">
          {call.contact ? (
            <Link
              href={`/contacts/${call.contact.id}`}
              className="block truncate font-display text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:text-[var(--brand-primary)]"
            >
              {call.contact.name ?? call.phone}
            </Link>
          ) : (
            <span className="block truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
              {call.phone}
            </span>
          )}
          {call.contact?.name && (
            <div className="truncate font-body text-[12px] text-[var(--text-muted)]">
              {call.phone}
            </div>
          )}
        </div>

        {/* Direção — 13px regular + seta (peso de célula Contatos) */}
        <span className="hidden w-[7.5rem] shrink-0 items-center justify-start gap-1.5 font-display text-[13px] text-[var(--text-secondary)] lg:inline-flex">
          {inbound ? (
            <IconArrowDownLeft size={14} stroke={2} className="shrink-0 text-[var(--brand-primary)]" />
          ) : (
            <IconArrowUpRight size={14} stroke={2} className="shrink-0" />
          )}
          {inbound ? "Recebida" : "Realizada"}
        </span>

        {/* Status — 12px semibold (chips Contatos), não 11px bold */}
        <span
          className={cn(
            "inline-flex w-[6.75rem] shrink-0 items-center justify-start gap-1.5 rounded-full px-2.5 py-1 font-display text-[12px] font-semibold before:h-1.5 before:w-1.5 before:rounded-full before:bg-current",
            s.className,
          )}
        >
          {s.label}
        </span>

        {/* Duração — 13px regular */}
        <span className="hidden w-12 shrink-0 text-right font-display text-[13px] tabular-nums text-[var(--text-secondary)] lg:block">
          {formatDuration(call.durationSeconds)}
        </span>

        {/* Gravação */}
        {call.recordUrl ? (
          <button
            type="button"
            onClick={onPlay}
            title={isPlaying ? "Pausar gravação" : "Ouvir gravação"}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all",
              isPlaying
                ? "bg-[var(--brand-primary)] text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)]"
                : "bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] text-[var(--brand-primary)] hover:bg-[var(--brand-primary)] hover:text-white hover:shadow-[0_4px_12px_rgba(91,111,245,0.35)]",
            )}
          >
            {isPlaying ? (
              <IconPlayerPauseFilled size={14} />
            ) : (
              <IconPlayerPlayFilled size={14} />
            )}
          </button>
        ) : (
          <span className="h-8 w-8 shrink-0" />
        )}
      </div>

      {isPlaying && call.recordUrl && (
        <AudioPlayer src={call.recordUrl} onEnded={onPlay} />
      )}
    </div>
  );
}
