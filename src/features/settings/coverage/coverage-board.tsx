"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconBuilding,
  IconClock,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconX as X,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { PageDemoBanner } from "@/components/crm/page-demo-banner";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { Label } from "@/components/ui/label";
import { DISTRIBUTION_RESPONSIBLES_KEY } from "@/features/distribution/hooks";
import {
  useDepartments,
  useUpdateDepartment,
  type Department,
  type DepartmentOperatingHours,
} from "@/features/conversations-settings/hooks/use-departments";
import {
  DEFAULT_SCHEDULE,
  ScheduleDialogShell,
  ScheduleFields,
  WEEKDAYS,
  type Schedule,
} from "@/features/settings/schedules/schedule-shared";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

import { CoverageGantt } from "./coverage-gantt";
import { CoverageMiniDash } from "./coverage-rail";
import { MOCK_COVERAGE_AGENTS, shouldUseCoverageMock } from "./mock-agents";
import {
  axisRange,
  coverageByHour,
  deriveCoverageStats,
  type CoverageAgent,
} from "./schedule-data";

export type { CoverageAgent, CoverageDepartment } from "./schedule-data";

type AgentPresence = "ONLINE" | "AWAY" | "OFFLINE";
type PresenceFilter = "" | AgentPresence;

const DEFAULT_DEPT_HOURS: DepartmentOperatingHours = {
  start: "09:00",
  end: "18:00",
  weekdays: [1, 2, 3, 4, 5],
};

function normalizeDeptHours(
  raw: DepartmentOperatingHours | null | undefined,
): DepartmentOperatingHours {
  if (!raw || typeof raw.start !== "string" || typeof raw.end !== "string") {
    return DEFAULT_DEPT_HOURS;
  }
  const weekdays = Array.isArray(raw.weekdays)
    ? raw.weekdays.filter((d) => d >= 0 && d <= 6)
    : DEFAULT_DEPT_HOURS.weekdays;
  return {
    start: raw.start,
    end: raw.end,
    weekdays: weekdays.length ? weekdays : DEFAULT_DEPT_HOURS.weekdays,
  };
}

function formatDeptHoursLabel(hours: DepartmentOperatingHours): string {
  const days = [...hours.weekdays].sort((a, b) => a - b);
  const isWeekdays =
    days.length === 5 && days[0] === 1 && days[4] === 5 && !days.includes(0) && !days.includes(6);
  const dayStr = isWeekdays
    ? "Seg–Sex"
    : WEEKDAYS.filter((w) => days.includes(w.value))
        .map((w) => w.short)
        .join("·");
  return `${dayStr} ${hours.start}–${hours.end}`;
}

const PRESENCE_OPTIONS: { id: PresenceFilter; label: string; dot: string }[] = [
  { id: "ONLINE", label: "Online", dot: "bg-[var(--color-success)]" },
  { id: "AWAY", label: "Ausente", dot: "bg-[var(--color-warn)]" },
  { id: "OFFLINE", label: "Offline", dot: "bg-[var(--text-muted)]" },
];

function coerceSchedule(raw: CoverageAgent["schedule"]): Schedule | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.startTime !== "string" || typeof raw.endTime !== "string") return null;
  const weekdays = Array.isArray(raw.weekdays)
    ? raw.weekdays.map(Number).filter((d) => d >= 0 && d <= 6)
    : [1, 2, 3, 4, 5];
  return {
    startTime: raw.startTime,
    lunchStart: typeof raw.lunchStart === "string" ? raw.lunchStart : "12:00",
    lunchEnd: typeof raw.lunchEnd === "string" ? raw.lunchEnd : "13:00",
    endTime: raw.endTime,
    timezone: typeof raw.timezone === "string" ? raw.timezone : "America/Sao_Paulo",
    weekdays,
    saturdayEnabled: raw.saturdayEnabled === true,
    saturdayStart: raw.saturdayStart,
    saturdayEnd: raw.saturdayEnd,
  };
}

async function fetchCoverage(): Promise<CoverageAgent[]> {
  const res = await fetch(apiUrl("/api/agents/schedules"));
  if (!res.ok) throw new Error("Erro ao carregar expedientes");
  const payload: unknown = await res.json();
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { agents?: unknown }).agents)
      ? (payload as { agents: unknown[] }).agents
      : [];
  return (list as CoverageAgent[]).map((a) => ({
    ...a,
    schedule: coerceSchedule(a.schedule),
  }));
}

