"use client";

/**
 * Visualização "Distribuição por Leads" — mesmo DNA visual da Distribuição
 * Inteligente: KPIs canônicos, toggle em LIST_CARD_ROW, lista DataView /
 * cards por linha. Sem fila de espera.
 */

import { useEffect, useMemo, useState } from "react";
import {
  IconCircleCheck,
  IconLoader2,
  IconNotes,
  IconTrophy,
  IconUserCheck,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { DataView, DataRow } from "@/components/automations/data-view";
import type { CardsTableView } from "@/components/automations/view-toggle";
import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { EmptyState } from "@/components/crm/empty-state";
import { KpiCard, KpiSquareScroll } from "@/components/crm/kpi-card";
import { ListHScroll } from "@/components/crm/list-hscroll";
import {
  LIST_PAGE_PANE_CLASS,
  LIST_PAGE_STACK_CLASS,
  PaginationGlass,
} from "@/components/crm/pagination-glass";
import {
  CARD_SURFACE_CLASS,
  LIST_ACTIONS_CELL_CLASS,
  LIST_CARD_ROW_CLASS,
  LIST_CARD_STACK_CLASS,
  ListColumnLabel,
} from "@/components/crm/sortable-header";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { UserAvatar } from "@/components/crm/user-avatar";
import { DistributionIcon } from "@/components/icons/distribution-icon";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelectPopover } from "@/features/dashboard-v2/components/multi-select-popover";
import {
  useBulkAddLeadsParticipants,
  useLeadsHistory,
  useLeadsParticipants,
  useLeadsSettings,
  useLeadsStats,
  useUpdateLeadsParticipant,
  useUpdateLeadsSettings,
} from "@/features/distribution/leads-hooks";
import type { LeadsParticipantDto } from "@/features/distribution/leads-types";
import { useDistributionResponsibles } from "@/features/distribution/hooks";
import { cn } from "@/lib/utils";

const WEIGHT_OPTIONS = [0, 1, 2, 3, 4, 5] as const;
const NOTE_MAX = 500;

export type LeadsPane = "consultants" | "ranking" | "history";

const CONSULTANTS_GRID =
  "grid-cols-[minmax(220px,2.2fr)_minmax(88px,0.7fr)_minmax(108px,0.8fr)_13rem_13rem]";
const RANKING_GRID =
  "grid-cols-[3.5rem_minmax(220px,1fr)_minmax(96px,0.6fr)]";
const HISTORY_GRID =
  "grid-cols-[minmax(128px,0.8fr)_minmax(180px,1.4fr)_minmax(160px,1fr)_minmax(72px,0.5fr)]";

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
    <div className="flex items-center gap-1" title="Posições do rodízio (ativas pelo peso)">
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
              ? `Posição ${s.slotIndex + 1} ativa${
                  s.lastAssignedAt
                    ? ` — último lead em ${formatDateTime(s.lastAssignedAt)}`
                    : " — nunca usada"
                }`
              : `Posição ${s.slotIndex + 1} inativa (peso ${participant.weight})`
          }
        />
      ))}
    </div>
  );
}

