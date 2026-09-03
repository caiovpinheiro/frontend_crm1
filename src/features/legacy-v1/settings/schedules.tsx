"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconClock,
  IconPencil,
  IconPhone,
  IconPlus,
  IconUsers,
  IconWifi,
  IconWifiOff,
  IconZzz,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/crm/user-avatar";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { KpiCard, type KpiTone } from "@/components/crm/kpi-card";
import { KpiStrip } from "@/components/crm/kpi-strip";
import { MobileTableScroll } from "@/components/crm/mobile-table-scroll";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { SettingsListFilterBar } from "@/components/crm/settings-filter-bar";
import {
  ListColumnLabel,
  SortableHeader,
  listTableHeadRowClass,
  type SortDir,
} from "@/components/crm/sortable-header";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { Label } from "@/components/ui/label";
import { useSettingsHeaderSlots } from "@/app/(app)/settings/_v2-shell";
import {
  DEFAULT_SCHEDULE,
  ScheduleDialogShell,
  ScheduleFields,
  type Schedule,
} from "@/features/settings/schedules/schedule-shared";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type AgentOnlineStatus = "ONLINE" | "OFFLINE" | "AWAY";

type AgentRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  agentStatus: {
    status: AgentOnlineStatus;
    availableForVoiceCalls?: boolean;
    updatedAt: string;
  } | null;
  schedule: Schedule | null;
};

type SortField = "name" | "email" | "status" | "schedule";
type StatusFilter = AgentOnlineStatus | "WA" | "";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<AgentOnlineStatus, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  AWAY: "Ausente",
};

const STATUS_COLORS: Record<AgentOnlineStatus, string> = {
  ONLINE: "bg-[var(--color-success-bg)] text-[color-mix(in_srgb,var(--color-success)_78%,black)]",
  OFFLINE: "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
  AWAY: "bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
};

const STATUS_DOT: Record<AgentOnlineStatus, string> = {
  ONLINE: "bg-[var(--color-success)]",
  OFFLINE: "bg-[var(--text-muted)]",
  AWAY: "bg-[var(--color-warn)]",
};

/** Mini-dash: segmentos de status clicáveis. */
const STATUS_SEGMENTS: {
  id: Exclude<StatusFilter, "">;
  label: string;
  tone: KpiTone;
  icon: React.ReactNode;
}[] = [
  { id: "ONLINE",  label: "Online",      tone: "success", icon: <IconWifi    size={20} stroke={2.2} /> },
  { id: "AWAY",    label: "Ausente",     tone: "warning", icon: <IconZzz     size={20} stroke={2.2} /> },
  { id: "OFFLINE", label: "Offline",     tone: "neutral", icon: <IconWifiOff size={20} stroke={2.2} /> },
  { id: "WA",      label: "WA voz ativo", tone: "violet", icon: <IconPhone   size={20} stroke={2.2} /> },
];

/** Grid: Nome | E-mail | Status | Expediente | Dias | Ações */
const LIST_GRID = "minmax(0,1.6fr) minmax(0,1.4fr) 140px 150px 68px 52px";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchAgents(): Promise<AgentRow[]> {
  const res = await fetch(apiUrl("/api/agents/status"));
  if (!res.ok) throw new Error("Erro ao carregar agentes");
  return res.json();
}

// ─── Tab de Expediente (sem header slots próprios) ────────────────────────────

/**
 * Lista de expediente/disponibilidade dos agentes. A busca vem por prop (o
 * header é controlado pela página/aba pai). O modal "Novo expediente"
 * (template aplicável a vários usuários) é controlado via props.
 */
