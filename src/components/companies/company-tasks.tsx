"use client";

/**
 * Tarefas vinculadas a uma empresa (página /companies/[id]): lista, criar
 * com a empresa já preenchida, abrir detalhe e marcar como concluída.
 */
import { useState } from "react";
import {
  IconCircle,
  IconCircleCheck,
  IconListCheck,
  IconLoader2,
  IconPlus,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ActivityComposer } from "@/components/crm/activities/activity-composer";
import { ActivityDetailDialog } from "@/components/crm/activities/activity-detail-dialog";
import { ButtonGlass } from "@/components/crm/button-glass";
import {
  activityKindToType,
  dtoToActivity,
  localDateTimeToIso,
} from "@/features/directory-v2/activity-adapter";
import type { ActivityListItemDto } from "@/features/directory-v2/api";
import {
  useActivities,
  useCreateActivity,
  useUpdateActivity,
} from "@/features/directory-v2/hooks";
import type { Activity } from "@/lib/activities-data";
import { cn, formatDateTime } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  TASK: "Tarefa",
  MEETING: "Reunião",
  CALL: "Ligação",
  OTHER: "Evento",
  EMAIL: "E-mail",
};

function isLate(a: ActivityListItemDto): boolean {
  if (a.completed || !a.scheduledAt) return false;
  const due = Date.parse(a.scheduledAt);
  return Number.isFinite(due) && due < Date.now();
}

export function CompanyTasks({
  companyId,
  companyName,
  title,
}: {
  companyId: string;
  companyName: string;
  /** Renderizado como cabeçalho da seção (recebe a contagem). */
  title: (count: number) => React.ReactNode;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [detail, setDetail] = useState<Activity | null>(null);

  const query = useActivities({ companyId, perPage: 100, enabled: Boolean(companyId) });
  const items = query.data?.items ?? [];
  const createMutation = useCreateActivity();
  const updateMutation = useUpdateActivity();

  const handleCreate = (a: Activity) => {
    createMutation.mutate(
      {
        type: activityKindToType(a.kind),
        title: a.title,
        description: a.notes ?? null,
        scheduledAt: localDateTimeToIso(a.start),
        completed: false,
        contactId: a.contactId ?? null,
        dealId: a.dealId ?? null,
        userId: a.assigneeType === "department" ? null : a.assigneeUserId ?? undefined,
        departmentId: a.assigneeType === "department" ? a.departmentId ?? null : null,
        visibleToAll: a.assigneeType === "all",
        companyId: a.companyId ?? companyId,
      },
      {
        onSuccess: () => toast.success("Tarefa criada"),
        onError: (err) => toast.error(err.message || "Falha ao criar tarefa"),
      },
    );
  };

  const toggle = (a: ActivityListItemDto) => {
    const next = !a.completed;
    updateMutation.mutate(
      {
        id: a.id,
        payload: { completed: next, completedAt: next ? new Date().toISOString() : null },
      },
      { onError: (err) => toast.error(err.message || "Não foi possível atualizar a tarefa.") },
    );
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        {title(query.data?.total ?? items.length)}
        <ButtonGlass variant="glass" onClick={() => setComposerOpen(true)}>
          <IconPlus size={14} /> Nova tarefa
        </ButtonGlass>
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-6">
          <IconLoader2 size={20} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <IconListCheck size={14} /> Nenhuma tarefa vinculada a esta empresa.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => {
            const late = isLate(a);
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => toggle(a)}
                  disabled={updateMutation.isPending}
                  aria-label={a.completed ? "Reabrir tarefa" : "Concluir tarefa"}
                  className="shrink-0 text-[var(--text-muted)] hover:text-[var(--color-primary)] disabled:opacity-50"
                >
                  {a.completed ? (
                    <IconCircleCheck size={18} className="text-[var(--color-success)]" />
                  ) : (
                    <IconCircle size={18} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDetail(dtoToActivity(a))}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={cn(
                      "block truncate font-body text-[13px] font-semibold text-[var(--text-primary)] hover:underline",
                      a.completed && "text-[var(--text-muted)] line-through",
                    )}
                  >
                    {a.title}
                  </span>
                  <span className="block truncate font-body text-[11px] text-[var(--text-muted)]">
                    {[
                      TYPE_LABEL[a.type] ?? a.type,
                      a.contact?.name,
                      a.department?.name ?? a.user?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <span
                  className={cn(
                    "shrink-0 font-body text-[12px]",
                    late ? "font-semibold text-[var(--color-danger,#dc2626)]" : "text-[var(--text-muted)]",
                  )}
                >
                  {a.scheduledAt ? formatDateTime(a.scheduledAt) : "Sem data"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <ActivityComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        defaultDate={new Date()}
        onCreate={handleCreate}
        presetCompanyId={companyId}
        presetCompanyName={companyName}
        lockCompany
      />

      <ActivityDetailDialog
        open={Boolean(detail)}
        onOpenChange={(next) => {
          if (!next) setDetail(null);
        }}
        activityId={detail?.id ?? null}
        activity={detail}
      />
    </>
  );
}
