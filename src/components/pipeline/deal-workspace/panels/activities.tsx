"use client";

import * as React from "react";
import {
  IconCalendar as Calendar,
  IconCircleCheck as CheckCircle2,
  IconCircle as Circle,
  IconMail as Mail,
  IconMessageCircle as MessageCircle,
  IconNotes,
  IconPlayerPlay,
  IconPhoneCall as PhoneCall,
  IconPlus as Plus,
  IconTrash as Trash2,
  IconUsers as Users,
  IconLoader2 as Loader2,
} from "@tabler/icons-react";
import type { Icon as LucideIcon } from "@tabler/icons-react";
import { toast } from "sonner";

import { ActivityComposer } from "@/components/crm/activities/activity-composer";
import { ActivityDetailDialog } from "@/components/crm/activities/activity-detail-dialog";
import { TooltipHost } from "@/components/ui/tooltip";
import { cn, formatDateTime } from "@/lib/utils";
import type { Activity } from "@/lib/activities-data";
import {
  useActivities,
  useCreateActivity,
  useDeleteActivity,
  useUpdateActivity,
} from "@/features/directory-v2/hooks";
import {
  activityKindToType,
  dtoToActivity,
  localDateTimeToIso,
} from "@/features/directory-v2/activity-adapter";
import type { ActivityListItemDto } from "@/features/directory-v2/api";

import { ACTIVITY_TYPES } from "../shared";

const TYPE_VISUAL: Record<
  string,
  { Icon: LucideIcon; bg: string; ring: string; fg: string }
> = {
  CALL: { Icon: PhoneCall, bg: "bg-[var(--color-cyan-soft)]", ring: "ring-[var(--color-cyan)]/70", fg: "text-[var(--color-cyan)]" },
  EMAIL: { Icon: Mail, bg: "bg-[var(--color-success-bg)]", ring: "ring-[var(--color-success)]/70", fg: "text-[var(--color-success-text)]" },
  MEETING: { Icon: Users, bg: "bg-[var(--color-lavender-soft)]", ring: "ring-[var(--color-lavender)]/70", fg: "text-[var(--color-lavender)]" },
  TASK: { Icon: CheckCircle2, bg: "bg-[var(--color-primary)]/8", ring: "ring-[var(--color-primary)]/70", fg: "text-[var(--color-primary)]" },
  NOTE: { Icon: MessageCircle, bg: "bg-[var(--color-bg-subtle)]", ring: "ring-[var(--color-border-soft)]", fg: "text-[var(--color-ink-soft)]" },
  WHATSAPP: { Icon: MessageCircle, bg: "bg-[var(--color-success-soft)]", ring: "ring-[var(--color-success)]/70", fg: "text-[var(--color-success-text)]" },
  OTHER: { Icon: Calendar, bg: "bg-[var(--color-warn-bg)]", ring: "ring-[var(--color-warn)]/70", fg: "text-[var(--color-warn)]" },
};

type ActivitiesPanelProps = {
  dealId: string;
  contactId?: string | null;
  contactName?: string | null;
  dealTitle?: string | null;
  onCreated?: () => void;
  /** @deprecated Ignorado — a lista vem de `useActivities({ dealId })`. */
  activities?: unknown;
};