export function ExpedienteTab({
  search,
  newExpedienteOpen,
  onNewExpedienteOpenChange,
}: {
  search: string;
  newExpedienteOpen: boolean;
  onNewExpedienteOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: agents = [], isLoading, isError } = useQuery({
    queryKey: ["agents-schedules"],
    queryFn: fetchAgents,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("");
  const [sortBy, setSortBy] = React.useState<SortField>("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [editAgent, setEditAgent] = React.useState<AgentRow | null>(null);
  const [editSchedule, setEditSchedule] = React.useState<Schedule>(DEFAULT_SCHEDULE);

  // Template ("Novo expediente")
  const [templateSchedule, setTemplateSchedule] = React.useState<Schedule>(DEFAULT_SCHEDULE);
  const [templateUsers, setTemplateUsers] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (newExpedienteOpen) {
      setTemplateSchedule(DEFAULT_SCHEDULE);
      setTemplateUsers(new Set());
    }
  }, [newExpedienteOpen]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const statusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: AgentOnlineStatus }) => {
      const res = await fetch(apiUrl(`/api/agents/${userId}/status`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Erro ao alterar status");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents-schedules"] }),
  });

  const voiceMutation = useMutation({
    mutationFn: async ({
      userId,
      availableForVoiceCalls,
    }: {
      userId: string;
      availableForVoiceCalls: boolean;
    }) => {
      const res = await fetch(apiUrl(`/api/agents/${userId}/status`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availableForVoiceCalls }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar ligações");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents-schedules"] }),
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ userId, schedule }: { userId: string; schedule: Schedule }) => {
      const res = await fetch(apiUrl(`/api/agents/${userId}/schedule`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      if (!res.ok) throw new Error("Erro ao salvar horário");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents-schedules"] });
      setEditAgent(null);
    },
  });

  const applyTemplate = useMutation({
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
      qc.invalidateQueries({ queryKey: ["agents-schedules"] });
      onNewExpedienteOpenChange(false);
      if (fail === 0) toast.success(`Expediente aplicado a ${ok} usuário(s).`);
      else if (ok === 0) toast.error("Não foi possível aplicar o expediente.");
      else toast.error(`${ok} aplicado(s), ${fail} falharam.`);
    },
    onError: () => toast.error("Erro ao aplicar expediente."),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openEdit = (agent: AgentRow) => {
    setEditAgent(agent);
    setEditSchedule(agent.schedule ?? DEFAULT_SCHEDULE);
  };

  const cycleStatus = (agent: AgentRow) => {
    const current = agent.agentStatus?.status ?? "OFFLINE";
    const next: AgentOnlineStatus =
      current === "ONLINE" ? "AWAY" : current === "AWAY" ? "OFFLINE" : "ONLINE";
    statusMutation.mutate({ userId: agent.id, status: next });
  };

  const toggleSort = React.useCallback((field: SortField) => {
    setSortBy((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return field;
    });
  }, []);

  const dirFor = (f: SortField): SortDir => (sortBy === f ? sortDir : null);

  const toggleTemplateUser = (id: string) => {
    setTemplateUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── KPI counts ────────────────────────────────────────────────────────────

  const kpiCounts = React.useMemo(() => ({
    online:  agents.filter((a) => a.agentStatus?.status === "ONLINE").length,
    away:    agents.filter((a) => a.agentStatus?.status === "AWAY").length,
    offline: agents.filter((a) => !a.agentStatus || a.agentStatus.status === "OFFLINE").length,
    wa:      agents.filter((a) => a.agentStatus?.availableForVoiceCalls === true).length,
  }), [agents]);

  // ── Filter + search + sort pipeline ──────────────────────────────────────

  const sorted = React.useMemo(() => {
    let arr = agents;

    if (statusFilter === "ONLINE")
      arr = arr.filter((a) => a.agentStatus?.status === "ONLINE");
    else if (statusFilter === "AWAY")
      arr = arr.filter((a) => a.agentStatus?.status === "AWAY");
    else if (statusFilter === "OFFLINE")
      arr = arr.filter((a) => !a.agentStatus || a.agentStatus.status === "OFFLINE");
    else if (statusFilter === "WA")
      arr = arr.filter((a) => a.agentStatus?.availableForVoiceCalls === true);

    const q = search.trim().toLowerCase();
    if (q)
      arr = arr.filter(
        (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
      );

    const result = [...arr];
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt-BR");
          break;
        case "email":
          cmp = a.email.localeCompare(b.email, "pt-BR");
          break;
        case "status": {
          const sa = a.agentStatus?.status ?? "OFFLINE";
          const sb = b.agentStatus?.status ?? "OFFLINE";
          cmp = sa.localeCompare(sb);
          break;
        }
        case "schedule":
          cmp = (a.schedule?.startTime ?? "").localeCompare(b.schedule?.startTime ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [agents, statusFilter, search, sortBy, sortDir]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      {isError && (
        <p className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          Erro ao carregar agentes.
        </p>
      )}

      {/* KPI mini-dash */}
      <KpiStrip aria-label="Indicadores de agentes">
        <KpiCard
          label="Agentes"
          value={agents.length.toLocaleString("pt-BR")}
          icon={<IconUsers size={20} stroke={2.2} />}
          tone="brand"
          onClick={() => setStatusFilter("")}
        />
        {STATUS_SEGMENTS.map((seg) => {
          const count =
            seg.id === "ONLINE"  ? kpiCounts.online  :
            seg.id === "AWAY"    ? kpiCounts.away    :
            seg.id === "OFFLINE" ? kpiCounts.offline :
                                   kpiCounts.wa;
          return (
            <KpiCard
              key={seg.id}
              label={seg.label}
              value={count.toLocaleString("pt-BR")}
              icon={seg.icon}
              tone={seg.tone}
              active={statusFilter === seg.id}
              onClick={() =>
                setStatusFilter((prev) => (prev === seg.id ? "" : seg.id))
              }
            />
          );
        })}
      </KpiStrip>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[64px] animate-pulse rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]"
            />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-16">
          <IconClock size={40} className="text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">Nenhum agente encontrado.</p>
        </div>
      ) : (
        <MobileTableScroll minWidth={720}>
          {/* Column header */}
          <div
            className={listTableHeadRowClass("gap-3 border border-transparent px-4")}
            style={{ gridTemplateColumns: LIST_GRID }}
          >
            <SortableHeader label="Nome"       sort={dirFor("name")}     onSort={() => toggleSort("name")}     />
            <SortableHeader label="E-mail"     sort={dirFor("email")}    onSort={() => toggleSort("email")}    />
            <SortableHeader label="Status"     sort={dirFor("status")}   onSort={() => toggleSort("status")}   />
            <SortableHeader label="Expediente" sort={dirFor("schedule")} onSort={() => toggleSort("schedule")} />
            <ListColumnLabel>Dias</ListColumnLabel>
            <ListColumnLabel align="right">Ações</ListColumnLabel>
          </div>

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-12">
              <p className="font-body text-[13px] text-[var(--text-muted)]">
                Nenhum agente encontrado{search ? ` para "${search}"` : ""}.
              </p>
            </div>
          ) : (
            sorted.map((agent) => {
              const status: AgentOnlineStatus = agent.agentStatus?.status ?? "OFFLINE";
              const voiceOn = agent.agentStatus?.availableForVoiceCalls ?? false;
              const sched = agent.schedule;

              return (
                <div
                  key={agent.id}
                  style={{ gridTemplateColumns: LIST_GRID }}
                  className="group grid items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3 shadow-[var(--glass-shadow-sm)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-[var(--input-border-focus)] hover:shadow-[var(--glass-shadow)]"
                >
                  {/* Nome + avatar */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar
                      size={32}
                      name={agent.name}
                      imageUrl={agent.avatarUrl}
                      status={
                        status === "ONLINE"
                          ? "online"
                          : status === "AWAY"
                            ? "away"
                            : "offline"
                      }
                    />
                    <div className="min-w-0 leading-tight">
                      <p className="max-w-full truncate font-display text-[14px] font-bold text-[var(--text-primary)]">
                        {agent.name}
                      </p>
                      <p className="truncate font-body text-[12px] text-[var(--text-muted)]">
                        {agent.role}
                      </p>
                    </div>
                  </div>

                  {/* E-mail */}
                  <span className="truncate font-body text-[13px] text-[var(--text-secondary)]">
                    {agent.email}
                  </span>

                  {/* Status pill (click-to-cycle) + WA voice pill stacked */}
                  <div className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      onClick={() => cycleStatus(agent)}
                      disabled={statusMutation.isPending}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px] font-bold transition-opacity hover:opacity-80",
                        STATUS_COLORS[status],
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
                      {STATUS_LABELS[status]}
                    </button>
                    <TooltipGlass
                      label="Disponível para receber ligações WhatsApp (requer Online + horário)"
                      side="top"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          voiceMutation.mutate({
                            userId: agent.id,
                            availableForVoiceCalls: !voiceOn,
                          })
                        }
                        disabled={voiceMutation.isPending}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-display text-[10px] font-bold transition-opacity hover:opacity-80",
                          voiceOn
                            ? "bg-[var(--color-success-bg)] text-[color-mix(in_srgb,var(--color-success)_78%,black)]"
                            : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]",
                        )}
                        aria-label="Disponível para receber ligações WhatsApp"
                      >
                        <IconPhone size={10} />
                        WA {voiceOn ? "ativo" : "inativo"}
                      </button>
                    </TooltipGlass>
                  </div>

                  {/* Expediente */}
                  <div className="flex min-w-0 items-center gap-1.5 font-body text-[12px] text-[var(--text-secondary)]">
                    <IconClock size={13} className="shrink-0 text-[var(--text-muted)]" />
                    {sched ? (
                      <span className="truncate tabular-nums">
                        {sched.startTime} – {sched.endTime}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </div>

                  {/* Dias (weekday count badge) */}
                  <div>
                    {sched && sched.weekdays.length > 0 ? (
                      <span className="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--glass-bg-strong)] px-2 py-0.5 font-display text-[12px] font-semibold text-[var(--text-secondary)]">
                        {sched.weekdays.length}d
                      </span>
                    ) : (
                      <span className="font-body text-[12px] text-[var(--text-muted)]">—</span>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center justify-end">
                    <TooltipGlass label="Editar horário" side="left">
                      <button
                        type="button"
                        onClick={() => openEdit(agent)}
                        aria-label={`Editar horário de ${agent.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                      >
                        <IconPencil size={15} />
                      </button>
                    </TooltipGlass>
                  </div>
                </div>
              );
            })
          )}
        </MobileTableScroll>
      )}

      {/* Edit schedule dialog — padrão das modais de filtros (kanban/inbox) */}
      <ScheduleDialogShell
        open={!!editAgent}
        onOpenChange={(o) => { if (!o) setEditAgent(null); }}
        title={`Expediente de ${editAgent?.name ?? ""}`}
        description="Defina o expediente, almoço e dias de trabalho."
        submitLabel="Salvar"
        submitPending={scheduleMutation.isPending}
        error={
          scheduleMutation.isError ? (
            <p className="px-5 pb-2 text-sm text-destructive">
              {scheduleMutation.error instanceof Error
                ? scheduleMutation.error.message
                : "Erro ao salvar."}
            </p>
          ) : undefined
        }
        onSubmit={() => {
          if (editAgent) scheduleMutation.mutate({ userId: editAgent.id, schedule: editSchedule });
        }}
      >
        <ScheduleFields schedule={editSchedule} onChange={setEditSchedule} />
      </ScheduleDialogShell>

      {/* Novo expediente (template aplicável a vários usuários) */}
      <ScheduleDialogShell
        open={newExpedienteOpen}
        onOpenChange={onNewExpedienteOpenChange}
        title="Novo expediente"
        description="Defina um expediente e aplique-o aos usuários selecionados."
        submitLabel="Aplicar expediente"
        submitPending={applyTemplate.isPending}
        submitDisabled={templateUsers.size === 0}
        onSubmit={() => {
          const ids = [...templateUsers];
          if (ids.length === 0) return;
          applyTemplate.mutate({ userIds: ids, schedule: templateSchedule });
        }}
      >
        <ScheduleFields schedule={templateSchedule} onChange={setTemplateSchedule} />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Aplicar a</Label>
            <button
              type="button"
              onClick={() =>
                setTemplateUsers((prev) =>
                  prev.size === agents.length ? new Set() : new Set(agents.map((a) => a.id)),
                )
              }
              className="font-display text-[11px] font-semibold text-[var(--brand-primary)] hover:underline"
            >
              {templateUsers.size === agents.length ? "Limpar" : "Selecionar todos"}
            </button>
          </div>
          <div className="max-h-[220px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-1.5">
            {agents.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors hover:bg-[var(--glass-bg-strong)]"
              >
                <CheckboxGlass
                  checked={templateUsers.has(a.id)}
                  onChange={() => toggleTemplateUser(a.id)}
                  aria-label={`Selecionar ${a.name}`}
                />
                <UserAvatar size={32} name={a.name} imageUrl={a.avatarUrl} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                    {a.name}
                  </span>
                  <span className="block truncate font-body text-[11px] text-[var(--text-muted)]">
                    {a.email}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="font-body text-[11px] text-[var(--text-muted)]">
            {templateUsers.size} usuário(s) selecionado(s).
          </p>
        </div>
      </ScheduleDialogShell>
    </div>
  );
}

// ─── Página standalone (rota /settings/schedules) ─────────────────────────────

export default function SchedulesPage() {
  const slots = useSettingsHeaderSlots();
  const [search, setSearch] = React.useState("");
  const [newOpen, setNewOpen] = React.useState(false);

  const searchNode = React.useMemo(
    () => (
      <SettingsListFilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar agente…"
        ariaLabel="Buscar agente por nome ou e-mail"
        onClearAll={() => setSearch("")}
      />
    ),
    [search],
  );

  const actionsNode = React.useMemo(
    () => (
      <PageActionsMenu
        aria-label="Ações de expediente"
        items={[
          {
            icon: <IconPlus size={16} />,
            label: "Novo expediente",
            onClick: () => setNewOpen(true),
            primary: true,
          },
        ]}
      />
    ),
    [],
  );

  React.useEffect(() => {
    if (!slots) return;
    slots.setCenter(searchNode);
    slots.setActions(actionsNode);
    return () => {
      slots.setCenter(null);
      slots.setActions(null);
    };
  }, [slots, searchNode, actionsNode]);

  return (
    <ExpedienteTab
      search={search}
      newExpedienteOpen={newOpen}
      onNewExpedienteOpenChange={setNewOpen}
    />
  );
}