function WeightPicker({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (weight: number) => void;
}) {
  return (
    <div
      className="inline-flex h-9 w-max shrink-0 items-center rounded-full border border-border bg-card p-0.5"
      title="Peso: quantas das 5 posições entram no rodízio"
    >
      {WEIGHT_OPTIONS.map((w) => (
        <button
          key={w}
          type="button"
          disabled={disabled}
          onClick={() => onChange(w)}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-bold leading-none transition-colors",
            value === w
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
            disabled && "cursor-not-allowed opacity-60",
          )}
          aria-pressed={value === w}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

function StatusControl({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {active ? (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-display text-[12px] font-bold text-success">
          <IconCircleCheck size={13} /> Ativo
        </span>
      ) : (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-display text-[12px] font-bold text-muted-foreground">
          Inativo
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className="cursor-pointer font-display text-[12px] font-semibold text-primary transition-colors hover:underline disabled:opacity-50"
      >
        {active ? "Inativar" : "Ativar"}
      </button>
    </div>
  );
}

function participantNote(p: LeadsParticipantDto): string {
  return (p.note ?? "").trim();
}

function departmentLabel(
  departments?: { id: string; name: string }[] | null,
): string {
  if (departments && departments.length > 0) {
    return departments.map((d) => d.name).join(", ");
  }
  return "Sem departamento";
}

function ConsultantIdentity({
  participant,
}: {
  participant: LeadsParticipantDto;
}) {
  const note = participantNote(participant);
  const dept = departmentLabel(participant.departments);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar
        name={participant.name ?? participant.email ?? "?"}
        imageUrl={participant.avatarUrl}
        size={36}
      />
      <div className="min-w-0 leading-tight">
        <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
          {participant.name ?? "Sem nome"}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 whitespace-nowrap font-body text-[12px] leading-tight text-muted-foreground">
          <span className="min-w-0 truncate">{participant.email ?? "—"}</span>
          <span
            className="min-w-0 truncate border-l border-border pl-1.5 font-semibold"
            title={dept}
          >
            {dept}
          </span>
        </div>
        {note ? (
          <p
            className="mt-0.5 truncate font-body text-[12px] italic text-[var(--text-secondary)]"
            title={note}
          >
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function useParticipantSave() {
  const updateMut = useUpdateLeadsParticipant();
  const save = (
    userId: string,
    input: { status?: "ACTIVE" | "INACTIVE"; weight?: number; note?: string | null },
    okMessage = "Participante atualizado.",
  ) => {
    updateMut.mutate(
      { userId, input },
      {
        onSuccess: () => toast.success(okMessage),
        onError: (e) => toast.error(e.message || "Erro ao salvar."),
      },
    );
  };
  return { updateMut, save };
}

function ConsultantDesktopRow({
  participant,
  receivedCount,
  canManage,
  onEditNote,
}: {
  participant: LeadsParticipantDto;
  receivedCount: number;
  canManage: boolean;
  onEditNote: (p: LeadsParticipantDto) => void;
}) {
  const { updateMut, save } = useParticipantSave();
  const active = participant.status === "ACTIVE";
  const busy = !canManage || updateMut.isPending;
  const hasNote = Boolean(participantNote(participant));

  return (
    <DataRow>
      <ConsultantIdentity participant={participant} />
      <div className="w-full font-display text-[15px] font-bold tabular-nums text-foreground">
        {receivedCount}
      </div>
      <SlotDots participant={participant} />
      <WeightPicker
        value={participant.weight}
        disabled={busy}
        onChange={(weight) => save(participant.userId, { weight })}
      />
      <div className={LIST_ACTIONS_CELL_CLASS}>
        {canManage && (
          <button
            type="button"
            onClick={() => onEditNote(participant)}
            className={cn(
              "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-border bg-card transition-colors hover:bg-secondary hover:text-primary",
              hasNote ? "text-primary" : "text-muted-foreground",
            )}
            title={hasNote ? "Editar observação" : "Adicionar observação"}
            aria-label={hasNote ? "Editar observação" : "Adicionar observação"}
          >
            <IconNotes size={14} />
          </button>
        )}
        <StatusControl
          active={active}
          disabled={busy}
          onToggle={() =>
            save(participant.userId, { status: active ? "INACTIVE" : "ACTIVE" })
          }
        />
      </div>
    </DataRow>
  );
}

function ConsultantMobileCard({
  participant,
  receivedCount,
  canManage,
  onEditNote,
}: {
  participant: LeadsParticipantDto;
  receivedCount: number;
  canManage: boolean;
  onEditNote: (p: LeadsParticipantDto) => void;
}) {
  const { updateMut, save } = useParticipantSave();
  const active = participant.status === "ACTIVE";
  const busy = !canManage || updateMut.isPending;
  const note = participantNote(participant);
  const dept = departmentLabel(participant.departments);

  return (
    <li className={LIST_CARD_ROW_CLASS}>
      <div className="flex min-w-0 items-start gap-2.5">
        <UserAvatar
          name={participant.name ?? participant.email ?? "?"}
          imageUrl={participant.avatarUrl}
          size={36}
        />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
            {participant.name ?? "Sem nome"}
          </p>
          <p className="mt-0.5 truncate font-body text-[12px] text-muted-foreground">
            {participant.email ?? "—"}
          </p>
          <p className="mt-0.5 truncate font-body text-[12px] font-semibold text-muted-foreground" title={dept}>
            {dept}
          </p>
          {note ? (
            <p className="mt-0.5 truncate font-body text-[12px] italic text-[var(--text-secondary)]" title={note}>
              {note}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-start gap-1">
          {canManage && (
            <button
              type="button"
              onClick={() => onEditNote(participant)}
              className={cn(
                "inline-flex size-8 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-border bg-card transition-colors hover:bg-secondary hover:text-primary",
                note ? "text-primary" : "text-muted-foreground",
              )}
              title={note ? "Editar observação" : "Adicionar observação"}
              aria-label={note ? "Editar observação" : "Adicionar observação"}
            >
              <IconNotes size={14} />
            </button>
          )}
          <StatusControl
            active={active}
            disabled={busy}
            onToggle={() =>
              save(participant.userId, { status: active ? "INACTIVE" : "ACTIVE" })
            }
          />
        </div>
      </div>
      <div className="mt-2 grid w-full grid-cols-2 divide-x divide-border rounded-xl border border-border bg-secondary/40 py-2">
        <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Recebidos</p>
          <p className="font-display text-[14px] font-bold leading-none text-[var(--text-primary)]">
            {receivedCount}
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-center">
          <p className="text-xs font-semibold text-muted-foreground">Rodízio</p>
          <SlotDots participant={participant} />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">Peso</p>
        <WeightPicker
          value={participant.weight}
          disabled={busy}
          onChange={(weight) => save(participant.userId, { weight })}
        />
      </div>
    </li>
  );
}

function ObservationNoteDialog({
  participant,
  onClose,
}: {
  participant: LeadsParticipantDto | null;
  onClose: () => void;
}) {
  const updateMut = useUpdateLeadsParticipant();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(participant ? participantNote(participant) : "");
  }, [participant]);

  const persist = () => {
    if (!participant) return;
    updateMut.mutate(
      { userId: participant.userId, input: { note: draft } },
      {
        onSuccess: () => {
          toast.success("Observação salva.");
          onClose();
        },
        onError: (e) => toast.error(e.message || "Erro ao salvar."),
      },
    );
  };

  return (
    <FormDialog
      open={Boolean(participant)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Observação"
      description={
        participant
          ? `Nota interna sobre ${participant.name ?? participant.email ?? "o consultor"}. Não altera o rodízio.`
          : undefined
      }
      icon={
        <FormDialogIcon>
          <IconNotes className="size-4" />
        </FormDialogIcon>
      }
      size="md"
      busy={updateMut.isPending}
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
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            onClick={persist}
            disabled={updateMut.isPending}
          >
            {updateMut.isPending ? "Salvando…" : "Salvar"}
          </ButtonGlass>
        </>
      }
    >
      <span className={formLabelClass}>Observação</span>
      <Textarea
        className={cn(formControlClass, "h-auto min-h-28 py-3")}
        value={draft}
        maxLength={NOTE_MAX}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ex.: atende melhor de manhã, férias até dia 20…"
        disabled={updateMut.isPending}
      />
      <p className="mt-1.5 text-right font-body text-[11px] text-muted-foreground">
        {draft.length}/{NOTE_MAX}
      </p>
    </FormDialog>
  );
}

function LeadsEnabledToggle({ canManage }: { canManage: boolean }) {
  const settingsQuery = useLeadsSettings();
  const updateSettings = useUpdateLeadsSettings();
  const pendingEnabled = updateSettings.isPending
    ? updateSettings.variables?.enabled
    : undefined;
  const enabled = pendingEnabled ?? settingsQuery.data?.enabled ?? true;

  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", LIST_CARD_ROW_CLASS)}>
      <div className="min-w-0">
        <p className="font-display text-[14px] font-bold text-[var(--text-primary)]">
          Distribuição por Leads {enabled ? "ligada" : "desligada"}
        </p>
        <p className="mt-0.5 font-body text-[12px] text-muted-foreground">
          {enabled
            ? "Ligada: o bloco “Executar distribuição” em modo Por Leads atribui pelo rodízio."
            : "Desligada: o bloco Por Leads não atribui (a automação segue a saída “Sem agente”). A Distribuição Inteligente não é afetada."}
        </p>
      </div>
      <SwitchGlass
        checked={enabled}
        disabled={!canManage || updateSettings.isPending || settingsQuery.isLoading}
        onChange={(next) => {
          updateSettings.mutate(
            { enabled: next },
            {
              onSuccess: (data) =>
                toast.success(
                  data.enabled
                    ? "Distribuição por Leads ligada."
                    : "Distribuição por Leads desligada.",
                ),
              onError: (e) =>
                toast.error(
                  e instanceof Error ? e.message : "Erro ao salvar configuração.",
                ),
            },
          );
        }}
        aria-label="Distribuição por Leads ligada"
      />
    </div>
  );
}

export function LeadsDistributionView({
  canManage,
  view = "cards",
  pane,
  from = "",
  to = "",
  search = "",
}: {
  canManage: boolean;
  view?: CardsTableView;
  pane: LeadsPane;
  from?: string;
  to?: string;
  search?: string;
}) {
  const participantsQuery = useLeadsParticipants();
  const responsiblesQuery = useDistributionResponsibles();

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
  const bulkAddMut = useBulkAddLeadsParticipants();
  const [pendingUserIds, setPendingUserIds] = useState<string[]>([]);
  const [noteTarget, setNoteTarget] = useState<LeadsParticipantDto | null>(null);

  const participants = useMemo(
    () => participantsQuery.data?.participants ?? [],
    [participantsQuery.data],
  );
  const stats = statsQuery.data;
  const receivedByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of stats?.byUser ?? []) m.set(row.userId, row.count);
    return m;
  }, [stats?.byUser]);
  const departmentsByUser = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const p of participants) m.set(p.userId, p.departments ?? []);
    return m;
  }, [participants]);
  const historyItems =
    historyQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const historyTotal = historyQuery.data?.pages[0]?.total ?? 0;
  const searchNeedle = search.trim().toLocaleLowerCase("pt-BR");
  const ranking = useMemo(() => {
    const list = stats?.ranking ?? [];
    if (!searchNeedle) return list;
    return list.filter((r) => {
      const dept = departmentLabel(departmentsByUser.get(r.userId));
      return [r.name, r.userId, dept]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(searchNeedle);
    });
  }, [stats?.ranking, searchNeedle, departmentsByUser]);
  const visibleHistory = useMemo(() => {
    if (!searchNeedle) return historyItems;
    return historyItems.filter((item) => {
      const hay = [
        item.leadLabel,
        item.userName,
        item.userId,
        departmentLabel(departmentsByUser.get(item.userId)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return hay.includes(searchNeedle);
    });
  }, [historyItems, searchNeedle, departmentsByUser]);

  const availableToAdd = useMemo(() => {
    const configured = new Set(participants.map((p) => p.userId));
    return (responsiblesQuery.data?.responsibles ?? []).filter(
      (r) => r.role === "MEMBER" && !configured.has(r.userId),
    );
  }, [participants, responsiblesQuery.data]);

  const activeCount = participants.filter(
    (p) => p.status === "ACTIVE" && p.weight > 0,
  ).length;
  const top = stats?.ranking[0] ?? null;

  const addSelected = () => {
    if (pendingUserIds.length === 0) return;
    bulkAddMut.mutate(
      { userIds: pendingUserIds, status: "ACTIVE", weight: 1 },
      {
        onSuccess: (data) => {
          setPendingUserIds([]);
          const n = data.added;
          toast.success(
            n === 1
              ? "Consultor adicionado ao rodízio."
              : `${n} consultores adicionados ao rodízio.`,
          );
        },
        onError: (e) => toast.error(e.message || "Erro ao adicionar."),
      },
    );
  };

  const kpiItems = [
    {
      key: "total",
      label: "Leads distribuídos",
      shortLabel: "Distribuídos",
      value: stats?.total ?? 0,
      hint: from || to ? "no período" : "todo o período",
      tone: "brand" as const,
      icon: <IconTrophy size={20} stroke={2.2} />,
    },
    {
      key: "consultants",
      label: "Consultores no rodízio",
      shortLabel: "No rodízio",
      value: activeCount,
      hint: `${participants.length} configurado(s)`,
      tone: "neutral" as const,
      icon: <IconUsers size={20} stroke={2.2} />,
    },
    {
      key: "top",
      label: "Quem mais recebeu",
      shortLabel: "Mais recebeu",
      value: top?.count ?? 0,
      hint: top?.name ?? undefined,
      tone: "success" as const,
      icon: <IconUserCheck size={20} stroke={2.2} />,
    },
  ];

  if (participantsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
        <IconLoader2 className="mr-2 size-4 animate-spin" />
        <span className="font-body text-[13px]">Carregando…</span>
      </div>
    );
  }
  if (participantsQuery.error) {
    return (
      <div className={CARD_SURFACE_CLASS}>
        <EmptyState
          icon={<IconUsers className="size-6" />}
          title="Erro ao carregar a Distribuição por Leads"
          description={participantsQuery.error.message}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 sm:gap-4">
      <section className="w-full shrink-0" aria-label="Indicadores da Distribuição por Leads">
        <KpiSquareScroll
          items={kpiItems.map((c) => ({
            key: c.key,
            label: c.shortLabel,
            value: c.value.toLocaleString("pt-BR"),
            icon: c.icon,
            tone: c.tone,
          }))}
        />
        <div className="hidden w-full gap-2.5 sm:gap-3.5 lg:grid lg:grid-cols-3">
          {kpiItems.map((c) => (
            <KpiCard
              key={c.key}
              label={c.label}
              value={c.value.toLocaleString("pt-BR")}
              hint={c.hint}
              icon={c.icon}
              tone={c.tone}
            />
          ))}
        </div>
      </section>

      {canManage && <LeadsEnabledToggle canManage={canManage} />}

      {pane === "consultants" ? (
        <div className={LIST_PAGE_PANE_CLASS}>
          <div className="mb-2.5 flex shrink-0 flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <IconUsers size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground">Consultores</h2>
                <p className="mt-0.5 text-pretty text-xs leading-snug text-muted-foreground">
                  Status e peso valem só para novos recebimentos. Peso 0–5 = quantas
                  das 5 posições entram no rodízio. Sem fila de espera: sem elegível, a
                  automação segue a saída “Sem agente”.
                </p>
              </div>
            </div>
            {canManage && availableToAdd.length > 0 && (
              <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
                <MultiSelectPopover
                  label="Consultores"
                  icon={<IconUsers size={14} />}
                  options={availableToAdd.map((r) => ({
                    value: r.userId,
                    label: r.name ?? r.email ?? r.userId,
                    sub: r.email ?? undefined,
                  }))}
                  selected={pendingUserIds}
                  onChange={setPendingUserIds}
                  emptyLabel="Nenhum operador disponível"
                  disabled={bulkAddMut.isPending}
                  width={280}
                />
                <ButtonGlass
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={pendingUserIds.length === 0 || bulkAddMut.isPending}
                  onClick={addSelected}
                >
                  {bulkAddMut.isPending
                    ? "Adicionando…"
                    : pendingUserIds.length > 0
                      ? `Adicionar (${pendingUserIds.length})`
                      : "Adicionar"}
                </ButtonGlass>
              </div>
            )}
          </div>

          {participants.length === 0 ? (
            <div className={CARD_SURFACE_CLASS}>
              <EmptyState
                icon={<DistributionIcon size={28} />}
                title="Nenhum consultor configurado"
                description="Adicione consultores e defina o peso (0–5) de cada um para montar o rodízio."
              />
            </div>
          ) : (
            <>
              <ul className={cn(LIST_CARD_STACK_CLASS, "md:hidden")}>
                {participants.map((p) => (
                  <ConsultantMobileCard
                    key={p.userId}
                    participant={p}
                    receivedCount={receivedByUser.get(p.userId) ?? 0}
                    canManage={canManage}
                    onEditNote={setNoteTarget}
                  />
                ))}
              </ul>
              <div className="hidden w-full md:block">
                <ListHScroll>
                  <DataView
                    view={view}
                    columnClass={cn("grid w-full items-center gap-4", CONSULTANTS_GRID)}
                    className={LIST_PAGE_STACK_CLASS}
                    header={
                      <>
                        <ListColumnLabel>Consultor</ListColumnLabel>
                        <ListColumnLabel>Recebidos</ListColumnLabel>
                        <ListColumnLabel>Rodízio</ListColumnLabel>
                        <ListColumnLabel>Peso</ListColumnLabel>
                        <ListColumnLabel align="right">Status</ListColumnLabel>
                      </>
                    }
                  >
                    {participants.map((p) => (
                      <ConsultantDesktopRow
                        key={p.userId}
                        participant={p}
                        receivedCount={receivedByUser.get(p.userId) ?? 0}
                        canManage={canManage}
                        onEditNote={setNoteTarget}
                      />
                    ))}
                  </DataView>
                </ListHScroll>
              </div>
              <PaginationGlass
                total={participants.length}
                entityLabel="consultores"
                showNav={false}
              />
            </>
          )}
        </div>
      ) : pane === "ranking" ? (
        <div className={LIST_PAGE_PANE_CLASS}>
          <div className="mb-2.5 flex min-w-0 items-start gap-3 px-1">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
              <IconTrophy size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground">Ranking</h2>
              <p className="mt-0.5 text-pretty text-xs leading-snug text-muted-foreground">
                Quem mais recebeu leads no período selecionado.
              </p>
            </div>
          </div>
          {!stats || stats.ranking.length === 0 ? (
            <div className={CARD_SURFACE_CLASS}>
              <EmptyState
                icon={<IconTrophy className="size-6" />}
                title="Nenhuma distribuição no período"
                description="Quando o rodízio atribuir leads, o ranking aparece aqui."
              />
            </div>
          ) : ranking.length === 0 ? (
            <div className={CARD_SURFACE_CLASS}>
              <EmptyState
                icon={<IconTrophy className="size-6" />}
                title="Nenhum consultor encontrado"
                description="Ajuste a busca para ver outros nomes no ranking."
              />
            </div>
          ) : (
            <>
              <ul className={cn(LIST_CARD_STACK_CLASS, "md:hidden")}>
                {ranking.map((r, idx) => {
                  const dept = departmentLabel(departmentsByUser.get(r.userId));
                  return (
                  <li key={r.userId} className={LIST_CARD_ROW_CLASS}>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "inline-flex size-7 shrink-0 items-center justify-center rounded-full font-display text-[12px] font-bold",
                          idx === 0
                            ? "bg-primary/15 text-primary"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                          {r.name ?? r.userId}
                        </p>
                        <p className="mt-0.5 truncate font-body text-[12px] font-semibold text-muted-foreground" title={dept}>
                          {dept}
                        </p>
                      </div>
                      <span className="font-display text-[15px] font-bold tabular-nums text-foreground">
                        {r.count}
                      </span>
                    </div>
                  </li>
                  );
                })}
              </ul>
              <div className="hidden w-full md:block">
                <ListHScroll>
                  <DataView
                    view={view}
                    columnClass={cn("grid w-full items-center gap-4", RANKING_GRID)}
                    className={LIST_PAGE_STACK_CLASS}
                    header={
                      <>
                        <ListColumnLabel>#</ListColumnLabel>
                        <ListColumnLabel>Consultor</ListColumnLabel>
                        <ListColumnLabel>Leads</ListColumnLabel>
                      </>
                    }
                  >
                    {ranking.map((r, idx) => {
                      const dept = departmentLabel(departmentsByUser.get(r.userId));
                      return (
                      <DataRow key={r.userId}>
                        <span
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded-full font-display text-[12px] font-bold",
                            idx === 0
                              ? "bg-primary/15 text-primary"
                              : "bg-secondary text-muted-foreground",
                          )}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 leading-tight">
                          <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                            {r.name ?? r.userId}
                          </p>
                          <p className="mt-0.5 truncate font-body text-[12px] font-semibold text-muted-foreground" title={dept}>
                            {dept}
                          </p>
                        </div>
                        <span className="font-display text-[15px] font-bold tabular-nums text-foreground">
                          {r.count}
                        </span>
                      </DataRow>
                      );
                    })}
                  </DataView>
                </ListHScroll>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className={LIST_PAGE_PANE_CLASS}>
          <div className="mb-2.5 flex shrink-0 flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-chip-blue-soft text-chip-blue">
                <IconUserCheck size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground">
                  Histórico
                </h2>
                <p className="mt-0.5 text-pretty text-xs leading-snug text-muted-foreground">
                  Atribuições do rodízio no período do calendário.
                </p>
              </div>
            </div>
            <DropdownGlass
              options={[
                { value: "", label: "Todos os consultores" },
                ...participants.map((p) => ({
                  value: p.userId,
                  label: p.name ?? p.email ?? p.userId,
                })),
              ]}
              value={filterUserId}
              onValueChange={setFilterUserId}
              placeholder="Todos os consultores"
              triggerClassName="w-auto min-w-[220px]"
            />
          </div>

          {historyQuery.isLoading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
              <IconLoader2 className="mr-2 size-4 animate-spin" />
              <span className="font-body text-[13px]">Carregando…</span>
            </div>
          ) : historyItems.length === 0 ? (
            <div className={CARD_SURFACE_CLASS}>
              <EmptyState
                icon={<DistributionIcon size={28} />}
                title="Nenhuma distribuição encontrada"
                description="Ajuste o período ou o consultor para ver outros registros."
              />
            </div>
          ) : visibleHistory.length === 0 ? (
            <div className={CARD_SURFACE_CLASS}>
              <EmptyState
                icon={<DistributionIcon size={28} />}
                title="Nenhum resultado na busca"
                description="Ajuste a pesquisa para ver outras atribuições."
              />
            </div>
          ) : (
            <>
              <ul className={cn(LIST_CARD_STACK_CLASS, "md:hidden")}>
                {visibleHistory.map((item) => {
                  const dept = departmentLabel(departmentsByUser.get(item.userId));
                  return (
                  <li key={item.id} className={LIST_CARD_ROW_CLASS}>
                    <p className="truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                      {item.leadLabel ?? "Lead"}
                    </p>
                    <p className="mt-0.5 font-body text-[12px] text-muted-foreground">
                      {formatDateTime(item.createdAt)} · {item.userName ?? item.userId}
                      {" · "}
                      {dept}
                      {" · posição "}
                      {item.slotIndex + 1}
                    </p>
                  </li>
                  );
                })}
              </ul>
              <div className="hidden w-full md:block">
                <ListHScroll>
                  <DataView
                    view={view}
                    columnClass={cn("grid w-full items-center gap-4", HISTORY_GRID)}
                    className={LIST_PAGE_STACK_CLASS}
                    header={
                      <>
                        <ListColumnLabel>Quando</ListColumnLabel>
                        <ListColumnLabel>Lead</ListColumnLabel>
                        <ListColumnLabel>Consultor</ListColumnLabel>
                        <ListColumnLabel>Posição</ListColumnLabel>
                      </>
                    }
                  >
                    {visibleHistory.map((item) => {
                      const dept = departmentLabel(departmentsByUser.get(item.userId));
                      return (
                      <DataRow key={item.id}>
                        <span className="font-display text-[13px] tabular-nums text-[var(--text-secondary)]">
                          {formatDateTime(item.createdAt)}
                        </span>
                        <span className="min-w-0 truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                          {item.leadLabel ?? "Lead"}
                        </span>
                        <div className="min-w-0 leading-tight">
                          <p className="truncate font-body text-[13px] text-[var(--text-secondary)]">
                            {item.userName ?? item.userId}
                          </p>
                          <p className="mt-0.5 truncate font-body text-[12px] font-semibold text-muted-foreground" title={dept}>
                            {dept}
                          </p>
                        </div>
                        <span className="font-display text-[13px] tabular-nums text-[var(--text-secondary)]">
                          {item.slotIndex + 1}
                        </span>
                      </DataRow>
                      );
                    })}
                  </DataView>
                </ListHScroll>
              </div>
              <PaginationGlass
                total={historyTotal}
                entityLabel="distribuições"
                showNav={false}
              />
              {historyQuery.hasNextPage && (
                <div className="-mt-3 flex justify-center pb-6">
                  <ButtonGlass
                    variant="glass"
                    size="sm"
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
        </div>
      )}
      <ObservationNoteDialog
        participant={noteTarget}
        onClose={() => setNoteTarget(null)}
      />
    </div>
  );
}