export function ActivitiesPanel({
  dealId,
  contactId = null,
  contactName = null,
  dealTitle = null,
  onCreated,
}: ActivitiesPanelProps) {
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [detailActivity, setDetailActivity] = React.useState<Activity | null>(null);

  const activitiesQuery = useActivities({
    dealId,
    perPage: 100,
    enabled: Boolean(dealId),
  });
  const activities = activitiesQuery.data?.items ?? [];
  const isLoading = activitiesQuery.isLoading;

  const createMutation = useCreateActivity();
  const updateMutation = useUpdateActivity();
  const deleteMutation = useDeleteActivity();

  const handleCreate = (a: Activity) => {
    createMutation.mutate(
      {
        type: activityKindToType(a.kind),
        title: a.title,
        description: a.notes ?? null,
        scheduledAt: localDateTimeToIso(a.start),
        completed: false,
        contactId: a.contactId ?? contactId ?? null,
        dealId: a.dealId ?? dealId,
        userId: a.assigneeType === "department" ? null : a.assigneeUserId ?? undefined,
        departmentId: a.assigneeType === "department" ? a.departmentId ?? null : null,
      },
      {
        onSuccess: () => {
          toast.success("Tarefa criada");
          onCreated?.();
        },
        onError: (err) => toast.error(err.message || "Falha ao criar tarefa"),
      },
    );
  };

  const handleToggle = (dto: ActivityListItemDto) => {
    const next = !dto.completed;
    updateMutation.mutate({
      id: dto.id,
      payload: {
        completed: next,
        completedAt: next ? new Date().toISOString() : null,
      },
    });
  };

  const handleStart = (dto: ActivityListItemDto) => {
    updateMutation.mutate(
      { id: dto.id, payload: { inProgress: true } },
      {
        onSuccess: () => toast.success("Você está executando esta tarefa."),
        onError: (err) => {
          void activitiesQuery.refetch();
          toast.error(err.message || "Não foi possível executar a tarefa.");
        },
      },
    );
  };

  const handleComplete = (dto: ActivityListItemDto) => {
    updateMutation.mutate(
      {
        id: dto.id,
        payload: { completed: true, completedAt: new Date().toISOString() },
      },
      {
        onSuccess: () => toast.success("Tarefa concluída."),
        onError: (err) => toast.error(err.message || "Não foi possível concluir a tarefa."),
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => onCreated?.(),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-chat-bg)]">
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4 sm:p-6">
        <div
          className={cn(
            "mb-5 rounded-2xl border border-border bg-card/90 p-4 backdrop-blur-md",
            "shadow-[var(--shadow-sm)]",
          )}
        >
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border border-dashed border-border",
              "bg-[var(--color-bg-subtle)]/60 px-3.5 py-3 text-left text-[13px]",
              "tracking-tight text-[var(--text-muted)] transition-colors",
              "hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-bg-card)] hover:text-[var(--text-primary)]",
            )}
          >
            <Plus className="size-4 text-primary" strokeWidth={2.4} />
            <span className="font-semibold">Nova tarefa</span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-[var(--color-ink-muted)]" />
          </div>
        ) : activities.length === 0 ? (
          <p className="py-12 text-center text-[13px] tracking-tight text-[var(--color-ink-muted)]">
            Nenhuma tarefa registrada.
          </p>
        ) : (
          <ActivityTimeline
            activities={activities}
            onToggle={handleToggle}
            onStart={handleStart}
            onComplete={handleComplete}
            onDelete={handleDelete}
            onOpenDetails={(a) => setDetailActivity(dtoToActivity(a))}
            togglePending={updateMutation.isPending}
            deletePending={deleteMutation.isPending}
          />
        )}
      </div>

      <ActivityComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        defaultDate={new Date()}
        onCreate={handleCreate}
        presetContactId={contactId}
        presetContactName={contactName}
        presetDealId={dealId}
        presetDealTitle={dealTitle}
        availableDeals={
          dealId
            ? [{ id: dealId, title: dealTitle || "Negócio atual" }]
            : undefined
        }
        lockContact={Boolean(contactId)}
      />

      <ActivityDetailDialog
        open={Boolean(detailActivity)}
        onOpenChange={(next) => {
          if (!next) setDetailActivity(null);
        }}
        activityId={detailActivity?.id ?? null}
        activity={detailActivity}
      />
    </div>
  );
}

