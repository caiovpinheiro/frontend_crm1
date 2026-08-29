"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Calendar } from "lucide-react"

import { NavRailSpacer } from "@/components/crm/nav-rail-spacer"
import { ActivityComposer } from "@/components/crm/activities/activity-composer"
import { ActivityDetailDialog } from "@/components/crm/activities/activity-detail-dialog"
import { TasksView } from "@/components/crm/tasks-view"
import { ButtonGlass } from "@/components/crm/button-glass"
import { InputGlass } from "@/components/crm/input-glass"
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"
import { dateKey, type Activity } from "@/lib/activities-data"
import { toLocalISO, type Task } from "@/lib/tasks-data"
import {
  useAllActivities,
  useCreateActivity,
  useDeleteActivity,
  useUpdateActivity,
} from "@/features/directory-v2/hooks"
import {
  activityKindToType,
  activityToTask,
  dtoToActivity,
  localDateTimeToIso,
} from "@/features/directory-v2/activity-adapter"

type ScopeFilter = "all" | "mine" | "department"

export default function V2ActivitiesClientPage() {
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all")
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerDate, setComposerDate] = useState(() => new Date())
  const [detailActivity, setDetailActivity] = useState<Activity | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<Activity | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState("")
  const [rescheduleTime, setRescheduleTime] = useState("09:00")
  const { confirm, dialog: confirmDialog } = useConfirm()

  const activitiesQuery = useAllActivities({ scope: scopeFilter })
  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity()
  const deleteMutation = useDeleteActivity()

  const realDtos = activitiesQuery.data?.items ?? []

  const items: Activity[] = useMemo(
    () => realDtos.map(dtoToActivity),
    [realDtos],
  )

  const byId = useMemo(() => {
    const map = new Map<string, Activity>()
    for (const a of items) map.set(a.id, a)
    return map
  }, [items])

  const calendarTasks: Task[] = useMemo(
    () => items.filter((a) => Boolean(a.start)).map(activityToTask),
    [items],
  )

  const openReschedule = (a: Activity) => {
    const start = a.start || `${dateKey(new Date())}T09:00`
    setRescheduleDate(start.slice(0, 10))
    setRescheduleTime(start.slice(11, 16) || "09:00")
    setDetailActivity(null)
    setRescheduleTarget(a)
  }

  const saveReschedule = (activity: Activity, nextStart: Date) => {
    const local = toLocalISO(nextStart)
    updateMutation.mutate(
      { id: activity.id, payload: { scheduledAt: localDateTimeToIso(local) } },
      {
        onSuccess: () => {
          setRescheduleTarget(null)
          setDetailActivity(null)
          toast.success("Compromisso remarcado.")
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remarcar."),
      },
    )
  }

  const saveRescheduleForm = () => {
    if (!rescheduleTarget || !rescheduleDate) return
    saveReschedule(
      rescheduleTarget,
      new Date(`${rescheduleDate}T${rescheduleTime || "09:00"}`),
    )
  }

  const cancelAppointment = async (a: Activity) => {
    const ok = await confirm({
      title: "Cancelar compromisso?",
      description: "O compromisso fica concluído como cancelado e sai da agenda pendente.",
      confirmLabel: "Cancelar compromisso",
      destructive: true,
    })
    if (!ok) return
    const stamp = new Date().toLocaleString("pt-BR")
    const note = [a.notes, `Cancelado em ${stamp}`].filter(Boolean).join("\n")
    updateMutation.mutate(
      {
        id: a.id,
        payload: {
          completed: true,
          completedAt: new Date().toISOString(),
          description: note,
        },
      },
      {
        onSuccess: () => {
          setDetailActivity(null)
          toast.success("Compromisso cancelado.")
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao cancelar."),
      },
    )
  }

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Excluir tarefa?",
      description: "A tarefa some da agenda. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    })
    if (!ok) return
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setDetailActivity((cur) => (cur?.id === id ? null : cur))
        toast.success("Tarefa excluída.")
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir."),
    })
  }

  const create = (a: Activity) => {
    createMutation.mutate(
      {
        type: activityKindToType(a.kind),
        title: a.title,
        description: a.notes ?? null,
        scheduledAt: localDateTimeToIso(a.start),
        completed: a.status === "concluida",
        contactId: a.contactId ?? null,
        dealId: a.dealId ?? null,
        userId: a.assigneeType === "department" ? null : a.assigneeUserId ?? undefined,
        departmentId: a.assigneeType === "department" ? a.departmentId ?? null : null,
      },
      {
        onSuccess: () => toast.success("Tarefa criada."),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar."),
      },
    )
  }

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 overflow-hidden p-4">
      <NavRailSpacer />

      <main className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-0">
        <TasksView
          tasks={calendarTasks}
          loading={activitiesQuery.isLoading && items.length === 0}
          error={
            activitiesQuery.isError
              ? activitiesQuery.error instanceof Error
                ? activitiesQuery.error.message
                : "Erro ao carregar."
              : null
          }
          scope={scopeFilter}
          onScopeChange={setScopeFilter}
          onOpenTask={(task) => {
            const activity = byId.get(task.id)
            if (activity) setDetailActivity(activity)
          }}
          onCreateAt={(date) => {
            setComposerDate(date)
            setComposerOpen(true)
          }}
          onReschedule={(task, nextStart) => {
            const activity = byId.get(task.id)
            if (activity) saveReschedule(activity, nextStart)
          }}
        />
      </main>

      <ActivityComposer
        open={composerOpen}
        defaultDate={composerDate}
        onOpenChange={setComposerOpen}
        onCreate={create}
      />

      <ActivityDetailDialog
        open={Boolean(detailActivity)}
        onOpenChange={(open) => {
          if (!open) setDetailActivity(null)
        }}
        activityId={detailActivity?.id ?? null}
        activity={detailActivity}
        onReschedule={openReschedule}
        onCancel={cancelAppointment}
        onDelete={(a) => void remove(a.id)}
      />

      <FormDialog
        open={Boolean(rescheduleTarget)}
        onOpenChange={(open) => {
          if (!open) setRescheduleTarget(null)
        }}
        title="Remarcar"
        description="Escolha a nova data e horário do compromisso."
        icon={
          <FormDialogIcon>
            <Calendar className="size-4" />
          </FormDialogIcon>
        }
        size="sm"
        busy={updateMutation.isPending}
        footer={
          <>
            <ButtonGlass
              type="button"
              variant="glass"
              className={formDialogCancelClass}
              disabled={updateMutation.isPending}
              onClick={() => setRescheduleTarget(null)}
            >
              Cancelar
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              className={formDialogPrimaryClass}
              disabled={!rescheduleDate || updateMutation.isPending}
              onClick={saveRescheduleForm}
            >
              {updateMutation.isPending ? "Salvando…" : "Salvar"}
            </ButtonGlass>
          </>
        }
      >
        <span className={formLabelClass}>Data *</span>
        <InputGlass
          type="date"
          className={formControlClass}
          value={rescheduleDate}
          onChange={(e) => setRescheduleDate(e.target.value)}
        />
        <span className={cn(formLabelClass, "mt-3")}>Horário</span>
        <InputGlass
          type="time"
          className={formControlClass}
          value={rescheduleTime}
          onChange={(e) => setRescheduleTime(e.target.value)}
        />
      </FormDialog>

      {confirmDialog}
    </div>
  )
}
