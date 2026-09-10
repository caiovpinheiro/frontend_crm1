"use client";

/**
 * Visualização "Distribuição por Leads" (modo leads) da página de
 * Distribuição. O seletor do topo apenas alterna a visualização — nenhuma
 * automação ou motor muda por causa disso.
 *
 * Conteúdo: configuração dos consultores (status administrativo próprio +
 * peso 0–5 + slots do rodízio), indicadores (total, por consultor), ranking
 * e histórico com filtros de período e consultor. SEM fila de espera — o
 * modo leads não tem pending.
 */

import { useMemo, useState } from "react";
import {
  IconPlus,
  IconRefresh,
  IconTrophy,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { Chip } from "@/components/crm/chip";
import { EmptyState } from "@/components/crm/empty-state";
import { KpiCard } from "@/components/crm/kpi-card";
import {
  PeriodCalendarButton,
  PeriodIsoRangePanel,
} from "@/components/crm/period-calendar-button";
import { UserAvatar } from "@/components/crm/user-avatar";
import {
  useLeadsHistory,
  useLeadsParticipants,
  useLeadsStats,
  useUpdateLeadsParticipant,
} from "@/features/distribution/leads-hooks";
import type { LeadsParticipantDto } from "@/features/distribution/leads-types";
import { useDistributionResponsibles } from "@/features/distribution/hooks";
import { cn } from "@/lib/utils";

const WEIGHT_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SlotDots({ participant }: { participant: LeadsParticipantDto }) {
  return (
    <div className="flex items-center gap-1" title="Slots do rodízio (ativos pelo peso)">
      {participant.slots.map((s) => (
        <span
          key={s.slotIndex}
          className={cn(
            "inline-block size-2.5 rounded-full border transition-colors",
            s.active
              ? "border-primary bg-primary/80"
              : "border-border bg-muted/40",
          )}
          title={
            s.active
              ? `Slot ${s.slotIndex + 1} ativo${
                  s.lastAssignedAt
                    ? ` — último lead em ${formatDateTime(s.lastAssignedAt)}`
                    : " — nunca usado"
                }`
              : `Slot ${s.slotIndex + 1} inativo (peso ${participant.weight})`
          }
        />
      ))}
    </div>
  );
}

function ParticipantRow({
  participant,
  canManage,
}: {
  participant: LeadsParticipantDto;
  canManage: boolean;
}) {
  const updateMut = useUpdateLeadsParticipant();
  const active = participant.status === "ACTIVE";

  const save = (input: { status?: "ACTIVE" | "INACTIVE"; weight?: number }) => {
    updateMut.mutate(
      { userId: participant.userId, input },
      {
        onSuccess: () => toast.success("Participante atualizado."),
        onError: (e) => toast.error(e.message || "Erro ao salvar."),
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3">
      <UserAvatar
        name={participant.name ?? participant.email ?? "?"}
        imageUrl={participant.avatarUrl}
        size={34}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[var(--text-default)]">
          {participant.name ?? participant.email ?? participant.userId}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {participant.totalReceived} lead(s) recebido(s)
        </p>
      </div>

      <SlotDots participant={participant} />

      <div className="flex items-center gap-1" title="Peso: quantos dos 5 slots entram no rodízio">
        {WEIGHT_OPTIONS.map((w) => (
          <button
            key={w}
            type="button"
            disabled={!canManage || updateMut.isPending}
            onClick={() => save({ weight: w })}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md border text-[12px] font-semibold transition-colors",
              participant.weight === w
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
              (!canManage || updateMut.isPending) && "cursor-not-allowed opacity-60",
            )}
            aria-pressed={participant.weight === w}
          >
            {w}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!canManage || updateMut.isPending}
        onClick={() => save({ status: active ? "INACTIVE" : "ACTIVE" })}
        className={cn(
          "inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-semibold transition-colors",
          active
            ? "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
            : "border-border bg-muted/40 text-muted-foreground",
          (!canManage || updateMut.isPending) && "cursor-not-allowed opacity-60",
        )}
        title={active ? "Ativo no rodízio — clique para inativar" : "Inativo — clique para ativar"}
      >
        {active ? "Ativo" : "Inativo"}
      </button>
    </div>
  );
}

export function LeadsDistributionView({ canManage }: { canManage: boolean }) {
  const participantsQuery = useLeadsParticipants();
  const responsiblesQuery = useDistributionResponsibles();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const filters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      userId: filterUserId || undefined,
    }),
    [from, to, filterUserId],
  );
  const statsQuery = useLeadsStats(filters);
  const historyQuery = useLeadsHistory(filters);
  const updateMut = useUpdateLeadsParticipant();

  const participants = participantsQuery.data?.participants ?? [];
  const stats = statsQuery.data;
  const historyItems =
    historyQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const historyTotal = historyQuery.data?.pages[0]?.total ?? 0;

  // Usuários HUMAN da org ainda não configurados no modo leads (a lista de
  // responsáveis do smart cobre todos os humanos — só reutilizamos os dados).
  const availableToAdd = useMemo(() => {
    const configured = new Set(participants.map((p) => p.userId));
    return (responsiblesQuery.data?.responsibles ?? []).filter(
      (r) => !configured.has(r.userId),
    );
  }, [participants, responsiblesQuery.data]);

  const activeCount = participants.filter(
    (p) => p.status === "ACTIVE" && p.weight > 0,
  ).length;
  const top = stats?.ranking[0] ?? null;

  const addParticipant = (userId: string) => {
    updateMut.mutate(
      { userId, input: { status: "ACTIVE", weight: 1 } },
      {
        onSuccess: () => toast.success("Consultor adicionado ao rodízio."),
        onError: (e) => toast.error(e.message || "Erro ao adicionar."),
      },
    );
  };

  if (participantsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
        <IconRefresh className="mr-2 size-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (participantsQuery.error) {
    return (
      <EmptyState
        icon={<IconUsers className="size-6" />}
        title="Erro ao carregar a Distribuição por Leads"
        description={participantsQuery.error.message}
      />
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 sm:gap-4">
      {/* Indicadores */}
      <section
        className="grid w-full shrink-0 grid-cols-1 gap-3 sm:grid-cols-3"
        aria-label="Indicadores da Distribuição por Leads"
      >
        <KpiCard
          label="Leads distribuídos"
          value={String(stats?.total ?? 0)}
          hint={filters.from || filters.to ? "no período filtrado" : "total histórico"}
          icon={<IconTrophy className="size-4" />}
        />
        <KpiCard
          label="Consultores no rodízio"
          value={String(activeCount)}
          hint={`${participants.length} configurado(s)`}
          icon={<IconUsers className="size-4" />}
          tone="neutral"
        />
        <KpiCard
          label="Quem mais recebeu"
          value={top ? String(top.count) : "0"}
          hint={top?.name ?? "—"}
          icon={<IconTrophy className="size-4" />}
          tone="success"
        />
      </section>

      {/* Configuração dos consultores */}
      <section
        className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4"
        aria-label="Consultores do rodízio"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-bold text-[var(--text-default)]">
              Consultores
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Status e peso valem só para novos recebimentos. Peso 0–5 = quantos
              dos 5 slots do consultor entram no rodízio. Sem fila de espera:
              sem elegível, a automação segue a saída “Sem agente”.
            </p>
          </div>
          {canManage && availableToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className="h-8 rounded-md border border-border bg-card px-2 text-[12px] text-foreground"
                value=""
                onChange={(e) => {
                  if (e.target.value) addParticipant(e.target.value);
                }}
                disabled={updateMut.isPending}
                aria-label="Adicionar consultor ao rodízio"
              >
                <option value="">+ Adicionar consultor…</option>
                {availableToAdd.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.name ?? r.email ?? r.userId}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {participants.length === 0 ? (
          <EmptyState
            icon={<IconUsers className="size-6" />}
            title="Nenhum consultor configurado"
            description="Adicione consultores e defina o peso (0–5) de cada um para montar o rodízio."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {participants.map((p) => (
              <ParticipantRow key={p.userId} participant={p} canManage={canManage} />
            ))}
          </div>
        )}
      </section>

      {/* Ranking */}
      <section
        className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4"
        aria-label="Ranking de recebimentos"
      >
        <h2 className="mb-3 text-[13px] font-bold text-[var(--text-default)]">
          Ranking
        </h2>
        {!stats || stats.ranking.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-[var(--text-muted)]">
            Nenhuma distribuição no período.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {stats.ranking.map((r, idx) => (
              <div
                key={r.userId}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5"
              >
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    idx === 0
                      ? "bg-primary/15 text-primary"
                      : "bg-muted/60 text-muted-foreground",
                  )}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-default)]">
                  {r.name ?? r.userId}
                </span>
                <Chip variant="ghost">{r.count} lead(s)</Chip>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Histórico */}
      <section
        className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4"
        aria-label="Histórico de distribuições"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[13px] font-bold text-[var(--text-default)]">
            Histórico ({historyTotal})
          </h2>
          <PeriodCalendarButton active={Boolean(from || to)}>
            <PeriodIsoRangePanel
              from={from}
              to={to}
              onChange={({ from: f, to: t }) => {
                setFrom(f);
                setTo(t);
              }}
              allPeriodLabel="Todo o período"
              showToday
            />
          </PeriodCalendarButton>
          <select
            className="h-8 rounded-md border border-border bg-card px-2 text-[12px] text-foreground"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            aria-label="Filtrar por consultor"
          >
            <option value="">Todos os consultores</option>
            {participants.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name ?? p.email ?? p.userId}
              </option>
            ))}
          </select>
        </div>

        {historyQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
            <IconRefresh className="mr-2 size-4 animate-spin" /> Carregando…
          </div>
        ) : historyItems.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-[var(--text-muted)]">
            Nenhuma distribuição encontrada para os filtros.
          </p>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-[var(--glass-border)]">
              {historyItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-2">
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
                    {formatDateTime(item.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-default)]">
                    {item.leadLabel ?? "Lead"}
                  </span>
                  <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
                    → {item.userName ?? item.userId}
                  </span>
                </div>
              ))}
            </div>
            {historyQuery.hasNextPage && (
              <div className="mt-3 flex justify-center">
                <ButtonGlass
                  onClick={() => historyQuery.fetchNextPage()}
                  disabled={historyQuery.isFetchingNextPage}
                >
                  {historyQuery.isFetchingNextPage
                    ? "Carregando…"
                    : "Carregar mais"}
                </ButtonGlass>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