function ActivityTimeline({
  activities,
  onToggle,
  onStart,
  onComplete,
  onDelete,
  onOpenDetails,
  togglePending,
  deletePending,
}: {
  activities: ActivityListItemDto[];
  onToggle: (a: ActivityListItemDto) => void;
  onStart: (a: ActivityListItemDto) => void;
  onComplete: (a: ActivityListItemDto) => void;
  onDelete: (id: string) => void;
  onOpenDetails: (a: ActivityListItemDto) => void;
  togglePending: boolean;
  deletePending: boolean;
}) {
  return (
    <div className="relative pl-12">
      <svg
        className="pointer-events-none absolute left-[18px] top-3 h-[calc(100%-1.5rem)] w-3"
        preserveAspectRatio="none"
        viewBox="0 0 12 100"
        aria-hidden
      >
        <path
          d="M6 0 C 0 25, 12 50, 6 75 S 0 100, 6 100"
          fill="none"
          stroke="rgb(226 232 240)"
          strokeWidth="1.5"
          strokeDasharray="2 4"
          strokeLinecap="round"
        />
      </svg>

      <ul className="relative space-y-3">
        {activities.map((a) => {
          const visual = TYPE_VISUAL[a.type] ?? TYPE_VISUAL.OTHER;
          const Icon = visual.Icon;
          const assigneeLabel =
            a.department?.name ?? a.user?.name ?? "Sem responsável";
          return (
            <li key={a.id} className="group relative">
              <button
                type="button"
                onClick={() => onToggle(a)}
                disabled={togglePending}
                aria-label={a.completed ? "Marcar como pendente" : "Concluir"}
                className={cn(
                  "absolute -left-12 top-2 inline-flex size-9 items-center justify-center rounded-full",
                  visual.bg,
                  "ring-1",
                  visual.ring,
                  visual.fg,
                  "transition-transform active:scale-95",
                  a.completed && "opacity-60 grayscale",
                )}
              >
                {a.completed ? (
                  <CheckCircle2 className="size-4" strokeWidth={2.4} />
                ) : (
                  <Icon className="size-4" strokeWidth={2.2} />
                )}
              </button>

              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenDetails(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenDetails(a);
                  }
                }}
                className={cn(
                  "cursor-pointer rounded-2xl border border-border bg-card p-3.5",
                  "shadow-[var(--shadow-sm)] lumen-transition hover:shadow-[var(--shadow-md)]",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-1.5 py-0.5",
                          "text-[10px] font-semibold uppercase tracking-widest",
                          visual.bg,
                          visual.fg,
                        )}
                      >
                        {ACTIVITY_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                      </span>
                      {a.completed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-success-text)]">
                          <CheckCircle2 className="size-3" /> Concluida
                        </span>
                      ) : a.startedBy ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-primary)]">
                          <IconPlayerPlay className="size-3 fill-current" />
                          {a.startedBy.name} executando
                        </span>
                      ) : (
                        <Circle className="size-3 text-[var(--text-faint)]" />
                      )}
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-[14px] font-bold tracking-tight text-[var(--text-primary)]",
                        a.completed && "line-through decoration-[var(--color-border-strong)]",
                      )}
                    >
                      {a.title}
                    </p>
                    {a.description ? (
                      <p className="mt-0.5 line-clamp-2 text-[12px] tracking-tight text-[var(--text-muted)]">
                        {a.description}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-[11px] tracking-tight text-[var(--color-ink-muted)]">
                      {assigneeLabel} · {formatDateTime(a.scheduledAt ?? a.createdAt)}
                    </p>
                    {!a.completed ? (
                      <div
                        className="mt-2 flex flex-wrap gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {!a.startedBy ? (
                          <button
                            type="button"
                            disabled={togglePending}
                            onClick={() => onStart(a)}
                            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
                          >
                            <IconPlayerPlay className="size-3" />
                            Executar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={togglePending}
                          onClick={() => onComplete(a)}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          <CheckCircle2 className="size-3" />
                          Concluir
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div
                    className="flex shrink-0 flex-col gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <TooltipHost label="Detalhes e notas" side="left">
                      <button
                        type="button"
                        onClick={() => onOpenDetails(a)}
                        aria-label="Detalhes e notas"
                        className={cn(
                          "rounded-full p-1 text-[var(--color-ink-muted)]",
                          "transition-all hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]",
                          "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <IconNotes className="size-3.5" strokeWidth={2} />
                      </button>
                    </TooltipHost>
                    <TooltipHost label="Excluir" side="left">
                      <button
                        type="button"
                        onClick={() => onDelete(a.id)}
                        disabled={deletePending}
                        aria-label="Excluir"
                        className={cn(
                          "rounded-full p-1 text-[var(--color-ink-muted)] opacity-0",
                          "transition-all hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]",
                          "group-hover:opacity-100",
                        )}
                      >
                        <Trash2 className="size-3.5" strokeWidth={2} />
                      </button>
                    </TooltipHost>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