export function useCoverageAgents() {
  // ?mock=1 → bypass API, retorna mocks imediatamente
  const forceMock =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mock") === "1";

  const query = useQuery({
    queryKey: ["agents-coverage"],
    queryFn: fetchCoverage,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    enabled: !forceMock, // não faz request se forçar mock
  });

  // Com ?mock=1: sempre mock. Sem: mock só quando API vazia em localhost.
  const isMock =
    forceMock ||
    shouldUseCoverageMock({
      realCount: query.data?.length ?? 0,
      isLoading: query.isLoading,
    });

  return {
    ...query,
    data: isMock ? MOCK_COVERAGE_AGENTS : query.data,
    isLoading: forceMock ? false : query.isLoading,
    isMock,
  };
}

function DepartmentHoursControl() {
  const { data: depts = [], isLoading } = useDepartments();
  const updateMut = useUpdateDepartment();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, DepartmentOperatingHours>>({});

  React.useEffect(() => {
    if (!open) return;
    const next: Record<string, DepartmentOperatingHours> = {};
    for (const d of depts) next[d.id] = normalizeDeptHours(d.operatingHours);
    setDraft(next);
  }, [open, depts]);

  const summary = React.useMemo(() => {
    if (depts.length === 0) return "Horário do departamento";
    const labels = new Set(
      depts.map((d) => formatDeptHoursLabel(normalizeDeptHours(d.operatingHours))),
    );
    if (labels.size === 1) return [...labels][0];
    return "Horários dos departamentos";
  }, [depts]);

  const save = async () => {
    const jobs = depts.filter((d) => {
      const cur = formatDeptHoursLabel(normalizeDeptHours(d.operatingHours));
      const next = draft[d.id];
      return next && formatDeptHoursLabel(next) !== cur;
    });
    try {
      for (const d of jobs) {
        await updateMut.mutateAsync({ id: d.id, operatingHours: draft[d.id] });
      }
      setOpen(false);
      toast.success(
        jobs.length === 0 ? "Nenhuma alteração." : "Horário do departamento salvo.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar horário.");
    }
  };

  const patch = (id: string, partial: Partial<DepartmentOperatingHours>) => {
    setDraft((prev) => ({
      ...prev,
      [id]: { ...normalizeDeptHours(prev[id]), ...partial },
    }));
  };

  const toggleDay = (id: string, day: number) => {
    const cur = normalizeDeptHours(draft[id]);
    const weekdays = cur.weekdays.includes(day)
      ? cur.weekdays.filter((d) => d !== day)
      : [...cur.weekdays, day].sort((a, b) => a - b);
    patch(id, { weekdays: weekdays.length ? weekdays : cur.weekdays });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 py-1.5 font-display text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
      >
        <IconBuilding size={14} className="text-[var(--text-muted)]" />
        <span className="max-w-[220px] truncate">{summary}</span>
        <IconPencil size={12} className="text-[var(--text-muted)]" />
      </button>

      <ScheduleDialogShell
        open={open}
        onOpenChange={setOpen}
        title="Horário do departamento"
        description="Janela operacional padrão (Seg–Sex 09:00–18:00). Não substitui o expediente individual."
        submitLabel="Salvar"
        submitPending={updateMut.isPending}
        onSubmit={() => void save()}
      >
        {depts.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-4 text-center font-body text-[12px] text-[var(--text-muted)]">
            Nenhum departamento cadastrado. Crie em Configurações → Equipe → Departamentos.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {depts.map((d: Department) => {
              const hours = normalizeDeptHours(draft[d.id]);
              return (
                <div
                  key={d.id}
                  className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    <p className="truncate font-display text-[13px] font-bold text-[var(--text-primary)]">
                      {d.name}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Início</Label>
                      <InputGlass
                        type="time"
                        value={hours.start}
                        onChange={(e) => patch(d.id, { start: e.target.value })}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Fim</Label>
                      <InputGlass
                        type="time"
                        value={hours.end}
                        onChange={(e) => patch(d.id, { end: e.target.value })}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((wd) => {
                      const active = hours.weekdays.includes(wd.value);
                      return (
                        <button
                          key={wd.value}
                          type="button"
                          onClick={() => toggleDay(d.id, wd.value)}
                          className={cn(
                            "rounded-[var(--radius-md)] px-2 py-1 font-display text-[11px] font-semibold transition-colors",
                            active
                              ? "bg-[var(--brand-primary)] text-white"
                              : "bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                          )}
                        >
                          {wd.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScheduleDialogShell>
    </>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function CoverageBoard({
  search = "",
  deptIds = [],
  showHidden = false,
  onShowHiddenChange,
}: {
  search?: string;
  deptIds?: string[];
  showHidden?: boolean;
  onShowHiddenChange?: (v: boolean) => void;
} = {}) {
  const qc = useQueryClient();
  const { data: agents = [], isLoading, isError, isMock } = useCoverageAgents();

  const [weekday, setWeekday] = React.useState<number>(() => new Date().getDay());
  const deptFilter = React.useMemo(() => new Set(deptIds), [deptIds]);
  const [presenceFilter, setPresenceFilter] = React.useState<PresenceFilter>("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editAgent, setEditAgent] = React.useState<CoverageAgent | null>(null);
  const [editSchedule, setEditSchedule] = React.useState<Schedule>(DEFAULT_SCHEDULE);
  const [editParticipates, setEditParticipates] = React.useState(true);
  const [editVisible, setEditVisible] = React.useState(true);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkSchedule, setBulkSchedule] = React.useState<Schedule>(DEFAULT_SCHEDULE);

  // Tick de 1min para o marcador "agora" acompanhar o relógio.
  const [nowMinutes, setNowMinutes] = React.useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  React.useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  const isToday = weekday === new Date().getDay();

  // ── Filtro (área + presença + busca) ──────────────────────────────────────

  const q = search.trim().toLowerCase();

  const filtered = React.useMemo(() => {
    let arr = agents;
    if (!showHidden) {
      arr = arr.filter((a) => {
        if (a.visibleInCoverage !== false) return true;
        // Busca ainda acha quem foi escondido, para dar pra restaurar.
        if (!q) return false;
        return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
      });
    }
    if (deptFilter.size > 0) {
      arr = arr.filter((a) => a.departments.some((d) => deptFilter.has(d.id)));
    }
    if (presenceFilter) {
      arr = arr.filter((a) => (a.agentStatus?.status ?? "OFFLINE") === presenceFilter);
    }
    if (q) {
      arr = arr.filter(
        (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
      );
    }
    return arr;
  }, [agents, deptFilter, presenceFilter, q, showHidden]);

  const hiddenCount = React.useMemo(
    () => agents.filter((a) => a.visibleInCoverage === false).length,
    [agents],
  );

  const { dayStart, dayEnd, hours } = React.useMemo(
    () => axisRange(filtered, weekday, nowMinutes, isToday),
    [filtered, weekday, nowMinutes, isToday],
  );

  const perHour = React.useMemo(
    () => coverageByHour(filtered, weekday, hours),
    [filtered, weekday, hours],
  );

  const stats = React.useMemo(
    () => deriveCoverageStats(filtered, perHour),
    [filtered, perHour],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveOne = useMutation({
    mutationFn: async ({
      userId,
      schedule,
      participates,
      visibleInCoverage,
    }: {
      userId: string;
      schedule: Schedule;
      participates: boolean;
      visibleInCoverage: boolean;
    }) => {
      const res = await fetch(apiUrl(`/api/agents/${userId}/schedule`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...schedule, participates, visibleInCoverage }),
      });
      if (!res.ok) throw new Error("Erro ao salvar horário");
      return res.json() as Promise<
        Schedule & { participates?: boolean; visibleInCoverage?: boolean }
      >;
    },
    onSuccess: (saved, vars) => {
      qc.setQueryData<CoverageAgent[]>(["agents-coverage"], (prev) =>
        prev?.map((a) =>
          a.id === vars.userId
            ? {
                ...a,
                schedule: {
                  startTime: saved.startTime ?? vars.schedule.startTime,
                  lunchStart: saved.lunchStart ?? vars.schedule.lunchStart,
                  lunchEnd: saved.lunchEnd ?? vars.schedule.lunchEnd,
                  endTime: saved.endTime ?? vars.schedule.endTime,
                  timezone: saved.timezone ?? vars.schedule.timezone,
                  weekdays: saved.weekdays ?? vars.schedule.weekdays,
                  saturdayEnabled: vars.schedule.saturdayEnabled,
                  saturdayStart: vars.schedule.saturdayStart,
                  saturdayEnd: vars.schedule.saturdayEnd,
                },
                participates: saved.participates ?? vars.participates,
                visibleInCoverage:
                  saved.visibleInCoverage ?? vars.visibleInCoverage,
              }
            : a,
        ),
      );
      qc.invalidateQueries({ queryKey: ["agents-coverage"] });
      qc.invalidateQueries({ queryKey: DISTRIBUTION_RESPONSIBLES_KEY });
      setEditAgent(null);
      toast.success("Expediente salvo.");
    },
    onError: () => toast.error("Erro ao salvar horário."),
  });

  const applyBulk = useMutation({
    mutationFn: async ({ userIds, schedule }: { userIds: string[]; schedule: Schedule }) => {
      const results = await Promise.allSettled(
        userIds.map((id) =>
          fetch(apiUrl(`/api/agents/${id}/schedule`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(schedule),
          }).then((r) => {
            if (!r.ok) throw new Error();
          }),
        ),
      );
      const fail = results.filter((r) => r.status === "rejected").length;
      return { ok: userIds.length - fail, fail };
    },
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ["agents-coverage"] });
      qc.invalidateQueries({ queryKey: DISTRIBUTION_RESPONSIBLES_KEY });
      setBulkOpen(false);
      setSelected(new Set());
      if (fail === 0) toast.success(`Expediente aplicado a ${ok} agente(s).`);
      else if (ok === 0) toast.error("Não foi possível aplicar o expediente.");
      else toast.error(`${ok} aplicado(s), ${fail} falharam.`);
    },
    onError: () => toast.error("Erro ao aplicar expediente."),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  const toggleSelectAll = () =>
    setSelected((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const a of filtered) next.delete(a.id);
        return next;
      }
      const next = new Set(prev);
      for (const a of filtered) next.add(a.id);
      return next;
    });

  const openEdit = (agent: CoverageAgent) => {
    setEditAgent(agent);
    setEditSchedule(agent.schedule ?? DEFAULT_SCHEDULE);
    setEditParticipates(agent.participates !== false);
    setEditVisible(agent.visibleInCoverage !== false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      {isMock && (
        <PageDemoBanner>
          Dados de exemplo — a API não retornou agentes; exibindo equipe ilustrativa
          (somente localhost/dev ou ?mock=1).
        </PageDemoBanner>
      )}

      {isError && (
        <p className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          Erro ao carregar expedientes.
        </p>
      )}

      {!isLoading && (
        <div data-tour="distribution-coverage-kpis">
          <CoverageMiniDash stats={stats} />
        </div>
      )}

      {/* Controles: dia da semana + presença (busca/área ficam no PageHeader) */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-tour="distribution-coverage-controls"
      >
        <div className="flex flex-wrap gap-1 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-1">
          {WEEKDAYS.map((wd) => (
            <button
              key={wd.value}
              type="button"
              onClick={() => setWeekday(wd.value)}
              className={cn(
                "rounded-[var(--radius-md)] px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors",
                weekday === wd.value
                  ? "bg-[var(--brand-primary)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              )}
            >
              {wd.short}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-[var(--glass-border)]" />

        {PRESENCE_OPTIONS.map((p) => {
          const active = presenceFilter === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresenceFilter((prev) => (prev === p.id ? "" : p.id))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12px] font-semibold transition-colors",
                active
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              )}
            >
              <span className={cn("size-2 rounded-full", active ? "bg-white" : p.dot)} />
              {p.label}
            </button>
          );
        })}

        <div className="h-6 w-px bg-[var(--glass-border)]" />

        <DepartmentHoursControl />

        {hiddenCount > 0 && (
          <TooltipGlass
            label={
              showHidden
                ? "Ocultar quem não aparece na lista"
                : "Mostrar quem foi escondido da lista"
            }
            side="bottom"
          >
            <button
              type="button"
              onClick={() => onShowHiddenChange?.(!showHidden)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-[12px] font-semibold transition-colors",
                showHidden
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                  : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              )}
              aria-pressed={showHidden}
            >
              {showHidden ? <IconEye size={14} /> : <IconEyeOff size={14} />}
              {hiddenCount} oculto{hiddenCount === 1 ? "" : "s"}
            </button>
          </TooltipGlass>
        )}
      </div>

      <div data-tour="distribution-coverage-grid">
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[56px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-16">
          <IconClock size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">
            Nenhum agente encontrado{deptFilter.size > 0 ? " para as áreas selecionadas" : ""}.
          </p>
          {!showHidden && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => onShowHiddenChange?.(true)}
              className="font-display text-[12px] font-semibold text-[var(--brand-primary)] hover:underline"
            >
              Mostrar {hiddenCount} oculto{hiddenCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      ) : (
        <CoverageGantt
          agents={filtered}
          weekday={weekday}
          perHour={perHour}
          maxCoverage={stats.maxCoverage}
          dayStart={dayStart}
          dayEnd={dayEnd}
          hours={hours}
          nowMinutes={nowMinutes}
          isToday={isToday}
          selected={selected}
          allSelected={allFilteredSelected}
          onToggleAll={toggleSelectAll}
          onToggle={toggleSelected}
          onEdit={openEdit}
        />
      )}
      </div>

      {/* Barra de ação em massa */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-4 py-3 shadow-[var(--glass-shadow)] backdrop-blur-lg">
          <span className="font-display text-[13px] font-bold text-[var(--text-primary)]">
            {selected.size} agente(s) selecionado(s)
          </span>
          <div className="flex items-center gap-2">
            <ButtonGlass type="button" variant="glass" onClick={() => setSelected(new Set())} className="gap-1.5">
              <X className="size-4" /> Limpar
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              onClick={() => {
                setBulkSchedule(DEFAULT_SCHEDULE);
                setBulkOpen(true);
              }}
              className="gap-1.5"
            >
              <IconClock className="size-4" /> Aplicar expediente
            </ButtonGlass>
          </div>
        </div>
      )}

      {/* Modal edição individual — padrão das modais de filtros (kanban/inbox) */}
      <ScheduleDialogShell
        open={!!editAgent}
        onOpenChange={(o) => { if (!o) setEditAgent(null); }}
        title={`Expediente de ${editAgent?.name ?? ""}`}
        description="Defina o expediente, se aparece na lista e se participa da distribuição."
        submitLabel="Salvar"
        submitPending={saveOne.isPending}
        onSubmit={() => {
          if (!editAgent) return;
          saveOne.mutate({
            userId: editAgent.id,
            schedule: editSchedule,
            participates: editParticipates,
            visibleInCoverage: editVisible,
          });
        }}
      >
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] px-3 py-2.5">
          <div className="min-w-0">
            <p className="font-body text-[13px] font-semibold text-[var(--text-primary)]">
              Aparece na lista de cobertura
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Desligado = some da grade (útil para admins que não atendem).
            </p>
          </div>
          <SwitchGlass
            checked={editVisible}
            onChange={setEditVisible}
            aria-label="Aparece na lista de cobertura"
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] px-3 py-2.5">
          <div className="min-w-0">
            <p className="font-body text-[13px] font-semibold text-[var(--text-primary)]">
              Participa da distribuição
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Desligado = inativo (não recebe leads).
            </p>
          </div>
          <SwitchGlass
            checked={editParticipates}
            onChange={setEditParticipates}
            aria-label="Participa da distribuição"
          />
        </div>
        <ScheduleFields schedule={editSchedule} onChange={setEditSchedule} />
      </ScheduleDialogShell>

      {/* Modal aplicação em massa */}
      <ScheduleDialogShell
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Aplicar expediente a ${selected.size} agente(s)`}
        description="O expediente abaixo substitui o horário atual de todos os selecionados."
        submitLabel={`Aplicar a ${selected.size} agente(s)`}
        submitPending={applyBulk.isPending}
        onSubmit={() => {
          applyBulk.mutate({ userIds: [...selected], schedule: bulkSchedule });
        }}
      >
        <ScheduleFields schedule={bulkSchedule} onChange={setBulkSchedule} />
      </ScheduleDialogShell>
    </div>
  );
}
